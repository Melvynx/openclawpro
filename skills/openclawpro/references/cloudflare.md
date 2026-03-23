# Cloudflare Tunnel

Expose OpenClaw services via Cloudflare Tunnel. No inbound ports needed.

## Setup

1. Install: `apt install -y cloudflared`
2. Dashboard: Networks > Connectors > Add connector > Cloudflared > copy install command
3. Install service: `cloudflared service install <TOKEN>`

Token-based tunnel. Routes managed in dashboard or via API. No restart needed for route changes.

## Add a Route

**Dashboard:** Networks > Connectors > your connector > Routes > Add route > Public hostname.

**API:**

```bash
# Get current config
curl -s "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/cfd_tunnel/$TUNNEL_ID/configurations" \
  -H "Authorization: Bearer $CF_TOKEN"

# PUT full config with new rule BEFORE catch-all
curl -s -X PUT \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/cfd_tunnel/$TUNNEL_ID/configurations" \
  -H "Authorization: Bearer $CF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"config":{"ingress":[<EXISTING_RULES>,{"hostname":"<sub>.<domain>","service":"http://localhost:<PORT>"},{"service":"http_status:404"}]}}'

# Create DNS CNAME
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $CF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"CNAME","name":"<sub>","content":"'$TUNNEL_ID'.cfargotunnel.com","proxied":true}'
```

Catch-all `http_status:404` MUST always be last. Preserve all existing rules.

## Expose the Dashboard

The gateway runs on port `18789`. After adding a route:

1. Edit `~/.openclaw/openclaw.json`:
```json
{"gateway":{"controlUi":{"allowedOrigins":["https://<sub>.<domain>"],"allowInsecureAuth":true}}}
```

2. Restart: `systemctl restart openclaw-gateway`

3. Approve pairing: `openclaw devices list` then `openclaw devices approve <id>`

4. Access: `https://<sub>.<domain>/#token=<gateway-auth-token>`

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `origin not allowed` | `allowedOrigins` must match exactly with `https://` |
| `pairing required` (1008) | `openclaw devices list` + approve |
| DNS not resolving | Wait 1-2 min, `dig <sub>.<domain> +short` |
| Tunnel not connecting | `systemctl status cloudflared` |
