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
    <section
      className={`rounded-2xl border border-zimson-300/70 bg-white/90 p-5 shadow-sm backdrop-blur-sm ${className}`}
    >
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title ? (
              <h2 className="text-base font-semibold tracking-tight text-stone-900">{title}</h2>
            ) : null}
            {subtitle ? <p className="mt-1 text-sm text-stone-600">{subtitle}</p> : null}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
