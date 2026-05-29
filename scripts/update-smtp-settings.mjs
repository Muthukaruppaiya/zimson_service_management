/** Sync SMTP_* from .env into messaging_settings (PostgreSQL). Run after changing mail credentials in .env. */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

function resolvePgSsl() {
  const mode = (process.env.PGSSLMODE ?? "").trim().toLowerCase();
  if (mode === "disable" || mode === "false") return false;

  const url = process.env.DATABASE_URL ?? "";
  const urlWantsSsl =
    /sslmode=(require|verify-full|verify-ca|prefer)/i.test(url) ||
    /ssl=true/i.test(url);

  if (!mode && !urlWantsSsl && process.env.PGSSLROOTCERT === undefined) {
    return undefined;
  }

  const certPath = path.resolve(
    process.env.PGSSLROOTCERT?.trim() || path.join(process.cwd(), "certs", "global-bundle.pem"),
  );

  const needsVerify =
    mode === "verify-full" ||
    mode === "verify-ca" ||
    /sslmode=verify-full/i.test(url) ||
    /sslmode=verify-ca/i.test(url);

  if (fs.existsSync(certPath)) {
    return { rejectUnauthorized: true, ca: fs.readFileSync(certPath) };
  }

  if (needsVerify || mode === "require" || urlWantsSsl) {
    console.error("[env:sync-smtp] RDS CA bundle not found at:", certPath);
    console.error("Run from project root:  npm run certs:rds");
    process.exit(1);
  }

  return undefined;
}

const user = process.env.SMTP_USER?.trim();
const password = (process.env.SMTP_PASSWORD ?? "").replace(/\s+/g, "");
if (!user || !password) {
  console.error("Set SMTP_USER and SMTP_PASSWORD in .env first.");
  process.exit(1);
}

const patch = {
  smtpHost: process.env.SMTP_HOST?.trim() || "smtp.gmail.com",
  smtpPort: Number(process.env.SMTP_PORT || "587"),
  smtpUser: user,
  smtpPassword: password,
  smtpFrom:
    process.env.SMTP_FROM?.trim() ||
    `Zimson Watch Care <${user}>`,
};

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: resolvePgSsl(),
});
try {
  const r = await pool.query(
    `UPDATE messaging_settings
     SET config = config || $1::jsonb,
         updated_at = now(),
         updated_by = 'env-sync'
     WHERE id = 1`,
    [JSON.stringify(patch)],
  );
  console.log("Updated messaging_settings rows:", r.rowCount);
} finally {
  await pool.end();
}
