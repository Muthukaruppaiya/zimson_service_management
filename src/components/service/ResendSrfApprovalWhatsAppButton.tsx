import { ApiError } from "../../lib/api";
import {
  resendSrfApprovalWhatsApp,
  srfApprovalWhatsAppMessage,
  type SrfApprovalWhatsAppResult,
} from "../../lib/srfApprovalWhatsApp";
import { isValidIndianMobile10 } from "../../lib/whatsappInvoiceUi";
import { useMessagingSend } from "../messaging/WhatsAppSendProvider";

type Props = {
  srfId: string;
  phone?: string;
  disabled?: boolean;
  className?: string;
  label?: string;
  busyLabel?: string;
  onResult?: (result: SrfApprovalWhatsAppResult) => void;
};

export function ResendSrfApprovalWhatsAppButton({
  srfId,
  phone,
  disabled,
  className,
  label = "Resend approval WhatsApp",
  busyLabel = "Sending…",
  onResult,
}: Props) {
  const { runWhatsAppSend, whatsappSending } = useMessagingSend();

  async function handleClick() {
    if (!srfId.trim()) return;
    if (phone != null && !isValidIndianMobile10(phone)) {
      const fail: SrfApprovalWhatsAppResult = {
        whatsappSent: false,
        whatsappReason: "Customer mobile (10 digits) is required.",
      };
      onResult?.(fail);
      return;
    }
    await runWhatsAppSend(async () => {
      try {
        const result = await resendSrfApprovalWhatsApp(srfId);
        onResult?.(result);
        if (result.whatsappSent) {
          return { ok: true, message: srfApprovalWhatsAppMessage(result) };
        }
        return {
          ok: false,
          message: result.whatsappReason || "WhatsApp was not sent. Check messaging settings.",
        };
      } catch (e) {
        const fail: SrfApprovalWhatsAppResult = {
          whatsappSent: false,
          whatsappReason: e instanceof ApiError ? e.message : "Could not resend approval WhatsApp.",
        };
        onResult?.(fail);
        return { ok: false, message: fail.whatsappReason ?? "Could not resend approval WhatsApp." };
      }
    });
  }

  return (
    <button
      type="button"
      disabled={disabled || whatsappSending || !srfId.trim()}
      onClick={() => void handleClick()}
      className={
        className ??
        "rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
      }
    >
      {whatsappSending ? busyLabel : label}
    </button>
  );
}

export { srfApprovalWhatsAppMessage };
