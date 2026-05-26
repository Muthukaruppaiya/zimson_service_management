import { useId } from "react";
import { Card } from "../ui/Card";
import { inputClass } from "../../lib/uiForm";

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

  return (
    <Card title={title} subtitle={resolvedSubtitle}>
      {issuedCode ? (
        <div className="rounded-xl border-2 border-dashed border-zimson-400 bg-zimson-100/80 px-4 py-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-zimson-900">
            Verification code (demo)
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
      ) : null}
      <div className={issuedCode ? "mt-4" : undefined}>
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
