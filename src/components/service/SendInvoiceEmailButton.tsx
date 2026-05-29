import { useState } from "react";
import { sendInvoiceEmail } from "../../lib/sendInvoiceEmail";

type Props = {
  email: string;
  customerName: string;
  invoiceNumber: string;
  totalInr?: number | null;
  disabled?: boolean;
  className?: string;
  label?: string;
  busyLabel?: string;
  onResult?: (message: string, ok: boolean) => void;
};

function isValidEmail(value: string): boolean {
  const s = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export function SendInvoiceEmailButton({
  email,
  customerName,
  invoiceNumber,
  totalInr,
  disabled,
  className,
  label = "Send by email",
  busyLabel = "Sending…",
  onResult,
}: Props) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    const to = email.trim();
    if (!isValidEmail(to)) {
      onResult?.("Customer email is required to send the invoice.", false);
      return;
    }
    if (!invoiceNumber.trim()) {
      onResult?.("Invoice number is missing.", false);
      return;
    }
    setBusy(true);
    try {
      await sendInvoiceEmail({
        email: to,
        customerName: customerName.trim() || "Customer",
        invoiceNumber: invoiceNumber.trim(),
        totalInr,
      });
      onResult?.("Invoice sent by email successfully.", true);
    } catch (e) {
      onResult?.(e instanceof Error ? e.message : "Could not send invoice by email.", false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" disabled={disabled || busy} onClick={() => void handleClick()} className={className}>
      {busy ? busyLabel : label}
    </button>
  );
}
