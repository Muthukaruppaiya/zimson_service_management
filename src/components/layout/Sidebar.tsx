import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { canAccessModule } from "../../config/moduleAccess";
import { isInventoryStockPricesViewOnly } from "../../lib/inventoryAccess";
import { useAuth } from "../../context/AuthContext";
import { useNavLayout } from "../../context/NavLayoutContext";
import { DEFAULT_APP_LOGO_URL, getAppLogoUrl, refreshAppBrandingFromServer } from "../../lib/appBranding";
import type { UserRole } from "../../types/user";

type IconName =
  | "dashboard" | "service" | "accounts" | "inventory" | "purchase"
  | "billing" | "master" | "settings" | "chevron" | "sparkle"
  | "logistics" | "supervisor" | "online";

function NavIcon({ name, className = "" }: { name: IconName; className?: string }) {
  const cls = `h-4 w-4 shrink-0 stroke-[1.6] ${className}`.trim();
  switch (name) {
    case "dashboard":
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>;
    case "service":
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
    case "accounts":
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.9 0-3.5.9-3.5 2s1.6 2 3.5 2 3.5.9 3.5 2-1.6 2-3.5 2m0-10v10m0-10c1.2 0 2.3.35 3 .9M12 8c-1.2 0-2.3.35-3 .9" /></svg>;
    case "inventory":
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>;
    case "purchase":
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>;
    case "billing":
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21l-7-3-7 3V5a2 2 0 012-2h10a2 2 0 012 2v16z" /></svg>;
    case "master":
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6M5 4h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1z" /></svg>;
    case "settings":
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
    case "chevron":
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>;
    case "sparkle":
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>;
    case "logistics":
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zm10 0a2 2 0 11-4 0 2 2 0 014 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 011-1h2.05a2.5 2.5 0 014.9 0H20a1 1 0 011 1m-8 0h2m-9-9h6" /></svg>;
    case "supervisor":
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>;
    case "online":
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18M6 7V5a2 2 0 012-2h8a2 2 0 012 2v2m-1 5l-5 5-3-3" /></svg>;
    default:
      return null;
  }
}

type ModuleKey = "dashboard" | "service" | "accounts" | "inventory" | "regions" | "users" | "settings" | "service_centre";

type SidebarItem = {
  to: string;
  label: string;
  module: ModuleKey;
  roles?: UserRole[];
};

type SidebarSection = {
  title: string;
  icon: IconName;
  items: SidebarItem[];
};

const ROLE_LABELS: Record<string, string> = {
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

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join("") || "U";
}

function matchItem(itemTo: string, pathname: string, search: string): boolean {
  const [itemPath, itemQuery] = itemTo.split("?");
  const pathOk = pathname === itemPath || pathname.startsWith(`${itemPath}/`);
  if (!pathOk) return false;
  if (!itemQuery) return true;
  const itemParams = new URLSearchParams(itemQuery);
  const currentParams = new URLSearchParams(search);
  for (const [k, v] of itemParams.entries()) {
    if (currentParams.get(k) !== v) {
      if (k === "tab" && v === "inward" && !currentParams.get("tab")) continue;
      return false;
    }
  }
  return true;
}

function sidebarItemLabel(item: SidebarItem, role: string): string {
  if (role === "store_user" && item.to === "/inventory/stock-prices") return "Store stock";
  return item.label;
}

export function Sidebar() {
  const { user } = useAuth();
  const { navOpen, closeNav } = useNavLayout();
  const location = useLocation();
  const [logoUrl, setLogoUrl] = useState(getAppLogoUrl());
  const [openSection, setOpenSection] = useState<string | null>(null);

  const sections = useMemo<SidebarSection[]>(() => {
    if (!user) return [];
    const all: SidebarSection[] = [
      {
        title: "Service", icon: "service",
        items: [
          { to: "/service/quick-bill", label: "Quick bill", module: "service" },
          { to: "/service/quick-bill-history", label: "Quick bill history", module: "service" },
          { to: "/service/srf", label: "SRF booking", module: "service" },
          { to: "/service/store-assign", label: "Store assign", module: "service" },
          { to: "/service/srf-register", label: "SRF history", module: "service" },
          { to: "/service/srf-master", label: "SRF master table", module: "service" },
        ],
      },
      {
        title: "Accounts", icon: "accounts",
        items: [
          { to: "/accounts/invoice-history", label: "Invoice history", module: "accounts" },
          { to: "/accounts/ledger", label: "Payment ledger", module: "accounts" },
          { to: "/accounts/setup", label: "Accounts setup", module: "accounts" },
        ],
      },
      {
        title: "Inventory", icon: "inventory",
        items: [
          { to: "/inventory/spares", label: "Spares", module: "inventory" },
          { to: "/inventory/stock-adjustment", label: "Stock adjustment", module: "inventory" },
          { to: "/service/watch-inventory", label: "Watch inventory", module: "service" },
          { to: "/inventory/stock-prices", label: "Stock & prices", module: "inventory" },
        ],
      },
      {
        title: "Purchase", icon: "purchase",
        items: [
          { to: "/inventory/purchase-requests", label: "New PR", module: "inventory" },
          { to: "/inventory/pr-history", label: "PR History", module: "inventory" },
          { to: "/inventory/purchase-orders", label: "New PO", module: "inventory" },
          { to: "/inventory/po-history", label: "PO History", module: "inventory" },
          { to: "/inventory/po-inward", label: "Post GRN", module: "inventory" },
          { to: "/inventory/grn-history", label: "GRN History", module: "inventory" },
        ],
      },
      {
        title: "Billing", icon: "billing",
        items: [
          { to: "/service/store-billing", label: "Store billing", module: "service" },
          { to: "/service/store-billing-master", label: "Store billing history", module: "service" },
          { to: "/service/billing", label: "HO billing", module: "service" },
        ],
      },
      {
        title: "Logistics", icon: "logistics",
        items: [
          { to: "/service/store-dispatch", label: "Store dispatch", module: "service" },
          { to: "/service/store-logistics-history", label: "Inward & outward history", module: "service" },
          { to: "/service-centre/logistics?tab=inward", label: "Internal inward (Store → HO)", module: "service_centre", roles: ["service_centre_clerk", "service_centre_clerk"] },
          { to: "/service-centre/logistics?tab=outward", label: "Internal outward (HO → Store)", module: "service_centre", roles: ["service_centre_clerk", "service_centre_clerk"] },
          { to: "/service-centre/logistics-history", label: "DC / ODC history", module: "service_centre", roles: ["service_centre_clerk", "service_centre_clerk", "service_centre_clerk"] },
        ],
      },
      {
        title: "Online Store", icon: "online",
        items: [{ to: "/service-centre/online-store", label: "Inter-HO online orders", module: "service_centre", roles: ["service_centre_supervisor", "ho_manager"] }],
      },
      {
        title: "Supervision", icon: "supervisor",
        items: [
          { to: "/service-centre/supervisor", label: "Assigning", module: "service_centre", roles: ["service_centre_supervisor", "ho_manager"] },
          { to: "/service-centre/srf-history", label: "SRF history", module: "service_centre", roles: ["service_centre_supervisor", "ho_manager"] },
          { to: "/service-centre/supervisor/reestimate-sender", label: "Sender re-estimate approvals", module: "service_centre", roles: ["service_centre_supervisor", "ho_manager"] },
        ],
      },
      {
        title: "Master Data", icon: "master",
        items: [
          { to: "/service/customers/master", label: "Customer master", module: "service" },
          { to: "/inventory/suppliers", label: "Supplier Master", module: "inventory" },
          { to: "/inventory/suppliers/new", label: "Add Supplier", module: "inventory" },
          { to: "/users", label: "Users creation", module: "users" },
          { to: "/users/list", label: "Users list", module: "users" },
          { to: "/service-centre/technicians-master", label: "Technician creation/list", module: "service_centre", roles: ["service_centre_supervisor", "ho_manager", "ho_manager"] },
        ],
      },
      {
        title: "Settings", icon: "settings",
        items: [
          { to: "/regions", label: "Regions & stores", module: "regions" },
          { to: "/settings/tax", label: "Tax & billing", module: "settings" },
          { to: "/settings/edoc", label: "E-invoice & e-way", module: "settings", roles: ["super_admin"] },
          { to: "/settings/messaging", label: "SMS, email & WhatsApp", module: "settings", roles: ["super_admin"] },
          { to: "/settings/active-sessions", label: "Logged-in users", module: "settings", roles: ["super_admin"] },
          { to: "/settings/document-templates", label: "Document templates", module: "settings" },
          { to: "/inventory/brands", label: "Brand", module: "inventory" },
        ],
      },
    ];

    const isAdmin = user.role === "super_admin" || user.role === "admin" || user.role === "admin";
    return all
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => {
          if (!canAccessModule(user, item.module)) return false;
          if (
            isInventoryStockPricesViewOnly(user) &&
            item.module === "inventory" &&
            item.to !== "/inventory/stock-prices"
          ) {
            return false;
          }
          if (item.roles && item.roles.length > 0) {
            if (!isAdmin && !item.roles.includes(user.role)) return false;
          }
          return true;
        }),
      }))
      .filter((section) => section.items.length > 0);
  }, [user]);

  useEffect(() => {
    const hit = sections.find((s) => s.items.some((i) => matchItem(i.to, location.pathname, location.search)));
    if (hit) setOpenSection(hit.title);
  }, [location.pathname, location.search, sections]);

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

  const roleLabelStr = user ? ROLE_LABELS[user.role] ?? user.role : "";
  const initials = initialsOf(user?.displayName ?? "");

  return (
    <aside
      className={`print:hidden fixed inset-y-0 left-0 z-50 flex h-dvh max-h-dvh w-64 shrink-0 flex-col overflow-hidden shadow-2xl transition-transform duration-200 ease-out ${
        navOpen ? "translate-x-0 pointer-events-auto" : "-translate-x-full pointer-events-none"
      }`}
      style={{ background: "linear-gradient(180deg, #1B3A8F 0%, #102570 100%)" }}
      aria-hidden={!navOpen}
    >

      {/* subtle texture overlay */}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: "repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 0, transparent 50%)", backgroundSize: "8px 8px" }} />

      {/* ── Logo header ─────────────────────────────── */}
      {/* gold top bar */}
      <div className="h-[3px] w-full shrink-0" style={{ background: "linear-gradient(90deg, #A8850F, #C9A227, #F0DC90, #C9A227, #A8850F)" }} />
      <div className="relative flex h-[60px] shrink-0 items-center justify-center border-b border-white/10 px-4">
        <img
          src={logoUrl}
          alt="Zimson"
          onError={(e) => { (e.currentTarget as HTMLImageElement).onerror = null; (e.currentTarget as HTMLImageElement).src = DEFAULT_APP_LOGO_URL; }}
          className="h-9 w-auto max-w-[160px] object-contain"
          style={{ filter: "brightness(1.08) saturate(1.05)" }}
        />
        {/* gold accent bottom */}
        <div className="absolute bottom-0 left-6 right-6 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(201,162,39,0.4), transparent)" }} />
      </div>

      {/* ── Navigation ──────────────────────────────── */}
      <nav className="relative flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-4" aria-label="Main">

        {/* Dashboard */}
        <NavLink
          to="/"
          end
          onClick={closeNav}
          className={({ isActive }) =>
            `group flex items-center gap-2.5 px-2.5 py-2 text-[11px] font-semibold transition-all duration-150 ${
              isActive
                ? "bg-white/15 text-white"
                : "text-white/70 hover:bg-white/8 hover:text-white"
            }`
          }
        >
          {({ isActive }) => (
            <>
              {isActive && <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-sm bg-rlx-gold" />}
              <span className={`flex h-7 w-7 items-center justify-center rounded ${isActive ? "bg-white/20 text-white" : "text-white/60 group-hover:text-white"}`}>
                <NavIcon name="dashboard" />
              </span>
              <span>Dashboard</span>
            </>
          )}
        </NavLink>

        {/* Section label */}
        <div className="mx-3 my-3 flex items-center gap-2">
          <div className="h-px flex-1 bg-white/12" />
          <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-white/40">Modules</span>
          <div className="h-px flex-1 bg-white/12" />
        </div>

        {/* Sections */}
        <div className="space-y-0.5">
          {sections.map((section) => {
            const isOpen = openSection === section.title;
            const hasActiveChild = section.items.some((i) => matchItem(i.to, location.pathname, location.search));

            return (
              <div key={section.title}>
                <button
                  type="button"
                  onClick={() => setOpenSection((prev) => prev === section.title ? null : section.title)}
                  className={`group relative flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left text-[11px] font-semibold transition-all duration-150 ${
                    isOpen || hasActiveChild
                      ? "bg-white/15 text-white"
                      : "text-white/70 hover:bg-white/8 hover:text-white"
                  }`}
                >
                  {hasActiveChild && (
                    <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-sm bg-rlx-gold" />
                  )}
                  <span className="flex items-center gap-3">
                    <span className={`flex h-7 w-7 items-center justify-center rounded ${
                      isOpen || hasActiveChild ? "bg-rlx-gold/20 text-rlx-gold" : "text-white/60 group-hover:text-white"
                    }`}>
                      <NavIcon name={section.icon} />
                    </span>
                    <span>{section.title}</span>
                  </span>
                  <span className={`text-white/40 transition-transform duration-200 ${isOpen ? "rotate-90 text-rlx-gold" : ""}`}>
                    <NavIcon name="chevron" className="h-3 w-3" />
                  </span>
                </button>

                {/* Sub-items */}
                <div className={`grid transition-all duration-200 ease-out ${isOpen ? "mt-0.5 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                  <div className="overflow-hidden">
                    <div className="ml-5 border-l border-white/12 pl-3 pb-1 pt-0.5 space-y-0.5">
                      {section.items.map((item) => {
                        const active = matchItem(item.to, location.pathname, location.search);
                        return (
                          <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.to === "/service/srf" || item.to === "/service/quick-bill" || item.to === "/service/billing"}
                            onClick={closeNav}
                            className={`relative block px-3 py-1.5 text-[12.5px] font-medium transition-all duration-150 ${
                              active
                                ? "bg-white/15 text-white font-semibold before:absolute before:-left-3 before:top-1/2 before:h-1.5 before:w-1.5 before:-translate-y-1/2 before:rounded-full before:bg-rlx-gold before:content-['']"
                                : "text-white/60 hover:bg-white/8 hover:text-white/90"
                            }`}
                          >
                            {sidebarItemLabel(item, user?.role ?? "")}
                          </NavLink>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </nav>

      {/* ── User footer ─────────────────────────────── */}
      <div className="relative shrink-0 border-t border-white/10 p-3">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rlx-gold text-[12px] font-bold text-rlx-green-deep shadow-sm">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[12.5px] font-semibold text-white">{user?.displayName ?? "Guest"}</p>
            <p className="truncate text-[10px] font-medium uppercase tracking-wide text-white/50">{roleLabelStr}</p>
          </div>
          <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-blue-400 shadow-[0_0_0_3px_rgba(59,130,246,0.25)]" />
        </div>
      </div>
    </aside>
  );
}
