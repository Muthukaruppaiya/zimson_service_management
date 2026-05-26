import { getMessagingConfig, isEmailConfigured } from "./config";
import { getTransporter } from "./smtpEmail";

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
  const name = displayName.trim() || "there";
  const subject = "Reset your Zimson Service password";
  const text = `Hello ${name},

We received a request to reset the password for your Zimson Service Management account.

Open this link to choose a new password (valid for 1 hour):
${resetUrl}

If you did not request this, you can ignore this email. Your password will not change until you use the link above.

— Team Zimson`;

  const html = `<p>Hello ${escapeHtml(name)},</p>
<p>We received a request to reset the password for your <strong>Zimson Service Management</strong> account.</p>
<p><a href="${escapeHtml(resetUrl)}" style="display:inline-block;padding:10px 18px;background:#1B3A8F;color:#F0DC90;text-decoration:none;font-weight:bold;border-radius:4px">Reset password</a></p>
<p style="font-size:13px;color:#444">Or copy this link into your browser:<br><a href="${escapeHtml(resetUrl)}">${escapeHtml(resetUrl)}</a></p>
<p style="font-size:12px;color:#666">This link expires in 1 hour. If you did not request a reset, ignore this email.</p>
<p style="color:#666;font-size:12px">— Team Zimson</p>`;

  await getTransporter().sendMail({
    from: cfg.from.includes("<") ? cfg.from : `Zimson Service <${cfg.from}>`,
    to: toEmail,
    subject,
    text,
    html,
  });
  console.log("[smtp] Password reset email sent to", toEmail);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
