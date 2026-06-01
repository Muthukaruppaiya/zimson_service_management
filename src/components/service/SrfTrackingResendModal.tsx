import { useEffect, useState } from "react";
import { ApiError } from "../../lib/api";
import { LOTTIE_WHATSAPP_SENDING } from "../../lib/lottieAssets";
import {
  resendSrfTrackingWhatsApp,
  type ResendSrfTrackingWhatsAppResult,
} from "../../lib/resendSrfTrackingWhatsApp";
import { isValidIndianMobile10 } from "../../lib/whatsappInvoiceUi";
import { DeliveryAckModal } from "../ui/DeliveryAckModal";
import { LottieAnimation } from "../ui/LottieAnimation";

type Props = {
  open: boolean;
  onClose: () => void;
  srfId: string;
  srfReference: string;
  phone: string;
  customerEmail: string;
  emailSent: boolean;
  whatsappSent: boolean;
  onComplete: (result: ResendSrfTrackingWhatsAppResult) => void;
};

function ChannelRow({
  label,
  detail,
  ok,
  hint,
}: {
  label: string;
  detail: string;
  ok: boolean;
  hint?: string | null;
}) {
  return (
    <div
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${
        ok ? "border-emerald-200/80 bg-emerald-50/90" : "border-amber-200/80 bg-amber-50/90"
      }`}
    >
      <span
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
          ok ? "bg-emerald-600 text-white" : "bg-amber-500 text-white"
        }`}
        aria-hidden
      >
        {ok ? "✓" : "!"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-stone-900">{label}</p>
        <p className="mt-0.5 text-xs text-stone-600">{detail}</p>
        {hint && !ok ? <p className="mt-1 text-xs text-amber-900">{hint}</p> : null}
      </div>
    </div>
  );
}

export function SrfTrackingResendModal({
  open,
  onClose,
  srfId,
  srfReference,
  phone,
  customerEmail,
  emailSent,
  whatsappSent,
  onComplete,
}: Props) {
  const [emailOverride, setEmailOverride] = useState(customerEmail);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) setEmailOverride(customerEmail);
  }, [open, customerEmail]);
  const [ack, setAck] = useState<{ variant: "success" | "error"; title: string; message?: string } | null>(
    null,
  );

  if (!open) return null;

  const phoneOk = isValidIndianMobile10(phone);
  const emailValue = emailOverride.trim();

  async function handleSend() {
    if (!srfId.trim()) return;
    if (!phoneOk) {
      setAck({
        variant: "error",
        title: "Mobile number required",
        message: "Customer must have a valid 10-digit mobile number for WhatsApp.",
      });
      return;
    }
    setSending(true);
    setAck(null);
    try {
      const result = await resendSrfTrackingWhatsApp(srfId, emailValue || undefined);
      onComplete(result);
      const anySent = result.whatsappSent || result.emailSent;
      const lines: string[] = [];
      if (result.whatsappSent) lines.push("WhatsApp delivered with tracking link.");
      else if (result.whatsappReason) lines.push(`WhatsApp: ${result.whatsappReason}`);
      if (result.emailSent) lines.push("Email delivered with tracking link.");
      else if (result.emailReason) lines.push(`Email: ${result.emailReason}`);
      setAck({
        variant: anySent ? "success" : "error",
        title: anySent ? "Tracking link resent" : "Could not send",
        message: lines.join(" ") || undefined,
      });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Could not resend tracking link.";
      setAck({ variant: "error", title: "Send failed", message: msg });
    } finally {
      setSending(false);
    }
  }

  function handleAckClose() {
    setAck(null);
    if (ack?.variant === "success") onClose();
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[240] flex items-end justify-center bg-stone-900/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="srf-resend-title"
        onClick={() => !sending && onClose()}
      >
        <div
          className="w-full max-w-md overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="border-b border-rlx-gold/25 bg-gradient-to-br from-rlx-green-deep via-rlx-green to-[#2549a8] px-5 py-4 text-white">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-rlx-gold">Customer notify</p>
            <h2 id="srf-resend-title" className="mt-1 font-display text-xl font-semibold">
              Resend tracking link
            </h2>
            <p className="mt-1 text-xs text-white/80">
              SRF <span className="font-mono font-semibold text-rlx-gold">{srfReference}</span> — online status &
              estimate updates
            </p>
          </div>

          <div className="max-h-[min(70vh,28rem)] space-y-4 overflow-y-auto px-5 py-5">
            <p className="text-sm text-stone-600">
              Sends the same tracking page link as on booking (WhatsApp + email when configured).
            </p>

            <label className="block text-sm">
              <span className="text-xs font-medium text-stone-600">Customer mobile</span>
              <input
                readOnly
                value={phone || "—"}
                className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 font-mono text-sm text-stone-800"
              />
            </label>

            <label className="block text-sm">
              <span className="text-xs font-medium text-stone-600">Email (optional override)</span>
              <input
                type="email"
                value={emailOverride}
                onChange={(e) => setEmailOverride(e.target.value)}
                disabled={sending}
                placeholder="customer@email.com"
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm focus:border-rlx-green focus:outline-none focus:ring-2 focus:ring-rlx-green/20"
              />
            </label>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Last delivery status</p>
              <ChannelRow
                label="WhatsApp"
                detail={phoneOk ? `To ${phone}` : "Invalid or missing mobile"}
                ok={whatsappSent}
                hint={!phoneOk ? "Fix customer phone on SRF before resending." : null}
              />
              <ChannelRow
                label="Email"
                detail={emailValue || "No email on file"}
                ok={emailSent}
                hint={!emailValue ? "Add email above to send tracking by email." : null}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-stone-100 bg-stone-50/80 px-5 py-4">
            <button
              type="button"
              disabled={sending}
              onClick={onClose}
              className="flex-1 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-50 sm:flex-none"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={sending || !phoneOk}
              onClick={() => void handleSend()}
              className="flex-1 rounded-xl bg-gradient-to-r from-rlx-green to-[#2549a8] px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
            >
              Send tracking link
            </button>
          </div>
        </div>
      </div>

      {sending ? (
        <div
          className="fixed inset-0 z-[250] flex flex-col items-center justify-center bg-stone-900/75 px-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-busy="true"
        >
          <div className="w-full max-w-xs rounded-2xl bg-white px-6 py-8 text-center shadow-2xl">
            <LottieAnimation
              src={LOTTIE_WHATSAPP_SENDING}
              className="mx-auto h-40 w-40"
              ariaLabel="Sending tracking link"
            />
            <h3 className="mt-2 text-base font-semibold text-zimson-950">Sending tracking link…</h3>
            <p className="mt-2 text-sm text-stone-600">
              WhatsApp and email (if available). Please wait.
            </p>
          </div>
        </div>
      ) : null}

      <DeliveryAckModal
        open={ack != null}
        variant={ack?.variant ?? "success"}
        title={ack?.title ?? ""}
        message={ack?.message}
        onClose={handleAckClose}
      />
    </>
  );
}
