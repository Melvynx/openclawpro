# ClawPro VPS Setup

One-command setup for OpenClaw on a fresh VPS. Runs natively (no Docker).

## Quick Start

```bash
curl -fsSL https://raw.githubusercontent.com/Melvynx/clawpro-vps-setup/main/setup.sh | bash
```

## What it installs

| Component | Details |
|-----------|---------|
| OpenClaw | `npm install -g openclaw` |
| Node.js 22 | Via NodeSource |
| Bun | Bun runtime |
| GitHub CLI | `gh` |
| Claude Code | Via official installer |
| Cloudflared | Cloudflare Tunnel daemon |
| Google Cloud CLI | For Gmail setup |
| UFW + Fail2ban | Firewall + SSH protection |
| Systemd service | OpenClaw gateway auto-starts |

## After Setup

```bash
# 1. Reload shell
source ~/.bashrc

# 2. Authenticate
gh auth login
claude login

# 3. Setup Gmail notifications (optional)
# See GMAIL-SETUP.md

# 4. Access from your laptop
ssh -L 18789:127.0.0.1:18789 root@YOUR_VPS_IP
# Open: http://localhost:18789
```

## Aliases

| Alias | Description |
|-------|-------------|
| `oc` | `openclaw` |
| `oc-logs` | Follow gateway logs |
| `oc-restart` | Restart gateway |
| `oc-start` | Start gateway |
| `oc-stop` | Stop gateway |
| `oc-status` | Gateway status |

## Files Created

| Path | Description |
|------|-------------|
| `/root/.openclaw/` | OpenClaw config dir |
| `/root/.openclaw/workspace/` | Agent workspace |
| `/root/.openclaw/openclaw.json` | Main config |
| `/root/.config/systemd/user/openclaw-gateway.service` | Systemd service |
| `/usr/local/bin/claude-run` | Claude sandbox wrapper |

## Documentation

- [GUIDE.md](GUIDE.md) — Detailed step-by-step guide
- [GMAIL-SETUP.md](GMAIL-SETUP.md) — Gmail notifications via Cloudflare Tunnel
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — Common issues and fixes
- [config-example.json](config-example.json) — Example OpenClaw config
