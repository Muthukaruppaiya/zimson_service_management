import { getMessagingConfig, isEmailConfigured } from "./config";
import {
  escapeHtml,
  normalizeEmailActionUrl,
  parseFromAddress,
  sendTransactionalEmail,
} from "./transactionalEmail";

export async function sendCustomerTrackingLinkEmail(
  toEmail: string,
  customerName: string,
  srfReference: string,
  trackingUrl: string,
): Promise<void> {
  if (!isEmailConfigured()) {
    throw new Error("Email (SMTP) is not configured.");
  }
  normalizeEmailActionUrl(trackingUrl);
  const cfg = getMessagingConfig().email;
  const from = parseFromAddress(cfg.from.includes("<") ? cfg.from : `Zimson Watch Care <${cfg.from}>`);
  const name = customerName.trim() || "Customer";
  const ref = srfReference.trim();
  const subject = `Track your service request — ${ref}`;
  const preheader = `View status and updates for ${ref} at Zimson Watch Care.`;
  const buttonLabel = "View service status";

  const text = `Hello ${name},

Your service request ${ref} is ready to track online.

Open this email in HTML view and click "${buttonLabel}".

If you cannot use the button, paste this link into your browser:
${trackingUrl}

— Zimson Watch Care`;

  await sendTransactionalEmail({
    from: from.formatted,
    to: toEmail,
    subject,
    preheader,
    text,
    blocks: [
      { type: "paragraph", html: `Hello ${escapeHtml(name)},` },
      {
        type: "paragraph",
        html: `You can follow the progress of your service request <strong>${escapeHtml(ref)}</strong> online. Click the button below to open your tracking page.`,
      },
      { type: "link", href: trackingUrl, label: buttonLabel, showUrlFallback: true },
      {
        type: "paragraph",
        html: "Bookmark this page to check updates at any time. If you did not request this email, you can ignore it.",
      },
    ],
  });
  console.log("[smtp] Customer tracking link email sent to", toEmail);
}
