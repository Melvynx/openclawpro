import chalk from 'chalk';
import ora from 'ora';
import { input, confirm, password } from '@inquirer/prompts';
import { writeFile } from 'fs/promises';

import { run, runSafe, commandExists, runInteractive } from '../utils/exec.js';
import {
  isRoot, getServiceStatus, writeSystemdService, enableAndStartService,
  detectCloudflaredToken, parseTunnelToken,
} from '../utils/system.js';
import {
  setCliConfigValue, getCliConfigValue, readCliConfig,
} from '../utils/config.js';
import {
  initCloudflareConfig, detectHooksDomain, saveCloudflareConfig,
} from '../utils/cloudflare.js';

export async function addCloudflare(_options: Record<string, unknown> = {}): Promise<void> {
  console.log('\n' + chalk.bold.cyan('☁️  Cloudflare Tunnel Setup') + '\n');

  if (!isRoot()) {
    console.error(chalk.red('Must run as root'));
    process.exit(1);
  }

  // ── Check if already installed ────────────────────────────
  const cfExists = await commandExists('cloudflared');
  if (!cfExists) {
    console.log(chalk.yellow('cloudflared not installed. Installing...'));
    await installCloudflared();
  } else {
    console.log(chalk.green('✓ cloudflared installed'));
  }

  // ── Check if service already running ──────────────────────
  const cfStatus = await getServiceStatus('cloudflared');
  if (cfStatus === 'active') {
    console.log(chalk.green('✓ Cloudflare tunnel already running'));

    const token = await detectCloudflaredToken();
    if (token) {
      const info = parseTunnelToken(token);
      if (info) {
        console.log(chalk.dim(`  Account ID: ${info.accountId}`));
        console.log(chalk.dim(`  Tunnel ID:  ${info.tunnelId}`));
      }
    }

    const reconfigure = await confirm({
      message: 'Reconfigure Cloudflare tunnel?',
      default: false,
    });
    if (!reconfigure) {
      await setupCliConfig();
      return;
    }
  }

  // ── Get tunnel token ──────────────────────────────────────
  console.log(chalk.bold('\nTunnel Configuration'));
  console.log(chalk.dim('You need a Cloudflare Tunnel token. Create one at:'));
  console.log(chalk.cyan('  https://dash.cloudflare.com/ → Zero Trust → Networks → Tunnels'));
  console.log(chalk.dim('Click "Create a tunnel" → Cloudflared → select Debian 64-bit → copy the token from the run command.\n'));

  let tunnelToken = await input({
    message: 'Cloudflare Tunnel token:',
  });
  tunnelToken = tunnelToken.trim();

  // ── Hooks domain ──────────────────────────────────────────
  console.log(chalk.bold('\nPublic Hostname'));
  console.log(chalk.dim('This domain will route external traffic to your hooks proxy.'));
  console.log(chalk.dim('Example: hooks.yourdomain.com\n'));

  const existingDomain = await getCliConfigValue('hooksDomain');
  let hooksDomain = await input({
    message: 'Hooks domain (e.g. hooks.example.com):',
    default: typeof existingDomain === 'string' ? existingDomain : '',
  });
  hooksDomain = hooksDomain.trim().replace(/^https?:\/\//, '');

  // ── Install as system service (official Cloudflare method) ─
  const svcSpinner = ora('Installing cloudflared as system service...').start();
  try {
    await run('cloudflared', ['service', 'install', tunnelToken]);
    svcSpinner.succeed('cloudflared service installed and running');
  } catch (err) {
    // Fallback: already installed or needs manual restart
    const errMsg = (err as Error).message;
    if (errMsg.includes('already exists') || errMsg.includes('already installed')) {
      svcSpinner.text = 'Updating cloudflared service...';
      try {
        await runSafe('cloudflared', ['service', 'uninstall']);
        await run('cloudflared', ['service', 'install', tunnelToken]);
        svcSpinner.succeed('cloudflared service updated and running');
      } catch (err2) {
        svcSpinner.fail(chalk.red(`Service update failed: ${(err2 as Error).message}`));
        process.exit(1);
      }
    } else {
      svcSpinner.fail(chalk.red(`Service install failed: ${errMsg}`));
      process.exit(1);
    }
  }

  // ── Store CLI config ──────────────────────────────────────
  await setCliConfigValue('hooksDomain', hooksDomain);

  const tunnelInfo = parseTunnelToken(tunnelToken);
  if (tunnelInfo) {
    await saveCloudflareConfig({
      accountId: tunnelInfo.accountId,
      tunnelId: tunnelInfo.tunnelId,
    });
    console.log(chalk.dim(`Tunnel info stored: account=${tunnelInfo.accountId} tunnel=${tunnelInfo.tunnelId}`));
  }

  // ── API Token (optional) ──────────────────────────────────
  console.log(chalk.bold('\nCloudflare API Token (optional)'));
  console.log(chalk.dim('Used to add routes programmatically when you run "openclaw-vps add gmail".'));
  console.log(chalk.dim('Create one at:'));
  console.log(chalk.cyan('  https://dash.cloudflare.com/profile/api-tokens'));
  console.log(chalk.dim('\n  1. Click "Create Token"'));
  console.log(chalk.dim('  2. Select "Create Custom Token"'));
  console.log(chalk.dim('  3. Add permissions:'));
  console.log(chalk.dim(`     - ${chalk.white('Account')} → ${chalk.white('Cloudflare Tunnel')} → ${chalk.white('Edit')}`));
  console.log(chalk.dim(`     - ${chalk.white('Zone')} → ${chalk.white('DNS')} → ${chalk.white('Edit')}`));
  console.log(chalk.dim('  4. Continue → Create Token → copy it\n'));

  const storeApiToken = await confirm({
    message: 'Store Cloudflare API token for programmatic route management?',
    default: false,
  });

  if (storeApiToken) {
    const apiToken = await password({ message: 'Cloudflare API token:' });
    if (apiToken) {
      await setCliConfigValue('cloudflare.apiToken', apiToken.trim());
      console.log(chalk.green('✓ API token stored'));
    }
  }

  // ── Instructions for public hostname ──────────────────────
  console.log('\n' + chalk.bold.yellow('⚠  Add public hostname in Cloudflare dashboard:'));
  console.log(chalk.white(`
  1. Go to: https://dash.cloudflare.com/ → Zero Trust → Networks → Tunnels
  2. Click on your tunnel → "Public Hostname" tab
  3. Add hostname:
     - Subdomain: ${chalk.bold(hooksDomain.split('.')[0])}
     - Domain: ${chalk.bold(hooksDomain.split('.').slice(1).join('.'))}
     - Service URL: ${chalk.bold.cyan('http://localhost:18800')}
  4. Save
`));

  console.log(chalk.bold.green('✅ Cloudflare tunnel configured!'));
  console.log(chalk.dim(`Hooks domain: ${hooksDomain}`));
  console.log('');
}

async function setupCliConfig(): Promise<void> {
  const token = await detectCloudflaredToken();
  if (token) {
    const info = parseTunnelToken(token);
    if (info) {
      const current = await readCliConfig();
      if (!current.cloudflare) {
        await saveCloudflareConfig({
          accountId: info.accountId,
          tunnelId: info.tunnelId,
        });
      }
    }
  }

  const existing = await getCliConfigValue('hooksDomain');
  if (!existing) {
    const hooksDomain = await input({
      message: 'What is your hooks domain? (e.g. hooks.example.com):',
    });
    if (hooksDomain) {
      await setCliConfigValue('hooksDomain', hooksDomain.trim());
    }
  }
}

async function installCloudflared(): Promise<void> {
  const spinner = ora('Installing cloudflared...').start();
  try {
    await run('mkdir', ['-p', '/etc/apt/keyrings']);
    await run('bash', ['-c',
      'curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | gpg --dearmor -o /etc/apt/keyrings/cloudflare-main.gpg'
    ]);
    await writeFile(
      '/etc/apt/sources.list.d/cloudflared.list',
      `deb [signed-by=/etc/apt/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared bookworm main\n`,
      'utf8'
    );
    await run('apt-get', ['update', '-qq'], { env: { DEBIAN_FRONTEND: 'noninteractive' } });
    await run('apt-get', ['install', '-y', 'cloudflared'], { env: { DEBIAN_FRONTEND: 'noninteractive' } });
    spinner.succeed('cloudflared installed');
  } catch {
    spinner.text = 'Trying direct download...';
    try {
      await run('bash', ['-c',
        'curl -L --output /usr/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 && chmod +x /usr/bin/cloudflared'
      ]);
      spinner.succeed('cloudflared installed (direct download)');
    } catch (err2) {
      spinner.fail(chalk.red(`Failed to install cloudflared: ${(err2 as Error).message}`));
      process.exit(1);
    }
  }
}
