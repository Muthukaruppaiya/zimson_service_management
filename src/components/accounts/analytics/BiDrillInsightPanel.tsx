import type { DrillSelection } from "../../../lib/analyticsDrill";
import { formatCount, formatInr, type AnalyticsDashboardData } from "../../../lib/analyticsApi";
import { AnalyticsDataTable } from "./AnalyticsDataTable";

type Props = {
  selection: DrillSelection | null;
  data: AnalyticsDashboardData;
  storeName?: string;
  onClear: () => void;
  onOpenView?: (view: string) => void;
};

export function BiDrillInsightPanel({ selection, data, storeName, onClear, onOpenView }: Props) {
  if (!selection && !storeName) return null;

  const title = storeName ? `Store drill — ${storeName}` : selection ? `Drill — ${selection.slice.name}` : "";
  const storeRow = storeName ? data.storeDetail.find((s) => s.name === storeName) : null;

  let relatedRows = selection?.slice ? [{ name: selection.slice.name, value: selection.slice.value }] : [];
  if (storeRow) {
    relatedRows = [
      { name: "SRF billing", value: storeRow.srfInr },
      { name: "Quick bill", value: storeRow.quickBillInr },
      { name: "Total", value: storeRow.totalInr },
    ];
  } else if (selection?.source === "payment") {
    relatedRows = data.paymentModes.filter((r) => r.name === selection.slice.name);
  } else if (selection?.source === "brand") {
    relatedRows = [
      ...data.srfByBrand.filter((r) => r.name === selection.slice.name),
      ...data.quickBillByBrand.filter((r) => r.name === selection.slice.name),
    ];
  } else if (selection?.source === "pipeline") {
    relatedRows = data.srfStatusBreakdown.slice(0, 8);
  }

  const fmt = selection?.source === "pipeline" ? formatCount : formatInr;

  return (
    <div className="bi-drill-panel rounded-2xl border border-sky-200/80 bg-gradient-to-br from-sky-50/90 to-white p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-800/70">Drill-down insight</p>
          <h3 className="mt-1 text-lg font-semibold text-zimson-900">{title}</h3>
          {selection ? (
            <p className="mt-1 text-sm text-stone-600">
              Selected value: <strong className="text-zimson-900">{fmt(selection.slice.value)}</strong>
              {selection.suggestedView ? (
                <span className="text-stone-500"> · Click a chart bar or pie slice to explore deeper</span>
              ) : null}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {selection?.suggestedView && onOpenView ? (
            <button
              type="button"
              onClick={() => onOpenView(selection.suggestedView!)}
              className="rounded-lg bg-zimson-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zimson-900"
            >
              Open {selection.suggestedView.replace("_", " ")} report
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClear}
            className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
          >
            Clear drill
          </button>
        </div>
      </div>

      {relatedRows.length > 0 ? (
        <AnalyticsDataTable
          title="Breakdown"
          rows={relatedRows}
          valueLabel={selection?.source === "pipeline" ? "Count" : "Amount"}
          money={selection?.source !== "pipeline"}
        />
      ) : (
        <p className="rounded-xl border border-dashed border-stone-200 bg-white/60 px-4 py-6 text-center text-sm text-stone-500">
          Select a chart segment to see related breakdown here.
        </p>
      )}
    </div>
  );
}
