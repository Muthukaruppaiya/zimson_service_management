import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { AppBootLoader } from "../ui/AppBootLoader";

/** Keep boot animation visible briefly — session restore is often faster than one Lottie loop. */
const BOOT_MIN_MS = 900;

export function RequireAuth() {
  const { user, authReady } = useAuth();
  const location = useLocation();
  const [bootMinElapsed, setBootMinElapsed] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setBootMinElapsed(true), BOOT_MIN_MS);
    return () => window.clearTimeout(t);
  }, []);

  if (!authReady || !bootMinElapsed) {
    return <AppBootLoader />;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
