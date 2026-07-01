import type { ReactNode } from "react";
import { ServiceBreadcrumb } from "../service/ServiceBreadcrumb";
import { uiGoldAccentBarClass, uiPageTitleClass } from "../../lib/pageTypography";

type FormPageShellProps = {
  breadcrumb: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
};

/**
 * Entry / workflow pages (Quick bill, SRF booking) — compact chrome, same type scale as history lists.
 */
export function FormPageShell({
  breadcrumb,
  title,
  description: _description,
  actions,
  children,
}: FormPageShellProps) {
  return (
    <div className="min-w-0 max-w-full font-sans text-rlx-ink">
      <ServiceBreadcrumb current={breadcrumb} />
      <div className="mb-4 flex flex-col gap-2 border-b border-rlx-rule pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <div className={uiGoldAccentBarClass} aria-hidden />
            <h1 className={uiPageTitleClass}>{title}</h1>
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-1.5 text-xs">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}
