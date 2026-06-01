import { useState } from "react";
import { Link } from "react-router-dom";
import type { ResendSrfTrackingWhatsAppResult } from "../../lib/resendSrfTrackingWhatsApp";
import { SrfTrackingResendModal } from "./SrfTrackingResendModal";

type NotifyState = { sent: boolean; reason: string | null };

type Props = {
  srfReference: string;
  srfId: string;
  statusTitle: string;
  statusHint: string;
  customerName: string;
  phone: string;
  customerEmail: string;
  trackingUrl: string | null;
  emailState: NotifyState | null;
  whatsappState: NotifyState | null;
  onPrint: () => void;
  onNotifyUpdate: (result: ResendSrfTrackingWhatsAppResult) => void;
};

function NotifyBadge({ label, sent, reason }: { label: string; sent: boolean; reason: string | null }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
        sent ? "border-emerald-200/90 bg-white/95" : "border-amber-200/90 bg-white/90"
      }`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg ${
          sent ? "bg-emerald-600 text-white" : "bg-amber-100 text-amber-800"
        }`}
        aria-hidden
      >
        {sent ? "✓" : "○"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-stone-900">{label}</p>
        <p className={`text-xs ${sent ? "text-emerald-800" : "text-amber-900"}`}>
          {sent
            ? "Delivered to customer"
            : reason?.trim() || "Not sent — use Resend below"}
        </p>
      </div>
    </div>
  );
}

export function SrfBookingSuccessOverlay({
  srfReference,
  srfId,
  statusTitle,
  statusHint,
  customerName,
  phone,
  customerEmail,
  trackingUrl,
  emailState,
  whatsappState,
  onPrint,
  onNotifyUpdate,
}: Props) {
  const [resendOpen, setResendOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyTrackingLink() {
    if (!trackingUrl) return;
    try {
      await navigator.clipboard.writeText(trackingUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      /* ignore */
    }
  }

  const emailSent = Boolean(emailState?.sent);
  const whatsappSent = Boolean(whatsappState?.sent);

  return (
    <>
      <div className="fixed inset-0 z-40 overflow-y-auto bg-gradient-to-b from-stone-900/50 via-rlx-green/10 to-stone-100/95 backdrop-blur-[2px]">
        <div className="mx-auto flex min-h-full max-w-lg flex-col justify-center px-4 py-8 sm:py-12">
          <div className="overflow-hidden rounded-2xl border border-rlx-gold/20 bg-white shadow-2xl ring-1 ring-black/5">
            <header className="border-b border-rlx-gold/30 bg-gradient-to-br from-rlx-green-deep via-rlx-green to-[#2549a8] px-5 py-5 text-white sm:px-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-rlx-gold">
                    Zimson service care
                  </p>
                  <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight sm:text-[1.65rem]">
                    SRF booked successfully
                  </h1>
                </div>
                <span
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-rlx-gold text-xl font-bold text-rlx-green-deep shadow-lg"
                  aria-hidden
                >
                  ✓
                </span>
              </div>
              <div className="mt-1 h-0.5 w-full bg-gradient-to-r from-transparent via-rlx-gold/80 to-transparent" />
            </header>

            <div className="space-y-5 px-5 py-6 sm:px-6">
              <div className="rounded-xl border border-rlx-rule bg-gradient-to-br from-rlx-green-light/40 to-white p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-rlx-gold-dark">
                  Service reference
                </p>
                <p className="mt-1 font-mono text-2xl font-bold tracking-tight text-rlx-green sm:text-[1.75rem]">
                  {srfReference}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-rlx-green px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
                    {statusTitle}
                  </span>
                  <span className="text-sm text-stone-600">{statusHint}</span>
                </div>
              </div>

              {(customerName.trim() || phone.trim()) && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
                  {customerName.trim() ? (
                    <span className="font-semibold text-stone-900">{customerName.trim()}</span>
                  ) : null}
                  {customerName.trim() && phone.trim() ? (
                    <span className="text-stone-300" aria-hidden>
                      |
                    </span>
                  ) : null}
                  {phone.trim() ? <span className="font-mono">{phone.trim()}</span> : null}
                </div>
              )}

              <section>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                    Customer notifications
                  </h2>
                  <button
                    type="button"
                    onClick={() => setResendOpen(true)}
                    className="rounded-lg border border-rlx-gold/50 bg-rlx-gold/15 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-rlx-green hover:bg-rlx-gold/25"
                  >
                    Resend
                  </button>
                </div>
                <div className="space-y-2 rounded-xl border border-rlx-rule bg-stone-50/80 p-3">
                  <NotifyBadge
                    label="Tracking email"
                    sent={emailSent}
                    reason={emailState?.reason ?? null}
                  />
                  <NotifyBadge
                    label="Tracking WhatsApp"
                    sent={whatsappSent}
                    reason={whatsappState?.reason ?? null}
                  />
                </div>
                <p className="mt-2 text-xs text-stone-500">
                  Link includes SRF reference and the same online tracking experience as the public tracking page.
                </p>
              </section>

              {trackingUrl ? (
                <div className="rounded-xl border border-rlx-gold/30 bg-gradient-to-br from-amber-50/80 to-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-rlx-gold-dark">
                    Customer tracking link
                  </p>
                  <p className="mt-2 break-all font-mono text-[11px] leading-relaxed text-stone-700">{trackingUrl}</p>
                  <button
                    type="button"
                    onClick={() => void copyTrackingLink()}
                    className="mt-3 text-xs font-semibold text-rlx-green underline-offset-2 hover:underline"
                  >
                    {copied ? "Copied!" : "Copy link"}
                  </button>
                </div>
              ) : null}

              <p className="text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-rlx-gold-dark">
                Send if needed
              </p>

              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Link
                  to="/"
                  className="inline-flex flex-1 items-center justify-center rounded-xl border-2 border-rlx-green/30 bg-white px-4 py-3 text-sm font-semibold text-rlx-green hover:bg-rlx-green-light/30 sm:flex-none"
                >
                  Home
                </Link>
                <button
                  type="button"
                  onClick={onPrint}
                  className="inline-flex flex-1 items-center justify-center rounded-xl bg-gradient-to-r from-rlx-gold to-rlx-gold-dark px-4 py-3 text-sm font-bold text-rlx-green-deep shadow-md hover:opacity-95 sm:flex-none"
                >
                  SRF print
                </button>
                <button
                  type="button"
                  onClick={() => setResendOpen(true)}
                  className="inline-flex flex-1 items-center justify-center rounded-xl border-2 border-rlx-green bg-rlx-green px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-rlx-green-deep sm:flex-none"
                >
                  Resend to customer
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <SrfTrackingResendModal
        open={resendOpen}
        onClose={() => setResendOpen(false)}
        srfId={srfId}
        srfReference={srfReference}
        phone={phone}
        customerEmail={customerEmail}
        emailSent={emailSent}
        whatsappSent={whatsappSent}
        onComplete={onNotifyUpdate}
      />
    </>
  );
}
