import { sendInvoiceEmail } from "../../lib/sendInvoiceEmail";
import { useEmailSend } from "../messaging/WhatsAppSendProvider";
import { IconEmail, IconSpinner } from "./invoicePreviewIcons";

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
  /** When set, uses this PDF instead of capturing `.service-invoice-print-root` on the page. */
  resolvePdfBlob?: () => Promise<Blob>;
  iconOnly?: boolean;
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
  resolvePdfBlob,
  iconOnly = false,
}: Props) {
  const { runEmailSend, emailSending } = useEmailSend();

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
    await runEmailSend(async () => {
      try {
        await sendInvoiceEmail({
          email: to,
          customerName: customerName.trim() || "Customer",
          invoiceNumber: invoiceNumber.trim(),
          totalInr,
          pdfBlob: resolvePdfBlob ? await resolvePdfBlob() : undefined,
        });
        const msg = "Invoice sent by email successfully.";
        onResult?.(msg, true);
        return { ok: true, message: msg };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not send invoice by email.";
        onResult?.(msg, false);
        return { ok: false, message: msg };
      }
    });
  }

  return (
    <button
      type="button"
      disabled={disabled || emailSending}
      onClick={() => void handleClick()}
      className={className}
      aria-label={label}
      title={label}
    >
      {emailSending ? (
        iconOnly ? <IconSpinner /> : busyLabel
      ) : iconOnly ? (
        <IconEmail />
      ) : (
        label
      )}
    </button>
  );
}
