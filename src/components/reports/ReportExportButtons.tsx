import { useState } from "react";
import { exportReport, type ReportExportFormat, type ReportExportMeta, type ReportSheet } from "../../lib/reportExport";

type Props = {
  meta: ReportExportMeta;
  sheets: ReportSheet[] | (() => ReportSheet[]);
  disabled?: boolean;
  /** Replaces the built-in Excel export (e.g. a formatted server-side workbook). */
  onExcel?: () => Promise<void>;
  className?: string;
};

const FORMATS: Array<{ format: ReportExportFormat; label: string; tone: string }> = [
  { format: "excel", label: "Excel", tone: "text-emerald-700" },
  { format: "csv", label: "CSV", tone: "text-sky-700" },
  { format: "pdf", label: "PDF", tone: "text-rose-700" },
];

function FileIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={`h-4 w-4 ${className}`} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v5h5M12 11v6m0 0l-2.5-2.5M12 17l2.5-2.5" />
    </svg>
  );
}

export function ReportExportButtons({ meta, sheets, disabled, onExcel, className = "" }: Props) {
  const [busy, setBusy] = useState<ReportExportFormat | null>(null);

  async function run(format: ReportExportFormat) {
    setBusy(format);
    try {
      if (format === "excel" && onExcel) await onExcel();
      else await exportReport(format, meta, typeof sheets === "function" ? sheets() : sheets);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={`inline-flex flex-wrap items-stretch gap-2 ${className}`.trim()}>
      {FORMATS.map((f) => (
        <button
          key={f.format}
          type="button"
          disabled={disabled || busy !== null}
          onClick={() => void run(f.format)}
          title={`Export ${f.label}`}
          className="inline-flex items-center gap-1.5 border border-rlx-rule bg-white px-3 py-2 text-sm font-semibold text-rlx-green transition hover:border-rlx-green hover:bg-rlx-green-light disabled:cursor-not-allowed disabled:opacity-40"
        >
          <FileIcon className={f.tone} />
          {busy === f.format ? "Exporting…" : f.label}
        </button>
      ))}
    </div>
  );
}
