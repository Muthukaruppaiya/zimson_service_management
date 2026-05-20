import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description: string;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({ title, description, actions, className = "" }: PageHeaderProps) {
  return (
    <div className={`mb-4 border-b border-rlx-rule pb-4 ${className}`.trim()}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {/* gold eyebrow line */}
          <div className="mb-3 h-[2px] w-8 bg-rlx-gold" />
          <h1 className="font-display text-2xl font-light leading-tight tracking-tight text-rlx-ink md:text-3xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-rlx-ink-muted md:text-sm">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}
