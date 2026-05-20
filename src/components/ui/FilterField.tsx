import type { ReactNode } from "react";

type FilterFieldProps = {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
};

/** Label + control stack for responsive filter / toolbar rows */
export function FilterField({ label, htmlFor, children, className = "" }: FilterFieldProps) {
  return (
    <div className={`ui-filter-field flex min-w-0 flex-col ${className}`.trim()}>
      <label htmlFor={htmlFor} className="ui-field-label">
        {label}
      </label>
      {children}
    </div>
  );
}
