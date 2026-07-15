import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { FilterField } from "../../components/ui/FilterField";
import { InventoryBreadcrumb } from "../../components/inventory/InventoryBreadcrumb";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useRegions } from "../../context/RegionsContext";
import { useSpares } from "../../context/SparesContext";
import { ApiError, apiJson } from "../../lib/api";
import type { SpareStockRow } from "../../types/spare";

const btnIcon =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center border border-rlx-gold/60 bg-white text-rlx-green transition hover:border-rlx-gold hover:bg-rlx-green-light";
const modalIconGhost =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center border border-white/30 bg-white/10 text-white transition hover:bg-white/20";

type StockHistoryRow = {
  id: string;
  eventType: string;
  locationType: "HO" | "STORE" | null;
  regionId: string | null;
  storeId: string | null;
  quantityChange: number | null;
  balanceAfter: number | null;
  referenceType: string | null;
  referenceNumber: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
  regionName?: string | null;
  storeName?: string | null;
};

function eventLabel(eventType: string) {
  if (eventType === "SPARE_CREATED") return "Spare created";
  if (eventType === "MANUAL_STOCK_SET") return "Manual stock update";
  if (eventType === "PURCHASE_IN") return "Purchase inward";
  if (eventType === "TRANSFER_OUT") return "Transfer out";
  if (eventType === "TRANSFER_IN") return "Transfer in";
  return eventType.replace(/_/g, " ");
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function IconDetails({ className = "h-[1.125rem] w-[1.125rem]" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
      />
    </svg>
  );
}

function IconClose({ className = "h-[1.125rem] w-[1.125rem]" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <tr className="border-b border-rlx-rule">
      <th className="w-40 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.12em] text-rlx-ink-muted align-top">
        {label}
      </th>
      <td className="px-3 py-2.5 text-sm text-rlx-ink">{value}</td>
    </tr>
  );
}

export function InventoryStockAdjustmentPage() {
  const { user } = useAuth();
  const { regions } = useRegions();
  const { spares } = useSpares();
  const [selectedId, setSelectedId] = useState("");
  const [locationType, setLocationType] = useState<"HO" | "STORE">("STORE");
  const [regionId, setRegionId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [stockQty, setStockQty] = useState("0");
  const [stockRows, setStockRows] = useState<SpareStockRow[]>([]);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const [listFilter, setListFilter] = useState<"ALL" | "HO" | "STORE">("ALL");
  const [listRegionId, setListRegionId] = useState("");
  const [listQuery, setListQuery] = useState("");

  const [detail, setDetail] = useState<SpareStockRow | null>(null);
  const [history, setHistory] = useState<StockHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const hoOnlyRole =
    user?.role === "service_centre_clerk" || user?.role === "service_centre_supervisor" || user?.role === "technician";
  const storeOnlyRole = user?.role === "store_user";

  useEffect(() => {
    if (regions.length > 0 && !regionId) setRegionId(regions[0]!.id);
  }, [regions, regionId]);

  useEffect(() => {
    if (!selectedId && spares.length > 0) setSelectedId(spares[0]!.id);
  }, [selectedId, spares]);

  useEffect(() => {
    if (!user) return;
    if (user.role !== "super_admin") {
      if (user.regionId) setRegionId(user.regionId);
      if (user.role === "store_user") {
        setLocationType("STORE");
        setStoreId(user.storeId ?? "");
      } else if (hoOnlyRole) {
        setLocationType("HO");
        setStoreId("");
      }
    }
  }, [user, hoOnlyRole]);

  const currentStores = useMemo(
    () => regions.find((r) => r.id === regionId)?.stores ?? [],
    [regions, regionId],
  );

  const regionNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of regions) map.set(r.id, r.name);
    return map;
  }, [regions]);

  const storeNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of regions) for (const s of r.stores) map.set(s.id, s.name);
    return map;
  }, [regions]);

  const selectedSpare = useMemo(
    () => spares.find((s) => s.id === selectedId) ?? null,
    [spares, selectedId],
  );

  useEffect(() => {
    if (locationType === "STORE") {
      if (currentStores.length > 0 && !currentStores.some((s) => s.id === storeId)) {
        setStoreId(currentStores[0]!.id);
      }
    } else {
      setStoreId("");
    }
  }, [locationType, currentStores, storeId]);

  const loadStock = useCallback(async (spareId: string) => {
    try {
      const data = await apiJson<{ stock: SpareStockRow[] }>(
        `/api/catalog/spares/${encodeURIComponent(spareId)}/stock`,
      );
      setStockRows(data.stock ?? []);
    } catch {
      setStockRows([]);
    }
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    void loadStock(selectedId);
  }, [selectedId, loadStock]);

  const filteredStock = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    return stockRows.filter((row) => {
      if (listFilter !== "ALL" && row.locationType !== listFilter) return false;
      if (listRegionId && row.regionId !== listRegionId) return false;
      if (q) {
        const region = regionNameById.get(row.regionId) ?? row.regionId;
        const store = row.storeId ? storeNameById.get(row.storeId) ?? row.storeId : "";
        const hay = `${row.locationType} ${region} ${store} ${row.quantity}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [stockRows, listFilter, listRegionId, listQuery, regionNameById, storeNameById]);

  const totalQty = useMemo(
    () => filteredStock.reduce((sum, r) => sum + Number(r.quantity ?? 0), 0),
    [filteredStock],
  );
  const hoLines = useMemo(() => filteredStock.filter((r) => r.locationType === "HO").length, [filteredStock]);
  const storeLines = useMemo(() => filteredStock.filter((r) => r.locationType === "STORE").length, [filteredStock]);

  async function loadHistory(row: SpareStockRow) {
    if (!selectedId) return;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const q = new URLSearchParams();
      q.set("limit", "200");
      q.set("locationType", row.locationType);
      q.set("regionId", row.regionId);
      if (row.locationType === "STORE" && row.storeId) q.set("storeId", row.storeId);
      const data = await apiJson<{ history: StockHistoryRow[] }>(
        `/api/catalog/spares/${encodeURIComponent(selectedId)}/stock-history?${q.toString()}`,
      );
      setHistory(data.history ?? []);
    } catch (e) {
      setHistory([]);
      setHistoryError(e instanceof ApiError ? e.message : "Could not load stock history.");
    } finally {
      setHistoryLoading(false);
    }
  }

  function openDetail(row: SpareStockRow) {
    setDetail(row);
    void loadHistory(row);
  }

  function closeDetail() {
    setDetail(null);
    setHistory([]);
    setHistoryError(null);
  }

  async function saveStockLine(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    const qty = Number(stockQty);
    if (!regionId || Number.isNaN(qty) || qty < 0 || (locationType === "STORE" && !storeId)) {
      setMsg({ type: "err", text: "Select region/store and enter non-negative quantity." });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      await apiJson(`/api/catalog/spares/${encodeURIComponent(selectedId)}/stock`, {
        method: "POST",
        json: {
          locationType,
          regionId,
          storeId: locationType === "STORE" ? storeId : null,
          quantity: qty,
          mode: "add",
        },
      });
      setMsg({ type: "ok", text: "Stock adjusted." });
      setStockQty("0");
      await loadStock(selectedId);
    } catch (err) {
      setMsg({ type: "err", text: err instanceof ApiError ? err.message : "Could not save stock." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ui-page-bleed px-3 font-sans text-rlx-ink sm:px-4 md:px-5">
      <InventoryBreadcrumb current="Stock adjustment" />
      <PageHeader
        title="Stock adjustment"
        description="Adjust spare stock by HO / store location and review balances."
        actions={
          <Link
            to="/inventory"
            className="inline-flex border border-rlx-rule bg-white px-4 py-2.5 text-sm font-semibold text-rlx-green no-underline transition hover:border-rlx-green hover:bg-rlx-green-light"
          >
            Inventory home
          </Link>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="border border-rlx-rule bg-white shadow-sm">
          <div className="border-b-2 border-rlx-gold bg-rlx-green px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white">Total qty</p>
          </div>
          <p className="px-3 py-3 text-lg font-semibold text-rlx-green">{totalQty.toLocaleString()}</p>
        </div>
        <div className="border border-rlx-rule bg-white shadow-sm">
          <div className="border-b-2 border-rlx-gold bg-rlx-green px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white">HO lines</p>
          </div>
          <p className="px-3 py-3 text-lg font-semibold text-rlx-ink">{hoLines}</p>
        </div>
        <div className="border border-rlx-rule bg-white shadow-sm">
          <div className="border-b-2 border-rlx-gold bg-rlx-green px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white">Store lines</p>
          </div>
          <p className="px-3 py-3 text-lg font-semibold text-rlx-ink">{storeLines}</p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <section className="border border-rlx-rule bg-white shadow-sm">
          <div className="border-b-2 border-rlx-gold bg-rlx-green px-3 py-2.5 sm:px-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white">Adjust stock</h2>
          </div>
          <form onSubmit={(e) => void saveStockLine(e)} className="space-y-3 p-3 sm:p-4">
            <FilterField label="Spare" htmlFor="adj-spare">
              <select
                id="adj-spare"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="ui-field"
              >
                {spares.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.sku} — {s.name}
                  </option>
                ))}
              </select>
            </FilterField>
            <div className="grid gap-3 sm:grid-cols-2">
              <FilterField label="Location" htmlFor="adj-loc">
                <select
                  id="adj-loc"
                  value={locationType}
                  onChange={(e) => setLocationType(e.target.value as "HO" | "STORE")}
                  className="ui-field"
                  disabled={storeOnlyRole || hoOnlyRole}
                >
                  <option value="STORE">Store</option>
                  <option value="HO">HO / Service Centre</option>
                </select>
              </FilterField>
              <FilterField label="Region" htmlFor="adj-region">
                <select
                  id="adj-region"
                  value={regionId}
                  onChange={(e) => setRegionId(e.target.value)}
                  className="ui-field"
                  disabled={Boolean(user && user.role !== "super_admin")}
                >
                  <option value="">Select region</option>
                  {regions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </FilterField>
            </div>
            {locationType === "STORE" ? (
              <FilterField label="Store" htmlFor="adj-store">
                <select
                  id="adj-store"
                  value={storeId}
                  onChange={(e) => setStoreId(e.target.value)}
                  className="ui-field"
                  disabled={storeOnlyRole}
                >
                  <option value="">Select store</option>
                  {currentStores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </FilterField>
            ) : null}
            <FilterField label="Add quantity" htmlFor="adj-qty">
              <input
                id="adj-qty"
                type="number"
                min={0}
                step={0.001}
                value={stockQty}
                onChange={(e) => setStockQty(e.target.value)}
                className="ui-field"
                placeholder="Quantity to add"
              />
            </FilterField>
            <button
              type="submit"
              disabled={saving || !selectedId}
              className="w-full border border-rlx-gold/70 bg-rlx-gold px-4 py-2.5 text-sm font-semibold text-rlx-green-deep transition hover:bg-rlx-gold-dark disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save stock"}
            </button>
            {msg ? (
              <p
                className={`border px-3 py-2 text-sm ${
                  msg.type === "ok"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-rose-200 bg-rose-50 text-rose-800"
                }`}
              >
                {msg.text}
              </p>
            ) : null}
            {selectedSpare ? (
              <p className="text-xs text-rlx-ink-muted">
                Adjusting <span className="font-mono font-semibold text-rlx-green">{selectedSpare.sku}</span> — quantity
                is added to existing balance.
              </p>
            ) : null}
          </form>
        </section>

        <section className="min-w-0">
          <div className="mb-3 border border-rlx-rule bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rlx-rule bg-rlx-bg px-3 py-2.5 sm:px-4">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-rlx-ink-muted">
                Stock by location
              </h2>
              <button
                type="button"
                onClick={() => {
                  setListFilter("ALL");
                  setListRegionId("");
                  setListQuery("");
                }}
                className="ui-btn-secondary"
              >
                Reset
              </button>
            </div>
            <div className="ui-filter-grid p-3 sm:p-4">
              <FilterField label="Search" htmlFor="stock-q" className="ui-filter-span-2-sm min-w-0">
                <input
                  id="stock-q"
                  className="ui-field"
                  value={listQuery}
                  onChange={(e) => setListQuery(e.target.value)}
                  placeholder="Region, store…"
                />
              </FilterField>
              <FilterField label="Type" htmlFor="stock-type" className="min-w-0">
                <select
                  id="stock-type"
                  className="ui-field"
                  value={listFilter}
                  onChange={(e) => setListFilter(e.target.value as typeof listFilter)}
                >
                  <option value="ALL">All</option>
                  <option value="HO">HO</option>
                  <option value="STORE">Store</option>
                </select>
              </FilterField>
              <FilterField label="Region" htmlFor="stock-region" className="min-w-0">
                <select
                  id="stock-region"
                  className="ui-field"
                  value={listRegionId}
                  onChange={(e) => setListRegionId(e.target.value)}
                >
                  <option value="">All regions</option>
                  {regions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </FilterField>
            </div>
          </div>

          {filteredStock.length === 0 ? (
            <p className="border border-rlx-rule bg-white px-4 py-8 text-center text-sm text-rlx-ink-muted">
              No stock rows for this spare / filters.
            </p>
          ) : (
            <div className="ui-table-scroll border border-rlx-rule bg-white shadow-sm">
              <table className="ui-table-dense w-full min-w-[36rem] text-left text-sm">
                <thead className="sticky top-0 z-10 bg-rlx-green text-[11px] font-semibold uppercase tracking-[0.14em] text-white">
                  <tr className="border-b-2 border-rlx-gold">
                    <th className="whitespace-nowrap px-3 py-3 text-left font-semibold">Type</th>
                    <th className="min-w-[12rem] px-3 py-3 text-left font-semibold">Place</th>
                    <th className="whitespace-nowrap px-3 py-3 text-right font-semibold">Qty</th>
                    <th className="whitespace-nowrap px-3 py-3 text-left font-semibold">Updated</th>
                    <th className="whitespace-nowrap px-3 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStock.map((row, idx) => {
                    const regionName = regionNameById.get(row.regionId) ?? row.regionId;
                    const storeName = row.storeId ? storeNameById.get(row.storeId) ?? row.storeId : null;
                    return (
                      <tr
                        key={row.id}
                        onClick={() => openDetail(row)}
                        className={`cursor-pointer border-b border-rlx-rule transition-colors hover:bg-rlx-green-light ${
                          idx % 2 === 1 ? "bg-rlx-bg" : "bg-white"
                        }`}
                      >
                        <td className="align-middle px-3 py-3">
                          <span
                            className={`inline-flex min-w-[4.5rem] items-center justify-center rounded px-2 py-1 text-xs font-semibold ring-1 ring-inset ${
                              row.locationType === "HO"
                                ? "bg-sky-50 text-sky-900 ring-sky-300/70"
                                : "bg-amber-50 text-amber-950 ring-amber-300/70"
                            }`}
                          >
                            {row.locationType}
                          </span>
                        </td>
                        <td className="align-middle px-3 py-3">
                          <span className="block break-words text-sm font-medium text-rlx-ink">
                            {row.locationType === "HO" ? regionName : storeName ?? "—"}
                          </span>
                          {row.locationType === "STORE" ? (
                            <span className="block text-xs text-rlx-ink-muted">{regionName}</span>
                          ) : null}
                        </td>
                        <td className="align-middle whitespace-nowrap px-3 py-3 text-right text-sm font-semibold tabular-nums text-rlx-green">
                          {Number(row.quantity ?? 0).toLocaleString()}
                        </td>
                        <td className="align-middle whitespace-nowrap px-3 py-3 text-xs text-rlx-ink-muted">
                          {formatDateTime(row.updatedAt)}
                        </td>
                        <td className="align-middle px-3 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => openDetail(row)}
                              className={btnIcon}
                              title="Details & history"
                              aria-label="Details and history"
                            >
                              <IconDetails />
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
          {filteredStock.length > 0 ? (
            <p className="mt-2 text-sm text-rlx-ink-muted">
              {filteredStock.length} of {stockRows.length} location(s)
            </p>
          ) : null}
        </section>
      </div>

      {detail && selectedSpare ? (
        <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-rlx-ink/70 p-0 backdrop-blur-sm sm:items-center sm:p-3 md:p-5">
          <div className="flex h-[100dvh] w-full max-w-[96rem] flex-col overflow-hidden bg-white shadow-[0_32px_80px_-20px_rgba(0,0,0,0.5)] sm:h-[min(96dvh,56rem)] sm:max-h-[96dvh]">
            <div className="flex shrink-0 items-center justify-between gap-3 bg-rlx-green px-4 py-3 sm:px-6">
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-semibold uppercase tracking-[0.35em] text-rlx-gold">Stock location</p>
                <h3 className="truncate font-mono text-base font-semibold text-white sm:text-lg">
                  {selectedSpare.sku}
                </h3>
                <p className="mt-0.5 truncate text-xs text-white/65 sm:text-sm">
                  {selectedSpare.name} · {detail.locationType} · qty{" "}
                  {Number(detail.quantity ?? 0).toLocaleString()}
                </p>
              </div>
              <button type="button" onClick={closeDetail} className={modalIconGhost} title="Close" aria-label="Close">
                <IconClose />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
              <div className="shrink-0 border-b border-rlx-rule p-4 sm:p-5 lg:w-[22rem] lg:overflow-y-auto lg:border-b-0 lg:border-r">
                <div className="overflow-hidden border border-rlx-rule">
                  <table className="w-full text-left">
                    <tbody className="odd:[&>tr]:bg-white even:[&>tr]:bg-rlx-bg">
                      <DetailRow
                        label="SKU"
                        value={<span className="font-mono font-semibold text-rlx-green">{selectedSpare.sku}</span>}
                      />
                      <DetailRow label="Item" value={selectedSpare.name} />
                      <DetailRow label="Location" value={detail.locationType} />
                      <DetailRow label="Region" value={regionNameById.get(detail.regionId) ?? detail.regionId} />
                      <DetailRow
                        label="Store"
                        value={
                          detail.storeId ? storeNameById.get(detail.storeId) ?? detail.storeId : "—"
                        }
                      />
                      <DetailRow
                        label="Quantity"
                        value={
                          <span className="font-semibold text-rlx-green">
                            {Number(detail.quantity ?? 0).toLocaleString()}
                          </span>
                        }
                      />
                      <DetailRow label="Last updated" value={formatDateTime(detail.updatedAt)} />
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex min-h-0 min-w-0 flex-1 flex-col p-4 sm:p-5">
                <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
                  <h4 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rlx-ink-muted">
                    Full stock history
                  </h4>
                  <button
                    type="button"
                    onClick={() => void loadHistory(detail)}
                    className="border border-rlx-rule bg-white px-3 py-1.5 text-xs font-semibold text-rlx-green hover:bg-rlx-green-light"
                  >
                    Refresh
                  </button>
                </div>
                {historyError ? (
                  <p className="mb-3 border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{historyError}</p>
                ) : null}
                {historyLoading ? (
                  <p className="text-sm text-rlx-ink-muted">Loading history…</p>
                ) : history.length === 0 ? (
                  <p className="border border-rlx-rule bg-rlx-bg px-3 py-6 text-center text-sm text-rlx-ink-muted">
                    No stock history for this location.
                  </p>
                ) : (
                  <div className="min-h-0 flex-1 overflow-auto border border-rlx-rule">
                    <table className="w-full table-fixed text-left text-sm">
                      <colgroup>
                        <col className="w-[8.5rem]" />
                        <col className="w-[9.5rem]" />
                        <col />
                        <col className="w-[5rem]" />
                        <col className="w-[5rem]" />
                        <col className="w-[9rem]" />
                      </colgroup>
                      <thead className="sticky top-0 z-10 bg-rlx-bg text-[11px] font-semibold uppercase tracking-[0.12em] text-rlx-ink-muted">
                        <tr className="border-b border-rlx-rule">
                          <th className="px-3 py-2.5 text-left">When</th>
                          <th className="px-3 py-2.5 text-left">Event</th>
                          <th className="px-3 py-2.5 text-left">Note</th>
                          <th className="px-3 py-2.5 text-right">Change</th>
                          <th className="px-3 py-2.5 text-right">Balance</th>
                          <th className="px-3 py-2.5 text-left">Reference</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.map((h, idx) => {
                          const change = h.quantityChange;
                          return (
                            <tr
                              key={h.id}
                              className={`border-b border-rlx-rule ${idx % 2 === 1 ? "bg-rlx-bg" : "bg-white"}`}
                            >
                              <td className="px-3 py-2.5 align-top text-xs text-rlx-ink-muted">
                                {formatDateTime(h.createdAt)}
                              </td>
                              <td className="px-3 py-2.5 align-top text-sm">{eventLabel(h.eventType)}</td>
                              <td className="break-words px-3 py-2.5 align-top text-sm text-rlx-ink-muted">
                                {h.note || "—"}
                              </td>
                              <td
                                className={`px-3 py-2.5 align-top text-right text-sm font-semibold tabular-nums ${
                                  change == null
                                    ? "text-rlx-ink-muted"
                                    : change < 0
                                      ? "text-rose-700"
                                      : "text-emerald-700"
                                }`}
                              >
                                {change == null ? "—" : change.toLocaleString()}
                              </td>
                              <td className="px-3 py-2.5 align-top text-right text-sm font-semibold tabular-nums">
                                {h.balanceAfter == null ? "—" : h.balanceAfter.toLocaleString()}
                              </td>
                              <td className="break-words px-3 py-2.5 align-top text-xs text-rlx-ink-muted">
                                {h.referenceType && h.referenceNumber
                                  ? `${h.referenceType} ${h.referenceNumber}`
                                  : h.createdBy
                                    ? `By ${h.createdBy}`
                                    : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
