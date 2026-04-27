import { Card } from "../components/ui/Card";
import { GlobalSearch } from "../components/dashboard/GlobalSearch";
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
    <div className="space-y-8">
      <section className="relative rounded-3xl border border-zimson-200/70 bg-gradient-to-br from-white via-zimson-50 to-amber-50/40 px-6 py-10 shadow-sm">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
          <div className="absolute -top-16 -right-10 h-56 w-56 rounded-full bg-gradient-to-br from-zimson-300/40 to-amber-200/40 blur-3xl" />
          <div className="absolute -bottom-20 -left-12 h-56 w-56 rounded-full bg-gradient-to-tr from-amber-200/40 to-zimson-200/40 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-2xl text-center">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.2em] text-zimson-700">
            Universal lookup
          </p>
          <h1 className="mb-1 text-2xl font-bold tracking-tight text-stone-900 md:text-3xl">
            What are you looking for, {user?.displayName?.split(" ")[0] ?? "there"}?
          </h1>
          <p className="mb-6 text-sm text-stone-600">
            Search or scan any SRF, DC, ODC, or Quick bill number to jump straight to it.
          </p>
          <GlobalSearch />
        </div>
      </section>

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
