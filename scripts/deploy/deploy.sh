#!/usr/bin/env bash
# Project Maze – Update auf dem Server einspielen (als root ausführen).
#   bash /opt/project-maze/app/scripts/deploy/deploy.sh
# Optional: MAZE_BRANCH überschreibt den Branch (Default: main).
set -euo pipefail

APP_DIR=/opt/project-maze/app
MAZE_BRANCH="${MAZE_BRANCH:-main}"

cd "$APP_DIR"
echo "==> Hole origin/$MAZE_BRANCH"
sudo -u maze git fetch origin "$MAZE_BRANCH"
sudo -u maze git reset --hard "origin/$MAZE_BRANCH"
echo "==> Baue"
sudo -u maze npm ci --no-audit --no-fund
sudo -u maze npm run build
echo "==> Neustart"
systemctl restart project-maze
sleep 2
curl -fsS http://127.0.0.1:2567/health && echo " ✓ live"
