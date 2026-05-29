# SSL for zimsonwatchcare.com (commercial certificate)

You received several files from your certificate provider. On the **Ubuntu server**, Nginx only needs **two files**:

| Nginx file | Built from your download |
|------------|---------------------------|
| `/etc/ssl/zimsonwatchcare/fullchain.pem` | **CRT** + **CA Bundle** (certificate chain) |
| `/etc/ssl/zimsonwatchcare/privkey.pem` | Private key (from **PFX** file + **PFX Password**) |

You do **not** upload CSR or `cname` to the server (keep them for your records).

---

## Step 1 — Copy files from Windows to EC2

On your **PC** (PowerShell), from the folder where the SSL files are:

```powershell
scp "CRT" "CA Bundle" "zimsonwatchcare.pfx" ubuntu@18.61.69.104:/tmp/ssl/
```

Rename on PC first if names have spaces, e.g.:

- `CRT` → `zimsonwatchcare.crt`
- `CA Bundle` → `zimsonwatchcare-ca-bundle.crt`
- The `.pfx` file (Personal Information icon) → `zimsonwatchcare.pfx`

```powershell
scp zimsonwatchcare.crt zimsonwatchcare-ca-bundle.crt zimsonwatchcare.pfx ubuntu@18.61.69.104:/tmp/ssl/
```

---

## Step 2 — On the server: build fullchain + private key

SSH into EC2:

```bash
sudo mkdir -p /etc/ssl/zimsonwatchcare
sudo chmod 700 /etc/ssl/zimsonwatchcare
```

### A) Private key from PFX (required)

Read the password from your **PFX Password** text file, then:

```bash
cd /tmp/ssl
export PFX_PASS='paste-password-here'

sudo openssl pkcs12 -in zimsonwatchcare.pfx -nocerts -nodes \
  -out /etc/ssl/zimsonwatchcare/privkey.pem \
  -password "pass:$PFX_PASS"

sudo chmod 600 /etc/ssl/zimsonwatchcare/privkey.pem
```

### B) Full chain (CRT + CA bundle)

```bash
sudo bash -c 'cat /tmp/ssl/zimsonwatchcare.crt /tmp/ssl/zimsonwatchcare-ca-bundle.crt > /etc/ssl/zimsonwatchcare/fullchain.pem'
sudo chmod 644 /etc/ssl/zimsonwatchcare/fullchain.pem
```

### C) Verify

```bash
sudo openssl x509 -in /etc/ssl/zimsonwatchcare/fullchain.pem -noout -subject -dates
sudo openssl rsa -in /etc/ssl/zimsonwatchcare/privkey.pem -check -noout
```

---

## Step 3 — Enable HTTPS in Nginx

```bash
cd ~/zimson_service_management
sudo cp deploy/nginx-zimsonwatchcare-ssl.conf /etc/nginx/sites-available/zimsonwatchcare
sudo ln -sf /etc/nginx/sites-available/zimsonwatchcare /etc/nginx/sites-enabled/zimsonwatchcare
sudo nginx -t
sudo systemctl reload nginx
```

**AWS security group:** allow inbound **443** (HTTPS).

---

## Step 4 — Update app `.env`

```env
APP_BASE_URL=https://zimsonwatchcare.com
MESSAGING_PUBLIC_BASE_URL=https://zimsonwatchcare.com
```

Restart Node:

```bash
cd ~/zimson_service_management
# Ctrl+C if npm start is in foreground, or: pm2 restart zimson
npm start
```

Open: **https://zimsonwatchcare.com** (no port number).

---

## Optional: one script

After files are in `/tmp/ssl/`:

```bash
cd ~/zimson_service_management
export PFX_PASS='your-pfx-password'
bash scripts/ssl-install-commercial.sh
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `nginx: certificate and key do not match` | Re-export key from same PFX; ensure CRT matches the cert in PFX |
| Browser “not secure” | CA bundle missing from fullchain — append CA Bundle file again |
| `502 Bad Gateway` | Node not running — `npm start` on port 4000 |
| HTTP still works without redirect | Switch to `nginx-zimsonwatchcare-ssl.conf` (redirects 80 → 443) |

---

## Let’s Encrypt (alternative)

If you prefer free auto-renewal instead of commercial certs:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d zimsonwatchcare.com -d www.zimsonwatchcare.com
```

Use commercial files above when your organization already paid for the certificate.
