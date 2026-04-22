import { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { canAccessModule } from "../../config/moduleAccess";
import { useAuth } from "../../context/AuthContext";
import { apiJson } from "../../lib/api";
import { DEFAULT_APP_LOGO_URL, getAppLogoUrl, refreshAppBrandingFromServer } from "../../lib/appBranding";
import { mainNav } from "../../navigation";
import type { AppNotification } from "../../types/notification";

function roleLabel(role: string) {
  switch (role) {
    case "ho_admin":
      return "HO Admin";
    case "ho_manager":
      return "HO Manager";
    case "ho_supervisor":
      return "HO Supervisor";
    case "ho_user":
      return "HO User";
    case "ho_accounts":
      return "HO Accounts";
    case "super_admin":
      return "Super Admin";
    case "regional_admin":
      return "Regional Admin";
    case "store_user":
      return "Store user";
    case "store_purchase_user":
      return "Store Purchase";
    case "store_manager":
      return "Store Manager";
    case "store_accounts":
      return "Store Accounts";
    case "service_centre_clerk":
      return "SC inward";
    case "service_centre_supervisor":
      return "SC supervisor";
    case "technician":
      return "Technician";
    default:
      return role;
  }
}

export function TopBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [logoUrl, setLogoUrl] = useState(getAppLogoUrl());

  const items = useMemo(() => {
    if (!user) return [];
    return mainNav.filter((item) => canAccessModule(user, item.module));
  }, [user]);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  async function loadNotifications() {
    if (!user) return;
    try {
      const data = await apiJson<{ notifications: AppNotification[] }>("/api/notifications");
      setNotifications(data.notifications);
    } catch {
      setNotifications([]);
    }
  }

  async function markAllRead() {
    try {
      await apiJson("/api/notifications/read-all", { method: "POST" });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (!user) return;
    void loadNotifications();
    const t = setInterval(() => {
      void loadNotifications();
    }, 20000);
    return () => clearInterval(t);
  }, [user?.id]);

  useEffect(() => {
    const refresh = () => setLogoUrl(getAppLogoUrl());
    void refreshAppBrandingFromServer().then(refresh).catch(() => {});
    window.addEventListener("storage", refresh);
    window.addEventListener("zimson-branding-updated", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("zimson-branding-updated", refresh);
    };
  }, []);

  const unread = notifications.filter((n) => !n.isRead).length;

  return (
    <header className="print:hidden sticky top-0 z-10 border-b border-zimson-300/60 bg-zimson-50/95 backdrop-blur">
      <div className="flex h-14 items-center justify-between gap-4 px-4 md:px-8">
        <div className="flex min-w-0 items-center gap-3 md:hidden">
          <img
            src={logoUrl}
            alt="Zimson logo"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).onerror = null;
              (e.currentTarget as HTMLImageElement).src = DEFAULT_APP_LOGO_URL;
            }}
            className="h-8 w-8 rounded-lg border border-zimson-200 bg-white object-contain p-1"
          />
          <span className="truncate text-sm font-semibold text-stone-900">Zimson</span>
        </div>
        <div className="hidden flex-1 md:block" />
        <nav
          className="flex gap-1 overflow-x-auto pb-0.5 md:hidden"
          aria-label="Mobile main"
        >
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                [
                  "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium",
                  isActive
                    ? "bg-zimson-500 text-white shadow-sm"
                    : "bg-white/80 text-stone-700 ring-1 ring-zimson-300/60",
                ].join(" ")
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setOpen((v) => !v)}
                  className="relative rounded-xl border border-zimson-300/80 bg-white px-3 py-1.5 text-xs font-semibold text-zimson-900"
                >
                  Notifications
                  {unread > 0 ? (
                    <span className="ml-2 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {unread}
                    </span>
                  ) : null}
                </button>
                {open ? (
                  <div className="absolute right-0 z-20 mt-2 w-[360px] rounded-xl border border-zimson-200 bg-white p-3 shadow-lg">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Recent notifications</p>
                      <button
                        type="button"
                        onClick={() => void markAllRead()}
                        className="rounded-lg border border-zimson-300 px-2 py-1 text-[11px] font-semibold text-zimson-900"
                      >
                        Mark all read
                      </button>
                    </div>
                    <div className="max-h-72 space-y-2 overflow-auto">
                      {notifications.length === 0 ? (
                        <p className="text-xs text-stone-500">No notifications.</p>
                      ) : (
                        notifications.map((n) => (
                          <div
                            key={n.id}
                            className={`rounded-lg border p-2 ${
                              n.isRead ? "border-zimson-200 bg-white" : "border-zimson-300 bg-zimson-50/60"
                            }`}
                          >
                            <p className="text-xs font-semibold text-stone-900">{n.title}</p>
                            <p className="mt-0.5 text-xs text-stone-700">{n.message}</p>
                            <p className="mt-1 text-[10px] text-stone-500">{new Date(n.createdAt).toLocaleString()}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="hidden max-w-[200px] flex-col items-end text-right sm:flex">
                <span className="truncate text-xs font-semibold text-stone-900">
                  {user.displayName}
                </span>
                <span className="text-[10px] font-medium uppercase tracking-wide text-zimson-800">
                  {roleLabel(user.role)}
                </span>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-xl border border-zimson-400/80 bg-white px-3 py-1.5 text-xs font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
              >
                Sign out
              </button>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
