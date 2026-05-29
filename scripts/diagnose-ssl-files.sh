#!/bin/bash
# Inspect SSL upload files on /tmp/ssl — run on EC2 before openssl/nginx
set -u
DIR="${SSL_UPLOAD_DIR:-/tmp/ssl}"
echo "=== Files in $DIR ==="
ls -la "$DIR" 2>/dev/null || { echo "Directory missing: $DIR"; exit 1; }
echo ""
for f in "$DIR"/*; do
  [ -f "$f" ] || continue
  echo "--- $(basename "$f") ($(stat -c%s "$f" 2>/dev/null || echo ?) bytes) ---"
  file "$f"
  head -2 "$f" 2>/dev/null | sed 's/^/  /'
  echo ""
done
echo "=== PFX test (set PFX_PASS first) ==="
PFX="$DIR/zimsonwatchcare.pfx"
if [ -f "$PFX" ]; then
  if [ -n "${PFX_PASS:-}" ]; then
    openssl pkcs12 -in "$PFX" -info -nokeys -passin "pass:$PFX_PASS" 2>&1 | head -15 || true
  else
    echo "export PFX_PASS='real-password' then re-run"
    openssl pkcs12 -in "$PFX" -info -nokeys -passin pass: 2>&1 | head -5 || true
  fi
else
  echo "No $PFX"
fi
echo ""
echo "=== CRT test ==="
CRT="$DIR/zimsonwatchcare.crt"
if [ -f "$CRT" ]; then
  if grep -q 'BEGIN CERTIFICATE' "$CRT" 2>/dev/null; then
    openssl x509 -in "$CRT" -noout -subject -dates 2>&1 || echo "CRT PEM invalid"
  else
    echo "CRT not PEM — trying DER..."
    openssl x509 -inform DER -in "$CRT" -noout -subject -dates 2>&1 || echo "CRT DER invalid"
  fi
fi
