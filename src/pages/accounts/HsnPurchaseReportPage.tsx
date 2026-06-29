import { useState } from "react";
import { ReportCharts } from "../../components/accounts/report/ReportCharts";
import { ReportDataTable } from "../../components/accounts/report/ReportDataTable";
import { downloadReportFile, ReportPageLayout } from "../../components/accounts/report/ReportPageLayout";
import {
  defaultReportFromDate,
  downloadReportExcel,
  fetchHsnPurchaseReportData,
  formatInr,
  localDateInputValue,
  type ReportFiltersQuery,
  type TabularReportData,
} from "../../lib/clientReportsApi";

const COLS = ["S.No", "Store Code", "Vou.No.", "Vou.Date", "Vendor Name", "HSN Code", "Sum(Pur.Qty)", "Inv.Val.", "Narration"];

export function HsnPurchaseReportPage() {
  const [filters, setFilters] = useState<ReportFiltersQuery>({
    from: defaultReportFromDate(),
    to: localDateInputValue(),
  });
  const [data, setData] = useState<TabularReportData | null>(null);
  const [running, setRunning] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runReport() {
    setRunning(true);
    setError(null);
    try {
      setData(await fetchHsnPurchaseReportData(filters));
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Could not load report.");
    } finally {
      setRunning(false);
    }
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      const blob = await downloadReportExcel("hsn-purchase", filters, "hsn_purchase_report");
      await downloadReportFile(blob, `hsn_purchase_report_${Date.now()}.xlsx`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <ReportPageLayout
      title="HSN purchase report"
      description="GRN inward purchases by vendor and HSN code."
      filters={filters}
      onFiltersChange={setFilters}
      onRun={runReport}
      running={running}
      error={error}
      hasData={Boolean(data && data.rows.length > 0)}
      onDownload={handleDownload}
      downloading={downloading}
    >
      {data ? (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="GRN lines" value={String(data.totals.lines ?? 0)} />
            <Stat label="Purchase value" value={formatInr(Number(data.totals.amount ?? 0))} />
            <Stat label="Period" value={`${data.filters.from} → ${data.filters.to}`} />
          </div>
          <ReportCharts
            pie={{ title: "By HSN code", data: data.charts.byHsn ?? [] }}
            bar={{ title: "By vendor", data: data.charts.byVendor ?? [] }}
            extraPie={{ title: "By store", data: data.charts.byStore ?? [] }}
          />
          <ReportDataTable title="HSN purchases" columns={COLS} rows={data.rows} />
        </div>
      ) : (
        <EmptyHint />
      )}
    </ReportPageLayout>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zimson-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-zimson-900">{value}</p>
    </div>
  );
}

function EmptyHint() {
  return (
    <p className="rounded-2xl border border-dashed border-zimson-200 bg-zimson-50/50 px-6 py-12 text-center text-sm text-stone-600">
      Set filters and click <strong>Run report</strong> to load charts and data.
    </p>
  );
}
