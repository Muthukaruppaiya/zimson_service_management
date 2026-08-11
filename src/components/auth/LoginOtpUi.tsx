import { OtpDigitInput } from "../service/OtpDigitInput";
import { OtpSendingIndicator } from "../ui/OtpSendingIndicator";
import { OTP_LENGTH, otpLengthLabel } from "../../lib/otp";

/** Full-screen popup while login OTP is being sent. */
export function LoginOtpSendingPopup({ open }: { open: boolean }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-[#071d49]/65 p-4 backdrop-blur-[3px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-otp-sending-title"
    >
      <div className="w-full max-w-sm rounded-3xl border border-white/20 bg-white p-5 shadow-[0_28px_80px_rgba(7,29,73,0.45)]">
        <OtpSendingIndicator
          label="Sending OTP…"
          description="Please wait while we deliver your login verification code."
        />
        <p id="login-otp-sending-title" className="sr-only">
          Sending OTP
        </p>
      </div>
    </div>
  );
}

type LoginOtpEntryProps = {
  otpCode: string;
  onOtpChange: (value: string) => void;
  otpHint: string | null;
  demoOtp: string | null;
  rememberMe: boolean;
  onRememberMeChange: (value: boolean) => void;
  error: string | null;
  alreadyLoggedIn: boolean;
  alreadyLoggedInBody?: string | null;
  signOutAllBusy: boolean;
  onSignOutAll: () => void;
  otpBusy: boolean;
  onResend: () => void;
  onBack: () => void;
};

/** Enhanced OTP entry panel for login (digit boxes + actions). Place inside a form. */
export function LoginOtpEntryPanel({
  otpCode,
  onOtpChange,
  otpHint,
  demoOtp,
  rememberMe,
  onRememberMeChange,
  error,
  alreadyLoggedIn,
  alreadyLoggedInBody,
  signOutAllBusy,
  onSignOutAll,
  otpBusy,
  onResend,
  onBack,
}: LoginOtpEntryProps) {
  return (
    <div className="zimson-login-otp">
      <div className="zimson-login-otp__hero">
        <div className="zimson-login-otp__icon" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M12 3 5 6v5c0 4.8 2.9 8.2 7 10 4.1-1.8 7-5.2 7-10V6l-7-3Z" />
            <path d="M9.5 12.2 11.2 14l3.5-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="zimson-login-otp__title">Enter verification code</h2>
        <p className="zimson-login-otp__subtitle">
          {otpHint?.trim() || `Enter the ${otpLengthLabel()} OTP to complete sign in.`}
        </p>
      </div>

      {demoOtp ? (
        <div className="zimson-login-otp__temp" role="status">
          <span className="zimson-login-otp__temp-label">Temporary OTP</span>
          <span className="zimson-login-otp__temp-code">{demoOtp}</span>
          <span className="zimson-login-otp__temp-note">Shown for testing — enter this code below</span>
        </div>
      ) : null}

      <div className="zimson-login-otp__digits">
        <OtpDigitInput value={otpCode} onChange={onOtpChange} disabled={otpBusy} autoFocus />
      </div>

      <label className="zimson-login__remember zimson-login-otp__remember">
        <input
          type="checkbox"
          checked={rememberMe}
          onChange={(e) => onRememberMeChange(e.target.checked)}
        />
        <span>Remember this device (skip OTP next time)</span>
      </label>

      {alreadyLoggedIn ? (
        <div className="zimson-login__alert zimson-login__alert--warn">
          <p className="zimson-login__alert-title">Account already in use</p>
          <p>
            {alreadyLoggedInBody ??
              "Someone is already signed in with this account. Sign out all devices to continue."}
          </p>
          <button
            type="button"
            className="zimson-login__alert-btn"
            disabled={signOutAllBusy}
            onClick={onSignOutAll}
          >
            {signOutAllBusy ? "Signing out all devices…" : "Sign out all devices & try again"}
          </button>
        </div>
      ) : error ? (
        <div className="zimson-login__alert zimson-login__alert--error">{error}</div>
      ) : null}

      <button
        type="submit"
        className="zimson-login__submit"
        disabled={otpBusy || otpCode.length !== OTP_LENGTH}
      >
        {otpBusy ? "Verifying…" : "Verify & sign in"}
        <svg viewBox="0 0 24 24">
          <path d="M13.5 5.5 19 11H5v2h14l-5.5 5.5 1.4 1.4L22.8 12l-7.9-7.9-1.4 1.4Z" />
        </svg>
      </button>

      <div className="zimson-login-otp__actions">
        <button type="button" className="zimson-login-otp__link" disabled={otpBusy} onClick={onResend}>
          Resend OTP
        </button>
        <span className="zimson-login-otp__dot" aria-hidden>
          ·
        </span>
        <button type="button" className="zimson-login-otp__link" disabled={otpBusy} onClick={onBack}>
          Use a different account
        </button>
      </div>
    </div>
  );
}
