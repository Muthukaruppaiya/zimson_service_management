import { getMessagingConfig, isEmailConfigured } from "./config";
import { escapeHtml, parseFromAddress, sendTransactionalEmail } from "./transactionalEmail";

export async function sendBrandCannotRepairEmail(input: {
  toEmail: string;
  customerName: string;
  srfReference: string;
  watchLabel: string;
  reason: string;
  storeCredit?: { code: string; valueInr: number; validUntil?: string | null } | null;
}): Promise<void> {
  if (!isEmailConfigured()) {
    throw new Error("Email (SMTP) is not configured.");
  }
  const cfg = getMessagingConfig().email;
  const from = parseFromAddress(cfg.from.includes("<") ? cfg.from : `Zimson Watch Care <${cfg.from}>`);
  const name = input.customerName.trim() || "Customer";
  const ref = input.srfReference.trim();
  const watch = input.watchLabel.trim();
  const reason = input.reason.trim();
  const credit = input.storeCredit;
  const creditAmount = credit
    ? credit.valueInr.toLocaleString("en-IN", { style: "currency", currency: "INR" })
    : "";
  const creditValidity = credit?.validUntil
    ? new Date(credit.validUntil).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "";

  const subject = `Service request ${ref} cancelled — brand could not repair`;
  const preheader = `The brand could not repair your ${watch || "watch"}. SRF ${ref} has been cancelled.`;

  const creditText = credit
    ? `\n\nStore credit for the advance you paid:\nCode: ${credit.code}\nValue: ${creditAmount}${creditValidity ? `\nValid until: ${creditValidity}` : ""}\nRedeem at any Zimson store.`
    : "";

  const text = `Hello ${name},

The brand service centre has informed us that your ${watch || "watch"} cannot be repaired. Service request ${ref} has been cancelled.

Reason: ${reason}${creditText}

Your Zimson store will contact you. For any questions, please contact the store with your SRF reference.

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
        html: `The brand service centre has informed us that your <strong>${escapeHtml(watch || "watch")}</strong> cannot be repaired. Service request <strong>SRF ${escapeHtml(ref)}</strong> has been cancelled.`,
      },
      { type: "paragraph", html: `<strong>Reason:</strong> ${escapeHtml(reason)}` },
      ...(credit
        ? [
            {
              type: "paragraph" as const,
              html: `<strong>Store credit for your advance:</strong> <span style="font-family:monospace;font-size:16px;letter-spacing:0.06em;">${escapeHtml(credit.code)}</span> · ${escapeHtml(creditAmount)}${creditValidity ? ` · valid until ${escapeHtml(creditValidity)}` : ""}. Redeem at any Zimson store.`,
            },
          ]
        : []),
      {
        type: "paragraph",
        html: "Your Zimson store will contact you. For any questions, please contact the store with your SRF reference.",
      },
    ],
  });
  console.log("[smtp] Brand cannot-repair email sent to", input.toEmail);
}
