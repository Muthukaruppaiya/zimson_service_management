import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { isInventoryStockPricesViewOnly } from "../../lib/inventoryAccess";

/** Redirects view-only inventory roles (SC supervisor, store user) to Stock & prices. */
export function InventorySupervisorGuard({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (isInventoryStockPricesViewOnly(user)) {
    return <Navigate to="/inventory/stock-prices" replace />;
  }
  return <>{children}</>;
}
