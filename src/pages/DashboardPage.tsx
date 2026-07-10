import { DashboardQuickLinks } from "../components/dashboard/DashboardQuickLinks";
import { DashboardNotificationsPanel } from "../components/dashboard/DashboardNotificationsPanel";
import { DashboardRecentLookups } from "../components/dashboard/DashboardRecentLookups";
import { DashboardHero } from "../components/dashboard/DashboardHero";
import { DashboardActionCard } from "../components/dashboard/DashboardActionCard";
import { DashboardQuickFind } from "../components/dashboard/DashboardQuickFind";
import { useAuth } from "../context/AuthContext";
import { useSrfJobs } from "../context/SrfJobsContext";
import { computeDashboardActionItems } from "../lib/dashboardActionItems";
import { useMemo } from "react";

export function DashboardPage() {
  const { user } = useAuth();
  const { jobs } = useSrfJobs();

  const actionItems = useMemo(() => computeDashboardActionItems(jobs, user), [jobs, user]);

  return (
    <div className="chrono-dashboard cs-dashboard-container -m-2 md:-m-4">
      <DashboardHero user={user} />

      <section className="cs-kpi-grid grid">
        {actionItems.map((item) => (
          <DashboardActionCard key={item.id} item={item} />
        ))}
      </section>

      <DashboardQuickFind />

      <DashboardQuickLinks />

      <div className="cs-footer-grid grid">
        <DashboardNotificationsPanel />
        <DashboardRecentLookups />
      </div>
    </div>
  );
}
