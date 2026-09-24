import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { InventoryBreadcrumb } from "../../components/inventory/InventoryBreadcrumb";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useSpares } from "../../context/SparesContext";
import { ApiError, apiJson } from "../../lib/api";
import { buildPurchaseVoucherDocument, openPrintDocument } from "../../lib/inventoryDocuments";
import type { PurchaseVoucher } from "../../types/purchaseVoucher";
import type { Supplier } from "../../types/supplier";

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Open",
  PARTIAL: "Partially Received",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
};

const STATUS_COLOR: Record<string, string> = {
  OPEN: "border-blue-300 bg-blue-50 text-blue-700",
  PARTIAL: "border-amber-300 bg-amber-50 text-amber-700",
  CLOSED: "border-rlx-green bg-rlx-green/10 text-rlx-green",
  CANCELLED: "border-red-300 bg-red-50 text-red-700",
};

function statusBadge(status: string) {
  return `inline-block border px-2.5 py-0.5 text-[10px] font-bold tracking-wide ${STATUS_COLOR[status] ?? "border-stone-300 bg-stone-50 text-stone-500"}`;
}

function voucherPendingQty(v: PurchaseVoucher): number {
  return v.items.reduce((n, i) => n + Math.max(0, i.qtyOrdered - i.receivedQty), 0);
}

export function InventoryVoucherHistoryPage() {
  const { user } = useAuth();
  const { spares } = useSpares();
  const navigate = useNavigate();

  const isHo =
    user?.role === "admin" || user?.role === "super_admin" ||
    user?.role === "ho_manager" || user?.role === "ho_purchase";

  const [vouchers, setVouchers] = useState<PurchaseVoucher[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [detailId, setDetailId] = useState<string | null>(null);

  const spareLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of spares) m.set(s.id, `${s.name} (${s.sku})`);
    return m;
  }, [spares]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [voucherData, supData] = await Promise.all([
        apiJson<{ vouchers: PurchaseVoucher[] }>("/api/inventory/vouchers"),
        apiJson<{ suppliers: Supplier[] }>("/api/inventory/suppliers"),
      ]);
      setVouchers(voucherData.vouchers);
      setSuppliers(supData.suppliers);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not load vouchers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);

  const stats = useMemo(() => {
    return {
      total: vouchers.length,
      open: vouchers.filter((v) => v.status === "OPEN").length,
      partial: vouchers.filter((v) => v.status === "PARTIAL").length,
      closed: vouchers.filter((v) => v.status === "CLOSED").length,
    };
  }, [vouchers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vouchers.filter((v) => {
      if (statusFilter !== "ALL" && v.status !== statusFilter) return false;
      if (!q) return true;
      return (
        v.voucherNumber.toLowerCase().includes(q) ||
        v.supplierName.toLowerCase().includes(q) ||
        (v.invoiceNumber ?? "").toLowerCase().includes(q) ||
        (v.regionName ?? v.regionId).toLowerCase().includes(q)
      );
    });
  }, [vouchers, search, statusFilter]);

  function printVoucher(v: PurchaseVoucher) {
    const supplier = suppliers.find((s) => s.id === v.supplierId);
    openPrintDocument(`Voucher ${v.voucherNumber}`, buildPurchaseVoucherDocument({
      voucherNumber: v.voucherNumber,
      voucherDate: v.createdAt,
      invoiceNumber: v.invoiceNumber,
      invoiceDate: v.invoiceDate,
      supplier: {
        name: v.supplierName,
        address: supplier?.address,
        phone: supplier?.phone,
        email: supplier?.email,
        gstin: supplier?.gst,
      },
      shipTo: { name: v.regionName ?? v.regionId },
      notes: v.notes,
      lines: v.items.map((i) => ({
        description: [spareLabel.get(i.spareId) ?? i.productName ?? i.spareId, i.partCode, i.hsn].filter(Boolean).join(" · "),
        qty: i.qtyOrdered,
        unit: i.uom || "Nos",
        unitPrice: i.unitPrice,
      })),
    }));
  }

  const statuses = ["ALL", "OPEN", "PARTIAL", "CLOSED"];
  const detail = vouchers.find((v) => v.id === detailId) ?? null;

  return (
    <div>
      <InventoryBreadcrumb current="Voucher History" />
      <PageHeader
        title="Purchase Voucher History"
        description=""
        actions={
          <div className="flex gap-2">
            {isHo && (
              <Link to="/inventory/vouchers" className="bg-rlx-green px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white hover:bg-rlx-green/90 transition">
                + New voucher
              </Link>
            )}
            <button type="button" onClick={() => navigate(-1)} className="border border-rlx-rule bg-white px-4 py-2 text-xs font-semibold uppercase tracking-widest text-stone-600 hover:bg-stone-50 transition">
              ← Back
            </button>
          </div>
        }
      />

      {err && <div className="mb-4 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">✕ {err}</div>}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total voucher", value: stats.total, color: "text-stone-800" },
          { label: "Open", value: stats.open, color: "text-blue-700" },
          { label: "Partial", value: stats.partial, color: "text-amber-700" },
          { label: "Closed", value: stats.closed, color: "text-rlx-green" },
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

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search voucher#, invoice, supplier…"
            className="w-full border border-rlx-rule bg-white py-2 px-3 text-sm outline-none focus:border-rlx-green"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {statuses.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide transition ${
                statusFilter === s ? "border-rlx-green bg-rlx-green text-white" : "border-rlx-rule bg-white text-stone-500 hover:border-rlx-green/50"
              }`}
            >
              {s === "ALL" ? "All" : (STATUS_LABEL[s] ?? s)}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => void loadAll()} className="border border-rlx-rule px-3 py-2 text-xs font-semibold text-stone-500 hover:bg-stone-50 transition" title="Refresh">↻</button>
      </div>

      <div className="border border-rlx-rule bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-rlx-rule bg-rlx-green px-5 py-3.5">
          <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-white">Purchase Vouchers</h3>
          <span className="border border-white/30 px-2 py-0.5 text-[10px] font-bold text-white/70">{filtered.length}</span>
        </div>
        {loading ? (
          <div className="px-5 py-10 text-center text-sm text-stone-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-stone-400">No purchase vouchers found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-rlx-rule bg-stone-50 text-[10px] font-bold uppercase tracking-widest text-stone-400">
                  <th className="px-5 py-3 text-left">Voucher#</th>
                  <th className="px-5 py-3 text-left">Supplier name</th>
                  <th className="px-5 py-3 text-left">Invoice</th>
                  <th className="px-5 py-3 text-left">Status</th>
                  <th className="px-5 py-3 text-center">Pending</th>
                  <th className="px-5 py-3 text-left">Created</th>
                  <th className="px-5 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => (
                  <tr key={v.id} className="border-b border-rlx-rule last:border-0 hover:bg-stone-50/50 transition">
                    <td className="px-5 py-3 font-mono text-xs font-bold text-rlx-green">{v.voucherNumber}</td>
                    <td className="px-5 py-3 font-medium text-stone-800">{v.supplierName}</td>
                    <td className="px-5 py-3 text-stone-700">
                      <p>{v.invoiceNumber ?? "—"}</p>
                      <p className="text-[11px] text-stone-400">
                        {v.invoiceDate ? new Date(v.invoiceDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : ""}
                      </p>
                    </td>
                    <td className="px-5 py-3">
                      <span className={statusBadge(v.status)}>{STATUS_LABEL[v.status] ?? v.status}</span>
                    </td>
                    <td className="px-5 py-3 text-center font-semibold text-amber-700">{voucherPendingQty(v)}</td>
                    <td className="px-5 py-3 text-xs text-stone-500">
                      {new Date(v.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setDetailId((x) => (x === v.id ? null : v.id))}
                          className="border border-rlx-rule px-2.5 py-1 text-[11px] font-semibold text-stone-600 hover:bg-stone-50 transition"
                        >Details</button>
                        {isHo && voucherPendingQty(v) > 0 && (v.status === "OPEN" || v.status === "PARTIAL") && (
                          <Link
                            to={`/inventory/po-inward?voucher=${encodeURIComponent(v.id)}`}
                            className="border border-rlx-green px-2.5 py-1 text-[11px] font-semibold text-rlx-green hover:bg-rlx-green/5 transition"
                          >GRN</Link>
                        )}
                        <button
                          type="button"
                          onClick={() => printVoucher(v)}
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

      {detail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setDetailId(null); }}
        >
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden bg-white shadow-2xl">
            <div className="flex items-center justify-between bg-rlx-green px-6 py-4">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wide text-white">{detail.voucherNumber}</h3>
                <p className="mt-0.5 text-[11px] text-white/60">Supplier name: {detail.supplierName}</p>
              </div>
              <button type="button" onClick={() => setDetailId(null)} className="text-white/70 hover:text-white">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-3 border-b border-rlx-rule bg-stone-50 px-6 py-4 text-sm">
              <p><span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Invoice</span><br />{detail.invoiceNumber ?? "—"}</p>
              <p><span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Invoice date</span><br />{detail.invoiceDate ? new Date(detail.invoiceDate).toLocaleDateString("en-IN") : "—"}</p>
              <p><span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Region</span><br />{detail.regionName ?? detail.regionId}</p>
              <p><span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Remark</span><br />{detail.notes || "—"}</p>
            </div>
            <div className="overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-rlx-rule bg-stone-50 text-[10px] font-bold uppercase tracking-widest text-stone-400">
                    <th className="px-5 py-2.5 text-left">Spare</th>
                    <th className="px-5 py-2.5 text-center">Ordered</th>
                    <th className="px-5 py-2.5 text-center">Received</th>
                    <th className="px-5 py-2.5 text-center">Pending</th>
                    <th className="px-5 py-2.5 text-right">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((i) => (
                    <tr key={i.id} className="border-b border-rlx-rule last:border-0">
                      <td className="px-5 py-2.5">{spareLabel.get(i.spareId) ?? i.productName ?? i.spareId}</td>
                      <td className="px-5 py-2.5 text-center">{i.qtyOrdered}</td>
                      <td className="px-5 py-2.5 text-center">{i.receivedQty}</td>
                      <td className="px-5 py-2.5 text-center font-semibold text-amber-700">{Math.max(0, i.qtyOrdered - i.receivedQty)}</td>
                      <td className="px-5 py-2.5 text-right">₹{i.unitPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
