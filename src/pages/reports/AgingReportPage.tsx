import { useEffect, useMemo, useState } from "react";
import { ReportDataTable } from "../../components/accounts/report/ReportDataTable";
import { apiJson } from "../../lib/api";
import { useSpares } from "../../context/SparesContext";
import type { SpareStockRow } from "../../types/spare";
import { ServiceReportPageShell } from "./ServiceReportPageShell";

type StockHistoryRow = {
  createdAt: string;
};

function daysSince(iso?: string | null): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24)));
}

function agingBucket(days: number): string {
  if (days <= 7) return "0-7 days";
  if (days <= 15) return "8-15 days";
  if (days <= 30) return "16-30 days";
  if (days <= 60) return "31-60 days";
  return "60+ days";
}

export function AgingReportPage() {
  const { spares } = useSpares();
  const [inventoryRows, setInventoryRows] = useState<Record<string, unknown>[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadInventoryAging() {
      setInventoryLoading(true);
      try {
        const tasks = spares.map(async (spare) => {
          const stockRes = await apiJson<{ stock: SpareStockRow[] }>(
            `/api/catalog/spares/${encodeURIComponent(spare.id)}/stock`,
          );
          const qty = (stockRes.stock ?? []).reduce((sum, row) => sum + Number(row.quantity ?? 0), 0);
          if (qty <= 0) return null;

          const histRes = await apiJson<{ history: StockHistoryRow[] }>(
            `/api/catalog/spares/${encodeURIComponent(spare.id)}/stock-history?limit=1`,
          );
          const lastMovementAt = histRes.history?.[0]?.createdAt ?? spare.createdAt;
          const ageDays = daysSince(lastMovementAt);

          return {
            SKU: spare.sku,
            Item: spare.name,
            Category: spare.category || "—",
            "Stock Qty": qty,
            "Last Movement": lastMovementAt ? new Date(lastMovementAt).toLocaleString() : "—",
            "Age (days)": ageDays,
            "Aging Bucket": agingBucket(ageDays),
          };
        });

        const rows = (await Promise.all(tasks)).filter((r): r is Record<string, unknown> => Boolean(r));
        rows.sort((a, b) => Number(b["Age (days)"]) - Number(a["Age (days)"]));
        if (!cancelled) setInventoryRows(rows);
      } catch {
        if (!cancelled) setInventoryRows([]);
      } finally {
        if (!cancelled) setInventoryLoading(false);
      }
    }

    if (spares.length > 0) {
      void loadInventoryAging();
    } else {
      setInventoryRows([]);
    }

    return () => {
      cancelled = true;
    };
  }, [spares]);

  const inventoryColumns = useMemo(
    () => ["SKU", "Item", "Category", "Stock Qty", "Last Movement", "Age (days)", "Aging Bucket"],
    [],
  );

  return (
    <ServiceReportPageShell
      reportKey="aging"
      title="Aging report"
      description="Aging view of open SRFs by days and bucket, plus inventory item aging."
    >
      <div className="mt-3">
        {inventoryLoading ? (
          <p className="rounded-lg border border-rlx-rule bg-white px-3 py-4 text-sm text-stone-600">
            Loading inventory aging...
          </p>
        ) : (
          <ReportDataTable
            title="Inventory item aging"
            columns={inventoryColumns}
            rows={inventoryRows}
            emptyMessage="No inventory stock aging rows."
          />
        )}
      </div>
    </ServiceReportPageShell>
  );
}

