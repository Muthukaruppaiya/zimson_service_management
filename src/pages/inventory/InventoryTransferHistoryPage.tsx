import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { InventoryBreadcrumb } from "../../components/inventory/InventoryBreadcrumb";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { ApiError, apiJson } from "../../lib/api";

type TransferItem = { spareId: string; sku: string; name: string; qty: number };

type TransferRow = {
  id: string;
  transferNumber: string;
  grnNumber: string | null;
  regionId: string | null;
  regionName: string | null;
  storeId: string | null;
  storeName: string | null;
  lineCount: number;
  qty: number;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
  items: TransferItem[];
};

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="border border-rlx-rule bg-white px-5 py-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-stone-800">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-stone-400">{sub}</p> : null}
    </div>
  );
}

function TransferDetailModal({
  row,
  onClose,
}: {
  row: TransferRow;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.55)" }}>
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-rlx-rule bg-rlx-green px-6 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/60">Transfer details</p>
            <p className="font-mono text-lg font-bold text-white">{row.transferNumber}</p>
          </div>
          <button type="button" onClick={onClose} className="text-xl leading-none text-white/60 hover:text-white">
            ✕
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4 border-b border-rlx-rule bg-stone-50 px-6 py-4 text-sm">
          <p>
            <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Region name</span>
            <br />
            <span className="text-stone-700">{row.regionName ?? row.regionId ?? "—"}</span>
          </p>
          <p>
            <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Store</span>
            <br />
            <span className="text-stone-700">{row.storeName ?? row.storeId ?? "—"}</span>
          </p>
          <p>
            <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Against GRN</span>
            <br />
            <span className="font-mono text-stone-700">{row.grnNumber ?? "—"}</span>
          </p>
          <p>
            <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Date</span>
            <br />
            <span className="text-stone-700">
              {new Date(row.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
            </span>
          </p>
          {row.note ? (
            <p className="col-span-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Remark</span>
              <br />
              <span className="text-stone-700">{row.note}</span>
            </p>
          ) : null}
        </div>
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rlx-rule bg-stone-50 text-[10px] font-bold uppercase tracking-widest text-stone-400">
                <th className="px-5 py-2.5 text-left">#</th>
                <th className="px-5 py-2.5 text-left">Spare</th>
                <th className="px-5 py-2.5 text-left">Part</th>
                <th className="px-5 py-2.5 text-center">Qty</th>
              </tr>
            </thead>
            <tbody>
              {row.items.map((it, idx) => (
                <tr key={`${it.spareId}-${idx}`} className="border-b border-rlx-rule last:border-0">
                  <td className="px-5 py-2.5 text-stone-400">{idx + 1}</td>
                  <td className="px-5 py-2.5 font-medium text-stone-800">{it.name}</td>
                  <td className="px-5 py-2.5 font-mono text-xs text-stone-500">{it.sku}</td>
                  <td className="px-5 py-2.5 text-center font-semibold">{it.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function InventoryTransferHistoryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isHo =
    user?.role === "super_admin" ||
    user?.role === "admin" ||
    user?.role === "ho_manager" ||
    user?.role === "ho_purchase";
  const [rows, setRows] = useState<TransferRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<TransferRow | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiJson<{ transfers: TransferRow[] }>("/api/inventory/transfers");
      setRows(data.transfers);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not load transfer history.");
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
        r.transferNumber.toLowerCase().includes(q) ||
        (r.grnNumber ?? "").toLowerCase().includes(q) ||
        (r.storeName ?? "").toLowerCase().includes(q) ||
        (r.regionName ?? "").toLowerCase().includes(q) ||
        (r.note ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  const stats = useMemo(() => {
    const totalQty = rows.reduce((s, r) => s + r.qty, 0);
    return { count: rows.length, totalQty };
  }, [rows]);

  if (!isHo) {
    return (
      <div>
        <InventoryBreadcrumb current="Transfers history" />
        <PageHeader title="Transfers history" description="" />
        <div className="border border-rlx-rule bg-white px-6 py-10 text-center text-sm text-stone-400">
          Only HO Manager, HO Purchase, or Admin can view transfer history.
        </div>
      </div>
    );
  }

  return (
    <div>
      <InventoryBreadcrumb current="Transfers history" />
      <PageHeader
        title="Transfers history"
        description="HO stock moved to stores."
        actions={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => navigate("/inventory/ho-transfer")}
              className="bg-rlx-green px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white transition hover:bg-rlx-green/90"
            >
              + New transfer
            </button>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="border border-rlx-rule bg-white px-4 py-2 text-xs font-semibold uppercase tracking-widest text-stone-600 transition hover:bg-stone-50"
            >
              ← Back
            </button>
          </div>
        }
      />

      {err ? <div className="mb-5 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">✕ {err}</div> : null}

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <StatCard label="Transfers posted" value={stats.count} />
        <StatCard label="Units moved" value={stats.totalQty} sub="HO → store" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search transfer#, GRN#, store…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[220px] flex-1 border border-rlx-rule bg-white px-3 py-2 text-sm text-stone-800 outline-none focus:border-rlx-green"
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
            {rows.length === 0 ? "No transfers posted yet." : "No records match your search."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-rlx-rule bg-stone-50 text-[10px] font-bold uppercase tracking-widest text-stone-400">
                  <th className="px-5 py-3 text-left">Transfer#</th>
                  <th className="px-5 py-3 text-left">GRN#</th>
                  <th className="px-5 py-3 text-left">Region name</th>
                  <th className="px-5 py-3 text-left">Store</th>
                  <th className="px-5 py-3 text-center">Lines</th>
                  <th className="px-5 py-3 text-center">Qty</th>
                  <th className="px-5 py-3 text-center">Date</th>
                  <th className="px-5 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelected(r)}
                    className="cursor-pointer border-b border-rlx-rule transition last:border-0 hover:bg-stone-50/60"
                  >
                    <td className="px-5 py-3 font-mono text-xs font-bold text-rlx-green">{r.transferNumber}</td>
                    <td className="px-5 py-3 font-mono text-xs text-stone-500">{r.grnNumber ?? "—"}</td>
                    <td className="px-5 py-3 text-stone-700">{r.regionName ?? r.regionId ?? "—"}</td>
                    <td className="px-5 py-3 font-medium text-stone-800">{r.storeName ?? r.storeId ?? "—"}</td>
                    <td className="px-5 py-3 text-center">{r.lineCount}</td>
                    <td className="px-5 py-3 text-center font-semibold">{r.qty}</td>
                    <td className="px-5 py-3 text-center text-xs text-stone-500">
                      {new Date(r.createdAt).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-5 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => setSelected(r)}
                        className="border border-rlx-rule px-2.5 py-1 text-[11px] font-semibold text-stone-600 transition hover:bg-stone-50"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected ? <TransferDetailModal row={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}
