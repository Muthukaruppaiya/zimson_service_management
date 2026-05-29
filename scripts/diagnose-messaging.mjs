/** Compare SMS/WhatsApp credentials in .env vs messaging_settings (RDS). */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

function normToken(v) {
  return String(v ?? "")
    .trim()
    .replace(/^bearer\s+/i, "");
}

function mask(t) {
  if (!t) return "(empty)";
  if (t.length <= 8) return `len=${t.length}`;
  return `len=${t.length} ${t.slice(0, 4)}…${t.slice(-4)}`;
}

const envSms = normToken(process.env.QIKBERRY_SMS_TOKEN);
const envWa = normToken(process.env.QIKCHAT_API_KEY);

const cert = path.resolve(process.cwd(), "certs", "global-bundle.pem");
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: fs.existsSync(cert) ? { rejectUnauthorized: true, ca: fs.readFileSync(cert) } : undefined },
});

try {
  const { rows } = await pool.query(
    `SELECT config FROM messaging_settings WHERE id = 1`,
  );
  const cfg = rows[0]?.config ?? {};
  const dbSms = normToken(cfg.smsToken);
  const dbWa = normToken(cfg.qikchatApiKey);

  console.log("--- SMS (Qikberry) ---");
  console.log(".env :", mask(envSms));
  console.log("DB   :", mask(dbSms));
  console.log("match:", envSms === dbSms && Boolean(envSms));

  console.log("--- WhatsApp (Qikchat) ---");
  console.log(".env :", mask(envWa));
  console.log("DB   :", mask(dbWa));
  console.log("match:", envWa === dbWa && Boolean(envWa));

  if (envSms && dbSms && envSms !== dbSms) {
    console.log("\n>>> SMS token in DATABASE differs from .env — app uses DATABASE first.");
    console.log(">>> Run:  node scripts/update-sms-settings.mjs   then restart the app.");
  }
} finally {
  await pool.end();
}
