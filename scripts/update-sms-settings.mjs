/** Sync QIKBERRY_SMS_* from .env into messaging_settings (PostgreSQL). Run after rotating SMS token. */
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
    console.error("[env:sync-sms] RDS CA bundle not found at:", certPath);
    console.error("Run from project root:  npm run certs:rds");
    process.exit(1);
  }

  return undefined;
}

const token = (process.env.QIKBERRY_SMS_TOKEN ?? "").trim().replace(/^bearer\s+/i, "");
const templateId = (process.env.QIKBERRY_SMS_TEMPLATE_ID ?? "").trim();
if (!token || !templateId) {
  console.error("Set QIKBERRY_SMS_TOKEN and QIKBERRY_SMS_TEMPLATE_ID in .env first.");
  process.exit(1);
}

const defaultOtpMessage =
  "Dear Customer, Your One Time Password is {{1}}. Please use this code to complete your verification - ZIMSON";

const patch = {
  smsUrl: process.env.QIKBERRY_SMS_URL?.trim() || "https://rest.qikberry.ai/v1/sms/messages",
  smsToken: token,
  smsTemplateId: templateId,
  smsSender: process.env.QIKBERRY_SMS_SENDER?.trim() || "ZIMSON",
  smsService: process.env.QIKBERRY_SMS_SERVICE?.trim() || "SI",
  smsOtpMessageTemplate:
    process.env.QIKBERRY_SMS_OTP_MESSAGE?.trim() || defaultOtpMessage,
  smsEnabled: true,
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
  console.log("SMS template_id:", templateId, "| sender:", patch.smsSender);
} finally {
  await pool.end();
}
