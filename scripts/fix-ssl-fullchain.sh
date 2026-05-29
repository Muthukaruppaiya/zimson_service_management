#!/bin/bash
# Fix PEM "bad end line" (Windows CRLF) and rebuild fullchain.pem for Nginx
set -euo pipefail

UPLOAD_DIR="${SSL_UPLOAD_DIR:-/tmp/ssl}"
SSL_DIR="/etc/ssl/zimsonwatchcare"
CRT="${UPLOAD_DIR}/zimsonwatchcare.crt"
CA="${UPLOAD_DIR}/zimsonwatchcare-ca-bundle.crt"

for f in "$CRT" "$CA"; do
  if [ ! -f "$f" ]; then
    echo "Missing $f"
    exit 1
  fi
done

if command -v dos2unix >/dev/null 2>&1; then
  sudo dos2unix "$CRT" "$CA" 2>/dev/null || true
else
  sudo sed -i 's/\r$//' "$CRT" "$CA"
fi

# If certificate is DER (binary), convert to PEM
if ! head -1 "$CRT" | grep -q 'BEGIN CERTIFICATE'; then
  echo "Converting CRT from DER to PEM..."
  sudo openssl x509 -inform DER -in "$CRT" -out "${CRT}.pem"
  CRT="${CRT}.pem"
  sudo sed -i 's/\r$//' "$CRT"
fi
if ! head -1 "$CA" | grep -q 'BEGIN CERTIFICATE'; then
  echo "Converting CA bundle from DER to PEM..."
  sudo openssl x509 -inform DER -in "$CA" -out "${CA}.pem"
  CA="${CA}.pem"
  sudo sed -i 's/\r$//' "$CA"
fi

sudo mkdir -p "$SSL_DIR"
sudo bash -c "{ cat '$CRT'; echo; cat '$CA'; } > '$SSL_DIR/fullchain.pem'"
sudo chmod 644 "$SSL_DIR/fullchain.pem"

echo "Validating fullchain (first certificate)..."
sudo openssl x509 -in "$SSL_DIR/fullchain.pem" -noout -subject -dates

echo "Validating chain file parses..."
sudo openssl crl2pkcs7 -nocrl -certfile "$SSL_DIR/fullchain.pem" | openssl pkcs7 -print_certs -noout | head -20

echo ""
echo "OK: $SSL_DIR/fullchain.pem"
echo "Run: sudo nginx -t && sudo systemctl reload nginx"
