import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { canAccessModule } from "../../config/moduleAccess";
import { useAuth } from "../../context/AuthContext";
import { DEFAULT_APP_LOGO_URL, getAppLogoUrl, refreshAppBrandingFromServer } from "../../lib/appBranding";
import type { UserRole } from "../../types/user";

type IconName =
  | "dashboard"
  | "service"
  | "accounts"
  | "inventory"
  | "purchase"
  | "billing"
  | "master"
  | "settings"
  | "chevron"
  | "sparkle"
  | "logistics"
  | "supervisor"
  | "online";

function NavIcon({ name, className = "" }: { name: IconName; className?: string }) {
  const cls = `h-4 w-4 shrink-0 stroke-[1.75] ${className}`.trim();
  switch (name) {
    case "dashboard":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      );
    case "service":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case "accounts":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.9 0-3.5.9-3.5 2s1.6 2 3.5 2 3.5.9 3.5 2-1.6 2-3.5 2m0-10v10m0-10c1.2 0 2.3.35 3 .9M12 8c-1.2 0-2.3.35-3 .9" />
        </svg>
      );
    case "inventory":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      );
    case "purchase":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      );
    case "billing":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21l-7-3-7 3V5a2 2 0 012-2h10a2 2 0 012 2v16z" />
        </svg>
      );
    case "master":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6M5 4h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1z" />
        </svg>
      );
    case "settings":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    case "chevron":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      );
    case "sparkle":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
        </svg>
      );
    case "logistics":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zm10 0a2 2 0 11-4 0 2 2 0 014 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 011-1h2.05a2.5 2.5 0 014.9 0H20a1 1 0 011 1m-8 0h2m-9-9h6" />
        </svg>
      );
    case "supervisor":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      );
    case "online":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18M6 7V5a2 2 0 012-2h8a2 2 0 012 2v2m-1 5l-5 5-3-3" />
        </svg>
      );
    default:
      return null;
  }
}

type ModuleKey =
  | "dashboard"
  | "service"
  | "accounts"
  | "inventory"
  | "regions"
  | "users"
  | "settings"
  | "service_centre";

type SidebarItem = {
  to: string;
  label: string;
  module: ModuleKey;
  /** If provided, only these roles see the item (admins always see). */
  roles?: UserRole[];
};

type SidebarSection = {
  title: string;
  icon: IconName;
  accent: string;
  iconText: string;
  items: SidebarItem[];
};

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super admin",
  regional_admin: "Regional admin",
  ho_admin: "HO admin",
  ho_manager: "HO manager",
  ho_supervisor: "HO supervisor",
  ho_user: "HO user",
  ho_accounts: "HO accounts",
  store_user: "Store user",
  store_purchase_user: "Store purchase",
  store_manager: "Store manager",
  store_accounts: "Store accounts",
  service_centre_clerk: "SC clerk",
  service_centre_supervisor: "SC supervisor",
  service_centre_inward: "SC inward",
  service_centre_outward: "SC outward",
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
      // For service-centre/logistics?tab=inward, treat empty current tab as inward (page default).
      if (k === "tab" && v === "inward" && !currentParams.get("tab")) continue;
      return false;
    }
  }
  return true;
}

export function Sidebar() {
  const { user } = useAuth();
  const location = useLocation();
  const [logoUrl, setLogoUrl] = useState(getAppLogoUrl());
  const [openSection, setOpenSection] = useState<string | null>(null);

  const sections = useMemo<SidebarSection[]>(() => {
    if (!user) return [];
    const all: SidebarSection[] = [
      {
        title: "Service",
        icon: "service",
        accent: "from-amber-200/90 via-amber-100 to-amber-50",
        iconText: "text-amber-800",
        items: [
          { to: "/service/quick-bill", label: "Quick bill", module: "service" },
          { to: "/service/quick-bill-history", label: "Quick bill history", module: "service" },
          { to: "/service/srf", label: "SRF booking", module: "service" },
          { to: "/service/srf-register", label: "SRF history", module: "service" },
          { to: "/service/srf-master", label: "SRF master table", module: "service" },
        ],
      },
      {
        title: "Accounts",
        icon: "accounts",
        accent: "from-lime-200/90 via-lime-100 to-lime-50",
        iconText: "text-lime-800",
        items: [{ to: "/accounts/setup", label: "Accounts setup", module: "accounts" }],
      },
      {
        title: "Inventory",
        icon: "inventory",
        accent: "from-emerald-200/90 via-emerald-100 to-emerald-50",
        iconText: "text-emerald-800",
        items: [
          { to: "/inventory/spares", label: "Spares", module: "inventory" },
          { to: "/inventory/stock-adjustment", label: "Stock adjustment", module: "inventory" },
          { to: "/service/watch-inventory", label: "Watch inventory", module: "service" },
          { to: "/inventory/stock-prices", label: "Stock & prices", module: "inventory" },
        ],
      },
      {
        title: "Purchase",
        icon: "purchase",
        accent: "from-sky-200/90 via-sky-100 to-sky-50",
        iconText: "text-sky-800",
        items: [
          { to: "/inventory/purchase-requests", label: "PR", module: "inventory" },
          { to: "/inventory/purchase-orders", label: "PO", module: "inventory" },
          { to: "/inventory/po-inward", label: "GRN", module: "inventory" },
        ],
      },
      {
        title: "Billing",
        icon: "billing",
        accent: "from-rose-200/90 via-rose-100 to-rose-50",
        iconText: "text-rose-800",
        items: [
          { to: "/service/store-billing", label: "Store billing", module: "service" },
          { to: "/service/store-billing-master", label: "Store billing history", module: "service" },
          { to: "/service/billing", label: "HO billing", module: "service" },
        ],
      },
      {
        title: "Logistics",
        icon: "logistics",
        accent: "from-orange-200/90 via-orange-100 to-orange-50",
        iconText: "text-orange-800",
        items: [
          { to: "/service/store-dispatch", label: "Store dispatch", module: "service" },
          {
            to: "/service-centre/logistics?tab=inward",
            label: "Internal inward (Store -> HO)",
            module: "service_centre",
            roles: ["service_centre_inward", "service_centre_clerk"],
          },
          {
            to: "/service-centre/logistics?tab=outward",
            label: "Internal outward (HO -> Store)",
            module: "service_centre",
            roles: ["service_centre_outward", "service_centre_clerk"],
          },
          {
            to: "/service-centre/logistics-history",
            label: "DC / ODC history",
            module: "service_centre",
            roles: ["service_centre_inward", "service_centre_outward", "service_centre_clerk"],
          },
        ],
      },
      {
        title: "Online Store",
        icon: "online",
        accent: "from-cyan-200/90 via-cyan-100 to-cyan-50",
        iconText: "text-cyan-800",
        items: [
          {
            to: "/service-centre/online-store",
            label: "Inter-HO online orders",
            module: "service_centre",
            roles: ["service_centre_supervisor", "ho_supervisor"],
          },
        ],
      },
      {
        title: "Supervision",
        icon: "supervisor",
        accent: "from-teal-200/90 via-teal-100 to-teal-50",
        iconText: "text-teal-800",
        items: [
          {
            to: "/service-centre/supervisor",
            label: "Assigning",
            module: "service_centre",
            roles: ["service_centre_supervisor", "ho_supervisor"],
          },
        ],
      },
      {
        title: "Master Data",
        icon: "master",
        accent: "from-fuchsia-200/90 via-fuchsia-100 to-fuchsia-50",
        iconText: "text-fuchsia-800",
        items: [
          { to: "/service/customers/master", label: "Customer master", module: "service" },
          { to: "/inventory/suppliers", label: "Supplier master", module: "inventory" },
          { to: "/users", label: "Users creation", module: "users" },
          { to: "/users/list", label: "Users list", module: "users" },
          {
            to: "/service-centre/technicians-master",
            label: "Technician creation/list",
            module: "service_centre",
            roles: ["service_centre_supervisor", "ho_supervisor", "ho_manager"],
          },
        ],
      },
      {
        title: "Settings",
        icon: "settings",
        accent: "from-violet-200/90 via-violet-100 to-violet-50",
        iconText: "text-violet-800",
        items: [
          { to: "/regions", label: "Regions & stores", module: "regions" },
          { to: "/settings/tax", label: "Tax & billing", module: "settings" },
          { to: "/settings/document-templates", label: "Document templates", module: "settings" },
          { to: "/inventory/brands", label: "Brand", module: "inventory" },
        ],
      },
    ];

    const isAdmin =
      user.role === "super_admin" ||
      user.role === "regional_admin" ||
      user.role === "ho_admin";

    return all
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => {
          if (!canAccessModule(user, item.module)) return false;
          if (item.roles && item.roles.length > 0) {
            if (!isAdmin && !item.roles.includes(user.role)) return false;
          }
          return true;
        }),
      }))
      .filter((section) => section.items.length > 0);
  }, [user]);

  useEffect(() => {
    const hit = sections.find((s) =>
      s.items.some((i) => matchItem(i.to, location.pathname, location.search)),
    );
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

  const roleLabel = user ? ROLE_LABELS[user.role] ?? user.role : "";
  const initials = initialsOf(user?.displayName ?? "");

  return (
    <aside className="print:hidden hidden md:flex md:flex-col w-64 shrink-0 relative overflow-hidden border-r border-zimson-200/70 bg-gradient-to-b from-white via-zimson-50 to-zimson-100/60">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -left-16 h-56 w-56 rounded-full bg-gradient-to-br from-zimson-300/40 to-amber-200/30 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 -right-12 h-48 w-48 rounded-full bg-gradient-to-tr from-amber-200/30 to-zimson-200/40 blur-3xl"
      />

      <div className="relative flex h-16 items-center gap-3 border-b border-zimson-200/70 bg-white/60 px-4 backdrop-blur-sm">
        <div className="relative">
          <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-zimson-500/30 to-amber-300/30 blur-md" />
          <img
            src={logoUrl}
            alt="Zimson logo"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).onerror = null;
              (e.currentTarget as HTMLImageElement).src = DEFAULT_APP_LOGO_URL;
            }}
            className="relative h-10 w-10 rounded-xl border border-zimson-200 bg-white object-contain p-1 shadow-sm"
          />
          <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
        </div>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[15px] font-bold tracking-tight text-stone-900">Zimson</p>
          <p className="truncate text-[10.5px] font-semibold uppercase tracking-[0.12em] text-stone-500">
            Service suite
          </p>
        </div>
      </div>

      <nav className="relative flex flex-1 flex-col overflow-y-auto px-3 py-4" aria-label="Main">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            [
              "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200",
              isActive
                ? "bg-gradient-to-r from-zimson-700 via-zimson-600 to-zimson-500 text-white shadow-lg shadow-zimson-600/25"
                : "text-stone-700 hover:bg-white hover:text-stone-900 hover:shadow-sm hover:ring-1 hover:ring-zimson-200/60",
            ].join(" ")
          }
        >
          {({ isActive }) => (
            <>
              {isActive ? (
                <span className="absolute -left-3 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-zimson-500 shadow-sm shadow-zimson-500/40" />
              ) : null}
              <span
                className={
                  isActive
                    ? "rounded-lg bg-white/20 p-1.5 text-white ring-1 ring-white/20"
                    : "rounded-lg bg-zimson-100/80 p-1.5 text-zimson-700 group-hover:bg-zimson-200"
                }
              >
                <NavIcon name="dashboard" />
              </span>
              <span className="tracking-tight">Dashboard</span>
              {isActive ? (
                <span className="ml-auto opacity-80">
                  <NavIcon name="sparkle" className="h-3.5 w-3.5" />
                </span>
              ) : null}
            </>
          )}
        </NavLink>

        <div className="mt-5 mb-2 flex items-center gap-2 px-2">
          <span className="h-px flex-1 bg-gradient-to-r from-transparent via-zimson-200 to-transparent" />
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">
            Modules
          </span>
          <span className="h-px flex-1 bg-gradient-to-r from-transparent via-zimson-200 to-transparent" />
        </div>

        <div className="space-y-1">
          {sections.map((section) => {
            const isOpen = openSection === section.title;
            const hasActiveChild = section.items.some((i) =>
              matchItem(i.to, location.pathname, location.search),
            );
            return (
              <div key={section.title}>
                <button
                  type="button"
                  onClick={() =>
                    setOpenSection((prev) => (prev === section.title ? null : section.title))
                  }
                  className={[
                    "group relative flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-all duration-200",
                    isOpen || hasActiveChild
                      ? "bg-white text-stone-900 shadow-sm ring-1 ring-zimson-200"
                      : "text-stone-700 hover:bg-white/80 hover:text-stone-900 hover:ring-1 hover:ring-zimson-200/60",
                  ].join(" ")}
                >
                  {hasActiveChild ? (
                    <span className="absolute -left-3 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-zimson-500 shadow-sm shadow-zimson-500/40" />
                  ) : null}
                  <span className="flex items-center gap-3">
                    <span
                      className={[
                        "flex h-7 w-7 items-center justify-center rounded-lg transition-all",
                        isOpen || hasActiveChild
                          ? `bg-gradient-to-br ${section.accent} ${section.iconText} shadow-sm ring-1 ring-white/60`
                          : "bg-stone-100 text-stone-600 group-hover:bg-zimson-100 group-hover:text-zimson-800",
                      ].join(" ")}
                    >
                      <NavIcon name={section.icon} />
                    </span>
                    <span className="tracking-tight">{section.title}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-600 group-hover:bg-zimson-100 group-hover:text-zimson-700">
                      {section.items.length}
                    </span>
                    <span
                      className={[
                        "text-stone-400 transition-transform duration-200",
                        isOpen ? "rotate-90 text-zimson-700" : "",
                      ].join(" ")}
                    >
                      <NavIcon name="chevron" className="h-3.5 w-3.5" />
                    </span>
                  </span>
                </button>
                <div
                  className={[
                    "grid transition-all duration-200 ease-out",
                    isOpen ? "mt-1 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                  ].join(" ")}
                >
                  <div className="overflow-hidden">
                    <div className="ml-4 space-y-0.5 border-l border-dashed border-zimson-300/70 pl-3">
                      {section.items.map((item) => {
                        const active = matchItem(item.to, location.pathname, location.search);
                        return (
                          <NavLink
                            key={item.to}
                            to={item.to}
                            end={
                              item.to === "/service/srf" ||
                              item.to === "/service/quick-bill" ||
                              item.to === "/service/billing"
                            }
                            className={[
                              "relative block rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all",
                              active
                                ? "bg-gradient-to-r from-zimson-50 to-white text-zimson-900 shadow-sm ring-1 ring-zimson-200/70 before:absolute before:-left-[14px] before:top-1/2 before:h-2 before:w-2 before:-translate-y-1/2 before:rounded-full before:bg-zimson-600 before:shadow-[0_0_0_3px_rgba(255,255,255,1)] before:content-['']"
                                : "text-stone-600 hover:translate-x-0.5 hover:bg-white/90 hover:text-stone-900",
                            ].join(" ")}
                          >
                            {item.label}
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

      <div className="relative border-t border-zimson-200/70 bg-white/60 p-3 backdrop-blur-sm">
        <div className="flex items-center gap-3 rounded-xl bg-gradient-to-br from-zimson-50 via-white to-amber-50/60 px-3 py-2.5 ring-1 ring-zimson-200/70">
          <div className="relative">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-zimson-700 to-zimson-500 text-xs font-bold text-white shadow-sm ring-2 ring-white">
              {initials}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
          </div>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[12.5px] font-semibold text-stone-900">
              {user?.displayName ?? "Guest"}
            </p>
            <p className="truncate text-[10.5px] font-medium text-stone-500">{roleLabel}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
