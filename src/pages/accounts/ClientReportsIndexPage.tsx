import { Link } from "react-router-dom";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";

const REPORT_LINKS = [
  {
    to: "/accounts/reports/revenue",
    title: "Revenue report",
    description: "SRF billing (sheet 1) and quick bill revenue (sheet 2) with HSN, GST, and customer details.",
  },
  {
    to: "/accounts/reports/summary-sale",
    title: "Summary sale report",
    description: "One row per invoice with payment split — cash, card, UPI, and tax totals.",
  },
  {
    to: "/accounts/reports/hsn-purchase",
    title: "HSN purchase report",
    description: "GRN inward lines grouped by vendor, HSN code, and purchase value.",
  },
  {
    to: "/accounts/reports/sr-returned",
    title: "SR returned report",
    description: "Watches returned without billing or inter-HO no-repair returns.",
  },
] as const;

export function ClientReportsIndexPage() {
  return (
    <div>
      <PageHeader
        title="Client reports"
        description="Open a report, run it with your date filters, review charts and data, then download Excel."
        actions={
          <Link
            to="/accounts/invoice-history"
            className="rounded-xl border border-zimson-300 bg-white px-4 py-2 text-sm font-semibold text-zimson-900 hover:bg-zimson-50"
          >
            Invoice history
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        {REPORT_LINKS.map((report) => (
          <Card key={report.to} title={report.title}>
            <p className="text-sm text-stone-600">{report.description}</p>
            <Link
              to={report.to}
              className="mt-4 inline-block rounded-xl bg-zimson-800 px-4 py-2 text-sm font-semibold text-white hover:bg-zimson-900"
            >
              Open report →
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
