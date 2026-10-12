import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { canBulkImport } from "../../lib/bulkImportAccess";

export function BulkImportGuard({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!canBulkImport(user?.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
