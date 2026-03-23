# Services

## Core

| Service | Purpose |
|---------|---------|
| `cloudflared` | Cloudflare Tunnel |
| `openclaw-gateway` | Gateway - agents, hooks, Telegram |

## Per-Account Gmail

| Service | Purpose |
|---------|---------|
| `gog-gmail-<label>` | Gmail watcher for one account |

## Commands

```bash
systemctl status <service> --no-pager
journalctl -u <service> -f
systemctl restart <service>
systemctl enable <service>
```

## Webhooks

```
External Service -> Cloudflare Tunnel -> Gateway /hooks/<path> -> AI -> Telegram
```

Add webhooks by adding a mapping in `~/.openclaw/openclaw.json` under `hooks.mappings[]`, then restart gateway.

Hook mapping must have `deliver: true` for the agent reply to be sent to the channel.
