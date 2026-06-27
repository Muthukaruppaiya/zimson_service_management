import { getMessagingConfig, isEmailConfigured } from "./config";
import {
  escapeHtml,
  normalizeEmailActionUrl,
  parseFromAddress,
  sendTransactionalEmail,
} from "./transactionalEmail";

export async function sendBrandVoucherEmail(input: {
  toEmail: string;
  customerName: string;
  srfReference: string;
  voucherCode: string;
  valueInr: number;
  validUntil?: string | null;
  trackingUrl: string;
}): Promise<void> {
  if (!isEmailConfigured()) {
    throw new Error("Email (SMTP) is not configured.");
  }
  normalizeEmailActionUrl(input.trackingUrl);
  const cfg = getMessagingConfig().email;
  const from = parseFromAddress(cfg.from.includes("<") ? cfg.from : `Zimson Watch Care <${cfg.from}>`);
  const name = input.customerName.trim() || "Customer";
  const ref = input.srfReference.trim();
  const code = input.voucherCode.trim();
  const amount = input.valueInr.toLocaleString("en-IN", { style: "currency", currency: "INR" });
  const validity = input.validUntil
    ? new Date(input.validUntil).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : null;
  const subject = `Your Zimson voucher — SRF ${ref}`;
  const preheader = `Voucher ${code} · ${amount} — redeem at any Zimson store.`;

  const text = `Hello ${name},

Regarding your service request ${ref}: brand could not complete the repair. Zimson has issued a store voucher for you.

Voucher code: ${code}
Voucher value: ${amount}${validity ? `\nValid until: ${validity}` : ""}

Present this voucher code at any Zimson store to redeem the amount.

Track your service request online:
${input.trackingUrl}

— Zimson Watch Care`;

  await sendTransactionalEmail({
    from: from.formatted,
    to: input.toEmail,
    subject,
    preheader,
    text,
    blocks: [
      { type: "paragraph", html: `Hello ${escapeHtml(name)},` },
      {
        type: "paragraph",
        html: `For service request <strong>SRF ${escapeHtml(ref)}</strong>, a brand credit voucher has been approved for you. Present the code below at any Zimson store.`,
      },
      {
        type: "paragraph",
        html: `<strong>Voucher code:</strong> <span style="font-family:monospace;font-size:18px;letter-spacing:0.08em;">${escapeHtml(code)}</span><br><strong>Value:</strong> ${escapeHtml(amount)}${validity ? `<br><strong>Valid until:</strong> ${escapeHtml(validity)}` : ""}`,
      },
      { type: "link", href: input.trackingUrl, label: "View service status", showUrlFallback: true },
      {
        type: "paragraph",
        html: "Keep this email for your records. If you did not expect this message, contact your Zimson store.",
      },
    ],
  });
  console.log("[smtp] Brand voucher email sent to", input.toEmail);
}
