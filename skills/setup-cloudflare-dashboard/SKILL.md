---
name: setup-cloudflare-dashboard
description: Expose the OpenClaw Control UI (dashboard) on a public subdomain via Cloudflare Tunnel. Automates tunnel ingress, DNS CNAME, gateway controlUi config, and device pairing. Use when the user asks to expose the OpenClaw dashboard, setup dashboard access, add a Cloudflare route for the control UI, or make the gateway UI public.
---

# Setup Cloudflare Dashboard

Expose the OpenClaw Gateway Control UI on a public `<subdomain>.mlvcdn.com` domain via an existing Cloudflare Tunnel.

## Prerequisites

Gather before starting:

| Item | How to get it |
|------|---------------|
| Cloudflare Account API Token | `https://dash.cloudflare.com/<account>/api-tokens` — needs **Cloudflare Tunnel: Edit** + **DNS: Edit** on the target zone |
| Account ID | Decode the tunnel JWT in the `cloudflared.service`, field `a` |
| Tunnel ID | Same JWT, field `t` — or `cloudflared tunnel list` |
| Zone ID for `mlvcdn.com` | `1d990501fe37b96d5abe4df7688e622d` (known) |
| Gateway dashboard port | Default `18789` — confirm with `openclaw gateway status` |
| Desired subdomain | e.g. `openclawpro-dash` → `openclawpro-dash.mlvcdn.com` |
| Gateway auth token | From `~/.openclaw/openclaw.json` at `gateway.auth.token` |

## Workflow

Copy this checklist and track progress:

```
Task Progress:
- [ ] Step 1: Verify gateway is running + get dashboard port
- [ ] Step 2: Fix Node.js symlink if needed (systemd + nvm)
- [ ] Step 3: Get current tunnel config
- [ ] Step 4: Add ingress rule for dashboard subdomain
- [ ] Step 5: Create DNS CNAME record
- [ ] Step 6: Configure controlUi.allowedOrigins in openclaw.json
- [ ] Step 7: Restart gateway
- [ ] Step 8: Approve device pairing
- [ ] Step 9: Verify end-to-end
```

### Step 1 — Verify gateway

```bash
openclaw gateway status
ss -tlnp | grep 18789
```

Dashboard should be on `127.0.0.1:18789`. If not running, start it first.

### Step 2 — Fix Node.js symlink (if systemd services fail with 203/EXEC)

When Node.js is installed via nvm, systemd can't find `/usr/bin/node`.

```bash
NODE_PATH=$(which node)
if [ ! -f /usr/bin/node ]; then
  ln -s "$NODE_PATH" /usr/bin/node
fi
```

### Step 3 — Get current tunnel config

```bash
CF_TOKEN="<account-api-token>"
ACCOUNT_ID="3eb3623a08be565da5444463c39199c4"
TUNNEL_ID="<tunnel-id>"

curl -s "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/cfd_tunnel/$TUNNEL_ID/configurations" \
  -H "Authorization: Bearer $CF_TOKEN"
```

Save the existing `ingress` array — you must preserve all existing rules when updating.

### Step 4 — Add ingress rule

PUT the full config with the new rule **prepended** before the catch-all:

```bash
SUBDOMAIN="openclawpro-dash"

curl -s -X PUT \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/cfd_tunnel/$TUNNEL_ID/configurations" \
  -H "Authorization: Bearer $CF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "config": {
      "ingress": [
        <existing rules>,
        {"hostname": "'$SUBDOMAIN'.mlvcdn.com", "service": "http://localhost:18789"},
        {"service": "http_status:404"}
      ]
    }
  }'
```

The catch-all `http_status:404` must always be last. Insert the new rule before it.

### Step 5 — Create DNS CNAME

```bash
ZONE_ID="1d990501fe37b96d5abe4df7688e622d"

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

### Step 6 — Configure controlUi in openclaw.json

Edit `~/.openclaw/openclaw.json` and add/merge under `gateway`:

```json
{
  "gateway": {
    "controlUi": {
      "allowedOrigins": ["https://<subdomain>.mlvcdn.com"],
      "allowInsecureAuth": true
    }
  }
}
```

- `allowedOrigins` — required for non-localhost access, must be full origin with scheme
- `allowInsecureAuth` — needed because Cloudflare terminates TLS but forwards HTTP to the tunnel, so the browser is in a "secure context" but the gateway sees plain HTTP

### Step 7 — Restart gateway

```bash
systemctl --user restart openclaw-gateway
systemctl --user status openclaw-gateway --no-pager -l
```

### Step 8 — Approve device pairing

On first browser connection from a new device, the gateway requires pairing:

```bash
openclaw devices list
openclaw devices approve <requestId>
```

Local (`127.0.0.1`) connections are auto-approved. Remote connections require explicit approval.

### Step 9 — Verify

```bash
curl -s -o /dev/null -w "%{http_code}" --max-time 10 "https://$SUBDOMAIN.mlvcdn.com/"
```

Should return `200`. Then open in browser:

```
https://<subdomain>.mlvcdn.com/#token=<gateway-auth-token>
```

The token is imported from the URL fragment, stored in `sessionStorage` for the current tab, and stripped from the URL. Each new tab needs the token passed again (or bookmark the `#token=...` URL).

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `origin not allowed` | Check `controlUi.allowedOrigins` matches the exact origin (with `https://`) |
| `pairing required` (1008) | Run `openclaw devices list` + `openclaw devices approve <id>` |
| `203/EXEC` in systemd | Node.js symlink missing — see Step 2 |
| Token not persisting across tabs | Expected — token is per-tab (`sessionStorage`). Use `#token=` in URL |
| `HTTP 401 Invalid bearer token` from Anthropic | Not a dashboard issue — your Anthropic API key is invalid/expired |
| DNS not resolving | Wait 1-2 min for propagation, verify with `dig <subdomain>.mlvcdn.com +short` |

## Known Values (this project)

| Key | Value |
|-----|-------|
| Account ID | `3eb3623a08be565da5444463c39199c4` |
| Zone ID (mlvcdn.com) | `1d990501fe37b96d5abe4df7688e622d` |
| Dashboard port | `18789` |
| Tunnel token verify endpoint | `https://api.cloudflare.com/client/v4/accounts/<account-id>/tokens/verify` (Account API Token, NOT `/user/tokens/verify`) |
