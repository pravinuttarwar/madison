#!/usr/bin/env bash
# Deploy Madison Command Center on the mbi server (run ON the box, from the checkout).
# Pulls latest, rebuilds the frontend, refreshes backend deps, restarts the service.
# The server .env files are gitignored and stay in place across deploys.
set -euo pipefail

APP=/home/ubuntu/madison
cd "$APP"

echo "→ git pull"
git pull --ff-only

echo "→ frontend build"
cd "$APP/frontend"
pnpm install --silent
pnpm build

echo "→ backend deps"
cd "$APP/backend"
npm install --silent

echo "→ restart service"
sudo systemctl restart madison-cc.service
sleep 2
systemctl is-active madison-cc.service

echo "✓ deployed: $(git -C "$APP" rev-parse --short HEAD)"
