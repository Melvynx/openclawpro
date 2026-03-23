---
name: openclawpro
description: Setup and manage an OpenClaw VPS - Gmail notifications, Cloudflare tunnel, api2cli, services. Use when asked to setup OpenClaw, add Gmail, configure Cloudflare, create CLIs, or manage VPS infrastructure.
---

# OpenClaw Pro

## References

Load the right file based on what the user needs:

| File | Use when |
|------|----------|
| `references/setup-gmail.md` | Adding a Gmail account, fixing Gmail notifications, anything Gmail/Pub/Sub |
| `references/cloudflare.md` | Tunnel setup, adding routes, exposing dashboard, DNS |
| `references/base-setup.md` | Initial VPS setup, Node.js, brew, security hardening |
| `references/api2cli.md` | Creating CLIs from REST APIs |
| `references/services.md` | Managing systemd services, webhooks |

## Quick Commands

```bash
# Gateway
openclaw gateway status
openclaw doctor
systemctl status openclaw-gateway

# Gmail watchers (use gog directly, NOT openclaw webhooks)
systemctl list-units --type=service | grep gog-gmail
systemctl restart gog-gmail-<label>
journalctl -u gog-gmail-<label> -f

# Skills
npx openclaw-vps@latest install skills

# Tunnel
systemctl status cloudflared
```

## Critical Rules

- **Gmail**: Use `gog gmail watch serve` directly. NEVER use `openclaw webhooks gmail run/setup`.
- **Gmail hooks**: `deliver: true` is MANDATORY. Agent reply = notification. `NO_REPLY` = silence.
- **Pub/Sub**: `gmail-api-push@system.gserviceaccount.com` IAM binding on topic is required or pushes silently fail.
- **Cloudflare**: Token-based tunnel. Routes managed via dashboard/API, no local config file. Catch-all must be last.
- **gog in systemd**: Needs `GOG_KEYRING_PASSWORD` env var and full binary path `/home/linuxbrew/.linuxbrew/bin/gog`.
