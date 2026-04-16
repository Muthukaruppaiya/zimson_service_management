import { Link } from "react-router-dom";
import { canAccessModule } from "../config/moduleAccess";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { useAuth } from "../context/AuthContext";

const stats = [
  { label: "Open service requests", value: "—", hint: "Lives in Service module" },
  { label: "Awaiting customer approval", value: "—", hint: "OTP / link flow" },
  { label: "At head office", value: "—", hint: "HO queue" },
  { label: "Ready for handover", value: "—", hint: "OTP handover" },
];

export function DashboardPage() {
  const { user } = useAuth();
  const canInventory = user ? canAccessModule(user.role, "inventory") : false;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`Signed in as ${user?.displayName ?? "user"}. Counts and charts will bind to your Node API and Postgres once the backend is in place.`}
        actions={
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Link
              to="/service"
              className="inline-flex items-center justify-center rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700"
            >
              Open service module
            </Link>
            {canInventory ? (
              <Link
                to="/inventory"
                className="inline-flex items-center justify-center rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
              >
                Inventory
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} title={s.label}>
            <p className="text-3xl font-bold tabular-nums text-zimson-800">{s.value}</p>
            <p className="mt-2 text-xs text-stone-500">{s.hint}</p>
          </Card>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card
          title="Regional coverage"
          subtitle="Super Admin sees all regions; Regional Admin is scoped to one branch."
        >
          <p className="text-sm text-stone-600">
            Use <Link className="font-medium text-zimson-800 underline" to="/regions">Regions &amp; stores</Link>{" "}
            to model the live hierarchy. This wireframe keeps sample data in React state only.
          </p>
        </Card>
        <Card title="Next build steps" subtitle="Aligned with your phased plan">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-stone-600">
            <li>Flesh out service request screens and status transitions.</li>
            <li>Add Node API + Postgres schema (regions, stores, SRs, estimates).</li>
            <li>Implement users, roles, and privilege assignment.</li>
            <li>
              Wire inventory hub is live — bind PR → PO → GRN, tax vs ₹10k without-bill, and regional spare
              prices to API.
            </li>
          </ol>
        </Card>
      </div>
    </div>
  );
}
