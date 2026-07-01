import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AnalyticsBarChart, AnalyticsPieChart } from "../../components/accounts/analytics/AnalyticsCharts";
import { FilterField } from "../../components/ui/FilterField";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useRegions } from "../../context/RegionsContext";
import { formatCount, localDateInputValue } from "../../lib/analyticsApi";
import { DATE_PRESETS, dateRangeForPreset, type DatePresetKey } from "../../lib/analyticsDatePresets";
import {
  defaultServiceDashboardFromDate,
  fetchAccountsServiceDashboard,
  type AccountsServiceDashboardData,
  type ServiceOutcomeStat,
} from "../../lib/accountsServiceDashboardApi";

const OUTCOME_ACCENT: Record<ServiceOutcomeStat["key"], string> = {
  same_ho: "border-sky-200 bg-sky-50/70",
  other_ho: "border-violet-200 bg-violet-50/70",
  online_store: "border-amber-200 bg-amber-50/70",
  send_to_brand: "border-indigo-200 bg-indigo-50/70",
  cannot_repair: "border-rose-200 bg-rose-50/70",
};

function OutcomeCard({ stat }: { stat: ServiceOutcomeStat }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${OUTCOME_ACCENT[stat.key]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-600">{stat.label}</p>
      <p className="mt-2 text-3xl font-bold text-zimson-900">{formatCount(stat.closedCount)}</p>
      <p className="mt-1 text-xs text-stone-600">Closed in period</p>
      {stat.activeCount > 0 ? (
        <p className="mt-2 text-xs font-medium text-amber-800">{formatCount(stat.activeCount)} active now</p>
      ) : (
        <p className="mt-2 text-xs text-stone-400">No active cases</p>
      )}
    </div>
  );
}

export function AccountsServiceDashboardPage() {
  const { user } = useAuth();
  const { regions } = useRegions();
  const [from, setFrom] = useState(defaultServiceDashboardFromDate());
  const [to, setTo] = useState(localDateInputValue());
  const [regionId, setRegionId] = useState("");
  const [preset, setPreset] = useState<DatePresetKey>("90d");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AccountsServiceDashboardData | null>(null);

  const canPickRegion = user?.role === "super_admin" || user?.role === "admin";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const out = await fetchAccountsServiceDashboard({
        from,
        to,
        regionId: regionId || undefined,
      });
      setData(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load dashboard.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [from, to, regionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const closedTotal = useMemo(
    () => data?.outcomeStats.reduce((sum, s) => sum + s.closedCount, 0) ?? 0,
    [data],
  );

  function applyPreset(key: DatePresetKey) {
    setPreset(key);
    const range = dateRangeForPreset(key);
    setFrom(range.from);
    setTo(range.to);
  }

  return (
    <div>
      <PageHeader
        title="Service outcomes"
        description="Repair paths closed in the period — same HO, other HO, online store spares, brand, and cannot repair."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              to="/analytics/brand-credit-history"
              className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
            >
              Credit note history
            </Link>
            <Link
              to="/accounts/brand-credit-notes"
              className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
            >
              Pending approvals
              {data && data.pendingCreditNotes > 0 ? (
                <span className="ml-2 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">
                  {data.pendingCreditNotes}
                </span>
              ) : null}
            </Link>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <FilterField label="From" htmlFor="svc-dash-from">
          <input
            id="svc-dash-from"
            type="date"
            className="w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPreset("90d");
            }}
          />
        </FilterField>
        <FilterField label="To" htmlFor="svc-dash-to">
          <input
            id="svc-dash-to"
            type="date"
            className="w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPreset("90d");
            }}
          />
        </FilterField>
        {canPickRegion ? (
          <FilterField label="Region" htmlFor="svc-dash-region">
            <select
              id="svc-dash-region"
              className="w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
              value={regionId}
              onChange={(e) => setRegionId(e.target.value)}
            >
              <option value="">All regions</option>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </FilterField>
        ) : null}
        <div className="flex flex-wrap gap-1.5 pb-0.5">
          {DATE_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => applyPreset(p.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                preset === p.key
                  ? "bg-zimson-800 text-white"
                  : "border border-zimson-200 bg-white text-zimson-800 hover:bg-zimson-50"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
      ) : null}

      {loading ? (
        <p className="text-sm text-stone-600">Loading…</p>
      ) : data ? (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div className="rounded-2xl border border-zimson-200 bg-white p-4 shadow-sm xl:col-span-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Total closed</p>
              <p className="mt-1 text-2xl font-bold text-zimson-900">{formatCount(closedTotal)}</p>
              <p className="mt-1 text-xs text-stone-500">
                {data.filters.from} → {data.filters.to}
              </p>
            </div>
            {data.outcomeStats.map((stat) => (
              <OutcomeCard key={stat.key} stat={stat} />
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <AnalyticsPieChart
              title="Closed outcomes"
              subtitle="How SRFs were resolved in the selected period"
              data={data.outcomeClosedChart}
            />
            <AnalyticsBarChart
              title="Closed vs active"
              subtitle="Closed in period (bars) — compare with active pipeline"
              data={data.outcomeStats.map((s) => ({ name: s.label, value: s.closedCount }))}
              valueFormatter={formatCount}
            />
          </div>

        </div>
      ) : null}
    </div>
  );
}
