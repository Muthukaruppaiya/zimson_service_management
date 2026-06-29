import { useAppNotifications } from "../../hooks/useAppNotifications";

function categoryLabel(category: string): string {
  if (category === "inventory_pr") return "Purchase request";
  if (category === "service_dc") return "Service dispatch";
  return category;
}

function BlinkDot() {
  return (
    <span className="relative mt-1 flex h-2.5 w-2.5 shrink-0">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
    </span>
  );
}

export function DashboardNotificationsPanel() {
  const { notifications, unreadCount, loading, markAllRead } = useAppNotifications();

  return (
    <section
      className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${
        unreadCount > 0 ? "border-red-200 dashboard-waiting-blink" : "border-rlx-rule"
      }`}
      aria-label="Notifications"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rlx-rule bg-gradient-to-r from-rlx-green to-rlx-green-deep px-4 py-3 md:px-5">
        <div className="flex items-center gap-2.5">
          {unreadCount > 0 ? <BlinkDot /> : null}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/80">Notifications</p>
            <p className="text-sm font-semibold text-white">
              {unreadCount > 0 ? (
                <>
                  <span className="tabular-nums">{unreadCount}</span> unread
                </>
              ) : (
                "All caught up"
              )}
            </p>
          </div>
        </div>
        {unreadCount > 0 ? (
          <button
            type="button"
            onClick={() => void markAllRead()}
            className="rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
          >
            Mark all read
          </button>
        ) : null}
      </div>

      <div className="max-h-80 overflow-y-auto">
        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-rlx-ink-muted">Loading notifications…</p>
        ) : notifications.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-rlx-ink-muted">No notifications yet.</p>
        ) : (
          <ul>
            {notifications.map((n) => (
              <li
                key={n.id}
                className={`border-b border-rlx-rule px-4 py-3 last:border-0 md:px-5 ${
                  n.isRead ? "bg-white" : "bg-red-50/60 dashboard-waiting-blink-soft"
                }`}
              >
                <div className="flex items-start gap-2">
                  {!n.isRead ? <BlinkDot /> : <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-stone-300" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-rlx-ink">{n.title}</p>
                      {!n.isRead ? (
                        <span className="rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white animate-pulse">
                          New
                        </span>
                      ) : null}
                      <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-600">
                        {categoryLabel(n.category)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-rlx-ink-muted">{n.message}</p>
                    <p className="mt-1.5 text-[10px] text-stone-400">{new Date(n.createdAt).toLocaleString()}</p>
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
