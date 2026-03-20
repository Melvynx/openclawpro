# Base VPS Setup

## Full Automated Setup

```bash
npx openclaw-vps setup
```

The wizard handles everything: Node.js, openclaw, cloudflared, security hardening, and gateway service creation.

## Manual Setup

### Node.js (via nvm)

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install --lts
```

Systemd can't find nvm-installed Node.js. Create a symlink:

```bash
ln -sf "$(which node)" /usr/bin/node
```

### OpenClaw + tools

```bash
npm i -g openclaw api2cli
openclaw configure
```

### Cloudflared

```bash
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" | tee /etc/apt/sources.list.d/cloudflared.list
apt update && apt install -y cloudflared
```

### Security Hardening

```bash
npx openclaw-vps add security
```

This configures:
- **UFW** - Firewall allowing only SSH + Cloudflare IPs
- **fail2ban** - Brute-force protection
- **SSH** - Key-only auth, root password disabled
- **unattended-upgrades** - Auto security patches

## Key Paths

| Path | Purpose |
|------|---------|
| `~/.openclaw/openclaw.json` | Main OpenClaw config |
| `~/.openclaw/workspace/` | Agent workspaces |
| `~/.config/gogcli/` | gog OAuth credentials |
| `~/.claude/skills/` | Claude Code skills |
| `~/.claude/settings.json` | Claude Code settings |
| `/etc/systemd/system/` | System-level services |
