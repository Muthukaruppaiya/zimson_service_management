import { Link } from "react-router-dom";
import type { DashboardActionItem } from "../../lib/dashboardActionItems";
import { waitingActionHeadline, waitingActionItems } from "../../lib/dashboardActionItems";

type Props = {
  items: DashboardActionItem[];
};

function BlinkDot({ urgent }: { urgent?: boolean }) {
  const color = urgent ? "bg-red-500" : "bg-amber-500";
  const ping = urgent ? "bg-red-400" : "bg-amber-400";
  return (
    <span className="relative flex h-3 w-3 shrink-0">
      <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-80 ${ping}`} />
      <span className={`relative inline-flex h-3 w-3 rounded-full ${color}`} />
    </span>
  );
}

export function DashboardWaitingBlinker({ items }: Props) {
  const waitingItems = waitingActionItems(items);
  const headline = waitingActionHeadline(items);
  const hasUrgent = waitingItems.some((i) => i.urgent);

  if (waitingItems.length === 0) return null;

  return (
    <section
      className={`relative overflow-hidden rounded-2xl border shadow-md md:shadow-lg ${
        hasUrgent
          ? "border-red-300/80 bg-gradient-to-br from-red-50 via-amber-50/90 to-white dashboard-waiting-blink"
          : "border-amber-300/80 bg-gradient-to-br from-amber-50/90 via-white to-rlx-green-light/20"
      }`}
      aria-live="polite"
      aria-label="Items waiting for your action"
    >
      <div className="border-b border-amber-200/60 bg-white/50 px-4 py-3.5 backdrop-blur-sm md:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <BlinkDot urgent={hasUrgent} />
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-amber-900/90">
                Live — waiting for you
              </p>
              <p className="mt-0.5 text-sm font-semibold leading-snug text-rlx-ink md:text-[15px]">
                {headline}
              </p>
            </div>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-red-600 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-300 opacity-90" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
            </span>
            Live
          </span>
        </div>
      </div>

      <ul className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:p-4">
        {waitingItems.map((item) => (
          <li key={item.id}>
            <Link
              to={item.to}
              className={`group flex h-full items-start gap-3 rounded-xl border bg-white px-3.5 py-3 shadow-sm transition hover:border-rlx-green hover:shadow-md ${
                item.urgent ? "border-red-200/90 dashboard-waiting-blink-soft" : "border-amber-200/80"
              }`}
            >
              <BlinkDot urgent={item.urgent} />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-wide text-rlx-ink-muted group-hover:text-rlx-green">
                  {item.label}
                </p>
                <p className="mt-1 font-display text-2xl font-light tabular-nums text-rlx-green">
                  {item.count}
                </p>
                {item.sublabel ? (
                  <p className="mt-0.5 text-[11px] font-medium text-amber-900/80">{item.sublabel}</p>
                ) : null}
                <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-rlx-ink-muted">
                  {item.hint}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function StatCardBlinkBadge({ count, urgent }: { count: number; urgent?: boolean }) {
  if (count <= 0) return null;
  return (
    <div className="absolute right-3 top-3 flex items-center gap-1.5">
      <span className="relative flex h-2.5 w-2.5">
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${
            urgent ? "bg-red-400" : "bg-amber-400"
          }`}
        />
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${urgent ? "bg-red-500" : "bg-amber-500"}`} />
      </span>
      <span
        className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white ${
          urgent ? "bg-red-600 animate-pulse" : "bg-amber-600"
        }`}
      >
        Waiting
      </span>
    </div>
  );
}
