import { canAccessModule } from "../config/moduleAccess";
import type { SessionUser, UserRole } from "../types/user";

/** Service centre supervisor: inventory module limited to Stock & prices (read-only). */
export function isInventoryStockPricesViewOnlyRole(role: UserRole | string | undefined): boolean {
  return role === "service_centre_supervisor";
}

export function isInventoryStockPricesViewOnly(user: SessionUser | null | undefined): boolean {
  if (!user) return false;
  return isInventoryStockPricesViewOnlyRole(user.role);
}

export function canAccessInventoryPath(user: SessionUser, pathname: string): boolean {
  if (!canAccessModule(user, "inventory")) return false;
  if (!isInventoryStockPricesViewOnly(user)) return true;
  return pathname === "/inventory/stock-prices";
}
