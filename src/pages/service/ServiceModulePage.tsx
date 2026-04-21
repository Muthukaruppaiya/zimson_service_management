import { Link } from "react-router-dom";
import { canAccessModule } from "../../config/moduleAccess";
import { useAuth } from "../../context/AuthContext";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { ServiceNavBar } from "../../components/service/ServiceNavBar";

const headerPrimary =
  "inline-flex items-center justify-center rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700";
const headerSecondary =
  "inline-flex items-center justify-center rounded-xl border border-zimson-300 bg-zimson-50 px-4 py-2.5 text-sm font-semibold text-zimson-900 transition hover:bg-zimson-100";
const cardPrimary =
  "inline-flex w-full items-center justify-center rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700 sm:w-auto";
const cardSecondary =
  "inline-flex w-full items-center justify-center rounded-xl border border-zimson-300 bg-zimson-50 py-2.5 text-sm font-semibold text-zimson-900 transition hover:bg-zimson-100";

export function ServiceModulePage() {
  const { user } = useAuth();
  const canSc = user ? canAccessModule(user, "service_centre") : false;

  return (
    <div>
      <PageHeader
        title="Service module"
        description="Manage SRF booking, store dispatch, store billing, and service centre operations."
        actions={
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Link to="/service/quick-bill" className={headerPrimary}>
              Quick bill
            </Link>
            <Link to="/service/srf" className={headerSecondary}>
              New SRF
            </Link>
            <Link to="/service/store-dispatch" className={headerSecondary}>
              Send to SC
            </Link>
            <Link to="/service/store-billing" className={headerSecondary}>
              Store billing
            </Link>
          </div>
        }
      />
      <ServiceNavBar />

      <div className="mb-8 grid gap-4 lg:grid-cols-3">
        <Card title="Quick bill" subtitle="Fast path at counter">
          <p className="text-sm text-stone-600">
            Customer, watch summary, technician, line items, payment — closes without HO. For store user /
            billing roles.
          </p>
          <Link to="/service/quick-bill" className={`${cardSecondary} mt-4`}>
            Open quick bill form
          </Link>
        </Card>
        <Card title="SRF booking" subtitle="Service request form" className="lg:col-span-2">
          <p className="text-sm text-stone-600">
            Multi-step intake: customer (B2B/B2C), watch, indicative estimate, then create SRF for approval
            link and HO workflow.
          </p>
          <Link to="/service/srf" className={`${cardPrimary} mt-4`}>
            Start SRF booking
          </Link>
        </Card>
      </div>

      <Card
        title="Send watches to service centre (DC)"
        subtitle="End-of-day store batch → HO / regional SC"
        className="mb-8"
      >
        <p className="text-sm text-stone-600">
          Select SRFs at store and generate a delivery challan for service centre inward.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link to="/service/store-dispatch" className={cardPrimary}>
            Open store dispatch
          </Link>
          <Link to="/service/store-billing" className={cardSecondary}>
            Open store billing
          </Link>
          {canSc ? (
            <Link to="/service-centre" className={cardSecondary}>
              Service centre (HO) home
            </Link>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
