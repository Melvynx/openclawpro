# Gmail Setup Guide

Set up real-time Gmail notifications through OpenClaw.

## Architecture

```
Email arrives in Gmail
    -> Gmail API pushes to Google Pub/Sub topic
    -> Pub/Sub push subscription (HTTPS POST)
    -> Cloudflare Tunnel (gmail-<label>.<domain> -> localhost:<port>)
    -> openclaw webhooks gmail run (watcher on local port)
    -> Fetches email content via Gmail API
    -> POST to OpenClaw Gateway (/hooks/gmail-<label>)
    -> AI agent filters spam vs important
    -> Telegram notification if important
```

## Prerequisites

- OpenClaw gateway running (`systemctl status openclaw-gateway`)
- Cloudflare Tunnel running (token-based, dashboard-managed)
- Google Cloud account with a project + billing enabled
- Telegram bot configured in OpenClaw

---

## Step 1: Install gog

```bash
which gog || (brew install gogcli && ln -sf /home/linuxbrew/.linuxbrew/bin/gog /usr/local/bin/gog)
```

---

## Step 2: Create OAuth Credentials

1. Go to [Google Cloud Console - Credentials](https://console.cloud.google.com/apis/credentials)
2. Create Credentials -> OAuth 2.0 Client ID
3. Application type: **Desktop App**
4. Copy the **client_id** and **client_secret**

Write them as a named client on the VPS:

```bash
mkdir -p ~/.config/gogcli
cat > ~/.config/gogcli/credentials-<CLIENT_NAME>.json << 'EOF'
{
  "installed": {
    "client_id": "<CLIENT_ID>",
    "client_secret": "<CLIENT_SECRET>",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "redirect_uris": ["http://localhost"]
  }
}
EOF

# Set keyring password (save this - needed for systemd services)
export GOG_KEYRING_PASSWORD=$(openssl rand -hex 16)
echo "GOG_KEYRING_PASSWORD=$GOG_KEYRING_PASSWORD"

# Register credentials in gog
gog auth credentials set ~/.config/gogcli/credentials-<CLIENT_NAME>.json --name <CLIENT_NAME>
```

---

## Step 3: Authenticate Gmail (headless VPS - two-step)

```bash
# Step 1: Get OAuth URL
gog auth add <EMAIL> --client <CLIENT_NAME> --remote --step 1
# -> Opens an OAuth URL. Copy it to your LOCAL browser.
# -> Authorize. Browser redirects to localhost (page won't load - that's OK).
# -> Copy the FULL URL from the address bar.

# Step 2: Complete with redirect URL
gog auth add <EMAIL> --client <CLIENT_NAME> --remote --step 2 --auth-url "<REDIRECT_URL>"
```

Verify:
```bash
gog gmail search "in:inbox" --account <EMAIL> --limit 1
```

---

## Step 4: Enable APIs

```bash
gcloud services enable gmail.googleapis.com pubsub.googleapis.com --project <PROJECT_ID>
```

If gcloud isn't authenticated:
```bash
gcloud auth login --no-browser
gcloud config set project <PROJECT_ID>
```

---

## Step 5: Create Pub/Sub Topic + Subscription

```bash
LABEL="dev"  # short name from email (dev, pro, mal, etc.)

# Create topic
gcloud pubsub topics create gog-gmail-watch-$LABEL --project=<PROJECT_ID>

# CRITICAL: Grant Gmail permission to publish
gcloud pubsub topics add-iam-policy-binding \
  projects/<PROJECT_ID>/topics/gog-gmail-watch-$LABEL \
  --member="serviceAccount:gmail-api-push@system.gserviceaccount.com" \
  --role="roles/pubsub.publisher"

# Create push subscription
PUSH_TOKEN=$(openssl rand -hex 24)
echo "PUSH_TOKEN=$PUSH_TOKEN"

gcloud pubsub subscriptions create gog-gmail-watch-$LABEL-push \
  --topic=gog-gmail-watch-$LABEL \
  --push-endpoint="https://gmail-$LABEL.<DOMAIN>/gmail-pubsub?token=$PUSH_TOKEN" \
  --ack-deadline=30 \
  --project=<PROJECT_ID>
```

---

## Step 6: Add Cloudflare Tunnel Route

Add a public hostname in the Cloudflare dashboard or via API:

**Dashboard:** Networks -> Connectors -> your connector -> Routes -> Add a route -> Public hostname
- Subdomain: `gmail-<LABEL>`
- Domain: `<DOMAIN>`
- Service: HTTP -> `localhost:<PORT>`

**Or via API:**

```bash
# Get current config
curl -s "https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/cfd_tunnel/<TUNNEL_ID>/configurations" \
  -H "Authorization: Bearer <CF_TOKEN>"

# PUT updated config with new rule BEFORE the catch-all
# Add: {"hostname": "gmail-<LABEL>.<DOMAIN>", "service": "http://localhost:<PORT>"}

# Create DNS CNAME
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/<ZONE_ID>/dns_records" \
  -H "Authorization: Bearer <CF_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"type":"CNAME","name":"gmail-<LABEL>","content":"<TUNNEL_ID>.cfargotunnel.com","proxied":true}'
```

No need to restart cloudflared - routes propagate automatically.

---

## Step 7: Create Systemd Service

```bash
cat > /etc/systemd/system/gmail-watch-$LABEL.service << EOF
[Unit]
Description=Gmail Watch (<EMAIL>)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/env HOME=/root XDG_CONFIG_HOME=/root/.config GOG_KEYRING_PASSWORD=<GOG_KEYRING_PW> /usr/bin/openclaw webhooks gmail run --account <EMAIL> --bind 127.0.0.1 --port <PORT> --path /gmail-pubsub --label INBOX --topic projects/<PROJECT_ID>/topics/gog-gmail-watch-$LABEL --subscription gog-gmail-watch-$LABEL-push --push-token $PUSH_TOKEN --hook-url http://127.0.0.1:18789/hooks/gmail-$LABEL --hook-token <HOOK_TOKEN> --include-body --max-bytes 20000 --tailscale off
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now gmail-watch-$LABEL
```

---

## Step 8: Add Hook Mapping

Edit `~/.openclaw/openclaw.json` - add to `hooks.mappings[]`:

```json
{
  "match": { "path": "gmail-<LABEL>" },
  "action": "send",
  "channel": "telegram",
  "target": "<TELEGRAM_CHAT_ID>",
  "name": "Gmail <LABEL>",
  "sessionKey": "hook:gmail-<LABEL>:{{messages[0].id}}",
  "messageTemplate": "<email filter prompt>",
  "model": "anthropic/claude-sonnet-4-5",
  "thinking": "low",
  "deliver": true
}
```

Restart gateway:
```bash
systemctl restart openclaw-gateway
```

---

## Step 9: Verify

```bash
# Service running?
systemctl status gmail-watch-$LABEL --no-pager

# Port listening?
ss -tlnp | grep <PORT>

# Logs OK?
journalctl -u gmail-watch-$LABEL -n 20 --no-pager

# Cloudflare endpoint reachable?
curl -s -o /dev/null -w "%{http_code}" "https://gmail-$LABEL.<DOMAIN>/gmail-pubsub"
```

---

## Multiple Accounts

Each account needs its own:
- Pub/Sub topic + subscription (step 5)
- Cloudflare subdomain (step 6)
- Port number (8788, 8789, 8790, ...)
- Systemd service (step 7)
- Hook mapping (step 8)

Steps 1-4 only need to be done once (shared OAuth client and GCP project).

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `PERMISSION_DENIED` on Pub/Sub | Missing IAM binding: `gcloud pubsub topics add-iam-policy-binding ... --member="serviceAccount:gmail-api-push@system.gserviceaccount.com" --role="roles/pubsub.publisher"` |
| `redirect_uri_mismatch` | OAuth must be "Desktop app" type |
| `invalid_grant` | Re-authenticate: `gog auth add <email> --client <client> --remote --step 1/2` |
| Push not arriving | Check subscription endpoint: `gcloud pubsub subscriptions describe gog-gmail-watch-<LABEL>-push` |
| No notifications after 7 days | Restart service (auto-renews watch): `systemctl restart gmail-watch-<LABEL>` |
| Service crash loop | `journalctl -u gmail-watch-<LABEL> -n 30 --no-pager` |

## Key Files

| File | Purpose |
|------|---------|
| `~/.config/gogcli/credentials-<client>.json` | OAuth client credentials |
| `~/.openclaw/openclaw.json` | Hook mappings, gateway config |
| `/etc/systemd/system/gmail-watch-*.service` | Per-account watcher services |
