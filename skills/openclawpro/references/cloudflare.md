# Cloudflare Tunnel & Dashboard

Expose OpenClaw services on public subdomains via Cloudflare Tunnel without opening any ports.

## How It Works

```
Internet -> Cloudflare Edge -> cloudflared tunnel -> localhost:<port>
```

Cloudflare Tunnel creates an outbound-only connection from the VPS to Cloudflare's edge. No inbound ports needed.

## Setup

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

Go to **Networks > Connectors** in the Cloudflare dashboard. Click "Add a connector" > Cloudflared > select Debian 64-bit > copy the token.

### 3. Install as systemd service

```bash
cloudflared service install <TOKEN>
```

### 4. Add a public hostname route

In the Cloudflare dashboard: **Networks > Connectors** > click your connector > **Routes** tab > "Add a route" > "Public hostname":

- **Subdomain**: e.g. `testclaw`
- **Domain**: e.g. `mlvcdn.com`
- **Service type**: HTTP
- **Service URL**: `localhost:<PORT>` (e.g. `localhost:18800` for hooks proxy)

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

## API Management (alternative to dashboard UI)

If you have a Cloudflare API token, you can manage routes programmatically:

```bash
CF_TOKEN="<api-token>"
ACCOUNT_ID="<account-id>"
TUNNEL_ID="<tunnel-id>"

# Get current config
curl -s "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/cfd_tunnel/$TUNNEL_ID/configurations" \
  -H "Authorization: Bearer $CF_TOKEN"

# Add ingress rule (PUT full config, new rule before catch-all)
# Add DNS CNAME
ZONE_ID="<zone-id>"
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $CF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"CNAME","name":"<subdomain>","content":"<tunnel-id>.cfargotunnel.com","proxied":true}'
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `origin not allowed` | Check `controlUi.allowedOrigins` matches exactly (with `https://`) |
| `pairing required` (1008) | `openclaw devices list` + `openclaw devices approve <id>` |
| DNS not resolving | Wait 1-2 min, verify: `dig <subdomain>.<domain> +short` |
| Tunnel not connecting | `systemctl status cloudflared`, check token in service file |
