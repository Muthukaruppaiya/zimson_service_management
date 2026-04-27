import { useId } from "react";
import { Card } from "../ui/Card";

const inputClass =
  "mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm text-stone-900 outline-none ring-zimson-400/40 placeholder:text-stone-400 focus:ring-2";

type DemoOtpGateProps = {
  title: string;
  subtitle?: string;
  /** Shown to the user as the “SMS” code in this demo */
  issuedCode: string;
  value: string;
  onChange: (value: string) => void;
  error: string | null;
  onVerify: () => void;
  onRegenerate?: () => void;
  /** When true, disables the verify button (e.g. while an API request is in flight). */
  verifyBusy?: boolean;
};

export function DemoOtpGate({
  title,
  subtitle = "For this environment, enter the verification code shown below to continue.",
  issuedCode,
  value,
  onChange,
  error,
  onVerify,
  onRegenerate,
  verifyBusy = false,
}: DemoOtpGateProps) {
  const baseId = useId();

  return (
    <Card title={title} subtitle={subtitle}>
      <div className="rounded-xl border-2 border-dashed border-zimson-400 bg-zimson-100/80 px-4 py-4 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-zimson-900">
          Verification code
        </p>
        <p
          className="mt-2 font-mono text-3xl font-bold tracking-[0.2em] text-stone-900"
          aria-live="polite"
        >
          {issuedCode}
        </p>
        <p className="mt-2 text-xs text-stone-600">
          Enter this code below. Wrong or empty input will not complete the action.
        </p>
      </div>
      <div className="mt-4">
        <label htmlFor={`${baseId}-otp`} className="text-xs font-medium text-stone-600">
          Enter OTP *
        </label>
        <input
          id={`${baseId}-otp`}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className={inputClass}
          placeholder="6 digits"
        />
      </div>
      {error ? (
        <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onVerify}
          disabled={verifyBusy}
          className="rounded-xl bg-zimson-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {verifyBusy ? "Saving…" : "Verify and proceed"}
        </button>
        {onRegenerate ? (
          <button
            type="button"
            onClick={onRegenerate}
            disabled={verifyBusy}
            className="rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            New code
          </button>
        ) : null}
      </div>
    </Card>
  );
}
