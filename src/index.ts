import { Command } from 'commander';
import chalk from 'chalk';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { SetupOptions, AddGmailOptions, AddWebhookOptions } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function getVersion(): Promise<string> {
  try {
    const pkg = JSON.parse(await readFile(join(__dirname, '..', 'package.json'), 'utf8')) as { version: string };
    return pkg.version;
  } catch {
    return '0.0.0';
  }
}

export async function main(): Promise<void> {
  const version = await getVersion();
  const program = new Command();

  program
    .name('openclawpro')
    .description(chalk.cyan('🦞 OpenClaw Pro'))
    .version(version);

  // ── setup ────────────────────────────────────────────────
  program
    .command('setup')
    .description('Full VPS setup wizard (install everything, configure services)')
    .option('--force', 'Force reinstall even if already installed')
    .option('--skip-install', 'Skip package installation')
    .option('--no-security', 'Skip security hardening')
    .action(async (options: SetupOptions) => {
      const { setup } = await import('./commands/setup.js');
      await setup(options);
    });

  // ── add ─────────────────────────────────────────────────
  const add = program
    .command('add')
    .description('Add a service or configuration');

  add
    .command('gmail')
    .description('Add a Gmail account for real-time AI notifications (the killer feature)')
    .option('-e, --email <email>', 'Gmail account to monitor')
    .option('--project <id>', 'GCP project ID (auto-detected if one project)')
    .option('--hook-name <name>', 'Hook path name (default: derived from email)')
    .option('--port <port>', 'Port for gog watch serve (auto-assigned from 8788+)', parseInt)
    .option('--model <model>', 'AI model for email analysis', 'anthropic/claude-sonnet-4-5')
    .option('--channel <channel>', 'Notification channel', 'telegram')
    .option('--target <id>', 'Telegram chat/group ID for notifications')
    .action(async (options: AddGmailOptions) => {
      const { addGmail } = await import('./commands/add-gmail.js');
      await addGmail(options);
    });

  add
    .command('webhook')
    .description('Add a custom webhook (Codeline, Stripe, GitHub, etc.)')
    .option('--name <name>', 'Service name (e.g. codeline, stripe)')
    .option('--secret <secret>', 'Webhook secret value')
    .option('--secret-field <field>', 'Body field for secret (e.g. secret)')
    .option('--secret-header <header>', 'Header for secret (e.g. stripe-signature)')
    .option('--model <model>', 'AI model for processing', 'anthropic/claude-sonnet-4-5')
    .option('--target <id>', 'Telegram chat/group ID for notifications')
    .action(async (options: AddWebhookOptions) => {
      const { addWebhook } = await import('./commands/add-webhook.js');
      await addWebhook(options);
    });

  add
    .command('cloudflare')
    .description('Setup or reconfigure Cloudflare Tunnel')
    .action(async () => {
      const { addCloudflare } = await import('./commands/add-cloudflare.js');
      await addCloudflare();
    });

  add
    .command('security')
    .description('Apply security hardening (UFW, fail2ban, SSH hardening, unattended-upgrades)')
    .action(async () => {
      const { addSecurity } = await import('./commands/add-security.js');
      await addSecurity();
    });

  // ── install ─────────────────────────────────────────────
  const install = program
    .command('install')
    .description('Install components');

  install
    .command('skills')
    .description('Install or update Claude Code skills to ~/.claude/skills/')
    .action(async () => {
      const { installSkills } = await import('./commands/install-skills.js');
      await installSkills();
    });

  // ── status ───────────────────────────────────────────────
  program
    .command('status')
    .description('Show status of all OpenClaw services and configurations')
    .action(async () => {
      const { showStatus } = await import('./commands/status.js');
      await showStatus();
    });

  // ── Error handling ───────────────────────────────────────
  program.on('command:*', (operands: string[]) => {
    console.error(chalk.red(`Unknown command: ${operands.join(' ')}`));
    console.log(chalk.dim('Run: openclawpro --help'));
    process.exit(1);
  });

  process.on('uncaughtException', (err: Error) => {
    if (err.name === 'ExitPromptError') {
      console.log('\n' + chalk.dim('Cancelled.'));
      process.exit(0);
    }
    console.error(chalk.red(`\nError: ${err.message}`));
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  });

  process.on('unhandledRejection', (err: unknown) => {
    const e = err as Error | undefined;
    if (e?.name === 'ExitPromptError') {
      console.log('\n' + chalk.dim('Cancelled.'));
      process.exit(0);
    }
    console.error(chalk.red(`\nError: ${e?.message || err}`));
    if (process.env.DEBUG) console.error(e?.stack);
    process.exit(1);
  });

  await program.parseAsync(process.argv);
}
