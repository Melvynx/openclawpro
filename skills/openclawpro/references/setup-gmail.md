# Gmail Setup (One-Shot)

Add a Gmail account for real-time AI notifications via Telegram.

```
Gmail -> Pub/Sub -> Cloudflare Tunnel -> gog watch serve -> Gateway hook -> AI filter -> Telegram
```

## Requirements

- GCP **project ID** with billing + Gmail & Pub/Sub APIs enabled
- OAuth **client_id** + **client_secret** (Desktop App type) from `https://console.cloud.google.com/apis/credentials`
- Gmail address to monitor
- Cloudflare tunnel already running (account ID, tunnel ID, zone ID, API token)

## Variables

Determine ALL before starting:

```
EMAIL, LABEL (short: dev/pro/mal), PROJECT_ID, CLIENT_ID, CLIENT_SECRET
PORT (next from 8788: ss -tlnp | grep -E '878[0-9]')
PUSH_TOKEN (openssl rand -hex 24)
HOOK_TOKEN (from ~/.openclaw/openclaw.json hooks.token)
GOG_KEYRING_PW (existing or: openssl rand -hex 16)
CF_TOKEN, ACCOUNT_ID, TUNNEL_ID, ZONE_ID, DOMAIN
GOG_CLIENT (credential name, e.g. "steveclaw")
```

## Step 1: Install gog

```bash
which gog || (brew install gogcli && ln -sf /home/linuxbrew/.linuxbrew/bin/gog /usr/local/bin/gog)
```

## Step 2: OAuth credentials

```bash
mkdir -p ~/.config/gogcli
cat > ~/.config/gogcli/credentials-<GOG_CLIENT>.json << 'EOF'
{"installed":{"client_id":"<CLIENT_ID>","client_secret":"<CLIENT_SECRET>","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","redirect_uris":["http://localhost"]}}
EOF

export GOG_KEYRING_PASSWORD=<GOG_KEYRING_PW>
gog auth credentials set ~/.config/gogcli/credentials-<GOG_CLIENT>.json --name <GOG_CLIENT>
```

## Step 3: Authenticate Gmail (headless two-step)

```bash
gog auth add <EMAIL> --client <GOG_CLIENT> --remote --step 1
# -> Copy OAuth URL to LOCAL browser -> authorize -> copy redirect URL (localhost won't load, that's OK)

gog auth add <EMAIL> --client <GOG_CLIENT> --remote --step 2 --auth-url "<REDIRECT_URL>"
```

Verify: `GOG_KEYRING_PASSWORD=<GOG_KEYRING_PW> gog gmail search "in:inbox" --account <EMAIL> --limit 1`

**OAuth token is bound to the client ID that created it.** Use the SAME client for all accounts.

## Step 4: Enable APIs

```bash
gcloud services enable gmail.googleapis.com pubsub.googleapis.com --project <PROJECT_ID>
```

## Step 5: Pub/Sub topic + IAM

```bash
gcloud pubsub topics create gog-gmail-watch-<LABEL> --project=<PROJECT_ID>

# CRITICAL: Without this, pushes SILENTLY FAIL
gcloud pubsub topics add-iam-policy-binding \
  projects/<PROJECT_ID>/topics/gog-gmail-watch-<LABEL> \
  --member="serviceAccount:gmail-api-push@system.gserviceaccount.com" \
  --role="roles/pubsub.publisher"
```

## Step 6: Pub/Sub push subscription

```bash
gcloud pubsub subscriptions create gog-gmail-watch-<LABEL>-push \
  --topic=gog-gmail-watch-<LABEL> \
  --push-endpoint="https://gmail-<LABEL>.<DOMAIN>/gmail-pubsub?token=<PUSH_TOKEN>" \
  --ack-deadline=30 \
  --project=<PROJECT_ID>
```

## Step 7: Cloudflare route + DNS

```bash
# Get current config
curl -s "https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/cfd_tunnel/<TUNNEL_ID>/configurations" \
  -H "Authorization: Bearer <CF_TOKEN>" | python3 -m json.tool

# PUT updated config: add new rule BEFORE catch-all {"service":"http_status:404"}
# New rule: {"hostname":"gmail-<LABEL>.<DOMAIN>","service":"http://localhost:<PORT>"}

# DNS CNAME
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/<ZONE_ID>/dns_records" \
  -H "Authorization: Bearer <CF_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"type":"CNAME","name":"gmail-<LABEL>","content":"<TUNNEL_ID>.cfargotunnel.com","proxied":true,"ttl":1}'
```

## Step 8: Register Gmail watch

```bash
GOG_KEYRING_PASSWORD=<GOG_KEYRING_PW> gog gmail watch start \
  --account <EMAIL> --label INBOX \
  --topic projects/<PROJECT_ID>/topics/gog-gmail-watch-<LABEL>
```

Expires in 7 days. `gog gmail watch serve` auto-renews.

## Step 9: Systemd service

**Use `gog gmail watch serve` - NOT `openclaw webhooks gmail run`.**

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

systemctl daemon-reload && systemctl enable --now gog-gmail-<LABEL>
```

Note: flag is `--token` (NOT `--push-token`). Full binary path required. `GOG_KEYRING_PASSWORD` via `Environment=` is mandatory.

## Step 10: Hook mapping

Add to `~/.openclaw/openclaw.json` in `hooks.mappings[]`:

```json
{
  "match": { "path": "gmail-<LABEL>" },
  "messageTemplate": "You manage <EMAIL>.\n\nEMAIL:\nFrom: {{messages[0].from}}\nSubject: {{messages[0].subject}}\nSnippet: {{messages[0].snippet}}\nBody:\n{{messages[0].body}}\n\nRULES:\n- If empty, reply: NO_REPLY\n- Ignore spam. Reply: NO_REPLY\n- Output: <emoji> <label> | <short summary>\n- Your reply IS the notification.\n",
  "deliver": true,
  "allowUnsafeExternalContent": true,
  "channel": "telegram",
  "to": "<TELEGRAM_CHAT_ID>",
  "model": "anthropic/claude-sonnet-4-5"
}
```

**`deliver: true` is MANDATORY.** Without it: "No session found" error. Agent's text reply = the delivered message. `NO_REPLY` = nothing sent.

Restart: `kill $(pgrep -f openclaw-gateway)`

## Step 11: Verify

```bash
systemctl status gog-gmail-<LABEL> --no-pager
ss -tlnp | grep <PORT>
journalctl -u gog-gmail-<LABEL> -n 20 --no-pager
```

## More Accounts

Steps 1-2, 4 only once. Repeat 3, 5-11 per account. Each needs unique PORT, topic, subscription, subdomain, service, mapping.

## Gotchas

1. `gog gmail watch serve` only - `openclaw webhooks gmail run` is broken
2. `deliver: true` mandatory in hook mappings
3. `GOG_KEYRING_PASSWORD` must be in systemd `Environment=`
4. Same OAuth client for all accounts (token bound to client ID)
5. IAM binding on topic or pushes silently fail
6. Gmail watch expires every 7 days (serve auto-renews)
7. Cross-account emails trigger both hooks - first logs, second dedupes (normal)
8. Push delay 10-60s is normal
9. Catch-all ingress rule must be last

## Troubleshooting

| Error | Fix |
|-------|-----|
| `PERMISSION_DENIED` on Pub/Sub | IAM binding missing: step 5 |
| `unauthorized_client` | Wrong OAuth client - must match original |
| `no TTY available for keyring` | `GOG_KEYRING_PASSWORD` not in Environment= |
| `No session found` on hook | `deliver` must be `true` |
| `invalid_grant` | Re-auth: step 3 |
| Push not arriving | Check subscription endpoint + IAM + DNS |
| No notifications after 7 days | `systemctl restart gog-gmail-<LABEL>` |
