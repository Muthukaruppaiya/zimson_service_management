import { Link } from "react-router-dom";
import type { DashboardActionItem } from "../../lib/dashboardActionItems";
import { waitingActionHeadline, waitingActionItems } from "../../lib/dashboardActionItems";
import { actionCardStyle } from "../../lib/dashboardActionCardStyles";
import { DashboardActionIcon } from "./DashboardActionIcon";

type Props = {
  items: DashboardActionItem[];
};

export function DashboardWaitingBlinker({ items }: Props) {
  const waitingItems = waitingActionItems(items);
  const headline = waitingActionHeadline(items);
  const hasUrgent = waitingItems.some((i) => i.urgent);

  if (waitingItems.length === 0) return null;

  return (
    <section
      className={`overflow-hidden rounded-2xl border bg-white shadow-[0_2px_12px_rgba(16,37,112,0.06)] ${
        hasUrgent ? "border-red-200/80" : "border-amber-200/70"
      }`}
      aria-live="polite"
      aria-label="Items waiting for your action"
    >
      <div
        className={`flex items-center gap-3 border-b px-4 py-3 md:px-5 ${
          hasUrgent
            ? "border-red-100 bg-gradient-to-r from-red-50/80 to-white"
            : "border-amber-100 bg-gradient-to-r from-amber-50/70 to-white"
        }`}
      >
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-70 ${hasUrgent ? "bg-red-400" : "bg-amber-400"}`} />
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${hasUrgent ? "bg-red-500" : "bg-amber-500"}`} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-rlx-green">Priority queue</p>
          <p className="font-sans text-sm font-semibold text-rlx-ink md:text-[15px]">{headline}</p>
        </div>
      </div>

      <ul className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:p-4">
        {waitingItems.map((item) => {
          const style = actionCardStyle(item);
          return (
            <li key={item.id}>
              <Link
                to={item.to}
                className={`flex h-full items-center gap-3 rounded-xl border bg-white px-3 py-3 transition hover:border-rlx-green/40 hover:shadow-md ${
                  item.urgent ? "border-red-100" : "border-rlx-rule"
                }`}
              >
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${style.iconBg}`}>
                  <DashboardActionIcon id={item.id} className={`h-4 w-4 ${style.iconColor}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-rlx-ink">{item.label}</p>
                  {item.sublabel ? (
                    <p className="truncate text-[10px] text-rlx-ink-muted">{item.sublabel}</p>
                  ) : null}
                </div>
                <span
                  className={`shrink-0 rounded-lg px-2.5 py-1 font-sans text-sm font-bold tabular-nums text-white ${
                    item.urgent ? "bg-red-600" : "bg-rlx-green"
                  }`}
                >
                  {item.count}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
