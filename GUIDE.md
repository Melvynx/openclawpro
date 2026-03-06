# ClawPro Setup Guide

Detailed walkthrough for running OpenClaw natively on a VPS (no Docker).

---

## Prerequisites

- Fresh Ubuntu 22.04+ or Debian 12+ VPS (Hetzner CX22 ~$5/month works well)
- SSH root access
- Domain name (optional, for Cloudflare Tunnel + Gmail webhooks)

---

## 1. Quick Install

One command does everything:

```bash
curl -fsSL https://raw.githubusercontent.com/Melvynx/clawpro-vps-setup/main/setup.sh | bash
```

Then reload your shell:

```bash
source ~/.bashrc
```

---

## 2. Manual Install (step by step)

If you prefer to understand each step or need to debug.

### 2.1 System packages

```bash
apt-get update
apt-get install -y git curl ca-certificates jq ufw fail2ban unattended-upgrades apt-transport-https gnupg lsb-release
```

### 2.2 Node.js 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
node -v  # should be v22.x
```

### 2.3 OpenClaw

```bash
npm install -g openclaw
openclaw --version
```

### 2.4 GitHub CLI

```bash
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
  | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
  | tee /etc/apt/sources.list.d/github-cli.list
apt-get update && apt-get install -y gh
```

### 2.5 Claude Code

```bash
curl -fsSL https://claude.ai/install.sh | bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
export PATH="$HOME/.local/bin:$PATH"
claude --version
```

### 2.6 Bun

```bash
curl -fsSL https://bun.sh/install | bash
echo 'export BUN_INSTALL="$HOME/.bun"' >> ~/.bashrc
echo 'export PATH="$BUN_INSTALL/bin:$PATH"' >> ~/.bashrc
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
```

### 2.7 Cloudflared

```bash
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
  | tee /usr/share/keyrings/cloudflare-main.gpg > /dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" \
  | tee /etc/apt/sources.list.d/cloudflared.list
apt-get update && apt-get install -y cloudflared
```

### 2.8 Google Cloud CLI

```bash
echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" \
  | tee /etc/apt/sources.list.d/google-cloud-sdk.list
curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg \
  | gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg
apt-get update && apt-get install -y google-cloud-cli
```

---

## 3. Security Hardening

### UFW firewall

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw --force enable
ufw status
```

### Fail2ban

```bash
systemctl enable fail2ban
systemctl start fail2ban
```

### SSH hardening

```bash
cat > /etc/ssh/sshd_config.d/hardening.conf << 'EOF'
PasswordAuthentication no
PermitRootLogin prohibit-password
MaxAuthTries 3
X11Forwarding no
AllowAgentForwarding no
EOF

systemctl reload sshd
```

> **Important:** Make sure your SSH key is set up before disabling password auth.

### Unattended security upgrades

```bash
cat > /etc/apt/apt.conf.d/20auto-upgrades << 'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
EOF
```

---

## 4. OpenClaw Configuration

### Workspace directories

```bash
mkdir -p /root/.openclaw/workspace /root/.openclaw/gogcli
```

### Run onboarding

```bash
openclaw onboard
```

This sets your gateway token, Telegram bot, channels, etc.

### Systemd service

The setup script creates `/root/.config/systemd/user/openclaw-gateway.service`. To manage it:

```bash
export XDG_RUNTIME_DIR="/run/user/0"

# Enable auto-start
systemctl --user enable openclaw-gateway

# Start now
systemctl --user start openclaw-gateway

# Check status
systemctl --user status openclaw-gateway

# View logs
journalctl --user -u openclaw-gateway -f
```

### claude-run wrapper

`/usr/local/bin/claude-run` runs Claude Code in sandbox mode:

```bash
claude-run "Review this PR and summarize changes"
```

Equivalent to `IS_SANDBOX=1 claude --dangerously-skip-permissions`.

---

## 5. Cloudflare Tunnel Setup

Cloudflare Tunnel exposes your webhook endpoint to the internet without opening firewall ports. Required for Gmail Pub/Sub notifications.

### Prerequisites

- Cloudflare account with your domain
- API token with "Edit DNS" and "Cloudflare Tunnel" permissions

### Create the tunnel

```bash
# Login to Cloudflare
cloudflared tunnel login

# Create tunnel
cloudflared tunnel create openclaw

# Note the tunnel ID from output
TUNNEL_ID=$(cloudflared tunnel list --output json | jq -r '.[] | select(.name=="openclaw") | .id')
echo "Tunnel ID: $TUNNEL_ID"
```

### Configure the tunnel

```bash
mkdir -p /etc/cloudflared

cat > /etc/cloudflared/config.yml << EOF
tunnel: ${TUNNEL_ID}
credentials-file: /root/.cloudflared/${TUNNEL_ID}.json

ingress:
  - hostname: hooks.YOUR_DOMAIN.com
    service: http://localhost:18800
  - service: http_status:404
EOF
```

### Create DNS record

```bash
cloudflared tunnel route dns openclaw hooks.YOUR_DOMAIN.com
```

### Start as system service

```bash
cloudflared service install
systemctl enable cloudflared
systemctl start cloudflared
systemctl status cloudflared
```

### Verify

```bash
curl https://hooks.YOUR_DOMAIN.com
# Should get 404 (tunnel is working, no route matched)
```

---

## 6. Gmail Setup

See [GMAIL-SETUP.md](GMAIL-SETUP.md) for the complete Gmail → Pub/Sub → Cloudflare Tunnel → OpenClaw flow.

---

## 7. Pro Activation (AIBlueprint)

```bash
npx aiblueprint-cli@latest openclaw pro activate YOUR_KEY
npx aiblueprint-cli openclaw pro setup
```

---

## 8. Monitoring & Maintenance

### Useful commands

```bash
# Gateway status
systemctl --user status openclaw-gateway

# Live logs
journalctl --user -u openclaw-gateway -f

# Restart gateway
systemctl --user restart openclaw-gateway

# Check CloudFlared tunnel
systemctl status cloudflared
journalctl -u cloudflared -f

# OpenClaw health check
openclaw doctor
```

### Update OpenClaw

```bash
npm install -g openclaw
systemctl --user restart openclaw-gateway
```

### Key file locations

| Path | Description |
|------|-------------|
| `/root/.openclaw/openclaw.json` | Main config |
| `/root/.openclaw/workspace/` | Agent workspace |
| `/root/.openclaw/gogcli/` | Gmail credentials |
| `/root/.config/systemd/user/openclaw-gateway.service` | Systemd service |
| `/etc/cloudflared/config.yml` | Tunnel config |
| `/usr/local/bin/claude-run` | Claude sandbox wrapper |
