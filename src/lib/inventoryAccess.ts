import { canAccessModule } from "../config/moduleAccess";
import type { SessionUser, UserRole } from "../types/user";

/** Service centre supervisor: inventory module limited to Stock & prices (read-only). */
export function isInventoryStockPricesViewOnlyRole(role: UserRole | string | undefined): boolean {
  return role === "service_centre_supervisor" || role === "store_user";
}

export function isInventoryStockPricesViewOnly(user: SessionUser | null | undefined): boolean {
  if (!user) return false;
  return isInventoryStockPricesViewOnlyRole(user.role);
}

export function isStoreInwardRole(role: UserRole | string | undefined): boolean {
  return role === "store_user" || role === "store_manager" || role === "store_accounts";
}

export function canViewStoreInward(role: UserRole | string | undefined): boolean {
  return (
    isStoreInwardRole(role) ||
    role === "super_admin" ||
    role === "admin" ||
    role === "ho_manager" ||
    role === "ho_purchase"
  );
}

export function canAccessInventoryPath(user: SessionUser, pathname: string): boolean {
  if (!canAccessModule(user, "inventory")) return false;
  if (pathname === "/inventory/store-inward") return canViewStoreInward(user.role);
  if (!isInventoryStockPricesViewOnly(user)) return true;
  return pathname === "/inventory/stock-prices" || pathname.startsWith("/inventory/stock-prices/");
}
