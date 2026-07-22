import type { ReactNode } from "react";

export type AppModalSize = "sm" | "md" | "lg" | "xl" | "2xl";

const sizeClass: Record<AppModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-3xl",
  "2xl": "max-w-5xl",
};

type AppModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Small label above title (e.g. "Transfer document") */
  eyebrow?: string;
  /** Mono reference line under title (e.g. TD number) */
  subtitle?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Extra controls in the header row (print, resend, etc.) */
  headerActions?: ReactNode;
  size?: AppModalSize;
  zIndex?: number;
  closeOnBackdrop?: boolean;
  align?: "center" | "top";
  bodyClassName?: string;
  ariaLabel?: string;
};

export function AppModal({
  open,
  onClose,
  title,
  eyebrow,
  subtitle,
  description,
  children,
  footer,
  headerActions,
  size = "md",
  zIndex = 50,
  closeOnBackdrop = true,
  align = "center",
  bodyClassName = "",
  ariaLabel,
}: AppModalProps) {
  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 flex bg-slate-950/65 p-3 backdrop-blur-sm sm:p-6 ${
        align === "top" ? "items-start justify-center pt-8 sm:pt-12" : "items-center justify-center"
      }`}
      style={{ zIndex }}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? title}
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        className={`flex max-h-[92vh] w-full ${sizeClass[size]} flex-col overflow-hidden rounded-2xl border border-white/20 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.45)]`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex shrink-0 flex-col gap-3 overflow-hidden bg-gradient-to-r from-[#0c1c56] via-[#173786] to-[#24499c] px-5 py-4 text-white sm:flex-row sm:items-start sm:justify-between sm:px-6 sm:py-5">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-rlx-gold-dark via-rlx-gold to-rlx-gold-light" />
          <div className="relative min-w-0 flex-1 pr-2">
            {eyebrow ? (
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-blue-100">{eyebrow}</p>
            ) : null}
            <h2 className="mt-0.5 text-base font-bold leading-snug sm:text-lg">{title}</h2>
            {subtitle ? (
              <p className="mt-1 font-mono text-sm font-semibold tracking-wide text-rlx-gold-light">{subtitle}</p>
            ) : null}
            {description ? (
              <p className="mt-1.5 max-w-prose text-xs leading-relaxed text-white/75 sm:text-sm">{description}</p>
            ) : null}
          </div>
          <div className="relative flex shrink-0 flex-wrap items-center justify-end gap-2">
            {headerActions}
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-white/10 text-xl leading-none text-white transition hover:bg-white/20"
              aria-label="Close"
              title="Close"
            >
              ×
            </button>
          </div>
        </div>

        <div className={`overflow-y-auto bg-slate-50/80 px-5 py-4 sm:px-6 sm:py-5 ${bodyClassName}`}>{children}</div>

        {footer ? (
          <div className="shrink-0 border-t border-slate-200 bg-white px-5 py-3.5 sm:px-6">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}

export function AppModalDetailGrid({ children }: { children: ReactNode }) {
  return (
    <dl className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">{children}</dl>
  );
}

export function AppModalDetailRow({
  label,
  children,
  last,
}: {
  label: string;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-[9.5rem_1fr] ${last ? "" : "border-b border-slate-100"}`}>
      <dt className="bg-slate-50 px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </dt>
      <dd className="px-3 py-2.5 text-sm text-slate-800">{children}</dd>
    </div>
  );
}

export function AppModalSection({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{title}</p>
      <div className="mt-2">{children}</div>
    </section>
  );
}

/** Drop-in navy/gold header for legacy inline modals not yet on AppModal */
export function ModalHeaderBar({
  title,
  description,
  eyebrow,
  subtitle,
  onClose,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  subtitle?: string;
  onClose?: () => void;
}) {
  return (
    <div className="relative flex shrink-0 flex-col gap-3 overflow-hidden bg-gradient-to-r from-[#0c1c56] via-[#173786] to-[#24499c] px-5 py-4 text-white sm:flex-row sm:items-start sm:justify-between sm:px-6 sm:py-5">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-rlx-gold-dark via-rlx-gold to-rlx-gold-light" />
      <div className="relative min-w-0 flex-1 pr-2">
        {eyebrow ? (
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-blue-100">{eyebrow}</p>
        ) : null}
        <h2 className="mt-0.5 text-base font-bold leading-snug sm:text-lg">{title}</h2>
        {subtitle ? (
          <p className="mt-1 font-mono text-sm font-semibold tracking-wide text-rlx-gold-light">{subtitle}</p>
        ) : null}
        {description ? (
          <p className="mt-1.5 max-w-prose text-xs leading-relaxed text-white/75 sm:text-sm">{description}</p>
        ) : null}
      </div>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/10 text-xl leading-none text-white transition hover:bg-white/20"
          aria-label="Close"
          title="Close"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

/** Legacy modal shell — same look as AppModal for pages with inline markup */
export function ModalShell({
  open,
  onClose,
  title,
  description,
  eyebrow,
  subtitle,
  children,
  footer,
  size = "md",
  zIndex = 50,
  bodyClassName = "",
}: Omit<AppModalProps, "headerActions" | "align" | "closeOnBackdrop" | "ariaLabel">) {
  return (
    <AppModal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      eyebrow={eyebrow}
      subtitle={subtitle}
      footer={footer}
      size={size}
      zIndex={zIndex}
      bodyClassName={bodyClassName}
    >
      {children}
    </AppModal>
  );
}
