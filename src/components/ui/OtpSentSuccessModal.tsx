type OtpSentSuccessModalProps = {
  open: boolean;
  subtitle?: string;
  onClose: () => void;
};

export function OtpSentSuccessModal({ open, subtitle, onClose }: OtpSentSuccessModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 p-6 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="otp-sent-success-title"
      aria-describedby="otp-sent-success-desc"
      onClick={onClose}
    >
      <div
        className="otp-sent-card w-full max-w-[300px] rounded-3xl bg-white px-6 pb-7 pt-9 text-center shadow-[0_24px_80px_-12px_rgba(0,0,0,0.45)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="otp-sent-check mx-auto flex h-[72px] w-[72px] items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/35"
          aria-hidden
        >
          <svg className="h-9 w-9 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 id="otp-sent-success-title" className="mt-6 text-xl font-bold tracking-tight text-stone-900">
          OTP sent successfully
        </h2>
        <p id="otp-sent-success-desc" className="mt-2 text-sm leading-relaxed text-stone-600">
          {subtitle?.trim() || "Check SMS or email for your 6-digit code."}
        </p>
        <p className="mt-5 text-[11px] font-medium text-stone-400">Tap anywhere to continue</p>
      </div>
      <style>{`
        @keyframes otp-sent-pop {
          0% { opacity: 0; transform: scale(0.88) translateY(12px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes otp-sent-check-pulse {
          0% { transform: scale(0.6); opacity: 0; }
          55% { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        .otp-sent-card {
          animation: otp-sent-pop 0.35s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        .otp-sent-check {
          animation: otp-sent-check-pulse 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
      `}</style>
    </div>
  );
}
