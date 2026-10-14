import type { ReactNode } from "react";
import { Card } from "../../ui/Card";
import { PageHeader } from "../../ui/PageHeader";
import { ReportFilters } from "./ReportFilters";
import { ReportExportButtons } from "../../reports/ReportExportButtons";
import type { ReportFiltersQuery } from "../../../lib/clientReportsApi";
import { triggerBlobDownload } from "../../../lib/captureInvoicePdf";
import { describeReportDateRange } from "../../../lib/reportDateRange";
import type { ReportSheet } from "../../../lib/reportExport";

type Props = {
  title: string;
  description: string;
  filters: ReportFiltersQuery;
  onFiltersChange: (f: ReportFiltersQuery) => void;
  onRun: () => void;
  running: boolean;
  error: string | null;
  hasData: boolean;
  onDownload: () => Promise<void>;
  downloading: boolean;
  exportFileBase: string;
  exportSheets: ReportSheet[];
  children: ReactNode;
};

export function ReportPageLayout({
  title,
  description,
  filters,
  onFiltersChange,
  onRun,
  running,
  error,
  hasData,
  onDownload,
  downloading,
  exportFileBase,
  exportSheets,
  children,
}: Props) {
  const rowCount = exportSheets.reduce((sum, s) => sum + s.rows.length, 0);
  return (
    <div>
      <PageHeader
        title={title}
        description={description}
        actions={
          <ReportExportButtons
            meta={{
              title,
              fileBase: exportFileBase,
              subtitle: [describeReportDateRange(filters, "Period"), `Rows: ${rowCount}`],
            }}
            sheets={exportSheets}
            onExcel={onDownload}
            disabled={!hasData || downloading || running}
          />
        }
      />

      <Card title="Filters" className="mb-6">
        <ReportFilters filters={filters} onChange={onFiltersChange} onRun={onRun} running={running} />
      </Card>

      {error ? (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      ) : null}

      {children}
    </div>
  );
}

export async function downloadReportFile(blob: Blob, filename: string) {
  triggerBlobDownload(blob, filename);
}
