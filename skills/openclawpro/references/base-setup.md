# Base VPS Setup

## Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
ln -sf "$(which node)" /usr/bin/node   # needed for systemd
```

## OpenClaw

```bash
npm i -g openclaw api2cli
openclaw configure
```

## Homebrew (for gog)

```bash
id -u linuxbrew &>/dev/null || useradd -m -s /bin/bash linuxbrew
sudo -u linuxbrew NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Root wrapper (brew refuses to run as root)
printf '#!/bin/bash\ncd /tmp\nexec sudo -u linuxbrew /home/linuxbrew/.linuxbrew/bin/brew "$@"' > /usr/local/bin/brew
chmod +x /usr/local/bin/brew

echo 'eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"' >> ~/.bashrc
```

After `brew install <pkg>`: `ln -sf /home/linuxbrew/.linuxbrew/bin/<bin> /usr/local/bin/<bin>`

## Security

```bash
apt install -y ufw fail2ban unattended-upgrades
ufw allow ssh && ufw --force enable
systemctl enable --now fail2ban
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config && systemctl restart sshd
```

## Key Paths

| Path | Purpose |
|------|---------|
| `~/.openclaw/openclaw.json` | Main config |
| `~/.openclaw/workspace/` | Agent workspace + skills |
| `~/.config/gogcli/` | gog OAuth credentials |
| `~/.claude/skills/` | Claude Code skills |
| `/etc/systemd/system/` | System services |
