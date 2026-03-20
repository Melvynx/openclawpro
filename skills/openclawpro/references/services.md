# Services & Webhooks

## Systemd Services

OpenClaw runs as a set of systemd services. Some run at system level, some at user level.

### Core Services

| Service | Level | Purpose |
|---------|-------|---------|
| `cloudflared` | system | Cloudflare Tunnel (exposes services) |
| `openclaw-gateway` | system or user | Main gateway - Telegram bot, agents, hooks |
| `openclaw-hooks-proxy` | system | Auth injection for external webhooks |
| `openclaw-gmail-dedup` | system | Dedup proxy for Gmail notifications |

### Per-Account Services

| Service | Purpose |
|---------|---------|
| `gmail-watch-<name>` | Gmail Pub/Sub watcher for one email account |
| `openclaw-<name>-webhook` | Custom webhook receiver |

### Common Commands

```bash
# Status
systemctl status <service> --no-pager -l
systemctl --user status <service> --no-pager -l

# Restart
systemctl restart <service>
systemctl --user restart <service>

# Logs
journalctl -u <service> -n 50 --no-pager
journalctl -u <service> -f  # follow live

# Enable on boot
systemctl enable <service>
```

### All-in-one status check

```bash
npx openclaw-vps status
```

## Webhooks

### Adding a Webhook

```bash
npx openclaw-vps add webhook --name <name> --url <source-url> --channel telegram --target <CHAT_ID>
```

This creates:
- A systemd service to receive webhook payloads
- An ingress rule in the Cloudflare Tunnel
- A DNS record for the webhook subdomain
- Gateway hook configuration to process and forward to the channel

### How Webhooks Flow

```
External Service --> Cloudflare Tunnel --> hooks-proxy (auth) --> Gateway --> AI Processing --> Channel
```

The hooks proxy injects the gateway auth token so external services don't need to know it.

### Common Webhook Sources

- **GitHub** - Push, PR, issue events
- **Stripe** - Payment, subscription events
- **Codeline** - Order, enrollment events
- Any service that supports webhook URLs

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `203/EXEC` in systemd | Node.js symlink missing: `ln -sf $(which node) /usr/bin/node` |
| Service not starting | Check logs: `journalctl -u <service> -n 50 --no-pager` |
| Service keeps restarting | Check `RestartSec` and error in logs |
| Gateway port conflict | Check with `ss -tlnp \| grep 18789` |
| Webhook not receiving | Verify tunnel ingress, DNS, and hooks-proxy status |
