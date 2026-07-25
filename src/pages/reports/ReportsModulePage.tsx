import { Link } from "react-router-dom";
import { FormPageShell } from "../../components/layout/FormPageShell";
import { Card } from "../../components/ui/Card";

const reportLinks = [
  {
    to: "/reports/stock-in-hand",
    title: "Stock in hand report",
    description: "Current spare parts stock on hand by location.",
    section: "Inventory",
  },
  {
    to: "/reports/watch-not-returned",
    title: "Watch not returned report",
    description: "Outwarded watches pending return receive at store.",
    section: "Logistics",
  },
  {
    to: "/reports/aging",
    title: "Aging report",
    description: "SRFs grouped by elapsed days and aging buckets.",
    section: "Tracking & aging",
  },
  {
    to: "/reports/unassigned-watches",
    title: "Unassigned watches",
    description: "HO or in-store watches inwarded but not yet assigned to a technician.",
    section: "Tracking & aging",
  },
  {
    to: "/reports/technician-assign-watch",
    title: "Technician assign watch",
    description: "Watches currently assigned to technicians with aging since assignment.",
    section: "Tracking & aging",
  },
  {
    to: "/reports/technician-repaired-history",
    title: "Technician repaired history",
    description: "Completed repairs by technician with turnaround days.",
    section: "Tracking & aging",
  },
  {
    to: "/reports/pending",
    title: "Pending report",
    description: "Pending SRFs by stage and age in days.",
    section: "Workflow",
  },
  {
    to: "/reports/transfer",
    title: "Transfer report",
    description: "SRF movement references: transfer/DC/ODC trail.",
    section: "Logistics",
  },
] as const;

export function ReportsModulePage() {
  const sections = Array.from(new Set(reportLinks.map((item) => item.section)));

  return (
    <FormPageShell
      breadcrumb="Reports"
      title="Reports module"
      description="Operational service reports."
    >
      <div className="space-y-8">
        {sections.map((section) => (
          <div key={section}>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-rlx-gold-dark">{section}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {reportLinks
                .filter((item) => item.section === section)
                .map((item) => (
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
          </div>
        ))}
      </div>
    </FormPageShell>
  );
}

