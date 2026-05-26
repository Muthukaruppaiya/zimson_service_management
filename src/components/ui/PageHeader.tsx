import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description: string;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({ title, description, actions, className = "" }: PageHeaderProps) {
  return (
    <div className={`mb-3 border-b border-rlx-rule pb-3 ${className}`.trim()}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 h-[2px] w-7 bg-rlx-gold" />
          <h1 className="font-display text-lg font-light leading-tight tracking-tight text-rlx-ink md:text-xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-rlx-ink-muted">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap gap-1.5 text-[11px]">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}
