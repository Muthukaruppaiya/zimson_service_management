import type { ReactNode } from "react";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  children?: ReactNode;
  actions: ReactNode;
  onBackdropClick?: () => void;
};

export function ProcessSuccessModal({ open, title, description, children, actions, onBackdropClick }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-rlx-ink/70 p-4 backdrop-blur-sm print:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="process-success-modal-title"
      onClick={onBackdropClick ? () => onBackdropClick() : undefined}
    >
      <div
        className="relative z-[1] w-full max-w-md border-t-[3px] border-rlx-gold bg-white shadow-[0_24px_64px_-16px_rgba(0,0,0,0.45)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* green header band */}
        <div className="flex items-center gap-3 bg-rlx-green px-6 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rlx-gold text-rlx-green-deep text-base font-bold shadow-sm" aria-hidden>
            ✓
          </span>
          <div className="min-w-0">
            <h2 id="process-success-modal-title" className="text-sm font-semibold text-white md:text-base">
              {title}
            </h2>
            {description ? (
              <p className="mt-0.5 text-xs text-white/70">{description}</p>
            ) : null}
          </div>
        </div>

        {/* body */}
        <div className="px-6 py-5">
          {children}
        </div>

        {/* actions */}
        <div className="flex flex-col gap-2 border-t border-rlx-rule bg-rlx-bg px-6 py-4 sm:flex-row sm:flex-wrap sm:justify-end">
          {actions}
        </div>
      </div>
    </div>
  );
}
