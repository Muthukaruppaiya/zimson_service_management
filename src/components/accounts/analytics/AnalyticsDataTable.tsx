import type { ChartSlice } from "../../../lib/analyticsApi";
import { formatCount, formatInr } from "../../../lib/analyticsApi";

type Row = ChartSlice & { sharePct?: number };

type Props = {
  title: string;
  rows: Row[];
  valueLabel?: string;
  money?: boolean;
};

export function AnalyticsDataTable({ title, rows, valueLabel = "Value", money = true }: Props) {
  const total = rows.reduce((s, r) => s + r.value, 0);
  const fmt = money ? formatInr : formatCount;

  return (
    <div className="rounded-2xl border border-zimson-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-zimson-900">{title}</h3>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-stone-500">No rows for this period</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[320px] text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
                <th className="py-2 pr-4 font-medium">#</th>
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 text-right font-medium">{valueLabel}</th>
                <th className="py-2 text-right font-medium">Share</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const share = total > 0 ? (row.value / total) * 100 : 0;
                return (
                  <tr key={`${row.name}-${i}`} className="border-b border-stone-100 last:border-0">
                    <td className="py-2.5 pr-4 text-stone-400">{i + 1}</td>
                    <td className="py-2.5 pr-4 font-medium text-zimson-900">{row.name}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-stone-800">{fmt(row.value)}</td>
                    <td className="py-2.5 text-right tabular-nums text-stone-500">{share.toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function downloadChartCsv(filename: string, rows: ChartSlice[]) {
  const lines = ["Name,Value", ...rows.map((r) => `"${r.name.replace(/"/g, '""')}",${r.value}`)];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
