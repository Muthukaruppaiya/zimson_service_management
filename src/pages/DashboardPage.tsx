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

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`Signed in as ${user?.displayName ?? "user"}.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} title={s.label}>
            <p className="text-3xl font-bold tabular-nums text-zimson-800">{s.value}</p>
            <p className="mt-2 text-xs text-stone-500">{s.hint}</p>
          </Card>
        ))}
      </div>

    </div>
  );
}
