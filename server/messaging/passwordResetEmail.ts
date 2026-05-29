import { getMessagingConfig, isEmailConfigured } from "./config";
import { escapeHtml, parseFromAddress, sendTransactionalEmail } from "./transactionalEmail";

export async function sendPasswordResetEmail(
  toEmail: string,
  displayName: string,
  resetUrl: string,
): Promise<void> {
  if (!isEmailConfigured()) {
    throw new Error(
      "Email (SMTP) is not configured. Ask your administrator to set SMTP in Settings → SMS, email & WhatsApp.",
    );
  }
  const cfg = getMessagingConfig().email;
  const from = parseFromAddress(cfg.from.includes("<") ? cfg.from : `Zimson Watch Care <${cfg.from}>`);
  const name = displayName.trim() || "there";
  const subject = "Reset your Zimson password";
  const preheader = "Use the link below to choose a new password. Valid for 1 hour.";
  const linkLabel = "Reset your password";

  const text = `Hello ${name},

We received a request to reset the password for your Zimson Service Management account.

Open this email in HTML view and click the "Reset your password" button (valid for 1 hour).

If you cannot use the button, paste this link into your browser:
${resetUrl}

If you did not request this, ignore this email — your password will not change.

— Zimson Watch Care`;

  await sendTransactionalEmail({
    from: from.formatted,
    to: toEmail,
    subject,
    preheader,
    text,
    blocks: [
      {
        type: "paragraph",
        html: `Hello ${escapeHtml(name)},`,
      },
      {
        type: "paragraph",
        html: "We received a request to reset the password for your Zimson account. Click the button below to choose a new password.",
      },
      {
        type: "link",
        href: resetUrl,
        label: linkLabel,
      },
      {
        type: "paragraph",
        html: "<strong>This link expires in 1 hour.</strong> If the button does not open, go to <strong>zimsonwatchcare.com</strong>, choose <strong>Forgot password?</strong>, and request a new link.",
      },
      {
        type: "paragraph",
        html: "If you did not request a password reset, you can safely ignore this message.",
      },
    ],
  });
  console.log("[smtp] Password reset email sent to", toEmail);
}
