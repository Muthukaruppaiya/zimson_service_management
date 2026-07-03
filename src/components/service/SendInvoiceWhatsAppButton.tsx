import { sendInvoiceWhatsApp } from "../../lib/sendInvoiceWhatsApp";
import { invoiceWhatsAppResultMessage, isValidIndianMobile10 } from "../../lib/whatsappInvoiceUi";
import { useMessagingSend } from "../messaging/WhatsAppSendProvider";
import { IconSpinner, IconWhatsApp } from "./invoicePreviewIcons";

type Props = {
  phone: string;
  customerName: string;
  invoiceNumber: string;
  disabled?: boolean;
  className?: string;
  label?: string;
  busyLabel?: string;
  onResult?: (message: string, ok: boolean) => void;
  /** When set, uses this PDF instead of capturing `.service-invoice-print-root` on the page. */
  resolvePdfBlob?: () => Promise<Blob>;
  iconOnly?: boolean;
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
  resolvePdfBlob,
  iconOnly = false,
}: Props) {
  const { runWhatsAppSend, whatsappSending } = useMessagingSend();

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
    await runWhatsAppSend(async () => {
      try {
        const wa = await sendInvoiceWhatsApp({
          phone: p10,
          customerName: customerName.trim() || "Customer",
          invoiceNumber: invoiceNumber.trim(),
          pdfBlob: resolvePdfBlob ? await resolvePdfBlob() : undefined,
        });
        const msg = invoiceWhatsAppResultMessage(wa);
        const ok = Boolean(wa.messageId) || Boolean(wa.dryRun);
        onResult?.(msg, ok);
        return { ok, message: msg };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not send invoice on WhatsApp.";
        onResult?.(msg, false);
        return { ok: false, message: msg };
      }
    });
  }

  return (
    <button
      type="button"
      disabled={disabled || whatsappSending}
      onClick={() => void handleClick()}
      className={className}
      aria-label={label}
      title={label}
    >
      {whatsappSending ? (
        iconOnly ? <IconSpinner /> : busyLabel
      ) : iconOnly ? (
        <IconWhatsApp />
      ) : (
        label
      )}
    </button>
  );
}
