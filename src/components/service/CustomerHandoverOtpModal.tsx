import { useCallback, useEffect, useRef, useState } from "react";
import { DemoOtpGate } from "./DemoOtpGate";
import { useCustomers } from "../../context/CustomersContext";
import { sanitizePhoneDigits } from "../../lib/inputSanitize";

const inputClass =
  "mt-1 w-full rounded-xl border border-zimson-200 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none ring-zimson-400/40 placeholder:text-stone-400 transition focus:border-zimson-500 focus:ring-2";

function phoneLast10(v: string): string {
  const digits = v.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export type HandoverOtpMode = "primary" | "custom";

type CustomerHandoverOtpModalProps = {
  open: boolean;
  onClose: () => void;
  /** `primary` = OTP to contact on form (DB primary). `custom` = staff enters another mobile. */
  mode: HandoverOtpMode;
  /** Contact phone on the form (billing / SRF). */
  contactPhone: string;
  onHandoverVerified: () => void;
};

export function CustomerHandoverOtpModal({
  open,
  onClose,
  mode,
  contactPhone,
  onHandoverVerified,
}: CustomerHandoverOtpModalProps) {
  const { startRegistrationMobileOtp, confirmRegistrationMobileOtp } = useCustomers();
  const [otpPhone, setOtpPhone] = useState("");
  const [phase, setPhase] = useState<"phone" | "verify">("phone");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [demoOtp, setDemoOtp] = useState<string | null>(null);
  const [otpInput, setOtpInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const autoSentRef = useRef(false);

  const primaryP10 = phoneLast10(contactPhone);
  const isPrimary = mode === "primary";

  const sendOtp = useCallback(
    async (targetRaw: string) => {
      setError(null);
      if (primaryP10.length !== 10) {
        setError("Enter a 10-digit contact phone on the form first.");
        return;
      }
      const targetP10 = phoneLast10(targetRaw);
      if (targetP10.length !== 10) {
        setError("OTP mobile must be 10 digits.");
        return;
      }
      setBusy(true);
      try {
        const out = await startRegistrationMobileOtp({
          primaryPhone: contactPhone,
          otpPhone: isPrimary ? contactPhone : targetRaw,
        });
        setOtpPhone(targetP10);
        setSessionId(out.sessionId);
        setDemoOtp(out.demoMobileOtp);
        setPhase("verify");
        setOtpInput("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not send OTP.");
      } finally {
        setBusy(false);
      }
    },
    [contactPhone, isPrimary, primaryP10.length, startRegistrationMobileOtp],
  );

  useEffect(() => {
    if (!open) {
      autoSentRef.current = false;
      return;
    }
    setPhase(isPrimary ? "verify" : "phone");
    setSessionId(null);
    setDemoOtp(null);
    setOtpInput("");
    setError(null);
    setBusy(false);
    setOtpPhone(isPrimary ? primaryP10 : "");

    if (isPrimary && primaryP10.length === 10 && !autoSentRef.current) {
      autoSentRef.current = true;
      void sendOtp(contactPhone);
    }
  }, [open, isPrimary, primaryP10, contactPhone, sendOtp]);

  if (!open) return null;

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
      await confirmRegistrationMobileOtp({ sessionId, otp: otpInput.trim() });
      onHandoverVerified();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Incorrect OTP.");
    } finally {
      setBusy(false);
    }
  }

  const title = isPrimary ? "Send OTP to primary number" : "Send OTP to number";
  const verifyTarget = phoneLast10(otpPhone) || primaryP10;

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
                ? "OTP is sent to the customer’s primary mobile on file. Verify once, then complete billing."
                : "Enter another mobile, verify OTP, then complete billing. Use either this or primary OTP — not both."}
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

        {phase === "phone" && !isPrimary ? (
          <div className="space-y-4">
            <label className="block text-xs font-medium text-stone-600">
              OTP mobile *
              <input
                value={otpPhone}
                onChange={(e) => setOtpPhone(sanitizePhoneDigits(e.target.value, 10))}
                className={inputClass}
                inputMode="numeric"
                maxLength={10}
                placeholder="10-digit mobile for SMS"
                autoFocus
              />
            </label>
            {error ? (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">{error}</p>
            ) : null}
            <button
              type="button"
              onClick={() => void sendOtp(otpPhone)}
              disabled={busy}
              className="w-full rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-zimson-700 disabled:opacity-60"
            >
              {busy ? "Sending…" : "Send OTP"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {isPrimary ? (
              <p className="rounded-xl bg-zimson-50 px-3 py-2 text-sm text-stone-800">
                Primary mobile: <span className="font-mono font-semibold">{primaryP10 || "—"}</span>
                {busy && !demoOtp ? <span className="ml-2 text-stone-500">Sending OTP…</span> : null}
              </p>
            ) : null}
            {demoOtp ? (
              <DemoOtpGate
                title="Confirm handover"
                subtitle={`OTP sent to ${verifyTarget}. Enter the code to confirm watch handover.`}
                issuedCode={demoOtp}
                value={otpInput}
                onChange={setOtpInput}
                error={error}
                onVerify={() => void handleVerify()}
                onRegenerate={() => void sendOtp(isPrimary ? contactPhone : otpPhone)}
                verifyBusy={busy}
              />
            ) : error ? (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">{error}</p>
            ) : busy ? (
              <p className="text-sm text-stone-600">Sending OTP…</p>
            ) : null}
            {isPrimary && error && !demoOtp ? (
              <button
                type="button"
                onClick={() => void sendOtp(contactPhone)}
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
