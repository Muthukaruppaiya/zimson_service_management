import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { FilterField } from "../../components/ui/FilterField";
import { PageHeader } from "../../components/ui/PageHeader";
import { useRegions } from "../../context/RegionsContext";
import { ApiError, apiJson } from "../../lib/api";
import type { SparePart, SpareStockRow } from "../../types/spare";
import { downloadCsv } from "./serviceReportUtils";

type OverviewRow = {
  spare: SparePart;
  stock: SpareStockRow[];
};

type StockLine = {
  key: string;
  spareId: string;
  sku: string;
  name: string;
  category: string;
  locationType: "HO" | "STORE";
  regionId: string;
  storeId: string | null;
  regionName: string;
  storeName: string;
  qty: number;
  updatedAt: string | null;
};

type StockHistoryRow = {
  id: string;
  spareId: string;
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

const CSV_COLUMNS = ["SKU", "Item", "Category", "Location", "Region", "Store", "Qty", "Last Updated"];

const btnIcon =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center border border-rlx-gold/60 bg-white text-rlx-green transition hover:border-rlx-gold hover:bg-rlx-green-light";
const modalIconGhost =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center border border-white/30 bg-white/10 text-white transition hover:bg-white/20";

function eventLabel(eventType: string) {
  if (eventType === "SPARE_CREATED") return "Spare created";
  if (eventType === "MANUAL_STOCK_SET") return "Manual stock update";
  if (eventType === "PURCHASE_IN") return "Purchase inward";
  if (eventType === "TRANSFER_OUT") return "Transfer out";
  if (eventType === "TRANSFER_IN") return "Transfer in";
  return eventType;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
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

export function StockInHandReportPage() {
  const { regions } = useRegions();
  const [lines, setLines] = useState<StockLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [locationType, setLocationType] = useState<"ALL" | "HO" | "STORE">("ALL");
  const [regionId, setRegionId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [category, setCategory] = useState("");

  const [detail, setDetail] = useState<StockLine | null>(null);
  const [history, setHistory] = useState<StockHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyScopeMode, setHistoryScopeMode] = useState<"LOCATION" | "ALL">("LOCATION");

  const regionNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of regions) m.set(r.id, r.name);
    return m;
  }, [regions]);

  const storeNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of regions) {
      for (const s of r.stores) m.set(s.id, s.name);
    }
    return m;
  }, [regions]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiJson<{ rows: OverviewRow[] }>("/api/inventory/stock-price-overview");
      const flat: StockLine[] = [];
      for (const row of data.rows ?? []) {
        for (const stock of row.stock) {
          const qty = Number(stock.quantity ?? 0);
          if (qty <= 0) continue;
          flat.push({
            key: `${row.spare.id}:${stock.id}`,
            spareId: row.spare.id,
            sku: row.spare.sku,
            name: row.spare.name,
            category: row.spare.category || "—",
            locationType: stock.locationType,
            regionId: stock.regionId,
            storeId: stock.storeId,
            regionName: regionNameById.get(stock.regionId) ?? stock.regionId,
            storeName:
              stock.locationType === "STORE" && stock.storeId
                ? storeNameById.get(stock.storeId) ?? stock.storeId
                : stock.locationType === "HO"
                  ? "HO"
                  : "—",
            qty,
            updatedAt: stock.updatedAt ?? null,
          });
        }
      }
      flat.sort((a, b) => a.sku.localeCompare(b.sku) || a.locationType.localeCompare(b.locationType));
      setLines(flat);
    } catch (e) {
      setLines([]);
      setError(e instanceof ApiError ? e.message : "Could not load spare stock.");
    } finally {
      setLoading(false);
    }
  }, [regionNameById, storeNameById]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const loadHistory = useCallback(async (line: StockLine, mode: "LOCATION" | "ALL") => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const q = new URLSearchParams();
      q.set("limit", "200");
      if (mode === "LOCATION") {
        q.set("locationType", line.locationType);
        q.set("regionId", line.regionId);
        if (line.locationType === "STORE" && line.storeId) q.set("storeId", line.storeId);
      }
      const data = await apiJson<{ history: StockHistoryRow[] }>(
        `/api/catalog/spares/${encodeURIComponent(line.spareId)}/stock-history?${q.toString()}`,
      );
      setHistory(data.history ?? []);
    } catch (e) {
      setHistory([]);
      setHistoryError(e instanceof ApiError ? e.message : "Could not load stock history.");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  function openDetail(line: StockLine) {
    setDetail(line);
    setHistoryScopeMode("LOCATION");
    void loadHistory(line, "LOCATION");
  }

  function closeDetail() {
    setDetail(null);
    setHistory([]);
    setHistoryError(null);
  }

  function resetFilters() {
    setQuery("");
    setLocationType("ALL");
    setRegionId("");
    setStoreId("");
    setCategory("");
  }

  const storeOptions = useMemo(() => {
    const opts: { id: string; name: string }[] = [];
    for (const r of regions) {
      if (regionId && r.id !== regionId) continue;
      for (const s of r.stores) opts.push({ id: s.id, name: s.name });
    }
    return opts.sort((a, b) => a.name.localeCompare(b.name));
  }, [regions, regionId]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const line of lines) {
      if (line.category && line.category !== "—") set.add(line.category);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [lines]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lines.filter((line) => {
      if (locationType !== "ALL" && line.locationType !== locationType) return false;
      if (regionId && line.regionId !== regionId) return false;
      if (storeId && line.storeId !== storeId) return false;
      if (category && line.category !== category) return false;
      if (q) {
        const hay = `${line.sku} ${line.name} ${line.category} ${line.regionName} ${line.storeName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [lines, query, locationType, regionId, storeId, category]);

  const totalQty = useMemo(() => filtered.reduce((sum, row) => sum + row.qty, 0), [filtered]);

  const csvRows = useMemo(
    () =>
      filtered.map((line) => ({
        SKU: line.sku,
        Item: line.name,
        Category: line.category,
        Location: line.locationType,
        Region: line.regionName,
        Store: line.storeName,
        Qty: line.qty,
        "Last Updated": line.updatedAt ? new Date(line.updatedAt).toLocaleString() : "—",
      })),
    [filtered],
  );

  return (
    <div className="ui-page-bleed px-3 font-sans text-rlx-ink sm:px-4 md:px-5">
      <PageHeader
        title="Stock in hand report"
        description="Current spare parts stock in hand by location."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => downloadCsv(`stock_in_hand_${new Date().toISOString().slice(0, 10)}.csv`, CSV_COLUMNS, csvRows)}
              className="inline-flex border border-rlx-rule bg-white px-4 py-2.5 text-sm font-semibold text-rlx-green transition hover:border-rlx-green hover:bg-rlx-green-light disabled:opacity-40"
              disabled={filtered.length === 0}
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => void refresh()}
              className="inline-flex border border-rlx-rule bg-white px-4 py-2.5 text-sm font-semibold text-rlx-green transition hover:border-rlx-green hover:bg-rlx-green-light"
            >
              Refresh
            </button>
          </div>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="border border-rlx-rule bg-white shadow-sm">
          <div className="border-b-2 border-rlx-gold bg-rlx-green px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white">Spare lines</p>
          </div>
          <p className="px-3 py-3 text-lg font-semibold text-rlx-green">{filtered.length}</p>
        </div>
        <div className="border border-rlx-rule bg-white shadow-sm">
          <div className="border-b-2 border-rlx-gold bg-rlx-green px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white">Total quantity</p>
          </div>
          <p className="px-3 py-3 text-lg font-semibold text-rlx-green">{totalQty.toLocaleString()}</p>
        </div>
        <div className="border border-rlx-rule bg-white shadow-sm">
          <div className="border-b-2 border-rlx-gold bg-rlx-green px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white">Scope</p>
          </div>
          <p className="px-3 py-3 text-sm text-rlx-ink">HO + store stock (qty &gt; 0)</p>
        </div>
      </div>

      <section className="mb-5 border border-rlx-rule bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rlx-rule bg-rlx-bg px-3 py-2.5 sm:px-4">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-rlx-ink-muted">Filters</h2>
          <button type="button" onClick={resetFilters} className="ui-btn-secondary">
            Reset
          </button>
        </div>
        <div className="ui-filter-grid p-3 sm:p-4">
          <FilterField label="Search" htmlFor="sih-q" className="ui-filter-span-2-sm min-w-0">
            <input
              id="sih-q"
              className="ui-field"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="SKU, item, category, store…"
            />
          </FilterField>
          <FilterField label="Location" htmlFor="sih-loc" className="min-w-0">
            <select
              id="sih-loc"
              className="ui-field"
              value={locationType}
              onChange={(e) => setLocationType(e.target.value as "ALL" | "HO" | "STORE")}
            >
              <option value="ALL">All locations</option>
              <option value="HO">HO only</option>
              <option value="STORE">Store only</option>
            </select>
          </FilterField>
          <FilterField label="Region" htmlFor="sih-region" className="min-w-0">
            <select
              id="sih-region"
              className="ui-field"
              value={regionId}
              onChange={(e) => {
                setRegionId(e.target.value);
                setStoreId("");
              }}
            >
              <option value="">All regions</option>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Store" htmlFor="sih-store" className="min-w-0">
            <select
              id="sih-store"
              className="ui-field"
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              disabled={locationType === "HO"}
            >
              <option value="">All stores</option>
              {storeOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Category" htmlFor="sih-cat" className="min-w-0">
            <select id="sih-cat" className="ui-field" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </FilterField>
        </div>
      </section>

      {error ? (
        <p className="mb-4 border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
      ) : null}

      {loading ? (
        <p className="text-sm text-rlx-ink-muted">Loading spare stock…</p>
      ) : filtered.length === 0 ? (
        <p className="border border-rlx-rule bg-white px-4 py-8 text-center text-sm text-rlx-ink-muted">
          No spare stock matches the current filters.
        </p>
      ) : (
        <>
          <p className="mb-2 text-xs text-rlx-ink-muted md:hidden">Swipe horizontally to see more columns →</p>
          <div className="ui-table-scroll border border-rlx-rule bg-white shadow-sm">
            <table className="ui-table-dense w-full min-w-[42rem] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-rlx-green text-[11px] font-semibold uppercase tracking-[0.14em] text-white">
                <tr className="border-b-2 border-rlx-gold">
                  <th className="whitespace-nowrap px-3 py-3 text-left font-semibold">SKU</th>
                  <th className="min-w-[12rem] px-3 py-3 text-left font-semibold">Item</th>
                  <th className="whitespace-nowrap px-3 py-3 text-left font-semibold">Location</th>
                  <th className="min-w-[10rem] px-3 py-3 text-left font-semibold">Place</th>
                  <th className="whitespace-nowrap px-3 py-3 text-right font-semibold">Qty</th>
                  <th className="whitespace-nowrap px-3 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((line, idx) => (
                  <tr
                    key={line.key}
                    onClick={() => openDetail(line)}
                    className={`cursor-pointer border-b border-rlx-rule transition-colors hover:bg-rlx-green-light ${
                      idx % 2 === 1 ? "bg-rlx-bg" : "bg-white"
                    }`}
                  >
                    <td className="align-middle px-3 py-3">
                      <span className="block whitespace-nowrap font-mono text-sm font-semibold text-rlx-green">
                        {line.sku}
                      </span>
                    </td>
                    <td className="align-middle px-3 py-3">
                      <span className="block whitespace-normal break-words text-sm font-medium leading-snug text-rlx-ink">
                        {line.name}
                      </span>
                      <span className="block text-xs leading-snug text-rlx-ink-muted">{line.category}</span>
                    </td>
                    <td className="align-middle px-3 py-3">
                      <span
                        className={`inline-flex min-w-[4.5rem] items-center justify-center rounded px-2 py-1 text-xs font-semibold ring-1 ring-inset ${
                          line.locationType === "HO"
                            ? "bg-sky-50 text-sky-900 ring-sky-300/70"
                            : "bg-amber-50 text-amber-950 ring-amber-300/70"
                        }`}
                      >
                        {line.locationType}
                      </span>
                    </td>
                    <td className="align-middle px-3 py-3">
                      <span className="block whitespace-normal break-words text-sm leading-snug text-rlx-ink">
                        {line.locationType === "HO" ? line.regionName : line.storeName}
                      </span>
                      {line.locationType === "STORE" ? (
                        <span className="block text-xs leading-snug text-rlx-ink-muted">{line.regionName}</span>
                      ) : null}
                    </td>
                    <td className="align-middle px-3 py-3 whitespace-nowrap text-right text-sm font-semibold tabular-nums text-rlx-green">
                      {line.qty.toLocaleString()}
                    </td>
                    <td className="align-middle px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => openDetail(line)}
                          className={btnIcon}
                          title="Details & history"
                          aria-label="Details and history"
                        >
                          <IconDetails />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-rlx-ink-muted">
            {filtered.length} of {lines.length} line(s)
          </p>
        </>
      )}

      {detail ? (
        <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-rlx-ink/70 p-0 backdrop-blur-sm sm:items-center sm:p-3 md:p-5">
          <div className="flex h-[100dvh] w-full max-w-[96rem] flex-col overflow-hidden bg-white shadow-[0_32px_80px_-20px_rgba(0,0,0,0.5)] sm:h-[min(96dvh,56rem)] sm:max-h-[96dvh]">
            <div className="flex shrink-0 items-center justify-between gap-3 bg-rlx-green px-4 py-3 sm:px-6">
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-semibold uppercase tracking-[0.35em] text-rlx-gold">Stock details</p>
                <h3 className="truncate font-mono text-base font-semibold text-white sm:text-lg">{detail.sku}</h3>
                <p className="mt-0.5 truncate text-xs text-white/65 sm:text-sm">
                  {detail.name} · {detail.locationType} · qty {detail.qty.toLocaleString()}
                </p>
              </div>
              <button type="button" onClick={closeDetail} className={modalIconGhost} title="Close" aria-label="Close">
                <IconClose />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
              <div className="shrink-0 border-b border-rlx-rule p-4 sm:p-5 lg:w-[22rem] lg:border-b-0 lg:border-r lg:overflow-y-auto">
                <div className="overflow-hidden border border-rlx-rule">
                  <table className="w-full text-left">
                    <tbody className="odd:[&>tr]:bg-white even:[&>tr]:bg-rlx-bg">
                      <DetailRow label="SKU" value={<span className="font-mono font-semibold text-rlx-green">{detail.sku}</span>} />
                      <DetailRow label="Item" value={detail.name} />
                      <DetailRow label="Category" value={detail.category} />
                      <DetailRow label="Location" value={detail.locationType} />
                      <DetailRow label="Region" value={detail.regionName} />
                      <DetailRow label="Store" value={detail.storeName} />
                      <DetailRow
                        label="Quantity"
                        value={<span className="font-semibold text-rlx-green">{detail.qty.toLocaleString()}</span>}
                      />
                      <DetailRow label="Last updated" value={formatDateTime(detail.updatedAt)} />
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex min-h-0 min-w-0 flex-1 flex-col p-4 sm:p-5">
                <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
                  <h4 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rlx-ink-muted">
                    Full stock history
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setHistoryScopeMode("LOCATION");
                        void loadHistory(detail, "LOCATION");
                      }}
                      className={`px-3 py-1.5 text-xs font-semibold transition ${
                        historyScopeMode === "LOCATION"
                          ? "bg-rlx-green text-white"
                          : "border border-rlx-rule bg-white text-rlx-green hover:bg-rlx-green-light"
                      }`}
                    >
                      This location
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setHistoryScopeMode("ALL");
                        void loadHistory(detail, "ALL");
                      }}
                      className={`px-3 py-1.5 text-xs font-semibold transition ${
                        historyScopeMode === "ALL"
                          ? "bg-rlx-green text-white"
                          : "border border-rlx-rule bg-white text-rlx-green hover:bg-rlx-green-light"
                      }`}
                    >
                      All locations
                    </button>
                    <button
                      type="button"
                      onClick={() => void loadHistory(detail, historyScopeMode)}
                      className="border border-rlx-rule bg-white px-3 py-1.5 text-xs font-semibold text-rlx-green hover:bg-rlx-green-light"
                    >
                      Refresh
                    </button>
                  </div>
                </div>

                {historyError ? (
                  <p className="mb-3 shrink-0 border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                    {historyError}
                  </p>
                ) : null}

                {historyLoading ? (
                  <p className="text-sm text-rlx-ink-muted">Loading history…</p>
                ) : history.length === 0 ? (
                  <p className="border border-rlx-rule bg-rlx-bg px-3 py-6 text-center text-sm text-rlx-ink-muted">
                    No stock history in current scope.
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
                          <th className="px-3 py-2.5 text-left">Place</th>
                          <th className="px-3 py-2.5 text-right">Change</th>
                          <th className="px-3 py-2.5 text-right">Balance</th>
                          <th className="px-3 py-2.5 text-left">Reference</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.map((h, idx) => {
                          const place =
                            h.locationType === "STORE"
                              ? h.storeName ?? storeNameById.get(h.storeId ?? "") ?? h.storeId ?? "Store"
                              : h.locationType === "HO"
                                ? h.regionName ?? regionNameById.get(h.regionId ?? "") ?? "HO"
                                : "Master";
                          const change = h.quantityChange;
                          return (
                            <tr
                              key={h.id}
                              className={`border-b border-rlx-rule ${idx % 2 === 1 ? "bg-rlx-bg" : "bg-white"}`}
                            >
                              <td className="px-3 py-2.5 align-top text-xs leading-snug text-rlx-ink-muted">
                                {formatDateTime(h.createdAt)}
                              </td>
                              <td className="px-3 py-2.5 align-top text-sm leading-snug text-rlx-ink">
                                {eventLabel(h.eventType)}
                              </td>
                              <td className="px-3 py-2.5 align-top text-sm leading-snug text-rlx-ink">
                                <span className="block break-words">{place}</span>
                                {h.note ? (
                                  <span className="mt-0.5 block break-words text-xs text-rlx-ink-muted">{h.note}</span>
                                ) : null}
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
                              <td className="px-3 py-2.5 align-top text-right text-sm font-semibold tabular-nums text-rlx-ink">
                                {h.balanceAfter == null ? "—" : h.balanceAfter.toLocaleString()}
                              </td>
                              <td className="break-words px-3 py-2.5 align-top text-xs leading-snug text-rlx-ink-muted">
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
