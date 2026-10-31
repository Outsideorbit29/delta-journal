#!/usr/bin/env bash
# One-time setup of the always-on server that runs the Telegram bot and the
# Delta sync from a fixed IP (an Ubuntu 24.04 cloud VM: AWS EC2 in Mumbai).
#
# Run on the VM, from the cloned repo:  bash deploy/server/setup.sh
# Then put .env.local next to package.json and run it again (it is safe to repeat).
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
SERVICE=delta-journal-bot
cd "$REPO_DIR"

echo "== Swap: small VMs need it to install packages"
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null
  sudo swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

echo "== Node.js 24"
if ! node --version 2>/dev/null | grep -q '^v24\.'; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node --version

echo "== Dependencies"
npm ci --no-audit --no-fund

if [ ! -f .env.local ]; then
  echo
  echo "Next: copy .env.local into $REPO_DIR and run this script again."
  exit 0
fi

echo "== Database schema"
npm run db:migrate

echo "== Service"
sed -e "s|__USER__|$(id -un)|g" -e "s|__DIR__|$REPO_DIR|g" -e "s|__NPM__|$(command -v npm)|g" \
  deploy/server/delta-journal-bot.service | sudo tee /etc/systemd/system/$SERVICE.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now $SERVICE
sudo systemctl restart $SERVICE
sleep 5
systemctl --no-pager --lines=8 status $SERVICE || true
echo
echo "Done. The bot runs as the '$SERVICE' service and starts on boot."
echo "Logs: journalctl -u $SERVICE -f    Update: bash deploy/server/update.sh"
