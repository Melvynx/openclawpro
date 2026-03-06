# Troubleshooting

Common issues with the native OpenClaw setup.

---

## Gateway Won't Start

**Symptom:** `systemctl --user status openclaw-gateway` shows failed.

**Check logs:**
```bash
journalctl --user -u openclaw-gateway -n 50
```

**Common causes:**

| Cause | Fix |
|-------|-----|
| OpenClaw not configured | Run `openclaw onboard` |
| XDG_RUNTIME_DIR not set | Add `export XDG_RUNTIME_DIR="/run/user/0"` to ~/.bashrc |
| openclaw.json missing | Check `/root/.openclaw/openclaw.json` exists |

**Reset and restart:**
```bash
export XDG_RUNTIME_DIR="/run/user/0"
systemctl --user daemon-reload
systemctl --user restart openclaw-gateway
systemctl --user status openclaw-gateway
```

---

## Session Lock File Error

**Symptom:**
```
Error: session file locked (timeout 10000ms): .../sessions/<id>.jsonl.lock
```

**Fix:**
```bash
rm -f /root/.openclaw/agents/main/sessions/*.lock
systemctl --user restart openclaw-gateway
```

---

## Port Conflict

**Symptom:** Gateway fails to bind to port 18789.

**Check what's using it:**
```bash
ss -tlnp | grep 18789
```

**Fix:** Update your OpenClaw config to use a different port, or kill the conflicting process.

---

## Claude Code Issues

### Claude hangs / authentication loop

**Fix:** Ensure `~/.local/bin` is in PATH:
```bash
export PATH="$HOME/.local/bin:$PATH"
claude --version
claude login
```

### claude-run not found

```bash
ls -la /usr/local/bin/claude-run
# Re-create if missing:
cat > /usr/local/bin/claude-run << 'EOF'
#!/bin/bash
IS_SANDBOX=1 exec claude --dangerously-skip-permissions "$@"
EOF
chmod +x /usr/local/bin/claude-run
```

---

## Cloudflare Tunnel Issues

### Tunnel not routing traffic

**Check service status:**
```bash
systemctl status cloudflared
journalctl -u cloudflared -f
```

**Check config:**
```bash
cat /etc/cloudflared/config.yml
cloudflared tunnel info openclaw
```

**Restart:**
```bash
systemctl restart cloudflared
```

### DNS not resolving

DNS changes can take a few minutes. Verify:
```bash
dig hooks.YOUR_DOMAIN.com
curl -v https://hooks.YOUR_DOMAIN.com
```

### Tunnel credentials not found

```bash
ls -la /root/.cloudflared/
# Re-login if needed:
cloudflared tunnel login
```

---

## Gmail Notifications Not Arriving

**Diagnostic checklist:**

```bash
# 1. Cloudflare Tunnel running?
systemctl status cloudflared

# 2. gog listening on port 8788?
ss -tlnp | grep 8788

# 3. Gateway has gmail logs?
journalctl --user -u openclaw-gateway | grep -i gmail

# 4. Gmail watch active?
gog gmail watch status --account your.email@gmail.com

# 5. Pub/Sub subscription endpoint correct?
gcloud pubsub subscriptions describe gog-gmail-watch-push
```

**Fix bind address:** In `/root/.openclaw/openclaw.json`, ensure:
```json
"serve": {
  "bind": "0.0.0.0",
  "port": 8788
}
```

**Update push endpoint:**
```bash
gcloud pubsub subscriptions update gog-gmail-watch-push \
  --project YOUR_PROJECT_ID \
  --push-endpoint "https://gmail.YOUR_DOMAIN.com/gmail-pubsub?token=YOUR_TOKEN"
```

**"ignoring stale push" messages** are normal — they appear after restart when old notifications arrive.

---

## Permission Issues

Running as root natively means no permission issues. If you see them anyway:

```bash
# Fix openclaw config dir
chmod -R 755 /root/.openclaw
chmod 644 /root/.openclaw/openclaw.json

# Fix Claude config
chmod -R 700 /root/.claude
```

---

## gog / Gmail Auth Issues

### "OAuth credentials not configured"

```bash
gog auth credentials set /root/.openclaw/gogcli/credentials.json
gog auth add your.email@gmail.com --manual --force-consent
```

### gcloud not authenticated

```bash
gcloud auth login --no-browser
gcloud config set project YOUR_PROJECT_ID
```

---

## Quick Diagnostic Commands

```bash
# Gateway status
systemctl --user status openclaw-gateway

# Gateway logs (live)
journalctl --user -u openclaw-gateway -f

# OpenClaw version
openclaw --version

# Check Claude works
claude --version

# Check GitHub auth
gh auth status

# Check gog gmail watch
gog gmail watch status --account your.email@gmail.com

# Check Cloudflare Tunnel
systemctl status cloudflared
cloudflared tunnel info openclaw

# Check all listening ports
ss -tlnp

# OpenClaw health check
openclaw doctor
```
