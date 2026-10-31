#!/usr/bin/env bash
# Pulls the latest code onto the VM, applies database migrations and restarts the bot.
#   bash deploy/oracle/update.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
git pull --ff-only
npm ci --no-audit --no-fund
npm run db:migrate
sudo systemctl restart delta-journal-bot
sleep 5
systemctl --no-pager --lines=5 status delta-journal-bot || true
