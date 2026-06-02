import { getMessagingConfig, isEmailConfigured } from "./config";
import { buildDeliverabilityMailOptions } from "./emailDeliverability";
import { escapeHtml, parseFromAddress } from "./transactionalEmail";
import { getTransporter } from "./smtpTransport";

export async function sendCustomerInvoiceEmail(input: {
  toEmail: string;
  customerName: string;
  invoiceNumber: string;
  totalInr?: number | null;
  pdfBuffer: Buffer;
  pdfFilename: string;
}): Promise<void> {
  if (!isEmailConfigured()) {
    throw new Error("Email (SMTP) is not configured. Set SMTP in Settings → SMS, email & WhatsApp.");
  }

  const to = input.toEmail.trim().toLowerCase();
  if (!to) throw new Error("Customer email is required.");

  const cfg = getMessagingConfig().email;
  const from = parseFromAddress(cfg.from.includes("<") ? cfg.from : `Zimson Watch Care <${cfg.from}>`);
  const name = input.customerName.trim() || "Customer";
  const inv = input.invoiceNumber.trim();
  const total =
    input.totalInr != null && Number.isFinite(input.totalInr)
      ? `₹${input.totalInr.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : null;

  const subject = `Your Zimson invoice — ${inv}`;
  const preheader = total ? `Invoice ${inv} · ${total}` : `Invoice ${inv} from Zimson Watch Care`;

  const text = `Hello ${name},

Please find your service invoice ${inv}${total ? ` (${total})` : ""} attached as a PDF.

Thank you for choosing Zimson Watch Care.

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
            Your invoice <strong>${escapeHtml(inv)}</strong>${total ? ` for <strong>${escapeHtml(total)}</strong>` : ""} is attached to this email as a PDF.
          </p>
          <p style="margin:0;font-size:13px;line-height:1.5;color:#71717a;">
            This is an automated message from Zimson Service Management.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const filename = input.pdfFilename.trim() || `Zimson-Invoice-${inv.replace(/[^\w.-]+/g, "_")}.pdf`;

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

  console.log("[smtp] Invoice email sent to", to, "|", inv);
}
