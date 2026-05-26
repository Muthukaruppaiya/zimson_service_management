import { useState } from "react";
import { sendInvoiceWhatsApp } from "../../lib/sendInvoiceWhatsApp";
import { invoiceWhatsAppResultMessage, isValidIndianMobile10 } from "../../lib/whatsappInvoiceUi";

type Props = {
  phone: string;
  customerName: string;
  invoiceNumber: string;
  disabled?: boolean;
  className?: string;
  label?: string;
  busyLabel?: string;
  onResult?: (message: string, ok: boolean) => void;
};

export function SendInvoiceWhatsAppButton({
  phone,
  customerName,
  invoiceNumber,
  disabled,
  className,
  label = "Resend WhatsApp",
  busyLabel = "Sending…",
  onResult,
}: Props) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    const p10 = phone.replace(/\D/g, "").slice(-10);
    if (!isValidIndianMobile10(p10)) {
      onResult?.("Customer mobile (10 digits) is required for WhatsApp delivery.", false);
      return;
    }
    if (!invoiceNumber.trim()) {
      onResult?.("Invoice number is missing.", false);
      return;
    }
    setBusy(true);
    try {
      const wa = await sendInvoiceWhatsApp({
        phone: p10,
        customerName: customerName.trim() || "Customer",
        invoiceNumber: invoiceNumber.trim(),
      });
      const msg = invoiceWhatsAppResultMessage(wa);
      onResult?.(msg, Boolean(wa.messageId) || Boolean(wa.dryRun));
    } catch (e) {
      onResult?.(e instanceof Error ? e.message : "Could not send invoice on WhatsApp.", false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={() => void handleClick()}
      className={className}
    >
      {busy ? busyLabel : label}
    </button>
  );
}
