---
name: openclawpro
description: All-in-one reference for setting up and managing an OpenClaw VPS. Covers initial setup, Gmail notifications, Cloudflare dashboard, api2cli tool creation, Claude Code skills/settings installation, webhooks, and service management. Use when the user asks to setup OpenClaw, configure a VPS, add services, install CLIs, create skills, or manage their OpenClaw infrastructure.
---

# OpenClaw Pro

Complete guide for setting up and operating an OpenClaw VPS with all services, CLIs, and skills.

## Setup Flow

A full OpenClaw VPS setup follows this order:

1. **Base install** - Node.js, openclaw, cloudflared, security
2. **Gmail notifications** - gcloud, gog, Pub/Sub, gmail-watch services
3. **Cloudflare dashboard** - Expose Control UI on a public subdomain
4. **API CLIs** - Create CLIs from any REST API with api2cli
5. **Claude Code skills** - Install skills for the agent
6. **Webhooks** - Connect external services (Codeline, Stripe, GitHub...)

## Reference Files

Load these as needed based on the user's request:

| File | When to load |
|------|-------------|
| `references/base-setup.md` | Initial VPS setup, Node.js, openclaw install |
| `references/gmail.md` | Gmail notifications, gcloud auth, gog setup |
| `references/cloudflare.md` | Cloudflare Tunnel, dashboard, DNS routing |
| `references/api2cli.md` | Creating CLIs from REST APIs, linking skills |
| `references/claude-code.md` | Claude Code skills, settings, agents config |
| `references/services.md` | Systemd services, webhooks, monitoring |

## Quick Commands

```bash
npx openclaw-vps setup              # Full wizard
npx openclaw-vps status             # Check all services
npx openclaw-vps add gmail          # Add Gmail account
npx openclaw-vps add webhook        # Add external webhook
npx openclaw-vps add cloudflare     # Setup Cloudflare Tunnel
npx openclaw-vps add security       # Apply security hardening
openclaw gateway status             # Gateway status
openclaw configure                  # Interactive config wizard
```
