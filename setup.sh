#!/bin/bash
# ClawPro VPS Setup Script
# Installs OpenClaw natively as root on a fresh Ubuntu/Debian VPS

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${BLUE}"
echo "========================================"
echo "         ClawPro VPS Setup"
echo "    Native mode (no Docker)"
echo "========================================"
echo -e "${NC}"

if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Please run as root${NC}"
  exit 1
fi

TOTAL_STEPS=10

step() {
  echo ""
  echo -e "${YELLOW}[$1/$TOTAL_STEPS] $2${NC}"
}

ok() {
  echo -e "${GREEN}  ✓ $1${NC}"
}

# ─────────────────────────────────────────────
# STEP 1: System packages
# ─────────────────────────────────────────────
step 1 "Installing system packages..."

apt-get update -qq
apt-get install -y -qq \
  git curl ca-certificates jq \
  ufw fail2ban unattended-upgrades \
  apt-transport-https gnupg lsb-release

ok "System packages installed"

# ─────────────────────────────────────────────
# STEP 2: Node.js 22
# ─────────────────────────────────────────────
step 2 "Installing Node.js 22..."

REQUIRED_NODE_VERSION=22
CURRENT_NODE_VERSION=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1 || echo "0")
if [ "${CURRENT_NODE_VERSION}" -ge "${REQUIRED_NODE_VERSION}" ] 2>/dev/null; then
  ok "Node.js $(node -v) already installed"
else
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - > /dev/null 2>&1
  apt-get install -y -qq nodejs
  ok "Node.js $(node -v) installed"
fi

# ─────────────────────────────────────────────
# STEP 3: OpenClaw
# ─────────────────────────────────────────────
step 3 "Installing OpenClaw..."

if command -v openclaw &>/dev/null; then
  ok "OpenClaw already installed ($(openclaw --version 2>/dev/null || echo 'unknown version'))"
else
  npm install -g openclaw
  ok "OpenClaw installed"
fi

# ─────────────────────────────────────────────
# STEP 4: GitHub CLI
# ─────────────────────────────────────────────
step 4 "Installing GitHub CLI..."

if command -v gh &>/dev/null; then
  ok "GitHub CLI already installed"
else
  curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg 2>/dev/null
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    | tee /etc/apt/sources.list.d/github-cli.list > /dev/null
  apt-get update -qq && apt-get install -y -qq gh
  ok "GitHub CLI installed"
fi

# ─────────────────────────────────────────────
# STEP 5: Claude Code + Bun
# ─────────────────────────────────────────────
step 5 "Installing Claude Code and Bun..."

if command -v claude &>/dev/null; then
  ok "Claude Code already installed"
else
  curl -fsSL https://claude.ai/install.sh | bash
  echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
  export PATH="$HOME/.local/bin:$PATH"
  ok "Claude Code installed"
fi

if command -v bun &>/dev/null; then
  ok "Bun already installed"
else
  curl -fsSL https://bun.sh/install | bash
  echo 'export BUN_INSTALL="$HOME/.bun"' >> ~/.bashrc
  echo 'export PATH="$BUN_INSTALL/bin:$PATH"' >> ~/.bashrc
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
  ok "Bun installed"
fi

# ─────────────────────────────────────────────
# STEP 6: Cloudflared
# ─────────────────────────────────────────────
step 6 "Installing Cloudflared..."

if command -v cloudflared &>/dev/null; then
  ok "Cloudflared already installed"
else
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
    | tee /usr/share/keyrings/cloudflare-main.gpg > /dev/null
  echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" \
    | tee /etc/apt/sources.list.d/cloudflared.list > /dev/null
  apt-get update -qq && apt-get install -y -qq cloudflared
  ok "Cloudflared installed"
fi

# ─────────────────────────────────────────────
# STEP 7: Google Cloud CLI
# ─────────────────────────────────────────────
step 7 "Installing Google Cloud CLI..."

if command -v gcloud &>/dev/null; then
  ok "Google Cloud CLI already installed"
else
  echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" \
    | tee /etc/apt/sources.list.d/google-cloud-sdk.list > /dev/null
  curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg \
    | gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg
  apt-get update -qq && apt-get install -y -qq google-cloud-cli
  ok "Google Cloud CLI installed"
fi

# ─────────────────────────────────────────────
# STEP 8: Security hardening
# ─────────────────────────────────────────────
step 8 "Applying security hardening..."

# UFW
if ! ufw status | grep -q "Status: active"; then
  ufw --force reset > /dev/null
  ufw default deny incoming > /dev/null
  ufw default allow outgoing > /dev/null
  ufw allow 22/tcp > /dev/null
  ufw --force enable > /dev/null
  ok "UFW enabled (port 22 open)"
else
  ufw allow 22/tcp > /dev/null 2>&1 || true
  ok "UFW already active"
fi

# Fail2ban
systemctl enable fail2ban > /dev/null 2>&1
systemctl start fail2ban > /dev/null 2>&1 || true
ok "Fail2ban enabled"

# SSH hardening
cat > /etc/ssh/sshd_config.d/hardening.conf << 'EOF'
PasswordAuthentication no
PermitRootLogin prohibit-password
MaxAuthTries 3
X11Forwarding no
AllowAgentForwarding no
EOF
systemctl reload sshd > /dev/null 2>&1 || true
ok "SSH hardened"

# Unattended upgrades
cat > /etc/apt/apt.conf.d/20auto-upgrades << 'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
EOF
ok "Unattended security upgrades enabled"

# ─────────────────────────────────────────────
# STEP 9: Configure OpenClaw
# ─────────────────────────────────────────────
step 9 "Configuring OpenClaw..."

# Workspace dirs
mkdir -p /root/.openclaw/workspace /root/.openclaw/gogcli
ok "Workspace dirs created"

# Generate gateway token if config doesn't have one
OPENCLAW_CONFIG="/root/.openclaw/openclaw.json"
if [ ! -f "$OPENCLAW_CONFIG" ] || [ "$(cat "$OPENCLAW_CONFIG" 2>/dev/null)" = "" ] || [ "$(cat "$OPENCLAW_CONFIG" 2>/dev/null)" = "{}" ]; then
  GATEWAY_TOKEN=$(openssl rand -hex 32)
  echo '{}' > "$OPENCLAW_CONFIG"
  ok "Generated gateway token: ${GATEWAY_TOKEN}"
  echo ""
  echo -e "${GREEN}  Save this token - you'll need it for the OpenClaw app:${NC}"
  echo -e "  ${CYAN}${GATEWAY_TOKEN}${NC}"
  echo ""
else
  ok "OpenClaw config already exists"
  GATEWAY_TOKEN=""
fi

# claude-run wrapper
cat > /usr/local/bin/claude-run << 'EOF'
#!/bin/bash
# Wrapper that runs Claude Code with sandbox mode and no-permissions flag
IS_SANDBOX=1 exec claude --dangerously-skip-permissions "$@"
EOF
chmod +x /usr/local/bin/claude-run
ok "claude-run wrapper created at /usr/local/bin/claude-run"

# Systemd system service for OpenClaw gateway
cat > /etc/systemd/system/openclaw-gateway.service << 'EOF'
[Unit]
Description=OpenClaw Gateway
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/openclaw gateway
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=IS_SANDBOX=1
Environment=BROWSER=echo

[Install]
WantedBy=multi-user.target
EOF

# Enable and try to start the service (may fail without full config)
systemctl daemon-reload 2>/dev/null || true
systemctl enable openclaw-gateway 2>/dev/null || true
ok "OpenClaw systemd service configured"

# ─────────────────────────────────────────────
# STEP 10: Aliases
# ─────────────────────────────────────────────
step 10 "Setting up aliases..."

if ! grep -q "# ClawPro aliases" /root/.bashrc 2>/dev/null; then
cat >> /root/.bashrc << 'ALIASES'

# ClawPro aliases
alias oc='openclaw'
alias oc-logs='journalctl -u openclaw-gateway -f'
alias oc-restart='systemctl restart openclaw-gateway'
alias oc-stop='systemctl stop openclaw-gateway'
alias oc-start='systemctl start openclaw-gateway'
alias oc-status='systemctl status openclaw-gateway'
ALIASES
ok "Aliases added to ~/.bashrc"
else
  ok "Aliases already in ~/.bashrc"
fi

# ─────────────────────────────────────────────
# Cloudflare Tunnel (optional)
# ─────────────────────────────────────────────
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  Cloudflare Tunnel Setup (optional)${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "A Cloudflare Tunnel exposes OpenClaw webhooks (port 18800)"
echo "to the internet without opening firewall ports."
echo "Required for Gmail Pub/Sub notifications."
echo ""
read -rp "Enter your Cloudflare API token (or press Enter to skip): " CF_API_TOKEN

if [ -n "$CF_API_TOKEN" ]; then
  read -rp "Enter your domain (e.g. example.com): " CF_DOMAIN
  read -rp "Enter tunnel name [openclaw]: " CF_TUNNEL_NAME
  CF_TUNNEL_NAME="${CF_TUNNEL_NAME:-openclaw}"

  echo ""
  echo "Setting up Cloudflare Tunnel..."

  cloudflared tunnel login 2>/dev/null || true

  # Create tunnel
  cloudflared tunnel create "$CF_TUNNEL_NAME" 2>/dev/null || ok "Tunnel '$CF_TUNNEL_NAME' already exists"

  TUNNEL_ID=$(cloudflared tunnel list --output json 2>/dev/null | jq -r ".[] | select(.name==\"$CF_TUNNEL_NAME\") | .id" 2>/dev/null || echo "")

  if [ -n "$TUNNEL_ID" ]; then
    # Create config
    mkdir -p /etc/cloudflared
    cat > /etc/cloudflared/config.yml << EOF
tunnel: ${TUNNEL_ID}
credentials-file: /root/.cloudflared/${TUNNEL_ID}.json

ingress:
  - hostname: hooks.${CF_DOMAIN}
    service: http://localhost:18800
  - service: http_status:404
EOF

    # DNS route
    cloudflared tunnel route dns "$CF_TUNNEL_NAME" "hooks.${CF_DOMAIN}" 2>/dev/null || true

    # Systemd service
    cloudflared service install 2>/dev/null || true
    systemctl enable cloudflared 2>/dev/null || true
    systemctl start cloudflared 2>/dev/null || true

    ok "Cloudflare Tunnel configured"
    echo -e "${GREEN}  Webhook endpoint: https://hooks.${CF_DOMAIN}${NC}"
  else
    echo -e "${RED}  Could not get tunnel ID. Configure manually.${NC}"
  fi
else
  ok "Cloudflare Tunnel skipped"
fi

# ─────────────────────────────────────────────
# OpenClaw onboard
# ─────────────────────────────────────────────
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  OpenClaw Onboarding${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Run openclaw onboard to configure your token, channels, etc."
read -rp "Run 'openclaw onboard' now? [Y/n]: " RUN_ONBOARD
RUN_ONBOARD="${RUN_ONBOARD:-Y}"

if [[ "$RUN_ONBOARD" =~ ^[Yy] ]]; then
  openclaw onboard || true
fi

# ─────────────────────────────────────────────
# Start gateway
# ─────────────────────────────────────────────
echo ""
systemctl start openclaw-gateway 2>/dev/null || true

# ─────────────────────────────────────────────
# Done
# ─────────────────────────────────────────────
echo ""
echo -e "${GREEN}========================================"
echo "           Setup Complete!"
echo "========================================${NC}"
echo ""

if [ -n "$GATEWAY_TOKEN" ]; then
  echo -e "${BLUE}Gateway Token:${NC} ${GATEWAY_TOKEN}"
  echo ""
fi

echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Reload your shell:   source ~/.bashrc"
echo "  2. Authenticate GitHub: gh auth login"
echo "  3. Authenticate Claude: claude login"
echo "  4. Start the gateway:   oc-start"
echo "  5. Check logs:          oc-logs"
echo ""
echo -e "${YELLOW}Gmail notifications:${NC}"
echo "  See GMAIL-SETUP.md for Gmail → Cloudflare Tunnel → OpenClaw setup"
echo ""
echo -e "${YELLOW}Access from your laptop:${NC}"
echo "  ssh -L 18789:127.0.0.1:18789 root@YOUR_VPS_IP"
echo "  Then open: http://localhost:18789"
echo ""
echo -e "${YELLOW}Useful aliases (after source ~/.bashrc):${NC}"
echo "  oc          → openclaw"
echo "  oc-logs     → follow gateway logs"
echo "  oc-restart  → restart gateway"
echo "  oc-start    → start gateway"
echo "  oc-stop     → stop gateway"
echo "  oc-status   → gateway status"
echo ""
