# Deployment — zimsonwatchcare.com (EC2 + RDS + S3)

## Infrastructure summary

| Item | Value |
|------|--------|
| **EC2 public IP** | `18.61.69.104` |
| **Domain** | `zimsonwatchcare.com` (and `www`) |
| **RDS host** | `zimson-dev-db.cta2eesy8zfj.ap-south-2.rds.amazonaws.com` |
| **RDS port** | `5432` |
| **DB user** | `zimson` |
| **DB name** | Create `zimson` (recommended) or use `postgres` |
| **Files** | Amazon S3 (not local `uploads/` on server) |
| **SSL** | Nginx + Let’s Encrypt (step 2 — after app works on HTTP) |

## 1. DNS

Point A records to the server:

- `zimsonwatchcare.com` → `18.61.69.104`
- `www.zimsonwatchcare.com` → `18.61.69.104`

## 2. RDS — first-time database

From a machine that can reach RDS (EC2 in same VPC, or VPN):

```bash
npm run certs:rds
export RDSHOST="zimson-dev-db.cta2eesy8zfj.ap-south-2.rds.amazonaws.com"
psql "host=$RDSHOST port=5432 dbname=postgres user=zimson sslmode=verify-full sslrootcert=./certs/global-bundle.pem"
```

In `psql`:

```sql
CREATE DATABASE zimson;
\q
```

## 3. Application `.env` on server

```bash
cp env.production.example .env
# Edit: AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, SMTP, SMS, etc.
npm run certs:rds
```

Key variables:

- `DATABASE_URL` — see `env.production.example` (password `#` → `%23`)
- `PGSSLMODE=verify-full` + `PGSSLROOTCERT=./certs/global-bundle.pem`
- `FILES_STORAGE=s3` + `AWS_S3_*`
- `APP_BASE_URL=https://zimsonwatchcare.com`
- `MESSAGING_PUBLIC_BASE_URL=https://zimsonwatchcare.com`

## 4. S3 bucket

1. Create a **private** bucket in `ap-south-2` (e.g. `zimson-dev-uploads`).
2. IAM user or EC2 role with `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on `arn:aws:s3:::BUCKET/zimson/*`.
3. Set in `.env`:

```env
FILES_STORAGE=s3
AWS_REGION=ap-south-2
AWS_S3_BUCKET=your-bucket-name
AWS_S3_PREFIX=zimson
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

Uploaded files are stored in DB as `api/media/srf/...` or `api/media/quick-bill/...` and served via `GET /api/media/...` (presigned redirect to S3).

## 5. Build and run on EC2

### Prerequisites (once per server) — **Node 20.19+ required**

Ubuntu’s default Node is often **v18** — that causes:

- `EBADENGINE` warnings for `@aws-sdk/*`, `vite`, `react-router`
- `Vite requires Node.js version 20.19+`
- `npm run build` failing on strict `tsc` (use `npm run build` which runs **Vite only**)

Upgrade:

```bash
bash scripts/upgrade-node-ubuntu.sh
# or manually:
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs build-essential
node -v   # must be v20.19+ or v22.12+
```

Then reinstall dependencies **on the EC2 machine** (never copy `node_modules` from Windows):

```bash
cd ~/zimson_service_management
git pull
rm -rf node_modules
npm ci
```

**ARM64 EC2 (Graviton):** If `npm run build` fails with `Cannot find native binding` / `@rolldown/binding-linux-arm64-gnu`:

```bash
git pull
rm -rf node_modules
npm ci
# postinstall installs the ARM binding; if needed:
npm install @rolldown/binding-linux-arm64-gnu@1.0.0-rc.15
npm run build
```

Never copy `node_modules` from your Windows PC to the server.

### Install dependencies (fixes `concurrently: not found`, `tsx: not found`, `vite: not found`)

From the project folder (`~/zimson_service_management`):

```bash
cd ~/zimson_service_management
npm ci
```

If `npm ci` fails, use `npm install` instead. Do **not** use `npm install --omit=dev` before building — `vite` and `typescript` are required for `npm run build`.

Check binaries exist:

```bash
ls node_modules/.bin/concurrently node_modules/.bin/tsx node_modules/.bin/vite
```

### Production run (use this on the server — not `npm run dev`)

`npm run dev` is for your **PC only** (hot reload). On EC2 use:

```bash
cp env.production.example .env
# edit .env (DATABASE_URL, S3, SMTP, APP_BASE_URL, …)
npm run certs:rds
npm run build
NODE_ENV=production npm start
```

Migrations run automatically when the API starts.

Use **pm2** or **systemd** to keep the process running on port `4000`.

### Optional: dev mode on server (not recommended)

Only if you really need hot reload on EC2:

```bash
npm ci          # must install ALL dependencies first
npm run dev
```

## 6. Nginx (HTTP first)

```bash
sudo cp deploy/nginx-zimsonwatchcare.conf /etc/nginx/sites-available/zimsonwatchcare
sudo ln -sf /etc/nginx/sites-available/zimsonwatchcare /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Open `http://zimsonwatchcare.com` and confirm login/API.

## 7. SSL (later)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d zimsonwatchcare.com -d www.zimsonwatchcare.com
```

Then uncomment the HTTPS `server` blocks in `deploy/nginx-zimsonwatchcare.conf` and reload nginx.

Ensure `.env` uses `https://` for `APP_BASE_URL` and `MESSAGING_PUBLIC_BASE_URL`.

## 8. Security groups

- **EC2**: inbound 80, 443 from internet; 22 from your office IP only.
- **RDS**: inbound 5432 **only** from EC2 security group (not public internet).

## Local development

Keep using local Postgres in `.env`:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/zimson_service_management
FILES_STORAGE=local
```

Do not commit `.env` (contains secrets).
