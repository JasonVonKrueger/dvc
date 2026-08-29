#!/usr/bin/env bash
# Pulls latest main, reinstalls deps, and restarts the app under pm2.
set -euo pipefail
cd "$(dirname "$0")/.."

git fetch origin
git reset --hard origin/main
npm ci --omit=dev
pm2 restart dvc || pm2 start app.js --name dvc
