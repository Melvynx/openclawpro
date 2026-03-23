# Setup Gmail Notifications (One-Shot)

Add a Gmail account to OpenClaw for real-time AI-powered email notifications.

**Requirements from the user:**
- A Google Cloud **project ID** with billing enabled
- A Google OAuth **client_id** and **client_secret** (Desktop App type)
- The Gmail address to monitor
- Cloudflare API token, account ID, tunnel ID, and zone ID (from existing tunnel setup)

If the user doesn't have OAuth credentials yet, guide them:
1. Go to `https://console.cloud.google.com/apis/credentials`
2. Create Credentials -> OAuth client ID -> Desktop app -> Create
3. Copy the client_id and client_secret

## Variables to Determine

Before starting, determine ALL values. Use these conventions:

```
EMAIL          = the Gmail address (e.g. melvynx.dev@gmail.com)
LABEL          = short name derived from email (e.g. "dev", "pro", "mal")
PROJECT_ID     = GCP project ID (e.g. openclawprotest)
CLIENT_ID      = OAuth client ID
CLIENT_SECRET  = OAuth client secret
PORT           = next available port starting from 8788 (check: ss -tlnp | grep -E '878[0-9]')
PUSH_TOKEN     = generate with: openssl rand -hex 24
HOOK_TOKEN     = from ~/.openclaw/openclaw.json at hooks.token (or existing hook-token from another service)
GOG_KEYRING_PW = existing from env or generate with: openssl rand -hex 16
CF_TOKEN       = Cloudflare API token
ACCOUNT_ID     = Cloudflare account ID
TUNNEL_ID      = Cloudflare tunnel ID
ZONE_ID        = Cloudflare zone ID for the domain
DOMAIN         = domain used for subdomains (e.g. melvynx.dev)
GOG_CLIENT     = name for the gog credentials (e.g. "steveclaw")
```

## Step 1: Install gog (if missing)

```bash
which gog || (brew install gogcli && ln -sf /home/linuxbrew/.linuxbrew/bin/gog /usr/local/bin/gog)
```

If brew fails with "Running Homebrew as root":
```bash
printf '#!/bin/bash\ncd /tmp\nexec sudo -u linuxbrew /home/linuxbrew/.linuxbrew/bin/brew "$@"' > /usr/local/bin/brew && chmod +x /usr/local/bin/brew
```

## Step 2: Write OAuth credentials file

Write credentials as a **named client** so multiple accounts can share it:

```bash
mkdir -p ~/.config/gogcli
cat > ~/.config/gogcli/credentials-<GOG_CLIENT>.json << 'EOF'
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
```

## Step 3: Set up gog keyring and register credentials

```bash
export GOG_KEYRING_PASSWORD=<GOG_KEYRING_PW>

# Register the named client in gog
gog auth credentials set ~/.config/gogcli/credentials-<GOG_CLIENT>.json --name <GOG_CLIENT>
```

Save `GOG_KEYRING_PASSWORD` - it's needed in systemd services.

## Step 4: Authenticate the Gmail account (headless VPS - two-step)

On a headless VPS, use the two-step remote auth flow:

```bash
# Step 1: Get the OAuth URL
gog auth add <EMAIL> --client <GOG_CLIENT> --remote --step 1
```

This prints an OAuth URL. The user opens it in their LOCAL browser, authorizes, gets redirected to a URL like `http://localhost:1/?code=...&scope=...`. The localhost page won't load - that's normal. Copy the FULL redirect URL from the browser address bar.

```bash
# Step 2: Complete auth with the redirect URL
gog auth add <EMAIL> --client <GOG_CLIENT> --remote --step 2 --auth-url "<FULL_REDIRECT_URL>"
```

Verify authentication works:
```bash
GOG_KEYRING_PASSWORD=<GOG_KEYRING_PW> gog gmail search "in:inbox" --account <EMAIL> --limit 1
```

**CRITICAL:** The OAuth refresh token is bound to the client ID that created it. You MUST use the same OAuth client for all accounts. Using a different client ID gives `unauthorized_client`.

## Step 5: Enable Gmail + Pub/Sub APIs

```bash
gcloud services enable gmail.googleapis.com pubsub.googleapis.com --project <PROJECT_ID>
```

If gcloud isn't authenticated:
```bash
gcloud auth login --no-browser
# Follow the interactive flow - run the --remote-bootstrap command on LOCAL machine
gcloud config set project <PROJECT_ID>
```

## Step 6: Create Pub/Sub topic with Gmail publisher access

```bash
# Create the topic
gcloud pubsub topics create gog-gmail-watch-<LABEL> --project=<PROJECT_ID>

# CRITICAL: Grant Gmail permission to publish to this topic
# gmail-api-push@system.gserviceaccount.com is Google's service account that publishes Gmail notifications
# Without this IAM binding, pushes SILENTLY FAIL
gcloud pubsub topics add-iam-policy-binding \
  projects/<PROJECT_ID>/topics/gog-gmail-watch-<LABEL> \
  --member="serviceAccount:gmail-api-push@system.gserviceaccount.com" \
  --role="roles/pubsub.publisher"
```

## Step 7: Create Pub/Sub push subscription

The push endpoint is the Cloudflare tunnel subdomain that will route to the local watcher port.
The `?token=` query param is validated by `gog gmail watch serve` to authenticate incoming pushes.

```bash
gcloud pubsub subscriptions create gog-gmail-watch-<LABEL>-push \
  --topic=gog-gmail-watch-<LABEL> \
  --push-endpoint="https://gmail-<LABEL>.<DOMAIN>/gmail-pubsub?token=<PUSH_TOKEN>" \
  --ack-deadline=30 \
  --project=<PROJECT_ID>
```

## Step 8: Add Cloudflare Tunnel route + DNS

Add a public hostname route for this Gmail watcher. Routes are managed via the Cloudflare API since the tunnel is token-based (dashboard-managed).

### 8a: Get current tunnel config

```bash
CURRENT_CONFIG=$(curl -s "https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/cfd_tunnel/<TUNNEL_ID>/configurations" \
  -H "Authorization: Bearer <CF_TOKEN>")
echo "$CURRENT_CONFIG" | python3 -m json.tool
```

### 8b: Add the new ingress rule

Extract the existing ingress rules, add the new one BEFORE the catch-all `http_status:404`, and PUT the full config back:

```bash
# Build the new config with existing rules + new gmail route
# The new rule: {"hostname": "gmail-<LABEL>.<DOMAIN>", "service": "http://localhost:<PORT>"}
# Must go BEFORE the catch-all {"service": "http_status:404"}
# Catch-all MUST always be the LAST rule (Cloudflare evaluates top-down)

curl -s -X PUT \
  "https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/cfd_tunnel/<TUNNEL_ID>/configurations" \
  -H "Authorization: Bearer <CF_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '<FULL_CONFIG_WITH_NEW_RULE>'
```

IMPORTANT: Preserve ALL existing ingress rules. Only add the new one before the catch-all.

### 8c: Create DNS CNAME record

```bash
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/<ZONE_ID>/dns_records" \
  -H "Authorization: Bearer <CF_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "CNAME",
    "name": "gmail-<LABEL>",
    "content": "<TUNNEL_ID>.cfargotunnel.com",
    "proxied": true,
    "ttl": 1
  }'
```

Wait 1-2 min for DNS propagation. Verify: `dig gmail-<LABEL>.<DOMAIN> +short`

## Step 9: Register Gmail watch

Tell Google to send Pub/Sub notifications for INBOX changes:

```bash
GOG_KEYRING_PASSWORD=<GOG_KEYRING_PW> gog gmail watch start \
  --account <EMAIL> \
  --label INBOX \
  --topic projects/<PROJECT_ID>/topics/gog-gmail-watch-<LABEL>
```

**Note:** This expires after 7 days. `gog gmail watch serve` (step 10) auto-renews it, so this is only needed for initial setup/testing.

## Step 10: Create systemd service

**IMPORTANT:** Use `gog gmail watch serve` - NOT `openclaw webhooks gmail run`. The `openclaw` wrapper is unreliable and broken. The direct `gog` command is what actually works.

```bash
cat > /etc/systemd/system/gog-gmail-<LABEL>.service << 'EOF'
[Unit]
Description=GOG Gmail Watch Serve (<EMAIL>)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/home/linuxbrew/.linuxbrew/bin/gog gmail watch serve \
  --account <EMAIL> \
  --bind 127.0.0.1 \
  --port <PORT> \
  --path /gmail-pubsub \
  --token <PUSH_TOKEN> \
  --hook-url http://127.0.0.1:18789/hooks/gmail-<LABEL> \
  --hook-token <HOOK_TOKEN> \
  --include-body \
  --max-bytes 20000
Restart=always
RestartSec=5
Environment=HOME=/root
Environment=PATH=/home/linuxbrew/.linuxbrew/bin:/usr/local/bin:/usr/bin:/bin
Environment=GOG_KEYRING_PASSWORD=<GOG_KEYRING_PW>

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now gog-gmail-<LABEL>
```

Key details:
- Uses `gog gmail watch serve` directly (NOT `openclaw webhooks gmail run`)
- Flag is `--token` (NOT `--push-token`)
- Binary path: `/home/linuxbrew/.linuxbrew/bin/gog` (full path required in systemd)
- `--bind 127.0.0.1` - only listen locally (Cloudflare tunnel connects from localhost)
- `--hook-url http://127.0.0.1:18789/hooks/gmail-<LABEL>` - forwards to OpenClaw gateway
- `GOG_KEYRING_PASSWORD` MUST be set via `Environment=` - without it, gog cannot decrypt OAuth tokens and fails with: `no TTY available for keyring file backend password prompt`
- `Environment=PATH=` must include `/home/linuxbrew/.linuxbrew/bin` for gog to find its dependencies

## Step 11: Add hook mapping in openclaw.json

Edit `~/.openclaw/openclaw.json` and add a new entry in `hooks.mappings[]`:

```json
{
  "match": { "path": "gmail-<LABEL>" },
  "messageTemplate": "You manage <EMAIL>.\n\nEMAIL:\nFrom: {{messages[0].from}}\nSubject: {{messages[0].subject}}\nSnippet: {{messages[0].snippet}}\nBody:\n{{messages[0].body}}\n\nRULES:\n- If empty, reply: NO_REPLY\n- Ignore spam. Reply: NO_REPLY\n- Output: <short emoji> <label> | <short summary>\n- Your reply IS the notification.\n",
  "deliver": true,
  "allowUnsafeExternalContent": true,
  "channel": "telegram",
  "to": "<TELEGRAM_CHAT_ID>",
  "model": "anthropic/claude-sonnet-4-5"
}
```

**CRITICAL:** `deliver` MUST be `true`. When `deliver: false`, the agent tries to use `sessions_send` which fails with "No session found" because hook sessions are isolated. With `deliver: true`, OpenClaw automatically sends the agent's text reply to the configured channel.

**NO_REPLY:** When the agent replies `NO_REPLY`, OpenClaw does not send anything to Telegram. Use this for spam/dedup/empty emails.

Then restart the gateway:
```bash
kill $(pgrep -f openclaw-gateway)
# Gateway auto-restarts via its process manager
```

## Step 12: Verify

```bash
# Check service is running
systemctl status gog-gmail-<LABEL> --no-pager

# Check port is listening
ss -tlnp | grep <PORT>

# Check logs
journalctl -u gog-gmail-<LABEL> -n 20 --no-pager

# Check Cloudflare endpoint responds
curl -s -o /dev/null -w "%{http_code}" "https://gmail-<LABEL>.<DOMAIN>/gmail-pubsub?token=test"
```

Expected: service is active, port is bound to 127.0.0.1.

## Adding More Accounts

Repeat steps 4, 6, 7, 8, 9, 10, 11, 12 for each additional Gmail account. Steps 1-3 and 5 only need to be done once (shared OAuth client and GCP project).

Each account needs:
- Its own unique PORT (8788, 8789, 8790, ...)
- Its own Pub/Sub topic + subscription
- Its own Cloudflare subdomain (gmail-<LABEL>.<DOMAIN>)
- Its own systemd service (`gog-gmail-<LABEL>.service`)
- Its own hook mapping in openclaw.json

## Key Gotchas

1. **Use `gog gmail watch serve`, NOT `openclaw webhooks gmail run`** - The openclaw wrapper is broken. The direct gog command is the only reliable method.
2. **`deliver: true` is mandatory** in hook mappings - Without it, hook agent can't send messages.
3. **`GOG_KEYRING_PASSWORD` env var** must be set in systemd - gog encrypts OAuth tokens with this password.
4. **OAuth client must match** - Refresh token is bound to the OAuth client ID that created it. Use the SAME client for all accounts.
5. **Gmail watch expires every 7 days** - `gog gmail watch serve` auto-renews. Without it, pushes stop.
6. **`gmail-api-push@system.gserviceaccount.com` IAM binding** - Without this on the topic, pushes silently fail.
7. **Dedup race condition** - If email is sent FROM account A TO account B, both hooks fire. First to log dedupes the second. This is expected.
8. **Push delivery delay** - Google Pub/Sub push can take 10-60 seconds after inbox change. This is normal.
9. **`NO_REPLY` suppresses delivery** - When agent replies `NO_REPLY`, nothing is sent to Telegram.
10. **Cloudflare tunnel ingress order matters** - Rules are evaluated top-down. Catch-all must be last.

## Troubleshooting

| Error | Fix |
|-------|-----|
| `gog: command not found` | `brew install gogcli && ln -sf /home/linuxbrew/.linuxbrew/bin/gog /usr/local/bin/gog` |
| `Running Homebrew as root` | `printf '#!/bin/bash\ncd /tmp\nexec sudo -u linuxbrew /home/linuxbrew/.linuxbrew/bin/brew "$@"' > /usr/local/bin/brew && chmod +x /usr/local/bin/brew` |
| `redirect_uri_mismatch` | OAuth credentials must be "Desktop app" type, not "Web app" |
| `PERMISSION_DENIED` on Pub/Sub | Run step 6 - IAM binding for `gmail-api-push@system.gserviceaccount.com` is missing |
| `invalid_grant` | Token expired: re-run step 4 (gog auth add with --remote) |
| `unauthorized_client` | Using a different OAuth client than the one that created the token. Must use same client. |
| `no TTY available for keyring` | `GOG_KEYRING_PASSWORD` not set in systemd Environment= |
| `Error 400` on gcloud auth | Run the `--remote-bootstrap` command in a LOCAL terminal, don't open the URL in a browser |
| Push notifications not arriving | 1. Check subscription endpoint: `gcloud pubsub subscriptions describe gog-gmail-watch-<LABEL>-push --project=<PROJECT_ID>` 2. Check IAM binding on topic 3. Check Cloudflare DNS resolves |
| `No session found` on hook | `deliver` must be `true` in hook mapping |
| Service crash loop | `journalctl -u gog-gmail-<LABEL> -n 30 --no-pager` |
| Gmail watch expired (no notifications after 7 days) | Restart the service: `systemctl restart gog-gmail-<LABEL>` - it auto-renews the watch on startup |
| `Ignoring stale push` in logs | Normal after restart - old notifications arriving before new watch is registered |
