# Services & Webhooks

## Systemd Services

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

### Commands

```bash
systemctl status <service> --no-pager -l
journalctl -u <service> -n 50 --no-pager
journalctl -u <service> -f              # follow live
systemctl restart <service>
systemctl enable <service>               # start on boot
```

## Webhooks

### How Webhooks Flow

```
External Service -> Cloudflare Tunnel -> hooks-proxy (auth) -> Gateway -> AI Processing -> Channel
```

The hooks proxy (`openclaw-hooks-proxy`) listens on port 18800 and injects the gateway auth token so external services don't need to know it.

### Adding a Webhook Route

1. Add a route in the hooks proxy config
2. Add an ingress rule in the Cloudflare Tunnel (see `references/cloudflare.md`)
3. Add a hook mapping in `~/.openclaw/openclaw.json`
4. Restart the hooks proxy and gateway

### Common Webhook Sources

- **GitHub** - Push, PR, issue events
- **Stripe** - Payment, subscription events
- **Codeline** - Order, enrollment events

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `203/EXEC` in systemd | Node.js symlink missing: `ln -sf $(which node) /usr/bin/node` |
| Service not starting | `journalctl -u <service> -n 50 --no-pager` |
| Gateway port conflict | `ss -tlnp \| grep 18789` |
