import JsBarcode from "jsbarcode";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { InventoryBreadcrumb } from "../../components/inventory/InventoryBreadcrumb";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useRegions } from "../../context/RegionsContext";
import { useSpares } from "../../context/SparesContext";
import { ApiError, apiJson } from "../../lib/api";
import type { SparePriceLine, SpareStockRow } from "../../types/spare";

const inputClass =
  "mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm text-stone-900 outline-none ring-zimson-400/40 focus:ring-2";

const categories = ["Glass", "Movement", "Battery", "Crown", "Gasket", "Strap", "Dial", "Hands", "Lubricant", "Tool", "Consumable", "Stem", "Other"];

export function InventorySpareCatalogPage() {
  const { spares, addSpare } = useSpares();
  const { user } = useAuth();
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Other");
  const [hsn, setHsn] = useState("");
  const [mrpInr, setMrpInr] = useState("");
  const [isActive, setIsActive] = useState(true);
  const { regions } = useRegions();
  const [locationType, setLocationType] = useState<"HO" | "STORE">("STORE");
  const [regionId, setRegionId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [prices, setPrices] = useState<SparePriceLine[]>([]);
  const [stockRows, setStockRows] = useState<SpareStockRow[]>([]);
  const [brand, setBrand] = useState("");
  const [price, setPrice] = useState("");
  const [stockQty, setStockQty] = useState("0");
  const [priceErr, setPriceErr] = useState<string | null>(null);
  const canCreateSpare = user?.role === "super_admin" || user?.role === "regional_admin";
  const hoOnlyRole =
    user?.role === "service_centre_clerk" || user?.role === "service_centre_supervisor" || user?.role === "technician";
  const storeOnlyRole = user?.role === "store_user";

  useEffect(() => {
    if (regions.length > 0 && !regionId) setRegionId(regions[0]!.id);
  }, [regions, regionId]);

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
    for (const r of regions) {
      for (const s of r.stores) map.set(s.id, s.name);
    }
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

  useEffect(() => {
    if (spares.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((prev) => (prev && spares.some((s) => s.id === prev) ? prev : spares[0]!.id));
  }, [spares]);

  const selectedSpare = useMemo(
    () => (selectedId ? spares.find((s) => s.id === selectedId) ?? null : null),
    [spares, selectedId],
  );
  const barcodeRef = useRef<SVGSVGElement | null>(null);

  async function loadPrices(spareId: string) {
    try {
      const q = regionId ? `?regionId=${encodeURIComponent(regionId)}` : "";
      const data = await apiJson<{ prices: SparePriceLine[] }>(`/api/catalog/spares/${encodeURIComponent(spareId)}/prices${q}`);
      setPrices(data.prices);
    } catch (e) {
      setPrices([]);
      setPriceErr(e instanceof ApiError ? e.message : "Could not load prices.");
    }
  }

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
    setPriceErr(null);
    void loadPrices(selectedId);
    void loadStock(selectedId);
  }, [selectedId, regionId]);

  useEffect(() => {
    if (!selectedSpare || !barcodeRef.current) return;
    JsBarcode(barcodeRef.current, selectedSpare.sku, {
      format: "CODE128",
      displayValue: true,
      lineColor: "#111827",
      width: 2,
      height: 60,
      margin: 8,
    });
  }, [selectedSpare]);

  function printBarcodeLabel() {
    if (!selectedSpare || !barcodeRef.current) return;
    const popup = window.open("", "_blank", "width=480,height=640");
    if (!popup) return;
    popup.document.write(`<!doctype html>
<html>
  <head>
    <title>Spare Barcode - ${selectedSpare.sku}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
      .label { border: 1px solid #d1d5db; border-radius: 12px; padding: 16px; width: 320px; }
      .name { font-size: 14px; font-weight: 700; margin-bottom: 6px; }
      .sku { font-family: monospace; font-size: 12px; margin-bottom: 8px; color: #374151; }
      .muted { font-size: 11px; color: #6b7280; margin-top: 8px; }
    </style>
  </head>
  <body>
    <div class="label">
      <div class="name">${selectedSpare.name}</div>
      <div class="sku">${selectedSpare.sku}</div>
      ${barcodeRef.current.outerHTML}
      <div class="muted">Zimson Spare Label</div>
    </div>
    <script>
      window.onload = function () { window.print(); window.close(); };
    </script>
  </body>
</html>`);
    popup.document.close();
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const mrpValue = mrpInr.trim() === "" ? null : Number(mrpInr);
    if (mrpValue != null && (Number.isNaN(mrpValue) || mrpValue < 0)) {
      setMsg({ type: "err", text: "MRP must be a non-negative number." });
      return;
    }
    const r = await addSpare({
      sku,
      name,
      description,
      category,
      hsn: hsn.trim() || null,
      mrpInr: mrpValue,
      isActive,
    });
    if ("error" in r) {
      setMsg({ type: "err", text: r.error });
      return;
    }
    setMsg({ type: "ok", text: `Spare ${r.ok.sku} added.` });
    setSku("");
    setName("");
    setDescription("");
    setCategory("Other");
    setHsn("");
    setMrpInr("");
    setIsActive(true);
  }

  async function addPriceLine(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    const brandValue = brand.trim();
    const priceValue = Number(price);
    if (!regionId || !brandValue || Number.isNaN(priceValue) || priceValue < 0) {
      setPriceErr("Select region, enter brand and a non-negative price.");
      return;
    }
    setPriceErr(null);
    try {
      await apiJson(`/api/catalog/spares/${encodeURIComponent(selectedId)}/prices`, {
        method: "POST",
        json: { brand: brandValue, price: priceValue, regionId },
      });
      setBrand("");
      setPrice("");
      await loadPrices(selectedId);
    } catch (e) {
      setPriceErr(e instanceof ApiError ? e.message : "Could not save price line.");
    }
  }

  async function saveStockLine(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    const qty = Number(stockQty);
    if (!regionId || Number.isNaN(qty) || qty < 0 || (locationType === "STORE" && !storeId)) {
      setPriceErr("Select region/store and enter a non-negative stock quantity.");
      return;
    }
    setPriceErr(null);
    try {
      await apiJson(`/api/catalog/spares/${encodeURIComponent(selectedId)}/stock`, {
        method: "POST",
        json: {
          locationType,
          regionId,
          storeId: locationType === "STORE" ? storeId : null,
          quantity: qty,
        },
      });
      await loadStock(selectedId);
    } catch (e) {
      setPriceErr(e instanceof ApiError ? e.message : "Could not save stock.");
    }
  }

  return (
    <div>
      <InventoryBreadcrumb current="Spare catalogue" />
      <PageHeader
        title="Spare master"
        description="Two-table model: spare master + spare brand price lines."
        actions={
          <Link
            to="/inventory"
            className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
          >
            Inventory home
          </Link>
        }
      />

      <div className="grid gap-8 lg:grid-cols-5">
        {canCreateSpare ? (
        <Card title="Add spare" subtitle="Master row" className="lg:col-span-2">
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <label htmlFor="sp-sku" className="text-xs font-medium text-stone-600">
                SKU *
              </label>
              <input
                id="sp-sku"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className={inputClass}
                placeholder="e.g. SP-NEW-01"
                autoComplete="off"
              />
            </div>
            <div>
              <label htmlFor="sp-name" className="text-xs font-medium text-stone-600">
                Name *
              </label>
              <input
                id="sp-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                placeholder="Part name"
              />
            </div>
            <div>
              <label htmlFor="sp-desc" className="text-xs font-medium text-stone-600">
                Description *
              </label>
              <textarea id="sp-desc" value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} rows={3} />
            </div>
            <div>
              <label htmlFor="sp-cat" className="text-xs font-medium text-stone-600">
                Category *
              </label>
              <select
                id="sp-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={inputClass}
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="sp-hsn" className="text-xs font-medium text-stone-600">
                  HSN
                </label>
                <input id="sp-hsn" value={hsn} onChange={(e) => setHsn(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label htmlFor="sp-mrp" className="text-xs font-medium text-stone-600">
                  MRP (INR)
                </label>
                <input
                  id="sp-mrp"
                  type="number"
                  min={0}
                  step={0.01}
                  value={mrpInr}
                  onChange={(e) => setMrpInr(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-stone-700">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Is active
            </label>
            {msg ? (
              <p
                className={
                  msg.type === "ok"
                    ? "rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-200"
                    : "rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200"
                }
              >
                {msg.text}
              </p>
            ) : null}
            <button
              type="submit"
              className="w-full rounded-xl bg-zimson-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700 sm:w-auto sm:px-6"
            >
              Add spare
            </button>
          </form>
        </Card>
        ) : null}

        <Card
          title="Spares"
          subtitle={`${spares.length} row(s)`}
          className={canCreateSpare ? "lg:col-span-3" : "lg:col-span-5"}
        >
          <div className="max-h-[480px] overflow-auto rounded-xl border border-zimson-200/80">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 border-b border-zimson-200 bg-zimson-50/95 text-xs font-semibold uppercase tracking-wide text-stone-600">
                <tr>
                  <th className="px-3 py-2">SKU</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">HSN</th>
                  <th className="px-3 py-2">MRP</th>
                  <th className="px-3 py-2">Active</th>
                </tr>
              </thead>
              <tbody>
                {spares.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => setSelectedId(s.id)}
                    className={`cursor-pointer border-b border-zimson-100 last:border-0 ${
                      selectedId === s.id ? "bg-zimson-100/60" : "hover:bg-zimson-50/80"
                    }`}
                  >
                    <td className="px-3 py-2 font-mono text-xs font-semibold text-zimson-900">{s.sku}</td>
                    <td className="px-3 py-2 text-stone-800">{s.name}</td>
                    <td className="px-3 py-2 text-stone-700">{s.description}</td>
                    <td className="px-3 py-2 text-stone-600">{s.category}</td>
                    <td className="px-3 py-2 font-mono text-xs text-stone-600">{s.hsn ?? "-"}</td>
                    <td className="px-3 py-2 text-stone-700">{s.mrpInr == null ? "-" : s.mrpInr}</td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          s.isActive
                            ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900"
                            : "rounded-full bg-stone-200 px-2 py-0.5 text-xs font-medium text-stone-700"
                        }
                      >
                        {s.isActive ? "Yes" : "No"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {selectedSpare ? (
        <div className="mt-8 space-y-8">
          <Card title="Barcode label" subtitle={`Print label for ${selectedSpare.sku}`}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="rounded-xl border border-zimson-200/80 bg-white p-3">
                <p className="mb-1 text-sm font-semibold text-stone-900">{selectedSpare.name}</p>
                <p className="mb-2 font-mono text-xs text-stone-600">{selectedSpare.sku}</p>
                <svg ref={barcodeRef} />
              </div>
              <button
                type="button"
                onClick={printBarcodeLabel}
                className="rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zimson-700"
              >
                Print barcode label
              </button>
            </div>
          </Card>
        <div className="grid gap-8 lg:grid-cols-2">
          <Card title="Brand price lines" subtitle={`Price lines for ${selectedSpare.sku}`}>
            <div className="mb-3">
              <label className="text-xs font-medium text-stone-600">Pricing region</label>
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
            <form onSubmit={addPriceLine} className="mb-4 grid gap-3 sm:grid-cols-3">
              <input value={brand} onChange={(e) => setBrand(e.target.value)} className={inputClass} placeholder="Brand" />
              <input type="number" min={0} step={0.01} value={price} onChange={(e) => setPrice(e.target.value)} className={inputClass} placeholder="Price" />
              <button type="submit" className="rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zimson-700">Save price</button>
            </form>
            {priceErr ? <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{priceErr}</p> : null}
            <div className="max-h-[360px] overflow-auto rounded-xl border border-zimson-200/80">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 border-b border-zimson-200 bg-zimson-50/95 text-xs font-semibold uppercase text-stone-600">
                  <tr><th className="px-3 py-2">Region</th><th className="px-3 py-2">Brand</th><th className="px-3 py-2">Price</th><th className="px-3 py-2">Created</th></tr>
                </thead>
                <tbody>
                  {prices.map((p) => (
                    <tr key={p.id} className="border-b border-zimson-100">
                      <td className="px-3 py-2">{regions.find((r) => r.id === p.regionId)?.name ?? p.regionId ?? "-"}</td>
                      <td className="px-3 py-2">{p.brand}</td>
                      <td className="px-3 py-2">{p.price}</td>
                      <td className="px-3 py-2">{new Date(p.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title="Stock by location" subtitle="Central spare, location-wise stock (HO / Store)">
            <form onSubmit={saveStockLine} className="mb-4 grid gap-3">
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
                <button type="submit" className="rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zimson-700">Save stock</button>
              </div>
            </form>
            <div className="max-h-[360px] overflow-auto rounded-xl border border-zimson-200/80">
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
      ) : null}
    </div>
  );
}
