import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { AppBootLoader } from "../ui/AppBootLoader";

export function RequireAuth() {
  const { user, authReady } = useAuth();
  const location = useLocation();

  if (!authReady) {
    return <AppBootLoader />;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
