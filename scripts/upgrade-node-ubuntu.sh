#!/bin/bash
# Upgrade Ubuntu Node.js to 20 LTS (required: Vite 8, AWS SDK, React Router 7).
set -e
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
echo "Node: $(node -v)"
echo "npm:  $(npm -v)"
if ! node -e "const v=process.versions.node.split('.').map(Number); process.exit(v[0]<20||(v[0]===20&&v[1]<19)?1:0)"; then
  echo "ERROR: Need Node 20.19+ or 22.12+. Got $(node -v)"
  exit 1
fi
echo "OK — reinstall app deps: cd ~/zimson_service_management && rm -rf node_modules && npm ci && npm run build"
