import type { ButtonHTMLAttributes, ReactNode } from "react";

export const tableActionBtnClass =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center border border-rlx-gold/60 bg-white text-rlx-green transition hover:border-rlx-gold hover:bg-rlx-green-light disabled:cursor-not-allowed disabled:opacity-40";

type IconProps = { className?: string };
const iconCls = "h-[1.125rem] w-[1.125rem]";

export function IconDetails({ className = iconCls }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
      />
    </svg>
  );
}

export function IconPrint({ className = iconCls }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M6 9V4h12v5M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v6H6v-6z"
      />
    </svg>
  );
}

export function IconReturn({ className = iconCls }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 14l-4-4 4-4m-4 4h11a4 4 0 010 8h-1"
      />
    </svg>
  );
}

export function IconDoc({ className = iconCls }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}

export function IconAmend({ className = iconCls }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"
      />
    </svg>
  );
}

export function IconRefreshUploads({ className = "h-4 w-4 shrink-0" }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 4v5h5M20 20v-5h-5" />
      <path d="M5.1 15a7.5 7.5 0 0012.9 2.4L20 15M18.9 9A7.5 7.5 0 006 6.6L4 9" />
    </svg>
  );
}

export function IconRefreshLink({ className = "h-4 w-4 shrink-0" }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 14a4 4 0 005.66 0l3-3a4 4 0 00-5.66-5.66l-1.5 1.5" />
      <path d="M14 10a4 4 0 00-5.66 0l-3 3a4 4 0 005.66 5.66l1.5-1.5" />
    </svg>
  );
}

export const captureLinkButtonClass =
  "inline-flex items-center gap-2 rounded-lg border border-zimson-300 bg-white px-4 py-2 text-xs font-semibold text-zimson-900 transition hover:border-zimson-500 hover:bg-zimson-50 disabled:cursor-not-allowed disabled:opacity-50";

export function IconTrash({ className = iconCls }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}

export function TableActionButton({
  label,
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`${tableActionBtnClass} ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  );
}
