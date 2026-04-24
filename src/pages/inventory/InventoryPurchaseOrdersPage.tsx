import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { InventoryBreadcrumb } from "../../components/inventory/InventoryBreadcrumb";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useSpares } from "../../context/SparesContext";
import { ApiError, apiJson } from "../../lib/api";
import { buildPurchaseOrderDocument, openPrintDocument } from "../../lib/inventoryDocuments";
import type { PurchaseOrder } from "../../types/purchaseOrder";
import type { Supplier } from "../../types/supplier";

const inputClass =
  "mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm text-stone-900 outline-none ring-zimson-400/40 focus:ring-2";

function poStatusPillClass(status: string): string {
  if (status === "CLOSED") return "bg-emerald-100 text-emerald-800";
  if (status === "OPEN") return "bg-blue-100 text-blue-800";
  if (status === "PARTIAL") return "bg-amber-100 text-amber-800";
  if (status === "CANCELLED") return "bg-red-100 text-red-800";
  return "bg-stone-100 text-stone-700";
}

function poPrReference(po: PurchaseOrder): string {
  if (po.prNumber) return po.prNumber;
  if (Array.isArray(po.prNumbers) && po.prNumbers.length > 0) return po.prNumbers.join(", ");
  return "—";
}

type PrItem = { id: string; spareId: string; qty: number; issuedQty: number; reason: string };
type PrRow = {
  id: string;
  prNumber: string;
  regionId: string;
  regionName?: string;
  storeId: string;
  storeName?: string;
  status: string;
  items: PrItem[];
};

type PoLineDraft = { prItemId: string; spareId: string; qtyOrdered: string; unitPrice: string };
type ConsolidationRow = {
  prItemId: string;
  prId: string;
  prNumber: string;
  storeId: string;
  storeName?: string;
  regionId: string;
  regionName?: string;
  prStatus: string;
  neededBy: string | null;
  prCreatedAt: string;
  spareId: string;
  spareSku: string;
  spareName: string;
  qty: number;
  issuedQty: number;
  pendingQty: number;
  supplierCandidateCount: number;
  mappedSupplierId: string | null;
  mappedSupplierName: string | null;
  supplierCandidates: Array<{ supplierId: string; supplierName: string }>;
};
type BulkDraft = {
  supplierId: string;
  supplierName: string;
  regionId: string;
  regionName?: string;
  lines: Array<{
    prItemId: string;
    prId: string;
    prNumber: string;
    storeId: string;
    storeName?: string;
    spareId: string;
    qtyOrdered: number;
    unitPrice: number;
  }>;
};

export function InventoryPurchaseOrdersPage() {
  const { user } = useAuth();
  const { spares } = useSpares();
  const isHo =
    user?.role === "regional_admin" ||
    user?.role === "super_admin" ||
    user?.role === "ho_admin" ||
    user?.role === "ho_manager" ||
    user?.role === "ho_user";

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
  const [consolidationRows, setConsolidationRows] = useState<ConsolidationRow[]>([]);
  const [selectedDemand, setSelectedDemand] = useState<Record<string, boolean>>({});
  const [selectedSupplierByItem, setSelectedSupplierByItem] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<BulkDraft[]>([]);
  const [unmapped, setUnmapped] = useState<Array<{ prItemId: string; spareId: string; prNumber: string }>>([]);

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
      if (isHo) {
        const cData = await apiJson<{ rows: ConsolidationRow[] }>("/api/inventory/po-consolidation");
        setConsolidationRows(cData.rows);
      }
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not load data.");
    }
  }, [isHo]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const eligiblePrs = useMemo(
    () => prs.filter((p) => ["SUBMITTED", "APPROVED", "PARTIAL"].includes(p.status)),
    [prs],
  );

  const activeSuppliers = useMemo(() => suppliers.filter((s) => s.isActive), [suppliers]);
  const poStats = useMemo(() => {
    const total = pos.length;
    const open = pos.filter((p) => p.status === "OPEN").length;
    const partial = pos.filter((p) => p.status === "PARTIAL").length;
    const closed = pos.filter((p) => p.status === "CLOSED").length;
    return { total, open, partial, closed };
  }, [pos]);

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
      const supplierName = activeSuppliers.find((s) => s.id === selectedSupplierId)?.name ?? "Supplier";
      const selectedPr = prs.find((p) => p.id === selectedPrId);
      const supplier = activeSuppliers.find((s) => s.id === selectedSupplierId);
      openPrintDocument(
        `PO ${data.poNumber}`,
        buildPurchaseOrderDocument({
          poNumber: data.poNumber,
          poDate: new Date().toISOString(),
          prNumber: selectedPr?.prNumber ?? null,
          supplier: {
            name: supplier?.name ?? supplierName,
            phone: supplier?.phone ?? undefined,
            email: supplier?.email ?? undefined,
            address: supplier?.address ?? undefined,
            gstin: supplier?.gst ?? undefined,
          },
          shipTo: {
            name: `Store ${selectedPr?.storeName ?? selectedPr?.storeId ?? "-"} · Region ${selectedPr?.regionName ?? selectedPr?.regionId ?? "-"}`,
          },
          notes: poNotes.trim(),
          requestedBy: user?.displayName ?? "-",
          requisitioner: user?.displayName ?? "-",
          shippedVia: "Road",
          fobPoint: selectedPr?.storeName ?? selectedPr?.storeId ?? "Store",
          terms: "As per agreed rates and delivery schedule",
          lines: parsed.map((l) => ({
            description: spareLabel.get(l.spareId) ?? l.spareId,
            qty: l.qtyOrdered,
            unit: "Nos",
            unitPrice: l.unitPrice,
          })),
        }),
      );
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

  async function generateDrafts() {
    const selections = consolidationRows
      .filter((r) => selectedDemand[r.prItemId])
      .map((r) => ({
        prItemId: r.prItemId,
        qtyOrdered: r.pendingQty,
        unitPrice: 0,
        supplierId:
          r.supplierCandidateCount <= 1
            ? r.mappedSupplierId ?? undefined
            : selectedSupplierByItem[r.prItemId] || undefined,
      }));
    if (selections.length === 0) {
      setErr("Select at least one demand line.");
      return;
    }
    setErr(null);
    try {
      const data = await apiJson<{
        drafts: BulkDraft[];
        unmapped: Array<{
          prItemId: string;
          spareId: string;
          prNumber: string;
          reason: string;
          supplierCandidates?: Array<{ supplierId: string; supplierName: string }>;
        }>;
      }>("/api/inventory/pos/draft-from-demand", {
        method: "POST",
        json: { selections },
      });
      setDrafts(data.drafts);
      setUnmapped(data.unmapped);
      if (data.unmapped.length > 0) {
        setErr(`Some lines are unmapped to suppliers (${data.unmapped.length}). Map them in Suppliers module.`);
      }
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not generate PO drafts.");
    }
  }

  function updateDraftLine(
    supplierId: string,
    prItemId: string,
    patch: Partial<{ qtyOrdered: number; unitPrice: number }>,
  ) {
    setDrafts((prev) =>
      prev.map((d) =>
        d.supplierId !== supplierId
          ? d
          : {
              ...d,
              lines: d.lines.map((l) => (l.prItemId !== prItemId ? l : { ...l, ...patch })),
            },
      ),
    );
  }

  async function createBulkPos() {
    if (drafts.length === 0) {
      setErr("Generate drafts first.");
      return;
    }
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      const data = await apiJson<{ created: Array<{ poNumber: string }> }>("/api/inventory/pos/bulk-create", {
        method: "POST",
        json: {
          drafts: drafts.map((d) => ({
            supplierId: d.supplierId,
            regionId: d.regionId,
            notes: "Consolidated from multiple PRs",
            lines: d.lines.map((l) => ({
              prItemId: l.prItemId,
              spareId: l.spareId,
              qtyOrdered: l.qtyOrdered,
              unitPrice: l.unitPrice,
            })),
          })),
        },
      });
      setOk(`Created ${data.created.length} PO(s): ${data.created.map((x) => x.poNumber).join(", ")}`);
      setDrafts([]);
      setSelectedDemand({});
      setUnmapped([]);
      await loadAll();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not create bulk POs.");
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

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Total PO" className="py-1">
          <p className="text-2xl font-semibold text-stone-900">{poStats.total}</p>
        </Card>
        <Card title="Open" className="py-1">
          <p className="text-2xl font-semibold text-zimson-800">{poStats.open}</p>
        </Card>
        <Card title="Partial" className="py-1">
          <p className="text-2xl font-semibold text-amber-700">{poStats.partial}</p>
        </Card>
        <Card title="Closed" className="py-1">
          <p className="text-2xl font-semibold text-emerald-700">{poStats.closed}</p>
        </Card>
      </div>

      {!isHo ? (
        <Card className="mb-6" title="Store view">
          <p className="text-sm text-stone-600">
            Purchase orders are created at HO. Below is a read-only list of POs linked to your store&apos;s PRs.
          </p>
        </Card>
      ) : null}

      {isHo ? (
        <Card title="Create PO from one PR (legacy)" subtitle="Single PR flow" className="mb-8">
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
                      {p.prNumber} · {p.status} · store {p.storeName ?? p.storeId}
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

      {isHo ? (
        <Card
          title="Consolidated demand to supplier-wise PO"
          subtitle="Select pending lines from multiple PRs/stores, auto-group by mapped supplier, then create multiple POs"
          className="mb-8"
        >
          <div className="max-h-72 overflow-auto rounded-xl border border-zimson-200/80">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 border-b border-zimson-200 bg-zimson-50/95 text-xs font-semibold uppercase text-stone-600">
                <tr>
                  <th className="px-3 py-2">Pick</th>
                  <th className="px-3 py-2">PR#</th>
                  <th className="px-3 py-2">Store</th>
                  <th className="px-3 py-2">Spare</th>
                  <th className="px-3 py-2">Pending</th>
                  <th className="px-3 py-2">Mapped supplier</th>
                  <th className="px-3 py-2">Choose supplier</th>
                </tr>
              </thead>
              <tbody>
                {consolidationRows.map((r) => (
                  <tr key={r.prItemId} className="border-b border-zimson-100">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedDemand[r.prItemId])}
                        onChange={(e) => setSelectedDemand((prev) => ({ ...prev, [r.prItemId]: e.target.checked }))}
                      />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{r.prNumber}</td>
                    <td className="px-3 py-2">{r.storeName ?? r.storeId}</td>
                    <td className="px-3 py-2">{r.spareName} ({r.spareSku})</td>
                    <td className="px-3 py-2">{r.pendingQty}</td>
                    <td className="px-3 py-2">{r.mappedSupplierName ?? "Unmapped"}</td>
                    <td className="px-3 py-2">
                      {r.supplierCandidateCount > 1 ? (
                        <select
                          className="rounded border px-2 py-1 text-xs"
                          value={selectedSupplierByItem[r.prItemId] ?? ""}
                          onChange={(e) =>
                            setSelectedSupplierByItem((prev) => ({
                              ...prev,
                              [r.prItemId]: e.target.value,
                            }))
                          }
                        >
                          <option value="">Select supplier</option>
                          {r.supplierCandidates.map((c) => (
                            <option key={c.supplierId} value={c.supplierId}>
                              {c.supplierName}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-stone-500">Auto</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3">
            <button
              type="button"
              onClick={() => void generateDrafts()}
              className="rounded-xl bg-zimson-700 px-4 py-2 text-sm font-semibold text-white"
            >
              Generate supplier drafts
            </button>
          </div>

          {unmapped.length > 0 ? (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {unmapped.length} selected lines need mapping/supplier choice. Complete selection or mapping before bulk create.
            </p>
          ) : null}

          {drafts.length > 0 ? (
            <div className="mt-4 space-y-4">
              {drafts.map((d) => (
                <div key={`${d.supplierId}-${d.regionId}`} className="rounded-xl border border-zimson-200/80 p-3">
                  <p className="mb-2 text-sm font-semibold text-stone-900">
                    Supplier: {d.supplierName} · Region: {d.regionName ?? d.regionId}
                  </p>
                  <div className="max-h-56 overflow-auto rounded-xl border border-zimson-200/80">
                    <table className="min-w-full text-left text-sm">
                      <thead className="sticky top-0 border-b border-zimson-200 bg-zimson-50/95 text-xs font-semibold uppercase text-stone-600">
                        <tr>
                          <th className="px-3 py-2">PR#</th>
                          <th className="px-3 py-2">Store</th>
                          <th className="px-3 py-2">Spare</th>
                          <th className="px-3 py-2">Qty</th>
                          <th className="px-3 py-2">Unit price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.lines.map((l) => (
                          <tr key={l.prItemId} className="border-b border-zimson-100">
                            <td className="px-3 py-2 font-mono text-xs">{l.prNumber}</td>
                            <td className="px-3 py-2">{l.storeName ?? l.storeId}</td>
                            <td className="px-3 py-2">{spareLabel.get(l.spareId) ?? l.spareId}</td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min={0.001}
                                step={0.001}
                                className="w-24 rounded border px-2 py-1"
                                value={l.qtyOrdered}
                                onChange={(e) =>
                                  updateDraftLine(d.supplierId, l.prItemId, { qtyOrdered: Math.max(0, Number(e.target.value) || 0) })
                                }
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                className="w-24 rounded border px-2 py-1"
                                value={l.unitPrice}
                                onChange={(e) =>
                                  updateDraftLine(d.supplierId, l.prItemId, { unitPrice: Math.max(0, Number(e.target.value) || 0) })
                                }
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
              <button
                type="button"
                disabled={busy || unmapped.length > 0}
                onClick={() => void createBulkPos()}
                className="rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                Create consolidated POs
              </button>
            </div>
          ) : null}
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
                  <tr key={po.id} className="border-b border-zimson-100 align-top">
                    <td className="px-3 py-2 font-mono text-xs">{po.poNumber}</td>
                    <td className="px-3 py-2 font-mono text-xs">{poPrReference(po)}</td>
                    <td className="px-3 py-2">{po.supplierName}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${poStatusPillClass(po.status)}`}>{po.status}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-stone-700">{po.items.length}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setDetailPoId((x) => (x === po.id ? null : po.id))}
                        className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-xs font-semibold text-stone-700"
                      >
                        Details
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          openPrintDocument(
                            `PO ${po.poNumber}`,
                            buildPurchaseOrderDocument({
                              poNumber: po.poNumber,
                              poDate: po.createdAt,
                              prNumber: po.prNumber ?? null,
                              supplier: {
                                name: suppliers.find((s) => s.id === po.supplierId)?.name ?? po.supplierName,
                                phone: suppliers.find((s) => s.id === po.supplierId)?.phone ?? undefined,
                                email: suppliers.find((s) => s.id === po.supplierId)?.email ?? undefined,
                                address: suppliers.find((s) => s.id === po.supplierId)?.address ?? undefined,
                                gstin: suppliers.find((s) => s.id === po.supplierId)?.gst ?? undefined,
                              },
                              shipTo: { name: `Store ${po.storeName ?? po.storeId ?? "-"} · Region ${po.regionName ?? po.regionId}` },
                              notes: po.notes,
                              requestedBy: user?.displayName ?? "-",
                              requisitioner: user?.displayName ?? "-",
                              shippedVia: "Road",
                              fobPoint: "Destination",
                              terms: "As per agreed rates and delivery schedule",
                              lines: po.items.map((i) => ({
                                description: spareLabel.get(i.spareId) ?? i.spareId,
                                qty: i.qtyOrdered,
                                unit: "Nos",
                                unitPrice: i.unitPrice,
                              })),
                            }),
                          )
                        }
                        className="rounded-lg border border-zimson-300 bg-zimson-50 px-2 py-1 text-xs font-semibold text-zimson-800"
                      >
                        Print
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
                        PR: {poPrReference(po)} · Supplier: {po.supplierName} · Status: {po.status}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          openPrintDocument(
                            `PO ${po.poNumber}`,
                            buildPurchaseOrderDocument({
                              poNumber: po.poNumber,
                              poDate: po.createdAt,
                              prNumber: po.prNumber ?? null,
                              supplier: {
                                name: suppliers.find((s) => s.id === po.supplierId)?.name ?? po.supplierName,
                                phone: suppliers.find((s) => s.id === po.supplierId)?.phone ?? undefined,
                                email: suppliers.find((s) => s.id === po.supplierId)?.email ?? undefined,
                                address: suppliers.find((s) => s.id === po.supplierId)?.address ?? undefined,
                                gstin: suppliers.find((s) => s.id === po.supplierId)?.gst ?? undefined,
                              },
                              shipTo: { name: `Store ${po.storeName ?? po.storeId ?? "-"} · Region ${po.regionName ?? po.regionId}` },
                              notes: po.notes,
                              requestedBy: user?.displayName ?? "-",
                              requisitioner: user?.displayName ?? "-",
                              shippedVia: "Road",
                              fobPoint: "Destination",
                              terms: "As per agreed rates and delivery schedule",
                              lines: po.items.map((i) => ({
                                description: spareLabel.get(i.spareId) ?? i.spareId,
                                qty: i.qtyOrdered,
                                unit: "Nos",
                                unitPrice: i.unitPrice,
                              })),
                            }),
                          )
                        }
                        className="rounded-xl border border-zimson-300 bg-zimson-50 px-3 py-1.5 text-sm font-semibold text-zimson-900"
                      >
                        Print document
                      </button>
                      <button
                        type="button"
                        onClick={() => setDetailPoId(null)}
                        className="rounded-xl border border-stone-300 px-3 py-1.5 text-sm"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                  <div className="grid gap-3 rounded-xl border border-zimson-200/80 bg-zimson-50/40 p-4 sm:grid-cols-2">
                    <p className="text-sm text-stone-700">
                      <span className="font-semibold">Created:</span> {new Date(po.createdAt).toLocaleString()}
                    </p>
                    <p className="text-sm text-stone-700">
                      <span className="font-semibold">Region:</span> {po.regionName ?? po.regionId}
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
