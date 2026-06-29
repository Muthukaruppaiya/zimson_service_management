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
      {/* gold shimmer top accent */}
      <div className="h-[2.5px] w-full" style={{ background: "linear-gradient(90deg, #A8850F, #C9A227, #F0DC90, #C9A227, #A8850F)" }} />

      <div className="flex h-13 items-center justify-between gap-4 px-4 md:px-6" style={{ height: "52px" }}>

        <button
          type="button"
          onClick={toggleNav}
          aria-label="Open navigation menu"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-rlx-rule bg-white text-rlx-ink transition hover:border-rlx-green hover:text-rlx-green"
        >
          <MenuIcon />
        </button>

        {/* ── Mobile logo ─────────────── */}
        <div className="flex min-w-0 items-center gap-2.5 md:hidden">
          <img
            src={logoUrl}
            alt="Zimson"
            onError={(e) => { (e.currentTarget as HTMLImageElement).onerror = null; (e.currentTarget as HTMLImageElement).src = DEFAULT_APP_LOGO_URL; }}
            className="h-8 w-auto max-w-[120px] object-contain"
          />
        </div>

        {/* ── Global search (desktop) ── */}
        <div className="hidden flex-1 max-w-xl md:block">
          <GlobalSearch autoFocus={false} />
        </div>

        {/* ── Desktop logo mark (right of search) ── */}
        <div className="hidden shrink-0 items-center md:flex">
          <img
            src={logoUrl}
            alt="Zimson"
            onError={(e) => { (e.currentTarget as HTMLImageElement).onerror = null; (e.currentTarget as HTMLImageElement).src = DEFAULT_APP_LOGO_URL; }}
            className="h-7 w-auto max-w-[110px] object-contain opacity-90"
          />
        </div>

        {/* ── Mobile nav pills ─────────── */}
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

        {/* ── Right controls ───────────── */}
        {user ? (
          <div className="flex items-center gap-2">

            {/* Notifications */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((v) => !v)}
                className="relative flex h-9 w-9 items-center justify-center rounded border border-rlx-rule bg-white text-rlx-ink-muted transition hover:border-rlx-green hover:text-rlx-green"
              >
                <BellIcon />
                {unread > 0 && (
                  <>
                    <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
                    </span>
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[9px] font-bold text-white animate-pulse">
                      {unread > 9 ? "9+" : unread}
                    </span>
                  </>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 z-30 mt-2 w-[360px] border border-rlx-rule bg-white shadow-lg">
                  {/* notification panel header */}
                  <div className="flex items-center justify-between border-b border-rlx-rule bg-rlx-green px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white">Notifications</p>
                    <button
                      type="button"
                      onClick={() => void markAllRead()}
                      className="text-[11px] font-semibold text-rlx-gold hover:text-white transition"
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
              )}
            </div>

            {/* User info */}
            <div className="hidden flex-col items-end text-right sm:flex">
              <span className="text-[12.5px] font-semibold text-rlx-ink leading-tight">{user.displayName}</span>
              <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-rlx-green">
                {roleLabel(user.role)}
              </span>
            </div>

            {/* Sign out */}
            <button
              type="button"
              onClick={handleLogout}
              className="border border-rlx-rule bg-white px-4 py-1.5 text-xs font-semibold text-rlx-ink transition hover:border-rlx-green hover:text-rlx-green"
            >
              Sign out
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
