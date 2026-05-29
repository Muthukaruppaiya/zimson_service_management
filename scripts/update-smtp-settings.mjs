/** Sync SMTP_* from .env into messaging_settings (PostgreSQL). Run after changing mail credentials in .env. */
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

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

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
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
