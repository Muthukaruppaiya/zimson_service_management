import { useState } from "react";
import { Link } from "react-router-dom";
import { InventoryBreadcrumb } from "../../components/inventory/InventoryBreadcrumb";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { ApiError, apiJson } from "../../lib/api";

type SuggestRow = {
  prId: string;
  prNumber: string;
  prItemId: string;
  spareId: string;
  spareSku: string;
  spareName: string;
  storeId: string;
  pendingQty: number;
  suggestedQty: number;
  hoAvailableAtStart: number;
};

export function InventoryAllocationReviewPage() {
  const { user } = useAuth();
  const isHo = user?.role === "super_admin" || user?.role === "admin";
  const [regionId, setRegionId] = useState(user?.regionId ?? "");
  const [rows, setRows] = useState<SuggestRow[]>([]);
  const [finalQty, setFinalQty] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function suggest() {
    setErr(null);
    setOk(null);
    try {
      const data = await apiJson<{ suggestions: SuggestRow[] }>("/api/inventory/allocations/suggest", {
        method: "POST",
        json: { regionId },
      });
      setRows(data.suggestions);
      const next: Record<string, string> = {};
      for (const r of data.suggestions) next[r.prItemId] = String(r.suggestedQty);
      setFinalQty(next);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not generate suggestions.");
    }
  }

  async function confirmAllocation() {
    setErr(null);
    setOk(null);
    setBusy(true);
    try {
      const payload = rows.map((r) => ({
        prItemId: r.prItemId,
        suggestedQty: r.suggestedQty,
        finalQty: Number(finalQty[r.prItemId] ?? "0"),
      }));
      const data = await apiJson<{ batchNumber: string; movedQty: number }>("/api/inventory/allocations/confirm", {
        method: "POST",
        json: { regionId, rows: payload },
      });
      setOk(`Allocation confirmed: ${data.batchNumber}. Issued qty: ${data.movedQty}.`);
      await suggest();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not confirm allocation.");
    } finally {
      setBusy(false);
    }
  }

  if (!isHo) {
    return (
      <Card title="Access">
        <p className="text-sm text-stone-600">Only HO admins can run allocation review.</p>
      </Card>
    );
  }

  return (
    <div>
      <InventoryBreadcrumb current="Allocation review" />
      <PageHeader
        title="Allocation review (HO -> stores)"
        description="Auto-suggest transfer quantities from HO stock against pending PR lines, then edit and confirm."
        actions={
          <Link
            to="/inventory"
            className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
          >
            Inventory home
          </Link>
        }
      />

      {err ? <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p> : null}
      {ok ? <p className="mb-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{ok}</p> : null}

      <Card title="Generate suggestions" subtitle="Priority: needed by date, then PR created date">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs font-medium text-stone-600">Region ID</label>
            <input
              className="mt-1 w-64 rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm text-stone-900 outline-none ring-zimson-400/40 focus:ring-2"
              value={regionId}
              onChange={(e) => setRegionId(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={() => void suggest()}
            className="rounded-xl bg-zimson-700 px-4 py-2.5 text-sm font-semibold text-white"
          >
            Auto suggest
          </button>
        </div>
      </Card>

      {rows.length > 0 ? (
        <Card title="Review and confirm" subtitle="Edit suggested qty where needed, then confirm">
          <div className="max-h-[560px] overflow-auto rounded-xl border border-zimson-200/80">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 border-b border-zimson-200 bg-zimson-50/95 text-xs font-semibold uppercase text-stone-600">
                <tr>
                  <th className="px-3 py-2">PR#</th>
                  <th className="px-3 py-2">Store</th>
                  <th className="px-3 py-2">Spare</th>
                  <th className="px-3 py-2">HO available</th>
                  <th className="px-3 py-2">Pending</th>
                  <th className="px-3 py-2">Suggested</th>
                  <th className="px-3 py-2">Final qty</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.prItemId} className="border-b border-zimson-100">
                    <td className="px-3 py-2 font-mono text-xs">{r.prNumber}</td>
                    <td className="px-3 py-2">{r.storeId}</td>
                    <td className="px-3 py-2">{r.spareName} ({r.spareSku})</td>
                    <td className="px-3 py-2">{r.hoAvailableAtStart}</td>
                    <td className="px-3 py-2">{r.pendingQty}</td>
                    <td className="px-3 py-2">{r.suggestedQty}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        max={r.pendingQty}
                        step={0.001}
                        className="w-24 rounded border px-2 py-1"
                        value={finalQty[r.prItemId] ?? "0"}
                        onChange={(e) => setFinalQty((prev) => ({ ...prev, [r.prItemId]: e.target.value }))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void confirmAllocation()}
            className="mt-4 rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Confirm transfers
          </button>
        </Card>
      ) : null}
    </div>
  );
}
