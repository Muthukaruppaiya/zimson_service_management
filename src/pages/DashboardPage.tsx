import { Card } from "../components/ui/Card";
import { GlobalSearch } from "../components/dashboard/GlobalSearch";
import { DashboardQuickLinks } from "../components/dashboard/DashboardQuickLinks";
import { useAuth } from "../context/AuthContext";

const stats = [
  {
    label: "Open service requests",
    value: "—",
    hint: "Lives in Service module",
    accent: "border-l-amber-400",
  },
  {
    label: "Awaiting customer approval",
    value: "—",
    hint: "OTP / link flow",
    accent: "border-l-violet-400",
  },
  {
    label: "At head office",
    value: "—",
    hint: "HO queue",
    accent: "border-l-sky-400",
  },
  {
    label: "Ready for handover",
    value: "—",
    hint: "OTP handover",
    accent: "border-l-emerald-400",
  },
] as const;

export function DashboardPage() {
  const { user } = useAuth();
  const firstName = user?.displayName?.split(" ")[0] ?? "there";

  return (
    <div className="space-y-6 md:space-y-7">
      <section className="relative overflow-hidden rounded-2xl border border-rlx-rule bg-white shadow-[0_4px_24px_rgba(16,37,112,0.08)]">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-rlx-gold/15 blur-2xl" />
          <div className="absolute -bottom-12 -left-8 h-48 w-48 rounded-full bg-rlx-green/10 blur-3xl" />
        </div>
        <div className="relative border-b border-rlx-rule/80 bg-gradient-to-br from-rlx-green-light/40 via-white to-rlx-gold-light/30 px-5 py-8 md:px-8 md:py-10">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-rlx-gold-dark">
              Universal lookup
            </p>
            <h1 className="mt-2 font-display text-2xl font-light tracking-wide text-rlx-ink md:text-[1.75rem]">
              What are you looking for, <span className="font-semibold text-rlx-green">{firstName}</span>?
            </h1>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-rlx-ink-muted">
              Search or scan any SRF, Internal Transfer ref, DC/ODC (inter-HO), or Quick bill number.
            </p>
            <div className="mx-auto mt-6 max-w-xl">
              <GlobalSearch autoFocus />
            </div>
          </div>
        </div>
      </section>

      <DashboardQuickLinks />

      <section>
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.22em] text-rlx-ink-muted">
          Today&apos;s overview
        </p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((s) => (
            <Card key={s.label} title={s.label} className={`border-l-4 ${s.accent}`}>
              <p className="text-3xl font-light tabular-nums text-rlx-green md:text-4xl">{s.value}</p>
              <p className="mt-2 text-xs leading-relaxed text-rlx-ink-muted">{s.hint}</p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
