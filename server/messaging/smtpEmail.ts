import nodemailer from "nodemailer";
import { applyTemplate, getMessagingConfig, isEmailConfigured } from "./config";

let transporter: nodemailer.Transporter | null = null;

export function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter;
  const cfg = getMessagingConfig().email;
  transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    requireTLS: cfg.port === 587,
    auth: { user: cfg.user, pass: cfg.password },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 15_000,
  });
  return transporter;
}

export async function sendOtpEmail(toEmail: string, otpCode: string): Promise<void> {
  if (!isEmailConfigured()) {
    throw new Error("Email (SMTP) is not configured. Set SMTP credentials in Settings → SMS, email & WhatsApp.");
  }
  const cfg = getMessagingConfig().email;
  const text = applyTemplate(cfg.otpTextTemplate, { otp: otpCode, "1": otpCode });
  const html = `<p>${text.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p>
<p style="color:#666;font-size:12px">— Team Zimson</p>`;

  await getTransporter().sendMail({
    from: cfg.from.includes("<") ? cfg.from : `Zimson Service <${cfg.from}>`,
    to: toEmail,
    subject: cfg.otpSubject,
    text,
    html,
  });
  console.log("[smtp] OTP email sent to", toEmail);
}
