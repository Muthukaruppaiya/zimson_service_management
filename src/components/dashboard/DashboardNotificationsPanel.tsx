import { useAppNotifications } from "../../hooks/useAppNotifications";

function categoryLabel(category: string): string {
  if (category === "inventory_pr") return "Purchase request";
  if (category === "service_dc") return "Service dispatch";
  return category;
}

export function DashboardNotificationsPanel() {
  const { notifications, unreadCount, loading, markAllRead } = useAppNotifications();

  return (
    <section className="overflow-hidden rounded-lg border border-[#e5e8ef] bg-white" aria-label="Notifications">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e5e8ef] px-3 py-2.5 md:px-4">
        <h2 className="text-sm font-bold text-[#111827]">System Notifications</h2>
        {unreadCount > 0 ? (
          <button
            type="button"
            onClick={() => void markAllRead()}
            className="text-[11px] font-semibold text-[#1B3A8F] hover:underline"
          >
            Mark all read
          </button>
        ) : null}
      </div>

      <div className="max-h-64 overflow-y-auto">
        {unreadCount === 0 && !loading ? (
          <div className="flex items-center gap-2 border-b border-[#e5e8ef] px-3 py-2 text-xs font-medium text-emerald-700 md:px-4">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </span>
            All caught up
          </div>
        ) : null}

        {loading ? (
          <p className="px-4 py-6 text-center text-sm text-[#6B7280]">Loading notifications…</p>
        ) : notifications.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-[#6B7280]">No notifications yet.</p>
        ) : (
          <ul>
            {notifications.map((n) => (
              <li
                key={n.id}
                className={`border-b border-[#e5e8ef] px-3 py-2.5 last:border-0 md:px-4 ${
                  n.isRead ? "bg-white" : "border-l-[3px] border-l-[#1B3A8F] bg-[#f8fafc] pl-[calc(0.75rem-3px)] md:pl-[calc(1rem-3px)]"
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-xs font-semibold text-[#111827]">{n.title}</p>
                      <span className="rounded bg-[#E8EDF8] px-1.5 py-0.5 text-[9px] font-semibold text-[#1B3A8F]">
                        {categoryLabel(n.category)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-[#6B7280]">{n.message}</p>
                    <p className="mt-1 text-[10px] text-[#9CA3AF]">{new Date(n.createdAt).toLocaleString()}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
