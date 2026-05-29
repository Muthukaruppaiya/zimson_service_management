#!/bin/bash
# Put Nginx in front of Node (port 4000) so users open http://zimsonwatchcare.com with no :4000
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Installing nginx..."
sudo apt-get update -qq
sudo apt-get install -y nginx

echo "Installing site config..."
sudo cp deploy/nginx-zimsonwatchcare.conf /etc/nginx/sites-available/zimsonwatchcare
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/zimsonwatchcare /etc/nginx/sites-enabled/zimsonwatchcare

sudo nginx -t
sudo systemctl enable nginx
sudo systemctl reload nginx

if command -v ufw >/dev/null 2>&1; then
  sudo ufw allow OpenSSH || true
  sudo ufw allow 'Nginx Full' || true
  echo "UFW: allowed SSH + Nginx (80/443)"
fi

echo ""
echo "OK — ensure Node is running:  cd ~/zimson_service_management && npm start"
echo "Open in browser:  http://zimsonwatchcare.com"
echo "AWS security group: allow inbound TCP 80 (and 443 after SSL), NOT 4000."
