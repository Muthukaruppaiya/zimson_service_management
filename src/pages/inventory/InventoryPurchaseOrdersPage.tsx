import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { InventoryBreadcrumb } from "../../components/inventory/InventoryBreadcrumb";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useSpares } from "../../context/SparesContext";
import { ApiError, apiJson } from "../../lib/api";
import type { PurchaseOrder } from "../../types/purchaseOrder";
import type { Supplier } from "../../types/supplier";

const inputClass =
  "mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm text-stone-900 outline-none ring-zimson-400/40 focus:ring-2";

type PrItem = { id: string; spareId: string; qty: number; issuedQty: number; reason: string };
type PrRow = {
  id: string;
  prNumber: string;
  regionId: string;
  storeId: string;
  status: string;
  items: PrItem[];
};

type PoLineDraft = { prItemId: string; spareId: string; qtyOrdered: string; unitPrice: string };

export function InventoryPurchaseOrdersPage() {
  const { user } = useAuth();
  const { spares } = useSpares();
  const isHo = user?.role === "regional_admin" || user?.role === "super_admin";

  const [prs, setPrs] = useState<PrRow[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [selectedPrId, setSelectedPrId] = useState("");
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [poNotes, setPoNotes] = useState("");
  const [lines, setLines] = useState<PoLineDraft[]>([]);
  const [detailPoId, setDetailPoId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const spareLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of spares) m.set(s.id, `${s.name} (${s.sku})`);
    return m;
  }, [spares]);

  const loadAll = useCallback(async () => {
    try {
      const [prData, supData, poData] = await Promise.all([
        apiJson<{ prs: PrRow[] }>("/api/inventory/prs"),
        apiJson<{ suppliers: Supplier[] }>("/api/inventory/suppliers"),
        apiJson<{ pos: PurchaseOrder[] }>("/api/inventory/pos"),
      ]);
      setPrs(prData.prs);
      setSuppliers(supData.suppliers);
      setPos(poData.pos);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not load data.");
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const eligiblePrs = useMemo(
    () => prs.filter((p) => ["SUBMITTED", "APPROVED", "PARTIAL"].includes(p.status)),
    [prs],
  );

  const activeSuppliers = useMemo(() => suppliers.filter((s) => s.isActive), [suppliers]);

  useEffect(() => {
    if (!selectedPrId) {
      setLines([]);
      return;
    }
    const pr = prs.find((p) => p.id === selectedPrId);
    if (!pr) {
      setLines([]);
      return;
    }
    setLines(
      pr.items.map((it) => {
        const remaining = Math.max(0, it.qty - it.issuedQty);
        return {
          prItemId: it.id,
          spareId: it.spareId,
          qtyOrdered: String(remaining > 0 ? remaining : it.qty),
          unitPrice: "0",
        };
      }),
    );
  }, [selectedPrId, prs]);

  function updateLine(idx: number, patch: Partial<PoLineDraft>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  async function createPo(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(null);
    if (!selectedPrId || !selectedSupplierId) {
      setErr("Select a PR and a supplier.");
      return;
    }
    const parsed = lines
      .map((l) => ({
        prItemId: l.prItemId,
        spareId: l.spareId,
        qtyOrdered: Number(l.qtyOrdered),
        unitPrice: Number(l.unitPrice),
      }))
      .filter((l) => l.qtyOrdered > 0);
    if (parsed.length === 0) {
      setErr("At least one line must have quantity greater than 0.");
      return;
    }
    if (parsed.some((l) => Number.isNaN(l.qtyOrdered) || Number.isNaN(l.unitPrice) || l.unitPrice < 0)) {
      setErr("Check quantities and unit prices.");
      return;
    }
    setBusy(true);
    try {
      const data = await apiJson<{ poNumber: string }>("/api/inventory/pos", {
        method: "POST",
        json: {
          prId: selectedPrId,
          supplierId: selectedSupplierId,
          notes: poNotes.trim(),
          items: parsed,
        },
      });
      setOk(`Created ${data.poNumber}.`);
      setSelectedPrId("");
      setSelectedSupplierId("");
      setPoNotes("");
      setLines([]);
      await loadAll();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not create PO.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <InventoryBreadcrumb current="Purchase orders" />
      <PageHeader
        title="Purchase orders (PO)"
        description="HO creates PO from a purchase request, chooses supplier, and confirms line quantities and rates for GRN matching."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              to="/inventory/suppliers"
              className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
            >
              Suppliers
            </Link>
            <Link
              to="/inventory"
              className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
            >
              Inventory home
            </Link>
          </div>
        }
      />

      {err ? <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p> : null}
      {ok ? <p className="mb-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{ok}</p> : null}

      {!isHo ? (
        <Card className="mb-6" title="Store view">
          <p className="text-sm text-stone-600">
            Purchase orders are created at HO. Below is a read-only list of POs linked to your store&apos;s PRs.
          </p>
        </Card>
      ) : null}

      {isHo ? (
        <Card title="Create PO from PR" subtitle="Map lines to supplier; default qty is PR remaining (qty − issued)" className="mb-8">
          <form onSubmit={createPo} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-stone-600">Purchase request *</label>
                <select
                  className={inputClass}
                  value={selectedPrId}
                  onChange={(e) => setSelectedPrId(e.target.value)}
                >
                  <option value="">Select PR…</option>
                  {eligiblePrs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.prNumber} · {p.status} · store {p.storeId}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-stone-600">Supplier *</label>
                <select
                  className={inputClass}
                  value={selectedSupplierId}
                  onChange={(e) => setSelectedSupplierId(e.target.value)}
                >
                  <option value="">Select supplier…</option>
                  {activeSuppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-stone-600">PO notes</label>
              <input className={inputClass} value={poNotes} onChange={(e) => setPoNotes(e.target.value)} placeholder="Optional" />
            </div>
            {lines.length > 0 ? (
              <div className="max-h-64 overflow-auto rounded-xl border border-zimson-200/80">
                <table className="min-w-full text-left text-sm">
                  <thead className="sticky top-0 bg-zimson-50/95 text-xs font-semibold uppercase text-stone-600">
                    <tr>
                      <th className="px-3 py-2">Spare</th>
                      <th className="px-3 py-2">Qty</th>
                      <th className="px-3 py-2">Unit price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, idx) => (
                      <tr key={l.prItemId} className="border-b border-zimson-100">
                        <td className="px-3 py-2">{spareLabel.get(l.spareId) ?? l.spareId}</td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0.001}
                            step={0.001}
                            className="w-28 rounded border px-2 py-1 text-sm"
                            value={l.qtyOrdered}
                            onChange={(e) => updateLine(idx, { qtyOrdered: e.target.value })}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            className="w-28 rounded border px-2 py-1 text-sm"
                            value={l.unitPrice}
                            onChange={(e) => updateLine(idx, { unitPrice: e.target.value })}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : selectedPrId ? (
              <p className="text-sm text-stone-500">This PR has no lines.</p>
            ) : null}
            <button
              type="submit"
              disabled={busy || !selectedPrId || lines.length === 0}
              className="rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              Create PO
            </button>
          </form>
        </Card>
      ) : null}

      <Card title="Purchase orders" subtitle="Linked PR and supplier">
        <div className="max-h-[480px] overflow-auto rounded-xl border border-zimson-200/80">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 border-b border-zimson-200 bg-zimson-50/95 text-xs font-semibold uppercase text-stone-600">
              <tr>
                <th className="px-3 py-2">PO#</th>
                <th className="px-3 py-2">PR#</th>
                <th className="px-3 py-2">Supplier</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Lines</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {pos.map((po) => (
                  <tr className="border-b border-zimson-100 align-top">
                    <td className="px-3 py-2 font-mono text-xs">{po.poNumber}</td>
                    <td className="px-3 py-2 font-mono text-xs">{po.prNumber ?? "—"}</td>
                    <td className="px-3 py-2">{po.supplierName}</td>
                    <td className="px-3 py-2">{po.status}</td>
                    <td className="px-3 py-2 text-xs text-stone-700">{po.items.length}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setDetailPoId((x) => (x === po.id ? null : po.id))}
                        className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-xs font-semibold text-stone-700"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                  
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {detailPoId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white p-6 shadow-xl">
            {(() => {
              const po = pos.find((p) => p.id === detailPoId);
              if (!po) {
                return (
                  <div>
                    <p className="text-sm text-stone-600">PO details not found.</p>
                    <button
                      type="button"
                      onClick={() => setDetailPoId(null)}
                      className="mt-4 rounded-xl border border-stone-300 px-4 py-2 text-sm"
                    >
                      Close
                    </button>
                  </div>
                );
              }
              return (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold text-stone-900">PO details — {po.poNumber}</h3>
                      <p className="text-sm text-stone-600">
                        PR: {po.prNumber ?? "-"} · Supplier: {po.supplierName} · Status: {po.status}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDetailPoId(null)}
                      className="rounded-xl border border-stone-300 px-3 py-1.5 text-sm"
                    >
                      Close
                    </button>
                  </div>
                  <div className="grid gap-3 rounded-xl border border-zimson-200/80 bg-zimson-50/40 p-4 sm:grid-cols-2">
                    <p className="text-sm text-stone-700">
                      <span className="font-semibold">Created:</span> {new Date(po.createdAt).toLocaleString()}
                    </p>
                    <p className="text-sm text-stone-700">
                      <span className="font-semibold">Region:</span> {po.regionId}
                    </p>
                    <p className="text-sm text-stone-700 sm:col-span-2">
                      <span className="font-semibold">Notes:</span> {po.notes || "-"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-zimson-200/80">
                    <table className="min-w-full text-left text-sm">
                      <thead className="border-b border-zimson-200 bg-zimson-50/95 text-xs font-semibold uppercase text-stone-600">
                        <tr>
                          <th className="px-3 py-2">Spare</th>
                          <th className="px-3 py-2">Ordered</th>
                          <th className="px-3 py-2">Received</th>
                          <th className="px-3 py-2">Pending</th>
                          <th className="px-3 py-2">Unit price</th>
                          <th className="px-3 py-2">Line total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {po.items.map((i) => (
                          <tr key={i.id} className="border-b border-zimson-100">
                            <td className="px-3 py-2">{spareLabel.get(i.spareId) ?? i.spareId}</td>
                            <td className="px-3 py-2">{i.qtyOrdered}</td>
                            <td className="px-3 py-2">{i.receivedQty}</td>
                            <td className="px-3 py-2">{Math.max(0, i.qtyOrdered - i.receivedQty)}</td>
                            <td className="px-3 py-2">
                              {i.unitPrice.toLocaleString(undefined, { style: "currency", currency: "INR" })}
                            </td>
                            <td className="px-3 py-2">
                              {(i.qtyOrdered * i.unitPrice).toLocaleString(undefined, { style: "currency", currency: "INR" })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      ) : null}
    </div>
  );
}
