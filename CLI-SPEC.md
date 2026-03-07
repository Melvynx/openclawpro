# openclaw-vps CLI Specification

## Overview
A Node.js CLI tool published as `openclaw-vps` on npm.
Usage: `npx openclaw-vps <command>`

Built with: Node.js (no build step needed), uses `#!/usr/bin/env node`
Dependencies: minimal (commander, chalk, ora, inquirer/prompts)

## Commands

### `npx openclaw-vps setup`
Full VPS setup. Interactive wizard that:

1. **System check**: Detects OS, checks root, shows what's already installed
2. **Install all**: Node.js 22, OpenClaw, gh, Claude Code, Bun, Cloudflared, gcloud CLI
3. **Security hardening**: UFW, fail2ban, SSH hardening, unattended-upgrades
4. **OpenClaw onboard**: Runs `openclaw onboard` interactively
5. **Cloudflare Tunnel**: Interactive setup (asks for API token, domain, creates tunnel + systemd service)
6. **Hooks proxy**: Creates the hooks-proxy.mjs file + systemd service automatically
7. **Systemd services**: Creates openclaw-gateway service, enables lingering
8. **Aliases**: Adds to .bashrc
9. **Summary**: Shows all created services, tokens, endpoints

Each step shows a spinner, checks if already done (idempotent), and can be skipped.

### `npx openclaw-vps add gmail`
Add a Gmail account for real-time notifications. THIS IS THE KILLER FEATURE.

Options:
- `-e, --email <email>` (required) Gmail account to monitor
- `--project <id>` GCP project ID (auto-detected if only one)
- `--hook-name <name>` Hook path name (default: derived from email, e.g. "gmail-mal2")
- `--port <port>` Port for gog watch serve (auto-assigned from 8788+)
- `--model <model>` AI model for email analysis (default: "anthropic/claude-sonnet-4-5")
- `--channel <channel>` Notification channel (default: "telegram")
- `--target <id>` Telegram chat/group ID for notifications

Flow:
1. **Check prerequisites**: gcloud installed, cloudflared running, OpenClaw running
2. **Google Cloud Project**:
   - Check if gcloud is authenticated, if not run `gcloud auth login --no-browser`
   - Auto-detect or ask for project ID
   - Enable Gmail API automatically (`gcloud services enable gmail.googleapis.com`)
   - Check for existing OAuth credentials, if none:
     - Create OAuth consent screen automatically via gcloud/API
     - Create OAuth desktop client automatically (`gcloud alpha iap oauth-clients create` or REST API)
     - Download credentials JSON automatically
     - Save to `~/.openclaw/gogcli/google-oauth-client.json`
   - Show clear message: "OAuth credentials ready ✓"

3. **Authenticate Gmail account**:
   - Run `gog auth credentials set ~/.openclaw/gogcli/google-oauth-client.json`
   - Run `gog auth add <email> --manual --force-consent`
   - Parse the auth URL, display it clearly with instructions
   - Wait for user to paste redirect URL
   - Verify with `gog gmail search "in:inbox" --account <email> --limit 1`
   - Show: "Gmail account authenticated ✓"

4. **Setup Pub/Sub + Watch**:
   - Auto-generate push-token
   - Determine push endpoint from Cloudflare tunnel config
   - Run `openclaw webhooks gmail setup` with all params
   - Show: "Gmail watch active ✓"

5. **Configure OpenClaw hooks**:
   - Read existing openclaw.json
   - Add hook mapping for this email (with smart defaults)
   - Generate the messageTemplate automatically
   - Write back openclaw.json
   - Show: "Hook mapping added ✓"

6. **Create systemd service**:
   - Generate `gmail-watch-<name>.service` file
   - Enable + start
   - Show: "Service running ✓"

7. **Add Cloudflare Tunnel route** (if not exists):
   - Update /etc/cloudflared/config.yml or use API
   - Add route for the gmail endpoint
   - Restart cloudflared
   - Show: "Tunnel route added ✓"

8. **Test**:
   - Send test email via `gog gmail send`
   - Wait 10s, check if notification arrived
   - Show result

9. **Summary**:
   ```
   ✅ Gmail notifications configured for melvynmal2@gmail.com

   Service: gmail-watch-mal2.service
   Port: 8789
   Hook: /hooks/gmail-mal2
   Tunnel: https://hooks.example.com/gmail-mal2
   Notifications: telegram → -5176368405

   Commands:
   - Check status: systemctl status gmail-watch-mal2
   - View logs: journalctl -u gmail-watch-mal2 -f
   - Restart: systemctl restart gmail-watch-mal2
   ```

### `npx openclaw-vps add webhook`
Add a custom webhook (Codeline, Stripe, GitHub, etc.)

Options:
- `--name <name>` Service name (e.g. "codeline", "stripe")
- `--secret <secret>` Webhook secret
- `--secret-field <field>` Body field for secret (default for Codeline-style)
- `--secret-header <header>` Header for secret (for Stripe/GitHub-style)

Flow:
1. Add route to hooks-proxy.mjs
2. Add mapping to openclaw.json
3. Restart hooks-proxy + gateway
4. Show webhook URL + test curl

### `npx openclaw-vps status`
Show status of all services:
- OpenClaw Gateway (running/stopped)
- Hooks Proxy (running/stopped)
- Cloudflare Tunnel (running/stopped)
- Gmail watches (per account, running/stopped)
- Custom webhooks (configured routes)

### `npx openclaw-vps add cloudflare`
Setup or reconfigure Cloudflare Tunnel.

### `npx openclaw-vps add security`
Apply security hardening (UFW, fail2ban, SSH, unattended-upgrades).

## Technical Details

### Project Structure
```
openclaw-vps/
├── package.json
├── bin/
│   └── openclaw-vps.js          # Entry point
├── src/
│   ├── index.js                # Commander setup
│   ├── utils/
│   │   ├── spinner.js          # ora wrapper
│   │   ├── exec.js             # child_process wrapper with error handling
│   │   ├── config.js           # Read/write openclaw.json
│   │   ├── cloudflare.js       # CF tunnel helpers
│   │   └── system.js           # OS detection, package checks
│   └── commands/
│       ├── setup.js            # Full setup wizard
│       ├── add-gmail.js        # Gmail setup
│       ├── add-webhook.js      # Custom webhook setup
│       ├── add-cloudflare.js   # CF tunnel setup
│       ├── add-security.js     # Security hardening
│       └── status.js           # Status dashboard
├── templates/
│   ├── hooks-proxy.mjs         # Template for hooks proxy
│   ├── gmail-service.template  # Systemd template for gmail watch
│   └── gateway-service.template # Systemd template for gateway
└── README.md
```

### Key Design Principles
1. **Zero-config where possible** - auto-detect, auto-generate, smart defaults
2. **Idempotent** - safe to re-run any command
3. **Progressive disclosure** - show what's happening, hide complexity
4. **Escape hatches** - can skip any step, configure manually later
5. **Error recovery** - clear error messages with exact fix commands

### OAuth Credential Creation (the hard part made easy)
The biggest pain point is creating Google OAuth credentials. The CLI should:
1. Try `gcloud` API first (fastest, no browser needed)
2. If that fails, provide a DIRECT LINK to the console page with exact instructions
3. If credentials.json already exists, skip this step

For the consent screen:
```bash
# Check if consent screen exists
gcloud alpha iap oauth-brands list --project=PROJECT_ID

# Create if not exists (internal type for personal use)
gcloud alpha iap oauth-brands create --application_title="OpenClaw Gmail" --support_email=EMAIL --project=PROJECT_ID
```

For OAuth client:
```bash
# This might need the REST API instead
curl -X POST "https://oauth2.googleapis.com/..." # or use the console
```

If gcloud doesn't support it fully, the CLI should:
- Open the exact URL: `https://console.cloud.google.com/apis/credentials/oauthclient?project=PROJECT_ID`
- Tell user exactly what to click (Desktop App, create, download JSON)
- Watch a directory for the downloaded file, or ask user to paste the path
- Move it to the right location

### hooks-proxy.mjs Template
The CLI generates this file based on configured webhooks. It's a simple Node.js HTTP server that:
- Validates secrets per route
- Injects auth header for OpenClaw gateway
- Injects `_raw` payload
- Forwards to gateway

### Smart Email Hook Template
When adding Gmail, the messageTemplate should be smart:
- Filter spam/promos automatically
- De-dup by subject
- Short notification format
- Calendar event detection
- Newsletter link extraction
