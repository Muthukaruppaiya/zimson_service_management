import { OTP_LENGTH, otpLengthLabel } from "../../lib/otp";
import { OtpDigitInput } from "./OtpDigitInput";

type Props = {
  open: boolean;
  kind: "mobile" | "email";
  target: string;
  value: string;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onResend?: () => void;
  onClose: () => void;
  busy?: boolean;
};

export function RegistrationOtpModal({
  open,
  kind,
  target,
  value,
  onChange,
  onConfirm,
  onResend,
  onClose,
  busy = false,
}: Props) {
  if (!open) return null;

  const title = kind === "mobile" ? "Verify mobile OTP" : "Verify email OTP";

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="registration-otp-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h2 id="registration-otp-title" className="text-base font-bold text-zimson-900">
              {title}
            </h2>
            <p className="mt-1 text-xs text-stone-600">
              Enter the {otpLengthLabel()} code sent to{" "}
              <strong className="text-zimson-900">{target}</strong>
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

        <OtpDigitInput value={value} onChange={onChange} disabled={busy} size="compact" />

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || value.length !== OTP_LENGTH}
            className="min-w-[7.5rem] rounded-lg bg-zimson-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Verifying…" : "Confirm OTP"}
          </button>
          {onResend ? (
            <button
              type="button"
              onClick={onResend}
              disabled={busy}
              className="rounded-lg border border-zimson-300 bg-white px-3 py-2 text-sm font-semibold text-zimson-900 hover:bg-zimson-50 disabled:opacity-50"
            >
              Resend
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
