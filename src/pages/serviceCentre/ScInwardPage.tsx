import { Navigate } from "react-router-dom";

/** Legacy URL — combined logistics lives at `/service-centre/logistics`. */
export function ScInwardPage() {
  return <Navigate to="/service-centre/logistics?tab=inward" replace />;
}
