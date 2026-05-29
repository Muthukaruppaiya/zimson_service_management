import { applyTemplate, getMessagingConfig, isEmailConfigured } from "./config";
import { escapeHtml, parseFromAddress, sendTransactionalEmail } from "./transactionalEmail";

export { getTransporter, resetSmtpTransporter } from "./smtpTransport";

export async function sendOtpEmail(toEmail: string, otpCode: string): Promise<void> {
  if (!isEmailConfigured()) {
    throw new Error("Email (SMTP) is not configured. Set SMTP credentials in Settings → SMS, email & WhatsApp.");
  }
  const cfg = getMessagingConfig().email;
  const from = parseFromAddress(cfg.from.includes("<") ? cfg.from : `Zimson Watch Care <${cfg.from}>`);
  const text = applyTemplate(cfg.otpTextTemplate, { otp: otpCode, "1": otpCode });
  const subject = cfg.otpSubject;
  const preheader = `Your verification code is ${otpCode}. Valid for 20 minutes.`;

  const plainLines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const intro =
    plainLines.length > 0
      ? plainLines
          .filter((l) => !l.includes(otpCode))
          .slice(0, 2)
          .join(" ")
      : "Use this code to complete verification on your Zimson account.";

  await sendTransactionalEmail({
    from: from.formatted,
    to: toEmail,
    subject,
    preheader,
    text,
    blocks: [
      { type: "paragraph", html: escapeHtml(intro) },
      { type: "otp", code: otpCode },
      {
        type: "paragraph",
        html: "Do not share this code with anyone. Zimson staff will never ask for your OTP.",
      },
    ],
  });
  console.log("[smtp] OTP email sent to", toEmail);
}
