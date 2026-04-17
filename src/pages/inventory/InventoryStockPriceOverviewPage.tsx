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

export function InventoryStockPriceOverviewPage() {
  const { user } = useAuth();
  const { regions } = useRegions();
  const showRegionFilter = user?.role === "super_admin";
  const [rows, setRows] = useState<OverviewRow[]>([]);
  const [filterRegion, setFilterRegion] = useState("");
  const [search, setSearch] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
      const data = await apiJson<{ rows: OverviewRow[] }>(
        `/api/inventory/stock-price-overview${qs ? `?${qs}` : ""}`,
      );
      setRows(data.rows);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not load overview.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [filterRegion, search, showRegionFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <InventoryBreadcrumb current="Stock & prices" />
      <PageHeader
        title="Stock & prices by location"
        description="Per spare: on-hand stock by HO or store, and brand prices for the selected region (where applicable)."
        actions={
          <Link
            to="/inventory"
            className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
          >
            Inventory home
          </Link>
        }
      />

      <Card title="Filters"         subtitle={
          showRegionFilter
            ? "Super admin can narrow stock/prices by region; search matches SKU or name"
            : "Search matches SKU or name; stock and prices are scoped to your location/region"
        }
        className="mb-8"
      >
        <div className={`grid gap-4 ${showRegionFilter ? "sm:grid-cols-3" : "sm:grid-cols-1"}`}>
          {showRegionFilter ? (
            <div>
              <label htmlFor="iso-region" className="text-xs font-medium text-stone-600">
                Region (optional)
              </label>
              <select
                id="iso-region"
                value={filterRegion}
                onChange={(e) => setFilterRegion(e.target.value)}
                className={inputClass}
              >
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
              Search SKU / name
            </label>
            <div className="flex gap-2">
              <input
                id="iso-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={inputClass}
                placeholder="e.g. SP- or battery"
              />
              <button
                type="button"
                onClick={() => void load()}
                className="shrink-0 rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zimson-700"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>
      </Card>

      {err ? (
        <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">{err}</p>
      ) : null}

      {loading ? (
        <p className="text-sm text-stone-600">Loading…</p>
      ) : rows.length === 0 ? (
        <Card title="No data">
          <p className="text-sm text-stone-600">No spares match your filters, or you have no access.</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {rows.map(({ spare, stock, prices }) => (
            <Card key={spare.id} title={`${spare.sku} — ${spare.name}`} subtitle={spare.category}>
              <div className="grid gap-6 lg:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
                    Stock by location
                  </h3>
                  {stock.length === 0 ? (
                    <p className="text-sm text-stone-500">No stock rows in scope.</p>
                  ) : (
                    <div className="max-h-56 overflow-auto rounded-xl border border-zimson-200/80">
                      <table className="min-w-full text-left text-sm">
                        <thead className="sticky top-0 border-b border-zimson-200 bg-zimson-50/95 text-xs font-semibold uppercase text-stone-600">
                          <tr>
                            <th className="px-3 py-2">Type</th>
                            <th className="px-3 py-2">Region</th>
                            <th className="px-3 py-2">Store</th>
                            <th className="px-3 py-2">Qty</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stock.map((s) => (
                            <tr key={s.id} className="border-b border-zimson-100">
                              <td className="px-3 py-2">{s.locationType}</td>
                              <td className="px-3 py-2">
                                {regionNameById.get(s.regionId) ?? s.regionId}
                              </td>
                              <td className="px-3 py-2">
                                {s.storeId ? storeNameById.get(s.storeId) ?? s.storeId : "—"}
                              </td>
                              <td className="px-3 py-2 font-medium">{s.quantity}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
                    Brand prices (region)
                  </h3>
                  {prices.length === 0 ? (
                    <p className="text-sm text-stone-500">No price lines in scope.</p>
                  ) : (
                    <div className="max-h-56 overflow-auto rounded-xl border border-zimson-200/80">
                      <table className="min-w-full text-left text-sm">
                        <thead className="sticky top-0 border-b border-zimson-200 bg-zimson-50/95 text-xs font-semibold uppercase text-stone-600">
                          <tr>
                            <th className="px-3 py-2">Region</th>
                            <th className="px-3 py-2">Brand</th>
                            <th className="px-3 py-2">Price</th>
                          </tr>
                        </thead>
                        <tbody>
                          {prices.map((p) => (
                            <tr key={p.id} className="border-b border-zimson-100">
                              <td className="px-3 py-2">
                                {p.regionId ? regionNameById.get(p.regionId) ?? p.regionId : "—"}
                              </td>
                              <td className="px-3 py-2">{p.brand}</td>
                              <td className="px-3 py-2 font-medium">
                                {p.price.toLocaleString(undefined, { style: "currency", currency: "INR" })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
