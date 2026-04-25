import { ROLE_MODULE_ACCESS } from "../config/moduleAccess";
import type { ModuleKey, UserRole } from "../types/user";

/** Stable order for module checkboxes (matches app navigation). */
export const ALL_MODULE_KEYS: ModuleKey[] = [
  "dashboard",
  "service",
  "inventory",
  "service_centre",
  "regions",
  "users",
  "settings",
];

/** Store-bound roles — server requires `storeId`. */
export const STORE_ROLES: UserRole[] = [
  "store_user",
  "store_purchase_user",
  "store_manager",
  "store_accounts",
];

export function isStoreRole(role: UserRole): boolean {
  return STORE_ROLES.includes(role);
}

export const MODULE_LABELS: Record<ModuleKey, string> = {
  dashboard: "Dashboard",
  service: "Service (store)",
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
  /** If true, HO Admin cannot pick this role (matches server). */
  blockedForHoAdmin: boolean;
};

/**
 * Mirrors server rules for who may create which role.
 * Order = display order within each group.
 */
export const ROLE_CREATION_META: RoleCreationMeta[] = [
  {
    value: "super_admin",
    label: "Super Admin",
    group: "system",
    summary: "Full system access; only use for top IT / owner accounts.",
    blockedForHoAdmin: true,
  },
  {
    value: "regional_admin",
    label: "Regional Admin",
    group: "system",
    summary: "Multi-HO oversight (legacy); manages regions and broad user lists.",
    blockedForHoAdmin: true,
  },
  { value: "ho_admin", label: "HO Admin", group: "ho", summary: "HO settings, users (within HO), regions visibility as configured.", blockedForHoAdmin: false },
  { value: "ho_manager", label: "HO Manager", group: "ho", summary: "PR/PO, stock, approvals, reports for this HO.", blockedForHoAdmin: false },
  { value: "ho_supervisor", label: "HO Supervisor", group: "ho", summary: "Service centre desk / distribution context; not logistics inward-outward.", blockedForHoAdmin: false },
  { value: "ho_user", label: "HO User", group: "ho", summary: "Operational HO user (e.g. PR to PO conversion).", blockedForHoAdmin: false },
  { value: "ho_accounts", label: "HO Accounts", group: "ho", summary: "HO-side accounts and related modules.", blockedForHoAdmin: false },
  {
    value: "service_centre_clerk",
    label: "Service centre clerk",
    group: "ho",
    summary: "SC logistics and desk workflows.",
    blockedForHoAdmin: false,
  },
  {
    value: "service_centre_supervisor",
    label: "Service centre supervisor",
    group: "ho",
    summary: "Assignments, supervisor queue, decisions.",
    blockedForHoAdmin: false,
  },
  {
    value: "service_centre_inward",
    label: "Service centre inward",
    group: "ho",
    summary: "DC inward only (receive from store / transfers).",
    blockedForHoAdmin: false,
  },
  {
    value: "service_centre_outward",
    label: "Service centre outward",
    group: "ho",
    summary: "ODC outward only (dispatch to store / HO).",
    blockedForHoAdmin: false,
  },
  { value: "technician", label: "Technician", group: "ho", summary: "Employee profile; login is disabled by default.", blockedForHoAdmin: false },
  { value: "store_user", label: "Store user", group: "store", summary: "Quick bill, SRF, dispatch to HO.", blockedForHoAdmin: false },
  { value: "store_purchase_user", label: "Store purchase user", group: "store", summary: "Purchase requests and store inward.", blockedForHoAdmin: false },
  { value: "store_manager", label: "Store manager", group: "store", summary: "PR approval at store, reports.", blockedForHoAdmin: false },
  { value: "store_accounts", label: "Store accounts", group: "store", summary: "Store-side accounts and billing views.", blockedForHoAdmin: false },
];

export function creatableRolesForActor(actorRole: UserRole | undefined): RoleCreationMeta[] {
  if (actorRole === "super_admin") return ROLE_CREATION_META;
  if (actorRole === "ho_admin") return ROLE_CREATION_META.filter((r) => !r.blockedForHoAdmin);
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
  "Only Super Admin or HO Admin can use Create user. Regional Admin can open this page and see their region’s directory but cannot create accounts.",
  "HO Admin cannot assign Super Admin or Regional Admin.",
  "HO Admin can only create users in the same HO region as their own account. For store roles, the store must belong to that region.",
  "Store roles require a store; HO and system roles use region only (no store).",
  "Login disabled: a directory-only profile is created with a generated email; the person cannot sign in until login is enabled and credentials are set.",
  "Module access: “Role default” uses the built-in module list for that role. “Custom list” replaces that list entirely — if you omit a module, the user loses it even if the role normally includes it.",
];
