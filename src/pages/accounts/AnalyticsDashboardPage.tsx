import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AnalyticsBarChart,
  AnalyticsDualLineChart,
  AnalyticsLineChart,
  AnalyticsPieChart,
} from "../../components/accounts/analytics/AnalyticsCharts";
import { AnalyticsDataTable, downloadChartCsv } from "../../components/accounts/analytics/AnalyticsDataTable";
import { BiDrillBreadcrumb } from "../../components/accounts/analytics/BiDrillBreadcrumb";
import { BiDrillInsightPanel } from "../../components/accounts/analytics/BiDrillInsightPanel";
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
  type ChartSlice,
} from "../../lib/analyticsApi";
import {
  dimensionCrumb,
  emptyDrillPath,
  findRegionIdByName,
  regionCrumb,
  storeCrumb,
  type DrillCrumb,
  type DrillSelection,
} from "../../lib/analyticsDrill";
import { DATE_PRESETS, dateRangeForPreset, type DatePresetKey } from "../../lib/analyticsDatePresets";
import {
  analyticsTopicsForRole,
  topicMeta,
  type AnalyticsViewKey,
} from "../../lib/analyticsTopics";

type DrillHandlers = {
  onDrillRegion: (slice: ChartSlice) => void;
  onDrillStore: (slice: ChartSlice) => void;
  onDrillSelection: (source: string, slice: ChartSlice, suggestedView?: AnalyticsViewKey) => void;
  onSwitchView: (view: AnalyticsViewKey) => void;
  activeSliceName?: string;
  drillStoreName?: string;
};

function KpiCard({
  label,
  value,
  hint,
  accent,
  deltaPct,
  compareLabel,
  onClick,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: "blue" | "green" | "amber" | "slate";
  deltaPct?: number | null;
  compareLabel?: string;
  onClick?: () => void;
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
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`bi-kpi-card rounded-2xl border p-4 text-left shadow-sm transition ${border} ${onClick ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-md" : ""}`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-zimson-900">{value}</p>
      {deltaPct != null ? (
        <p className={`mt-1 text-xs font-medium ${deltaUp ? "text-emerald-700" : deltaDown ? "text-red-600" : "text-stone-500"}`}>
          {deltaPct > 0 ? "▲" : deltaPct < 0 ? "▼" : "—"} {Math.abs(deltaPct).toFixed(1)}% {compareLabel ?? "vs prior period"}
        </p>
      ) : null}
      {hint ? <p className="mt-1 text-xs text-stone-500">{hint}</p> : null}
      {onClick ? <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-sky-700">Tap to explore</p> : null}
    </Tag>
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

function BiExecutiveStrip({ data }: { data: AnalyticsDashboardData }) {
  const cmp = data.compare.label;
  return (
    <div className="bi-executive-strip grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
      <KpiCard label="Total sales" value={formatInr(data.kpis.totalSalesInr)} accent="blue" deltaPct={pctChange(data.kpis.totalSalesInr, data.compare.totalSalesInr)} compareLabel={cmp} />
      <KpiCard label="SRF billing" value={formatInr(data.kpis.srfSalesInr)} accent="blue" deltaPct={pctChange(data.kpis.srfSalesInr, data.compare.srfSalesInr)} compareLabel={cmp} />
      <KpiCard label="Quick bill" value={formatInr(data.kpis.quickBillSalesInr)} accent="blue" deltaPct={pctChange(data.kpis.quickBillSalesInr, data.compare.quickBillSalesInr)} compareLabel={cmp} />
      <KpiCard label="SRF opened" value={formatCount(data.kpis.srfOpened)} accent="slate" deltaPct={pctChange(data.kpis.srfOpened, data.compare.srfOpened)} compareLabel={cmp} />
      <KpiCard label="Purchases" value={formatInr(data.kpis.purchaseInr)} accent="amber" deltaPct={pctChange(data.kpis.purchaseInr, data.compare.purchaseInr)} compareLabel={cmp} />
      <KpiCard label="Gross margin" value={formatPct(data.derived.grossMarginPct)} hint={formatInr(data.derived.grossMarginInr)} accent="green" />
    </div>
  );
}

function StoreDetailTable({
  rows,
  drill,
}: {
  rows: AnalyticsDashboardData["storeDetail"];
  drill: DrillHandlers;
}) {
  if (rows.length === 0) return null;
  const total = rows.reduce((s, r) => s + r.totalInr, 0);
  return (
    <div className="rounded-2xl border border-zimson-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-zimson-900">Store breakdown (SRF + quick bill)</h3>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-sky-700">Click store to drill</span>
      </div>
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
              <tr
                key={r.name}
                className={`border-b border-stone-100 cursor-pointer transition hover:bg-sky-50/80 ${drill.drillStoreName === r.name ? "bg-amber-50/80" : ""}`}
                onClick={() => drill.onDrillStore({ name: r.name, value: r.totalInr })}
              >
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

function TopicPanels({ data, view, drill }: { data: AnalyticsDashboardData; view: AnalyticsViewKey; drill: DrillHandlers }) {
  const periodHint = `${data.filters.from} → ${data.filters.to}`;
  const cmp = data.compare.label;
  const active = drill.activeSliceName;

  if (view === "sales") {
    return (
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Total sales" value={formatInr(data.kpis.totalSalesInr)} accent="blue" deltaPct={pctChange(data.kpis.totalSalesInr, data.compare.totalSalesInr)} compareLabel={cmp} onClick={() => drill.onSwitchView("margin")} />
          <KpiCard label="SRF billing" value={formatInr(data.kpis.srfSalesInr)} accent="blue" deltaPct={pctChange(data.kpis.srfSalesInr, data.compare.srfSalesInr)} compareLabel={cmp} onClick={() => drill.onSwitchView("srf")} />
          <KpiCard label="Quick bill" value={formatInr(data.kpis.quickBillSalesInr)} hint={`${formatCount(data.kpis.quickBillCount)} bills · avg ${formatInr(data.derived.avgQuickBillInr)}`} accent="blue" deltaPct={pctChange(data.kpis.quickBillSalesInr, data.compare.quickBillSalesInr)} compareLabel={cmp} onClick={() => drill.onSwitchView("quick_bill")} />
          <KpiCard label="B2B share" value={formatPct(data.derived.b2bSharePct)} hint={`B2B ${formatInr(data.kpis.b2bSalesInr)}`} accent="green" onClick={() => drill.onSwitchView("b2b_b2c")} />
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <AnalyticsLineChart title="Daily sales trend" subtitle="SRF invoices + quick bills" data={data.salesTrend} />
          <AnalyticsBarChart title="Monthly sales" data={data.salesByMonth} subtitle="Aggregated by month" horizontal={false} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <AnalyticsPieChart
            title="SRF vs Quick bill"
            data={data.srfVsQuickBill}
            drillable
            activeSliceName={active}
            onSliceClick={(slice) => {
              const v = slice.name.toLowerCase().includes("quick") ? "quick_bill" : "srf";
              drill.onDrillSelection("channel", slice, v);
              drill.onSwitchView(v);
            }}
          />
          {data.salesByRegion.length > 0 ? (
            <AnalyticsBarChart
              title="Sales by region"
              data={data.salesByRegion}
              subtitle="Click a region to drill into stores"
              drillable
              activeSliceName={active}
              onSliceClick={drill.onDrillRegion}
            />
          ) : (
            <AnalyticsBarChart
              title="Sales by store"
              data={data.salesByStore}
              subtitle="Click a store for detail"
              drillable
              activeSliceName={active}
              onSliceClick={drill.onDrillStore}
            />
          )}
        </div>
        <div className="flex justify-end">
          <ExportBtn label="Export store CSV" filename="sales_by_store.csv" rows={data.salesByStore} />
        </div>
        <AnalyticsDataTable
          title="Sales by store"
          rows={data.salesByStore}
          valueLabel="Revenue"
          drillable
          activeRowName={drill.drillStoreName ?? active}
          onRowClick={drill.onDrillStore}
        />
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
        <AnalyticsBarChart
          title="Pipeline stages"
          data={data.srfPipelineBuckets}
          subtitle="Grouped journey — click a stage to drill"
          valueFormatter={formatCount}
          drillable
          activeSliceName={active}
          onSliceClick={(slice) => drill.onDrillSelection("pipeline", slice, "srf")}
        />
        <AnalyticsBarChart title="All statuses (detail)" data={data.srfStatusBreakdown} valueFormatter={formatCount} tall={true} />
        <AnalyticsBarChart
          title="Bookings by brand"
          data={data.srfByBrand}
          subtitle="Opened in period — click brand"
          valueFormatter={formatCount}
          drillable
          activeSliceName={active}
          onSliceClick={(slice) => drill.onDrillSelection("brand", slice, "srf")}
        />
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
          <AnalyticsPieChart
            title="Payment modes"
            data={data.paymentModes}
            drillable
            activeSliceName={active}
            onSliceClick={(slice) => drill.onDrillSelection("payment", slice, "quick_bill")}
          />
        </div>
        <AnalyticsBarChart
          title="Revenue by brand"
          data={data.quickBillByBrand}
          drillable
          activeSliceName={active}
          onSliceClick={(slice) => drill.onDrillSelection("brand", slice, "quick_bill")}
        />
        <AnalyticsDataTable
          title="Payment mode breakdown"
          rows={data.paymentModes}
          valueLabel="Amount"
          drillable
          activeRowName={active}
          onRowClick={(slice) => drill.onDrillSelection("payment", slice, "quick_bill")}
        />
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
          <AnalyticsPieChart
            title="B2B vs B2C"
            data={data.b2bVsB2c}
            drillable
            activeSliceName={active}
            onSliceClick={(slice) => drill.onDrillSelection("b2b", slice, "b2b_b2c")}
          />
          <AnalyticsBarChart
            title="By channel"
            data={data.b2bB2cByChannel}
            horizontal={false}
            drillable
            activeSliceName={active}
            onSliceClick={(slice) => drill.onDrillSelection("channel", slice, "b2b_b2c")}
          />
        </div>
        <AnalyticsDataTable
          title="Channel split"
          rows={data.b2bB2cByChannel}
          valueLabel="Revenue"
          drillable
          activeRowName={active}
          onRowClick={(slice) => drill.onDrillSelection("channel", slice, "b2b_b2c")}
        />
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
          <AnalyticsBarChart
            title="By vendor"
            data={data.purchaseByVendor}
            drillable
            activeSliceName={active}
            onSliceClick={(slice) => drill.onDrillSelection("vendor", slice, "purchase")}
          />
          <AnalyticsBarChart
            title="By HSN"
            data={data.purchaseByHsn}
            drillable
            activeSliceName={active}
            onSliceClick={(slice) => drill.onDrillSelection("hsn", slice, "purchase")}
          />
        </div>
        <AnalyticsDataTable
          title="Top vendors"
          rows={data.purchaseByVendor}
          valueLabel="GRN value"
          drillable
          activeRowName={active}
          onRowClick={(slice) => drill.onDrillSelection("vendor", slice, "purchase")}
        />
      </div>
    );
  }

  if (view === "margin") {
    const marginSeriesA = data.salesByMonth.map((x) => ({ name: x.name, value: x.value }));
    const marginSeriesB = data.purchaseByMonth;
    return (
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Total sales" value={formatInr(data.kpis.totalSalesInr)} accent="blue" deltaPct={pctChange(data.kpis.totalSalesInr, data.compare.totalSalesInr)} compareLabel={cmp} onClick={() => drill.onSwitchView("sales")} />
          <KpiCard label="Purchases (GRN)" value={formatInr(data.kpis.purchaseInr)} accent="amber" deltaPct={pctChange(data.kpis.purchaseInr, data.compare.purchaseInr)} compareLabel={cmp} onClick={() => drill.onSwitchView("purchase")} />
          <KpiCard label="Gross margin" value={formatInr(data.derived.grossMarginInr)} accent="green" />
          <KpiCard label="Margin %" value={formatPct(data.derived.grossMarginPct)} hint="(Sales − purchase) ÷ sales" accent="green" />
        </div>
        <AnalyticsDualLineChart title="Sales vs purchase (monthly)" seriesA={marginSeriesA} seriesB={marginSeriesB} labelA="Sales" labelB="Purchase" />
        <AnalyticsPieChart
          title="SRF vs Quick bill sales"
          data={data.srfVsQuickBill}
          drillable
          activeSliceName={active}
          onSliceClick={(slice) => {
            const v = slice.name.toLowerCase().includes("quick") ? "quick_bill" : "srf";
            drill.onDrillSelection("channel", slice, v);
            drill.onSwitchView(v);
          }}
        />
      </div>
    );
  }

  if (view === "store") {
    const topStore = data.salesByStore[0];
    return (
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard label="Total store sales" value={formatInr(data.kpis.totalSalesInr)} accent="blue" deltaPct={pctChange(data.kpis.totalSalesInr, data.compare.totalSalesInr)} compareLabel={cmp} />
          <KpiCard label="Top store" value={topStore?.name ?? "—"} hint={topStore ? formatInr(topStore.value) : undefined} accent="green" onClick={topStore ? () => drill.onDrillStore(topStore) : undefined} />
          <KpiCard label="Stores ranked" value={formatCount(data.salesByStore.length)} accent="slate" />
        </div>
        <AnalyticsBarChart
          title="Sales by store"
          data={data.salesByStore}
          tall={true}
          drillable
          activeSliceName={drill.drillStoreName ?? active}
          onSliceClick={drill.onDrillStore}
        />
        <StoreDetailTable rows={data.storeDetail} drill={drill} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <KpiCard label="Period" value={periodHint} accent="slate" />
      <AnalyticsBarChart
        title="Sales by region"
        data={data.salesByRegion}
        drillable
        activeSliceName={active}
        onSliceClick={drill.onDrillRegion}
      />
      <AnalyticsDataTable
        title="Regional revenue"
        rows={data.salesByRegion}
        valueLabel="Revenue"
        drillable
        activeRowName={active}
        onRowClick={drill.onDrillRegion}
      />
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
  const [drillPath, setDrillPath] = useState<DrillCrumb[]>(emptyDrillPath);
  const [drillSelection, setDrillSelection] = useState<DrillSelection | null>(null);
  const [drillStoreName, setDrillStoreName] = useState<string | undefined>();

  const activeTopic = topicMeta(view);

  const loadDashboard = useCallback(
    async (nextView: AnalyticsViewKey = view, nextFilters: AnalyticsFiltersQuery = filters) => {
      const payload = { ...nextFilters, view: nextView };
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
    },
    [filters, view],
  );

  function clearDrill() {
    setDrillPath(emptyDrillPath());
    setDrillSelection(null);
    setDrillStoreName(undefined);
  }

  function navigateDrill(index: number) {
    const target = drillPath[index];
    if (!target) return;
    const newPath = drillPath.slice(0, index + 1);
    setDrillPath(newPath);

    if (target.level === "overview") {
      setDrillSelection(null);
      setDrillStoreName(undefined);
      const nextFilters = { ...filters, regionId: undefined };
      setFilters(nextFilters);
      void loadDashboard(view, nextFilters);
      return;
    }

    if (target.level === "region" && target.regionId) {
      setDrillStoreName(undefined);
      setDrillSelection(null);
      const nextFilters = { ...filters, regionId: target.regionId };
      setFilters(nextFilters);
      void loadDashboard("store", nextFilters);
      setView("store");
      return;
    }

    if (target.level === "store" && target.storeName) {
      setDrillStoreName(target.storeName);
      setDrillSelection({ source: "store", slice: { name: target.storeName, value: 0 } });
    }
  }

  const drillHandlers: DrillHandlers = {
    activeSliceName: drillSelection?.slice.name,
    drillStoreName,
    onSwitchView: (nextView) => {
      setView(nextView);
      void loadDashboard(nextView);
    },
    onDrillSelection: (source, slice, suggestedView) => {
      setDrillSelection({ source, slice, suggestedView });
      setDrillPath((p) => {
        const base = p.length > 1 ? p : emptyDrillPath();
        return [...base, dimensionCrumb(slice.name, source)];
      });
    },
    onDrillRegion: (slice) => {
      const regionId = findRegionIdByName(regions, slice.name);
      if (!regionId) {
        setDrillSelection({ source: "region", slice });
        return;
      }
      setDrillSelection({ source: "region", slice, suggestedView: "store" });
      setDrillStoreName(undefined);
      setDrillPath([...emptyDrillPath(), regionCrumb(slice.name, regionId)]);
      const nextFilters = { ...filters, regionId };
      setFilters(nextFilters);
      setView("store");
      void loadDashboard("store", nextFilters);
    },
    onDrillStore: (slice) => {
      setDrillStoreName(slice.name);
      setDrillSelection({ source: "store", slice, suggestedView: "store" });
      setDrillPath((p) => {
        const withoutStore = p.filter((c) => c.level !== "store" && c.level !== "dimension");
        return [...withoutStore, storeCrumb(slice.name, slice.name)];
      });
      setView("store");
    },
  };

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
    <div className="chrono-bi space-y-6 pb-10">
      <div className="bi-hero overflow-hidden rounded-3xl border border-zimson-200 shadow-lg">
        <div className="bi-hero__stripe" aria-hidden />
        <div className="bi-hero__body px-6 py-8 text-white sm:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">Business intelligence</p>
              <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{activeTopic.label}</h1>
              <p className="mt-2 max-w-3xl text-sm text-white/80">
                Interactive drill-down analytics — click charts, KPIs, and table rows to explore deeper. Scoped to {regionLabel}.
                {data ? ` ${data.compare.label} on KPI cards.` : ""}
              </p>
            </div>
            {data ? (
              <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-right backdrop-blur-sm">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/60">Period</p>
                <p className="mt-1 text-sm font-semibold">{data.filters.from} → {data.filters.to}</p>
              </div>
            ) : null}
          </div>
          <div className="mt-5">
            <BiDrillBreadcrumb path={drillPath} onNavigate={navigateDrill} />
          </div>
        </div>
      </div>

      {data ? <BiExecutiveStrip data={data} /> : null}

      <div className="rounded-2xl border border-zimson-200 bg-white p-4 shadow-sm">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-500">Choose report</p>
        <div className="flex flex-wrap gap-2">
          {topics.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                clearDrill();
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
                onChange={(e) => {
                  clearDrill();
                  setFilters({ ...filters, regionId: e.target.value || undefined });
                }}
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
              onClick={() => {
                clearDrill();
                void loadDashboard();
              }}
              className="w-full rounded-xl bg-zimson-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zimson-900 disabled:opacity-60"
            >
              {loading ? "Loading…" : "Run report"}
            </button>
          </div>
        </div>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      </div>

      {data ? (
        <>
          <TopicPanels data={data} view={view} drill={drillHandlers} />
          <BiDrillInsightPanel
            selection={drillSelection}
            data={data}
            storeName={drillStoreName}
            onClear={clearDrill}
            onOpenView={(v) => drillHandlers.onSwitchView(v as AnalyticsViewKey)}
          />
        </>
      ) : loading ? (
        <div className="rounded-2xl border border-zimson-200 bg-white p-12 text-center text-sm text-stone-500">
          Loading {activeTopic.label.toLowerCase()}…
        </div>
      ) : null}
    </div>
  );
}
