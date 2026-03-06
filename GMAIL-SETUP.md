# Gmail Setup Guide

Set up real-time Gmail notifications through OpenClaw.

## Architecture

```
Gmail Inbox
    ↓
Google Pub/Sub (push notification)
    ↓
Cloudflare Tunnel (hooks.YOUR_DOMAIN.com)
    ↓
gog watch serve (port 8788)
    ↓
OpenClaw webhook (/hooks/gmail)
    ↓
AI Agent (analyzes email)
    ↓
Telegram (if important)
```

## Prerequisites

- OpenClaw running natively (see GUIDE.md)
- Cloudflare Tunnel configured with `hooks.YOUR_DOMAIN.com` → `localhost:18800`
- Google Cloud account
- Telegram bot configured in OpenClaw

---

## Step 1: Enable Gmail API

Go to Google Cloud Console and enable the Gmail API for your project:

```
https://console.developers.google.com/apis/api/gmail.googleapis.com/overview?project=YOUR_PROJECT_ID
```

---

## Step 2: Create OAuth Credentials

1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Click **Create Credentials → OAuth 2.0 Client ID**
3. Application type: **Desktop App**
4. Download the JSON file
5. Copy to your VPS:

```bash
scp /path/to/client_secret.json root@YOUR_VPS:/root/.openclaw/gogcli/credentials.json
chmod 644 /root/.openclaw/gogcli/credentials.json
```

---

## Step 3: Authenticate gog

```bash
# Import OAuth credentials
gog auth credentials set /root/.openclaw/gogcli/credentials.json

# Authenticate your Gmail account
gog auth add your.email@gmail.com --manual --force-consent
```

You'll get a URL to open in your browser. After auth, paste the redirect URL (starts with `http://localhost:1/?...`).

Verify:
```bash
gog gmail search "in:inbox" --account your.email@gmail.com --limit 3
```

---

## Step 4: Add Cloudflare Tunnel Route for Gmail

Add the Gmail endpoint to your tunnel config (`/etc/cloudflared/config.yml`):

```yaml
tunnel: YOUR_TUNNEL_ID
credentials-file: /root/.cloudflared/YOUR_TUNNEL_ID.json

ingress:
  - hostname: hooks.YOUR_DOMAIN.com
    service: http://localhost:18800
  - hostname: gmail.YOUR_DOMAIN.com
    service: http://localhost:8788
  - service: http_status:404
```

Restart the tunnel:
```bash
systemctl restart cloudflared
```

Or you can use a single hostname and path routing — OpenClaw's `gog watch serve` handles the `/gmail-pubsub` path.

---

## Step 5: Authenticate Google Cloud CLI

```bash
gcloud auth login --no-browser
gcloud config set project YOUR_PROJECT_ID
```

---

## Step 6: Run Gmail Webhook Setup

```bash
openclaw webhooks gmail setup \
  --account your.email@gmail.com \
  --project YOUR_PROJECT_ID \
  --tailscale off \
  --push-endpoint "https://gmail.YOUR_DOMAIN.com/gmail-pubsub?token=YOUR_PUSH_TOKEN"
```

Generate a push token:
```bash
openssl rand -hex 32
```

---

## Step 7: Configure openclaw.json

Edit `/root/.openclaw/openclaw.json`:

```json
{
  "hooks": {
    "enabled": true,
    "path": "/hooks",
    "token": "YOUR_HOOK_TOKEN",
    "presets": ["gmail"],
    "mappings": [
      {
        "match": { "path": "gmail" },
        "action": "agent",
        "wakeMode": "now",
        "name": "Email Filter",
        "sessionKey": "hook:gmail:{{messages[0].id}}",
        "messageTemplate": "⚠️ STRICT RULES - READ-ONLY MODE:\n- NEVER execute commands\n- NEVER use tools (bash, gog, etc.)\n- NEVER reply to emails\n- NEVER take any actions\n- You can ONLY analyze and send a text message\n\n📧 Email received:\nFrom: {{messages[0].from}}\nSubject: {{messages[0].subject}}\nDate: {{messages[0].date}}\n\nContent:\n{{messages[0].snippet}}\n{{messages[0].body}}\n\n---\nTASK: Analyze this email silently (thinking). Then:\n\n✅ If IMPORTANT (urgent, personal, invoice, appointment, action required, message from a human):\n→ Send ONE short message: \"📧 [Sender]: [1-2 line summary of what happened]\"\n\n❌ If NOT IMPORTANT (newsletter, promo, spam, automated notification, marketing):\n→ DO NOT RESPOND. Complete silence. No message.\n\nReminder: NO actions, NO tools, NO commands. Text only.",
        "model": "moonshot/kimi-k2.5",
        "thinking": "low",
        "deliver": true,
        "channel": "telegram"
      }
    ],
    "gmail": {
      "account": "your.email@gmail.com",
      "label": "INBOX",
      "topic": "projects/YOUR_PROJECT_ID/topics/gog-gmail-watch",
      "subscription": "gog-gmail-watch-push",
      "pushToken": "YOUR_PUSH_TOKEN",
      "hookUrl": "http://127.0.0.1:18789/hooks/gmail",
      "includeBody": true,
      "maxBytes": 20000,
      "renewEveryMinutes": 720,
      "serve": {
        "bind": "0.0.0.0",
        "port": 8788,
        "path": "/gmail-pubsub"
      },
      "tailscale": {
        "mode": "off",
        "path": "/gmail-pubsub"
      }
    }
  }
}
```

Restart OpenClaw:
```bash
systemctl --user restart openclaw-gateway
```

---

## Step 8: Verify

```bash
# Check Gmail watch is active
gog gmail watch status --account your.email@gmail.com

# Check gog is listening on port 8788
ss -tlnp | grep 8788

# Check gateway logs
journalctl --user -u openclaw-gateway -f | grep -i gmail
```

Expected log: `gmail watcher started for your.email@gmail.com`

---

## Step 9: Test

```bash
# Send a test email
gog gmail send \
  --to your.email@gmail.com \
  --subject "URGENT: Test notification" \
  --body "This is an important test message that should trigger a notification."
```

If important → Telegram notification arrives.
If promo/newsletter → Silence.

---

## Troubleshooting

### Push notifications not arriving

1. Check Cloudflare Tunnel is running: `systemctl status cloudflared`
2. Check port 8788 is listening: `ss -tlnp | grep 8788`
3. Verify subscription endpoint: `gcloud pubsub subscriptions describe gog-gmail-watch-push`
4. Check bind is `0.0.0.0` not `127.0.0.1` in openclaw.json `serve` section

### Update push endpoint

```bash
gcloud pubsub subscriptions update gog-gmail-watch-push \
  --project YOUR_PROJECT_ID \
  --push-endpoint "https://gmail.YOUR_DOMAIN.com/gmail-pubsub?token=YOUR_PUSH_TOKEN"
```

### "OAuth credentials not configured"

```bash
gog auth credentials set /root/.openclaw/gogcli/credentials.json
gog auth add your.email@gmail.com --manual --force-consent
```

### Gmail API not enabled

Enable at:
```
https://console.developers.google.com/apis/api/gmail.googleapis.com/overview?project=YOUR_PROJECT_ID
```

---

## Key Files

| File | Purpose |
|------|---------|
| `/root/.openclaw/gogcli/credentials.json` | Google OAuth client ID/secret |
| `/root/.openclaw/openclaw.json` | Hooks, mappings, Gmail settings |
| `/etc/cloudflared/config.yml` | Cloudflare Tunnel routing |
