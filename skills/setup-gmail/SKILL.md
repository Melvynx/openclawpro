---
name: setup-gmail
description: Guide the user through setting up Gmail notifications on an OpenClaw VPS. Handles gcloud auth, OAuth credentials, gog authentication, Pub/Sub, and the openclaw-vps CLI. Use when the user asks to add Gmail, setup email notifications, fix gcloud auth errors, or troubleshoot Gmail setup on their VPS.
---

# Setup Gmail on OpenClaw VPS

Step-by-step guide for adding Gmail notifications to an OpenClaw VPS. This skill handles the tricky auth flows that the CLI can't fully automate.

## Prerequisites

Before starting, verify:

```bash
which gcloud && which openclaw && which cloudflared && systemctl status openclaw-gateway --no-pager
```

If `gcloud` is missing, install it:
```bash
curl https://sdk.cloud.google.com | bash -s -- --disable-prompts
ln -sf ~/google-cloud-sdk/bin/gcloud /usr/local/bin/gcloud
```

## Workflow

### Step 1: gcloud Authentication (the tricky part)

On a headless VPS, `gcloud auth login --no-browser` uses a two-machine flow:

1. Run on VPS:
```bash
gcloud auth login --no-browser
```

2. It outputs a long `gcloud auth login --remote-bootstrap="https://accounts.google.com/..."` command

3. **The user must run that exact command on their LOCAL machine** (where they have a browser and gcloud installed). NOT open the URL in a browser — run the full command in a local terminal.

4. The local gcloud opens a browser for Google login, then outputs a long URL starting with `https://localhost:...`

5. The user copies that full output URL and pastes it back into the VPS terminal.

**Common errors:**
- `Error 400: invalid_request` / `GeneralOAuthFlow` → User opened the URL in a browser instead of running the `gcloud auth login --remote-bootstrap=...` command locally
- `gcloud not found` on local machine → Install gcloud locally first: https://cloud.google.com/sdk/docs/install
- Version mismatch → Local gcloud must be >= 372.0.0. Run `gcloud components update` locally.

After auth:
```bash
gcloud auth list
gcloud config set project <PROJECT_ID>
```

### Step 2: Enable APIs

```bash
PROJECT_ID=$(gcloud config get project)
gcloud services enable gmail.googleapis.com --project $PROJECT_ID
gcloud services enable pubsub.googleapis.com --project $PROJECT_ID
```

### Step 3: OAuth Credentials for gog

gog (Gmail OAuth helper) needs its own OAuth Desktop App credentials, separate from gcloud.

Check if they already exist:
```bash
ls ~/.config/gogcli/google-oauth-client.json 2>/dev/null || echo "NOT FOUND"
```

If not found, guide the user:

1. Open: `https://console.cloud.google.com/apis/credentials?project=<PROJECT_ID>`
2. Click **"+ CREATE CREDENTIALS"** → **"OAuth client ID"**
3. If prompted for consent screen: select **External**, fill app name ("OpenClaw Gmail"), support email, and save
4. Application type: **Desktop app**
5. Name: **OpenClaw Gmail**
6. Click **Create** → **Download JSON**
7. Upload to VPS:
```bash
mkdir -p ~/.config/gogcli
# From local machine:
scp ~/Downloads/client_secret_*.json root@<VPS_IP>:~/.config/gogcli/google-oauth-client.json
```

### Step 4: Authenticate gog

```bash
# Set a keyring password (save this!)
export GOG_KEYRING_PASSWORD=$(openssl rand -hex 16)
echo "GOG_KEYRING_PASSWORD=$GOG_KEYRING_PASSWORD" # Save this value!

gog auth credentials set ~/.config/gogcli/google-oauth-client.json
gog auth add <EMAIL> --manual --force-consent
```

The `--manual` flag shows a URL. The user opens it in their browser, authorizes, then gets redirected to `localhost:something?code=...`. They paste the FULL redirect URL (even though localhost doesn't load — the URL itself contains the auth code).

Verify:
```bash
gog gmail search "in:inbox" --account <EMAIL> --limit 1
```

### Step 5: Run the CLI

Once gcloud and gog are authenticated, the CLI handles the rest:

```bash
npx openclaw-vps add gmail -e <EMAIL> --channel telegram --target <TELEGRAM_CHAT_ID>
```

The CLI will skip steps 2-5 (gcloud auth, OAuth, gog auth) if they detect everything is already configured.

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `Error 400: invalid_request` / `GeneralOAuthFlow` | Opened URL in browser instead of running command locally | Run the full `gcloud auth login --remote-bootstrap=...` command in a LOCAL terminal |
| `gog auth add` shows `redirect_uri_mismatch` | OAuth credentials are "Web app" type, not "Desktop app" | Delete and recreate as Desktop app in GCP console |
| `PERMISSION_DENIED` on Pub/Sub | Gmail API or Pub/Sub API not enabled | `gcloud services enable gmail.googleapis.com pubsub.googleapis.com` |
| `invalid_grant` on gog | Token expired or revoked | `gog auth add <EMAIL> --manual --force-consent` again |
| `Running Homebrew as root` | brew called as root without wrapper | `printf '#!/bin/bash\nexec sudo -u linuxbrew /home/linuxbrew/.linuxbrew/bin/brew "$@"' > /usr/local/bin/brew && chmod +x /usr/local/bin/brew` |
| Service crash loop | Check logs | `journalctl -u gmail-watch-<name> -n 30 --no-pager` |
