import { useCallback, useEffect, useMemo, useState } from "react";
import { FormPageShell } from "../../components/layout/FormPageShell";
import { ReportDataTable } from "../../components/accounts/report/ReportDataTable";
import { Card } from "../../components/ui/Card";
import { useRegions } from "../../context/RegionsContext";
import { ApiError, apiJson } from "../../lib/api";
import type { SparePart, SpareStockRow } from "../../types/spare";
import { downloadCsv } from "./serviceReportUtils";

type OverviewRow = {
  spare: SparePart;
  stock: SpareStockRow[];
};

const COLUMNS = ["SKU", "Item", "Category", "Location", "Region", "Store", "Qty", "Last Updated"];

export function StockInHandReportPage() {
  const { regions } = useRegions();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const regionNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of regions) m.set(r.id, r.name);
    return m;
  }, [regions]);

  const storeNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of regions) {
      for (const s of r.stores) m.set(s.id, s.name);
    }
    return m;
  }, [regions]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiJson<{ rows: OverviewRow[] }>("/api/inventory/stock-price-overview");
      const flat: Record<string, unknown>[] = [];
      for (const row of data.rows ?? []) {
        for (const stock of row.stock) {
          const qty = Number(stock.quantity ?? 0);
          if (qty <= 0) continue;
          flat.push({
            SKU: row.spare.sku,
            Item: row.spare.name,
            Category: row.spare.category || "—",
            Location: stock.locationType,
            Region: regionNameById.get(stock.regionId) ?? stock.regionId,
            Store:
              stock.locationType === "STORE" && stock.storeId
                ? storeNameById.get(stock.storeId) ?? stock.storeId
                : stock.locationType === "HO"
                  ? "HO"
                  : "—",
            Qty: qty,
            "Last Updated": stock.updatedAt ? new Date(stock.updatedAt).toLocaleString() : "—",
          });
        }
      }
      flat.sort((a, b) => String(a.SKU).localeCompare(String(b.SKU)));
      setRows(flat);
    } catch (e) {
      setRows([]);
      setError(e instanceof ApiError ? e.message : "Could not load spare stock.");
    } finally {
      setLoading(false);
    }
  }, [regionNameById, storeNameById]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const totalQty = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.Qty ?? 0), 0),
    [rows],
  );

  return (
    <FormPageShell
      breadcrumb="Reports"
      title="Stock in hand report"
      actions={
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => downloadCsv(`stock_in_hand_${new Date().toISOString().slice(0, 10)}.csv`, COLUMNS, rows)}
            className="rounded-lg border border-rlx-gold/60 bg-white px-3 py-1.5 text-xs font-semibold text-rlx-green hover:bg-rlx-green-light"
            disabled={rows.length === 0}
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-lg border border-rlx-gold/60 bg-white px-3 py-1.5 text-xs font-semibold text-rlx-green hover:bg-rlx-green-light"
          >
            Refresh
          </button>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card title="Spare lines">
          <p className="text-lg font-semibold text-rlx-green">{rows.length}</p>
        </Card>
        <Card title="Total quantity">
          <p className="text-lg font-semibold text-indigo-700">{totalQty}</p>
        </Card>
        <Card title="Report type">
          <p className="text-sm text-stone-700">Spare inventory stock on hand (HO + store)</p>
        </Card>
      </div>

      <Card title="Description" className="mt-3">
        <p className="text-sm text-stone-700">
          Current spare parts stock in hand by location. Only rows with quantity greater than zero are shown.
        </p>
      </Card>

      {error ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="mt-3">
        {loading ? (
          <p className="rounded-lg border border-rlx-rule bg-white px-3 py-5 text-sm text-stone-600">Loading spare stock...</p>
        ) : (
          <ReportDataTable
            title="Spare stock in hand"
            columns={COLUMNS}
            rows={rows}
            emptyMessage="No spare stock on hand."
          />
        )}
      </div>
    </FormPageShell>
  );
}
