import type { ModuleKey, UserRole } from "../types/user";

/**
 * Which modules each role can open. Change this when you define per-role modules.
 * Keys must match `ModuleKey` and route config in `navigation.ts`.
 */
export const ROLE_MODULE_ACCESS: Record<UserRole, ModuleKey[]> = {
  super_admin: ["dashboard", "service", "regions", "users", "service_centre", "inventory"],
  regional_admin: ["dashboard", "service", "regions", "users", "service_centre", "inventory"],
  store_user: ["dashboard", "service", "inventory"],
  service_centre_clerk: ["dashboard", "service_centre"],
  service_centre_supervisor: ["dashboard", "service_centre"],
  technician: ["dashboard", "service_centre"],
};

export function canAccessModule(role: UserRole, module: ModuleKey): boolean {
  return ROLE_MODULE_ACCESS[role].includes(module);
}
