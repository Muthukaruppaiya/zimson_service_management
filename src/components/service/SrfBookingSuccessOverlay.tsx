import { useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../lib/api";
import { resendSrfTrackingWhatsApp } from "../../lib/resendSrfTrackingWhatsApp";
import { ProcessSuccessModal } from "../ui/ProcessSuccessModal";
import { useEmailSend, useMessagingSend } from "../messaging/WhatsAppSendProvider";

type Props = {
  srfReference: string;
  srfId: string;
  customerEmail?: string;
  onPrintSrf?: () => void;
};

const btnPrimary =
  "inline-flex w-full min-w-0 items-center justify-center rounded-xl bg-rlx-green px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rlx-green/90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto";
const btnSecondary =
  "inline-flex w-full min-w-0 items-center justify-center rounded-xl border border-rlx-rule bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto";

export function SrfBookingSuccessOverlay({
  srfReference,
  srfId,
  customerEmail = "",
  onPrintSrf,
}: Props) {
  const [note, setNote] = useState<string | null>(null);
  const { runWhatsAppSend, whatsappSending } = useMessagingSend();
  const { runEmailSend, emailSending } = useEmailSend();
  const busy = whatsappSending || emailSending;

  async function resendWhatsApp() {
    setNote(null);
    await runWhatsAppSend(async () => {
      try {
        const result = await resendSrfTrackingWhatsApp(srfId, customerEmail, "whatsapp");
        const msg = result.whatsappSent
          ? "Tracking link sent on WhatsApp."
          : result.whatsappReason || "Could not send WhatsApp.";
        setNote(msg);
        return { ok: result.whatsappSent, message: msg };
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : "Could not send WhatsApp.";
        setNote(msg);
        return { ok: false, message: msg };
      }
    });
  }

  async function resendEmail() {
    setNote(null);
    await runEmailSend(async () => {
      try {
        const result = await resendSrfTrackingWhatsApp(srfId, customerEmail, "email");
        const msg = result.emailSent
          ? "Tracking link sent by email."
          : result.emailReason || "Could not send email.";
        setNote(msg);
        return { ok: result.emailSent, message: msg };
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : "Could not send email.";
        setNote(msg);
        return { ok: false, message: msg };
      }
    });
  }

  return (
    <ProcessSuccessModal
      open
      title="SRF booked successfully"
      actions={
        <>
          {onPrintSrf ? (
            <button
              type="button"
              disabled={busy}
              onClick={onPrintSrf}
              className={btnPrimary}
            >
              Print SRF document
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void resendWhatsApp()}
            className={btnPrimary}
          >
            {whatsappSending ? "Sending…" : "Resend WhatsApp"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void resendEmail()}
            className={btnPrimary}
          >
            {emailSending ? "Sending…" : "Resend email"}
          </button>
          <Link to="/" className={btnSecondary}>
            Home
          </Link>
        </>
      }
    >
      <div className="rounded-xl border-2 border-rlx-green/30 bg-rlx-green/5 px-4 py-3 text-center">
        <p className="text-[10px] font-bold uppercase tracking-wider text-rlx-green">SRF reference</p>
        <p className="mt-1 font-mono text-2xl font-bold text-stone-900">{srfReference}</p>
      </div>
      {note ? (
        <p className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-center text-sm text-sky-900">
          {note}
        </p>
      ) : null}
    </ProcessSuccessModal>
  );
}
