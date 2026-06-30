import type { DashboardActionItem } from "./dashboardActionItems";

export type ActionCardStyle = {
  bar: string;
  iconBg: string;
  iconColor: string;
  glow: string;
};

const DEFAULT: ActionCardStyle = {
  bar: "bg-gradient-to-r from-rlx-green to-rlx-gold",
  iconBg: "bg-rlx-green-light",
  iconColor: "text-rlx-green",
  glow: "group-hover:shadow-rlx-green/10",
};

const BY_ID: Record<string, ActionCardStyle> = {
  "sc-dc-inward": {
    bar: "bg-gradient-to-r from-orange-500 to-amber-400",
    iconBg: "bg-orange-50",
    iconColor: "text-orange-600",
    glow: "group-hover:shadow-orange-500/15",
  },
  "sc-odc-outward": {
    bar: "bg-gradient-to-r from-cyan-500 to-sky-400",
    iconBg: "bg-cyan-50",
    iconColor: "text-cyan-700",
    glow: "group-hover:shadow-cyan-500/15",
  },
  "sc-brand-dispatch": {
    bar: "bg-gradient-to-r from-violet-600 to-purple-400",
    iconBg: "bg-violet-50",
    iconColor: "text-violet-700",
    glow: "group-hover:shadow-violet-500/15",
  },
  "sc-assign": {
    bar: "bg-gradient-to-r from-sky-500 to-blue-400",
    iconBg: "bg-sky-50",
    iconColor: "text-sky-700",
    glow: "group-hover:shadow-sky-500/15",
  },
  "store-odc-inward": {
    bar: "bg-gradient-to-r from-orange-500 to-amber-400",
    iconBg: "bg-orange-50",
    iconColor: "text-orange-600",
    glow: "group-hover:shadow-orange-500/15",
  },
  "store-dispatch": {
    bar: "bg-gradient-to-r from-blue-600 to-indigo-400",
    iconBg: "bg-blue-50",
    iconColor: "text-blue-700",
    glow: "group-hover:shadow-blue-500/15",
  },
  "store-handover": {
    bar: "bg-gradient-to-r from-emerald-600 to-green-400",
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-700",
    glow: "group-hover:shadow-emerald-500/15",
  },
  "store-approval": {
    bar: "bg-gradient-to-r from-violet-600 to-fuchsia-400",
    iconBg: "bg-violet-50",
    iconColor: "text-violet-700",
    glow: "group-hover:shadow-violet-500/15",
  },
  "tech-queue": {
    bar: "bg-gradient-to-r from-sky-500 to-cyan-400",
    iconBg: "bg-sky-50",
    iconColor: "text-sky-700",
    glow: "group-hover:shadow-sky-500/15",
  },
  "open-srf": {
    bar: "bg-gradient-to-r from-amber-500 to-yellow-400",
    iconBg: "bg-amber-50",
    iconColor: "text-amber-700",
    glow: "group-hover:shadow-amber-500/15",
  },
  "customer-approval": {
    bar: "bg-gradient-to-r from-violet-600 to-purple-400",
    iconBg: "bg-violet-50",
    iconColor: "text-violet-700",
    glow: "group-hover:shadow-violet-500/15",
  },
  "at-ho": {
    bar: "bg-gradient-to-r from-sky-600 to-blue-400",
    iconBg: "bg-sky-50",
    iconColor: "text-sky-700",
    glow: "group-hover:shadow-sky-500/15",
  },
  handover: {
    bar: "bg-gradient-to-r from-emerald-600 to-teal-400",
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-700",
    glow: "group-hover:shadow-emerald-500/15",
  },
};

export function actionCardStyle(item: Pick<DashboardActionItem, "id">): ActionCardStyle {
  return BY_ID[item.id] ?? DEFAULT;
}

export function roleDashboardLabel(role: string | undefined): string {
  switch (role) {
    case "store_user":
      return "Store front desk";
    case "store_manager":
      return "Store manager";
    case "store_accounts":
      return "Store accounts";
    case "service_centre_clerk":
      return "Service centre clerk";
    case "service_centre_supervisor":
      return "Service centre supervisor";
    case "ho_manager":
      return "HO manager";
    case "ho_accounts":
      return "HO accounts";
    case "technician":
      return "Technician";
    case "super_admin":
      return "Super admin";
    case "admin":
      return "Administrator";
    default:
      return "Dashboard";
  }
}
