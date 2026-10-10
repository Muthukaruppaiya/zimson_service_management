import { Link } from "react-router-dom";
import { FormPageShell } from "../../components/layout/FormPageShell";
import { Card } from "../../components/ui/Card";

const quickLinks = [
  { to: "/service/quick-bill", title: "Quick bill" },
  { to: "/service/srf", title: "SRF booking" },
  { to: "/service/quick-bill-history", title: "Quick bill history" },
  { to: "/service/srf-register", title: "Booking list" },
  { to: "/service/srf-master", title: "All SRF records" },
  { to: "/service/reports", title: "Reports" },
] as const;

export function ServiceModulePage() {
  return (
    <FormPageShell
      breadcrumb="Service"
      title="Service module"
      description="Quick billing, SRF booking, and store service workflows."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {quickLinks.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rlx-green"
          >
            <Card title={item.title} className="h-full transition hover:border-rlx-gold hover:shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-rlx-green">Open →</p>
            </Card>
          </Link>
        ))}
      </div>
    </FormPageShell>
  );
}
