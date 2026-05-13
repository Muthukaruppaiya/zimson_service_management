import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { InventoryBreadcrumb } from "../../components/inventory/InventoryBreadcrumb";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useSpares } from "../../context/SparesContext";
import { ApiError, apiJson } from "../../lib/api";
import { buildGrnDocument, openPrintDocument } from "../../lib/inventoryDocuments";

// ── Types ─────────────────────────────────────────────────────────────────────

type GrnItem = {
  id: string; poItemId: string; spareId: string;
  qtyReceived: number; costPrice?: number; gstRate?: number; taxAmount?: number;
};
type GrnRow = {
  id: string; grnNumber: string; poId: string; poNumber: string;
  supplierId: string; supplierName: string; regionId: string;
  invoiceNumber: string | null; invoiceDate: string | null;
  mode: "WITH_BILL" | "WITHOUT_BILL"; notes: string;
  createdBy: string; createdAt: string; items: GrnItem[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function grnTotals(items: GrnItem[]) {
  let subtotal = 0, totalTax = 0;
  for (const i of items) {
    const cp = i.costPrice ?? 0;
    const taxable = cp * i.qtyReceived;
    const tax = i.taxAmount != null ? i.taxAmount : +(taxable * (i.gstRate ?? 18) / 100).toFixed(2);
    subtotal += taxable;
    totalTax += tax;
  }
  return { subtotal: +subtotal.toFixed(2), totalTax: +totalTax.toFixed(2), grand: +(subtotal + totalTax).toFixed(2) };
}

function fmt(v: number) {
  return `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="border border-rlx-rule bg-white px-5 py-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-stone-800">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-stone-400">{sub}</p>}
    </div>
  );
}

// ── Detail Modal ──────────────────────────────────────────────────────────────

function GrnDetailModal({ grn, spareNameById, onClose }: {
  grn: GrnRow;
  spareNameById: Map<string, string>;
  onClose: () => void;
}) {
  const totals = grnTotals(grn.items);
  const hasPricing = grn.items.some((i) => (i.costPrice ?? 0) > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.55)" }}>
      <div className="w-full max-w-2xl bg-white shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-rlx-rule bg-rlx-green px-6 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/60">GRN Details</p>
            <p className="font-mono text-lg font-bold text-white">{grn.grnNumber}</p>
          </div>
          <button type="button" onClick={onClose} className="text-white/60 hover:text-white text-xl leading-none">✕</button>
        </div>

        {/* Meta */}
        <div className="grid grid-cols-2 gap-4 border-b border-rlx-rule bg-stone-50 px-6 py-4 text-sm">
          <div className="space-y-1">
            <p><span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">PO Number</span><br /><span className="font-mono font-semibold text-stone-700">{grn.poNumber}</span></p>
            <p><span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Supplier</span><br /><span className="text-stone-700">{grn.supplierName}</span></p>
            <p><span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Mode</span><br />
              <span className={`inline-block border px-2 py-0.5 text-[10px] font-bold ${grn.mode === "WITH_BILL" ? "border-green-200 bg-green-50 text-green-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                {grn.mode === "WITH_BILL" ? "With Bill" : "Without Bill"}
              </span>
            </p>
          </div>
          <div className="space-y-1">
            <p><span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Invoice #</span><br /><span className="text-stone-700">{grn.invoiceNumber ?? "—"}</span></p>
            <p><span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Invoice Date</span><br /><span className="text-stone-700">{grn.invoiceDate ? new Date(grn.invoiceDate).toLocaleDateString("en-IN") : "—"}</span></p>
            <p><span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Posted On</span><br /><span className="text-stone-700">{new Date(grn.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span></p>
          </div>
        </div>

        {/* Items table */}
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rlx-rule bg-stone-50 text-[10px] font-bold uppercase tracking-widest text-stone-400">
                <th className="px-5 py-2.5 text-left">#</th>
                <th className="px-5 py-2.5 text-left">Spare</th>
                <th className="px-5 py-2.5 text-center">Qty</th>
                {hasPricing && <>
                  <th className="px-5 py-2.5 text-right">Cost/Unit</th>
                  <th className="px-5 py-2.5 text-center">GST %</th>
                  <th className="px-5 py-2.5 text-right">Tax Amt</th>
                  <th className="px-5 py-2.5 text-right">Line Total</th>
                </>}
              </tr>
            </thead>
            <tbody>
              {grn.items.map((i, idx) => {
                const cp = i.costPrice ?? 0;
                const taxable = +(cp * i.qtyReceived).toFixed(2);
                const tax = i.taxAmount != null ? i.taxAmount : +(taxable * (i.gstRate ?? 18) / 100).toFixed(2);
                const total = +(taxable + tax).toFixed(2);
                return (
                  <tr key={i.id} className="border-b border-rlx-rule last:border-0">
                    <td className="px-5 py-2.5 text-stone-400">{idx + 1}</td>
                    <td className="px-5 py-2.5 text-stone-800">{spareNameById.get(i.spareId) ?? i.spareId}</td>
                    <td className="px-5 py-2.5 text-center font-semibold text-stone-700">{i.qtyReceived}</td>
                    {hasPricing && <>
                      <td className="px-5 py-2.5 text-right text-stone-600">{cp > 0 ? fmt(cp) : "—"}</td>
                      <td className="px-5 py-2.5 text-center text-stone-500">{cp > 0 ? `${i.gstRate ?? 18}%` : "—"}</td>
                      <td className="px-5 py-2.5 text-right text-amber-700">{cp > 0 ? fmt(tax) : "—"}</td>
                      <td className="px-5 py-2.5 text-right font-bold text-stone-800">{cp > 0 ? fmt(total) : "—"}</td>
                    </>}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {hasPricing && (
            <div className="border-t-2 border-rlx-rule bg-stone-50 px-5 py-3 flex justify-end gap-8 text-sm">
              <span className="text-stone-500">Subtotal: <strong className="text-stone-700">{fmt(totals.subtotal)}</strong></span>
              <span className="text-stone-500">Total GST: <strong className="text-amber-700">{fmt(totals.totalTax)}</strong></span>
              <span className="text-stone-500">Grand Total: <strong className="text-rlx-green text-base">{fmt(totals.grand)}</strong></span>
            </div>
          )}
        </div>

        {/* Notes + Actions */}
        {grn.notes && (
          <div className="border-t border-rlx-rule bg-stone-50 px-6 py-3 text-xs text-stone-500">
            <span className="font-semibold">Notes:</span> {grn.notes}
          </div>
        )}
        <div className="flex gap-2 border-t border-rlx-rule bg-white px-6 py-4">
          <button type="button"
            onClick={() => openPrintDocument(`GRN ${grn.grnNumber}`, buildGrnDocument({
              grnNumber: grn.grnNumber, createdAt: grn.createdAt,
              poNumber: grn.poNumber, supplierName: grn.supplierName,
              mode: grn.mode, invoiceNumber: grn.invoiceNumber, invoiceDate: grn.invoiceDate,
              notes: grn.notes,
              lines: grn.items.map((i) => ({
                description: spareNameById.get(i.spareId) ?? i.spareId,
                qtyReceived: i.qtyReceived,
                costPrice: i.costPrice, gstRate: i.gstRate, taxAmount: i.taxAmount,
              })),
            }))}
            className="bg-rlx-green px-6 py-2 text-sm font-semibold text-white hover:bg-rlx-green/90 transition">
            Print GRN
          </button>
          <button type="button" onClick={onClose}
            className="border border-rlx-rule px-6 py-2 text-sm font-semibold text-stone-600 hover:bg-stone-50 transition">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function InventoryGrnHistoryPage() {
  const { user } = useAuth();
  const { spares } = useSpares();
  const navigate = useNavigate();

  const isHo =
    user?.role === "super_admin" || user?.role === "admin" ||
    user?.role === "ho_manager" || user?.role === "ho_purchase";

  const [grns, setGrns] = useState<GrnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [modeFilter, setModeFilter] = useState<"" | "WITH_BILL" | "WITHOUT_BILL">("");
  const [selectedGrn, setSelectedGrn] = useState<GrnRow | null>(null);

  const spareNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of spares) m.set(s.id, `${s.name} (${s.sku})`);
    return m;
  }, [spares]);

  const loadGrns = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiJson<{ grns: GrnRow[] }>("/api/inventory/grns");
      setGrns(data.grns);
    } catch (e) { setErr(e instanceof ApiError ? e.message : "Could not load GRN data."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (isHo) void loadGrns(); }, [isHo, loadGrns]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return grns.filter((g) => {
      if (modeFilter && g.mode !== modeFilter) return false;
      if (!q) return true;
      return (
        g.grnNumber.toLowerCase().includes(q) ||
        g.poNumber.toLowerCase().includes(q) ||
        g.supplierName.toLowerCase().includes(q) ||
        (g.invoiceNumber ?? "").toLowerCase().includes(q)
      );
    });
  }, [grns, search, modeFilter]);

  // Summary stats
  const stats = useMemo(() => {
    const total = grns.length;
    const withBill = grns.filter((g) => g.mode === "WITH_BILL").length;
    const totalLines = grns.reduce((s, g) => s + g.items.length, 0);
    const totalValue = grns.reduce((s, g) => s + grnTotals(g.items).grand, 0);
    return { total, withBill, totalLines, totalValue };
  }, [grns]);

  if (!isHo) {
    return (
      <div>
        <InventoryBreadcrumb current="GRN History" />
        <PageHeader title="GRN History" description="" />
        <div className="border border-rlx-rule bg-white px-6 py-10 text-center text-sm text-stone-400">
          Only HO Manager, HO Purchase, or Admin can view GRN history.
        </div>
      </div>
    );
  }

  return (
    <div>
      <InventoryBreadcrumb current="GRN History" />
      <PageHeader
        title="GRN History"
        description="Complete record of all goods received against purchase orders."
        actions={
          <div className="flex gap-2">
            <button type="button" onClick={() => navigate("/inventory/po-inward")}
              className="bg-rlx-green px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white hover:bg-rlx-green/90 transition">
              + Post New GRN
            </button>
            <button type="button" onClick={() => navigate(-1)}
              className="border border-rlx-rule bg-white px-4 py-2 text-xs font-semibold uppercase tracking-widest text-stone-600 hover:bg-stone-50 transition">
              ← Back
            </button>
          </div>
        }
      />

      {err && <div className="mb-5 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">✕ {err}</div>}

      {/* ── Stats ──────────────────────────────────────────────────────────── */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total GRNs" value={stats.total} />
        <StatCard label="With Bill" value={stats.withBill} sub={`${stats.total - stats.withBill} without bill`} />
        <StatCard label="Total Lines" value={stats.totalLines} sub="spare items received" />
        <StatCard label="Total Value" value={stats.totalValue > 0 ? fmt(stats.totalValue) : "—"} sub="incl. GST" />
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 pointer-events-none">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" strokeLinecap="round" />
          </svg>
          <input
            type="text" placeholder="Search GRN#, PO#, supplier, invoice…"
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-rlx-rule bg-white py-2 pl-9 pr-3 text-sm text-stone-800 outline-none focus:border-rlx-green" />
        </div>
        <select value={modeFilter} onChange={(e) => setModeFilter(e.target.value as typeof modeFilter)}
          className="border border-rlx-rule bg-white px-3 py-2 text-sm text-stone-700 outline-none focus:border-rlx-green">
          <option value="">All Modes</option>
          <option value="WITH_BILL">With Bill</option>
          <option value="WITHOUT_BILL">Without Bill</option>
        </select>
        {(search || modeFilter) && (
          <button type="button" onClick={() => { setSearch(""); setModeFilter(""); }}
            className="text-xs font-semibold text-stone-400 hover:text-stone-600 transition">
            Clear filters
          </button>
        )}
        <span className="ml-auto text-xs text-stone-400">{filtered.length} of {grns.length} records</span>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="border border-rlx-rule bg-white shadow-sm">
        {loading ? (
          <div className="px-5 py-10 text-center text-sm text-stone-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-stone-400">
            {grns.length === 0 ? "No GRNs posted yet. Post the first GRN to see it here." : "No records match your filters."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-rlx-rule bg-stone-50 text-[10px] font-bold uppercase tracking-widest text-stone-400">
                  <th className="px-5 py-3 text-left">GRN#</th>
                  <th className="px-5 py-3 text-left">PO#</th>
                  <th className="px-5 py-3 text-left">Supplier</th>
                  <th className="px-5 py-3 text-left">Mode</th>
                  <th className="px-5 py-3 text-left">Invoice</th>
                  <th className="px-5 py-3 text-center">Lines</th>
                  <th className="px-5 py-3 text-right">Grand Total</th>
                  <th className="px-5 py-3 text-center">Date</th>
                  <th className="px-5 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((g) => {
                  const t = grnTotals(g.items);
                  const hasPricing = g.items.some((i) => (i.costPrice ?? 0) > 0);
                  return (
                    <tr key={g.id}
                      onClick={() => setSelectedGrn(g)}
                      className="cursor-pointer border-b border-rlx-rule last:border-0 hover:bg-stone-50/60 transition">
                      <td className="px-5 py-3 font-mono text-xs font-bold text-rlx-green">{g.grnNumber}</td>
                      <td className="px-5 py-3 font-mono text-xs text-stone-500">{g.poNumber}</td>
                      <td className="px-5 py-3 font-medium text-stone-800">{g.supplierName}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-block border px-2 py-0.5 text-[10px] font-bold ${g.mode === "WITH_BILL" ? "border-green-200 bg-green-50 text-green-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                          {g.mode === "WITH_BILL" ? "With Bill" : "Without Bill"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-stone-600">{g.invoiceNumber ?? "—"}</td>
                      <td className="px-5 py-3 text-center text-stone-600">{g.items.length}</td>
                      <td className="px-5 py-3 text-right font-semibold text-stone-700">
                        {hasPricing ? fmt(t.grand) : "—"}
                      </td>
                      <td className="px-5 py-3 text-center text-xs text-stone-500">
                        {new Date(g.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td className="px-5 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-2">
                          <button type="button"
                            onClick={() => setSelectedGrn(g)}
                            className="border border-rlx-rule px-2.5 py-1 text-[11px] font-semibold text-stone-600 hover:bg-stone-50 transition">
                            Details
                          </button>
                          <button type="button"
                            onClick={() => openPrintDocument(`GRN ${g.grnNumber}`, buildGrnDocument({
                              grnNumber: g.grnNumber, createdAt: g.createdAt,
                              poNumber: g.poNumber, supplierName: g.supplierName,
                              mode: g.mode, invoiceNumber: g.invoiceNumber, invoiceDate: g.invoiceDate,
                              notes: g.notes,
                              lines: g.items.map((i) => ({
                                description: spareNameById.get(i.spareId) ?? i.spareId,
                                qtyReceived: i.qtyReceived,
                                costPrice: i.costPrice, gstRate: i.gstRate, taxAmount: i.taxAmount,
                              })),
                            }))}
                            className="border border-rlx-rule px-2.5 py-1 text-[11px] font-semibold text-stone-600 hover:bg-stone-50 transition">
                            Print
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedGrn && (
        <GrnDetailModal grn={selectedGrn} spareNameById={spareNameById} onClose={() => setSelectedGrn(null)} />
      )}
    </div>
  );
}
