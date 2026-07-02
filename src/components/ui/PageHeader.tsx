import type { ReactNode } from "react";
import {
  uiGoldAccentBarClass,
  uiPageTitleClass,
  uiPageTitleLgClass,
} from "../../lib/pageTypography";

type PageHeaderProps = {
  title: string;
  description: string;
  actions?: ReactNode;
  className?: string;
  size?: "default" | "lg";
};

export function PageHeader({ title, description: _description, actions, className = "", size = "default" }: PageHeaderProps) {
  const isLg = size === "lg";
  const titleClass = isLg ? uiPageTitleLgClass : uiPageTitleClass;

  return (
    <div className={`mb-4 border-b border-rlx-rule pb-4 ${className}`.trim()}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className={uiGoldAccentBarClass} aria-hidden />
            <h1 className={titleClass}>{title}</h1>
          </div>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap gap-1.5 text-sm">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}
