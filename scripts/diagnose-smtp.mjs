/**
 * Send a test email via SMTP from .env / DB settings.
 * Usage: node scripts/diagnose-smtp.mjs recipient@zimson.net
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import pg from "pg";

dotenv.config();

const to = process.argv[2]?.trim();
if (!to) {
  console.error("Usage: node scripts/diagnose-smtp.mjs <recipient@example.com>");
  process.exit(1);
}

function envFirst(...keys) {
  for (const k of keys) {
    const v = process.env[k]?.trim();
    if (v) return v;
  }
  return "";
}

async function loadSmtpFromDb() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  const cert = path.resolve(process.cwd(), "certs", "global-bundle.pem");
  const pool = new pg.Pool({
    connectionString: url,
    ssl: fs.existsSync(cert) ? { rejectUnauthorized: true, ca: fs.readFileSync(cert) } : undefined,
  });
  try {
    const { rows } = await pool.query(`SELECT config FROM messaging_settings WHERE id = 1`);
    const c = rows[0]?.config ?? {};
    return {
      host: c.smtpHost || envFirst("SMTP_HOST") || "smtp.gmail.com",
      port: Number(c.smtpPort || envFirst("SMTP_PORT") || 587),
      user: c.smtpUser || envFirst("SMTP_USER"),
      password: (c.smtpPassword || envFirst("SMTP_PASSWORD")).replace(/\s+/g, ""),
      from: c.smtpFrom || envFirst("SMTP_FROM") || c.smtpUser || envFirst("SMTP_USER"),
    };
  } finally {
    await pool.end();
  }
}

const smtp =
  (await loadSmtpFromDb()) ?? {
    host: envFirst("SMTP_HOST") || "smtp.gmail.com",
    port: Number(envFirst("SMTP_PORT") || 587),
    user: envFirst("SMTP_USER"),
    password: envFirst("SMTP_PASSWORD").replace(/\s+/g, ""),
    from: envFirst("SMTP_FROM") || envFirst("SMTP_USER"),
  };

if (!smtp.user || !smtp.password) {
  console.error("SMTP_USER / SMTP_PASSWORD missing in .env and messaging_settings.");
  process.exit(1);
}

const fromFormatted = smtp.from.includes("<") ? smtp.from : `Zimson Watch Care <${smtp.from}>`;
const envelopeFrom = smtp.user.includes("@") ? smtp.user : smtp.from;
const domain = (envelopeFrom.split("@")[1] || "zimsonwatchcare.com").toLowerCase();
const messageId = `<zimson-test-${Date.now()}@${domain}>`;

console.log("SMTP host:", smtp.host);
console.log("SMTP port:", smtp.port);
console.log("SMTP user (envelope):", envelopeFrom);
console.log("From header:", fromFormatted);
console.log("To:", to);
console.log("Message-ID:", messageId);
console.log("");

const transporter = nodemailer.createTransport({
  host: smtp.host,
  port: smtp.port,
  secure: smtp.port === 465,
  requireTLS: smtp.port === 587,
  auth: { user: smtp.user, pass: smtp.password },
});

try {
  const info = await transporter.sendMail({
    from: fromFormatted,
    to,
    subject: "Zimson SMTP test — deliverability check",
    text: `This is a test from Zimson Service Management.

If this lands in Spam, configure SPF, DKIM, and DMARC for: ${domain}
SMTP login: ${envelopeFrom}

Message-ID: ${messageId}

— Zimson IT`,
    html: `<p>This is a <strong>test</strong> from Zimson Service Management.</p>
<p>If this is in <strong>Spam</strong>, your IT team must add SPF/DKIM/DMARC for <code>${domain}</code>.</p>
<p>Envelope: <code>${envelopeFrom}</code><br>Message-ID: <code>${messageId}</code></p>`,
    envelope: { from: envelopeFrom, to },
    messageId,
    headers: { "X-Mailer": "Zimson-SMTP-Diagnostic" },
  });
  console.log("Accepted by SMTP server:", info.messageId || info.response);
  console.log("\nNext: check Inbox and Spam at", to);
  console.log("For @zimson.net: ask IT to search quarantine for Message-ID above.");
} catch (e) {
  console.error("SMTP send failed:", e instanceof Error ? e.message : e);
  process.exit(1);
}
