# Gmail Notifications Setup

Real-time Gmail monitoring with AI-powered notifications via Telegram/Discord.

## How It Works

Gmail Pub/Sub pushes new emails to a local watcher service. The watcher forwards them to the OpenClaw gateway, which processes them with an AI agent and sends a summary to the configured channel (Telegram, Discord, etc.).

```
Gmail --> Google Pub/Sub --> gmail-watch service --> OpenClaw Gateway --> Telegram/Discord
```

## Prerequisites

- Google Cloud project with billing enabled
- `gcloud` CLI installed
- `gog` (Gmail OAuth helper) installed via Homebrew

## Step-by-Step

### 1. Install gcloud

```bash
curl https://sdk.cloud.google.com | bash -s -- --disable-prompts
ln -sf ~/google-cloud-sdk/bin/gcloud /usr/local/bin/gcloud
```

### 2. Authenticate gcloud (headless VPS)

On a headless server, use the two-machine flow:

```bash
gcloud auth login --no-browser
```

This outputs a `gcloud auth login --remote-bootstrap="https://accounts.google.com/..."` command.

**The user must run that exact command on their LOCAL machine** (where they have a browser and gcloud installed). Do NOT open the URL in a browser - run the full command in a local terminal.

The local gcloud opens a browser for Google login, then outputs a URL starting with `https://localhost:...`. Copy that full URL and paste it back into the VPS terminal.

Then set the project:

```bash
gcloud auth list
gcloud config set project <PROJECT_ID>
```

### 3. Enable APIs

```bash
PROJECT_ID=$(gcloud config get project)
gcloud services enable gmail.googleapis.com --project $PROJECT_ID
gcloud services enable pubsub.googleapis.com --project $PROJECT_ID
```

### 4. Create OAuth Desktop App Credentials

gog needs its own OAuth Desktop App credentials (separate from gcloud):

1. Open `https://console.cloud.google.com/apis/credentials?project=<PROJECT_ID>`
2. Click **"+ CREATE CREDENTIALS"** -> **"OAuth client ID"**
3. If prompted for consent screen: select **External**, fill app name, support email, save
4. Application type: **Desktop app**
5. Click **Create** -> **Download JSON**
6. Upload to VPS:

```bash
mkdir -p ~/.config/gogcli
scp ~/Downloads/client_secret_*.json user@VPS:~/.config/gogcli/google-oauth-client.json
```

### 5. Authenticate gog

```bash
export GOG_KEYRING_PASSWORD=$(openssl rand -hex 16)
echo "GOG_KEYRING_PASSWORD=$GOG_KEYRING_PASSWORD"  # Save this!

gog auth credentials set ~/.config/gogcli/google-oauth-client.json
gog auth add <EMAIL> --manual --force-consent
```

The `--manual` flag shows a URL. Open it in a browser, authorize, then get redirected to `localhost:...?code=...`. Paste the FULL redirect URL back (even though localhost doesn't load - the URL contains the auth code).

Verify:

```bash
gog gmail search "in:inbox" --account <EMAIL> --limit 1
```

### 6. Run the CLI

```bash
npx openclaw-vps add gmail -e <EMAIL> --channel telegram --target <TELEGRAM_CHAT_ID>
```

The CLI creates:
- A Pub/Sub topic + push subscription
- A `gmail-watch-<name>.service` systemd unit
- Gateway hook configuration

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `Error 400: invalid_request` / `GeneralOAuthFlow` | Opened URL in browser instead of running command locally | Run the full `gcloud auth login --remote-bootstrap=...` in a LOCAL terminal |
| `gcloud not found` on local machine | gcloud not installed locally | Install: https://cloud.google.com/sdk/docs/install |
| gcloud version mismatch | Local gcloud too old | `gcloud components update` locally |
| `redirect_uri_mismatch` on gog | OAuth credentials are "Web app" type | Delete and recreate as "Desktop app" in GCP console |
| `PERMISSION_DENIED` on Pub/Sub | APIs not enabled | `gcloud services enable gmail.googleapis.com pubsub.googleapis.com` |
| `invalid_grant` on gog | Token expired or revoked | `gog auth add <EMAIL> --manual --force-consent` |
| `Running Homebrew as root` | brew called as root | Create wrapper: `printf '#!/bin/bash\nexec sudo -u linuxbrew /home/linuxbrew/.linuxbrew/bin/brew "$@"' > /usr/local/bin/brew && chmod +x /usr/local/bin/brew` |
| Service crash loop | Various | `journalctl -u gmail-watch-<name> -n 30 --no-pager` |
