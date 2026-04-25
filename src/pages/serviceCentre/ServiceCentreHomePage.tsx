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
  const techOk = can(user?.role, ["technician"]);

  return (
    <div>
      <PageHeader
        title="Service centre (HO / regional)"
        description="Store DC inward → supervisor assigns → technician completes repair → logistics outward (ODC) to originating or alternate store."
        actions={
          <Link
            to="/service"
            className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
          >
            Store / SRF
          </Link>
        }
      />

      <div className="grid gap-6 md:grid-cols-3">
        <Card title="1. Logistics — inward &amp; outward" subtitle="Service centre clerk">
          <p className="text-sm text-stone-600">
            <strong>Inward:</strong> enter the store DC. <strong>Outward:</strong> after repair, select ready watches,
            choose destination store per SRF if needed, and generate one ODC batch.
          </p>
          {inwardOk ? (
            <Link to="/service-centre/logistics" className={cardBtn}>
              Open logistics
            </Link>
          ) : (
            <p className={disabledNote}>Access restricted for this role.</p>
          )}
        </Card>

        <Card title="2. Supervisor" subtitle="Assign to technician by grade">
          <p className="text-sm text-stone-600">
            After inward, distribute each SRF to a technician based on skill level / grade for analysis.
          </p>
          {supervisorOk ? (
            <Link to="/service-centre/supervisor" className={cardBtn}>
              Open supervisor desk
            </Link>
          ) : (
            <p className={disabledNote}>Access restricted for this role.</p>
          )}
        </Card>

        <Card title="3. Technician" subtitle="Analysis → estimate OK → repair complete">
          <p className="text-sm text-stone-600">
            Confirm the estimate, complete repair — job moves to <strong>ready for outward</strong>; clerk creates ODC
            and may route to another store if the customer requested.
          </p>
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
