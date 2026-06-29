import { useState } from "react";
import { ReportCharts } from "../../components/accounts/report/ReportCharts";
import { ReportDataTable } from "../../components/accounts/report/ReportDataTable";
import { downloadReportFile, ReportPageLayout } from "../../components/accounts/report/ReportPageLayout";
import {
  defaultReportFromDate,
  downloadReportExcel,
  fetchSummarySaleReportData,
  formatInr,
  localDateInputValue,
  type ReportFiltersQuery,
  type TabularReportData,
} from "../../lib/clientReportsApi";

const COLS = ["S.No", "SR #", "STORE", "INVC_NO", "FINALPRICE", "CASH", "CARD", "ONLINE", "SR.Type", "Payment"];

export function SummarySaleReportPage() {
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
      setData(await fetchSummarySaleReportData(filters));
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
      const blob = await downloadReportExcel("summary-sale", filters, "summary_sale_report");
      await downloadReportFile(blob, `summary_sale_report_${Date.now()}.xlsx`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <ReportPageLayout
      title="Summary sale report"
      description="Invoice-level sales with payment mode breakdown."
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
            <Stat label="Invoices" value={String(data.totals.invoices ?? 0)} />
            <Stat label="Total sales" value={formatInr(Number(data.totals.amount ?? 0))} />
            <Stat label="Period" value={`${data.filters.from} → ${data.filters.to}`} />
          </div>
          <ReportCharts
            pie={{ title: "Payment mode", data: data.charts.byPayment ?? [] }}
            bar={{ title: "Sales by store", data: data.charts.byStore ?? [] }}
            extraPie={{ title: "By SR type", data: data.charts.bySrType ?? [] }}
          />
          <ReportDataTable title="Summary sales" columns={COLS} rows={data.rows} />
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
