import { useId } from "react";
import { Card } from "../ui/Card";
import { OTP_LENGTH, otpLengthLabel } from "../../lib/otp";
import { OtpDigitInput } from "./OtpDigitInput";

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

const OTP_LEN = OTP_LENGTH;

export function DemoOtpGate({
  title,
  subtitle: _subtitle,
  issuedCode: _issuedCode,
  value,
  onChange,
  onVerify,
  onRegenerate,
  verifyBusy = false,
}: DemoOtpGateProps) {
  const baseId = useId();
  const canVerify = value.length === OTP_LEN && !verifyBusy;

  return (
    <Card title={title}>
      <div>
        <label id={`${baseId}-otp-label`} className="sr-only">
          Enter {otpLengthLabel()} OTP
        </label>
        <OtpDigitInput value={value} onChange={onChange} disabled={verifyBusy} />
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
