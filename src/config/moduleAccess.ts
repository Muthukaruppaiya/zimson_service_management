import type { ModuleKey, SessionUser, UserRole } from "../types/user";

/**
 * Which modules each role can open. Change this when you define per-role modules.
 * Keys must match `ModuleKey` and route config in `navigation.ts`.
 */
export const ROLE_MODULE_ACCESS: Record<UserRole, ModuleKey[]> = {
  ho_admin: ["dashboard", "service", "accounts", "regions", "users", "service_centre", "inventory", "settings"],
  ho_manager: ["dashboard", "inventory", "service_centre", "accounts"],
  ho_supervisor: ["dashboard", "service_centre", "inventory"],
  ho_user: ["dashboard", "inventory"],
  ho_accounts: ["dashboard", "inventory", "service", "accounts", "settings"],
  super_admin: ["dashboard", "service", "accounts", "regions", "users", "service_centre", "inventory", "settings"],
  regional_admin: ["dashboard", "service", "accounts", "regions", "users", "service_centre", "inventory", "settings"],
  store_user: ["dashboard", "service", "inventory"],
  store_purchase_user: ["dashboard", "inventory"],
  store_manager: ["dashboard", "inventory", "service"],
  store_accounts: ["dashboard", "inventory", "service", "accounts", "settings"],
  service_centre_clerk: ["dashboard", "service_centre"],
  service_centre_supervisor: ["dashboard", "service_centre"],
  service_centre_inward: ["dashboard", "service_centre"],
  service_centre_outward: ["dashboard", "service_centre"],
  technician: ["dashboard"],
};

export function canAccessModule(subject: UserRole | SessionUser, module: ModuleKey): boolean {
  if (typeof subject === "string") {
    return ROLE_MODULE_ACCESS[subject].includes(module);
  }
  const override = subject.moduleAccessOverride?.length ? subject.moduleAccessOverride : null;
  const base = override ?? ROLE_MODULE_ACCESS[subject.role];
  return base.includes(module);
}
