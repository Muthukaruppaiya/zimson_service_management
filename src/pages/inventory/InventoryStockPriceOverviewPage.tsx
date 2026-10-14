import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { InventoryBreadcrumb } from "../../components/inventory/InventoryBreadcrumb";
import { AppModal } from "../../components/ui/AppModal";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { TablePagination } from "../../components/ui/TablePagination";
import { usePagination } from "../../lib/usePagination";
import { useAuth } from "../../context/AuthContext";
import { isInventoryStockPricesViewOnly } from "../../lib/inventoryAccess";
import { useRegions } from "../../context/RegionsContext";
import { ApiError, apiJson } from "../../lib/api";
import { locationTypeLabel } from "../../lib/locationTypeLabel";
import type { SparePart, SparePriceLine, SpareStockRow } from "../../types/spare";

const inputClass =
  "mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm text-stone-900 outline-none ring-zimson-400/40 focus:ring-2";

const popupThead = "sticky top-0 z-10 bg-rlx-green text-[11px] font-semibold uppercase tracking-[0.12em] text-white";

type OverviewRow = {
  spare: SparePart;
  stock: SpareStockRow[];
  prices: SparePriceLine[];
};

type StockHistoryRow = {
  id: string;
  spareId: string;
  eventType: string;
  locationKey: string | null;
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
  if (eventType === "PURCHASE_RETURN") return "Purchase return";
  if (eventType === "TRANSFER_OUT") return "Transfer out";
  if (eventType === "TRANSFER_IN") return "Transfer in";
  return eventType;
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function StatTile({ label, value, accent }: { label: string; value: ReactNode; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${accent ? "text-rlx-green" : "text-slate-800"}`}>{value}</p>
    </div>
  );
}

function PopupSection({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{title}</p>
        {actions}
      </div>
      {children}
    </section>
  );
}

function ChangeCell({ value }: { value: number | null }) {
  return (
    <td
      className={`px-3 py-2 text-right font-semibold tabular-nums ${
        value == null ? "text-slate-400" : value < 0 ? "text-rose-700" : "text-emerald-700"
      }`}
    >
      {value == null ? "—" : value > 0 ? `+${value.toLocaleString()}` : value.toLocaleString()}
    </td>
  );
}

function HistoryTable({ rows, placeLabel, place }: { rows: StockHistoryRow[]; placeLabel: string; place: (h: StockHistoryRow) => string }) {
  return (
    <div className="max-h-64 overflow-auto">
      <table className="min-w-full text-left text-sm">
        <thead className={popupThead}>
          <tr>
            <th className="px-3 py-2">Date/time</th>
            <th className="px-3 py-2">Event</th>
            <th className="px-3 py-2">{placeLabel}</th>
            <th className="px-3 py-2 text-right">Change</th>
            <th className="px-3 py-2 text-right">Balance</th>
            <th className="px-3 py-2">Reference</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((h, idx) => (
            <tr key={h.id} className={`border-b border-slate-100 ${idx % 2 === 1 ? "bg-slate-50/70" : "bg-white"}`}>
              <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600">{formatDateTime(h.createdAt)}</td>
              <td className="px-3 py-2">{eventLabel(h.eventType)}</td>
              <td className="px-3 py-2">{place(h)}</td>
              <ChangeCell value={h.quantityChange} />
              <td className="px-3 py-2 text-right font-semibold tabular-nums">
                {h.balanceAfter == null ? "—" : h.balanceAfter.toLocaleString()}
              </td>
              <td className="px-3 py-2 text-xs text-slate-600">
                {h.referenceType && h.referenceNumber ? `${h.referenceType} ${h.referenceNumber}` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function InventoryStockPriceOverviewPage() {
  const { user } = useAuth();
  const { regions } = useRegions();
  const viewOnly = isInventoryStockPricesViewOnly(user);
  const isStoreUser = user?.role === "store_user";
  const showRegionFilter = user?.role === "super_admin";
  const [rows, setRows] = useState<OverviewRow[]>([]);
  const [filterRegion, setFilterRegion] = useState("");
  const [search, setSearch] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSpareId, setSelectedSpareId] = useState<string | null>(null);
  const [history, setHistory] = useState<StockHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyErr, setHistoryErr] = useState<string | null>(null);
  const [historyScope, setHistoryScope] = useState<{ locationType?: "HO" | "STORE"; regionId?: string; storeId?: string } | null>(null);
  const [historyLane, setHistoryLane] = useState<"ALL" | "HO" | "STORE">("ALL");
  const [locationFilter, setLocationFilter] = useState<"ALL" | "HO" | "STORE">("ALL");
  const [storeFilter, setStoreFilter] = useState("");

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

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const q = new URLSearchParams();
      if (showRegionFilter && filterRegion) q.set("regionId", filterRegion);
      if (search.trim()) q.set("q", search.trim());
      const qs = q.toString();
      const data = await apiJson<{ rows: OverviewRow[] }>(`/api/inventory/stock-price-overview${qs ? `?${qs}` : ""}`);
      setRows(data.rows);
      setSelectedSpareId((prev) => (prev && data.rows.some((x) => x.spare.id === prev) ? prev : null));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not load overview.");
      setRows([]);
      setSelectedSpareId(null);
    } finally {
      setLoading(false);
    }
  }, [filterRegion, search, showRegionFilter]);

  const loadHistory = useCallback(
    async (spareId: string, scope?: { locationType?: "HO" | "STORE"; regionId?: string; storeId?: string } | null) => {
      setHistoryLoading(true);
      setHistoryErr(null);
      try {
        const q = new URLSearchParams();
        q.set("limit", "200");
        if (scope?.locationType) q.set("locationType", scope.locationType);
        if (scope?.regionId) q.set("regionId", scope.regionId);
        if (scope?.storeId) q.set("storeId", scope.storeId);
        const data = await apiJson<{ history: StockHistoryRow[] }>(
          `/api/catalog/spares/${encodeURIComponent(spareId)}/stock-history?${q.toString()}`,
        );
        setHistory(data.history);
      } catch (e) {
        setHistoryErr(e instanceof ApiError ? e.message : "Could not load stock history.");
        setHistory([]);
      } finally {
        setHistoryLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const storeOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const row of rows) {
      for (const s of row.stock) {
        if (s.locationType !== "STORE" || !s.storeId) continue;
        if (filterRegion && s.regionId !== filterRegion) continue;
        ids.add(s.storeId);
      }
    }
    return [...ids]
      .map((id) => ({ id, name: storeNameById.get(id) ?? id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, filterRegion, storeNameById]);

  useEffect(() => {
    if (storeFilter && !storeOptions.some((s) => s.id === storeFilter)) setStoreFilter("");
  }, [storeFilter, storeOptions]);

  const scopedStockBySpare = useMemo(() => {
    const matches = (s: SpareStockRow) => {
      if (filterRegion && s.regionId !== filterRegion) return false;
      if (storeFilter) return s.locationType === "STORE" && s.storeId === storeFilter;
      if (locationFilter !== "ALL" && s.locationType !== locationFilter) return false;
      return true;
    };
    return new Map(rows.map((row) => [row.spare.id, row.stock.filter(matches)]));
  }, [rows, filterRegion, storeFilter, locationFilter]);

  const scopeActive = Boolean(filterRegion || storeFilter || locationFilter !== "ALL");

  const selected = useMemo(() => {
    const row = rows.find((r) => r.spare.id === selectedSpareId);
    if (!row) return null;
    return { ...row, stock: scopedStockBySpare.get(row.spare.id) ?? [] };
  }, [rows, selectedSpareId, scopedStockBySpare]);
  const totalStockBySpare = useMemo(
    () =>
      new Map(
        rows.map((row) => [
          row.spare.id,
          (scopedStockBySpare.get(row.spare.id) ?? []).reduce(
            (sum, s) => sum + (Number.isFinite(s.quantity) ? s.quantity : 0),
            0,
          ),
        ]),
      ),
    [rows, scopedStockBySpare],
  );
  const lastStockUpdateBySpare = useMemo(
    () =>
      new Map(
        rows.map((row) => {
          const stock = scopedStockBySpare.get(row.spare.id) ?? [];
          return [
            row.spare.id,
            stock.length > 0
              ? [...stock].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0]?.updatedAt
              : null,
          ];
        }),
      ),
    [rows, scopedStockBySpare],
  );
  const pagination = usePagination(rows, 50);
  const scopeTotalQty = useMemo(
    () => [...totalStockBySpare.values()].reduce((a, b) => a + b, 0),
    [totalStockBySpare],
  );

  useEffect(() => {
    if (!selectedSpareId) {
      setHistory([]);
      return;
    }
    void loadHistory(selectedSpareId, historyScope);
  }, [selectedSpareId, historyScope, loadHistory]);

  useEffect(() => {
    if (!selectedSpareId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedSpareId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedSpareId]);

  const scopedHistory = useMemo(() => {
    if (historyLane === "HO") return history.filter((h) => h.locationType === "HO");
    if (historyLane === "STORE") return history.filter((h) => h.locationType === "STORE");
    return history;
  }, [history, historyLane]);

  const hoHistory = useMemo(() => scopedHistory.filter((h) => h.locationType === "HO"), [scopedHistory]);
  const storeHistory = useMemo(() => scopedHistory.filter((h) => h.locationType === "STORE"), [scopedHistory]);
  const masterHistory = useMemo(() => scopedHistory.filter((h) => !h.locationType), [scopedHistory]);

  const scopeLabel = useMemo(() => {
    if (!historyScope) return null;
    if (historyScope.storeId) return storeNameById.get(historyScope.storeId) ?? historyScope.storeId;
    if (historyScope.regionId) return regionNameById.get(historyScope.regionId) ?? historyScope.regionId;
    return null;
  }, [historyScope, regionNameById, storeNameById]);

  function closeDetail() {
    setSelectedSpareId(null);
    setHistoryScope(null);
    setHistoryLane("ALL");
  }

  const laneBtn = (lane: "ALL" | "HO" | "STORE", label: string) => (
    <button
      type="button"
      onClick={() => setHistoryLane(lane)}
      className={`px-3 py-1.5 text-xs font-semibold transition ${
        historyLane === lane ? "bg-rlx-green text-white" : "bg-white text-rlx-green hover:bg-rlx-green-light"
      }`}
    >
      {label}
    </button>
  );

  const selectedPrice = selected ? selected.spare.sellingPriceInr ?? selected.spare.mrpInr : null;

  return (
    <div>
      <InventoryBreadcrumb current="Stock & prices" />
      <PageHeader
        title={isStoreUser ? "Store stock" : "Stock control desk"}
        description=""
        actions={
          viewOnly ? null : (
            <Link
              to="/inventory"
              className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
            >
              Inventory home
            </Link>
          )
        }
      />

      <Card
        title="Filters"
        className="mb-6"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {showRegionFilter ? (
            <div>
              <label htmlFor="iso-region" className="text-xs font-medium text-stone-600">
                Region
              </label>
              <select id="iso-region" value={filterRegion} onChange={(e) => setFilterRegion(e.target.value)} className={inputClass}>
                <option value="">All regions</option>
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div>
            <label htmlFor="iso-location" className="text-xs font-medium text-stone-600">
              Location
            </label>
            <select
              id="iso-location"
              value={storeFilter ? "STORE" : locationFilter}
              onChange={(e) => {
                const next = e.target.value as "ALL" | "HO" | "STORE";
                setLocationFilter(next);
                if (next !== "STORE") setStoreFilter("");
              }}
              className={inputClass}
            >
              <option value="ALL">All locations</option>
              <option value="HO">Region / CSC</option>
              <option value="STORE">Store</option>
            </select>
          </div>
          <div>
            <label htmlFor="iso-store" className="text-xs font-medium text-stone-600">
              Store
            </label>
            <select
              id="iso-store"
              value={storeFilter}
              onChange={(e) => {
                setStoreFilter(e.target.value);
                if (e.target.value) setLocationFilter("STORE");
              }}
              className={inputClass}
              disabled={locationFilter === "HO" || storeOptions.length === 0}
            >
              <option value="">All stores</option>
              {storeOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className={showRegionFilter ? "sm:col-span-2 lg:col-span-3" : "sm:col-span-2 lg:col-span-4"}>
            <label htmlFor="iso-search" className="text-xs font-medium text-stone-600">
              Search
            </label>
            <div className="flex gap-2">
              <input
                id="iso-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={inputClass}
                placeholder="Part number, brand, part name, category, size, colour"
              />
              <button type="button" onClick={() => void load()} className="shrink-0 rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zimson-700">
                Refresh
              </button>
            </div>
          </div>
        </div>
      </Card>

      {err ? <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">{err}</p> : null}

      {loading ? (
        <p className="text-sm text-stone-600">Loading…</p>
      ) : rows.length === 0 ? (
        <Card title="No data">
          <p className="text-sm text-stone-600">No spares found for the selected filters.</p>
        </Card>
      ) : (
        <Card
          title={`Spares register (${rows.length})`}
          subtitle={`${
            storeFilter
              ? storeNameById.get(storeFilter) ?? storeFilter
              : [
                  filterRegion ? regionNameById.get(filterRegion) ?? filterRegion : scopeActive ? "" : "All locations",
                  locationFilter === "HO" ? "Region / CSC stock" : locationFilter === "STORE" ? "Store stock" : "",
                ]
                  .filter(Boolean)
                  .join(" · ")
          } · Total stock ${scopeTotalQty.toLocaleString()}`}
        >
          <div className="max-h-[640px] overflow-auto rounded-xl border border-zimson-200/80">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 border-b border-zimson-200 bg-zimson-50/95 text-xs font-semibold uppercase text-stone-600">
                <tr>
                  <th className="px-3 py-2">Part number</th>
                  <th className="px-3 py-2">Brand</th>
                  <th className="px-3 py-2">Part name</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Price</th>
                  <th className="px-3 py-2">Total stock</th>
                  <th className="px-3 py-2">Locations</th>
                  <th className="px-3 py-2">Price lines</th>
                  <th className="px-3 py-2">Last stock update</th>
                </tr>
              </thead>
              <tbody>
                {pagination.pageRows.map((row) => (
                  <tr
                    key={row.spare.id}
                    onClick={() => {
                      setSelectedSpareId(row.spare.id);
                      setHistoryScope(null);
                      setHistoryLane("ALL");
                    }}
                    className={`cursor-pointer border-b border-zimson-100 ${selectedSpareId === row.spare.id ? "bg-zimson-100/70" : "hover:bg-zimson-50/80"}`}
                  >
                    <td className="px-3 py-2 font-mono text-xs font-semibold text-zimson-900">{row.spare.sku}</td>
                    <td className="px-3 py-2 text-stone-700">{row.spare.brand || "—"}</td>
                    <td className="px-3 py-2">{row.spare.name}</td>
                    <td className="px-3 py-2 text-stone-600">{row.spare.category}</td>
                    <td className="px-3 py-2">
                      {(row.spare.sellingPriceInr ?? row.spare.mrpInr) == null
                        ? "—"
                        : Number(row.spare.sellingPriceInr ?? row.spare.mrpInr).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 font-semibold">{(totalStockBySpare.get(row.spare.id) ?? 0).toLocaleString()}</td>
                    <td className="px-3 py-2">{scopedStockBySpare.get(row.spare.id)?.length ?? 0}</td>
                    <td className="px-3 py-2">{row.prices.length}</td>
                    <td className="px-3 py-2 text-xs text-stone-600">
                      {lastStockUpdateBySpare.get(row.spare.id)
                        ? new Date(lastStockUpdateBySpare.get(row.spare.id) as string).toLocaleString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination pagination={pagination} />
        </Card>
      )}

      <AppModal
        open={Boolean(selected)}
        onClose={closeDetail}
        size="3xl"
        eyebrow={selected ? [selected.spare.brand, selected.spare.category].filter(Boolean).join(" · ") || "Spare" : ""}
        title={selected?.spare.name ?? ""}
        subtitle={selected?.spare.sku}
        description={
          selected
            ? `Created ${formatDateTime(selected.spare.createdAt)}${selected.spare.description ? ` · ${selected.spare.description}` : ""}`
            : undefined
        }
        bodyClassName="space-y-4"
      >
        {selected ? (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label="Total stock" value={(totalStockBySpare.get(selected.spare.id) ?? 0).toLocaleString()} accent />
              <StatTile label="Locations" value={selected.stock.length} />
              <StatTile
                label="Price"
                value={
                  selectedPrice == null
                    ? "—"
                    : Number(selectedPrice).toLocaleString(undefined, { style: "currency", currency: "INR" })
                }
              />
              <StatTile label="Last stock update" value={<span className="text-sm">{formatDateTime(lastStockUpdateBySpare.get(selected.spare.id))}</span>} />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <PopupSection title="Stock by location">
                  {selected.stock.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-slate-500">
                      {scopeActive ? "No stock in the selected location." : "No stock lines for this spare."}
                    </p>
                  ) : (
                    <div className="max-h-72 overflow-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead className={popupThead}>
                          <tr>
                            <th className="px-3 py-2">Type</th>
                            <th className="px-3 py-2">Region</th>
                            <th className="px-3 py-2">Store</th>
                            <th className="px-3 py-2 text-right">Qty</th>
                            <th className="px-3 py-2">Updated</th>
                            <th className="px-3 py-2 text-right">History</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selected.stock.map((s, idx) => {
                            const active =
                              historyScope?.regionId === s.regionId &&
                              historyScope?.locationType === s.locationType &&
                              (historyScope?.storeId ?? null) === (s.storeId ?? null);
                            return (
                              <tr
                                key={s.id}
                                className={`border-b border-slate-100 ${active ? "bg-rlx-green-light" : idx % 2 === 1 ? "bg-slate-50/70" : "bg-white"}`}
                              >
                                <td className="px-3 py-2">
                                  <span
                                    className={`inline-flex min-w-[3.5rem] justify-center rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${
                                      s.locationType === "HO"
                                        ? "bg-sky-50 text-sky-900 ring-sky-300/70"
                                        : "bg-amber-50 text-amber-950 ring-amber-300/70"
                                    }`}
                                  >
                                    {locationTypeLabel(s.locationType)}
                                  </span>
                                </td>
                                <td className="px-3 py-2">{regionNameById.get(s.regionId) ?? s.regionId}</td>
                                <td className="px-3 py-2">{s.storeId ? storeNameById.get(s.storeId) ?? s.storeId : "—"}</td>
                                <td className="px-3 py-2 text-right font-semibold tabular-nums text-rlx-green">{s.quantity.toLocaleString()}</td>
                                <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600">{formatDateTime(s.updatedAt)}</td>
                                <td className="px-3 py-2 text-right">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setHistoryScope({
                                        locationType: s.locationType,
                                        regionId: s.regionId,
                                        ...(s.storeId ? { storeId: s.storeId } : {}),
                                      })
                                    }
                                    className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                                      active
                                        ? "border-rlx-green bg-rlx-green text-white"
                                        : "border-rlx-gold/60 bg-white text-rlx-green hover:border-rlx-gold hover:bg-rlx-green-light"
                                    }`}
                                  >
                                    View log
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </PopupSection>
              </div>
              <PopupSection title="Brand prices">
                {selected.prices.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-slate-500">No brand prices.</p>
                ) : (
                  <div className="max-h-72 overflow-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className={popupThead}>
                        <tr>
                          <th className="px-3 py-2">Region</th>
                          <th className="px-3 py-2">Brand</th>
                          <th className="px-3 py-2 text-right">Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.prices.map((p, idx) => (
                          <tr key={p.id} className={`border-b border-slate-100 ${idx % 2 === 1 ? "bg-slate-50/70" : "bg-white"}`}>
                            <td className="px-3 py-2">{p.regionId ? regionNameById.get(p.regionId) ?? p.regionId : "—"}</td>
                            <td className="px-3 py-2">{p.brand}</td>
                            <td className="px-3 py-2 text-right font-semibold tabular-nums">
                              {p.price.toLocaleString(undefined, { style: "currency", currency: "INR" })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </PopupSection>
            </div>

            <PopupSection
              title={scopeLabel ? `Stock timeline · ${scopeLabel}` : "Stock timeline"}
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex overflow-hidden rounded-lg border border-rlx-green/40 divide-x divide-rlx-green/30">
                    {laneBtn("ALL", "All")}
                    {laneBtn("HO", "Region / CSC")}
                    {laneBtn("STORE", "Store")}
                  </div>
                  {historyScope ? (
                    <button
                      type="button"
                      onClick={() => setHistoryScope(null)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      All locations
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => selectedSpareId && void loadHistory(selectedSpareId, historyScope)}
                    className="rounded-lg bg-rlx-green px-3 py-1.5 text-xs font-semibold text-white hover:bg-rlx-green/90"
                  >
                    Refresh
                  </button>
                </div>
              }
            >
              <div className="space-y-4 p-4">
                {historyErr ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{historyErr}</p> : null}
                {historyLoading ? (
                  <p className="text-sm text-slate-500">Loading history…</p>
                ) : scopedHistory.length === 0 ? (
                  <p className="py-4 text-center text-sm text-slate-500">No stock history in current scope.</p>
                ) : (
                  <>
                    {masterHistory.length > 0 ? (
                      <div className="overflow-hidden rounded-lg border border-slate-200">
                        <p className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                          Master log
                        </p>
                        <ul className="max-h-40 divide-y divide-slate-100 overflow-auto">
                          {masterHistory.map((h) => (
                            <li key={h.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-3 py-2 text-sm">
                              <span className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(h.createdAt)}</span>
                              <span className="font-medium text-slate-800">{eventLabel(h.eventType)}</span>
                              <span className="text-xs text-slate-600">{h.note ?? ""}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {hoHistory.length > 0 ? (
                      <div className="overflow-hidden rounded-lg border border-slate-200">
                        <p className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                          Region / CSC log
                        </p>
                        <HistoryTable rows={hoHistory} placeLabel="Region" place={(h) => h.regionName ?? h.regionId ?? "—"} />
                      </div>
                    ) : null}

                    {storeHistory.length > 0 ? (
                      <div className="overflow-hidden rounded-lg border border-slate-200">
                        <p className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                          Store log
                        </p>
                        <HistoryTable rows={storeHistory} placeLabel="Store" place={(h) => h.storeName ?? h.storeId ?? "—"} />
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </PopupSection>
          </>
        ) : null}
      </AppModal>
    </div>
  );
}
