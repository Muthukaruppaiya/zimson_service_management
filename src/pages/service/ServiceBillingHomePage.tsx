import { Link } from "react-router-dom";
import { ServiceBreadcrumb } from "../../components/service/ServiceBreadcrumb";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";

export function ServiceBillingHomePage() {
  return (
    <div>
      <ServiceBreadcrumb current="Billing" />
      <PageHeader
        title="Billing (Invoicing)"
        description="Select the required billing action. Invoice creation is handled in a separate standard page."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Create invoice" subtitle="Open standard invoice creation page">
          <div>
            <Link
              to="/service/billing/create"
              className="inline-flex rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700"
            >
              Open invoice creation
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
