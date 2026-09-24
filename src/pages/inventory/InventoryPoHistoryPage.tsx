import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { InventoryBreadcrumb } from "../../components/inventory/InventoryBreadcrumb";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useSpares } from "../../context/SparesContext";
import { ApiError, apiJson } from "../../lib/api";
import { buildPurchaseOrderDocument, openPrintDocument } from "../../lib/inventoryDocuments";
import { ENABLE_PR_FLOW } from "../../lib/inventoryFeatureFlags";
import type { PurchaseOrder } from "../../types/purchaseOrder";
import type { Supplier } from "../../types/supplier";

// ── Helpers ───────────────────────────────────────────────────────────────────

const PO_STATUS_LABEL: Record<string, string> = {
  OPEN:      "Open",
  PARTIAL:   "Partially Received",
  CLOSED:    "Closed",
  CANCELLED: "Cancelled",
};

const PO_STATUS_COLOR: Record<string, string> = {
  OPEN:      "border-blue-300 bg-blue-50 text-blue-700",
  PARTIAL:   "border-amber-300 bg-amber-50 text-amber-700",
  CLOSED:    "border-rlx-green bg-rlx-green/10 text-rlx-green",
  CANCELLED: "border-red-300 bg-red-50 text-red-700",
};

function statusBadge(status: string) {
  return `inline-block border px-2.5 py-0.5 text-[10px] font-bold tracking-wide ${PO_STATUS_COLOR[status] ?? "border-stone-300 bg-stone-50 text-stone-500"}`;
}

function poPendingQty(po: PurchaseOrder): number {
  return po.items.reduce((n, i) => n + Math.max(0, i.qtyOrdered - i.receivedQty), 0);
}

function canAmendPo(po: PurchaseOrder): boolean {
  return (po.status === "OPEN" || po.status === "PARTIAL") && poPendingQty(po) > 0;
}

function poPrReference(po: PurchaseOrder): string {
  if (po.prNumber) return po.prNumber;
  if (Array.isArray(po.prNumbers) && po.prNumbers.length > 0) return po.prNumbers.join(", ");
  return "—";
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function InventoryPoHistoryPage() {
  const { user } = useAuth();
  const { spares } = useSpares();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const isHo =
    user?.role === "admin" || user?.role === "super_admin" ||
    user?.role === "ho_manager" || user?.role === "ho_purchase";

  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [detailPoId, setDetailPoId] = useState<string | null>(null);
  const [amendPoId, setAmendPoId] = useState<string | null>(null);
  const [amendQty, setAmendQty] = useState<Record<string, string>>({});
  const [amendNotes, setAmendNotes] = useState("");
  const [amendBusy, setAmendBusy] = useState(false);
  const [amendErr, setAmendErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const spareLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of spares) m.set(s.id, `${s.name} (${s.sku})`);
    return m;
  }, [spares]);

  async function loadAll() {
    setLoading(true);
    try {
      const [poData, supData] = await Promise.all([
        apiJson<{ pos: PurchaseOrder[] }>("/api/inventory/pos"),
        apiJson<{ suppliers: Supplier[] }>("/api/inventory/suppliers"),
      ]);
      setPos(poData.pos);
      setSuppliers(supData.suppliers);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not load POs.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void loadAll(); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return pos.filter((po) => {
      if (statusFilter !== "ALL" && po.status !== statusFilter) return false;
      if (!q) return true;
      return (
        po.poNumber.toLowerCase().includes(q) ||
        (po.supplierName ?? "").toLowerCase().includes(q) ||
        poPrReference(po).toLowerCase().includes(q) ||
        (po.storeName ?? "").toLowerCase().includes(q)
      );
    });
  }, [pos, search, statusFilter]);

  const poStats = useMemo(() => ({
    total: pos.length,
    open: pos.filter((p) => p.status === "OPEN").length,
    partial: pos.filter((p) => p.status === "PARTIAL").length,
    closed: pos.filter((p) => p.status === "CLOSED").length,
  }), [pos]);

  const statuses = ["ALL", "OPEN", "PARTIAL", "CLOSED", "CANCELLED"];

  function startAmend(po: PurchaseOrder) {
    const next: Record<string, string> = {};
    for (const i of po.items) next[i.id] = String(i.receivedQty);
    setAmendQty(next);
    setAmendNotes("");
    setAmendErr(null);
    setDetailPoId(null);
    setAmendPoId(po.id);
  }

  useEffect(() => {
    const id = searchParams.get("amend");
    if (!id || loading) return;
    const po = pos.find((p) => p.id === id);
    if (po && canAmendPo(po)) startAmend(po);
    if (searchParams.has("amend")) {
      const next = new URLSearchParams(searchParams);
      next.delete("amend");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open once from query after list loads
  }, [loading, pos]);

  async function submitAmend() {
    const po = pos.find((p) => p.id === amendPoId);
    if (!po) return;
    setAmendErr(null);
    const items = po.items.map((i) => {
      const qty = Number(amendQty[i.id] ?? i.receivedQty);
      return { poItemId: i.id, qtyOrdered: Number.isFinite(qty) ? qty : i.receivedQty };
    });
    for (const i of po.items) {
      const next = items.find((x) => x.poItemId === i.id)!.qtyOrdered;
      if (next < i.receivedQty) {
        setAmendErr(`Cannot reduce a line below received qty (${i.receivedQty}).`);
        return;
      }
      if (next > i.qtyOrdered) {
        setAmendErr("Amendment can only reduce ordered qty, not increase it.");
        return;
      }
    }
    setAmendBusy(true);
    try {
      const data = await apiJson<{ poNumber: string; status: string; droppedLines: number }>(
        `/api/inventory/pos/${po.id}/amend`,
        { method: "PATCH", json: { items, notes: amendNotes.trim() } },
      );
      setAmendPoId(null);
      setOkMsg(
        data.status === "CLOSED"
          ? `${data.poNumber} amended and closed. Remaining unreceived qty was removed.`
          : data.status === "CANCELLED"
            ? `${data.poNumber} cancelled — no received lines remained.`
            : `${data.poNumber} amended. Status is now ${PO_STATUS_LABEL[data.status] ?? data.status}.`,
      );
      await loadAll();
    } catch (e) {
      setAmendErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setAmendBusy(false);
    }
  }

  function printPo(po: PurchaseOrder) {
    const supplier = suppliers.find((s) => s.id === po.supplierId);
    openPrintDocument(`PO ${po.poNumber}`, buildPurchaseOrderDocument({
      poNumber: po.poNumber, poDate: po.createdAt,
      prNumber: po.prNumber ?? null,
      supplier: {
        name: supplier?.name ?? po.supplierName, phone: supplier?.phone ?? undefined,
        email: supplier?.email ?? undefined, address: supplier?.address ?? undefined, gstin: supplier?.gst ?? undefined,
      },
      shipTo: { name: `Store ${po.storeName ?? po.storeId ?? "-"} · Region ${po.regionName ?? po.regionId}` },
      notes: po.notes, requestedBy: user?.displayName ?? "-", requisitioner: user?.displayName ?? "-",
      shippedVia: "Road", fobPoint: "Destination", terms: "As per agreed rates and delivery schedule",
      lines: po.items.map((i) => ({
        description: [
          i.productName || spareLabel.get(i.spareId) || i.spareId,
          i.partCode,
          i.brand,
          i.hsn ? `HSN ${i.hsn}` : null,
        ].filter(Boolean).join(" · "),
        qty: i.qtyOrdered, unit: i.uom || "Nos", unitPrice: i.unitPrice,
      })),
    }));
  }

  return (
    <div>
      <InventoryBreadcrumb current="PO History" />
      <PageHeader
        title="Purchase Order History"
        description="All purchase orders raised by HO. After a partial GRN, amend remaining qty to close the PO without inwarding leftover parts."
        actions={
          <div className="flex gap-2">
            {isHo && (
              <Link to="/inventory/purchase-orders" className="bg-rlx-green px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white hover:bg-rlx-green/90 transition">
                + New PO
              </Link>
            )}
            <button type="button" onClick={() => navigate(-1)} className="border border-rlx-rule bg-white px-4 py-2 text-xs font-semibold uppercase tracking-widest text-stone-600 hover:bg-stone-50 transition">
              ← Back
            </button>
          </div>
        }
      />

      {err && <div className="mb-4 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">✕ {err}</div>}
      {okMsg && (
        <div className="mb-4 flex items-start justify-between gap-3 border border-rlx-green/30 bg-rlx-green/10 px-4 py-3 text-sm text-rlx-green">
          <span>✓ {okMsg}</span>
          <button type="button" onClick={() => setOkMsg(null)} className="text-rlx-green/70 hover:text-rlx-green">✕</button>
        </div>
      )}

      {/* Stat summary */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total PO", value: poStats.total, color: "text-stone-800" },
          { label: "Open", value: poStats.open, color: "text-blue-700" },
          { label: "Partial", value: poStats.partial, color: "text-amber-700" },
          { label: "Closed", value: poStats.closed, color: "text-rlx-green" },
        ].map((s) => (
          <div key={s.label} className="border border-rlx-rule bg-white shadow-sm">
            <div className="border-b border-rlx-rule bg-rlx-green px-4 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white">{s.label}</p>
            </div>
            <div className="px-4 py-3">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400">
            <circle cx="6.5" cy="6.5" r="4.5" /><line x1="10" y1="10" x2="14" y2="14" />
          </svg>
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={ENABLE_PR_FLOW ? "Search PO#, PR#, supplier or store…" : "Search PO#, supplier or store…"}
            className="w-full border border-rlx-rule bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-rlx-green"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {statuses.map((s) => (
            <button
              key={s} type="button" onClick={() => setStatusFilter(s)}
              className={`border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide transition ${
                statusFilter === s ? "border-rlx-green bg-rlx-green text-white" : "border-rlx-rule bg-white text-stone-500 hover:border-rlx-green/50"
              }`}
            >
              {s === "ALL" ? "All" : (PO_STATUS_LABEL[s] ?? s)}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => void loadAll()} className="border border-rlx-rule px-3 py-2 text-xs font-semibold text-stone-500 hover:bg-stone-50 transition" title="Refresh">↻</button>
      </div>

      {/* Table */}
      <div className="border border-rlx-rule bg-white shadow-sm">
        <div className="border-b border-rlx-rule bg-rlx-green px-5 py-3.5 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-white">Purchase Orders</h3>
          <span className="border border-white/30 px-2 py-0.5 text-[10px] font-bold text-white/70">{filtered.length}</span>
        </div>

        {loading ? (
          <div className="px-5 py-10 text-center text-sm text-stone-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-stone-400">No purchase orders found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-rlx-rule bg-stone-50 text-[10px] font-bold uppercase tracking-widest text-stone-400">
                  <th className="px-5 py-3 text-left">PO#</th>
                  {ENABLE_PR_FLOW ? <th className="px-5 py-3 text-left">PR#</th> : null}
                  <th className="px-5 py-3 text-left">Supplier name</th>
                  {isHo && <th className="px-5 py-3 text-left">Store</th>}
                  <th className="px-5 py-3 text-left">Status</th>
                  <th className="px-5 py-3 text-center">Lines</th>
                  <th className="px-5 py-3 text-left">Created</th>
                  <th className="px-5 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((po) => (
                  <tr key={po.id} className="border-b border-rlx-rule last:border-0 hover:bg-stone-50/50 transition">
                    <td className="px-5 py-3 font-mono text-xs font-bold text-rlx-green">{po.poNumber}</td>
                    {ENABLE_PR_FLOW ? (
                      <td className="px-5 py-3 font-mono text-xs text-stone-500">{poPrReference(po)}</td>
                    ) : null}
                    <td className="px-5 py-3 font-medium text-stone-800">{po.supplierName}</td>
                    {isHo && (
                      <td className="px-5 py-3">
                        <p className="text-stone-700">{po.storeName ?? po.storeId ?? "—"}</p>
                        <p className="text-[11px] text-stone-400">{po.regionName ?? po.regionId}</p>
                      </td>
                    )}
                    <td className="px-5 py-3">
                      <span className={statusBadge(po.status)}>{PO_STATUS_LABEL[po.status] ?? po.status}</span>
                    </td>
                    <td className="px-5 py-3 text-center text-xs text-stone-600">{po.items.length}</td>
                    <td className="px-5 py-3 text-xs text-stone-500">
                      {new Date(po.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setDetailPoId((x) => (x === po.id ? null : po.id))}
                          className="border border-rlx-rule px-2.5 py-1 text-[11px] font-semibold text-stone-600 hover:bg-stone-50 transition"
                        >Details</button>
                        {isHo && canAmendPo(po) && (
                          <button
                            type="button"
                            onClick={() => startAmend(po)}
                            className="border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100 transition"
                          >Amend</button>
                        )}
                        <button
                          type="button"
                          onClick={() => printPo(po)}
                          className="border border-rlx-rule px-2.5 py-1 text-[11px] font-semibold text-stone-600 hover:bg-stone-50 transition"
                        >Print</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {detailPoId && (() => {
        const po = pos.find((p) => p.id === detailPoId);
        if (!po) return null;
        const totalValue = po.items.reduce((sum, i) => {
          const tax = (i.cgstAmount ?? 0) + (i.sgstAmount ?? 0) + (i.igstAmount ?? 0);
          return sum + i.qtyOrdered * i.unitPrice + tax;
        }, 0);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }}
            onMouseDown={(e) => { if (e.target === e.currentTarget) setDetailPoId(null); }}
          >
            <div className="w-full max-w-5xl bg-white shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
              {/* Header */}
              <div className="bg-rlx-green px-6 py-4 shrink-0 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wide text-white">{po.poNumber}</h3>
                  <p className="text-[11px] text-white/60 mt-0.5">
                    {ENABLE_PR_FLOW ? `PR: ${poPrReference(po)} · ` : ""}Supplier name: {po.supplierName}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => printPo(po)} className="border border-white/30 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-white/10 transition">Print</button>
                  <button type="button" onClick={() => setDetailPoId(null)} className="text-white/70 hover:text-white text-xl leading-none">×</button>
                </div>
              </div>
              {/* Meta */}
              <div className="grid grid-cols-2 gap-4 border-b border-rlx-rule px-6 py-4 text-sm shrink-0 sm:grid-cols-4">
                <div>
                  <span className="text-[11px] font-bold uppercase text-stone-400">Status</span>
                  <p className="mt-1"><span className={statusBadge(po.status)}>{PO_STATUS_LABEL[po.status] ?? po.status}</span></p>
                </div>
                <div>
                  <span className="text-[11px] font-bold uppercase text-stone-400">Created</span>
                  <p className="mt-1 text-stone-700">{new Date(po.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
                </div>
                <div>
                  <span className="text-[11px] font-bold uppercase text-stone-400">Store</span>
                  <p className="mt-1 text-stone-700">{po.storeName ?? po.storeId ?? "—"}</p>
                </div>
                <div>
                  <span className="text-[11px] font-bold uppercase text-stone-400">Remark</span>
                  <p className="mt-1 text-stone-700 truncate">{po.notes || "—"}</p>
                </div>
              </div>
              {/* Line items */}
              <div className="overflow-auto flex-1">
                <table className="w-full min-w-[860px] text-sm">
                  <thead>
                    <tr className="border-b border-rlx-rule bg-stone-50 text-[10px] font-bold uppercase tracking-widest text-stone-400">
                      <th className="px-6 py-3 text-left">Spare</th>
                      <th className="px-4 py-3 text-center">UOM</th>
                      <th className="px-4 py-3 text-center">Ordered</th>
                      <th className="px-4 py-3 text-center">Received</th>
                      <th className="px-4 py-3 text-center">Pending</th>
                      <th className="px-4 py-3 text-right">Purchase</th>
                      <th className="px-4 py-3 text-right">MRP</th>
                      <th className="px-4 py-3 text-right">Tax</th>
                      <th className="px-4 py-3 text-right">Final</th>
                    </tr>
                  </thead>
                  <tbody>
                    {po.items.map((i) => {
                      const tax = (i.cgstAmount ?? 0) + (i.sgstAmount ?? 0) + (i.igstAmount ?? 0);
                      const final = i.qtyOrdered * i.unitPrice + tax;
                      return (
                        <tr key={i.id} className="border-b border-rlx-rule last:border-0">
                          <td className="px-6 py-3">
                            <p className="font-medium text-stone-800">{i.productName || spareLabel.get(i.spareId) || i.spareId}</p>
                            <p className="text-[11px] text-stone-400">
                              {[i.partCode, i.brand, i.hsn ? `HSN ${i.hsn}` : null].filter(Boolean).join(" · ") || "—"}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-center text-stone-600">{i.uom || "Nos"}</td>
                          <td className="px-4 py-3 text-center">{i.qtyOrdered}</td>
                          <td className="px-4 py-3 text-center">{i.receivedQty}</td>
                          <td className="px-4 py-3 text-center font-semibold text-amber-700">{Math.max(0, i.qtyOrdered - i.receivedQty)}</td>
                          <td className="px-4 py-3 text-right text-stone-600">₹{i.unitPrice.toLocaleString("en-IN")}</td>
                          <td className="px-4 py-3 text-right text-stone-600">₹{(i.mrp ?? 0).toLocaleString("en-IN")}</td>
                          <td className="px-4 py-3 text-right text-stone-600">₹{tax.toLocaleString("en-IN")}</td>
                          <td className="px-4 py-3 text-right font-semibold text-stone-800">₹{final.toLocaleString("en-IN")}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-rlx-rule bg-stone-50">
                      <td colSpan={8} className="px-6 py-3 text-right text-xs font-bold uppercase tracking-widest text-stone-500">Total Order Value</td>
                      <td className="px-4 py-3 text-right text-base font-bold text-rlx-green">₹{totalValue.toLocaleString("en-IN")}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {/* Footer */}
              <div className="shrink-0 border-t border-rlx-rule bg-rlx-bg px-6 py-4 flex flex-wrap gap-2">
                {isHo && canAmendPo(po) && (
                  <button
                    type="button"
                    onClick={() => startAmend(po)}
                    className="bg-rlx-green px-5 py-2 text-sm font-semibold text-white hover:bg-rlx-green/90 transition"
                  >
                    Amend remaining
                  </button>
                )}
                <button type="button" onClick={() => setDetailPoId(null)} className="border border-rlx-rule px-5 py-2 text-sm text-stone-600 hover:bg-stone-50 transition">Close</button>
              </div>
            </div>
          </div>
        );
      })()}

      {amendPoId && (() => {
        const po = pos.find((p) => p.id === amendPoId);
        if (!po) return null;
        const willClose = po.items.every((i) => {
          const next = Number(amendQty[i.id] ?? i.receivedQty);
          return !Number.isFinite(next) || next <= i.receivedQty;
        });
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }}
            onMouseDown={(e) => { if (e.target === e.currentTarget && !amendBusy) setAmendPoId(null); }}
          >
            <div className="w-full max-w-4xl bg-white shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
              <div className="bg-rlx-green px-6 py-4 shrink-0 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wide text-white">Amend PO · {po.poNumber}</h3>
                  <p className="text-[11px] text-white/60 mt-0.5">
                    Reduce ordered qty to what was received. Unreceived lines are dropped. The PO then closes and will not stay pending for GRN.
                  </p>
                </div>
                <button type="button" onClick={() => { if (!amendBusy) setAmendPoId(null); }} className="text-white/70 hover:text-white text-xl leading-none">×</button>
              </div>
              {amendErr && <div className="border-b border-red-200 bg-red-50 px-6 py-2.5 text-sm text-red-800">✕ {amendErr}</div>}
              <div className="overflow-auto flex-1">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-rlx-rule bg-stone-50 text-[10px] font-bold uppercase tracking-widest text-stone-400">
                      <th className="px-5 py-3 text-left">Spare</th>
                      <th className="px-4 py-3 text-center">Ordered</th>
                      <th className="px-4 py-3 text-center">Received</th>
                      <th className="px-4 py-3 text-center">Pending</th>
                      <th className="px-4 py-3 text-center">New ordered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {po.items.map((i) => {
                      const pending = Math.max(0, i.qtyOrdered - i.receivedQty);
                      const next = Number(amendQty[i.id] ?? i.receivedQty);
                      const drop = i.receivedQty === 0 && next === 0;
                      return (
                        <tr key={i.id} className="border-b border-rlx-rule last:border-0">
                          <td className="px-5 py-3">
                            <p className="font-medium text-stone-800">{i.productName || spareLabel.get(i.spareId) || i.spareId}</p>
                            <p className="text-[11px] text-stone-400">
                              {[i.partCode, i.brand].filter(Boolean).join(" · ") || "—"}
                              {drop ? " · will be dropped" : ""}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-center text-stone-600">{i.qtyOrdered}</td>
                          <td className="px-4 py-3 text-center text-stone-700">{i.receivedQty}</td>
                          <td className="px-4 py-3 text-center font-semibold text-amber-700">{pending}</td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="number"
                              min={i.receivedQty}
                              max={i.qtyOrdered}
                              step="1"
                              value={amendQty[i.id] ?? String(i.receivedQty)}
                              onChange={(e) => setAmendQty((m) => ({ ...m, [i.id]: e.target.value }))}
                              className="mx-auto w-24 border border-rlx-rule bg-white px-2 py-1.5 text-center text-sm outline-none focus:border-rlx-green"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="shrink-0 border-t border-rlx-rule bg-rlx-bg px-6 py-4 space-y-3">
                <input
                  type="text"
                  value={amendNotes}
                  onChange={(e) => setAmendNotes(e.target.value)}
                  placeholder="Remark"
                  className="w-full border border-rlx-rule bg-white px-3 py-2 text-sm outline-none focus:border-rlx-green"
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[12px] text-stone-500">
                    {willClose
                      ? "This will close the PO. Remaining parts will not appear for GRN."
                      : "New ordered qty is still above received on some lines — PO will stay open/partial."}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const next: Record<string, string> = {};
                        for (const i of po.items) next[i.id] = String(i.receivedQty);
                        setAmendQty(next);
                      }}
                      className="border border-rlx-rule px-4 py-2 text-sm text-stone-600 hover:bg-stone-50 transition"
                    >
                      Set all to received
                    </button>
                    <button type="button" disabled={amendBusy} onClick={() => setAmendPoId(null)} className="border border-rlx-rule px-4 py-2 text-sm text-stone-600 hover:bg-stone-50 transition">Cancel</button>
                    <button
                      type="button"
                      disabled={amendBusy}
                      onClick={() => void submitAmend()}
                      className="bg-rlx-green px-5 py-2 text-sm font-semibold text-white hover:bg-rlx-green/90 transition disabled:opacity-40"
                    >
                      {amendBusy ? "Saving…" : willClose ? "Amend & close PO" : "Save amendment"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
