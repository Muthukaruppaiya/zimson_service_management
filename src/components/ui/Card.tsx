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
        <div className="flex min-w-0 flex-col gap-2 border-b border-rlx-rule bg-rlx-green px-3 py-2 sm:flex-row sm:items-start sm:justify-between sm:px-3.5">
          <div className="min-w-0">
            {title ? (
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-white">{title}</h2>
            ) : null}
            {subtitle ? (
              <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-rlx-gold/80">
                {subtitle}
              </p>
            ) : null}
          </div>
          {action ? <div className="min-w-0 w-full sm:w-auto sm:max-w-full">{action}</div> : null}
        </div>
      )}
      <div className="min-w-0 p-2.5 sm:p-3">{children}</div>
    </section>
  );
}
