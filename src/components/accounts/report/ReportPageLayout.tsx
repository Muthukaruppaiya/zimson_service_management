import type { ReactNode } from "react";
import { Card } from "../../ui/Card";
import { PageHeader } from "../../ui/PageHeader";
import { ReportFilters } from "./ReportFilters";
import type { ReportFiltersQuery } from "../../../lib/clientReportsApi";
import { triggerBlobDownload } from "../../../lib/captureInvoicePdf";

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
  downloadLabel?: string;
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
  downloadLabel = "Download Excel",
  children,
}: Props) {
  return (
    <div>
      <PageHeader
        title={title}
        description={description}
        actions={
          <button
            type="button"
            disabled={!hasData || downloading || running}
            onClick={() => void onDownload()}
            className="rounded-xl bg-zimson-800 px-4 py-2 text-sm font-semibold text-white hover:bg-zimson-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {downloading ? "Downloading…" : downloadLabel}
          </button>
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
