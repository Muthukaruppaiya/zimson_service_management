import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { isInventoryStockPricesViewOnly } from "../../lib/inventoryAccess";

/** Redirects SC supervisors to Stock & prices — their only inventory screen. */
export function InventorySupervisorGuard({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (isInventoryStockPricesViewOnly(user)) {
    return <Navigate to="/inventory/stock-prices" replace />;
  }
  return <>{children}</>;
}
