import chalk from 'chalk';
import ora from 'ora';
import { readFile, writeFile } from 'fs/promises';

import { run, runSafe } from '../utils/exec.js';
import { isRoot } from '../utils/system.js';

async function isPackageInstalled(pkg: string): Promise<boolean> {
  const result = await runSafe('dpkg', ['-s', pkg]);
  return result?.stdout?.includes('Status: install ok installed') ?? false;
}

async function aptInstall(...packages: string[]): Promise<void> {
  await run('apt-get', ['install', '-y', ...packages], {
    env: { DEBIAN_FRONTEND: 'noninteractive' },
  });
}

export async function addSecurity(): Promise<void> {
  console.log('\n' + chalk.bold.cyan('🔒 Security Hardening') + '\n');

  if (!isRoot()) {
    console.error(chalk.red('Must run as root'));
    process.exit(1);
  }

  // ── UFW Firewall ──────────────────────────────────────────
  console.log(chalk.bold('1. UFW Firewall'));

  const ufwSpinner = ora('Configuring UFW...').start();
  try {
    const ufwInstalled = await isPackageInstalled('ufw');
    if (!ufwInstalled) {
      ufwSpinner.text = 'Installing UFW...';
      await aptInstall('ufw');
    }

    const ufwStatus = await runSafe('ufw', ['status']);
    const isActive = ufwStatus?.stdout?.includes('Status: active');

    if (!isActive) {
      await run('ufw', ['default', 'deny', 'incoming']);
      await run('ufw', ['default', 'allow', 'outgoing']);
      await run('ufw', ['allow', 'ssh']);
      await run('ufw', ['allow', '80/tcp']);
      await run('ufw', ['allow', '443/tcp']);
      await run('ufw', ['--force', 'enable']);
      ufwSpinner.succeed('UFW enabled (SSH/80/443 allowed)');
    } else {
      await runSafe('ufw', ['allow', 'ssh']);
      ufwSpinner.succeed('UFW already active (verified SSH rule)');
    }
  } catch (err) {
    ufwSpinner.fail(chalk.red(`UFW setup failed: ${(err as Error).message}`));
  }

  // ── Fail2ban ──────────────────────────────────────────────
  console.log(chalk.bold('\n2. Fail2ban'));

  const f2bSpinner = ora('Configuring fail2ban...').start();
  try {
    const f2bInstalled = await isPackageInstalled('fail2ban');
    if (!f2bInstalled) {
      f2bSpinner.text = 'Installing fail2ban...';
      await aptInstall('fail2ban');
    }

    const jailLocal = `[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
port    = ssh
logpath = %(sshd_log)s
backend = %(sshd_backend)s
maxretry = 3
bantime  = 24h
`;
    await writeFile('/etc/fail2ban/jail.local', jailLocal, 'utf8');
    await run('systemctl', ['enable', 'fail2ban']);
    await run('systemctl', ['restart', 'fail2ban']);
    f2bSpinner.succeed('fail2ban configured (SSH protection, 3 retries → 24h ban)');
  } catch (err) {
    f2bSpinner.fail(chalk.red(`fail2ban setup failed: ${(err as Error).message}`));
  }

  // ── SSH Hardening ─────────────────────────────────────────
  console.log(chalk.bold('\n3. SSH Hardening'));

  const sshSpinner = ora('Hardening SSH config...').start();
  try {
    const sshdConfig = await readFile('/etc/ssh/sshd_config', 'utf8');

    const hardenings: [string, string][] = [
      ['PermitRootLogin', 'prohibit-password'],
      ['PasswordAuthentication', 'no'],
      ['PubkeyAuthentication', 'yes'],
      ['MaxAuthTries', '3'],
      ['X11Forwarding', 'no'],
      ['AllowAgentForwarding', 'no'],
      ['ClientAliveInterval', '300'],
      ['ClientAliveCountMax', '2'],
    ];

    let newConfig = sshdConfig;
    const applied: string[] = [];

    for (const [key, value] of hardenings) {
      const regex = new RegExp(`^#?\\s*${key}\\s+.*`, 'm');
      const replacement = `${key} ${value}`;

      if (regex.test(newConfig)) {
        const current = newConfig.match(regex)?.[0];
        if (current !== replacement) {
          newConfig = newConfig.replace(regex, replacement);
          applied.push(`${key}=${value}`);
        }
      } else {
        newConfig += `\n${replacement}`;
        applied.push(`${key}=${value}`);
      }
    }

    await writeFile('/etc/ssh/sshd_config', newConfig, 'utf8');

    const validate = await runSafe('sshd', ['-t']);
    if (validate === null) {
      await writeFile('/etc/ssh/sshd_config', sshdConfig, 'utf8');
      sshSpinner.fail(chalk.red('SSH config validation failed - restored original'));
    } else {
      await run('systemctl', ['reload', 'sshd']);
      sshSpinner.succeed(
        applied.length > 0
          ? `SSH hardened: ${applied.join(', ')}`
          : 'SSH already hardened'
      );
    }
  } catch (err) {
    sshSpinner.fail(chalk.red(`SSH hardening failed: ${(err as Error).message}`));
  }

  // ── Unattended Upgrades ───────────────────────────────────
  console.log(chalk.bold('\n4. Unattended Upgrades'));

  const upgradeSpinner = ora('Configuring unattended upgrades...').start();
  try {
    const uu = await isPackageInstalled('unattended-upgrades');
    if (!uu) {
      upgradeSpinner.text = 'Installing unattended-upgrades...';
      await aptInstall('unattended-upgrades', 'apt-listchanges');
    }

    const uu50Config = `APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
`;
    await writeFile('/etc/apt/apt.conf.d/20auto-upgrades', uu50Config, 'utf8');

    await run('systemctl', ['enable', 'unattended-upgrades']);
    await run('systemctl', ['start', 'unattended-upgrades']);
    upgradeSpinner.succeed('Unattended upgrades configured');
  } catch (err) {
    upgradeSpinner.fail(chalk.red(`Unattended upgrades failed: ${(err as Error).message}`));
  }

  // ── Summary ───────────────────────────────────────────────
  console.log('\n' + chalk.bold.green('✅ Security hardening complete!') + '\n');
  console.log(chalk.dim('Verify:'));
  console.log(chalk.dim('  ufw status'));
  console.log(chalk.dim('  fail2ban-client status sshd'));
  console.log(chalk.dim('  sshd -t  # Validate SSH config'));
  console.log('');
}
