import type { ReactNode } from "react";

export function RequiredMark() {
  return (
    <span className="ml-0.5 font-bold text-red-600" aria-hidden>
      *
    </span>
  );
}

export function renderFieldLabel(label: ReactNode): ReactNode {
  if (typeof label !== "string") return label;
  const m = /^(.*?)\s*\*\s*$/.exec(label);
  if (!m) return label;
  return (
    <>
      {m[1]}
      <RequiredMark />
    </>
  );
}
