# Gmail Notifications Setup

Real-time Gmail monitoring with AI-powered notifications via Telegram/Discord.

## How It Works

```
Email arrives in Gmail
    -> Gmail API pushes to Google Pub/Sub topic
    -> Pub/Sub push subscription sends HTTPS POST
    -> Cloudflare Tunnel routes to VPS (gmail-<label>.<domain> -> localhost:<port>)
    -> gog watcher (openclaw webhooks gmail run) receives notification
    -> Fetches email content via Gmail API
    -> POSTs to OpenClaw Gateway (/hooks/gmail-<label>)
    -> AI agent filters (spam vs important)
    -> Sends Telegram notification if important
```

## Requirements

- Google OAuth **client_id** + **client_secret** (Desktop App type)
- Gmail address to monitor
- GCP project with billing enabled + Gmail & Pub/Sub APIs enabled
- `gcloud` CLI authenticated
- `gog` CLI installed (via `brew install gogcli`)
- Cloudflare Tunnel already running (token-based, dashboard-managed)
- Cloudflare API token with DNS:Edit + Tunnel:Edit permissions

If the user doesn't have OAuth credentials:
1. `https://console.cloud.google.com/apis/credentials`
2. Create Credentials -> OAuth client ID -> Desktop app -> Create
3. Copy client_id and client_secret

## Architecture Per Account

Each Gmail account gets:
- Its own **Pub/Sub topic** (`gog-gmail-watch-<label>`)
- Its own **Pub/Sub push subscription** (`gog-gmail-watch-<label>-push`)
- Its own **Cloudflare subdomain** (`gmail-<label>.<domain>`)
- Its own **local port** (8788, 8789, 8790, ...)
- Its own **systemd service** (`gmail-watch-<label>`)
- Its own **hook mapping** in openclaw.json (`gmail-<label>`)

## Key Components

| Component | Purpose |
|-----------|---------|
| `gog` CLI | Gmail OAuth + API client (installed via brew) |
| `gcloud` CLI | Creates Pub/Sub topics/subscriptions |
| `openclaw webhooks gmail run` | Watcher that receives push notifications and fetches email content |
| Cloudflare Tunnel | Routes HTTPS traffic to local ports without opening firewall |
| openclaw.json `hooks.mappings` | AI filtering rules per email account |

## Step-by-Step

See `references/setup-gmail.md` for the complete one-shot setup procedure.

## Quick Commands

```bash
# Check all gmail watchers
systemctl list-units --type=service | grep gmail-watch

# Restart a watcher
systemctl restart gmail-watch-<label>

# Check logs
journalctl -u gmail-watch-<label> -f

# List gog authenticated accounts
GOG_KEYRING_PASSWORD=<pw> gog auth list

# Verify gmail API access
GOG_KEYRING_PASSWORD=<pw> gog gmail search "in:inbox" --account <email> --limit 1

# Check pub/sub subscription endpoint
gcloud pubsub subscriptions describe gog-gmail-watch-<label>-push --project=<project-id>

# Update pub/sub push endpoint
gcloud pubsub subscriptions update gog-gmail-watch-<label>-push \
  --project=<project-id> \
  --push-endpoint="https://gmail-<label>.<domain>/gmail-pubsub?token=<push-token>"
```

## Troubleshooting

| Error | Fix |
|-------|-----|
| `gog: command not found` | `brew install gogcli && ln -sf /home/linuxbrew/.linuxbrew/bin/gog /usr/local/bin/gog` |
| `Running Homebrew as root` | Fix wrapper: `printf '#!/bin/bash\ncd /tmp\nexec sudo -u linuxbrew /home/linuxbrew/.linuxbrew/bin/brew "$@"' > /usr/local/bin/brew && chmod +x /usr/local/bin/brew` |
| `redirect_uri_mismatch` | OAuth credentials must be "Desktop app" type, not "Web app" |
| `PERMISSION_DENIED` on Pub/Sub | Missing IAM binding: `gcloud pubsub topics add-iam-policy-binding ... --member="serviceAccount:gmail-api-push@system.gserviceaccount.com" --role="roles/pubsub.publisher"` |
| `invalid_grant` | Token expired: re-authenticate with `gog auth add <email> --client <client> --remote --step 1/2` |
| `Error 400` on gcloud auth | Run `--remote-bootstrap` command in LOCAL terminal, don't open URL in browser |
| Service crash loop | `journalctl -u gmail-watch-<label> -n 30 --no-pager` |
| No notifications after 7 days | Gmail watch expired - restart service: `systemctl restart gmail-watch-<label>` (auto-renews) |
