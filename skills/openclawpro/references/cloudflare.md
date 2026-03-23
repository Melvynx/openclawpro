# Cloudflare Tunnel & Dashboard

Expose OpenClaw services on public subdomains via Cloudflare Tunnel without opening any ports.

## How It Works

```
Internet -> Cloudflare Edge -> cloudflared tunnel -> localhost:<port>
```

Cloudflare Tunnel creates an outbound-only connection from the VPS to Cloudflare's edge. No inbound ports needed.

## Tunnel Types

### Token-based (recommended - dashboard-managed)

The tunnel runs with a JWT token. Routes are managed in the Cloudflare dashboard or via API. No local config file needed.

```bash
# Service runs with:
cloudflared --no-autoupdate tunnel run --token <JWT_TOKEN>

# Routes managed in:
# Dashboard: Networks -> Connectors -> your connector -> Routes
# Or via API (see below)
```

### Config-file based (legacy)

Uses a local `/etc/cloudflared/config.yml`. Less flexible - requires restart to change routes.

## Setup (Token-based)

### 1. Install cloudflared

```bash
apt install -y cloudflared
```

Or direct download:
```bash
curl -L -o /usr/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
chmod +x /usr/bin/cloudflared
```

### 2. Create a connector in Cloudflare Dashboard

Go to **Networks > Connectors** in the Cloudflare dashboard. Click "Add a connector" > Cloudflared > select Debian 64-bit > copy the install command (contains the token).

### 3. Install as systemd service

```bash
cloudflared service install <TOKEN>
```

This creates `/etc/systemd/system/cloudflared.service` with the token embedded.

### 4. Add public hostname routes

**Via Dashboard:** Networks > Connectors > click your connector > Routes > Add a route > Public hostname:
- **Subdomain**: e.g. `gmail-dev`
- **Domain**: e.g. `mlvcdn.com`
- **Service type**: HTTP
- **Service URL**: `localhost:<PORT>`

No restart needed - routes propagate automatically.

**Via API:** See "Managing Routes via API" below.

## Managing Routes via API

### Get current tunnel config

```bash
CF_TOKEN="<api-token>"
ACCOUNT_ID="<account-id>"
TUNNEL_ID="<tunnel-id>"

curl -s "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/cfd_tunnel/$TUNNEL_ID/configurations" \
  -H "Authorization: Bearer $CF_TOKEN"
```

### Add ingress rule

PUT the full config with the new rule prepended before the catch-all `http_status:404`:

```bash
curl -s -X PUT \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/cfd_tunnel/$TUNNEL_ID/configurations" \
  -H "Authorization: Bearer $CF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "config": {
      "ingress": [
        <EXISTING_RULES>,
        {"hostname": "<subdomain>.<domain>", "service": "http://localhost:<PORT>"},
        {"service": "http_status:404"}
      ]
    }
  }'
```

IMPORTANT: The catch-all `http_status:404` must always be last. Preserve all existing rules.

### Create DNS CNAME

```bash
ZONE_ID="<zone-id>"

curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $CF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "CNAME",
    "name": "<subdomain>",
    "content": "<tunnel-id>.cfargotunnel.com",
    "proxied": true
  }'
```

## Exposing the OpenClaw Dashboard

The gateway Control UI runs on port `18789` by default.

After adding the route (subdomain -> `localhost:18789`), configure the gateway:

Edit `~/.openclaw/openclaw.json`:

```json
{
  "gateway": {
    "controlUi": {
      "allowedOrigins": ["https://<subdomain>.<domain>"],
      "allowInsecureAuth": true
    }
  }
}
```

Restart the gateway:

```bash
systemctl restart openclaw-gateway
```

Approve device pairing on first connection:

```bash
openclaw devices list
openclaw devices approve <requestId>
```

Access: `https://<subdomain>.<domain>/#token=<gateway-auth-token>`

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `origin not allowed` | Check `controlUi.allowedOrigins` matches exactly (with `https://`) |
| `pairing required` (1008) | `openclaw devices list` + `openclaw devices approve <id>` |
| DNS not resolving | Wait 1-2 min, verify: `dig <subdomain>.<domain> +short` |
| Tunnel not connecting | `systemctl status cloudflared`, check token in service file |
| Routes not updating | For token-based tunnels, routes propagate automatically via dashboard. No restart needed. |
