import type { ReactNode } from "react";

type CardProps = {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
};

export function Card({ title, subtitle, children, className = "", action }: CardProps) {
  return (
    <section className={`border border-rlx-rule bg-white shadow-sm ${className}`}>
      {(title || action) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-rlx-rule bg-rlx-green px-4 py-3">
          <div>
            {title ? (
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-white">{title}</h2>
            ) : null}
            {subtitle ? (
              <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.14em] text-rlx-gold/80">
                {subtitle}
              </p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}
