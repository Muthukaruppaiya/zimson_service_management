/** Animated “sending OTP” panel (SMS + email) — used in handover OTP modals. */
export function OtpSendingIndicator({
  label = "Sending OTP…",
  description = "Delivering to customer mobile & email…",
}: {
  label?: string;
  description?: string;
}) {
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-xl border border-zimson-200 bg-gradient-to-b from-zimson-50 to-white px-4 py-5"
      role="status"
      aria-live="polite"
    >
      <div className="otp-send-visual relative flex h-20 w-20 items-center justify-center" aria-hidden>
        <span className="otp-send-ring absolute inset-0 rounded-full border-2 border-zimson-400/40" />
        <span className="otp-send-ring otp-send-ring-delay absolute inset-2 rounded-full border-2 border-amber-400/50" />
        <svg className="relative h-10 w-10 text-zimson-700" viewBox="0 0 48 48" fill="none">
          <rect x="8" y="6" width="32" height="36" rx="4" stroke="currentColor" strokeWidth="2" fill="white" />
          <path d="M8 14h32" stroke="currentColor" strokeWidth="2" />
          <circle cx="24" cy="28" r="6" fill="currentColor" opacity="0.15" />
          <path
            className="otp-send-arrow"
            d="M34 10 L42 10 L42 18"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <p className="text-center text-sm font-semibold text-stone-800">{label}</p>
      <p className="text-center text-xs text-stone-500">{description}</p>
      <style>{`
        @keyframes otp-send-pulse {
          0%, 100% { transform: scale(1); opacity: 0.35; }
          50% { transform: scale(1.12); opacity: 0.85; }
        }
        @keyframes otp-send-fly {
          0%, 100% { transform: translate(0, 0); opacity: 1; }
          50% { transform: translate(3px, -3px); opacity: 0.6; }
        }
        .otp-send-ring {
          animation: otp-send-pulse 1.4s ease-in-out infinite;
        }
        .otp-send-ring-delay {
          animation-delay: 0.35s;
        }
        .otp-send-arrow {
          animation: otp-send-fly 0.9s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
