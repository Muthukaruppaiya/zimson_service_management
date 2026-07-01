import type { ReactNode } from "react";
import { ServiceBreadcrumb } from "../service/ServiceBreadcrumb";
import { uiPageTitleOnDarkClass } from "../../lib/pageTypography";

type ListPageShellProps = {
  breadcrumb: string;
  eyebrow: string;
  title: string;
  actions?: ReactNode;
  countLabel?: string;
  error?: string | null;
  loading?: boolean;
  loadingMessage?: string;
  emptyMessage?: string;
  isEmpty?: boolean;
  children: ReactNode;
  /** Hide chrome when printing (e.g. invoice overlay open). */
  hideChrome?: boolean;
};

/**
 * Standard list/register layout — same density and chrome as Quick bill history.
 */
export function ListPageShell({
  breadcrumb,
  eyebrow,
  title,
  actions,
  countLabel,
  error,
  loading,
  loadingMessage = "Loading…",
  emptyMessage = "No records match the current filters.",
  isEmpty = false,
  children,
  hideChrome = false,
}: ListPageShellProps) {
  return (
    <div className="ui-page-bleed relative font-sans text-rlx-ink">
      <div className={`min-h-0 bg-rlx-bg ${hideChrome ? "print:hidden" : ""}`}>
        <ServiceBreadcrumb current={breadcrumb} />

        <div className="bg-rlx-green px-4 py-4 md:px-5 md:py-5">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.35em] text-rlx-gold">{eyebrow}</p>
          <div className="flex flex-col gap-2 sm:gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <h1 className={uiPageTitleOnDarkClass}>
                {title}
              </h1>
            </div>
            {actions ? (
              <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">{actions}</div>
            ) : null}
          </div>
        </div>

        <div className="px-4 py-3 md:px-5 md:py-4">
          {countLabel ? (
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xs font-bold uppercase tracking-[0.24em] text-rlx-ink-muted">{countLabel}</h2>
            </div>
          ) : null}

          {error ? (
            <div className="mb-4 border-l-4 border-red-500 bg-red-50 px-4 py-2.5 text-xs text-red-800">{error}</div>
          ) : null}

          {children}

          {loading ? (
            <div className="flex items-center gap-3 py-6 text-xs text-rlx-ink-muted">
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-rlx-green border-t-transparent" />
              {loadingMessage}
            </div>
          ) : null}

          {!loading && isEmpty ? (
            <div className="border border-rlx-rule bg-white px-5 py-8 text-center">
              <p className="text-xs text-rlx-ink-muted">{emptyMessage}</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
