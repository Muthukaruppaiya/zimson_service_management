import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { InventoryBreadcrumb } from "../../components/inventory/InventoryBreadcrumb";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useSpares } from "../../context/SparesContext";
import { ApiError, apiJson } from "../../lib/api";
import { buildPurchaseReturnDocument, openPrintDocument } from "../../lib/inventoryDocuments";
import { publicMediaUrl } from "../../lib/mediaUrl";
import { purchaseReturnReasonLabel } from "../../lib/purchaseReturn";

type ReturnItem = {
  id: string;
  grnItemId: string;
  poItemId: string;
  spareId: string;
  qtyReturned: number;
  costPrice?: number;
  gstRate?: number;
  taxAmount?: number;
};

type ReturnRow = {
  id: string;
  prtNumber: string;
  grnId: string;
  grnNumber: string;
  poId: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  regionId: string;
  returnDate: string | null;
  reason: string;
  debitNoteNumber: string | null;
  notes: string;
  supportDocPath?: string | null;
  supportDocName?: string | null;
  createdBy: string;
  createdAt: string;
  items: ReturnItem[];
};

function fmt(v: number) {
  return `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

function returnTotals(items: ReturnItem[]) {
  let subtotal = 0;
  let totalTax = 0;
  for (const i of items) {
    const cp = i.costPrice ?? 0;
    const taxable = cp * i.qtyReturned;
    const tax = i.taxAmount != null ? i.taxAmount : +(taxable * (i.gstRate ?? 18) / 100).toFixed(2);
    subtotal += taxable;
    totalTax += tax;
  }
  return { subtotal: +subtotal.toFixed(2), totalTax: +totalTax.toFixed(2), grand: +(subtotal + totalTax).toFixed(2) };
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="border border-rlx-rule bg-white px-5 py-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-stone-800">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-stone-400">{sub}</p>}
    </div>
  );
}

function printReturn(row: ReturnRow, spareNameById: Map<string, string>) {
  openPrintDocument(
    `Purchase Return ${row.prtNumber}`,
    buildPurchaseReturnDocument({
      prtNumber: row.prtNumber,
      createdAt: row.createdAt,
      returnDate: row.returnDate,
      grnNumber: row.grnNumber,
      poNumber: row.poNumber,
      supplierName: row.supplierName,
      reason: purchaseReturnReasonLabel(row.reason),
      debitNoteNumber: row.debitNoteNumber,
      notes: row.notes,
      lines: row.items.map((i) => ({
        description: spareNameById.get(i.spareId) ?? i.spareId,
        qtyReturned: i.qtyReturned,
        costPrice: i.costPrice,
        gstRate: i.gstRate,
        taxAmount: i.taxAmount,
      })),
    }),
  );
}

function ReturnDetailModal({
  row,
  spareNameById,
  onClose,
}: {
  row: ReturnRow;
  spareNameById: Map<string, string>;
  onClose: () => void;
}) {
  const totals = returnTotals(row.items);
  const hasPricing = row.items.some((i) => (i.costPrice ?? 0) > 0);
  const qty = row.items.reduce((s, i) => s + i.qtyReturned, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.55)" }}>
      <div className="w-full max-w-2xl bg-white shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-rlx-rule bg-rlx-green px-6 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/60">Purchase Return</p>
            <p className="font-mono text-lg font-bold text-white">{row.prtNumber}</p>
          </div>
          <button type="button" onClick={onClose} className="text-white/60 hover:text-white text-xl leading-none">
            ✕
          </button>
        </div>
        <div className="grid gap-4 px-6 py-4 sm:grid-cols-2 text-sm">
          <div className="space-y-1">
            <p>
              <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">GRN</span>
              <br />
              <span className="font-mono text-stone-700">{row.grnNumber}</span>
            </p>
            <p>
              <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">PO</span>
              <br />
              <span className="font-mono text-stone-700">{row.poNumber}</span>
            </p>
            <p>
              <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Supplier</span>
              <br />
              <span className="text-stone-700">{row.supplierName}</span>
            </p>
          </div>
          <div className="space-y-1">
            <p>
              <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Reason</span>
              <br />
              <span className="text-stone-700">{purchaseReturnReasonLabel(row.reason)}</span>
            </p>
            <p>
              <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Debit note</span>
              <br />
              <span className="text-stone-700">{row.debitNoteNumber ?? "—"}</span>
            </p>
            <p>
              <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Support document</span>
              <br />
              {row.supportDocPath ? (
                <a
                  href={publicMediaUrl(row.supportDocPath)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-rlx-green hover:underline"
                >
                  {row.supportDocName || "Open document"}
                </a>
              ) : (
                <span className="text-stone-400">Not attached</span>
              )}
            </p>
            <p>
              <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Qty returned</span>
              <br />
              <span className="text-stone-700">{qty}</span>
            </p>
          </div>
        </div>
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rlx-rule bg-stone-50 text-[10px] font-bold uppercase tracking-widest text-stone-400">
                <th className="px-5 py-2.5 text-left">Spare</th>
                <th className="px-5 py-2.5 text-center">Qty</th>
                {hasPricing && (
                  <>
                    <th className="px-5 py-2.5 text-right">Cost/Unit</th>
                    <th className="px-5 py-2.5 text-right">Line Total</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {row.items.map((i) => {
                const cp = i.costPrice ?? 0;
                const taxable = cp * i.qtyReturned;
                const tax = i.taxAmount != null ? i.taxAmount : +(taxable * (i.gstRate ?? 18) / 100).toFixed(2);
                return (
                  <tr key={i.id} className="border-b border-rlx-rule last:border-0">
                    <td className="px-5 py-2.5 text-stone-800">{spareNameById.get(i.spareId) ?? i.spareId}</td>
                    <td className="px-5 py-2.5 text-center font-semibold">{i.qtyReturned}</td>
                    {hasPricing && (
                      <>
                        <td className="px-5 py-2.5 text-right">{cp > 0 ? fmt(cp) : "—"}</td>
                        <td className="px-5 py-2.5 text-right font-bold">{cp > 0 ? fmt(taxable + tax) : "—"}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {row.notes ? <p className="px-6 py-3 text-sm text-stone-500">{row.notes}</p> : null}
        <div className="flex justify-end gap-2 border-t border-rlx-rule bg-rlx-bg px-6 py-3">
          {hasPricing ? <span className="mr-auto self-center text-sm font-semibold text-stone-700">{fmt(totals.grand)}</span> : null}
          <button
            type="button"
            onClick={() => printReturn(row, spareNameById)}
            className="border border-rlx-rule bg-white px-4 py-2 text-xs font-semibold uppercase tracking-widest text-stone-600 hover:bg-stone-50"
          >
            Print
          </button>
          <button
            type="button"
            onClick={onClose}
            className="bg-rlx-green px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white hover:bg-rlx-green/90"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function InventoryPurchaseReturnHistoryPage() {
  const { user } = useAuth();
  const { spares } = useSpares();
  const navigate = useNavigate();
  const isHo =
    user?.role === "super_admin" ||
    user?.role === "admin" ||
    user?.role === "ho_manager" ||
    user?.role === "ho_purchase";

  const [rows, setRows] = useState<ReturnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ReturnRow | null>(null);

  const spareNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of spares) m.set(s.id, `${s.name} (${s.sku})`);
    return m;
  }, [spares]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiJson<{ purchaseReturns: ReturnRow[] }>("/api/inventory/purchase-returns");
      setRows(data.purchaseReturns);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not load purchase returns.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isHo) void load();
  }, [isHo, load]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.prtNumber.toLowerCase().includes(q) ||
        r.grnNumber.toLowerCase().includes(q) ||
        r.poNumber.toLowerCase().includes(q) ||
        r.supplierName.toLowerCase().includes(q) ||
        (r.debitNoteNumber ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  const stats = useMemo(() => {
    const totalQty = rows.reduce((s, r) => s + r.items.reduce((n, i) => n + i.qtyReturned, 0), 0);
    const totalValue = rows.reduce((s, r) => s + returnTotals(r.items).grand, 0);
    return { count: rows.length, totalQty, totalValue };
  }, [rows]);

  if (!isHo) {
    return (
      <div>
        <InventoryBreadcrumb current="Return History" />
        <PageHeader title="Purchase Return History" description="" />
        <div className="border border-rlx-rule bg-white px-6 py-10 text-center text-sm text-stone-400">
          Only HO Manager, HO Purchase, or Admin can view spare return history.
        </div>
      </div>
    );
  }

  return (
    <div>
      <InventoryBreadcrumb current="Return History" />
      <PageHeader
        title="Purchase Return History"
        description="Spare returns posted to suppliers against GRNs. HO stock was reduced for each document."
        actions={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => navigate("/inventory/purchase-return")}
              className="bg-rlx-green px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white hover:bg-rlx-green/90 transition"
            >
              + New Return
            </button>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="border border-rlx-rule bg-white px-4 py-2 text-xs font-semibold uppercase tracking-widest text-stone-600 hover:bg-stone-50 transition"
            >
              ← Back
            </button>
          </div>
        }
      />

      {err && <div className="mb-5 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">✕ {err}</div>}

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="Returns posted" value={stats.count} />
        <StatCard label="Units returned" value={stats.totalQty} sub="HO stock deducted" />
        <StatCard label="Return value" value={stats.totalValue > 0 ? fmt(stats.totalValue) : "—"} sub="incl. GST" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search return#, GRN#, PO#, supplier…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[220px] flex-1 border border-rlx-rule bg-white py-2 px-3 text-sm text-stone-800 outline-none focus:border-rlx-green"
        />
        <span className="ml-auto text-xs text-stone-400">
          {filtered.length} of {rows.length} records
        </span>
      </div>

      <div className="border border-rlx-rule bg-white shadow-sm">
        {loading ? (
          <div className="px-5 py-10 text-center text-sm text-stone-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-stone-400">
            {rows.length === 0 ? "No spare returns posted yet." : "No records match your search."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-rlx-rule bg-stone-50 text-[10px] font-bold uppercase tracking-widest text-stone-400">
                  <th className="px-5 py-3 text-left">Return#</th>
                  <th className="px-5 py-3 text-left">GRN#</th>
                  <th className="px-5 py-3 text-left">PO#</th>
                  <th className="px-5 py-3 text-left">Supplier</th>
                  <th className="px-5 py-3 text-left">Reason</th>
                  <th className="px-5 py-3 text-center">Qty</th>
                  <th className="px-5 py-3 text-right">Value</th>
                  <th className="px-5 py-3 text-center">Date</th>
                  <th className="px-5 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const t = returnTotals(r.items);
                  const qty = r.items.reduce((s, i) => s + i.qtyReturned, 0);
                  const hasPricing = r.items.some((i) => (i.costPrice ?? 0) > 0);
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setSelected(r)}
                      className="cursor-pointer border-b border-rlx-rule last:border-0 hover:bg-stone-50/60 transition"
                    >
                      <td className="px-5 py-3 font-mono text-xs font-bold text-rlx-green">{r.prtNumber}</td>
                      <td className="px-5 py-3 font-mono text-xs text-stone-500">{r.grnNumber}</td>
                      <td className="px-5 py-3 font-mono text-xs text-stone-500">{r.poNumber}</td>
                      <td className="px-5 py-3 font-medium text-stone-800">{r.supplierName}</td>
                      <td className="px-5 py-3 text-stone-600">{purchaseReturnReasonLabel(r.reason)}</td>
                      <td className="px-5 py-3 text-center font-semibold">{qty}</td>
                      <td className="px-5 py-3 text-right font-semibold">{hasPricing ? fmt(t.grand) : "—"}</td>
                      <td className="px-5 py-3 text-center text-xs text-stone-500">
                        {new Date(r.returnDate || r.createdAt).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-5 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-2">
                          {r.supportDocPath ? (
                            <a
                              href={publicMediaUrl(r.supportDocPath)}
                              target="_blank"
                              rel="noreferrer"
                              className="border border-rlx-rule px-2.5 py-1 text-[11px] font-semibold text-rlx-green hover:bg-rlx-green/5 transition"
                            >
                              Doc
                            </a>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => setSelected(r)}
                            className="border border-rlx-rule px-2.5 py-1 text-[11px] font-semibold text-stone-600 hover:bg-stone-50 transition"
                          >
                            Details
                          </button>
                          <button
                            type="button"
                            onClick={() => printReturn(r, spareNameById)}
                            className="border border-rlx-rule px-2.5 py-1 text-[11px] font-semibold text-stone-600 hover:bg-stone-50 transition"
                          >
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

      {selected && (
        <ReturnDetailModal row={selected} spareNameById={spareNameById} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
