#!/usr/bin/env bash
# Project Maze – einmaliges, gehärtetes Server-Setup (Ubuntu 24.04, als root ausführen).
#
#   MAZE_DOMAIN=maze.example.com bash hetzner-setup.sh
#
# Optional: MAZE_REPO (Git-URL), MAZE_BRANCH (Default: main), MAZE_BOTS (Default: 8)
# Idempotent – bei Fehlern (z. B. fehlender Deploy-Key) einfach erneut ausführen.
set -euo pipefail

: "${MAZE_DOMAIN:?Bitte MAZE_DOMAIN=deine-domain.de setzen}"
MAZE_REPO="${MAZE_REPO:-git@github.com:samulba/project-maze.git}"
MAZE_BRANCH="${MAZE_BRANCH:-main}"
MAZE_BOTS="${MAZE_BOTS:-8}"
APP_HOME=/opt/project-maze
APP_DIR="$APP_HOME/app"

echo "==> [1/8] Systemupdates + Grundpakete"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq git ufw fail2ban unattended-upgrades curl gnupg ca-certificates

echo "==> [2/8] Automatische Sicherheitsupdates (mit Reboot um 04:30 falls nötig)"
cat > /etc/apt/apt.conf.d/51-project-maze-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:30";
EOF

echo "==> [3/8] Node.js 22"
if ! command -v node >/dev/null || [[ "$(node --version)" != v22* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs
fi

echo "==> [4/8] Caddy (automatisches TLS/wss)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq && apt-get install -y -qq caddy
fi

echo "==> [5/8] Firewall (nur SSH, HTTP, HTTPS) + fail2ban"
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
systemctl enable --now fail2ban >/dev/null

if [[ -s /root/.ssh/authorized_keys ]]; then
  echo "==> SSH-Härtung: Passwort-Login deaktivieren (Key ist hinterlegt)"
  sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
  sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
  systemctl reload ssh || systemctl reload sshd
else
  echo "!! WARNUNG: kein SSH-Key in /root/.ssh/authorized_keys – Passwort-Login bleibt an. Key hinterlegen und Skript erneut ausführen."
fi

echo "==> [6/8] App-User + Repository"
id maze >/dev/null 2>&1 || useradd --system --create-home --home-dir "$APP_HOME" --shell /usr/sbin/nologin maze
install -d -o maze -g maze "$APP_HOME"
if [[ ! -f "$APP_HOME/.ssh/id_ed25519" ]]; then
  sudo -u maze mkdir -p "$APP_HOME/.ssh"
  sudo -u maze ssh-keygen -t ed25519 -N '' -f "$APP_HOME/.ssh/id_ed25519" -C "project-maze-deploy" >/dev/null
fi
if [[ ! -d "$APP_DIR/.git" ]]; then
  if ! sudo -u maze git clone --branch "$MAZE_BRANCH" "$MAZE_REPO" "$APP_DIR" 2>/dev/null; then
    echo ""
    echo "!! Repo nicht erreichbar. Falls privat: folgenden PUBLIC KEY als Deploy-Key"
    echo "   (Settings → Deploy keys, nur Lesezugriff) im GitHub-Repo hinterlegen"
    echo "   und dieses Skript danach einfach NOCHMAL ausführen:"
    echo ""
    cat "$APP_HOME/.ssh/id_ed25519.pub"
    echo ""
    exit 1
  fi
fi

echo "==> [7/8] Build + Konfiguration"
cd "$APP_DIR"
sudo -u maze git fetch origin "$MAZE_BRANCH"
sudo -u maze git reset --hard "origin/$MAZE_BRANCH"
sudo -u maze npm ci --no-audit --no-fund
sudo -u maze npm run build

cat > /etc/project-maze.env <<EOF
NODE_ENV=production
PORT=2567
HOST=127.0.0.1
BOT_COUNT=$MAZE_BOTS
ALLOWED_ORIGIN=https://$MAZE_DOMAIN
EOF
chmod 600 /etc/project-maze.env

cat > /etc/systemd/system/project-maze.service <<EOF
[Unit]
Description=Project Maze game server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=maze
WorkingDirectory=$APP_DIR
EnvironmentFile=/etc/project-maze.env
ExecStart=/usr/bin/node apps/server/dist/index.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$APP_DIR
PrivateTmp=true
MemoryMax=1500M

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/caddy/Caddyfile <<EOF
$MAZE_DOMAIN {
    encode gzip
    reverse_proxy 127.0.0.1:2567
}
EOF

echo "==> [8/8] Dienste starten"
systemctl daemon-reload
systemctl enable --now project-maze
systemctl reload caddy

sleep 2
if curl -fsS http://127.0.0.1:2567/health >/dev/null; then
  echo ""
  echo "✓ FERTIG. Sobald der DNS-A-Record von $MAZE_DOMAIN auf diese IP zeigt:"
  echo "  https://$MAZE_DOMAIN  (Caddy holt das TLS-Zertifikat automatisch)"
  echo "  Updates künftig mit: bash $APP_DIR/scripts/deploy/deploy.sh"
else
  echo "!! Server antwortet nicht – Logs: journalctl -u project-maze -n 50"
  exit 1
fi
