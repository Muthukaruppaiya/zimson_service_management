import type { DashboardQuickLinkId } from "./dashboardQuickLinks";

export type QuickLinkIconTone = {
  tile: string;
  icon: string;
  hoverRing: string;
};

/** ChronoSync reference: light grey gradient tiles, colourful illustrated icons. */
const CHRONO_TILE =
  "border-[#e5e8ef] bg-gradient-to-b from-[#fafbfc] to-[#eef1f6] shadow-sm";

export const QUICK_LINK_ICON_TONE: Record<DashboardQuickLinkId, QuickLinkIconTone> = {
  quick_bill: { tile: CHRONO_TILE, icon: "", hoverRing: "group-hover:ring-[#3B82F6]/40" },
  srf_booking: { tile: CHRONO_TILE, icon: "", hoverRing: "group-hover:ring-[#1B3A8F]/25" },
  parts_order: { tile: CHRONO_TILE, icon: "", hoverRing: "group-hover:ring-[#2563EB]/30" },
  quick_bill_history: { tile: CHRONO_TILE, icon: "", hoverRing: "group-hover:ring-[#1B3A8F]/25" },
  srf_register: { tile: CHRONO_TILE, icon: "", hoverRing: "group-hover:ring-[#2563EB]/30" },
  srf_master: { tile: CHRONO_TILE, icon: "", hoverRing: "group-hover:ring-[#64748B]/30" },
  store_billing: { tile: CHRONO_TILE, icon: "", hoverRing: "group-hover:ring-[#1B3A8F]/25" },
  service_billing: { tile: CHRONO_TILE, icon: "", hoverRing: "group-hover:ring-[#1B3A8F]/25" },
  customer_master: { tile: CHRONO_TILE, icon: "", hoverRing: "group-hover:ring-[#1B3A8F]/25" },
  store_dispatch: { tile: CHRONO_TILE, icon: "", hoverRing: "group-hover:ring-[#3B82F6]/30" },
  store_assign: { tile: CHRONO_TILE, icon: "", hoverRing: "group-hover:ring-[#16A34A]/30" },
};
