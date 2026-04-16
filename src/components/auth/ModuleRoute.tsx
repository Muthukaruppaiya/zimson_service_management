import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { canAccessModule } from "../../config/moduleAccess";
import { useAuth } from "../../context/AuthContext";
import type { ModuleKey } from "../../types/user";

export function ModuleRoute({ module, children }: { module: ModuleKey; children: ReactNode }) {
  const { user } = useAuth();

  if (!user || !canAccessModule(user.role, module)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
