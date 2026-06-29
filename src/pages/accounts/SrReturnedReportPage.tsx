import { useState } from "react";
import { ReportCharts } from "../../components/accounts/report/ReportCharts";
import { ReportDataTable } from "../../components/accounts/report/ReportDataTable";
import { downloadReportFile, ReportPageLayout } from "../../components/accounts/report/ReportPageLayout";
import {
  defaultReportFromDate,
  downloadReportExcel,
  fetchSrReturnedReportData,
  localDateInputValue,
  type ReportFiltersQuery,
  type TabularReportData,
} from "../../lib/clientReportsApi";

const COLS = ["S.No", "RETURNED.DATE", "RETURNED.No.", "STORE", "SR No.", "BRAND", "Nature of Repair", "FIRSTNAME", "PHONE1"];

export function SrReturnedReportPage() {
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
      setData(await fetchSrReturnedReportData(filters));
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
      const blob = await downloadReportExcel("sr-returned", filters, "sr_returned_report");
      await downloadReportFile(blob, `sr_returned_report_${Date.now()}.xlsx`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <ReportPageLayout
      title="SR returned report"
      description="SRFs returned without billing or inter-HO no-repair returns."
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
          <div className="grid gap-3 sm:grid-cols-2">
            <Stat label="Return lines" value={String(data.totals.lines ?? 0)} />
            <Stat label="Period" value={`${data.filters.from} → ${data.filters.to}`} />
          </div>
          <ReportCharts
            pie={{ title: "By nature of repair", data: data.charts.byNature ?? [] }}
            bar={{ title: "By store", data: data.charts.byStore ?? [] }}
            extraPie={{ title: "By brand", data: data.charts.byBrand ?? [] }}
          />
          <ReportDataTable title="SR returns" columns={COLS} rows={data.rows} />
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
