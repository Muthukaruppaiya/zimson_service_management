#!/bin/bash
# Build /etc/ssl/zimsonwatchcare/fullchain.pem + privkey.pem from files in /tmp/ssl/
# Usage: export PFX_PASS='...' && bash scripts/ssl-install-commercial.sh
set -euo pipefail

UPLOAD_DIR="${SSL_UPLOAD_DIR:-/tmp/ssl}"
SSL_DIR="/etc/ssl/zimsonwatchcare"

CRT="${UPLOAD_DIR}/zimsonwatchcare.crt"
CA="${UPLOAD_DIR}/zimsonwatchcare-ca-bundle.crt"
PFX="${UPLOAD_DIR}/zimsonwatchcare.pfx"

if [ ! -f "$PFX" ]; then
  echo "Missing $PFX — copy zimsonwatchcare.pfx to $UPLOAD_DIR"
  exit 1
fi
if [ -z "${PFX_PASS:-}" ] || [ "$PFX_PASS" = "paste-password-from-PFX-Password-file" ]; then
  echo "Set the real PFX password:  export PFX_PASS='actual-password-from-provider'"
  exit 1
fi

echo "Checking upload files..."
file "$PFX" "$CRT" "$CA" 2>/dev/null || file "$PFX"
PFX_SIZE=$(stat -c%s "$PFX" 2>/dev/null || stat -f%z "$PFX")
if [ "$PFX_SIZE" -lt 500 ]; then
  echo "WARN: PFX is very small (${PFX_SIZE} bytes) — wrong file? Use the .pfx/.p12 from the provider, not CSR/CRT."
fi
if ! openssl pkcs12 -in "$PFX" -noout -passin "pass:$PFX_PASS" 2>/dev/null; then
  echo "ERROR: Cannot read PFX (wrong password or corrupt file). Try:"
  echo "  openssl pkcs12 -in $PFX -info -passin pass:YOUR_PASSWORD -nokeys"
  exit 1
fi

sudo mkdir -p "$SSL_DIR"
sudo chmod 700 "$SSL_DIR"

echo "Extracting private key from PFX..."
sudo openssl pkcs12 -in "$PFX" -nocerts -nodes \
  -out "$SSL_DIR/privkey.pem" \
  -password "pass:$PFX_PASS"
sudo chmod 600 "$SSL_DIR/privkey.pem"

if [ -f "$CRT" ] && [ -f "$CA" ]; then
  echo "Building fullchain from CRT + CA bundle..."
  sudo bash -c "cat '$CRT' '$CA' > '$SSL_DIR/fullchain.pem'"
elif [ -f "$CRT" ]; then
  echo "Building fullchain from CRT only (add CA bundle if browsers warn)..."
  sudo cp "$CRT" "$SSL_DIR/fullchain.pem"
else
  echo "Extracting certificate from PFX for fullchain..."
  sudo openssl pkcs12 -in "$PFX" -clcerts -nokeys \
    -out "$SSL_DIR/cert-only.pem" \
    -password "pass:$PFX_PASS"
  if [ -f "$CA" ]; then
    sudo bash -c "cat '$SSL_DIR/cert-only.pem' '$CA' > '$SSL_DIR/fullchain.pem'"
  else
    sudo cp "$SSL_DIR/cert-only.pem" "$SSL_DIR/fullchain.pem"
  fi
fi
sudo chmod 644 "$SSL_DIR/fullchain.pem"

echo "Installing Nginx SSL site..."
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
sudo cp "$ROOT/deploy/nginx-zimsonwatchcare-ssl.conf" /etc/nginx/sites-available/zimsonwatchcare
sudo ln -sf /etc/nginx/sites-available/zimsonwatchcare /etc/nginx/sites-enabled/zimsonwatchcare
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

echo ""
echo "SSL installed."
echo "  fullchain: $SSL_DIR/fullchain.pem"
echo "  privkey:   $SSL_DIR/privkey.pem"
echo "Update .env: APP_BASE_URL=https://zimsonwatchcare.com"
echo "Open: https://zimsonwatchcare.com"
