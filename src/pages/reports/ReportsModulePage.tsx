import { Link } from "react-router-dom";
import { FormPageShell } from "../../components/layout/FormPageShell";
import { Card } from "../../components/ui/Card";

const reportLinks = [
  {
    to: "/reports/stock-in-hand",
    title: "Stock in hand report",
    description: "Current spare parts stock on hand by location.",
  },
  {
    to: "/reports/watch-not-returned",
    title: "Watch not returned report",
    description: "Outwarded watches pending return receive at store.",
  },
  {
    to: "/reports/aging",
    title: "Aging report",
    description: "SRFs grouped by elapsed days and aging buckets.",
  },
  {
    to: "/reports/pending",
    title: "Pending report",
    description: "Pending SRFs by stage and age in days.",
  },
  {
    to: "/reports/transfer",
    title: "Transfer report",
    description: "SRF movement references: transfer/DC/ODC trail.",
  },
] as const;

export function ReportsModulePage() {
  return (
    <FormPageShell
      breadcrumb="Reports"
      title="Reports module"
      description="Operational service reports."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {reportLinks.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rlx-green"
          >
            <Card title={item.title} className="h-full transition hover:border-rlx-gold hover:shadow-sm">
              <p className="text-[11px] leading-relaxed text-rlx-ink-muted">{item.description}</p>
              <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-rlx-green">Open →</p>
            </Card>
          </Link>
        ))}
      </div>
    </FormPageShell>
  );
}

