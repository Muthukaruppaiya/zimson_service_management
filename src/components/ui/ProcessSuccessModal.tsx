import type { ReactNode } from "react";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  children?: ReactNode;
  actions: ReactNode;
  onBackdropClick?: () => void;
  /** `premium` uses navy/gold invoice styling instead of green success band */
  tone?: "success" | "premium";
};

export function ProcessSuccessModal({
  open,
  title,
  description,
  children,
  actions,
  onBackdropClick,
  tone = "success",
}: Props) {
  if (!open) return null;

  const premium = tone === "premium";

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-sm print:hidden ${
        premium ? "bg-[#0c1c56]/70" : "bg-rlx-ink/70"
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="process-success-modal-title"
      onClick={onBackdropClick ? () => onBackdropClick() : undefined}
    >
      <div
        className={`relative z-[1] w-full max-w-md overflow-hidden bg-white shadow-[0_24px_64px_-16px_rgba(0,0,0,0.45)] ${
          premium ? "rounded-2xl border border-[#c9a227]/35" : "border-t-[3px] border-rlx-gold"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={
            premium
              ? "flex items-center gap-3 border-b border-[#c9a227]/35 bg-gradient-to-r from-[#0c1c56] via-[#152a72] to-[#1b3a8f] px-5 py-4"
              : "flex items-center gap-3 bg-rlx-green px-6 py-4"
          }
        >
          <span
            className={
              premium
                ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#c9a227] text-[#0c1c56] shadow-sm"
                : "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rlx-gold text-rlx-green-deep text-base font-bold shadow-sm"
            }
            aria-hidden
          >
            {premium ? (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2 11 13" />
                <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
              </svg>
            ) : (
              "✓"
            )}
          </span>
          <div className="min-w-0">
            <h2 id="process-success-modal-title" className="text-sm font-bold uppercase tracking-wide text-white md:text-base">
              {title}
            </h2>
            {description ? (
              <p className={`mt-0.5 text-xs ${premium ? "text-white/80" : "text-white/70"}`}>{description}</p>
            ) : null}
          </div>
        </div>

        <div className="px-5 py-4">{children}</div>

        <div
          className={`border-t px-5 py-4 ${
            premium ? "border-[#e2e8f5] bg-[#f8faff]" : "border-rlx-rule bg-rlx-bg"
          }`}
        >
          {actions}
        </div>
      </div>
    </div>
  );
}
