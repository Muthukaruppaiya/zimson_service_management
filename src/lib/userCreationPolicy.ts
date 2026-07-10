import { ROLE_MODULE_ACCESS } from "../config/moduleAccess";
import type { ModuleKey, UserRole } from "../types/user";

/** Stable order for module checkboxes (matches app navigation). */
export const ALL_MODULE_KEYS: ModuleKey[] = [
  "dashboard",
  "service",
  "reports",
  "accounts",
  "analytics",
  "inventory",
  "service_centre",
  "regions",
  "users",
  "settings",
];

/** Store-bound roles — server requires `storeId`. */
export const STORE_ROLES: UserRole[] = [
  "store_user",
  "store_manager",
  "store_accounts",
];

export function isStoreRole(role: UserRole): boolean {
  return STORE_ROLES.includes(role);
}

export const MODULE_LABELS: Record<ModuleKey, string> = {
  dashboard: "Dashboard",
  service: "Service (store)",
  reports: "Reports",
  accounts: "Accounts",
  analytics: "BI analytics",
  inventory: "Inventory",
  service_centre: "Service centre (HO / SC)",
  regions: "Regions & stores",
  users: "Users & privileges",
  settings: "Settings",
};

export type RoleCreationMeta = {
  value: UserRole;
  label: string;
  group: "system" | "ho" | "store";
  /** One line — shown in UI */
  summary: string;
  /** If true, only Super Admin can assign this role (Admin cannot). */
  superAdminOnly: boolean;
};

/**
 * Mirrors server rules for who may create which role.
 * Order = display order within each group.
 */
export const ROLE_CREATION_META: RoleCreationMeta[] = [
  // ── System ───────────────────────────────────────────────────────────────
  {
    value: "super_admin",
    label: "Super Admin",
    group: "system",
    summary: "Full system access across all regions. For top IT / owner accounts only.",
    superAdminOnly: true,
  },
  {
    value: "admin",
    label: "Admin (HO)",
    group: "system",
    summary: "Manages one HO region and all stores under it. Full access within their region.",
    superAdminOnly: true,
  },
  // ── HO & Service Centre ───────────────────────────────────────────────────
  {
    value: "ho_manager",
    label: "HO Manager",
    group: "ho",
    summary: "Approvals, PO management, stock and reports for this HO.",
    superAdminOnly: false,
  },
  {
    value: "ho_accounts",
    label: "HO Accounts",
    group: "ho",
    summary: "HO-side accounts, billing and financial views.",
    superAdminOnly: false,
  },
  {
    value: "ho_purchase",
    label: "HO Purchase",
    group: "ho",
    summary: "Purchase requests, vendor management and inventory inward at HO.",
    superAdminOnly: false,
  },
  {
    value: "service_centre_clerk",
    label: "Service Centre Clerk (Front Desk)",
    group: "ho",
    summary: "Front desk — handles SRF intake, customer communication, inward & outward.",
    superAdminOnly: false,
  },
  {
    value: "service_centre_supervisor",
    label: "Service Centre Supervisor",
    group: "ho",
    summary: "Technician assignments, supervisor queue, quality decisions.",
    superAdminOnly: false,
  },
  // ── Store ─────────────────────────────────────────────────────────────────
  {
    value: "store_user",
    label: "Store User",
    group: "store",
    summary: "Quick bill, SRF creation and dispatch to service centre.",
    superAdminOnly: false,
  },
  {
    value: "store_manager",
    label: "Store Manager",
    group: "store",
    summary: "PR approval at store level, store reports and overrides.",
    superAdminOnly: false,
  },
  {
    value: "store_accounts",
    label: "Store Accounts",
    group: "store",
    summary: "Store-side accounts, billing views and end-of-day reports.",
    superAdminOnly: false,
  },
];

export function creatableRolesForActor(actorRole: UserRole | undefined): RoleCreationMeta[] {
  if (actorRole === "super_admin") return ROLE_CREATION_META;
  if (actorRole === "admin") return ROLE_CREATION_META.filter((r) => !r.superAdminOnly);
  return [];
}

/**
 * Effective sidebar modules: if override is non-empty, it **replaces** role defaults entirely
 * (same as `canAccessModule` in `moduleAccess.ts`).
 */
export function effectiveModuleAccess(role: UserRole, override: ModuleKey[] | null | undefined): ModuleKey[] {
  if (override && override.length > 0) return [...override];
  return [...ROLE_MODULE_ACCESS[role]];
}

export const CREATION_POLICY_BULLETS = [
  "Only Super Admin can create Admin (HO) accounts.",
  "Admin can create all HO and Store roles within their own region.",
  "Store roles (Store User, Store Manager, Store Accounts) require a store assignment.",
  "Technicians are created via the dedicated Technician Master page — not here.",
  "Login can be disabled per user; they appear in the directory but cannot sign in.",
];
