import { Link } from "react-router-dom";
import { FormPageShell } from "../../components/layout/FormPageShell";
import { Card } from "../../components/ui/Card";
import { useAuth } from "../../context/AuthContext";
import type { UserRole } from "../../types/user";

function can(role: UserRole | undefined, allowed: UserRole[]) {
  if (!role) return false;
  if (role === "super_admin" || role === "admin") return true;
  return allowed.includes(role);
}

const cardBtn =
  "mt-3 inline-flex border border-rlx-gold/50 bg-rlx-green px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-white transition hover:bg-rlx-green-deep";
const disabledNote = "mt-3 text-[11px] text-rlx-ink-muted";

export function ServiceCentreHomePage() {
  const { user } = useAuth();

  const inwardOk = can(user?.role, [
    "service_centre_clerk",
    "service_centre_clerk",
    "service_centre_clerk",
    "ho_manager",
    "admin",
    "admin",
    "super_admin",
  ]);
  const supervisorOk = can(user?.role, ["service_centre_supervisor"]);
  const onlineStoreOk = can(user?.role, ["service_centre_supervisor", "ho_manager"]);
  const technicianMasterOk = can(user?.role, ["service_centre_supervisor", "ho_manager", "ho_manager"]);
  const techOk = can(user?.role, ["technician"]);

  return (
    <FormPageShell
      breadcrumb="Service centre"
      title="Service centre (HO / regional)"
      actions={
        <div className="flex flex-wrap gap-1.5">
          <Link
            to="/service-centre/watch-inventory"
            className="inline-flex border border-rlx-rule bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-rlx-green transition hover:border-rlx-gold hover:bg-rlx-green-light"
          >
            Watch inventory
          </Link>
          <Link
            to="/service"
            className="inline-flex border border-rlx-rule bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-rlx-green transition hover:border-rlx-gold hover:bg-rlx-green-light"
          >
            Store / SRF
          </Link>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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
    </FormPageShell>
  );
}
