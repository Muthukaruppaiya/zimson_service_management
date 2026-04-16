import type { ModuleKey } from "./types/user";

export type NavItem = {
  to: string;
  label: string;
  description: string;
  module: ModuleKey;
  badge?: string;
};

export const mainNav: NavItem[] = [
  {
    to: "/",
    label: "Dashboard",
    description: "Overview and KPIs",
    module: "dashboard",
  },
  {
    to: "/service",
    label: "Service",
    description: "SRF, quick bill, store dispatch",
    module: "service",
    badge: "Store",
  },
  {
    to: "/service-centre",
    label: "Service centre",
    description: "Inward, assign, technician",
    module: "service_centre",
    badge: "HO",
  },
  {
    to: "/inventory",
    label: "Inventory",
    description: "Spares, watches, PR → PO, inward",
    module: "inventory",
    badge: "New",
  },
  {
    to: "/regions",
    label: "Regions & stores",
    description: "Hierarchy and locations",
    module: "regions",
  },
  {
    to: "/users",
    label: "Users & privileges",
    description: "Create users and roles",
    module: "users",
  },
];
