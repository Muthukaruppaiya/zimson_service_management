import { useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../lib/api";
import { resendSrfTrackingWhatsApp } from "../../lib/resendSrfTrackingWhatsApp";
import { ProcessSuccessModal } from "../ui/ProcessSuccessModal";
import { useEmailSend, useMessagingSend } from "../messaging/WhatsAppSendProvider";
import {
  IconEmail,
  IconHome,
  IconPrint,
  IconSpinner,
  IconWhatsApp,
  invoicePreviewIconBtn,
} from "./invoicePreviewIcons";

type Props = {
  srfReference: string;
  srfId: string;
  customerEmail?: string;
  onPrintSrf?: () => void;
};

const iconPrimary =
  `${invoicePreviewIconBtn} rounded-xl bg-rlx-green text-white shadow-sm hover:bg-rlx-green/90`;
const iconSecondary =
  `${invoicePreviewIconBtn} rounded-xl border border-rlx-rule bg-white text-stone-700 hover:bg-stone-50`;

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
        <div className="flex flex-wrap items-center justify-center gap-3">
          {onPrintSrf ? (
            <button
              type="button"
              disabled={busy}
              onClick={onPrintSrf}
              className={iconPrimary}
              title="Print SRF document"
              aria-label="Print SRF document"
            >
              <IconPrint className="h-6 w-6" />
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void resendWhatsApp()}
            className={iconPrimary}
            title={whatsappSending ? "Sending WhatsApp…" : "Resend WhatsApp"}
            aria-label={whatsappSending ? "Sending WhatsApp" : "Resend WhatsApp"}
          >
            {whatsappSending ? <IconSpinner className="h-6 w-6" /> : <IconWhatsApp className="h-6 w-6" />}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void resendEmail()}
            className={iconPrimary}
            title={emailSending ? "Sending email…" : "Resend email"}
            aria-label={emailSending ? "Sending email" : "Resend email"}
          >
            {emailSending ? <IconSpinner className="h-6 w-6" /> : <IconEmail className="h-6 w-6" />}
          </button>
          <Link to="/" className={iconSecondary} title="Home" aria-label="Home">
            <IconHome className="h-6 w-6" />
          </Link>
        </div>
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
