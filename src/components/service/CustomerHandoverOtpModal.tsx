import { useCallback, useEffect, useRef, useState } from "react";
import { DemoOtpGate } from "./DemoOtpGate";
import { useCustomers } from "../../context/CustomersContext";
import { useMessageAlert } from "../../hooks/useMessageAlert";
import { sanitizeEmailInput, sanitizePhoneDigits } from "../../lib/inputSanitize";
import { inputClass } from "../../lib/uiForm";

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
  const { showError, alertModal } = useMessageAlert();
  const [phase, setPhase] = useState<"custom-entry" | "verify">("verify");
  const [customPhone, setCustomPhone] = useState("");
  const [customEmail, setCustomEmail] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [demoOtp, setDemoOtp] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<SentTarget[]>([]);
  const [otpInput, setOtpInput] = useState("");
  const [sendFailed, setSendFailed] = useState(false);
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
    setSendFailed(false);
    setBusy(false);
    autoSendStartedRef.current = false;
  }, [isPrimary]);

  const sendOtpToBoth = useCallback(
    async (phone?: string, email?: string) => {
      setSendFailed(false);
      setBusy(true);
      try {
        const out = await startHandoverOtpBoth({ phone, email });
        setSessionId(out.sessionId);
        setDemoOtp(out.demoOtp ?? null);
        setSentTo(out.sentTo);
        setPhase("verify");
        setOtpInput("");
      } catch (e) {
        setSendFailed(true);
        showError(e instanceof Error ? e.message : "Could not send OTP.", "OTP");
      } finally {
        setBusy(false);
      }
    },
    [startHandoverOtpBoth, showError],
  );

  useEffect(() => {
    if (!open) return;
    resetState();
  }, [open, resetState]);

  useEffect(() => {
    if (!open || !isPrimary || autoSendStartedRef.current) return;
    if (!primaryHasPhone && !primaryHasEmail) {
      showError("Primary mobile or email is required on the bill.", "OTP");
      return;
    }
    autoSendStartedRef.current = true;
    void sendOtpToBoth(primaryHasPhone ? contactPhone : undefined, primaryHasEmail ? primaryEmail : undefined);
  }, [open, isPrimary, primaryHasPhone, primaryHasEmail, contactPhone, primaryEmail, sendOtpToBoth, showError]);

  if (!open) return null;

  async function handleCustomSend() {
    if (!customHasPhone && !customHasEmail) {
      showError("Enter OTP mobile or OTP email (at least one is required).", "OTP");
      return;
    }
    await sendOtpToBoth(customHasPhone ? customPhone : undefined, customHasEmail ? customEmail : undefined);
  }

  async function handleVerify() {
    if (!sessionId) {
      showError("Send OTP first.", "OTP");
      return;
    }
    if (otpInput.trim().length !== 6) {
      showError("Enter the 6-digit OTP.", "OTP");
      return;
    }
    setBusy(true);
    try {
      await confirmHandoverOtp({ sessionId, otp: otpInput.trim() });
      onHandoverVerified();
      onClose();
    } catch (e) {
      showError(e instanceof Error ? e.message : "Incorrect OTP.", "OTP verification failed");
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
    <>
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
              {busy && !sessionId ? (
                <p className="rounded-xl bg-zimson-50 px-3 py-2 text-sm text-stone-700">Sending OTP…</p>
              ) : null}
              {sentTo.length > 0 ? (
                <p className="rounded-xl bg-zimson-50 px-3 py-2 text-sm text-stone-800">
                  Same OTP sent to {formatSentToList(sentTo)}.
                </p>
              ) : null}
              {sessionId ? (
                <DemoOtpGate
                  title="Enter OTP"
                  subtitle="Use the code from SMS or email. One code works for all destinations."
                  issuedCode={demoOtp ?? undefined}
                  value={otpInput}
                  onChange={setOtpInput}
                  onVerify={() => void handleVerify()}
                  onRegenerate={() => void handleResend()}
                  verifyBusy={busy}
                />
              ) : sendFailed && !busy ? (
                <button
                  type="button"
                  onClick={() =>
                    isPrimary
                      ? void sendOtpToBoth(
                          primaryHasPhone ? contactPhone : undefined,
                          primaryHasEmail ? primaryEmail : undefined,
                        )
                      : void handleResend()
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
      {alertModal}
    </>
  );
}
