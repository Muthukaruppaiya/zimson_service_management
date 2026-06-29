import { useState } from "react";
import { ReportCharts } from "../../components/accounts/report/ReportCharts";
import { ReportDataTable } from "../../components/accounts/report/ReportDataTable";
import { downloadReportFile, ReportPageLayout } from "../../components/accounts/report/ReportPageLayout";
import {
  defaultReportFromDate,
  downloadReportExcel,
  fetchRevenueReportData,
  formatInr,
  localDateInputValue,
  type ReportFiltersQuery,
  type RevenueReportData,
} from "../../lib/clientReportsApi";

const SRF_COLS = ["S.No", "SR #", "INVCDATE", "STORE", "INVCNO", "ITEM", "FINALPRICE", "HSNCODE", "SR.Type"];
const QB_COLS = ["S.No", "SR #", "INVCDATE", "STORE", "INVCNO", "ITEM", "FINALPRICE", "BRAND", "Payment Remarks"];

export function RevenueReportPage() {
  const [filters, setFilters] = useState<ReportFiltersQuery>({
    from: defaultReportFromDate(),
    to: localDateInputValue(),
  });
  const [data, setData] = useState<RevenueReportData | null>(null);
  const [running, setRunning] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runReport() {
    setRunning(true);
    setError(null);
    try {
      setData(await fetchRevenueReportData(filters));
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Could not load report.");
    } finally {
      setRunning(false);
    }
  }

  async function handleDownload() {
    setDownloading(true);
    setError(null);
    try {
      const blob = await downloadReportExcel("revenue", filters, "revenue_report");
      await downloadReportFile(blob, `revenue_report_${Date.now()}.xlsx`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed.");
    } finally {
      setDownloading(false);
    }
  }

  const total = (data?.totals.srfAmount ?? 0) + (data?.totals.quickBillAmount ?? 0);

  return (
    <ReportPageLayout
      title="Revenue report"
      description="Dashboard for SRF and quick bill line-level revenue. Download exports two Excel sheets."
      filters={filters}
      onFiltersChange={setFilters}
      onRun={runReport}
      running={running}
      error={error}
      hasData={Boolean(data && (data.srfLines.length > 0 || data.quickBillLines.length > 0))}
      onDownload={handleDownload}
      downloading={downloading}
    >
      {data ? (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Total revenue" value={formatInr(total)} />
            <Stat label="SRF lines" value={String(data.totals.srfRows)} />
            <Stat label="Quick bill lines" value={String(data.totals.quickBillRows)} />
            <Stat label="Period" value={`${data.filters.from} → ${data.filters.to}`} />
          </div>

          <ReportCharts
            pie={{ title: "SR vs Quick bill", data: data.charts.srfVsQuickBill }}
            bar={{ title: "Revenue by store", data: data.charts.byStore }}
            extraPie={{ title: "By payment mode", data: data.charts.byPayment }}
          />

          <ReportDataTable title="SR revenue" columns={SRF_COLS} rows={data.srfLines} emptyMessage="No SRF revenue in this period." />
          <ReportDataTable title="Quick bill revenue" columns={QB_COLS} rows={data.quickBillLines} emptyMessage="No quick bills in this period." />
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-zimson-200 bg-zimson-50/50 px-6 py-12 text-center text-sm text-stone-600">
          Set filters and click <strong>Run report</strong> to load charts and data.
        </p>
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
