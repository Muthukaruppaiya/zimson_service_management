import { canAccessModule } from "../config/moduleAccess";
import type { ModuleKey, SessionUser } from "../types/user";

export type DashboardQuickLinkId =
  | "quick_bill"
  | "srf_booking"
  | "quick_bill_history"
  | "srf_register"
  | "srf_master"
  | "store_billing"
  | "service_billing"
  | "customer_master"
  | "store_dispatch"
  | "store_assign";

export type DashboardQuickLinkDef = {
  id: DashboardQuickLinkId;
  label: string;
  /** Short name under the icon on the dashboard (1–2 words). */
  shortLabel: string;
  description: string;
  to: string;
  module: ModuleKey;
};

export const DASHBOARD_QUICK_LINK_CATALOG: DashboardQuickLinkDef[] = [
  {
    id: "quick_bill",
    label: "Quick bill entry",
    shortLabel: "Quick bill",
    description: "Walk-in repair billing and customer upload link.",
    to: "/service/quick-bill",
    module: "service",
  },
  {
    id: "srf_booking",
    label: "SRF booking",
    shortLabel: "SRF booking",
    description: "New service request — photos, estimate, and OTP.",
    to: "/service/srf",
    module: "service",
  },
  {
    id: "quick_bill_history",
    label: "Quick bill history",
    shortLabel: "Bill history",
    description: "Past quick bills and invoice reprints.",
    to: "/service/quick-bill-history",
    module: "service",
  },
  {
    id: "srf_register",
    label: "SRF booking list",
    shortLabel: "SRF list",
    description: "Open and in-progress SRF jobs.",
    to: "/service/srf-register",
    module: "service",
  },
  {
    id: "srf_master",
    label: "All SRF records",
    shortLabel: "All SRF",
    description: "Search and filter full SRF timelines.",
    to: "/service/srf-master",
    module: "service",
  },
  {
    id: "store_billing",
    label: "Store billing",
    shortLabel: "Billing",
    description: "Close SRF jobs and raise store invoices.",
    to: "/service/store-billing",
    module: "service",
  },
  {
    id: "service_billing",
    label: "Service billing",
    shortLabel: "Service bill",
    description: "Counter billing and customer lookup.",
    to: "/service/billing",
    module: "service",
  },
  {
    id: "customer_master",
    label: "Customer master",
    shortLabel: "Customers",
    description: "View and edit customer profiles.",
    to: "/service/customers/master",
    module: "service",
  },
  {
    id: "store_dispatch",
    label: "Store dispatch",
    shortLabel: "Dispatch",
    description: "Send watches to HO / service centre.",
    to: "/service/store-dispatch",
    module: "service",
  },
  {
    id: "store_assign",
    label: "Store assign",
    shortLabel: "Assign",
    description: "Assign jobs to technicians at store.",
    to: "/service/store-assign",
    module: "service",
  },
];

const DEFAULT_LINK_IDS: DashboardQuickLinkId[] = ["quick_bill", "srf_booking", "store_billing"];

export function quickLinksAvailableForUser(user: SessionUser | null): DashboardQuickLinkDef[] {
  if (!user) return [];
  return DASHBOARD_QUICK_LINK_CATALOG.filter((item) => canAccessModule(user, item.module));
}

export function defaultQuickLinkIdsForUser(user: SessionUser | null): DashboardQuickLinkId[] {
  const available = new Set(quickLinksAvailableForUser(user).map((x) => x.id));
  const picked = DEFAULT_LINK_IDS.filter((id) => available.has(id));
  if (picked.length > 0) return picked;
  return [...available].slice(0, 3);
}

export function resolveQuickLinkDefs(
  user: SessionUser | null,
  ids: DashboardQuickLinkId[],
): DashboardQuickLinkDef[] {
  const available = quickLinksAvailableForUser(user);
  const byId = new Map(available.map((x) => [x.id, x]));
  return ids.map((id) => byId.get(id)).filter((x): x is DashboardQuickLinkDef => Boolean(x));
}
