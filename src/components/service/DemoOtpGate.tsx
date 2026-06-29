import { useCallback, useEffect, useId, useRef } from "react";
import { Card } from "../ui/Card";

type DemoOtpGateProps = {
  title: string;
  subtitle?: string;
  /** Shown in demo mode when API returns the code (omit in production SMS/email delivery). */
  issuedCode?: string;
  value: string;
  onChange: (value: string) => void;
  onVerify: () => void;
  onRegenerate?: () => void;
  /** When true, disables the verify button (e.g. while an API request is in flight). */
  verifyBusy?: boolean;
};

const OTP_LEN = 6;

function OtpDigitBoxes({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: OTP_LEN }, (_, i) => value[i] ?? "");

  const setDigits = useCallback(
    (next: string[]) => {
      const joined = next.join("").replace(/\D/g, "").slice(0, OTP_LEN);
      onChange(joined);
    },
    [onChange],
  );

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  function focusAt(index: number) {
    const el = inputRefs.current[Math.max(0, Math.min(index, OTP_LEN - 1))];
    el?.focus();
    el?.select();
  }

  function applyPaste(raw: string, startIndex: number) {
    const chars = raw.replace(/\D/g, "").slice(0, OTP_LEN - startIndex).split("");
    if (chars.length === 0) return;
    const next = [...digits];
    chars.forEach((ch, offset) => {
      next[startIndex + offset] = ch;
    });
    setDigits(next);
    focusAt(startIndex + chars.length);
  }

  return (
    <div className="mt-2">
      <div className="flex justify-center gap-2 sm:gap-2.5" role="group" aria-label="6-digit OTP">
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(el) => {
              inputRefs.current[index] = el;
            }}
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            maxLength={1}
            disabled={disabled}
            value={digit}
            aria-label={`Digit ${index + 1} of ${OTP_LEN}`}
            onChange={(e) => {
              const ch = e.target.value.replace(/\D/g, "").slice(-1);
              const next = [...digits];
              next[index] = ch;
              setDigits(next);
              if (ch) focusAt(index + 1);
            }}
            onKeyDown={(e) => {
              if (e.key === "Backspace") {
                if (digits[index]) {
                  const next = [...digits];
                  next[index] = "";
                  setDigits(next);
                } else if (index > 0) {
                  const next = [...digits];
                  next[index - 1] = "";
                  setDigits(next);
                  focusAt(index - 1);
                }
                e.preventDefault();
              } else if (e.key === "ArrowLeft" && index > 0) {
                focusAt(index - 1);
                e.preventDefault();
              } else if (e.key === "ArrowRight" && index < OTP_LEN - 1) {
                focusAt(index + 1);
                e.preventDefault();
              }
            }}
            onPaste={(e) => {
              e.preventDefault();
              applyPaste(e.clipboardData.getData("text"), index);
            }}
            onFocus={(e) => e.target.select()}
            className={`h-12 w-10 rounded-xl border-2 text-center font-mono text-xl font-bold tracking-widest transition sm:h-14 sm:w-12 sm:text-2xl ${
              digit
                ? "border-zimson-500 bg-zimson-50 text-stone-900 shadow-sm"
                : "border-stone-300 bg-white text-stone-400"
            } focus:border-zimson-600 focus:bg-white focus:text-stone-900 focus:outline-none focus:ring-4 focus:ring-zimson-200 disabled:opacity-60`}
          />
        ))}
      </div>
      <p className="mt-2 text-center text-[11px] text-stone-500">
        Enter the 6-digit code · paste supported
      </p>
    </div>
  );
}

export function DemoOtpGate({
  title,
  subtitle,
  issuedCode,
  value,
  onChange,
  onVerify,
  onRegenerate,
  verifyBusy = false,
}: DemoOtpGateProps) {
  const baseId = useId();
  const resolvedSubtitle =
    subtitle ??
    (issuedCode
      ? "For this environment, enter the verification code shown below to continue."
      : "Enter the 6-digit OTP sent to the customer’s mobile and/or email.");

  const canVerify = value.length === OTP_LEN && !verifyBusy;

  return (
    <Card title={title} subtitle={resolvedSubtitle}>
      {issuedCode ? (
        <div className="rounded-xl border-2 border-dashed border-zimson-400 bg-zimson-100/80 px-4 py-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-zimson-900">
            Verification code (demo)
          </p>
          <p
            className="mt-2 font-mono text-3xl font-bold tracking-[0.35em] text-stone-900"
            aria-live="polite"
          >
            {issuedCode}
          </p>
          <button
            type="button"
            onClick={() => onChange(issuedCode.replace(/\D/g, "").slice(0, OTP_LEN))}
            className="mt-3 text-xs font-semibold text-zimson-800 underline hover:text-zimson-950"
          >
            Fill code automatically
          </button>
        </div>
      ) : null}
      <div className={issuedCode ? "mt-4" : undefined}>
        <label id={`${baseId}-otp-label`} className="sr-only">
          Enter 6-digit OTP
        </label>
        <OtpDigitBoxes value={value} onChange={onChange} disabled={verifyBusy} />
      </div>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={onVerify}
          disabled={!canVerify}
          className="min-w-[10rem] rounded-xl bg-zimson-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {verifyBusy ? "Verifying…" : "Verify and proceed"}
        </button>
        {onRegenerate ? (
          <button
            type="button"
            onClick={onRegenerate}
            disabled={verifyBusy}
            className="rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Resend OTP
          </button>
        ) : null}
      </div>
    </Card>
  );
}
