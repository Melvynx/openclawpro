---
name: openclawpro
description: All-in-one reference for setting up and managing an OpenClaw VPS. Covers initial setup, Gmail notifications, Cloudflare tunnel/dashboard, api2cli tool creation, Claude Code skills/settings, and service management. Use when the user asks to setup OpenClaw, configure a VPS, add Gmail, setup Cloudflare, install CLIs, create skills, or manage their OpenClaw infrastructure.
---

# OpenClaw Pro

Complete guide for setting up and operating an OpenClaw VPS.

## Setup Flow

1. **Base install** - Node.js, openclaw, cloudflared, brew, security
2. **Cloudflare tunnel** - expose services on public subdomains
3. **Cloudflare dashboard** - expose the Control UI
4. **Gmail notifications** - gog, OAuth credentials, Pub/Sub, watch services
5. **API CLIs** - create CLIs from any REST API with api2cli
6. **Claude Code skills** - install skills for the agent

## Reference Files

Load these as needed based on the user's request:

| File | When to load |
|------|-------------|
| `references/base-setup.md` | Initial VPS setup, Node.js, openclaw, brew |
| `references/gmail.md` | Gmail notifications overview |
| `references/setup-gmail.md` | Step-by-step Gmail setup with client_id/secret |
| `references/cloudflare.md` | Cloudflare Tunnel setup and routing |
| `references/setup-cloudflare-dashboard.md` | Step-by-step dashboard exposure |
| `references/api2cli.md` | Creating CLIs from REST APIs |
| `references/claude-code.md` | Claude Code skills, settings, agents |
| `references/services.md` | Systemd services, webhooks, monitoring |

## Quick Reference

```bash
openclaw gateway status              # Gateway status
openclaw configure                   # Interactive config wizard
openclaw webhooks gmail setup        # Setup Gmail watch
openclaw webhooks gmail run          # Run Gmail watcher
openclaw doctor                      # Check health
systemctl status openclaw-gateway    # Gateway service
npx openclawpro install skills       # Install/update Claude Code skills
```
