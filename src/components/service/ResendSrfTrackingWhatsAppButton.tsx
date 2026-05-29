import { useState } from "react";
import { ApiError } from "../../lib/api";
import {
  resendSrfTrackingWhatsApp,
  srfTrackingCustomerNotifyMessage,
  type ResendSrfTrackingWhatsAppResult,
} from "../../lib/resendSrfTrackingWhatsApp";
import { isValidIndianMobile10 } from "../../lib/whatsappInvoiceUi";

type Props = {
  srfId: string;
  phone?: string;
  customerEmail?: string;
  disabled?: boolean;
  className?: string;
  label?: string;
  busyLabel?: string;
  onResult?: (result: ResendSrfTrackingWhatsAppResult) => void;
};

export function ResendSrfTrackingWhatsAppButton({
  srfId,
  phone,
  customerEmail,
  disabled,
  className,
  label = "Resend to customer",
  busyLabel = "Sending…",
  onResult,
}: Props) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (!srfId.trim()) return;
    if (phone != null && !isValidIndianMobile10(phone)) {
      onResult?.({
        whatsappSent: false,
        whatsappReason: "Customer mobile (10 digits) is required.",
        emailSent: false,
        emailReason: null,
      });
      return;
    }
    setBusy(true);
    try {
      const result = await resendSrfTrackingWhatsApp(srfId, customerEmail);
      onResult?.(result);
    } catch (e) {
      onResult?.({
        whatsappSent: false,
        whatsappReason: e instanceof ApiError ? e.message : "Could not resend to customer.",
        emailSent: false,
        emailReason: null,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      disabled={disabled || busy || !srfId.trim()}
      onClick={() => void handleClick()}
      className={
        className ??
        "rounded-lg border border-zimson-300 bg-white px-3 py-1.5 text-xs font-semibold text-zimson-900 hover:bg-zimson-50 disabled:cursor-not-allowed disabled:opacity-50"
      }
    >
      {busy ? busyLabel : label}
    </button>
  );
}

export { srfTrackingCustomerNotifyMessage, srfTrackingCustomerNotifyMessage as srfTrackingWhatsAppResultMessage };
