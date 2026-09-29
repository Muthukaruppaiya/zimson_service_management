#!/bin/bash
# Run this ON the Ubuntu server (not in Windows).
# Stops a foreground npm/tsx process from dying when you close PuTTY,
# and starts the app again after a reboot.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

echo "Project: $ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js is not installed. Run: bash scripts/upgrade-node-ubuntu.sh"
  exit 1
fi

NODE_VER="$(node -v)"
echo "Node: $NODE_VER"

if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm is not installed."
  exit 1
fi

if [[ ! -f "$ROOT/package.json" ]]; then
  echo "ERROR: package.json not found in $ROOT"
  exit 1
fi

if [[ ! -f "$ROOT/.env" ]]; then
  echo "WARNING: $ROOT/.env is missing. Copy env.production.example to .env and fill secrets."
fi

if [[ ! -x "$ROOT/node_modules/.bin/tsx" && ! -f "$ROOT/node_modules/tsx/dist/cli.mjs" ]]; then
  echo "Installing npm packages (tsx is required)..."
  npm ci
fi

if [[ ! -d "$ROOT/dist" ]]; then
  echo "Building web UI (dist/)..."
  npm run build
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "Installing pm2 globally..."
  sudo npm install -g pm2
fi

echo "PM2: $(pm2 -v)"

# Drop a leftover foreground npm/tsx/vite that would still hold the port.
pkill -f "tsx watch --tsconfig server/tsconfig.json server/index.ts" 2>/dev/null || true
pkill -f "tsx --tsconfig server/tsconfig.json server/index.ts" 2>/dev/null || true
pkill -f "vite --port 5173" 2>/dev/null || true
sleep 1

pm2 delete zimson 2>/dev/null || true
pm2 start "$ROOT/ecosystem.config.cjs"
pm2 save

echo "Enabling pm2 to start on reboot..."
sudo env "PATH=$PATH" "$(command -v pm2)" startup systemd -u "$USER" --hp "$HOME"
pm2 save

echo ""
echo "OK — Zimson is running under pm2. You can close PuTTY."
echo "  Status:  pm2 status"
echo "  Logs:    pm2 logs zimson"
echo "  Restart: pm2 restart zimson"
echo "  Stop:    pm2 stop zimson"
