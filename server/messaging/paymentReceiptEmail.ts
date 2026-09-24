import { getMessagingConfig, isEmailConfigured } from "./config";
import { buildDeliverabilityMailOptions } from "./emailDeliverability";
import { escapeHtml, normalizeEmailActionUrl, parseFromAddress } from "./transactionalEmail";
import { getTransporter } from "./smtpTransport";

export async function sendPaymentReceiptEmail(input: {
  toEmail: string;
  customerName: string;
  srfReference: string;
  receiptNo: string;
  amountLabel: string;
  receiptUrl: string;
  pdfBuffer: Buffer;
}): Promise<void> {
  if (!isEmailConfigured()) {
    throw new Error("Email (SMTP) is not configured.");
  }
  const to = input.toEmail.trim().toLowerCase();
  if (!to) throw new Error("Customer email is required.");
  const url = normalizeEmailActionUrl(input.receiptUrl);
  const cfg = getMessagingConfig().email;
  const from = parseFromAddress(cfg.from.includes("<") ? cfg.from : `Zimson Watch Care <${cfg.from}>`);
  const name = input.customerName.trim() || "Customer";
  const ref = input.srfReference.trim();
  const receiptNo = input.receiptNo.trim();
  const subject = `Your Zimson payment receipt — ${receiptNo}`;
  const preheader = `Payment received for SRF ${ref}. Open or download your receipt.`;
  const filename = `${receiptNo.replace(/[^\w.-]+/g, "_")}.pdf`;

  const text = `Hello ${name},

We received ${input.amountLabel} against SRF ${ref}.

View / download your payment receipt:
${url}

A PDF copy is also attached.

— Zimson Watch Care`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
    <tr><td align="center" style="padding:28px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e4e4e7;border-radius:8px;">
        <tr><td style="padding:28px 28px 8px;border-bottom:3px solid #C9A227;">
          <p style="margin:0;font-size:18px;font-weight:700;color:#1B3A8F;">Zimson Watch Care</p>
        </td></tr>
        <tr><td style="padding:24px 28px 28px;">
          <p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#27272a;">Hello ${escapeHtml(name)},</p>
          <p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#27272a;">
            We received <strong>${escapeHtml(input.amountLabel)}</strong> against SRF <strong>${escapeHtml(ref)}</strong>
            (receipt ${escapeHtml(receiptNo)}).
          </p>
          <p style="margin:0 0 18px;">
            <a href="${url.replace(/"/g, "&quot;")}" style="display:inline-block;background:#1B3A8F;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;border-radius:8px;border:2px solid #C9A227;">
              View / download receipt
            </a>
          </p>
          <p style="margin:0;font-size:13px;line-height:1.5;color:#71717a;">A PDF copy is attached. This is a payment acknowledgement, not a tax invoice.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const mail = buildDeliverabilityMailOptions({
    fromFormatted: from.formatted,
    to,
    subject,
    text,
    html,
    attachments: [
      {
        filename,
        content: input.pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
  await getTransporter().sendMail(mail);
  console.log("[smtp] Payment receipt email sent to", to, "|", receiptNo);
}
