# Base VPS Setup

## Node.js (via nvm)

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install --lts
```

Systemd can't find nvm-installed Node.js. Create a symlink:

```bash
ln -sf "$(which node)" /usr/bin/node
```

## OpenClaw + tools

```bash
npm i -g openclaw api2cli
openclaw configure
```

## Homebrew (for gog and other tools)

```bash
# Create linuxbrew user
id -u linuxbrew &>/dev/null || useradd -m -s /bin/bash linuxbrew

# Install brew
sudo -u linuxbrew NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Create root-safe wrapper (required - brew refuses to run as root)
printf '#!/bin/bash\ncd /tmp\nexec sudo -u linuxbrew /home/linuxbrew/.linuxbrew/bin/brew "$@"' > /usr/local/bin/brew
chmod +x /usr/local/bin/brew

# Add brew to PATH in .bashrc
echo 'eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"' >> ~/.bashrc
echo 'export PATH="/usr/local/bin:$PATH"' >> ~/.bashrc
```

After installing any brew package, symlink the binary so it's available everywhere:

```bash
ln -sf /home/linuxbrew/.linuxbrew/bin/<BINARY> /usr/local/bin/<BINARY>
```

## Cloudflared

```bash
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | gpg --dearmor -o /etc/apt/keyrings/cloudflare-main.gpg
echo "deb [signed-by=/etc/apt/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared bookworm main" > /etc/apt/sources.list.d/cloudflared.list
apt update && apt install -y cloudflared
```

## Security Hardening

- **UFW** - `apt install -y ufw && ufw allow ssh && ufw --force enable`
- **fail2ban** - `apt install -y fail2ban && systemctl enable --now fail2ban`
- **SSH** - Disable password auth: `sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config && systemctl restart sshd`
- **unattended-upgrades** - `apt install -y unattended-upgrades && dpkg-reconfigure -plow unattended-upgrades`

## Key Paths

| Path | Purpose |
|------|---------|
| `~/.openclaw/openclaw.json` | Main OpenClaw config |
| `~/.openclaw/workspace/` | Agent workspaces |
| `~/.config/gogcli/` | gog OAuth credentials |
| `~/.claude/skills/` | Claude Code skills |
| `~/.claude/settings.json` | Claude Code settings |
| `/etc/systemd/system/` | System-level services |
