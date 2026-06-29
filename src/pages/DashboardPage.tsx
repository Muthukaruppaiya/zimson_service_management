import { Card } from "../components/ui/Card";
import { GlobalSearch } from "../components/dashboard/GlobalSearch";
import { DashboardQuickLinks } from "../components/dashboard/DashboardQuickLinks";
import { DashboardNotificationsPanel } from "../components/dashboard/DashboardNotificationsPanel";
import { DashboardWaitingBlinker, StatCardBlinkBadge } from "../components/dashboard/DashboardWaitingBlinker";
import { useAuth } from "../context/AuthContext";
import { useSrfJobs } from "../context/SrfJobsContext";
import {
  computeDashboardActionItems,
  dashboardActionSectionTitle,
  usesRoleActionQueue,
} from "../lib/dashboardActionItems";
import { useMemo } from "react";
import { Link } from "react-router-dom";

export function DashboardPage() {
  const { user } = useAuth();
  const { jobs } = useSrfJobs();
  const firstName = user?.displayName?.split(" ")[0] ?? "there";

  const actionItems = useMemo(() => computeDashboardActionItems(jobs, user), [jobs, user]);
  const sectionTitle = dashboardActionSectionTitle(user);
  const roleQueue = usesRoleActionQueue(user);

  return (
    <div className="space-y-5 md:space-y-6">
      <DashboardWaitingBlinker items={actionItems} />

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-rlx-ink-muted">
            {sectionTitle}
            {user?.role === "store_user" || user?.role === "store_manager" || user?.role === "store_accounts"
              ? " · your store"
              : user?.role === "super_admin"
                ? ""
                : user?.regionId
                  ? " · your region"
                  : ""}
          </p>
          {roleQueue ? (
            <p className="text-[10px] text-rlx-ink-muted">
              Counts match logistics screens — DC/TD documents and watch queues
            </p>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {actionItems.map((item) => {
            const isWaiting = item.count > 0;
            return (
              <Link key={item.id} to={item.to} className="block transition hover:opacity-95">
                <Card
                  title={item.label}
                  className={`relative border-l-4 ${item.accent} ${
                    isWaiting
                      ? item.urgent
                        ? "dashboard-stat-waiting-urgent"
                        : "dashboard-stat-waiting"
                      : ""
                  }`}
                >
                  <StatCardBlinkBadge count={item.count} urgent={item.urgent} />
                  <p className="text-3xl font-light tabular-nums text-rlx-green md:text-4xl">{item.count}</p>
                  {item.sublabel ? (
                    <p className="mt-1 text-xs font-medium text-amber-900/75">{item.sublabel}</p>
                  ) : null}
                  <p className="mt-2 text-xs leading-relaxed text-rlx-ink-muted">
                    {isWaiting ? <span className="font-semibold text-amber-800">Waiting · </span> : null}
                    {item.hint}
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="relative overflow-hidden rounded-xl border border-rlx-rule bg-white shadow-sm">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-rlx-gold/10 blur-2xl" />
          <div className="absolute -bottom-8 -left-6 h-32 w-32 rounded-full bg-rlx-green/8 blur-2xl" />
        </div>
        <div className="relative flex flex-col gap-4 px-4 py-5 md:flex-row md:items-center md:justify-between md:gap-6 md:px-6">
          <div className="min-w-0 md:max-w-md">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-rlx-gold-dark">
              Universal lookup
            </p>
            <h1 className="mt-1 font-display text-lg font-light tracking-wide text-rlx-ink md:text-xl">
              What are you looking for, <span className="font-semibold text-rlx-green">{firstName}</span>?
            </h1>
            <p className="mt-1 text-xs leading-relaxed text-rlx-ink-muted">
              SRF, Internal Transfer, DC/ODC, or Quick bill — search or scan.
            </p>
          </div>
          <div className="w-full min-w-0 md:max-w-xl md:flex-1">
            <GlobalSearch />
          </div>
        </div>
      </section>

      <DashboardQuickLinks />

      <DashboardNotificationsPanel />
    </div>
  );
}
