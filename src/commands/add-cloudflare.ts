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
  console.log(chalk.cyan('  https://one.dash.cloudflare.com/ → Zero Trust → Networks → Tunnels'));
  console.log(chalk.dim('Click "Create a tunnel" → Cloudflared → copy the token from the run command.\n'));

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

  // ── Create/update systemd service ────────────────────────
  const svcSpinner = ora('Creating cloudflared systemd service...').start();
  try {
    const svcContent = `[Unit]
Description=cloudflared
After=network-online.target
Wants=network-online.target

[Service]
TimeoutStartSec=15
Type=notify
ExecStart=/usr/bin/cloudflared --no-autoupdate tunnel run --token ${tunnelToken}
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
`;
    await writeSystemdService('cloudflared.service', svcContent);
    await enableAndStartService('cloudflared');
    svcSpinner.succeed('cloudflared service running');
  } catch (err) {
    svcSpinner.fail(chalk.red(`Service setup failed: ${(err as Error).message}`));
    process.exit(1);
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
  console.log(chalk.dim('Used to add routes programmatically when you run "openclawpro add gmail".'));
  console.log(chalk.dim('Create at: https://dash.cloudflare.com/profile/api-tokens'));
  console.log(chalk.dim('Required permissions: Cloudflare Tunnel:Edit, DNS:Edit\n'));

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
  1. Go to: https://one.dash.cloudflare.com/ → Zero Trust → Networks → Tunnels
  2. Click on your tunnel → "Public Hostname" tab
  3. Add hostname:
     - Subdomain: ${hooksDomain.split('.')[0]}
     - Domain: ${hooksDomain.split('.').slice(1).join('.')}
     - Service: HTTP  → localhost:18800
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
