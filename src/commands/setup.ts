import chalk from 'chalk';
import ora from 'ora';
import { confirm, input } from '@inquirer/prompts';
import { readFile, writeFile, mkdir, appendFile } from 'fs/promises';
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

  const svcContent = `[Unit]
Description=OpenClaw Hooks Proxy (auth injection for external webhooks)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/node ${HOOKS_PROXY_PATH}
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
  const thisFile = fileURLToPath(import.meta.url);
  const templatePath = join(dirname(thisFile), '..', '..', 'templates', 'gateway-service.template');

  let svcContent: string;
  try {
    svcContent = await readFile(templatePath, 'utf8');
  } catch {
    svcContent = `[Unit]
Description=OpenClaw Gateway
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/openclaw gateway
Environment=HOME=/root
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
`;
  }

  await writeSystemdService(`${GATEWAY_SERVICE}.service`, svcContent);
  await enableAndStartService(GATEWAY_SERVICE);
}

// ─── Aliases ──────────────────────────────────────────────────

async function setupAliases(): Promise<void> {
  const bashrc = join(homedir(), '.bashrc');
  const marker = '# openclawpro aliases';

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
alias oc-status='openclawpro status'
alias oc-logs='journalctl -u openclaw-gateway -f'
alias hooks-logs='journalctl -u openclaw-hooks-proxy -f'
alias gmail-logs='journalctl -u gmail-watch-* -f'
`;

  await appendFile(bashrc, aliases, 'utf8');
  console.log(chalk.dim('  Aliases added to ~/.bashrc'));
  console.log(chalk.dim('  Run: source ~/.bashrc'));
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
    console.log(chalk.dim('  Run later: openclawpro add security'));
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
      console.log(chalk.dim('  Run later: openclawpro add cloudflare'));
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

  // ── Summary ───────────────────────────────────────────────
  console.log('\n' + chalk.bold.green('✅ Setup complete!') + '\n');

  const [gwStat, proxyStat, cfStat] = await Promise.all([
    getServiceStatus('openclaw-gateway'),
    getServiceStatus('openclaw-hooks-proxy'),
    getServiceStatus('cloudflared'),
  ]);

  const statusIcon = (s: string) => s === 'active' ? chalk.green('●') : chalk.red('✗');

  console.log(`  ${statusIcon(gwStat)} openclaw-gateway`);
  console.log(`  ${statusIcon(proxyStat)} openclaw-hooks-proxy`);
  console.log(`  ${statusIcon(cfStat)} cloudflared`);
  console.log('');

  const hooksDomain = await getCliConfigValue('hooksDomain');
  if (hooksDomain) {
    console.log(chalk.bold('Hooks URL:   ') + chalk.cyan(`https://${hooksDomain}`));
  }

  console.log(chalk.bold('\nNext steps:'));
  console.log(chalk.dim('  openclawpro add gmail     # Add Gmail account'));
  console.log(chalk.dim('  openclawpro add webhook   # Add custom webhook'));
  console.log(chalk.dim('  openclawpro status        # Check all services'));
  console.log(chalk.dim('  source ~/.bashrc          # Load aliases'));
  console.log('');
}
