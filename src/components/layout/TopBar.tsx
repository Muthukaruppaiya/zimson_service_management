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
import {
  TopBarBellIcon,
  TopBarLogoutIcon,
  TopBarLogoutSpinner,
  TopBarMenuIcon,
  userInitials,
} from "./topBarIcons";

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

export function TopBar() {
  const { user, logout } = useAuth();
  const { toggleNav } = useNavLayout();
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [logoUrl, setLogoUrl] = useState(getAppLogoUrl());
  const [signingOut, setSigningOut] = useState(false);

  const items = useMemo(() => {
    if (!user) return [];
    return mainNav.filter((item) => canAccessModule(user, item.module));
  }, [user]);

  async function handleLogout() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await logout();
      navigate("/login", { replace: true });
    } finally {
      setSigningOut(false);
    }
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
  const initials = user ? userInitials(user.displayName) : "U";

  return (
    <header className="chrono-topbar print:hidden sticky top-0 z-20 shrink-0 border-b border-rlx-rule bg-white/95 backdrop-blur-md">
      <div className="topbar-gold-stripe h-[3px] w-full" />

      <div className="flex h-[56px] items-center gap-3 px-4 md:gap-4 md:px-6">
        <button
          type="button"
          onClick={toggleNav}
          aria-label="Open navigation menu"
          className="topbar-icon-btn flex h-10 w-10 shrink-0 items-center justify-center text-rlx-ink transition"
        >
          <TopBarMenuIcon />
        </button>

        <div className="flex min-w-0 shrink-0 items-center gap-2.5">
          <img
            src={logoUrl}
            alt="Zimson"
            onError={(e) => { (e.currentTarget as HTMLImageElement).onerror = null; (e.currentTarget as HTMLImageElement).src = DEFAULT_APP_LOGO_URL; }}
            className="h-8 w-auto max-w-[120px] object-contain md:h-7 md:max-w-[100px]"
          />
          <span className="hidden text-[13px] font-medium text-rlx-ink-muted lg:inline">| Service Portal</span>
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
                `whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  isActive
                    ? "bg-rlx-green text-white shadow-sm"
                    : "border border-rlx-rule bg-white text-rlx-ink hover:border-rlx-green hover:text-rlx-green"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {user ? (
          <div className="ml-auto flex shrink-0 items-center gap-2 md:gap-2.5">
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((v) => !v)}
                aria-label={unread > 0 ? `${unread} unread notifications` : "Notifications"}
                aria-expanded={notifOpen}
                className={`topbar-icon-btn relative flex h-10 w-10 items-center justify-center text-rlx-ink transition ${
                  notifOpen ? "topbar-icon-btn--active" : ""
                }`}
              >
                <TopBarBellIcon />
                {unread > 0 ? (
                  <span className="topbar-notif-badge absolute -right-0.5 -top-0.5 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none text-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                ) : null}
              </button>

              {notifOpen ? (
                <div className="topbar-notif-panel absolute right-0 z-30 mt-2 w-[min(360px,calc(100vw-2rem))] overflow-hidden border border-rlx-rule bg-white">
                  <div className="topbar-notif-panel__header flex items-center justify-between border-b border-rlx-rule bg-gradient-to-r from-rlx-green-deep to-rlx-green px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white">Notifications</p>
                    <button
                      type="button"
                      onClick={() => void markAllRead()}
                      className="topbar-notif-panel__mark-read px-3 py-1 text-[12px] font-semibold text-rlx-gold-light transition hover:bg-white/10 hover:text-white"
                    >
                      Mark all read
                    </button>
                  </div>
                  <div className="topbar-notif-panel__body max-h-72 overflow-auto">
                    {notifications.length === 0 ? (
                      <p className="px-4 py-8 text-center text-sm text-rlx-ink-muted">No notifications yet.</p>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          className={`border-b border-rlx-rule px-4 py-3 transition hover:bg-rlx-green-light/40 ${
                            n.isRead ? "bg-white" : "bg-rlx-green-light/70"
                          }`}
                        >
                          <p className="text-sm font-semibold text-rlx-ink">{n.title}</p>
                          <p className="mt-0.5 text-xs leading-relaxed text-rlx-ink-muted">{n.message}</p>
                          <p className="mt-1.5 text-[11px] text-rlx-ink-muted/80">{new Date(n.createdAt).toLocaleString()}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="topbar-user-chip hidden items-center gap-2.5 sm:flex">
              <span className="topbar-avatar-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-full p-[2px]">
                <span className="flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-[#f5e9b8] via-[#e8c96a] to-[#c9a227] text-sm font-bold text-rlx-green-deep shadow-inner">
                  {initials}
                </span>
              </span>
              <div className="hidden min-w-0 max-w-[140px] flex-col text-left leading-tight lg:flex">
                <span className="truncate text-sm font-semibold text-rlx-ink">{roleLabel(user.role)}</span>
                <span className="truncate text-xs font-medium text-rlx-ink-muted">{user.displayName}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleLogout()}
              disabled={signingOut}
              aria-label="Sign out"
              className="topbar-signout-btn group"
            >
              <span className="topbar-signout-btn__icon" aria-hidden>
                {signingOut ? <TopBarLogoutSpinner /> : <TopBarLogoutIcon className="h-[17px] w-[17px]" />}
              </span>
              <span className="topbar-signout-btn__label hidden sm:inline">
                {signingOut ? "Signing out…" : "Sign out"}
              </span>
              <span className="topbar-signout-btn__shine" aria-hidden />
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
