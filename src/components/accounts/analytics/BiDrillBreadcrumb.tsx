import type { DrillCrumb } from "../../../lib/analyticsDrill";

type Props = {
  path: DrillCrumb[];
  onNavigate: (index: number) => void;
};

export function BiDrillBreadcrumb({ path, onNavigate }: Props) {
  if (path.length <= 1) return null;

  return (
    <nav aria-label="Drill-down path" className="bi-drill-breadcrumb flex flex-wrap items-center gap-1.5 text-sm">
      {path.map((crumb, idx) => {
        const isLast = idx === path.length - 1;
        return (
          <span key={`${crumb.level}-${crumb.label}-${idx}`} className="inline-flex items-center gap-1.5">
            {idx > 0 ? <span className="text-white/40">›</span> : null}
            {isLast ? (
              <span className="rounded-full bg-white/15 px-3 py-1 font-semibold text-white">{crumb.label}</span>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate(idx)}
                className="rounded-full px-3 py-1 font-medium text-white/85 transition hover:bg-white/10 hover:text-white"
              >
                {crumb.label}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
