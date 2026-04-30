import { Link } from "react-router-dom";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import type { UserRole } from "../../types/user";

function can(role: UserRole | undefined, allowed: UserRole[]) {
  if (!role) return false;
  if (role === "super_admin" || role === "regional_admin") return true;
  return allowed.includes(role);
}

const cardBtn =
  "mt-4 inline-flex rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700";
const disabledNote = "mt-4 text-xs text-stone-500";

export function ServiceCentreHomePage() {
  const { user } = useAuth();

  const inwardOk = can(user?.role, [
    "service_centre_clerk",
    "service_centre_inward",
    "service_centre_outward",
    "ho_manager",
    "ho_admin",
    "regional_admin",
    "super_admin",
  ]);
  const supervisorOk = can(user?.role, ["service_centre_supervisor"]);
  const onlineStoreOk = can(user?.role, ["service_centre_supervisor", "ho_supervisor"]);
  const technicianMasterOk = can(user?.role, ["service_centre_supervisor", "ho_supervisor", "ho_manager"]);
  const techOk = can(user?.role, ["technician"]);

  return (
    <div>
      <PageHeader
        title="Service centre (HO / regional)"
        description=""
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              to="/service-centre/watch-inventory"
              className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
            >
              Watch inventory
            </Link>
            <Link
              to="/service"
              className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
            >
              Store / SRF
            </Link>
          </div>
        }
      />

      <div className="grid gap-6 md:grid-cols-5">
        <Card title="Logistics">
          {inwardOk ? (
            <Link to="/service-centre/logistics" className={cardBtn}>
              Open logistics
            </Link>
          ) : (
            <p className={disabledNote}>Access restricted for this role.</p>
          )}
        </Card>

        <Card title="Supervisor">
          {supervisorOk ? (
            <Link to="/service-centre/supervisor" className={cardBtn}>
              Open supervisor desk
            </Link>
          ) : (
            <p className={disabledNote}>Access restricted for this role.</p>
          )}
        </Card>

        <Card title="Online store">
          {onlineStoreOk ? (
            <Link to="/service-centre/online-store" className={cardBtn}>
              Open online orders
            </Link>
          ) : (
            <p className={disabledNote}>Access restricted for this role.</p>
          )}
        </Card>

        <Card title="Technician master">
          {technicianMasterOk ? (
            <Link to="/service-centre/technicians-master" className={cardBtn}>
              Open technician master
            </Link>
          ) : (
            <p className={disabledNote}>Access restricted for this role.</p>
          )}
        </Card>

        <Card title="Technician">
          {techOk ? (
            <Link to="/service-centre/technician" className={cardBtn}>
              Open technician queue
            </Link>
          ) : (
            <p className={disabledNote}>Access restricted for this role.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
