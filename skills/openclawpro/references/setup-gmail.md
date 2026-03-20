# Setup Gmail Notifications

Add a Gmail account to OpenClaw for real-time AI-powered email notifications.

**Requirements from the user:**
- A Google OAuth **client_id** and **client_secret** (Desktop App type)
- The Gmail address to monitor

If the user doesn't have OAuth credentials yet, guide them:
1. Go to `https://console.cloud.google.com/apis/credentials`
2. Create Credentials -> OAuth client ID -> Desktop app -> Create
3. Copy the client_id and client_secret

## Step 1: Install gog (if missing)

```bash
which gog || (brew install gogcli && ln -sf /home/linuxbrew/.linuxbrew/bin/gog /usr/local/bin/gog)
```

## Step 2: Write OAuth credentials file

Create the credentials file from the user's client_id and client_secret:

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

## Step 3: Set up keyring and credentials in gog

```bash
export GOG_KEYRING_PASSWORD=$(openssl rand -hex 16)
echo "Save this password: $GOG_KEYRING_PASSWORD"

gog auth credentials set ~/.config/gogcli/google-oauth-client.json
```

## Step 4: Authenticate the Gmail account

```bash
gog auth add <EMAIL> --manual --force-consent
```

This prints a URL. The user opens it in their browser, authorizes, gets redirected to `localhost:...?code=...`. They paste the FULL redirect URL back (even though localhost doesn't load - the URL contains the auth code).

Verify:
```bash
gog gmail search "in:inbox" --account <EMAIL> --limit 1
```

## Step 5: Enable Gmail + Pub/Sub APIs

```bash
gcloud services enable gmail.googleapis.com pubsub.googleapis.com --project <PROJECT_ID>
```

If gcloud isn't authenticated yet:
```bash
gcloud auth login --no-browser
```
This is interactive - the user must run the `--remote-bootstrap` command on their LOCAL machine and paste the result back.

## Step 6: Run openclaw gmail setup

```bash
openclaw webhooks gmail setup \
  --account <EMAIL> \
  --project <PROJECT_ID> \
  --port <PORT> \
  --push-endpoint "https://<HOOKS_DOMAIN>/<HOOK_NAME>/gmail-pubsub?token=<PUSH_TOKEN>" \
  --hook-url "http://127.0.0.1:18789/hooks/<HOOK_NAME>" \
  --hook-token <HOOK_TOKEN> \
  --tailscale off \
  --include-body \
  --max-bytes 20000
```

Values to determine:
- `PORT`: next available from 8788 (`ss -tlnp | grep 878`)
- `HOOKS_DOMAIN`: the Cloudflare tunnel domain (e.g. `testclaw.mlvcdn.com`)
- `HOOK_NAME`: `gmail-<short-name>` derived from email
- `PUSH_TOKEN`: `openssl rand -hex 24`
- `HOOK_TOKEN`: from `~/.openclaw/openclaw.json` at `hooks.token`

## Step 7: Create systemd service

```bash
cat > /etc/systemd/system/gmail-watch-<NAME>.service << EOF
[Unit]
Description=Gmail Watch (<EMAIL>)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/env HOME=/root XDG_CONFIG_HOME=/root/.config GOG_KEYRING_PASSWORD=<KEYRING_PASSWORD> /usr/bin/openclaw webhooks gmail run --account <EMAIL> --bind 127.0.0.1 --port <PORT> --path /gmail-pubsub --label INBOX --topic projects/<PROJECT_ID>/topics/gog-gmail-watch-<NAME> --subscription gog-gmail-watch-push-<NAME> --push-token <PUSH_TOKEN> --hook-url http://127.0.0.1:18789/hooks/gmail-<NAME> --hook-token <HOOK_TOKEN> --include-body --max-bytes 20000 --tailscale off
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now gmail-watch-<NAME>
```

## Step 8: Verify

```bash
systemctl status gmail-watch-<NAME> --no-pager
journalctl -u gmail-watch-<NAME> -n 10 --no-pager
```

## Troubleshooting

| Error | Fix |
|-------|-----|
| `gog: command not found` | `brew install gogcli && ln -sf /home/linuxbrew/.linuxbrew/bin/gog /usr/local/bin/gog` |
| `Running Homebrew as root` | `printf '#!/bin/bash\ncd /tmp\nexec sudo -u linuxbrew /home/linuxbrew/.linuxbrew/bin/brew "$@"' > /usr/local/bin/brew && chmod +x /usr/local/bin/brew` |
| `redirect_uri_mismatch` | OAuth credentials must be "Desktop app" type, not "Web app" |
| `PERMISSION_DENIED` on Pub/Sub | `gcloud services enable gmail.googleapis.com pubsub.googleapis.com` |
| `invalid_grant` | Token expired: `gog auth add <EMAIL> --manual --force-consent` |
| `Error 400` on gcloud auth | Run the `--remote-bootstrap` command in a LOCAL terminal, don't open the URL in a browser |
