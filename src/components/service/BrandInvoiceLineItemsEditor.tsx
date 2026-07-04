import { useCallback, useMemo } from "react";
import type { BrandInvoiceLineItem } from "../../types/brandInvoice";
import { emptyBrandInvoiceLine } from "../../types/brandInvoice";
import type { HsnMasterRow } from "../../types/hsnMaster";
import { HsnPicker } from "./HsnPicker";

type Props = {
  lines: BrandInvoiceLineItem[];
  onChange: (lines: BrandInvoiceLineItem[]) => void;
  hsnOptions: HsnMasterRow[];
  apiMode: boolean;
  onHsnOptionsUpdated?: () => void;
  disabled?: boolean;
  error?: string | null;
};

type LineRow = BrandInvoiceLineItem & { _key?: string };

const inputClass =
  "w-full rounded-lg border border-zimson-300 bg-zimson-50/50 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-zimson-400/40";

function newLineKey(): string {
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toLineRows(lines: BrandInvoiceLineItem[]): LineRow[] {
  return lines.map((line, i) => {
    const row = line as LineRow;
    return {
      ...line,
      _key: row._key ?? `line-seed-${i}`,
    };
  });
}

export function BrandInvoiceLineItemsEditor({
  lines,
  onChange,
  hsnOptions,
  apiMode,
  onHsnOptionsUpdated,
  disabled,
  error,
}: Props) {
  const lineRows = useMemo(() => toLineRows(lines), [lines]);

  const emitLines = useCallback(
    (rows: LineRow[]) => {
      onChange(rows);
    },
    [onChange],
  );

  const updateLine = useCallback(
    (key: string, patch: Partial<BrandInvoiceLineItem>) => {
      emitLines(lineRows.map((line) => (line._key === key ? { ...line, ...patch } : line)));
    },
    [emitLines, lineRows],
  );

  const addLine = useCallback(() => {
    emitLines([...lineRows, { ...emptyBrandInvoiceLine(), _key: newLineKey() }]);
  }, [emitLines, lineRows]);

  const removeLine = useCallback(
    (key: string) => {
      emitLines(lineRows.filter((line) => line._key !== key));
    },
    [emitLines, lineRows],
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-stone-700">Invoice line items *</p>
        <button
          type="button"
          disabled={disabled}
          onClick={addLine}
          className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
        >
          + Add line
        </button>
      </div>
      <p className="mt-0.5 text-[11px] text-stone-500">
        Type or search HSN. If it is not in the list, click <strong>Save HSN</strong> (same as SRF family field).
      </p>
      {lineRows.length === 0 ? (
        <p className="mt-2 rounded-xl border border-dashed border-stone-300 bg-stone-50 px-3 py-4 text-center text-xs text-stone-500">
          No lines yet — click Add line to enter spare, HSN, quantity and price.
        </p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full border-collapse text-xs">
            <thead>
              <tr className="bg-stone-100 text-left text-[10px] font-bold uppercase tracking-wide text-stone-500">
                <th className="px-2 py-2">Spare / part</th>
                <th className="px-2 py-2 min-w-[14rem]">HSN</th>
                <th className="px-2 py-2 w-20">Qty</th>
                <th className="px-2 py-2 w-28">Price (₹)</th>
                <th className="px-2 py-2 w-24 text-right">Line total</th>
                <th className="px-2 py-2 w-10" />
              </tr>
            </thead>
            <tbody>
              {lineRows.map((line) => {
                const lineTotal = (Number(line.quantity) || 0) * (Number(line.priceInr) || 0);
                return (
                  <tr key={line._key} className="border-t border-stone-200 align-top">
                    <td className="px-2 py-1.5">
                      <input
                        className={inputClass}
                        value={line.spare}
                        disabled={disabled}
                        placeholder="Spare / part name"
                        onChange={(e) => updateLine(line._key, { spare: e.target.value })}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <HsnPicker
                        idPrefix={`brand-inv-${line._key ?? "row"}`}
                        value={line.hsn}
                        onChange={(code) => updateLine(line._key!, { hsn: code })}
                        options={hsnOptions}
                        apiMode={apiMode}
                        onOptionsUpdated={onHsnOptionsUpdated}
                        disabled={disabled}
                        compact
                        required
                        canSaveNew
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        className={inputClass}
                        value={line.quantity}
                        disabled={disabled}
                        onChange={(e) => updateLine(line._key, { quantity: Number(e.target.value) })}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className={inputClass}
                        value={line.priceInr}
                        disabled={disabled}
                        onChange={(e) => updateLine(line._key, { priceInr: Number(e.target.value) })}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-stone-800">
                      {lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => removeLine(line._key)}
                        className="text-rose-700 hover:underline disabled:opacity-50"
                        aria-label="Remove line"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {error ? <p className="mt-1 text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}
