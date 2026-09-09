import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { InventoryBreadcrumb } from "../../components/inventory/InventoryBreadcrumb";
import { SparePicker } from "../../components/inventory/SparePicker";
import { PageHeader } from "../../components/ui/PageHeader";
import { ProcessSuccessModal } from "../../components/ui/ProcessSuccessModal";
import { useAuth } from "../../context/AuthContext";
import { useRegions } from "../../context/RegionsContext";
import { useSpares } from "../../context/SparesContext";
import { ApiError, apiJson } from "../../lib/api";
import { modalBtnPrimary, modalBtnSecondary } from "../../lib/appModalStyles";

const inputCls =
  "mt-1 w-full border border-rlx-rule bg-white px-3 py-2 text-sm text-stone-800 outline-none focus:border-rlx-green";
const labelCls = "block text-[11px] font-semibold uppercase tracking-widest text-stone-500";

type HoStockRow = { spareId: string; sku: string; name: string; qty: number };
type GrnPendingItem = {
  id: string;
  spareId: string;
  sku: string;
  name: string;
  qtyReceived: number;
  qtyTransferred: number;
  qtyPending: number;
  hoAvailable: number;
};
type GrnPending = {
  id: string;
  grnNumber: string;
  poNumber: string;
  supplierName: string;
  regionId: string;
  createdAt: string;
  items: GrnPendingItem[];
};
type ExtraLine = { key: string; spareId: string; qty: string; checked: boolean };

let extraSeq = 0;
function newExtraLine(): ExtraLine {
  extraSeq += 1;
  return { key: `extra-${extraSeq}`, spareId: "", qty: "1", checked: true };
}

export function InventoryHoStoreTransferPage() {
  const { user } = useAuth();
  const { regions } = useRegions();
  const { spares } = useSpares();
  const [searchParams] = useSearchParams();
  const canTransfer =
    user?.role === "super_admin" ||
    user?.role === "admin" ||
    user?.role === "ho_manager" ||
    user?.role === "ho_purchase";

  const [regionId, setRegionId] = useState(user?.regionId ?? "");
  const [storeId, setStoreId] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    transferNumber: string;
    movedQty: number;
    storeName: string;
    remainingQty?: number;
    grnNumber?: string;
  } | null>(null);

  const [grns, setGrns] = useState<GrnPending[]>([]);
  const [grnId, setGrnId] = useState(searchParams.get("grnId") ?? "");
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [qtyByItem, setQtyByItem] = useState<Record<string, string>>({});
  const [extraLines, setExtraLines] = useState<ExtraLine[]>(() =>
    searchParams.get("grnId") ? [] : [newExtraLine()],
  );
  const [hoStock, setHoStock] = useState<HoStockRow[]>([]);

  const stores = useMemo(() => regions.find((r) => r.id === regionId)?.stores ?? [], [regions, regionId]);
  const qtyBySpare = useMemo(() => {
    const m = new Map<string, number>();
    for (const row of hoStock) m.set(row.spareId, row.qty);
    return m;
  }, [hoStock]);
  const selectedGrn = useMemo(() => grns.find((g) => g.id === grnId) ?? null, [grns, grnId]);
  const pendingGrnItems = selectedGrn?.items.filter((it) => it.qtyPending > 0) ?? [];
  const hasLines = pendingGrnItems.length > 0 || extraLines.length > 0;

  useEffect(() => {
    if (!regionId && regions[0]) setRegionId(user?.regionId || regions[0].id);
  }, [regions, regionId, user?.regionId]);

  useEffect(() => {
    if (stores.length && !stores.some((s) => s.id === storeId)) setStoreId(stores[0]?.id ?? "");
  }, [stores, storeId]);

  const loadPendingGrns = useCallback(async () => {
    if (!regionId) return;
    try {
      const data = await apiJson<{ grns: GrnPending[] }>(
        `/api/inventory/grns/pending-transfer?regionId=${encodeURIComponent(regionId)}`,
      );
      setGrns(data.grns);
    } catch {
      setGrns([]);
    }
  }, [regionId]);

  const loadHoStock = useCallback(async () => {
    if (!regionId) return;
    try {
      const data = await apiJson<{ rows: HoStockRow[] }>(
        `/api/inventory/ho-stock?regionId=${encodeURIComponent(regionId)}`,
      );
      setHoStock(data.rows);
    } catch {
      setHoStock([]);
    }
  }, [regionId]);

  useEffect(() => {
    void loadPendingGrns();
    void loadHoStock();
  }, [loadPendingGrns, loadHoStock]);

  useEffect(() => {
    const fromQuery = searchParams.get("grnId");
    if (fromQuery && grns.some((g) => g.id === fromQuery)) setGrnId(fromQuery);
  }, [grns, searchParams]);

  useEffect(() => {
    if (!selectedGrn) {
      setChecked({});
      setQtyByItem({});
      setExtraLines((prev) => (prev.length === 0 ? [newExtraLine()] : prev));
      return;
    }
    const nextChecked: Record<string, boolean> = {};
    const nextQty: Record<string, string> = {};
    for (const it of selectedGrn.items) {
      nextChecked[it.id] = it.qtyPending > 0;
      nextQty[it.id] = String(it.qtyPending);
    }
    setChecked(nextChecked);
    setQtyByItem(nextQty);
  }, [selectedGrn]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!regionId || !storeId) {
      setErr("Select region and destination store.");
      return;
    }
    const grnItems = (selectedGrn?.items ?? [])
      .filter((it) => checked[it.id])
      .map((it) => ({
        spareId: it.spareId,
        qty: Number(qtyByItem[it.id] ?? "0"),
        grnItemId: it.id,
      }))
      .filter((it) => it.qty > 0);
    const extras = extraLines
      .filter((l) => l.checked && l.spareId)
      .map((l) => ({ spareId: l.spareId, qty: Number(l.qty) }))
      .filter((l) => l.qty > 0);
    const items = [...grnItems, ...extras];
    if (items.length === 0) {
      setErr("Check at least one spare and enter a quantity, or add a line item.");
      return;
    }
    setBusy(true);
    try {
      const data = await apiJson<{
        transferNumber: string;
        movedQty: number;
        storeName: string;
        remainingQty?: number;
        grnNumber?: string;
      }>("/api/inventory/transfers/ho-to-store", {
        method: "POST",
        json: { regionId, storeId, notes, grnId: grnId || undefined, items },
      });
      setResult(data);
      setNotes("");
      setExtraLines((data.remainingQty ?? 0) > 0 ? [] : [newExtraLine()]);
      if ((data.remainingQty ?? 0) <= 0) setGrnId("");
      await loadPendingGrns();
      await loadHoStock();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : "Could not transfer stock.");
    } finally {
      setBusy(false);
    }
  }

  if (!canTransfer) {
    return (
      <div>
        <InventoryBreadcrumb current="HO transfer" />
        <PageHeader title="Transfer to store" description="" />
        <div className="border border-rlx-rule bg-white px-6 py-10 text-center text-sm text-stone-400">
          Only HO Purchase / HO Manager can transfer stock from HO to a store.
        </div>
      </div>
    );
  }

  return (
    <div>
      <InventoryBreadcrumb current="HO transfer" />
      <PageHeader
        title="Transfer HO → Store"
        description="Select a GRN to load its spares, check what to send (partial qty allowed), and add extra HO stock lines in the same list."
        actions={
          <Link
            to="/inventory/po-inward"
            className="border border-rlx-rule bg-white px-4 py-2 text-xs font-semibold uppercase tracking-widest text-stone-600 transition hover:bg-stone-50"
          >
            Post GRN
          </Link>
        }
      />

      {err ? <div className="mb-5 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">✕ {err}</div> : null}

      <form onSubmit={(e) => void submit(e)} className="border border-rlx-rule bg-white shadow-sm">
        <div className="border-b border-rlx-rule bg-rlx-green px-5 py-4">
          <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-white">Transfer lines</h3>
          <p className="mt-0.5 text-[11px] text-white/55">
            GRN is optional. Check lines to send, change qty, or add extra HO stock with + Add line item.
          </p>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <label>
            <span className={labelCls}>Region</span>
            <select
              className={inputCls}
              value={regionId}
              disabled={Boolean(user?.regionId) && user?.role !== "super_admin"}
              onChange={(e) => {
                setRegionId(e.target.value);
                setGrnId("");
              }}
            >
              {regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={labelCls}>Store</span>
            <select className={inputCls} value={storeId} onChange={(e) => setStoreId(e.target.value)}>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="sm:col-span-2">
            <span className={labelCls}>GRN (optional)</span>
            <select className={inputCls} value={grnId} onChange={(e) => setGrnId(e.target.value)}>
              <option value="">No GRN — add HO stock lines only</option>
              {grns.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.grnNumber} · {g.poNumber} · {g.supplierName}
                </option>
              ))}
            </select>
            {grns.length === 0 ? (
              <p className="mt-1 text-[11px] text-stone-400">No GRNs with remaining qty in this region. You can still add HO stock lines.</p>
            ) : null}
          </label>
          <label className="sm:col-span-2">
            <span className={labelCls}>Notes</span>
            <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </label>
        </div>

        <div className="overflow-x-auto border-t border-rlx-rule">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-rlx-rule bg-stone-50 text-[10px] font-bold uppercase tracking-widest text-stone-400">
                <th className="px-4 py-3 text-center w-12">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-rlx-green"
                    title="Select all"
                    checked={
                      hasLines &&
                      pendingGrnItems.every((it) => checked[it.id]) &&
                      extraLines.every((l) => l.checked)
                    }
                    onChange={(e) => {
                      const on = e.target.checked;
                      setChecked((prev) => {
                        const next = { ...prev };
                        for (const it of pendingGrnItems) next[it.id] = on;
                        return next;
                      });
                      setExtraLines((prev) => prev.map((l) => ({ ...l, checked: on })));
                    }}
                  />
                </th>
                <th className="px-4 py-3 text-left">Spare</th>
                <th className="px-4 py-3 text-center">Source</th>
                <th className="px-4 py-3 text-center">Received</th>
                <th className="px-4 py-3 text-center">Already sent</th>
                <th className="px-4 py-3 text-center">Pending</th>
                <th className="px-4 py-3 text-center">HO stock</th>
                <th className="px-4 py-3 text-left w-32">Qty now</th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody>
              {selectedGrn?.items.map((it) => {
                const maxQty = Math.min(it.qtyPending, it.hoAvailable);
                const done = it.qtyPending <= 0;
                return (
                  <tr key={it.id} className={`border-b border-rlx-rule ${done ? "bg-stone-50/80 text-stone-400" : ""}`}>
                    <td className="px-4 py-2.5 text-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-rlx-green"
                        checked={Boolean(checked[it.id])}
                        disabled={done}
                        onChange={(e) => setChecked((prev) => ({ ...prev, [it.id]: e.target.checked }))}
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-stone-800">{it.name}</p>
                      <p className="font-mono text-[11px] text-stone-400">{it.sku}</p>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="inline-block border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-blue-700">
                        GRN
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center text-stone-700">{it.qtyReceived}</td>
                    <td className="px-4 py-2.5 text-center text-stone-700">{it.qtyTransferred}</td>
                    <td className="px-4 py-2.5 text-center font-semibold text-rlx-green">{it.qtyPending}</td>
                    <td className="px-4 py-2.5 text-center text-stone-600">{it.hoAvailable}</td>
                    <td className="px-4 py-2.5">
                      <input
                        type="number"
                        min={0}
                        max={maxQty}
                        step={0.001}
                        disabled={!checked[it.id] || done}
                        className="w-24 border border-rlx-rule px-2 py-1 text-sm outline-none focus:border-rlx-green disabled:bg-stone-50"
                        value={qtyByItem[it.id] ?? ""}
                        onChange={(e) => setQtyByItem((prev) => ({ ...prev, [it.id]: e.target.value }))}
                      />
                    </td>
                    <td className="px-4 py-2.5" />
                  </tr>
                );
              })}
              {extraLines.map((line) => {
                const avail = line.spareId ? qtyBySpare.get(line.spareId) ?? 0 : null;
                return (
                  <tr key={line.key} className="border-b border-rlx-rule last:border-0">
                    <td className="px-4 py-2.5 text-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-rlx-green"
                        checked={line.checked}
                        onChange={(e) =>
                          setExtraLines((prev) =>
                            prev.map((l) => (l.key === line.key ? { ...l, checked: e.target.checked } : l)),
                          )
                        }
                      />
                    </td>
                    <td className="px-4 py-2.5 min-w-[240px]">
                      <SparePicker
                        value={line.spareId}
                        onChange={(id) =>
                          setExtraLines((prev) => prev.map((l) => (l.key === line.key ? { ...l, spareId: id } : l)))
                        }
                        spares={spares}
                      />
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="inline-block border border-stone-200 bg-stone-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-stone-500">
                        Extra
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center text-stone-300">—</td>
                    <td className="px-4 py-2.5 text-center text-stone-300">—</td>
                    <td className="px-4 py-2.5 text-center text-stone-300">—</td>
                    <td className="px-4 py-2.5 text-center text-stone-600">{avail ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <input
                        type="number"
                        min={0}
                        max={avail ?? undefined}
                        step={0.001}
                        disabled={!line.checked}
                        className="w-24 border border-rlx-rule px-2 py-1 text-sm outline-none focus:border-rlx-green disabled:bg-stone-50"
                        value={line.qty}
                        onChange={(e) =>
                          setExtraLines((prev) =>
                            prev.map((l) => (l.key === line.key ? { ...l, qty: e.target.value } : l)),
                          )
                        }
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        className="text-xs font-semibold text-stone-400 hover:text-stone-700"
                        onClick={() =>
                          setExtraLines((prev) => prev.filter((l) => l.key !== line.key))
                        }
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!hasLines ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-stone-400">
                    Select a GRN or add a line item from HO stock.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rlx-rule px-5 py-4">
          <button
            type="button"
            className="text-xs font-semibold text-rlx-green hover:underline"
            onClick={() => setExtraLines((prev) => [...prev, newExtraLine()])}
          >
            + Add line item
          </button>
          <button
            type="submit"
            disabled={busy}
            className="bg-rlx-green px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-rlx-green/90 disabled:opacity-50"
          >
            {busy ? "Transferring…" : "Transfer selected to store"}
          </button>
        </div>
      </form>

      <ProcessSuccessModal
        open={!!result}
        title="Transferred successfully"
        description={
          result
            ? `${result.movedQty} unit(s) moved to ${result.storeName}.${
                result.remainingQty != null
                  ? result.remainingQty > 0
                    ? ` ${result.remainingQty} still pending on ${result.grnNumber ?? "this GRN"}.`
                    : ` ${result.grnNumber ?? "GRN"} is fully transferred.`
                  : ""
              }`
            : undefined
        }
        onBackdropClick={() => setResult(null)}
        actions={
          <>
            <button type="button" className={modalBtnSecondary} onClick={() => setResult(null)}>
              Transfer another
            </button>
            <Link to="/inventory/store-stock" className={modalBtnPrimary} onClick={() => setResult(null)}>
              Store stock
            </Link>
          </>
        }
      >
        {result ? (
          <p className="text-center font-mono text-lg font-bold text-rlx-green">{result.transferNumber}</p>
        ) : null}
      </ProcessSuccessModal>
    </div>
  );
}
