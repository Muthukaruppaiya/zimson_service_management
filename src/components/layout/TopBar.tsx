import { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { canAccessModule } from "../../config/moduleAccess";
import { useAuth } from "../../context/AuthContext";
import { useNavLayout } from "../../context/NavLayoutContext";
import { apiJson } from "../../lib/api";
import { DEFAULT_APP_LOGO_URL, getAppLogoUrl, refreshAppBrandingFromServer } from "../../lib/appBranding";
import { mainNav } from "../../navigation";
import type { AppNotification } from "../../types/notification";
import { GlobalSearch } from "../dashboard/GlobalSearch";

function roleLabel(role: string) {
  const map: Record<string, string> = {
    super_admin: "Super Admin",
    admin: "Admin (HO)",
    ho_manager: "HO Manager",
    ho_accounts: "HO Accounts",
    ho_purchase: "HO Purchase",
    service_centre_clerk: "SC Clerk",
    service_centre_supervisor: "SC Supervisor",
    store_user: "Store User",
    store_manager: "Store Manager",
    store_accounts: "Store Accounts",
    technician: "Technician",
  };
  return map[role] ?? role;
}

function MenuIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  );
}

function WatchAvatarIcon() {
  return (
    <svg className="h-4 w-4 text-[#1B3A8F]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 12V9M12 12l3 2" strokeLinecap="round" />
      <path d="M9 5h6l1 2H8l1-2z" />
    </svg>
  );
}

export function TopBar() {
  const { user, logout } = useAuth();
  const { toggleNav } = useNavLayout();
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);
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
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (!user) return;
    void loadNotifications();
    const t = setInterval(() => void loadNotifications(), 20000);
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
    <header className="print:hidden sticky top-0 z-20 shrink-0 border-b border-rlx-rule bg-white">
      <div className="h-[2.5px] w-full" style={{ background: "linear-gradient(90deg, #A8850F, #C9A227, #F0DC90, #C9A227, #A8850F)" }} />

      <div className="flex h-[52px] items-center gap-3 px-4 md:gap-4 md:px-6">
        <button
          type="button"
          onClick={toggleNav}
          aria-label="Open navigation menu"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-rlx-rule bg-white text-rlx-ink transition hover:border-rlx-green hover:text-rlx-green"
        >
          <MenuIcon />
        </button>

        <div className="flex min-w-0 shrink-0 items-center gap-2.5">
          <img
            src={logoUrl}
            alt="Zimson"
            onError={(e) => { (e.currentTarget as HTMLImageElement).onerror = null; (e.currentTarget as HTMLImageElement).src = DEFAULT_APP_LOGO_URL; }}
            className="h-8 w-auto max-w-[120px] object-contain md:h-7 md:max-w-[100px]"
          />
          <span className="hidden text-[11px] font-medium text-[#9CA3AF] lg:inline">| Service Portal</span>
        </div>

        <div className="hidden min-w-0 flex-1 md:block md:max-w-2xl md:px-2 lg:px-6">
          <GlobalSearch autoFocus={false} variant="header" />
        </div>

        <nav className="flex gap-1 overflow-x-auto md:hidden" aria-label="Mobile main">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `whitespace-nowrap rounded px-3 py-1.5 text-xs font-semibold transition ${
                  isActive
                    ? "bg-rlx-green text-white"
                    : "border border-rlx-rule bg-white text-rlx-ink hover:border-rlx-green hover:text-rlx-green"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {user ? (
          <div className="ml-auto flex shrink-0 items-center gap-2 md:gap-3">
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((v) => !v)}
                className="relative flex h-9 w-9 items-center justify-center rounded border border-rlx-rule bg-white text-rlx-ink-muted transition hover:border-rlx-green hover:text-rlx-green"
              >
                <BellIcon />
                {unread > 0 ? (
                  <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />
                ) : null}
              </button>

              {notifOpen ? (
                <div className="absolute right-0 z-30 mt-2 w-[360px] border border-rlx-rule bg-white shadow-lg">
                  <div className="flex items-center justify-between border-b border-rlx-rule bg-rlx-green px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white">Notifications</p>
                    <button
                      type="button"
                      onClick={() => void markAllRead()}
                      className="text-[11px] font-semibold text-rlx-gold transition hover:text-white"
                    >
                      Mark all read
                    </button>
                  </div>
                  <div className="max-h-72 overflow-auto">
                    {notifications.length === 0 ? (
                      <p className="px-4 py-6 text-center text-xs text-rlx-ink-muted">No notifications yet.</p>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          className={`border-b border-rlx-rule px-4 py-3 ${n.isRead ? "bg-white" : "bg-rlx-green-light"}`}
                        >
                          <p className="text-xs font-semibold text-rlx-ink">{n.title}</p>
                          <p className="mt-0.5 text-xs text-rlx-ink-muted">{n.message}</p>
                          <p className="mt-1 text-[10px] text-rlx-ink-muted/70">{new Date(n.createdAt).toLocaleString()}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="hidden items-center gap-2 sm:flex">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#C9A227] shadow-sm">
                <WatchAvatarIcon />
              </span>
              <div className="hidden flex-col text-right leading-tight md:flex">
                <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#111827]">
                  {roleLabel(user.role)}
                </span>
                <span className="text-[9px] font-medium uppercase tracking-[0.1em] text-[#9CA3AF]">
                  {user.displayName}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="rounded border border-[#d1d5db] bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#111827] transition hover:border-[#1B3A8F] hover:text-[#1B3A8F] md:px-4"
            >
              Sign out
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
