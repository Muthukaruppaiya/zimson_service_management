import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { InventoryBreadcrumb } from "../../components/inventory/InventoryBreadcrumb";
import { SparePicker } from "../../components/inventory/SparePicker";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useRegions } from "../../context/RegionsContext";
import { useSpares } from "../../context/SparesContext";
import { ApiError, apiJson } from "../../lib/api";
import { ENABLE_PR_FLOW } from "../../lib/inventoryFeatureFlags";
import { buildPurchaseOrderDocument as _buildPurchaseOrderDocument, openPrintDocument as _openPrintDocument } from "../../lib/inventoryDocuments";
import type { PurchaseOrder } from "../../types/purchaseOrder";
import type { Supplier } from "../../types/supplier";


// ── Types ────────────────────────────────────────────────────────────────────

type PrItem = { id: string; spareId: string; qty: number; issuedQty: number; reason: string };
type PrRow = {
  id: string; prNumber: string; regionId: string; regionName?: string;
  storeId: string; storeName?: string; status: string; items: PrItem[];
};
type ConsolidationRow = {
  prItemId: string; prId: string; prNumber: string; storeId: string; storeName?: string;
  regionId: string; regionName?: string; prStatus: string; neededBy: string | null;
  prCreatedAt: string; spareId: string; spareSku: string; spareName: string;
  qty: number; issuedQty: number; pendingQty: number;
  supplierCandidateCount: number; mappedSupplierId: string | null; mappedSupplierName: string | null;
  supplierCandidates: Array<{ supplierId: string; supplierName: string }>;
};
type BulkDraft = {
  supplierId: string; supplierName: string; regionId: string; regionName?: string;
  lines: Array<{
    prItemId: string; prId: string; prNumber: string; storeId: string; storeName?: string;
    spareId: string; qtyOrdered: number;
  }>;
};

// ── Success Modal ─────────────────────────────────────────────────────────────

function PoSuccessModal({ poNumbers, onClose }: { poNumbers: string[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.55)" }}>
      <div className="w-full max-w-sm bg-white shadow-2xl overflow-hidden">
        <div className="bg-rlx-green px-6 py-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/30 bg-white/10">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" className="h-7 w-7">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 className="text-base font-semibold uppercase tracking-[0.15em] text-white">
            {poNumbers.length === 1 ? "PO Created" : `${poNumbers.length} POs Created`}
          </h2>
        </div>
        <div className="px-6 py-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-stone-400">
            {poNumbers.length === 1 ? "Purchase Order Number" : "Purchase Order Numbers"}
          </p>
          <div className="mt-2 space-y-1">
            {poNumbers.map((n) => (
              <p key={n} className="font-mono text-xl font-bold text-rlx-green">{n}</p>
            ))}
          </div>
          <p className="mt-3 text-sm text-stone-500">The PO has been sent to the supplier.</p>
        </div>
        <div className="flex gap-2 border-t border-rlx-rule bg-rlx-bg px-6 py-4">
          <Link
            to="/inventory/po-history"
            className="flex-1 border border-rlx-rule bg-white py-2 text-center text-sm font-semibold text-stone-700 hover:bg-stone-50 transition"
          >
            View PO History
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-rlx-green py-2 text-sm font-semibold text-white hover:bg-rlx-green/90 transition"
          >
            Create Another
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Section Header ────────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="border-b border-rlx-rule bg-rlx-green px-5 py-4">
      <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-white">{title}</h3>
      {subtitle && <p className="mt-0.5 text-[11px] text-white/55">{subtitle}</p>}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function InventoryPurchaseOrdersPage() {
  const { user } = useAuth();
  const { spares } = useSpares();
  const { regions } = useRegions();
  const navigate = useNavigate();

  const isHo =
    user?.role === "admin" || user?.role === "super_admin" ||
    user?.role === "ho_manager" || user?.role === "ho_purchase";

  const [_prs, setPrs] = useState<PrRow[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [, setPos] = useState<PurchaseOrder[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [successPoNumbers, setSuccessPoNumbers] = useState<string[] | null>(null);
  const [supplierId, setSupplierId] = useState("");
  const [regionId, setRegionId] = useState(user?.regionId ?? "");
  const [notes, setNotes] = useState("");
  const [standaloneLines, setStandaloneLines] = useState<Array<{ spareId: string; qty: string }>>([
    { spareId: "", qty: "1" },
  ]);
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
      const [supData, poData] = await Promise.all([
        apiJson<{ suppliers: Supplier[] }>("/api/inventory/suppliers"),
        apiJson<{ pos: PurchaseOrder[] }>("/api/inventory/pos"),
      ]);
      setSuppliers(supData.suppliers);
      setPos(poData.pos);
      if (ENABLE_PR_FLOW) {
        const prData = await apiJson<{ prs: PrRow[] }>("/api/inventory/prs");
        setPrs(prData.prs);
        if (isHo) {
          const cData = await apiJson<{ rows: ConsolidationRow[] }>("/api/inventory/po-consolidation");
          setConsolidationRows(cData.rows);
        }
      }
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not load data.");
    }
  }, [isHo]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  useEffect(() => {
    if (!regionId && (user?.regionId || regions[0])) setRegionId(user?.regionId || regions[0]!.id);
  }, [regionId, regions, user?.regionId]);

  async function createStandalonePo() {
    const items = standaloneLines
      .map((l) => ({ spareId: l.spareId, qtyOrdered: Number(l.qty), unitPrice: 0 }))
      .filter((l) => l.spareId && l.qtyOrdered > 0);
    if (!supplierId) {
      setErr("Select a supplier.");
      return;
    }
    if (!regionId) {
      setErr("Select a region.");
      return;
    }
    if (items.length === 0) {
      setErr("Add at least one spare with quantity.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const data = await apiJson<{ poNumber: string }>("/api/inventory/pos/standalone", {
        method: "POST",
        json: { supplierId, regionId, notes, items },
      });
      setStandaloneLines([{ spareId: "", qty: "1" }]);
      setNotes("");
      setSuccessPoNumbers([data.poNumber]);
      await loadAll();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not create PO.");
    } finally {
      setBusy(false);
    }
  }


  // Commented out — stat cards temporarily disabled
  // const poStats = useMemo(() => {
  //   const total = pos.length;
  //   const open = pos.filter((p) => p.status === "OPEN").length;
  //   const partial = pos.filter((p) => p.status === "PARTIAL").length;
  //   const closed = pos.filter((p) => p.status === "CLOSED").length;
  //   return { total, open, partial, closed };
  // }, [pos]);



  async function generateDrafts() {
    const selections = consolidationRows
      .filter((r) => selectedDemand[r.prItemId])
      .map((r) => ({
        prItemId: r.prItemId, qtyOrdered: r.pendingQty, unitPrice: 0,
        supplierId: r.supplierCandidateCount <= 1 ? r.mappedSupplierId ?? undefined : selectedSupplierByItem[r.prItemId] || undefined,
      }));
    if (selections.length === 0) { setErr("Select at least one demand line."); return; }
    setErr(null);
    try {
      const data = await apiJson<{ drafts: BulkDraft[]; unmapped: Array<{ prItemId: string; spareId: string; prNumber: string; reason: string; supplierCandidates?: Array<{ supplierId: string; supplierName: string }> }> }>(
        "/api/inventory/pos/draft-from-demand", { method: "POST", json: { selections } },
      );
      setDrafts(data.drafts);
      setUnmapped(data.unmapped);
      if (data.unmapped.length > 0) setErr(`${data.unmapped.length} lines need supplier mapping.`);
    } catch (e) { setErr(e instanceof ApiError ? e.message : "Could not generate PO drafts."); }
  }

  function updateDraftLine(supplierId: string, prItemId: string, patch: Partial<{ qtyOrdered: number }>) {
    setDrafts((prev) => prev.map((d) => d.supplierId !== supplierId ? d : {
      ...d, lines: d.lines.map((l) => (l.prItemId !== prItemId ? l : { ...l, ...patch })),
    }));
  }

  async function createBulkPos() {
    if (drafts.length === 0) { setErr("Generate drafts first."); return; }
    setBusy(true); setErr(null);
    try {
      const data = await apiJson<{ created: Array<{ poNumber: string }> }>("/api/inventory/pos/bulk-create", {
        method: "POST",
        json: {
          drafts: drafts.map((d) => ({
            supplierId: d.supplierId, regionId: d.regionId, notes: "Consolidated from multiple PRs",
            lines: d.lines.map((l) => ({ prItemId: l.prItemId, spareId: l.spareId, qtyOrdered: l.qtyOrdered, unitPrice: 0 })),
          })),
        },
      });
      setDrafts([]); setSelectedDemand({}); setUnmapped([]);
      setSuccessPoNumbers(data.created.map((x) => x.poNumber));
      await loadAll();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not create bulk POs.");
    } finally { setBusy(false); }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!isHo) {
    return (
      <div>
        <InventoryBreadcrumb current="Purchase orders" />
        <PageHeader
          title="Purchase Orders (PO)"
          description={ENABLE_PR_FLOW ? "POs are raised at HO based on approved store PRs." : "POs are created at HO. Purchase request flow is on hold."}
          actions={
            <button type="button" onClick={() => navigate(-1)} className="border border-rlx-rule bg-white px-4 py-2 text-xs font-semibold uppercase tracking-widest text-stone-600 hover:bg-stone-50 transition">
              ← Back
            </button>
          }
        />
        <div className="border border-rlx-rule bg-white px-6 py-8 text-center text-sm text-stone-400">
          Purchase orders are created by HO.
          <div className="mt-3">
            <Link to="/inventory/po-history" className="font-semibold text-rlx-green hover:underline">View PO History →</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <InventoryBreadcrumb current="Purchase orders" />
      <PageHeader
        title="Create Purchase Order"
        description=""
        actions={
          <div className="flex gap-2">
            <Link to="/inventory/po-history" className="border border-rlx-green px-4 py-2 text-xs font-semibold uppercase tracking-widest text-rlx-green hover:bg-rlx-green/5 transition">
              PO History
            </Link>
            <Link to="/inventory/suppliers" className="border border-rlx-rule bg-white px-4 py-2 text-xs font-semibold uppercase tracking-widest text-stone-600 hover:bg-stone-50 transition">
              Suppliers
            </Link>
            <button type="button" onClick={() => navigate(-1)} className="border border-rlx-rule bg-white px-4 py-2 text-xs font-semibold uppercase tracking-widest text-stone-600 hover:bg-stone-50 transition">
              ← Back
            </button>
          </div>
        }
      />

      {/* ── Stat cards (temporarily disabled) ──
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total PO" value={poStats.total} />
        <StatCard label="Open" value={poStats.open} color="amber" />
        <StatCard label="Partial" value={poStats.partial} color="blue" />
        <StatCard label="Closed" value={poStats.closed} color="green" />
      </div>
      ── */}

      {err && <div className="mb-5 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">✕ {err}</div>}

      {!ENABLE_PR_FLOW ? (
        <div className="border border-rlx-rule bg-white shadow-sm">
          <SectionHeader
            title="Direct PO (no PR)"
            subtitle="HO Purchase raises the PO first. Pricing is captured at GRN. Then transfer HO stock to the store."
          />
          <div className="space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <span className="block text-[11px] font-semibold uppercase tracking-widest text-stone-500">Supplier</span>
                <select
                  className="mt-1 w-full border border-rlx-rule bg-white px-3 py-2 text-sm outline-none focus:border-rlx-green"
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                >
                  <option value="">Select supplier…</option>
                  {suppliers.filter((s) => s.isActive).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="block text-[11px] font-semibold uppercase tracking-widest text-stone-500">Region (HO stock)</span>
                <select
                  className="mt-1 w-full border border-rlx-rule bg-white px-3 py-2 text-sm outline-none focus:border-rlx-green"
                  value={regionId}
                  disabled={Boolean(user?.regionId) && user?.role !== "super_admin"}
                  onChange={(e) => setRegionId(e.target.value)}
                >
                  {regions.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </label>
              <label className="sm:col-span-2">
                <span className="block text-[11px] font-semibold uppercase tracking-widest text-stone-500">Notes</span>
                <input
                  className="mt-1 w-full border border-rlx-rule bg-white px-3 py-2 text-sm outline-none focus:border-rlx-green"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional"
                />
              </label>
            </div>
            <div className="space-y-3">
              {standaloneLines.map((line, idx) => (
                <div key={idx} className="grid gap-3 border border-rlx-rule p-3 sm:grid-cols-[1fr_8rem_auto]">
                  <SparePicker
                    value={line.spareId}
                    onChange={(id) => setStandaloneLines((prev) => prev.map((l, i) => (i === idx ? { ...l, spareId: id } : l)))}
                    spares={spares}
                  />
                  <label>
                    <span className="block text-[11px] font-semibold uppercase tracking-widest text-stone-500">Qty</span>
                    <input
                      type="number"
                      min={0.001}
                      step={0.001}
                      className="mt-1 w-full border border-rlx-rule px-2 py-2 text-sm outline-none focus:border-rlx-green"
                      value={line.qty}
                      onChange={(e) => setStandaloneLines((prev) => prev.map((l, i) => (i === idx ? { ...l, qty: e.target.value } : l)))}
                    />
                  </label>
                  <button
                    type="button"
                    className="self-end border border-rlx-rule px-3 py-2 text-xs text-stone-500 hover:bg-stone-50"
                    onClick={() => setStandaloneLines((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)))}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="text-xs font-semibold text-rlx-green hover:underline"
              onClick={() => setStandaloneLines((prev) => [...prev, { spareId: "", qty: "1" }])}
            >
              + Add line
            </button>
            <div className="flex flex-wrap gap-3 border-t border-rlx-rule pt-4">
              <button
                type="button"
                disabled={busy}
                onClick={() => void createStandalonePo()}
                className="bg-rlx-green px-8 py-2.5 text-sm font-semibold text-white transition hover:bg-rlx-green/90 disabled:opacity-40"
              >
                {busy ? "Creating…" : "Create PO"}
              </button>
              <Link to="/inventory/po-inward" className="px-4 py-2.5 text-sm font-semibold text-rlx-green hover:underline">
                Next: Post GRN →
              </Link>
              <Link to="/inventory/ho-transfer" className="px-4 py-2.5 text-sm font-semibold text-rlx-green hover:underline">
                Transfer to store →
              </Link>
            </div>
          </div>
        </div>
      ) : (
      <div className="border border-rlx-rule bg-white shadow-sm">
        <SectionHeader
          title="Consolidated Demand → Supplier-wise POs"
          subtitle="Pricing and tax are captured at GRN time — only qty is needed here."
        />
        <div className="p-5 space-y-4">
          {/* Demand table */}
          <div className="border border-rlx-rule overflow-x-auto">
            {consolidationRows.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-stone-400">No pending demand lines available.</div>
            ) : (
              <table className="w-full min-w-[700px] text-sm">
                <thead>
                  <tr className="border-b border-rlx-rule bg-stone-50 text-[10px] font-bold uppercase tracking-widest text-stone-400">
                    <th className="px-4 py-3 text-center w-10">Pick</th>
                    <th className="px-4 py-3 text-left">PR#</th>
                    <th className="px-4 py-3 text-left">Store</th>
                    <th className="px-4 py-3 text-left">Spare</th>
                    <th className="px-4 py-3 text-center">Pending</th>
                    <th className="px-4 py-3 text-left">Mapped Supplier</th>
                    <th className="px-4 py-3 text-left">Choose Supplier</th>
                  </tr>
                </thead>
                <tbody>
                  {consolidationRows.map((r) => (
                    <tr key={r.prItemId} className="border-b border-rlx-rule last:border-0 hover:bg-stone-50/50">
                      <td className="px-4 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={Boolean(selectedDemand[r.prItemId])}
                          onChange={(e) => setSelectedDemand((prev) => ({ ...prev, [r.prItemId]: e.target.checked }))}
                          className="h-4 w-4 accent-rlx-green"
                        />
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs font-bold text-rlx-green">{r.prNumber}</td>
                      <td className="px-4 py-2.5 text-stone-700">{r.storeName ?? r.storeId}</td>
                      <td className="px-4 py-2.5">
                        <span className="font-medium text-stone-800">{r.spareName}</span>
                        <span className="ml-1.5 font-mono text-[10px] text-stone-400">({r.spareSku})</span>
                      </td>
                      <td className="px-4 py-2.5 text-center font-semibold text-stone-700">{r.pendingQty}</td>
                      <td className="px-4 py-2.5">
                        {r.mappedSupplierName ? (
                          <span className="text-stone-700">{r.mappedSupplierName}</span>
                        ) : (
                          <span className="text-[11px] font-semibold text-amber-600">Unmapped</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {r.supplierCandidateCount > 1 ? (
                          <select
                            className="border border-rlx-rule bg-white px-2 py-1 text-xs outline-none focus:border-rlx-green"
                            value={selectedSupplierByItem[r.prItemId] ?? ""}
                            onChange={(e) => setSelectedSupplierByItem((prev) => ({ ...prev, [r.prItemId]: e.target.value }))}
                          >
                            <option value="">Select…</option>
                            {r.supplierCandidates.map((c) => (
                              <option key={c.supplierId} value={c.supplierId}>{c.supplierName}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs text-stone-400">Auto</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Generate drafts */}
          <div className="flex items-center gap-3 border-t border-rlx-rule pt-4">
            <button
              type="button"
              onClick={() => void generateDrafts()}
              disabled={!Object.values(selectedDemand).some(Boolean)}
              className="bg-rlx-green px-6 py-2.5 text-sm font-semibold text-white hover:bg-rlx-green/90 transition disabled:opacity-40"
            >
              Generate Supplier Drafts
            </button>
            <span className="text-xs text-stone-400">
              {Object.values(selectedDemand).filter(Boolean).length} lines selected
            </span>
          </div>

          {unmapped.length > 0 && (
            <div className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              ⚠ {unmapped.length} selected lines need supplier mapping. Go to{" "}
              <Link to="/inventory/suppliers" className="font-semibold underline">Suppliers</Link> to map them.
            </div>
          )}

          {/* Draft review */}
          {drafts.length > 0 && (
            <div className="space-y-4 border-t border-rlx-rule pt-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">Review & Confirm Drafts</p>
              {drafts.map((d) => (
                <div key={`${d.supplierId}-${d.regionId}`} className="border border-rlx-rule">
                  <div className="border-b border-rlx-rule bg-stone-50 px-4 py-3 flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-stone-800">{d.supplierName}</span>
                      <span className="ml-2 text-xs text-stone-400">Region: {d.regionName ?? d.regionId}</span>
                    </div>
                    <span className="border border-rlx-rule px-2 py-0.5 text-[10px] font-bold text-stone-500">{d.lines.length} line{d.lines.length !== 1 ? "s" : ""}</span>
                  </div>
          <table className="w-full min-w-[480px] text-sm">
                    <thead>
                      <tr className="border-b border-rlx-rule bg-stone-50/60 text-[10px] font-bold uppercase tracking-widest text-stone-400">
                        <th className="px-4 py-2.5 text-left">PR#</th>
                        <th className="px-4 py-2.5 text-left">Store</th>
                        <th className="px-4 py-2.5 text-left">Spare</th>
                        <th className="px-4 py-2.5 text-left w-28">Qty Ordered</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.lines.map((l) => (
                        <tr key={l.prItemId} className="border-b border-rlx-rule last:border-0">
                          <td className="px-4 py-2.5 font-mono text-xs font-bold text-rlx-green">{l.prNumber}</td>
                          <td className="px-4 py-2.5 text-stone-600">{l.storeName ?? l.storeId}</td>
                          <td className="px-4 py-2.5 text-stone-800">{spareLabel.get(l.spareId) ?? l.spareId}</td>
                          <td className="px-4 py-2.5">
                            <input
                              type="number" min={0.001} step={0.001}
                              className="w-24 border border-rlx-rule px-2 py-1 text-sm outline-none focus:border-rlx-green"
                              value={l.qtyOrdered}
                              onChange={(e) => updateDraftLine(d.supplierId, l.prItemId, { qtyOrdered: Math.max(0, Number(e.target.value) || 0) })}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}

              <button
                type="button"
                disabled={busy || unmapped.length > 0}
                onClick={() => void createBulkPos()}
                className="bg-rlx-green px-8 py-2.5 text-sm font-semibold text-white hover:bg-rlx-green/90 transition disabled:opacity-40"
              >
                {busy ? "Creating…" : `Confirm & Create ${drafts.length} PO${drafts.length !== 1 ? "s" : ""}`}
              </button>
            </div>
          )}
        </div>
      </div>
      )}

      {/* Success popup */}
      {successPoNumbers && (
        <PoSuccessModal poNumbers={successPoNumbers} onClose={() => setSuccessPoNumbers(null)} />
      )}
    </div>
  );
}
