import { useEffect, useMemo, useState } from "react";
import {
  AnalyticsBarChart,
  AnalyticsDualLineChart,
  AnalyticsLineChart,
  AnalyticsPieChart,
} from "../../components/accounts/analytics/AnalyticsCharts";
import { AnalyticsDataTable, downloadChartCsv } from "../../components/accounts/analytics/AnalyticsDataTable";
import { FilterField } from "../../components/ui/FilterField";
import { useAuth } from "../../context/AuthContext";
import { useRegions } from "../../context/RegionsContext";
import {
  defaultAnalyticsFromDate,
  fetchAnalyticsDashboard,
  formatCount,
  formatInr,
  formatPct,
  localDateInputValue,
  pctChange,
  type AnalyticsDashboardData,
  type AnalyticsFiltersQuery,
} from "../../lib/analyticsApi";
import { DATE_PRESETS, dateRangeForPreset, type DatePresetKey } from "../../lib/analyticsDatePresets";
import {
  analyticsTopicsForRole,
  topicMeta,
  type AnalyticsViewKey,
} from "../../lib/analyticsTopics";

function KpiCard({
  label,
  value,
  hint,
  accent,
  deltaPct,
  compareLabel,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: "blue" | "green" | "amber" | "slate";
  deltaPct?: number | null;
  compareLabel?: string;
}) {
  const border =
    accent === "green"
      ? "border-emerald-200 bg-emerald-50/60"
      : accent === "amber"
        ? "border-amber-200 bg-amber-50/60"
        : accent === "slate"
          ? "border-stone-200 bg-stone-50/80"
          : "border-sky-200 bg-sky-50/60";
  const deltaUp = deltaPct != null && deltaPct > 0;
  const deltaDown = deltaPct != null && deltaPct < 0;
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${border}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-zimson-900">{value}</p>
      {deltaPct != null ? (
        <p className={`mt-1 text-xs font-medium ${deltaUp ? "text-emerald-700" : deltaDown ? "text-red-600" : "text-stone-500"}`}>
          {deltaPct > 0 ? "▲" : deltaPct < 0 ? "▼" : "—"} {Math.abs(deltaPct).toFixed(1)}% {compareLabel ?? "vs prior period"}
        </p>
      ) : null}
      {hint ? <p className="mt-1 text-xs text-stone-500">{hint}</p> : null}
    </div>
  );
}

function ExportBtn({ label, filename, rows }: { label: string; filename: string; rows: { name: string; value: number }[] }) {
  return (
    <button
      type="button"
      onClick={() => downloadChartCsv(filename, rows)}
      className="rounded-lg border border-zimson-200 bg-white px-3 py-1.5 text-xs font-medium text-zimson-800 hover:bg-stone-50"
    >
      {label}
    </button>
  );
}

function StoreDetailTable({ rows }: { rows: AnalyticsDashboardData["storeDetail"] }) {
  if (rows.length === 0) return null;
  const total = rows.reduce((s, r) => s + r.totalInr, 0);
  return (
    <div className="rounded-2xl border border-zimson-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-zimson-900">Store breakdown (SRF + quick bill)</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
              <th className="py-2 pr-3">Store</th>
              <th className="py-2 pr-3 text-right">SRF</th>
              <th className="py-2 pr-3 text-right">Quick bill</th>
              <th className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-b border-stone-100">
                <td className="py-2.5 pr-3 font-medium">{r.name}</td>
                <td className="py-2.5 pr-3 text-right tabular-nums">{formatInr(r.srfInr)}</td>
                <td className="py-2.5 pr-3 text-right tabular-nums">{formatInr(r.quickBillInr)}</td>
                <td className="py-2.5 text-right tabular-nums font-medium">{formatInr(r.totalInr)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold text-zimson-900">
              <td className="pt-3">Total</td>
              <td className="pt-3 text-right">{formatInr(rows.reduce((s, r) => s + r.srfInr, 0))}</td>
              <td className="pt-3 text-right">{formatInr(rows.reduce((s, r) => s + r.quickBillInr, 0))}</td>
              <td className="pt-3 text-right">{formatInr(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function TopicPanels({ data, view }: { data: AnalyticsDashboardData; view: AnalyticsViewKey }) {
  const periodHint = `${data.filters.from} → ${data.filters.to}`;
  const cmp = data.compare.label;

  if (view === "sales") {
    return (
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Total sales" value={formatInr(data.kpis.totalSalesInr)} accent="blue" deltaPct={pctChange(data.kpis.totalSalesInr, data.compare.totalSalesInr)} compareLabel={cmp} />
          <KpiCard label="SRF billing" value={formatInr(data.kpis.srfSalesInr)} accent="blue" deltaPct={pctChange(data.kpis.srfSalesInr, data.compare.srfSalesInr)} compareLabel={cmp} />
          <KpiCard label="Quick bill" value={formatInr(data.kpis.quickBillSalesInr)} hint={`${formatCount(data.kpis.quickBillCount)} bills · avg ${formatInr(data.derived.avgQuickBillInr)}`} accent="blue" deltaPct={pctChange(data.kpis.quickBillSalesInr, data.compare.quickBillSalesInr)} compareLabel={cmp} />
          <KpiCard label="B2B share" value={formatPct(data.derived.b2bSharePct)} hint={`B2B ${formatInr(data.kpis.b2bSalesInr)}`} accent="green" />
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <AnalyticsLineChart title="Daily sales trend" subtitle="SRF invoices + quick bills" data={data.salesTrend} />
          <AnalyticsBarChart title="Monthly sales" data={data.salesByMonth} subtitle="Aggregated by month" horizontal={false} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <AnalyticsPieChart title="SRF vs Quick bill" data={data.srfVsQuickBill} />
          {data.salesByRegion.length > 0 ? (
            <AnalyticsBarChart title="Sales by region" data={data.salesByRegion} />
          ) : (
            <AnalyticsBarChart title="Sales by store" data={data.salesByStore} />
          )}
        </div>
        <div className="flex justify-end">
          <ExportBtn label="Export store CSV" filename="sales_by_store.csv" rows={data.salesByStore} />
        </div>
        <AnalyticsDataTable title="Sales by store" rows={data.salesByStore} valueLabel="Revenue" />
      </div>
    );
  }

  if (view === "srf") {
    return (
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <KpiCard label="SRF billing" value={formatInr(data.kpis.srfSalesInr)} hint={`Avg ticket ${formatInr(data.derived.avgSrfTicketInr)}`} accent="blue" deltaPct={pctChange(data.kpis.srfSalesInr, data.compare.srfSalesInr)} compareLabel={cmp} />
          <KpiCard label="Opened" value={formatCount(data.kpis.srfOpened)} accent="slate" deltaPct={pctChange(data.kpis.srfOpened, data.compare.srfOpened)} compareLabel={cmp} />
          <KpiCard label="Closed" value={formatCount(data.kpis.srfClosed)} accent="slate" deltaPct={pctChange(data.kpis.srfClosed, data.compare.srfClosed)} compareLabel={cmp} />
          <KpiCard label="Close rate" value={formatPct(data.derived.srfCloseRatePct)} hint="Closed ÷ opened in period" accent="green" />
          <KpiCard label="Active / waiting" value={formatCount(data.kpis.srfActive)} hint="Open pipeline now" accent="slate" />
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <AnalyticsLineChart title="SRF billing trend" data={data.srfSalesTrend} />
          <AnalyticsDualLineChart title="Opened vs closed (monthly)" seriesA={data.srfOpenedByMonth} seriesB={data.srfClosedByMonth} labelA="Opened" labelB="Closed" />
        </div>
        <AnalyticsBarChart title="Pipeline stages" data={data.srfPipelineBuckets} subtitle="Grouped journey — store to closed" valueFormatter={formatCount} />
        <AnalyticsBarChart title="All statuses (detail)" data={data.srfStatusBreakdown} valueFormatter={formatCount} tall={true} />
        <AnalyticsBarChart title="Bookings by brand" data={data.srfByBrand} subtitle="Opened in period" valueFormatter={formatCount} />
      </div>
    );
  }

  if (view === "quick_bill") {
    return (
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Revenue" value={formatInr(data.kpis.quickBillSalesInr)} accent="blue" deltaPct={pctChange(data.kpis.quickBillSalesInr, data.compare.quickBillSalesInr)} compareLabel={cmp} />
          <KpiCard label="Bill count" value={formatCount(data.kpis.quickBillCount)} accent="slate" />
          <KpiCard label="Avg bill value" value={formatInr(data.derived.avgQuickBillInr)} accent="green" />
          <KpiCard label="Period" value={periodHint} accent="slate" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <AnalyticsLineChart title="Daily quick bill trend" data={data.quickBillTrend} />
          <AnalyticsPieChart title="Payment modes" data={data.paymentModes} />
        </div>
        <AnalyticsBarChart title="Revenue by brand" data={data.quickBillByBrand} />
        <AnalyticsDataTable title="Payment mode breakdown" rows={data.paymentModes} valueLabel="Amount" />
      </div>
    );
  }

  if (view === "b2b_b2c") {
    return (
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="B2B sales" value={formatInr(data.kpis.b2bSalesInr)} accent="green" />
          <KpiCard label="B2C sales" value={formatInr(data.kpis.b2cSalesInr)} accent="green" />
          <KpiCard label="B2B share" value={formatPct(data.derived.b2bSharePct)} accent="blue" />
          <KpiCard label="Total" value={formatInr(data.kpis.b2bSalesInr + data.kpis.b2cSalesInr)} accent="blue" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <AnalyticsPieChart title="B2B vs B2C" data={data.b2bVsB2c} />
          <AnalyticsBarChart title="By channel" data={data.b2bB2cByChannel} horizontal={false} />
        </div>
        <AnalyticsDataTable title="Channel split" rows={data.b2bB2cByChannel} valueLabel="Revenue" />
      </div>
    );
  }

  if (view === "purchase") {
    return (
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard label="GRN purchases" value={formatInr(data.kpis.purchaseInr)} accent="amber" deltaPct={pctChange(data.kpis.purchaseInr, data.compare.purchaseInr)} compareLabel={cmp} />
          <KpiCard label="Vendors" value={formatCount(data.purchaseByVendor.length)} accent="slate" />
          <KpiCard label="Period" value={periodHint} accent="slate" />
        </div>
        <AnalyticsBarChart title="Monthly purchase trend" data={data.purchaseByMonth} horizontal={false} />
        <div className="grid gap-4 lg:grid-cols-2">
          <AnalyticsBarChart title="By vendor" data={data.purchaseByVendor} />
          <AnalyticsBarChart title="By HSN" data={data.purchaseByHsn} />
        </div>
        <AnalyticsDataTable title="Top vendors" rows={data.purchaseByVendor} valueLabel="GRN value" />
      </div>
    );
  }

  if (view === "margin") {
    const marginSeriesA = data.salesByMonth.map((x) => ({ name: x.name, value: x.value }));
    const marginSeriesB = data.purchaseByMonth;
    return (
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Total sales" value={formatInr(data.kpis.totalSalesInr)} accent="blue" deltaPct={pctChange(data.kpis.totalSalesInr, data.compare.totalSalesInr)} compareLabel={cmp} />
          <KpiCard label="Purchases (GRN)" value={formatInr(data.kpis.purchaseInr)} accent="amber" deltaPct={pctChange(data.kpis.purchaseInr, data.compare.purchaseInr)} compareLabel={cmp} />
          <KpiCard label="Gross margin" value={formatInr(data.derived.grossMarginInr)} accent="green" />
          <KpiCard label="Margin %" value={formatPct(data.derived.grossMarginPct)} hint="(Sales − purchase) ÷ sales" accent="green" />
        </div>
        <AnalyticsDualLineChart title="Sales vs purchase (monthly)" seriesA={marginSeriesA} seriesB={marginSeriesB} labelA="Sales" labelB="Purchase" />
        <AnalyticsPieChart title="SRF vs Quick bill sales" data={data.srfVsQuickBill} />
      </div>
    );
  }

  if (view === "store") {
    const topStore = data.salesByStore[0];
    return (
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard label="Total store sales" value={formatInr(data.kpis.totalSalesInr)} accent="blue" deltaPct={pctChange(data.kpis.totalSalesInr, data.compare.totalSalesInr)} compareLabel={cmp} />
          <KpiCard label="Top store" value={topStore?.name ?? "—"} hint={topStore ? formatInr(topStore.value) : undefined} accent="green" />
          <KpiCard label="Stores ranked" value={formatCount(data.salesByStore.length)} accent="slate" />
        </div>
        <AnalyticsBarChart title="Sales by store" data={data.salesByStore} tall={true} />
        <StoreDetailTable rows={data.storeDetail} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <KpiCard label="Period" value={periodHint} accent="slate" />
      <AnalyticsBarChart title="Sales by region" data={data.salesByRegion} />
      <AnalyticsDataTable title="Regional revenue" rows={data.salesByRegion} valueLabel="Revenue" />
    </div>
  );
}

export function AnalyticsDashboardPage() {
  const { user } = useAuth();
  const { regions } = useRegions();
  const topics = useMemo(() => analyticsTopicsForRole(user?.role), [user?.role]);
  const [view, setView] = useState<AnalyticsViewKey>("sales");
  const [filters, setFilters] = useState<AnalyticsFiltersQuery>({
    from: defaultAnalyticsFromDate(),
    to: localDateInputValue(),
    view: "sales",
  });
  const [data, setData] = useState<AnalyticsDashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeTopic = topicMeta(view);

  async function loadDashboard(nextView: AnalyticsViewKey = view) {
    const payload = { ...filters, view: nextView };
    setLoading(true);
    setError(null);
    try {
      setData(await fetchAnalyticsDashboard(payload));
      setFilters(payload);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Could not load analytics.");
    } finally {
      setLoading(false);
    }
  }

  function applyPreset(key: DatePresetKey) {
    const range = dateRangeForPreset(key);
    setFilters((f) => ({ ...f, ...range }));
  }

  useEffect(() => {
    if (!topics.some((t) => t.key === view)) {
      const first = topics[0]?.key ?? "sales";
      setView(first);
      void loadDashboard(first);
      return;
    }
    void loadDashboard(view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const regionLabel =
    filters.regionId && regions.find((r) => r.id === filters.regionId)?.name
      ? regions.find((r) => r.id === filters.regionId)!.name
      : user?.role === "super_admin"
        ? "All regions"
        : "Your region";

  return (
    <div className="space-y-6 pb-10">
      <div
        className="overflow-hidden rounded-3xl border border-zimson-200 shadow-md"
        style={{ background: "linear-gradient(135deg, #102570 0%, #1B3A8F 55%, #2d5a87 100%)" }}
      >
        <div className="px-6 py-8 text-white sm:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">Business intelligence</p>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{activeTopic.label}</h1>
          <p className="mt-2 max-w-3xl text-sm text-white/80">
            {activeTopic.description} — scoped to {regionLabel}.
            {data ? ` ${data.compare.label} shown on KPI cards.` : ""}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-zimson-200 bg-white p-4 shadow-sm">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-500">Choose report</p>
        <div className="flex flex-wrap gap-2">
          {topics.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setView(t.key);
                void loadDashboard(t.key);
              }}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                view === t.key
                  ? "bg-zimson-800 text-white shadow-sm"
                  : "border border-zimson-200 bg-stone-50 text-stone-700 hover:border-zimson-400"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-zimson-200 bg-white p-4 shadow-sm">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Quick period</p>
        <div className="mb-4 flex flex-wrap gap-2">
          {DATE_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => applyPreset(p.key)}
              className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-medium text-stone-700 hover:border-zimson-400"
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <FilterField label="From date">
            <input
              type="date"
              className="w-full rounded-xl border border-zimson-300 px-3 py-2 text-sm"
              value={filters.from}
              onChange={(e) => setFilters({ ...filters, from: e.target.value })}
            />
          </FilterField>
          <FilterField label="To date">
            <input
              type="date"
              className="w-full rounded-xl border border-zimson-300 px-3 py-2 text-sm"
              value={filters.to}
              onChange={(e) => setFilters({ ...filters, to: e.target.value })}
            />
          </FilterField>
          {user?.role === "super_admin" ? (
            <FilterField label="Region">
              <select
                className="w-full rounded-xl border border-zimson-300 px-3 py-2 text-sm"
                value={filters.regionId ?? ""}
                onChange={(e) => setFilters({ ...filters, regionId: e.target.value || undefined })}
              >
                <option value="">All regions</option>
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </FilterField>
          ) : (
            <FilterField label="Scope">
              <div className="rounded-xl border border-zimson-200 bg-stone-50 px-3 py-2 text-sm text-stone-600">
                {regionLabel}
              </div>
            </FilterField>
          )}
          <div className="flex items-end sm:col-span-2 lg:col-span-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => void loadDashboard()}
              className="w-full rounded-xl bg-zimson-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zimson-900 disabled:opacity-60"
            >
              {loading ? "Loading…" : "Run report"}
            </button>
          </div>
        </div>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      </div>

      {data ? (
        <TopicPanels data={data} view={view} />
      ) : loading ? (
        <div className="rounded-2xl border border-zimson-200 bg-white p-12 text-center text-sm text-stone-500">
          Loading {activeTopic.label.toLowerCase()}…
        </div>
      ) : null}
    </div>
  );
}
