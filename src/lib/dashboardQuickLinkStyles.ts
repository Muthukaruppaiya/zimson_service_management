import type { DashboardQuickLinkId } from "./dashboardQuickLinks";

export type QuickLinkIconTone = {
  tile: string;
  icon: string;
  hoverRing: string;
};

export const QUICK_LINK_ICON_TONE: Record<DashboardQuickLinkId, QuickLinkIconTone> = {
  quick_bill: {
    tile: "border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-amber-100/70",
    icon: "text-amber-800",
    hoverRing: "group-hover:ring-amber-300/80",
  },
  srf_booking: {
    tile: "border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-blue-100/60",
    icon: "text-rlx-green",
    hoverRing: "group-hover:ring-sky-300/80",
  },
  quick_bill_history: {
    tile: "border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-purple-100/60",
    icon: "text-violet-800",
    hoverRing: "group-hover:ring-violet-300/80",
  },
  srf_register: {
    tile: "border-teal-200/80 bg-gradient-to-br from-teal-50 via-white to-emerald-100/50",
    icon: "text-teal-800",
    hoverRing: "group-hover:ring-teal-300/80",
  },
  srf_master: {
    tile: "border-indigo-200/80 bg-gradient-to-br from-indigo-50 via-white to-indigo-100/60",
    icon: "text-indigo-800",
    hoverRing: "group-hover:ring-indigo-300/80",
  },
  store_billing: {
    tile: "border-rlx-gold/40 bg-gradient-to-br from-rlx-gold-light/80 via-white to-amber-50",
    icon: "text-rlx-gold-dark",
    hoverRing: "group-hover:ring-rlx-gold/50",
  },
  service_billing: {
    tile: "border-cyan-200/80 bg-gradient-to-br from-cyan-50 via-white to-sky-100/60",
    icon: "text-cyan-900",
    hoverRing: "group-hover:ring-cyan-300/80",
  },
  customer_master: {
    tile: "border-rose-200/80 bg-gradient-to-br from-rose-50 via-white to-pink-100/50",
    icon: "text-rose-800",
    hoverRing: "group-hover:ring-rose-300/80",
  },
  store_dispatch: {
    tile: "border-orange-200/80 bg-gradient-to-br from-orange-50 via-white to-amber-100/50",
    icon: "text-orange-800",
    hoverRing: "group-hover:ring-orange-300/80",
  },
  store_assign: {
    tile: "border-lime-200/80 bg-gradient-to-br from-lime-50 via-white to-green-100/50",
    icon: "text-lime-900",
    hoverRing: "group-hover:ring-lime-300/80",
  },
};
