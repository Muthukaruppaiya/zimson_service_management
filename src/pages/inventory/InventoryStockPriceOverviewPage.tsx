import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { InventoryBreadcrumb } from "../../components/inventory/InventoryBreadcrumb";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useRegions } from "../../context/RegionsContext";
import { ApiError, apiJson } from "../../lib/api";
import type { SparePart, SparePriceLine, SpareStockRow } from "../../types/spare";

const inputClass =
  "mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm text-stone-900 outline-none ring-zimson-400/40 focus:ring-2";

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
  if (eventType === "TRANSFER_OUT") return "Transfer out";
  if (eventType === "TRANSFER_IN") return "Transfer in";
  return eventType;
}

export function InventoryStockPriceOverviewPage() {
  const { user } = useAuth();
  const { regions } = useRegions();
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
      setSelectedSpareId((prev) => (prev && data.rows.some((x) => x.spare.id === prev) ? prev : data.rows[0]?.spare.id ?? null));
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

  const selected = useMemo(() => rows.find((r) => r.spare.id === selectedSpareId) ?? null, [rows, selectedSpareId]);
  const totalStockBySpare = useMemo(
    () =>
      new Map(
        rows.map((row) => [
          row.spare.id,
          row.stock.reduce((sum, s) => sum + (Number.isFinite(s.quantity) ? s.quantity : 0), 0),
        ]),
      ),
    [rows],
  );
  const lastStockUpdateBySpare = useMemo(
    () =>
      new Map(
        rows.map((row) => [
          row.spare.id,
          row.stock.length > 0
            ? [...row.stock].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0]?.updatedAt
            : null,
        ]),
      ),
    [rows],
  );

  useEffect(() => {
    if (!selectedSpareId) {
      setHistory([]);
      return;
    }
    void loadHistory(selectedSpareId, historyScope);
  }, [selectedSpareId, historyScope, loadHistory]);

  const scopedHistory = useMemo(() => {
    if (historyLane === "HO") return history.filter((h) => h.locationType === "HO");
    if (historyLane === "STORE") return history.filter((h) => h.locationType === "STORE");
    return history;
  }, [history, historyLane]);

  const hoHistory = useMemo(() => scopedHistory.filter((h) => h.locationType === "HO"), [scopedHistory]);
  const storeHistory = useMemo(() => scopedHistory.filter((h) => h.locationType === "STORE"), [scopedHistory]);
  const masterHistory = useMemo(() => scopedHistory.filter((h) => !h.locationType), [scopedHistory]);

  return (
    <div>
      <InventoryBreadcrumb current="Stock & prices" />
      <PageHeader
        title="Stock control desk"
        description="Scalable list for high-volume spares with drill-down stock, prices, and timeline history."
        actions={
          <Link
            to="/inventory"
            className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
          >
            Inventory home
          </Link>
        }
      />

      <Card
        title="Filters"
        subtitle={
          showRegionFilter
            ? "Filter by region and search by SKU or spare name"
            : "Search by SKU or spare name for your accessible stock scope"
        }
        className="mb-6"
      >
        <div className={`grid gap-4 ${showRegionFilter ? "sm:grid-cols-3" : "sm:grid-cols-1"}`}>
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
          <div className={showRegionFilter ? "sm:col-span-2" : ""}>
            <label htmlFor="iso-search" className="text-xs font-medium text-stone-600">
              Search
            </label>
            <div className="flex gap-2">
              <input
                id="iso-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={inputClass}
                placeholder="SKU, name, category"
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
        <div className="space-y-6">
          <Card title={`Spares register (${rows.length})`} subtitle="Click any row to open detail + stock timeline">
            <div className="max-h-[520px] overflow-auto rounded-xl border border-zimson-200/80">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 border-b border-zimson-200 bg-zimson-50/95 text-xs font-semibold uppercase text-stone-600">
                  <tr>
                    <th className="px-3 py-2">SKU</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Category</th>
                    <th className="px-3 py-2">MRP</th>
                    <th className="px-3 py-2">Total stock</th>
                    <th className="px-3 py-2">Locations</th>
                    <th className="px-3 py-2">Price lines</th>
                    <th className="px-3 py-2">Last stock update</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.spare.id}
                      onClick={() => {
                        setSelectedSpareId(row.spare.id);
                        setHistoryScope(null);
                      }}
                      className={`cursor-pointer border-b border-zimson-100 ${selectedSpareId === row.spare.id ? "bg-zimson-100/70" : "hover:bg-zimson-50/80"}`}
                    >
                      <td className="px-3 py-2 font-mono text-xs font-semibold text-zimson-900">{row.spare.sku}</td>
                      <td className="px-3 py-2">{row.spare.name}</td>
                      <td className="px-3 py-2 text-stone-600">{row.spare.category}</td>
                      <td className="px-3 py-2">{row.spare.mrpInr == null ? "—" : row.spare.mrpInr.toLocaleString()}</td>
                      <td className="px-3 py-2 font-semibold">{(totalStockBySpare.get(row.spare.id) ?? 0).toLocaleString()}</td>
                      <td className="px-3 py-2">{row.stock.length}</td>
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
          </Card>

          {selected ? (
            <Card
              title={`${selected.spare.sku} — ${selected.spare.name}`}
              subtitle={`Created on ${new Date(selected.spare.createdAt).toLocaleString()} | ${selected.spare.description}`}
            >
              <div className="grid gap-6 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Stock by location</h3>
                  <div className="max-h-72 overflow-auto rounded-xl border border-zimson-200/80">
                    <table className="min-w-full text-left text-sm">
                      <thead className="sticky top-0 border-b border-zimson-200 bg-zimson-50/95 text-xs font-semibold uppercase text-stone-600">
                        <tr>
                          <th className="px-3 py-2">Type</th>
                          <th className="px-3 py-2">Region</th>
                          <th className="px-3 py-2">Store</th>
                          <th className="px-3 py-2">Qty</th>
                          <th className="px-3 py-2">Updated</th>
                          <th className="px-3 py-2">History</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.stock.map((s) => (
                          <tr key={s.id} className="border-b border-zimson-100">
                            <td className="px-3 py-2">{s.locationType}</td>
                            <td className="px-3 py-2">{regionNameById.get(s.regionId) ?? s.regionId}</td>
                            <td className="px-3 py-2">{s.storeId ? storeNameById.get(s.storeId) ?? s.storeId : "—"}</td>
                            <td className="px-3 py-2 font-semibold">{s.quantity.toLocaleString()}</td>
                            <td className="px-3 py-2 text-xs text-stone-600">{new Date(s.updatedAt).toLocaleString()}</td>
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setHistoryScope({
                                    locationType: s.locationType,
                                    regionId: s.regionId,
                                    ...(s.storeId ? { storeId: s.storeId } : {}),
                                  })
                                }
                                className="rounded-lg border border-zimson-300 px-2 py-1 text-xs font-semibold text-zimson-900 hover:bg-zimson-50"
                              >
                                View log
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Brand prices</h3>
                  <div className="max-h-72 overflow-auto rounded-xl border border-zimson-200/80">
                    <table className="min-w-full text-left text-sm">
                      <thead className="sticky top-0 border-b border-zimson-200 bg-zimson-50/95 text-xs font-semibold uppercase text-stone-600">
                        <tr>
                          <th className="px-3 py-2">Region</th>
                          <th className="px-3 py-2">Brand</th>
                          <th className="px-3 py-2">Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.prices.map((p) => (
                          <tr key={p.id} className="border-b border-zimson-100">
                            <td className="px-3 py-2">{p.regionId ? regionNameById.get(p.regionId) ?? p.regionId : "—"}</td>
                            <td className="px-3 py-2">{p.brand}</td>
                            <td className="px-3 py-2 font-semibold">
                              {p.price.toLocaleString(undefined, { style: "currency", currency: "INR" })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Stock timeline / log</h3>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setHistoryLane("ALL")}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                        historyLane === "ALL"
                          ? "border-zimson-500 bg-zimson-600 text-white"
                          : "border-zimson-300 text-zimson-900 hover:bg-zimson-50"
                      }`}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistoryLane("HO")}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                        historyLane === "HO"
                          ? "border-zimson-500 bg-zimson-600 text-white"
                          : "border-zimson-300 text-zimson-900 hover:bg-zimson-50"
                      }`}
                    >
                      Region / HO only
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistoryLane("STORE")}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                        historyLane === "STORE"
                          ? "border-zimson-500 bg-zimson-600 text-white"
                          : "border-zimson-300 text-zimson-900 hover:bg-zimson-50"
                      }`}
                    >
                      Store only
                    </button>
                    {historyScope ? (
                      <button
                        type="button"
                        onClick={() => setHistoryScope(null)}
                        className="rounded-lg border border-zimson-300 px-3 py-1.5 text-xs font-semibold text-zimson-900 hover:bg-zimson-50"
                      >
                        Show all locations
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => selectedSpareId && void loadHistory(selectedSpareId, historyScope)}
                      className="rounded-lg bg-zimson-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zimson-700"
                    >
                      Refresh log
                    </button>
                  </div>
                </div>
                {historyErr ? <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{historyErr}</p> : null}
                {historyLoading ? (
                  <p className="text-sm text-stone-600">Loading history...</p>
                ) : scopedHistory.length === 0 ? (
                  <p className="text-sm text-stone-500">No stock history in current scope.</p>
                ) : (
                  <div className="space-y-4">
                    {masterHistory.length > 0 ? (
                      <div className="rounded-xl border border-zimson-200/80 p-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Master log</p>
                        <div className="max-h-40 overflow-auto">
                          <table className="min-w-full text-left text-sm">
                            <tbody>
                              {masterHistory.map((h) => (
                                <tr key={h.id} className="border-b border-zimson-100">
                                  <td className="px-2 py-1.5 text-xs">{new Date(h.createdAt).toLocaleString()}</td>
                                  <td className="px-2 py-1.5">{eventLabel(h.eventType)}</td>
                                  <td className="px-2 py-1.5 text-xs text-stone-600">{h.note ?? "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : null}

                    {hoHistory.length > 0 ? (
                      <div className="rounded-xl border border-zimson-200/80">
                        <p className="border-b border-zimson-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
                          Region / HO log
                        </p>
                        <div className="max-h-64 overflow-auto">
                          <table className="min-w-full text-left text-sm">
                            <thead className="sticky top-0 border-b border-zimson-200 bg-zimson-50/95 text-xs font-semibold uppercase text-stone-600">
                              <tr>
                                <th className="px-3 py-2">Date/time</th>
                                <th className="px-3 py-2">Event</th>
                                <th className="px-3 py-2">Region</th>
                                <th className="px-3 py-2">Change</th>
                                <th className="px-3 py-2">Balance</th>
                                <th className="px-3 py-2">Reference</th>
                              </tr>
                            </thead>
                            <tbody>
                              {hoHistory.map((h) => (
                                <tr key={h.id} className="border-b border-zimson-100">
                                  <td className="px-3 py-2 text-xs">{new Date(h.createdAt).toLocaleString()}</td>
                                  <td className="px-3 py-2">{eventLabel(h.eventType)}</td>
                                  <td className="px-3 py-2">{h.regionName ?? h.regionId ?? "—"}</td>
                                  <td className={`px-3 py-2 font-semibold ${(h.quantityChange ?? 0) < 0 ? "text-red-700" : "text-emerald-700"}`}>
                                    {h.quantityChange == null ? "—" : h.quantityChange.toLocaleString()}
                                  </td>
                                  <td className="px-3 py-2 font-semibold">{h.balanceAfter == null ? "—" : h.balanceAfter.toLocaleString()}</td>
                                  <td className="px-3 py-2 text-xs">{h.referenceType && h.referenceNumber ? `${h.referenceType} ${h.referenceNumber}` : "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : null}

                    {storeHistory.length > 0 ? (
                      <div className="rounded-xl border border-zimson-200/80">
                        <p className="border-b border-zimson-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
                          Store log
                        </p>
                        <div className="max-h-64 overflow-auto">
                          <table className="min-w-full text-left text-sm">
                            <thead className="sticky top-0 border-b border-zimson-200 bg-zimson-50/95 text-xs font-semibold uppercase text-stone-600">
                              <tr>
                                <th className="px-3 py-2">Date/time</th>
                                <th className="px-3 py-2">Event</th>
                                <th className="px-3 py-2">Store</th>
                                <th className="px-3 py-2">Change</th>
                                <th className="px-3 py-2">Balance</th>
                                <th className="px-3 py-2">Reference</th>
                              </tr>
                            </thead>
                            <tbody>
                              {storeHistory.map((h) => (
                                <tr key={h.id} className="border-b border-zimson-100">
                                  <td className="px-3 py-2 text-xs">{new Date(h.createdAt).toLocaleString()}</td>
                                  <td className="px-3 py-2">{eventLabel(h.eventType)}</td>
                                  <td className="px-3 py-2">{h.storeName ?? h.storeId ?? "—"}</td>
                                  <td className={`px-3 py-2 font-semibold ${(h.quantityChange ?? 0) < 0 ? "text-red-700" : "text-emerald-700"}`}>
                                    {h.quantityChange == null ? "—" : h.quantityChange.toLocaleString()}
                                  </td>
                                  <td className="px-3 py-2 font-semibold">{h.balanceAfter == null ? "—" : h.balanceAfter.toLocaleString()}</td>
                                  <td className="px-3 py-2 text-xs">{h.referenceType && h.referenceNumber ? `${h.referenceType} ${h.referenceNumber}` : "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
