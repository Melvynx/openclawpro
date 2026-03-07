import chalk from 'chalk';
import { runSafe } from '../utils/exec.js';
import {
  getServiceStatus, detectGmailServices, parseGmailServiceInfo,
  detectHooksProxyInfo, readSystemdService,
} from '../utils/system.js';
import { readOpenClawConfig, readProxyRoutes } from '../utils/config.js';
import { detectHooksDomain } from '../utils/cloudflare.js';
import type { ServiceStatus } from '../types.js';

function statusBadge(status: ServiceStatus): string {
  switch (status) {
    case 'active': return chalk.green('● running');
    case 'inactive': return chalk.gray('○ stopped');
    case 'failed': return chalk.red('✗ failed');
    case 'activating': return chalk.yellow('◌ starting');
    default: return chalk.gray(`? ${status}`);
  }
}

function row(label: string, value: string, width = 22): string {
  return `  ${chalk.bold(label.padEnd(width))} ${value}`;
}

export async function showStatus(): Promise<void> {
  console.log('\n' + chalk.bold.cyan('OpenClaw Status Dashboard') + '\n');

  // ── Core Services ─────────────────────────────────────────
  console.log(chalk.bold('Core Services'));
  console.log('─'.repeat(50));

  const coreServices = [
    { name: 'openclaw-gateway', label: 'OpenClaw Gateway' },
    { name: 'openclaw-hooks-proxy', label: 'Hooks Proxy' },
    { name: 'cloudflared', label: 'Cloudflare Tunnel' },
  ];

  for (const svc of coreServices) {
    const status = await getServiceStatus(svc.name);
    console.log(row(svc.label, statusBadge(status)));
  }

  const proxyInfo = await detectHooksProxyInfo();
  if (proxyInfo) {
    console.log(row('  Port', chalk.dim(String(proxyInfo.port))));
  }

  const hooksDomain = await detectHooksDomain().catch(() => null);
  if (hooksDomain) {
    console.log(row('  Hooks URL', chalk.cyan(`https://${hooksDomain}`)));
  }

  console.log('');

  // ── Gmail Services ────────────────────────────────────────
  const gmailServices = await detectGmailServices();
  if (gmailServices.length > 0) {
    console.log(chalk.bold('Gmail Services'));
    console.log('─'.repeat(50));

    for (const svc of gmailServices) {
      const status = await getServiceStatus(svc.replace('.service', ''));
      const info = await parseGmailServiceInfo(svc);
      const label = info?.account || svc.replace('gmail-watch-', '').replace('.service', '');

      console.log(row(label, statusBadge(status)));
      if (info) {
        if (info.port) console.log(row('  Port', chalk.dim(String(info.port))));
        if (info.hookName) console.log(row('  Hook path', chalk.dim(`/${info.hookName}`)));
        if (info.subscription) console.log(row('  Subscription', chalk.dim(info.subscription)));
      }
    }
    console.log('');
  }

  // ── Configured Webhooks ───────────────────────────────────
  const routes = await readProxyRoutes().catch(() => ({}));
  const webhookRoutes = Object.entries(routes).filter(([, cfg]) => !cfg.upstream);

  if (webhookRoutes.length > 0) {
    console.log(chalk.bold('Custom Webhooks'));
    console.log('─'.repeat(50));

    for (const [path, cfg] of webhookRoutes) {
      const secretInfo = cfg.secretField
        ? `body.${cfg.secretField}`
        : cfg.secretHeader
        ? `header: ${cfg.secretHeader}`
        : 'no secret';
      console.log(row(path, chalk.dim(secretInfo)));
      if (hooksDomain) {
        console.log(row('  URL', chalk.cyan(`https://${hooksDomain}${path}`)));
      }
    }
    console.log('');
  }

  // ── OpenClaw Hook Mappings ────────────────────────────────
  const ocConfig = await readOpenClawConfig().catch(() => null);
  if (ocConfig?.hooks?.mappings && ocConfig.hooks.mappings.length > 0) {
    console.log(chalk.bold('Hook Mappings (openclaw.json)'));
    console.log('─'.repeat(50));

    for (const mapping of ocConfig.hooks.mappings) {
      const path = mapping.match?.path || '?';
      const model = mapping.model?.replace('anthropic/', '') || '?';
      const to = mapping.to || mapping.channel || '?';
      console.log(row(`/${path}`, chalk.dim(`${model} → ${to}`)));
    }
    console.log('');
  }

  // ── OpenClaw Config ───────────────────────────────────────
  if (ocConfig) {
    console.log(chalk.bold('OpenClaw Config'));
    console.log('─'.repeat(50));

    const gwPort = ocConfig?.gateway?.port;
    const hookPath = ocConfig?.hooks?.path;
    const gmailAccount = ocConfig?.hooks?.gmail?.account;
    const defaultModel = ocConfig?.agents?.defaults?.model?.primary;

    if (gwPort) console.log(row('Gateway port', chalk.dim(String(gwPort))));
    if (hookPath) console.log(row('Hook path', chalk.dim(hookPath)));
    if (gmailAccount) console.log(row('Gmail account', chalk.dim(gmailAccount)));
    if (defaultModel) console.log(row('Default model', chalk.dim(defaultModel)));

    const profiles = Object.keys(ocConfig?.auth?.profiles || {});
    if (profiles.length > 0) {
      console.log(row('Auth profiles', chalk.dim(profiles.join(', '))));
    }

    const tg = ocConfig?.channels?.telegram;
    if (tg?.enabled) {
      const groups = Object.keys(tg.groups || {});
      console.log(row('Telegram groups', chalk.dim(groups.join(', ') || 'none')));
    }
    console.log('');
  }

  // ── Port Usage ────────────────────────────────────────────
  const portResult = await runSafe('ss', ['-tlnp']);
  if (portResult) {
    const relevantPorts = portResult.stdout
      .split('\n')
      .filter((l) => l.match(/:1878[0-9]|:879[0-9]|:1880[0-9]/))
      .map((l) => {
        const m = l.match(/:(\d+)\s/);
        return m ? m[1] : null;
      })
      .filter((p): p is string => p !== null);

    if (relevantPorts.length > 0) {
      console.log(chalk.bold('Active Ports'));
      console.log('─'.repeat(50));
      console.log(row('Listening', chalk.dim(relevantPorts.join(', '))));
      console.log('');
    }
  }

  // ── Quick commands ────────────────────────────────────────
  console.log(chalk.bold('Quick Commands'));
  console.log('─'.repeat(50));
  console.log(chalk.dim('  openclaw-vps add gmail    # Add Gmail account'));
  console.log(chalk.dim('  openclaw-vps add webhook  # Add custom webhook'));
  console.log(chalk.dim('  journalctl -u openclaw-gateway -f  # View gateway logs'));
  console.log('');
}
