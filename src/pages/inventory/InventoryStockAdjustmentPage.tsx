import { useEffect, useMemo, useState } from "react";
import { InventoryBreadcrumb } from "../../components/inventory/InventoryBreadcrumb";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useRegions } from "../../context/RegionsContext";
import { useSpares } from "../../context/SparesContext";
import { ApiError, apiJson } from "../../lib/api";
import type { SpareStockRow } from "../../types/spare";

const inputClass =
  "mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm text-stone-900 outline-none ring-zimson-400/40 focus:ring-2";

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

  const storeNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of regions) for (const s of r.stores) map.set(s.id, s.name);
    return map;
  }, [regions]);

  useEffect(() => {
    if (locationType === "STORE") {
      if (currentStores.length > 0 && !currentStores.some((s) => s.id === storeId)) {
        setStoreId(currentStores[0]!.id);
      }
    } else {
      setStoreId("");
    }
  }, [locationType, currentStores, storeId]);

  async function loadStock(spareId: string) {
    try {
      const data = await apiJson<{ stock: SpareStockRow[] }>(`/api/catalog/spares/${encodeURIComponent(spareId)}/stock`);
      setStockRows(data.stock);
    } catch {
      setStockRows([]);
    }
  }

  useEffect(() => {
    if (!selectedId) return;
    void loadStock(selectedId);
  }, [selectedId]);

  async function saveStockLine(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    const qty = Number(stockQty);
    if (!regionId || Number.isNaN(qty) || qty < 0 || (locationType === "STORE" && !storeId)) {
      setMsg({ type: "err", text: "Select region/store and enter non-negative quantity." });
      return;
    }
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
      await loadStock(selectedId);
    } catch (e) {
      setMsg({ type: "err", text: e instanceof ApiError ? e.message : "Could not save stock." });
    }
  }

  return (
    <div>
      <InventoryBreadcrumb current="Stock adjustment" />
      <PageHeader title="Stock adjustment" description="Adjust spare stock by HO/Store location." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Adjust stock">
          <form onSubmit={saveStockLine} className="grid gap-3">
            <div>
              <label className="text-xs font-medium text-stone-600">Spare</label>
              <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className={inputClass}>
                {spares.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.sku} - {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                value={locationType}
                onChange={(e) => setLocationType(e.target.value as "HO" | "STORE")}
                className={inputClass}
                disabled={storeOnlyRole || hoOnlyRole}
              >
                <option value="STORE">Store</option>
                <option value="HO">HO / Service Centre</option>
              </select>
              <select
                value={regionId}
                onChange={(e) => setRegionId(e.target.value)}
                className={inputClass}
                disabled={Boolean(user && user.role !== "super_admin")}
              >
                <option value="">Select region</option>
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            {locationType === "STORE" ? (
              <select value={storeId} onChange={(e) => setStoreId(e.target.value)} className={inputClass} disabled={storeOnlyRole}>
                <option value="">Select store</option>
                {currentStores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <input type="number" min={0} step={0.001} value={stockQty} onChange={(e) => setStockQty(e.target.value)} className={inputClass} placeholder="Quantity" />
              <button type="submit" className="rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zimson-700">
                Save stock
              </button>
            </div>
          </form>
          {msg ? (
            <p className={`mt-3 rounded-xl px-3 py-2 text-sm ${msg.type === "ok" ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"}`}>
              {msg.text}
            </p>
          ) : null}
        </Card>

        <Card title="Stock by location">
          <div className="max-h-[420px] overflow-auto rounded-xl border border-zimson-200/80">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 border-b border-zimson-200 bg-zimson-50/95 text-xs font-semibold uppercase text-stone-600">
                <tr><th className="px-3 py-2">Type</th><th className="px-3 py-2">Region</th><th className="px-3 py-2">Store</th><th className="px-3 py-2">Qty</th></tr>
              </thead>
              <tbody>
                {stockRows.map((s) => (
                  <tr key={s.id} className="border-b border-zimson-100">
                    <td className="px-3 py-2">{s.locationType}</td>
                    <td className="px-3 py-2">{regions.find((r) => r.id === s.regionId)?.name ?? s.regionId}</td>
                    <td className="px-3 py-2">{s.storeId ? storeNameById.get(s.storeId) ?? s.storeId : "-"}</td>
                    <td className="px-3 py-2">{s.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
