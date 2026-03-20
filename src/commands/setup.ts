import chalk from 'chalk';
import ora from 'ora';
import { confirm, input } from '@inquirer/prompts';
import { readFile, writeFile, mkdir, appendFile, cp, readdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import { run, runSafe, commandExists, runInteractive } from '../utils/exec.js';
import {
  isRoot, isLinux, isDebianBased, getVersion, getServiceStatus,
  writeSystemdService, enableAndStartService, restartService,
} from '../utils/system.js';
import {
  readOpenClawConfig,
  getCliConfigValue,
  OPENCLAW_DIR, HOOKS_PROXY_PATH, generateToken,
  readProxyRoutes, writeProxyRoutes,
} from '../utils/config.js';
import {
  detectTunnelInfo, getCloudflareConfig, saveCloudflareConfig,
} from '../utils/cloudflare.js';
import type { SetupOptions } from '../types.js';

const HOOKS_PROXY_SERVICE = 'openclaw-hooks-proxy';
const GATEWAY_SERVICE = 'openclaw-gateway';
const HOOKS_PROXY_PORT = 18800;

// ─── Step helpers ─────────────────────────────────────────────

function stepHeader(num: number, title: string): void {
  console.log('\n' + chalk.bold.blue(`Step ${num}: ${title}`));
  console.log(chalk.dim('─'.repeat(50)));
}

function skip(reason: string): void {
  console.log(chalk.dim(`  ↷ Skipping: ${reason}`));
}

// ─── Installation helpers ─────────────────────────────────────

async function aptInstall(...packages: string[]): Promise<void> {
  await run('apt-get', ['install', '-y', ...packages], {
    env: { DEBIAN_FRONTEND: 'noninteractive' },
  });
}

async function aptUpdate(): Promise<void> {
  await run('apt-get', ['update', '-qq'], {
    env: { DEBIAN_FRONTEND: 'noninteractive' },
  });
}

// ─── Individual Installers ────────────────────────────────────

async function ensureBrewWrapper(): Promise<void> {
  const wrapperPath = '/usr/local/bin/brew';
  const wrapper = '#!/bin/bash\ncd /tmp\nexec sudo -u linuxbrew /home/linuxbrew/.linuxbrew/bin/brew "$@"';

  let needsWrite = true;
  try {
    const existing = await readFile(wrapperPath, 'utf8');
    if (existing.includes('sudo -u linuxbrew') && existing.includes('cd /tmp')) needsWrite = false;
  } catch {}

  if (needsWrite) {
    await writeFile(wrapperPath, wrapper, { mode: 0o755 });
    console.log(chalk.dim('  root-safe brew wrapper created at /usr/local/bin/brew'));
  }

  const brewBin = '/home/linuxbrew/.linuxbrew/bin';
  if (!process.env.PATH?.includes(brewBin)) {
    process.env.PATH = `/usr/local/bin:${brewBin}:${process.env.PATH}`;
  } else if (!process.env.PATH?.startsWith('/usr/local/bin')) {
    process.env.PATH = `/usr/local/bin:${process.env.PATH}`;
  }

  const bashrc = join(homedir(), '.bashrc');
  let bashrcContent = '';
  try { bashrcContent = await readFile(bashrc, 'utf8'); } catch {}

  if (!bashrcContent.includes('brew shellenv')) {
    const shellEnv = 'eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"\nexport PATH="/usr/local/bin:$PATH"\n';
    await appendFile(bashrc, shellEnv, 'utf8');
  } else if (!bashrcContent.includes('export PATH="/usr/local/bin:$PATH"')) {
    // Fix existing shellenv: add PATH override after it
    bashrcContent = bashrcContent.replace(
      /(eval "\$\(\/home\/linuxbrew\/\.linuxbrew\/bin\/brew shellenv\)")/,
      '$1\nexport PATH="/usr/local/bin:$PATH"'
    );
    await writeFile(bashrc, bashrcContent, 'utf8');
  }
}

async function symlinkBrewBinaries(): Promise<void> {
  const brewBin = '/home/linuxbrew/.linuxbrew/bin';
  try {
    const entries = await readdir(brewBin);
    for (const name of entries) {
      if (name === 'brew') continue;
      const target = join('/usr/local/bin', name);
      const source = join(brewBin, name);
      try {
        await runSafe('ln', ['-sf', source, target]);
      } catch {}
    }
  } catch {}
}

async function installHomebrew(): Promise<void> {
  const existing = await commandExists('brew');
  if (existing) {
    console.log(chalk.dim('  brew already installed'));
    await ensureBrewWrapper();
    await symlinkBrewBinaries();
    return;
  }

  const spinner = ora('Installing Homebrew...').start();
  try {
    await runSafe('bash', ['-c', 'id -u linuxbrew &>/dev/null || useradd -m -s /bin/bash linuxbrew']);
    await run('bash', ['-c',
      'sudo -u linuxbrew NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
    ]);
    spinner.succeed('Homebrew installed');
  } catch (err) {
    spinner.fail(chalk.red(`Homebrew install failed: ${(err as Error).message}`));
    return;
  }

  await ensureBrewWrapper();
  await symlinkBrewBinaries();
  console.log(chalk.dim('  root-safe brew wrapper configured'));
}

async function installNodejs(): Promise<void> {
  const existing = await getVersion('node');
  if (existing && parseInt(existing) >= 22) {
    console.log(chalk.dim(`  node ${existing} already installed`));
    return;
  }

  const spinner = ora('Installing Node.js 22...').start();
  try {
    await run('bash', ['-c',
      'curl -fsSL https://deb.nodesource.com/setup_22.x | bash -'
    ]);
    await aptInstall('nodejs');
    const v = await getVersion('node');
    spinner.succeed(`Node.js ${v} installed`);
  } catch (err) {
    spinner.fail(chalk.red(`Node.js install failed: ${(err as Error).message}`));
  }
}

async function installOpenclaw(): Promise<void> {
  const existing = await commandExists('openclaw');
  if (existing) {
    const v = await getVersion('openclaw');
    console.log(chalk.dim(`  openclaw ${v || ''} already installed`));
    return;
  }

  const spinner = ora('Installing OpenClaw...').start();
  try {
    await run('npm', ['install', '-g', 'openclaw']);
    spinner.succeed('OpenClaw installed');
  } catch (err) {
    spinner.fail(chalk.red(`OpenClaw install failed: ${(err as Error).message}`));
    spinner.info(chalk.yellow('Try manually: npm install -g openclaw'));
  }
}

async function installGhCli(): Promise<void> {
  const existing = await commandExists('gh');
  if (existing) {
    console.log(chalk.dim('  gh already installed'));
    return;
  }

  const spinner = ora('Installing GitHub CLI (gh)...').start();
  try {
    await run('bash', ['-c',
      '(type -p wget >/dev/null || (apt-get update && apt-get install wget -y)) && mkdir -p /etc/apt/keyrings && wget -qO- https://cli.github.com/packages/githubcli-archive-keyring.gpg | tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null && apt-get update && apt-get install gh -y'
    ]);
    spinner.succeed('GitHub CLI installed');
  } catch (err) {
    spinner.fail(chalk.red(`gh install failed: ${(err as Error).message}`));
  }
}

async function installClaudeCode(): Promise<void> {
  const existing = await commandExists('claude');
  if (existing) {
    console.log(chalk.dim('  claude already installed'));
    return;
  }

  const spinner = ora('Installing Claude Code...').start();
  try {
    await run('npm', ['install', '-g', '@anthropic-ai/claude-code']);
    spinner.succeed('Claude Code installed');
  } catch (err) {
    spinner.fail(chalk.red(`Claude Code install failed: ${(err as Error).message}`));
  }
}

async function installBun(): Promise<void> {
  const existing = await commandExists('bun');
  if (existing) {
    const v = await getVersion('bun');
    console.log(chalk.dim(`  bun ${v || ''} already installed`));
    return;
  }

  const spinner = ora('Installing Bun...').start();
  try {
    await run('bash', ['-c', 'curl -fsSL https://bun.sh/install | bash']);
    await runSafe('bash', ['-c', 'ln -sf ~/.bun/bin/bun /usr/local/bin/bun 2>/dev/null || true']);
    spinner.succeed('Bun installed');
  } catch (err) {
    spinner.fail(chalk.red(`Bun install failed: ${(err as Error).message}`));
  }
}

async function installCloudflared(): Promise<void> {
  const existing = await commandExists('cloudflared');
  if (existing) {
    console.log(chalk.dim('  cloudflared already installed'));
    return;
  }

  const spinner = ora('Installing cloudflared...').start();
  try {
    await mkdir('/etc/apt/keyrings', { recursive: true });
    await run('bash', ['-c',
      'curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | gpg --dearmor -o /etc/apt/keyrings/cloudflare-main.gpg'
    ]);
    await writeFile(
      '/etc/apt/sources.list.d/cloudflared.list',
      'deb [signed-by=/etc/apt/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared bookworm main\n',
      'utf8'
    );
    await aptUpdate();
    await aptInstall('cloudflared');
    spinner.succeed('cloudflared installed');
  } catch {
    spinner.text = 'Trying direct download...';
    try {
      await run('bash', ['-c',
        'curl -L -o /usr/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 && chmod +x /usr/bin/cloudflared'
      ]);
      spinner.succeed('cloudflared installed (direct download)');
    } catch (err2) {
      spinner.fail(chalk.red(`cloudflared install failed: ${(err2 as Error).message}`));
    }
  }
}

async function installGcloud(): Promise<void> {
  const existing = await commandExists('gcloud');
  if (existing) {
    console.log(chalk.dim('  gcloud already installed'));
    return;
  }

  const spinner = ora('Installing gcloud CLI...').start();
  try {
    await run('bash', ['-c',
      'curl https://sdk.cloud.google.com | bash -s -- --disable-prompts'
    ]);
    await runSafe('bash', ['-c', 'ln -sf ~/google-cloud-sdk/bin/gcloud /usr/local/bin/gcloud 2>/dev/null || true']);
    spinner.succeed('gcloud installed (may need shell restart)');
  } catch (err) {
    spinner.fail(chalk.red(`gcloud install failed: ${(err as Error).message}`));
    spinner.info(chalk.yellow('Install manually: https://cloud.google.com/sdk/docs/install'));
  }
}

// ─── Security Hardening ───────────────────────────────────────

async function runSecurityHardening(): Promise<void> {
  const { addSecurity } = await import('./add-security.js');
  await addSecurity();
}

// ─── Hooks Proxy Service ──────────────────────────────────────

async function setupHooksProxy(hookToken: string, _gatewayPort: number): Promise<void> {
  const routes = await readProxyRoutes();
  await writeProxyRoutes(routes);

  const nodePath = (await runSafe('which', ['node']))?.stdout?.trim() || '/usr/bin/node';

  const svcContent = `[Unit]
Description=OpenClaw Hooks Proxy (auth injection for external webhooks)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${nodePath} ${HOOKS_PROXY_PATH}
Environment=OPENCLAW_HOOK_TOKEN=${hookToken}
Environment=PORT=${HOOKS_PROXY_PORT}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
`;
  await writeSystemdService(`${HOOKS_PROXY_SERVICE}.service`, svcContent);
  await enableAndStartService(HOOKS_PROXY_SERVICE);
}

// ─── Gateway Service ──────────────────────────────────────────

async function setupGatewayService(): Promise<void> {
  const nodePath = (await runSafe('which', ['node']))?.stdout?.trim() || '/usr/bin/node';
  const openclawPath = (await runSafe('which', ['openclaw']))?.stdout?.trim() || '/usr/bin/openclaw';

  const svcContent = `[Unit]
Description=OpenClaw Gateway
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${nodePath} ${openclawPath} gateway
Environment=HOME=/root
Environment=NODE_ENV=production
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/root/.bun/bin
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
`;
  await writeSystemdService(`${GATEWAY_SERVICE}.service`, svcContent);
  await enableAndStartService(GATEWAY_SERVICE);
}

// ─── Aliases ──────────────────────────────────────────────────

async function setupAliases(): Promise<void> {
  const bashrc = join(homedir(), '.bashrc');
  const marker = '# openclaw-vps aliases';

  let existing = '';
  try {
    existing = await readFile(bashrc, 'utf8');
  } catch {}

  if (existing.includes(marker)) {
    console.log(chalk.dim('  Aliases already in .bashrc'));
    return;
  }

  const aliases = `
${marker}
alias oc='openclaw'
alias oc-status='openclaw-vps status'
alias oc-logs='journalctl -u openclaw-gateway -f'
alias oc-restart='systemctl restart openclaw-gateway'
alias hooks-logs='journalctl -u openclaw-hooks-proxy -f'
alias gmail-logs='journalctl -u gmail-watch-* -f'
alias claude='IS_SANDBOX=1 claude --dangerously-skip-permissions'
`;

  await appendFile(bashrc, aliases, 'utf8');
  console.log(chalk.dim('  Aliases added to ~/.bashrc'));
  console.log(chalk.dim('  Run: source ~/.bashrc'));
}

// ─── Skills Installation ──────────────────────────────────────

async function installSkills(): Promise<void> {
  const __filename = fileURLToPath(import.meta.url);
  const packageRoot = join(dirname(__filename), '..', '..');
  const skillsSrc = join(packageRoot, 'skills');
  const skillsDest = join(homedir(), '.claude', 'skills');

  let skillNames: string[];
  try {
    const entries = await readdir(skillsSrc, { withFileTypes: true });
    skillNames = entries.filter(e => e.isDirectory()).map(e => e.name);
  } catch {
    console.log(chalk.yellow('  No bundled skills found in package'));
    return;
  }

  if (skillNames.length === 0) return;

  await mkdir(skillsDest, { recursive: true });

  for (const name of skillNames) {
    const src = join(skillsSrc, name);
    const dest = join(skillsDest, name);
    await cp(src, dest, { recursive: true, force: true });
    console.log(chalk.dim(`  ✓ ${name}`));
  }
}

// ─── Main Setup Wizard ────────────────────────────────────────

export async function setup(options: SetupOptions): Promise<void> {
  console.log('\n' + chalk.bold.cyan('🦞 OpenClaw VPS Setup Wizard') + '\n');

  if (!isRoot()) {
    console.error(chalk.red('Must run as root (sudo -i or su -)'));
    process.exit(1);
  }

  if (!isLinux()) {
    console.error(chalk.red('Linux only'));
    process.exit(1);
  }

  const isDebian = await isDebianBased();
  if (!isDebian) {
    console.log(chalk.yellow('⚠  Non-Debian system detected. Some steps may fail.'));
  }

  // ── System check ────────────────────────────────────────────
  stepHeader(0, 'System Check');
  const checks: Record<string, boolean> = {
    'brew': await commandExists('brew'),
    'Node.js': await commandExists('node'),
    'openclaw': await commandExists('openclaw'),
    'gh': await commandExists('gh'),
    'claude': await commandExists('claude'),
    'bun': await commandExists('bun'),
    'cloudflared': await commandExists('cloudflared'),
    'gcloud': await commandExists('gcloud'),
  };

  for (const [name, installed] of Object.entries(checks)) {
    const icon = installed ? chalk.green('✓') : chalk.dim('✗');
    const v = installed ? await getVersion(name === 'openclaw' ? 'openclaw' : name) : null;
    console.log(`  ${icon} ${name}${v ? chalk.dim(` (${v})`) : ''}`);
  }

  const allInstalled = Object.values(checks).every(Boolean);
  if (allInstalled && !options.force) {
    console.log(chalk.green('\n✓ All tools already installed'));
    const cont = await confirm({ message: 'Continue setup anyway?', default: false });
    if (!cont) {
      console.log(chalk.dim('Run with --force to reinstall everything.'));
      return;
    }
  }

  // ── Step 1: Install packages ──────────────────────────────
  stepHeader(1, 'Install Tools');

  const skipInstall = options.skipInstall || (
    allInstalled && !(await confirm({ message: 'Reinstall tools?', default: false }))
  );

  if (!skipInstall) {
    await aptUpdate();
    await Promise.all([
      aptInstall('curl', 'wget', 'git', 'build-essential', 'unzip'),
    ]);
    await installHomebrew();
    await installNodejs();
    await installOpenclaw();
    await installGhCli();
    await installClaudeCode();
    await installBun();
    await installCloudflared();
    await installGcloud();
    console.log(chalk.green('\n✓ Tools installed'));
  } else {
    skip('all tools already installed');
  }

  // Always ensure the brew wrapper exists and PATH is correct,
  // even when tool installation was skipped
  if (await commandExists('brew')) {
    await ensureBrewWrapper();
  }

  // ── Step 2: Security Hardening ────────────────────────────
  stepHeader(2, 'Security Hardening');

  const doSecurity = options.security !== false && await confirm({
    message: 'Apply security hardening? (UFW, fail2ban, SSH hardening)',
    default: true,
  });

  if (doSecurity) {
    await runSecurityHardening();
  } else {
    skip('security hardening');
    console.log(chalk.dim('  Run later: openclaw-vps add security'));
  }

  // ── Step 3: OpenClaw Onboard ──────────────────────────────
  stepHeader(3, 'OpenClaw Onboard');

  const ocConfig = await readOpenClawConfig();
  if (ocConfig && !options.force) {
    console.log(chalk.dim(`  openclaw.json found (version ${ocConfig.meta?.lastTouchedVersion || '?'})`));
    const reOnboard = await confirm({ message: 'Run openclaw onboard again?', default: false });
    if (!reOnboard) {
      skip('already configured');
    } else {
      await runInteractive('openclaw', ['onboard']);
    }
  } else {
    console.log(chalk.dim('  Running openclaw onboard interactively...'));
    try {
      await runInteractive('openclaw', ['onboard']);
    } catch (err) {
      console.log(chalk.yellow(`  Warning: ${(err as Error).message}`));
      console.log(chalk.dim('  Continue with manual configuration if needed.'));
    }
  }

  // ── Step 4: Cloudflare Tunnel ─────────────────────────────
  stepHeader(4, 'Cloudflare Tunnel');

  const cfStatus = await getServiceStatus('cloudflared');
  if (cfStatus === 'active' && !options.force) {
    console.log(chalk.dim('  cloudflared already running'));
    const info = await detectTunnelInfo();
    if (info) {
      const cfg = await getCloudflareConfig();
      if (!cfg.accountId) {
        await saveCloudflareConfig({ accountId: info.accountId, tunnelId: info.tunnelId });
      }
    }
    skip('already running');
  } else {
    const setupCf = await confirm({
      message: 'Set up Cloudflare Tunnel?',
      default: true,
    });
    if (setupCf) {
      const { addCloudflare } = await import('./add-cloudflare.js');
      await addCloudflare(options as Record<string, unknown>);
    } else {
      skip('Cloudflare tunnel');
      console.log(chalk.dim('  Run later: openclaw-vps add cloudflare'));
    }
  }

  // ── Step 5: OpenClaw Gateway Service ─────────────────────
  stepHeader(5, 'OpenClaw Gateway Service');

  const gwStatus = await getServiceStatus(GATEWAY_SERVICE);
  if (gwStatus === 'active' && !options.force) {
    console.log(chalk.dim('  openclaw-gateway already running'));
    skip('already running');
  } else if (await commandExists('openclaw')) {
    const spinner = ora('Creating openclaw-gateway service...').start();
    try {
      await setupGatewayService();
      spinner.succeed('openclaw-gateway service created and started');
    } catch (err) {
      spinner.fail(chalk.red(`Gateway service failed: ${(err as Error).message}`));
    }
  } else {
    skip('openclaw not installed');
  }

  // ── Step 6: Hooks Proxy ───────────────────────────────────
  stepHeader(6, 'Hooks Proxy');

  const proxyStatus = await getServiceStatus(HOOKS_PROXY_SERVICE);
  if (proxyStatus === 'active' && !options.force) {
    console.log(chalk.dim('  hooks-proxy already running'));
    skip('already running');
  } else {
    const freshConfig = await readOpenClawConfig();
    const hookToken = freshConfig?.hooks?.token || generateToken(20);

    if (!freshConfig?.hooks?.token) {
      console.log(chalk.yellow('⚠  No hook token in openclaw.json - using generated token'));
      console.log(chalk.dim(`  Token: ${hookToken}`));
      console.log(chalk.dim('  Set hooks.token in openclaw.json to use a specific token'));
    }

    const gatewayPort = freshConfig?.gateway?.port || 18789;

    const spinner = ora('Setting up hooks proxy...').start();
    try {
      await mkdir(OPENCLAW_DIR, { recursive: true });
      await setupHooksProxy(hookToken, gatewayPort);
      spinner.succeed(`hooks-proxy running on port ${HOOKS_PROXY_PORT}`);
    } catch (err) {
      spinner.fail(chalk.red(`Hooks proxy failed: ${(err as Error).message}`));
    }
  }

  // ── Step 7: Aliases ───────────────────────────────────────
  stepHeader(7, 'Shell Aliases');

  const addAliases = await confirm({ message: 'Add shell aliases to ~/.bashrc?', default: true });
  if (addAliases) {
    await setupAliases();
    console.log(chalk.green('✓ Aliases added'));
  } else {
    skip('aliases');
  }

  // ── Step 8: Claude Code Skills ─────────────────────────
  stepHeader(8, 'Claude Code Skills');

  const skillsSpinner = ora('Installing bundled skills to ~/.claude/skills/...').start();
  try {
    await installSkills();
    skillsSpinner.succeed('Skills installed');
  } catch (err) {
    skillsSpinner.fail(chalk.red(`Skills install failed: ${(err as Error).message}`));
  }

  // ── Summary: verify & auto-fix ──────────────────────────
  console.log('\n' + chalk.bold.cyan('Verifying services...') + '\n');

  const servicesToCheck = [
    { name: 'openclaw-gateway', label: 'OpenClaw Gateway' },
    { name: 'openclaw-hooks-proxy', label: 'Hooks Proxy' },
    { name: 'cloudflared', label: 'Cloudflare Tunnel' },
  ];

  for (const svc of servicesToCheck) {
    let status = await getServiceStatus(svc.name);

    if (status !== 'active') {
      const retrySpinner = ora(`${svc.label} not running - restarting...`).start();
      try {
        await restartService(svc.name);
        await new Promise((r) => setTimeout(r, 2000));
        status = await getServiceStatus(svc.name);
        if (status === 'active') {
          retrySpinner.succeed(`${svc.label} restarted successfully`);
        } else {
          retrySpinner.fail(`${svc.label} failed to start (${status})`);
          const logs = await runSafe('journalctl', ['-u', svc.name, '-n', '5', '--no-pager']);
          if (logs?.stdout) {
            console.log(chalk.dim('  Last logs:'));
            for (const line of logs.stdout.split('\n').slice(0, 3)) {
              console.log(chalk.dim(`    ${line.trim()}`));
            }
          }
        }
      } catch {
        retrySpinner.fail(`${svc.label} could not be restarted`);
      }
    } else {
      console.log(`  ${chalk.green('●')} ${svc.label}`);
    }
  }

  console.log('');

  const hooksDomain = await getCliConfigValue('hooksDomain');
  if (hooksDomain) {
    console.log(chalk.bold('Hooks URL:   ') + chalk.cyan(`https://${hooksDomain}`));
  }

  // Final status
  const [gwFinal, proxyFinal, cfFinal] = await Promise.all([
    getServiceStatus('openclaw-gateway'),
    getServiceStatus('openclaw-hooks-proxy'),
    getServiceStatus('cloudflared'),
  ]);

  const allOk = gwFinal === 'active' && proxyFinal === 'active' && cfFinal === 'active';

  if (allOk) {
    console.log('\n' + chalk.bold.green('✅ Setup complete! All services running.') + '\n');
  } else {
    console.log('\n' + chalk.bold.yellow('⚠  Setup complete but some services need attention.') + '\n');
    if (gwFinal !== 'active') {
      console.log(chalk.yellow('  Gateway not running. Did you complete "openclaw onboard"?'));
      console.log(chalk.dim('  Fix: openclaw onboard && systemctl restart openclaw-gateway'));
    }
    if (proxyFinal !== 'active') {
      console.log(chalk.yellow('  Hooks proxy not running.'));
      console.log(chalk.dim('  Fix: systemctl restart openclaw-hooks-proxy'));
    }
    if (cfFinal !== 'active') {
      console.log(chalk.yellow('  Cloudflare tunnel not running.'));
      console.log(chalk.dim('  Fix: openclaw-vps add cloudflare'));
    }
    console.log('');
  }

  console.log(chalk.bold('Next steps:'));
  console.log(chalk.dim('  openclaw-vps add gmail     # Add Gmail account'));
  console.log(chalk.dim('  openclaw-vps add webhook   # Add custom webhook'));
  console.log(chalk.dim('  openclaw-vps status        # Check all services'));
  console.log(chalk.dim('  source ~/.bashrc          # Load aliases'));
  console.log('');
}
