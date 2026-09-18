import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
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
  "mt-1 w-full border border-rlx-rule bg-white px-3 py-1.5 text-sm text-stone-800 outline-none focus:border-rlx-green focus:ring-1 focus:ring-rlx-green/30 transition-colors";
const labelCls = "block text-[11px] font-semibold uppercase tracking-widest text-stone-500";
const compactFieldCls =
  "mt-0.5 h-8 w-full border border-rlx-rule bg-white px-2 text-sm text-stone-800 outline-none focus:border-rlx-green focus:ring-1 focus:ring-rlx-green/30";

function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="block text-[10px] font-semibold uppercase tracking-widest text-stone-400">{children}</span>;
}

type HoStockRow = { spareId: string; sku: string; name: string; qty: number };
type ExtraLine = { key: string; spareId: string; qty: string };

let extraSeq = 0;
function newExtraLine(): ExtraLine {
  extraSeq += 1;
  return { key: `extra-${extraSeq}`, spareId: "", qty: "1" };
}

export function InventoryHoStoreTransferPage() {
  const { user } = useAuth();
  const { regions } = useRegions();
  const { spares } = useSpares();
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
  } | null>(null);
  const [lines, setLines] = useState<ExtraLine[]>(() => [newExtraLine()]);
  const [hoStock, setHoStock] = useState<HoStockRow[]>([]);

  const stores = useMemo(() => regions.find((r) => r.id === regionId)?.stores ?? [], [regions, regionId]);
  const selectedStore = stores.find((s) => s.id === storeId);
  const regionName = regions.find((r) => r.id === regionId)?.name ?? "";
  const qtyBySpare = useMemo(() => {
    const m = new Map<string, number>();
    for (const row of hoStock) m.set(row.spareId, row.qty);
    return m;
  }, [hoStock]);
  const spareById = useMemo(() => {
    const m = new Map(spares.map((s) => [s.id, s]));
    return m;
  }, [spares]);

  const pickerSpares = useMemo(() => {
    const inHo = new Set(hoStock.filter((r) => r.qty > 0).map((r) => r.spareId));
    const selected = new Set(lines.map((l) => l.spareId).filter(Boolean));
    const filtered = spares.filter((s) => inHo.has(s.id) || selected.has(s.id));
    return filtered.length > 0 ? filtered : spares;
  }, [hoStock, lines, spares]);

  function sparesForLine(lineKey: string) {
    const used = new Set(lines.filter((l) => l.key !== lineKey && l.spareId).map((l) => l.spareId));
    return pickerSpares.filter((s) => !used.has(s.id));
  }

  const readyLines = useMemo(
    () =>
      lines
        .map((l) => ({ ...l, qtyN: Number(l.qty) || 0, avail: qtyBySpare.get(l.spareId) ?? 0 }))
        .filter((l) => l.spareId && l.qtyN > 0),
    [lines, qtyBySpare],
  );
  const totalQty = readyLines.reduce((n, l) => n + l.qtyN, 0);
  const overstock = readyLines.some((l) => l.qtyN > l.avail);
  const hoSkuCount = hoStock.filter((r) => r.qty > 0).length;
  const hoUnitCount = hoStock.reduce((n, r) => n + r.qty, 0);

  useEffect(() => {
    if (!regionId && regions[0]) setRegionId(user?.regionId || regions[0].id);
  }, [regions, regionId, user?.regionId]);

  useEffect(() => {
    if (stores.length && !stores.some((s) => s.id === storeId)) setStoreId(stores[0]?.id ?? "");
  }, [stores, storeId]);

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
    void loadHoStock();
  }, [loadHoStock]);

  function patchLine(key: string, patch: Partial<ExtraLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!regionId || !storeId) {
      setErr("Select region and destination store.");
      return;
    }
    if (readyLines.length === 0) {
      setErr("Add at least one spare with quantity.");
      return;
    }
    if (overstock) {
      setErr("Quantity cannot exceed HO stock on one or more lines.");
      return;
    }
    setBusy(true);
    try {
      const data = await apiJson<{
        transferNumber: string;
        movedQty: number;
        storeName: string;
      }>("/api/inventory/transfers/ho-to-store", {
        method: "POST",
        json: {
          regionId,
          storeId,
          notes,
          items: readyLines.map((l) => ({ spareId: l.spareId, qty: l.qtyN })),
        },
      });
      setResult(data);
      setNotes("");
      setLines([newExtraLine()]);
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
        description="Move available HO stock to a store. Pick spares and quantity — no GRN is required."
        actions={
          <div className="flex gap-2">
            <Link
              to="/inventory/purchase-return"
              className="border border-rlx-rule bg-white px-4 py-2 text-xs font-semibold uppercase tracking-widest text-stone-600 transition hover:bg-stone-50"
            >
              Spare return
            </Link>
            <Link
              to="/inventory/po-inward"
              className="border border-rlx-rule bg-white px-4 py-2 text-xs font-semibold uppercase tracking-widest text-stone-600 transition hover:bg-stone-50"
            >
              Post GRN
            </Link>
          </div>
        }
      />

      {err ? <div className="mb-5 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">✕ {err}</div> : null}

      <form onSubmit={(e) => void submit(e)} className="space-y-5">
        <div className="border border-rlx-rule bg-white shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-rlx-rule bg-rlx-green px-5 py-4">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-white">Destination</h3>
              <p className="mt-0.5 text-[11px] text-white/55">Choose HO region and the store that will receive stock.</p>
            </div>
            <div className="text-right text-[11px] text-white/75">
              <p className="font-semibold text-white">{hoSkuCount} spare{hoSkuCount === 1 ? "" : "s"} in HO</p>
              <p>{hoUnitCount.toLocaleString("en-IN")} unit{hoUnitCount === 1 ? "" : "s"} available</p>
            </div>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <label>
              <span className={labelCls}>Region *</span>
              <select
                className={inputCls}
                value={regionId}
                disabled={Boolean(user?.regionId) && user?.role !== "super_admin"}
                onChange={(e) => setRegionId(e.target.value)}
              >
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className={labelCls}>Store *</span>
              <select className={inputCls} value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                {stores.length === 0 ? <option value="">No stores in this region</option> : null}
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="sm:col-span-2">
              <span className={labelCls}>Notes</span>
              <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional remarks for this transfer" />
            </label>
          </div>
        </div>

        <div className="border border-rlx-rule bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-rlx-rule bg-rlx-green px-5 py-4">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-white">Transfer lines</h3>
              <p className="mt-0.5 text-[11px] text-white/55">Search HO stock and enter the quantity to send.</p>
            </div>
            <span className="border border-white/30 px-2 py-0.5 text-[10px] font-bold text-white/80">
              {readyLines.length} ready
            </span>
          </div>

          <div className="space-y-3 p-4">
            {hoSkuCount === 0 ? (
              <div className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                No HO stock in this region.{" "}
                <Link to="/inventory/po-inward" className="font-semibold underline underline-offset-2">
                  Post a GRN
                </Link>{" "}
                first, then transfer from here.
              </div>
            ) : null}

            {lines.map((line, idx) => {
              const spare = spareById.get(line.spareId);
              const avail = line.spareId ? qtyBySpare.get(line.spareId) ?? 0 : null;
              const qtyN = Number(line.qty) || 0;
              const exceeds = avail != null && qtyN > avail;
              const remaining = avail == null ? null : avail - qtyN;
              return (
                <div
                  key={line.key}
                  className="relative z-0 overflow-visible border border-rlx-rule bg-white focus-within:z-40"
                >
                  <div className="flex flex-wrap items-end gap-2 px-3 py-2">
                    <div className="mb-px flex h-8 w-7 shrink-0 items-center justify-center bg-rlx-green text-[11px] font-bold text-white">
                      {idx + 1}
                    </div>
                    <div className="relative min-w-[200px] flex-1">
                      <FieldLabel>Select spare</FieldLabel>
                      <SparePicker
                        value={line.spareId}
                        onChange={(id) => {
                          const nextAvail = qtyBySpare.get(id) ?? 0;
                          const current = Math.max(1, Math.round(Number(line.qty) || 1));
                          const nextQty = nextAvail > 0 ? Math.min(current, Math.floor(nextAvail)) : current;
                          patchLine(line.key, { spareId: id, qty: String(Math.max(1, nextQty)) });
                        }}
                        spares={sparesForLine(line.key)}
                        className="relative mt-0.5"
                        compact
                        showSku={false}
                        getMeta={(s) => {
                          const q = qtyBySpare.get(s.id);
                          return q != null ? `HO ${q}` : undefined;
                        }}
                      />
                    </div>
                    <label className="w-[5.5rem] shrink-0">
                      <FieldLabel>HO stock</FieldLabel>
                      <input
                        readOnly
                        tabIndex={-1}
                        className={`${compactFieldCls} cursor-default bg-stone-50 text-right font-semibold tabular-nums ${
                          avail === 0 ? "text-red-600" : "text-rlx-green"
                        }`}
                        value={avail == null ? "—" : String(avail)}
                      />
                    </label>
                    <label className="w-24 shrink-0">
                      <FieldLabel>Qty *</FieldLabel>
                      <input
                        type="number"
                        min={1}
                        max={avail ?? undefined}
                        step={1}
                        inputMode="numeric"
                        className={`${compactFieldCls} text-right font-semibold tabular-nums ${
                          exceeds ? "border-red-400 text-red-700 focus:border-red-500" : ""
                        }`}
                        value={line.qty}
                        onChange={(e) => patchLine(line.key, { qty: e.target.value })}
                      />
                    </label>
                    <button
                      type="button"
                      className="mb-px h-8 shrink-0 px-2 text-[11px] font-semibold uppercase tracking-widest text-stone-400 hover:text-red-600"
                      onClick={() =>
                        setLines((prev) => (prev.length === 1 ? [newExtraLine()] : prev.filter((l) => l.key !== line.key)))
                      }
                    >
                      Remove
                    </button>
                  </div>
                  {spare ? (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 border-t border-rlx-rule bg-stone-50/60 px-3 py-1.5 text-[11px] text-stone-500">
                      <span>
                        Part <span className="font-mono text-stone-800">{spare.sku}</span>
                      </span>
                      <span className="truncate text-stone-700">{spare.name}</span>
                      {spare.category ? <span>{spare.category}</span> : null}
                      <span>UOM Nos</span>
                      <span className={remaining != null && remaining < 0 ? "text-red-600" : ""}>
                        After {remaining}
                      </span>
                    </div>
                  ) : null}
                  {exceeds ? (
                    <p className="px-3 pb-2 text-[11px] text-red-600">Cannot exceed HO stock ({avail}).</p>
                  ) : null}
                </div>
              );
            })}

            <button
              type="button"
              className="w-full border border-dashed border-rlx-rule py-2 text-sm font-semibold text-rlx-green transition hover:border-rlx-green hover:bg-rlx-green/5"
              onClick={() => setLines((prev) => [...prev, newExtraLine()])}
            >
              + Add another spare
            </button>
          </div>

          <div className="sticky bottom-0 z-10 flex flex-col gap-2 border-t border-rlx-rule bg-white px-4 py-3 shadow-[0_-8px_16px_rgba(0,0,0,0.04)] sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-stone-600">
              <p>
                <span className="font-semibold text-stone-800">{readyLines.length}</span> spare
                {readyLines.length === 1 ? "" : "s"} ·{" "}
                <span className="font-semibold tabular-nums text-stone-800">{totalQty.toLocaleString("en-IN")}</span> unit
                {totalQty === 1 ? "" : "s"}
              </p>
              <p className="text-[12px] text-stone-400">
                {regionName && selectedStore
                  ? `${regionName} → ${selectedStore.name}`
                  : "Select a destination store"}
              </p>
            </div>
            <button
              type="submit"
              disabled={busy || readyLines.length === 0 || overstock || !storeId}
              className="bg-rlx-green px-8 py-2.5 text-sm font-semibold text-white transition hover:bg-rlx-green/90 disabled:opacity-40"
            >
              {busy ? "Transferring…" : "Transfer to store"}
            </button>
          </div>
        </div>
      </form>

      <ProcessSuccessModal
        open={!!result}
        title="Transferred successfully"
        description={
          result ? `${result.movedQty} unit(s) moved to ${result.storeName}.` : undefined
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
