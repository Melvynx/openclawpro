# Cloudflare Tunnel & Dashboard

Expose OpenClaw services on public subdomains via Cloudflare Tunnel without opening any ports.

## How It Works

```
Internet --> Cloudflare Edge --> cloudflared tunnel --> localhost:<port>
```

Cloudflare Tunnel creates an outbound-only connection from the VPS to Cloudflare's edge. No inbound ports needed. Each service gets a subdomain routed through the tunnel's ingress config.

## Initial Tunnel Setup

```bash
npx openclaw-vps add cloudflare
```

This creates the tunnel, installs `cloudflared` as a systemd service, and configures DNS.

## Exposing a New Service

To add a new subdomain route (e.g., expose the OpenClaw dashboard):

### 1. Get API credentials

| Item | How to get it |
|------|---------------|
| Cloudflare API Token | `https://dash.cloudflare.com/<account>/api-tokens` - needs **Cloudflare Tunnel: Edit** + **DNS: Edit** |
| Account ID | From tunnel JWT or Cloudflare dashboard |
| Tunnel ID | `cloudflared tunnel list` or from the JWT |
| Zone ID | Cloudflare dashboard -> domain -> Overview -> right sidebar |

### 2. Get current tunnel config

```bash
CF_TOKEN="<api-token>"
ACCOUNT_ID="<account-id>"
TUNNEL_ID="<tunnel-id>"

curl -s "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/cfd_tunnel/$TUNNEL_ID/configurations" \
  -H "Authorization: Bearer $CF_TOKEN"
```

### 3. Add ingress rule

PUT the full config with the new rule prepended before the catch-all:

```bash
SUBDOMAIN="my-service"
DOMAIN="example.com"

curl -s -X PUT \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/cfd_tunnel/$TUNNEL_ID/configurations" \
  -H "Authorization: Bearer $CF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "config": {
      "ingress": [
        ... existing rules ...,
        {"hostname": "'$SUBDOMAIN'.'$DOMAIN'", "service": "http://localhost:<PORT>"},
        {"service": "http_status:404"}
      ]
    }
  }'
```

The catch-all `http_status:404` must always be the last rule.

### 4. Create DNS CNAME

```bash
ZONE_ID="<zone-id>"

curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $CF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "CNAME",
    "name": "'$SUBDOMAIN'",
    "content": "'$TUNNEL_ID'.cfargotunnel.com",
    "proxied": true
  }'
```

### 5. Verify

```bash
curl -s -o /dev/null -w "%{http_code}" --max-time 10 "https://$SUBDOMAIN.$DOMAIN/"
```

## Exposing the OpenClaw Dashboard

The gateway Control UI runs on port `18789` by default.

After adding the tunnel route (steps above), configure the gateway:

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

- `allowedOrigins` - required for non-localhost access
- `allowInsecureAuth` - needed because Cloudflare terminates TLS but forwards HTTP to the tunnel

Restart the gateway:

```bash
systemctl restart openclaw-gateway
```

On first connection from a new device, approve pairing:

```bash
openclaw devices list
openclaw devices approve <requestId>
```

Access via: `https://<subdomain>.<domain>/#token=<gateway-auth-token>`

The token is per-tab (stored in `sessionStorage`).

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `origin not allowed` | Check `controlUi.allowedOrigins` matches exactly (with `https://`) |
| `pairing required` (1008) | `openclaw devices list` + `openclaw devices approve <id>` |
| DNS not resolving | Wait 1-2 min, verify: `dig <subdomain>.<domain> +short` |
| Tunnel not connecting | `systemctl status cloudflared`, check token in service file |
