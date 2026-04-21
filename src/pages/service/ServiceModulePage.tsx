import { Link } from "react-router-dom";
import { canAccessModule } from "../../config/moduleAccess";
import { useAuth } from "../../context/AuthContext";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";

const srStatuses = [
  "Draft / intake",
  "Estimate sent",
  "Customer approved",
  "Sent to HO",
  "HO — assigned technician",
  "Re-estimate pending",
  "Repair in progress",
  "Completed at HO",
  "At store — handover OTP",
  "Billed / payment",
  "Closed",
] as const;

const flowBlocks = [
  {
    title: "Store intake",
    items: [
      "Customer visit — choose Quick bill vs full service request",
      "B2B / B2C capture, watch details, photos",
      "Initial estimate + OTP-protected approval link (email/SMS)",
    ],
  },
  {
    title: "Head office",
    items: [
      "Supervisor receives watch, validates status",
      "Assign technician by grade / complexity",
      "If not repairable at HO — transfer to brand or another region",
    ],
  },
  {
    title: "Repair & spares",
    items: [
      "Technician confirms or re-estimates (second customer approval if needed)",
      "Record spares used (inventory module hooks in later)",
      "Mark complete → SC outward (ODC) to store",
    ],
  },
  {
    title: "Handover & billing",
    items: [
      "OTP verification when customer collects watch",
      "Invoice and payment at store (regional records as needed)",
      "Close service request with audit trail",
    ],
  },
];

const headerPrimary =
  "inline-flex items-center justify-center rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700";
const headerSecondary =
  "inline-flex items-center justify-center rounded-xl border border-zimson-300 bg-zimson-50 px-4 py-2.5 text-sm font-semibold text-zimson-900 transition hover:bg-zimson-100";
const headerOutline =
  "inline-flex items-center justify-center rounded-xl border border-zimson-500/80 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 transition hover:bg-zimson-50";
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
        description="Store counter flows: quick bill, SRF booking, and billing (customer lookup + lines) in one service area — no separate invoicing module."
        actions={
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Link to="/service/quick-bill" className={headerPrimary}>
              Quick bill
            </Link>
            <Link to="/service/srf" className={headerSecondary}>
              New SRF
            </Link>
            <Link to="/service/billing" className={headerOutline}>
              Billing
            </Link>
            <Link to="/service/store-dispatch" className={headerSecondary}>
              Send to SC
            </Link>
          </div>
        }
      />

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
        title="Billing"
        subtitle="Name → mobile lookup · line items · same counter context as quick bill / SRF"
        className="mb-8"
      >
        <p className="text-sm text-stone-600">
          Enter customer name, then mobile. If a match exists in the directory, data is loaded; otherwise
          you are redirected to <strong>customer registration</strong>, then back to complete the bill.
        </p>
        <Link
          to="/service/billing"
          className={`${cardPrimary} mt-4 inline-flex max-w-xs`}
        >
          Open billing
        </Link>
        <p className="mt-3 text-xs text-stone-500">
          Try seed: “Rajesh Kumar” + <span className="font-mono">9876543210</span> — or any new number to test
          registration.
        </p>
      </Card>

      <Card
        title="Send watches to service centre (DC)"
        subtitle="End-of-day store batch → HO / regional SC"
        className="mb-8"
      >
        <p className="text-sm text-stone-600">
          Select SRFs that are still at the store and generate one <strong>delivery challan (DC)</strong>.
          Service centre users inward the next day using the DC number, then supervisor assigns technicians.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link to="/service/store-dispatch" className={cardPrimary}>
            Open store dispatch
          </Link>
          {canSc ? (
            <Link to="/service-centre" className={cardSecondary}>
              Service centre (HO) home
            </Link>
          ) : null}
        </div>
        <p className="mt-3 text-xs text-stone-500">
          Demo SRFs at Store 1: sign in as west.store1@zimson.demo — or create new SRFs first.
        </p>
      </Card>

      <Card
        title="Suggested status model"
        subtitle="Map these to service_requests.status or status_history."
        className="mb-8"
      >
        <div className="flex flex-wrap gap-2">
          {srStatuses.map((st, i) => (
            <span
              key={st}
              className="inline-flex items-center gap-2 rounded-full border border-zimson-200 bg-zimson-50 px-3 py-1 text-xs font-medium text-stone-800"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zimson-500 text-[10px] font-bold text-white">
                {i + 1}
              </span>
              {st}
            </span>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {flowBlocks.map((block) => (
          <Card key={block.title} title={block.title}>
            <ul className="space-y-2 text-sm text-stone-600">
              {block.items.map((line) => (
                <li key={line} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-zimson-500" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      <Card title="Coming next" subtitle="After these flows stabilize" className="mt-8">
        <ul className="list-disc space-y-1 pl-5 text-sm text-stone-600">
          <li>SR list with filters (store, status)</li>
          <li>Link bills to open Quick bills / SRFs</li>
          <li>Service centre supervisor: assign work to technicians</li>
          <li>Finance & purchase (later phase)</li>
        </ul>
      </Card>
    </div>
  );
}
