# OpenClaw Pro CLI

Ultra-simple VPS setup for OpenClaw. TypeScript CLI that automates everything.

## Quick Start

```bash
# Full VPS setup (one command)
npx openclawpro setup

# Add Gmail notifications (the killer feature)
npx openclawpro add gmail -e your@gmail.com

# Add custom webhook
npx openclawpro add webhook --name codeline --secret YOUR_SECRET

# Check status
npx openclawpro status
```

## Commands

### `npx openclawpro setup`

Full VPS setup wizard:
1. Install Node.js 22, OpenClaw, gh, Claude Code, Bun, Cloudflared, gcloud CLI
2. Security hardening (UFW, fail2ban, SSH hardening, unattended-upgrades)
3. OpenClaw onboard (interactive)
4. Cloudflare Tunnel setup (optional, interactive)
5. Systemd services (openclaw-gateway, hooks-proxy)
6. Bash aliases

**Idempotent** - safe to re-run, skips what's already installed.

### `npx openclawpro add gmail`

THE KILLER FEATURE - Gmail real-time notifications in one command.

What it does:
1. **Google Cloud OAuth** - Enables Gmail API, creates/guides OAuth credentials setup
2. **gog auth** - Imports credentials, authorizes account (handles OAuth flow)
3. **Pub/Sub** - Creates topic, subscription, push endpoint
4. **OpenClaw hooks** - Adds mapping to openclaw.json (with correct deliver:false pattern)
5. **Systemd service** - Creates gmail-watch-XXX.service (auto-starts on boot)
6. **Cloudflare Tunnel** - Adds route for gmail endpoint automatically
7. **Test** - Sends test email, confirms notification arrives

**From 2 hours of pain to 2 minutes.**

Options:
- `-e, --email` (required) - Gmail account to monitor
- `--project` - GCP project ID (auto-detected if you have one project)
- `--hook-name` - Custom hook name (default: derived from email)
- `--port` - Custom port (default: auto-assigned from 8788+)
- `--model` - AI model (default: anthropic/claude-sonnet-4-5)
- `--channel` - Notification channel (default: telegram)
- `--target` - Telegram chat/group ID

Example:
```bash
npx openclawpro add gmail \
  -e melvynmal2@gmail.com \
  --model anthropic/claude-opus-4-6 \
  --target -5176368405
```

### `npx openclawpro add webhook`

Add a custom webhook (Codeline, Stripe, GitHub, etc.)

Options:
- `--name` (required) - Service name (e.g., "codeline", "stripe")
- `--secret` (required) - Webhook secret
- `--secret-field` - Body field for secret (default for Codeline-style webhooks)
- `--secret-header` - Header for secret (for Stripe/GitHub-style)

Updates:
- `/root/.openclaw/hooks-proxy.mjs` (adds route)
- `/root/.openclaw/openclaw.json` (adds hook mapping)
- Restarts hooks-proxy + gateway

Example:
```bash
# Codeline-style (secret in body)
npx openclawpro add webhook \
  --name codeline \
  --secret uoQ-4gqwj9Fzs6w9zwDe0 \
  --secret-field secret

# Stripe-style (secret in header)
npx openclawpro add webhook \
  --name stripe \
  --secret whsec_xxx \
  --secret-header stripe-signature
```

### `npx openclawpro add cloudflare`

Setup or reconfigure Cloudflare Tunnel.

Interactive wizard for:
- API token input
- Domain configuration
- Tunnel creation
- DNS routing
- Systemd service

### `npx openclawpro add security`

Apply security hardening:
- UFW (firewall) - allow port 22 only
- Fail2ban - SSH bruteforce protection
- SSH hardening - disable password auth, root login by key only
- Unattended-upgrades - automatic security updates

### `npx openclawpro status`

Dashboard showing status of:
- OpenClaw Gateway (running/stopped)
- Hooks Proxy (running/stopped)
- Cloudflare Tunnel (running/stopped)
- Gmail watches (per account)
- Configured webhooks

## Development

```bash
# Clone
git clone https://github.com/Melvynx/clawpro-vps-setup.git
cd clawpro-vps-setup

# Install
npm install

# Build
npm run build

# Type check
npm run typecheck

# Test locally
node bin/openclawpro.js --help
```

## Architecture

```
openclawpro/
├── bin/openclawpro.js       # Entry point (calls dist/index.js)
├── src/
│   ├── index.ts             # Commander setup
│   ├── types.ts             # Shared TypeScript types
│   ├── commands/
│   │   ├── setup.ts         # Full VPS setup
│   │   ├── add-gmail.ts     # Gmail automation (killer feature)
│   │   ├── add-webhook.ts   # Custom webhooks
│   │   ├── add-cloudflare.ts# Cloudflare Tunnel
│   │   ├── add-security.ts  # Security hardening
│   │   └── status.ts        # Status dashboard
│   └── utils/
│       ├── exec.ts          # Child process wrapper (with spinners)
│       ├── config.ts        # Read/write openclaw.json safely
│       ├── system.ts        # OS detection, package checks
│       └── cloudflare.ts    # Cloudflare API helpers
├── templates/
│   ├── hooks-proxy.mjs          # Webhook proxy template
│   ├── gmail-service.template   # Systemd unit for gmail watch
│   └── gateway-service.template # Systemd unit for gateway
└── dist/                    # Compiled JS (generated by tsc)
```

## Tech Stack

- **TypeScript** - Full type safety, no `any`
- **Commander** - CLI framework
- **Chalk** - Terminal colors
- **Ora** - Spinners for long operations
- **@inquirer/prompts** - Interactive prompts

## Design Principles

1. **Zero-config where possible** - Auto-detect, auto-generate, smart defaults
2. **Idempotent** - Safe to re-run any command
3. **Progressive disclosure** - Show what's happening, hide complexity
4. **Escape hatches** - Can skip any step, configure manually later
5. **Error recovery** - Clear error messages with exact fix commands

## Gmail Setup - Under the Hood

The `add gmail` command is the most complex. Here's what it automates:

### 1. Google Cloud OAuth Credentials
- Tries to create via `gcloud` REST API (fastest)
- If fails: opens exact Console URL with step-by-step instructions
- Guides user through: App Type (Desktop), Download JSON, Save location

### 2. gog Authentication
- `gog auth credentials set` - Imports OAuth client credentials
- `gog auth add EMAIL --manual --force-consent` - Starts OAuth flow
- Displays auth URL clearly
- Waits for redirect URL paste
- Verifies with test search

### 3. Pub/Sub Setup
- `gcloud services enable gmail.googleapis.com`
- `openclaw webhooks gmail setup` - Creates topic + subscription
- Auto-generates push token
- Configures push endpoint (Cloudflare Tunnel URL)

### 4. OpenClaw Configuration
- Reads existing `openclaw.json`
- Adds hook mapping with **correct pattern**:
  - `deliver: false` (NOT true!)
  - `allowUnsafeExternalContent: true`
  - `messageTemplate` with spam filtering + dedup
- Writes back safely (preserves other config)

### 5. Systemd Service
- Generates `gmail-watch-HOOKNAME.service`
- Uses `openclaw webhooks gmail run` command
- Enables + starts
- Sets restart policy

### 6. Cloudflare Tunnel Route
- Auto-detects tunnel config
- Adds gmail endpoint route
- Restarts cloudflared

### 7. Test
- `gog gmail send` - Sends test email
- Waits 10s
- Checks notification arrived
- Shows success/failure + troubleshooting

## Why This CLI is Special

**Before:**
1. SSH to VPS
2. Follow 50-step guide
3. Copy-paste 20+ commands
4. Manual OAuth dance in browser
5. Edit 3 config files
6. Debug why nothing works
7. Give up, cry

**After:**
```bash
npx openclawpro add gmail -e your@gmail.com
```

2 minutes. Done.

## License

MIT
