type Props = {
  title: string;
  columns: string[];
  rows: Record<string, unknown>[];
  emptyMessage?: string;
};

function cellText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  return String(value);
}

export function ReportDataTable({ title, columns, rows, emptyMessage = "Run the report to see results." }: Props) {
  return (
    <div className="rounded-2xl border border-zimson-200 bg-white shadow-sm">
      <div className="border-b border-zimson-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-zimson-900">
          {title} <span className="font-normal text-stone-500">({rows.length} rows)</span>
        </h3>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-stone-500">{emptyMessage}</p>
      ) : (
        <div className="max-h-[480px] overflow-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="sticky top-0 bg-zimson-50 text-zimson-900">
              <tr>
                {columns.map((col) => (
                  <th key={col} className="whitespace-nowrap px-3 py-2 font-semibold">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx} className="border-t border-stone-100 hover:bg-stone-50">
                  {columns.map((col) => (
                    <td key={col} className="whitespace-nowrap px-3 py-2 text-stone-700">
                      {cellText(row[col])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
