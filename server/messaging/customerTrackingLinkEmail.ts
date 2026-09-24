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
  opts?: { pdfBuffer?: Buffer; documentFilename?: string },
): Promise<void> {
  if (!isEmailConfigured()) {
    throw new Error("Email (SMTP) is not configured.");
  }
  normalizeEmailActionUrl(trackingUrl);
  const cfg = getMessagingConfig().email;
  const from = parseFromAddress(cfg.from.includes("<") ? cfg.from : `Zimson Watch Care <${cfg.from}>`);
  const name = customerName.trim() || "Customer";
  const ref = srfReference.trim();
  const subject = `Your Zimson service request — ${ref}`;
  const preheader = `SRF ${ref} registered. Track your watch service online.`;
  const buttonLabel = "Track my service";
  const hasPdf = Boolean(opts?.pdfBuffer && opts.pdfBuffer.length > 100);
  const filename = (opts?.documentFilename?.trim() || `Zimson-SRF-${ref}.pdf`).replace(/[^\w.-]+/g, "_");

  const text = `Hello ${name},

Your service request form (SRF) ${ref} has been registered at Zimson Watch Care.

Please keep the printed SRF copy you received at the store for your records.
${hasPdf ? "\nA PDF copy of your SRF is attached.\n" : ""}
Track repair status online — open this email in HTML view and click "${buttonLabel}".

If the button does not open, paste this link into your browser:
${trackingUrl}

— Zimson Watch Care`;

  await sendTransactionalEmail({
    from: from.formatted,
    to: toEmail,
    subject,
    preheader,
    text,
    attachments: hasPdf
      ? [{ filename, content: opts!.pdfBuffer, contentType: "application/pdf" }]
      : undefined,
    blocks: [
      { type: "paragraph", html: `Hello ${escapeHtml(name)},` },
      {
        type: "paragraph",
        html: `Your service request form <strong>(SRF ${escapeHtml(ref)})</strong> is registered. Please keep the printed copy from the store. Use the button below to track repair status online at any time.`,
      },
      { type: "link", href: trackingUrl, label: buttonLabel, showUrlFallback: true },
      {
        type: "paragraph",
        html: hasPdf
          ? "A PDF copy of your SRF is attached. Bookmark the tracking page to check updates at any time. If you did not request this email, you can ignore it."
          : "Bookmark this page to check updates at any time. If you did not request this email, you can ignore it.",
      },
    ],
  });
  console.log("[smtp] Customer tracking link email sent to", toEmail, hasPdf ? "(PDF attached)" : "");
}
