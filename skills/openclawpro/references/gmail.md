# Gmail Notifications Setup

Real-time Gmail monitoring with AI-powered notifications via Telegram/Discord.

## How It Works

```
Gmail -> Google Pub/Sub -> gog watch service -> OpenClaw Gateway -> Telegram/Discord
```

## Requirements

- Google OAuth **client_id** + **client_secret** (Desktop App type)
- Gmail address to monitor
- GCP project with billing enabled
- `gcloud` and `gog` installed

If the user doesn't have OAuth credentials:
1. `https://console.cloud.google.com/apis/credentials`
2. Create Credentials -> OAuth client ID -> Desktop app -> Create
3. Copy client_id and client_secret

## Step-by-Step

### 1. Install gog

```bash
which gog || (brew install gogcli && ln -sf /home/linuxbrew/.linuxbrew/bin/gog /usr/local/bin/gog)
```

### 2. Write OAuth credentials

```bash
mkdir -p ~/.config/gogcli
cat > ~/.config/gogcli/google-oauth-client.json << 'EOF'
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

### 3. Set up gog keyring and credentials

```bash
export GOG_KEYRING_PASSWORD=$(openssl rand -hex 16)
echo "Save this: $GOG_KEYRING_PASSWORD"
gog auth credentials set ~/.config/gogcli/google-oauth-client.json
```

### 4. Authenticate Gmail account

```bash
gog auth add <EMAIL> --manual --force-consent
```

Shows a URL -> user opens in browser -> authorizes -> gets redirected to `localhost:...?code=...` -> paste the FULL redirect URL back.

Verify: `gog gmail search "in:inbox" --account <EMAIL> --limit 1`

### 5. Enable APIs

```bash
gcloud services enable gmail.googleapis.com pubsub.googleapis.com --project <PROJECT_ID>
```

### 6. Run openclaw gmail setup

```bash
openclaw webhooks gmail setup \
  --account <EMAIL> \
  --project <PROJECT_ID> \
  --port <PORT> \
  --push-endpoint "https://<HOOKS_DOMAIN>/<HOOK_NAME>/gmail-pubsub?token=<PUSH_TOKEN>" \
  --hook-url "http://127.0.0.1:18789/hooks/<HOOK_NAME>" \
  --hook-token <HOOK_TOKEN> \
  --tailscale off --include-body --max-bytes 20000
```

### 7. Create systemd service

```bash
cat > /etc/systemd/system/gmail-watch-<NAME>.service << EOF
[Unit]
Description=Gmail Watch (<EMAIL>)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/env HOME=/root XDG_CONFIG_HOME=/root/.config GOG_KEYRING_PASSWORD=<KEYRING_PW> /usr/bin/openclaw webhooks gmail run --account <EMAIL> --bind 127.0.0.1 --port <PORT> --path /gmail-pubsub --label INBOX --topic projects/<PROJECT_ID>/topics/gog-gmail-watch-<NAME> --subscription gog-gmail-watch-push-<NAME> --push-token <PUSH_TOKEN> --hook-url http://127.0.0.1:18789/hooks/gmail-<NAME> --hook-token <HOOK_TOKEN> --include-body --max-bytes 20000 --tailscale off
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now gmail-watch-<NAME>
```

## Troubleshooting

| Error | Fix |
|-------|-----|
| `gog: command not found` | `brew install gogcli && ln -sf /home/linuxbrew/.linuxbrew/bin/gog /usr/local/bin/gog` |
| `Running Homebrew as root` | Fix wrapper: `printf '#!/bin/bash\ncd /tmp\nexec sudo -u linuxbrew /home/linuxbrew/.linuxbrew/bin/brew "$@"' > /usr/local/bin/brew && chmod +x /usr/local/bin/brew` |
| `redirect_uri_mismatch` | OAuth credentials must be "Desktop app" type, not "Web app" |
| `PERMISSION_DENIED` on Pub/Sub | `gcloud services enable gmail.googleapis.com pubsub.googleapis.com` |
| `invalid_grant` | `gog auth add <EMAIL> --manual --force-consent` |
| `Error 400` on gcloud auth | Run `--remote-bootstrap` command in LOCAL terminal, don't open URL in browser |
| Service crash loop | `journalctl -u gmail-watch-<NAME> -n 30 --no-pager` |
