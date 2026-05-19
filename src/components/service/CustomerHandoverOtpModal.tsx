import { useCallback, useEffect, useRef, useState } from "react";
import { DemoOtpGate } from "./DemoOtpGate";
import { useCustomers } from "../../context/CustomersContext";
import { sanitizeEmailInput, sanitizePhoneDigits } from "../../lib/inputSanitize";

const inputClass =
  "mt-1 w-full rounded-xl border border-zimson-200 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none ring-zimson-400/40 placeholder:text-stone-400 transition focus:border-zimson-500 focus:ring-2";

function phoneLast10(v: string): string {
  const digits = v.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function isValidEmail(v: string): boolean {
  const e = v.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export type HandoverOtpMode = "primary" | "custom";

type SentTarget = { type: "mobile" | "email"; label: string };

function formatSentToList(targets: SentTarget[]): string {
  return targets
    .map((t) => (t.type === "mobile" ? `SMS ${t.label}` : `email ${t.label}`))
    .join(" and ");
}

type CustomerHandoverOtpModalProps = {
  open: boolean;
  onClose: () => void;
  mode: HandoverOtpMode;
  contactPhone: string;
  contactEmail: string;
  onHandoverVerified: () => void;
};

export function CustomerHandoverOtpModal({
  open,
  onClose,
  mode,
  contactPhone,
  contactEmail,
  onHandoverVerified,
}: CustomerHandoverOtpModalProps) {
  const { startHandoverOtpBoth, confirmHandoverOtp } = useCustomers();
  const [phase, setPhase] = useState<"custom-entry" | "verify">("verify");
  const [customPhone, setCustomPhone] = useState("");
  const [customEmail, setCustomEmail] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [demoOtp, setDemoOtp] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<SentTarget[]>([]);
  const [otpInput, setOtpInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const autoSendStartedRef = useRef(false);

  const isPrimary = mode === "primary";
  const primaryP10 = phoneLast10(contactPhone);
  const primaryEmail = contactEmail.trim().toLowerCase();
  const primaryHasPhone = primaryP10.length === 10;
  const primaryHasEmail = isValidEmail(primaryEmail);

  const customP10 = phoneLast10(customPhone);
  const customHasPhone = customP10.length === 10;
  const customHasEmail = isValidEmail(customEmail);

  const resetState = useCallback(() => {
    setPhase(isPrimary ? "verify" : "custom-entry");
    setCustomPhone("");
    setCustomEmail("");
    setSessionId(null);
    setDemoOtp(null);
    setSentTo([]);
    setOtpInput("");
    setError(null);
    setBusy(false);
    autoSendStartedRef.current = false;
  }, [isPrimary]);

  const sendOtpToBoth = useCallback(
    async (phone?: string, email?: string) => {
      setError(null);
      setBusy(true);
      try {
        const out = await startHandoverOtpBoth({ phone, email });
        setSessionId(out.sessionId);
        setDemoOtp(out.demoOtp);
        setSentTo(out.sentTo);
        setPhase("verify");
        setOtpInput("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not send OTP.");
      } finally {
        setBusy(false);
      }
    },
    [startHandoverOtpBoth],
  );

  useEffect(() => {
    if (!open) return;
    resetState();
  }, [open, resetState]);

  useEffect(() => {
    if (!open || !isPrimary || autoSendStartedRef.current) return;
    if (!primaryHasPhone && !primaryHasEmail) {
      setError("Primary mobile or email is required on the bill.");
      return;
    }
    autoSendStartedRef.current = true;
    void sendOtpToBoth(primaryHasPhone ? contactPhone : undefined, primaryHasEmail ? primaryEmail : undefined);
  }, [open, isPrimary, primaryHasPhone, primaryHasEmail, contactPhone, primaryEmail, sendOtpToBoth]);

  if (!open) return null;

  async function handleCustomSend() {
    if (!customHasPhone && !customHasEmail) {
      setError("Enter OTP mobile or OTP email (at least one is required).");
      return;
    }
    await sendOtpToBoth(customHasPhone ? customPhone : undefined, customHasEmail ? customEmail : undefined);
  }

  async function handleVerify() {
    setError(null);
    if (!sessionId || !demoOtp) {
      setError("Send OTP first.");
      return;
    }
    if (otpInput.trim().length !== 6) {
      setError("Enter the 6-digit OTP.");
      return;
    }
    setBusy(true);
    try {
      await confirmHandoverOtp({ sessionId, otp: otpInput.trim() });
      onHandoverVerified();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Incorrect OTP.");
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    if (isPrimary) {
      await sendOtpToBoth(primaryHasPhone ? contactPhone : undefined, primaryHasEmail ? primaryEmail : undefined);
      return;
    }
    await sendOtpToBoth(customHasPhone ? customPhone : undefined, customHasEmail ? customEmail : undefined);
  }

  const title = isPrimary ? "Confirm handover OTP" : "OTP to other number / email";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="handover-otp-title"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="handover-otp-title" className="text-lg font-bold text-zimson-900">
              {title}
            </h2>
            <p className="mt-1 text-xs text-stone-600">
              {isPrimary
                ? "The same OTP is sent automatically to the customer’s primary mobile and email on the bill."
                : "Enter mobile and/or email — the same OTP is sent to every address you provide."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-stone-300 px-2 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-50"
          >
            Close
          </button>
        </div>

        {phase === "custom-entry" ? (
          <div className="space-y-4">
            <label className="block text-xs font-medium text-stone-600">
              OTP mobile
              <input
                value={customPhone}
                onChange={(e) => setCustomPhone(sanitizePhoneDigits(e.target.value, 10))}
                className={inputClass}
                inputMode="numeric"
                maxLength={10}
                placeholder="10-digit mobile (optional)"
                autoFocus
              />
            </label>
            <label className="block text-xs font-medium text-stone-600">
              OTP email
              <input
                type="email"
                value={customEmail}
                onChange={(e) => setCustomEmail(sanitizeEmailInput(e.target.value))}
                className={inputClass}
                placeholder="Email (optional)"
              />
            </label>
            <p className="text-[11px] text-stone-500">At least one of mobile or email is required.</p>
            {error ? (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">{error}</p>
            ) : null}
            <button
              type="button"
              onClick={() => void handleCustomSend()}
              disabled={busy}
              className="w-full rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-zimson-700 disabled:opacity-60"
            >
              {busy ? "Sending…" : "Send OTP to mobile & email"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {busy && !demoOtp ? (
              <p className="rounded-xl bg-zimson-50 px-3 py-2 text-sm text-stone-700">Sending OTP…</p>
            ) : null}
            {sentTo.length > 0 ? (
              <p className="rounded-xl bg-zimson-50 px-3 py-2 text-sm text-stone-800">
                Same OTP sent to {formatSentToList(sentTo)}.
              </p>
            ) : null}
            {demoOtp ? (
              <DemoOtpGate
                title="Enter OTP"
                subtitle="Use the code from SMS or email. One code works for all destinations."
                issuedCode={demoOtp}
                value={otpInput}
                onChange={setOtpInput}
                error={error}
                onVerify={() => void handleVerify()}
                onRegenerate={() => void handleResend()}
                verifyBusy={busy}
              />
            ) : error ? (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">{error}</p>
            ) : null}
            {isPrimary && error && !demoOtp && !busy ? (
              <button
                type="button"
                onClick={() =>
                  void sendOtpToBoth(
                    primaryHasPhone ? contactPhone : undefined,
                    primaryHasEmail ? primaryEmail : undefined,
                  )
                }
                disabled={busy}
                className="w-full rounded-xl border border-zimson-400 bg-white px-4 py-2 text-sm font-semibold text-zimson-900 hover:bg-zimson-50"
              >
                Retry send OTP
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
