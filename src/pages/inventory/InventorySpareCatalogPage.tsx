import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { InventoryBreadcrumb } from "../../components/inventory/InventoryBreadcrumb";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useSpares } from "../../context/SparesContext";
import { ApiError, apiJson, useApiMode } from "../../lib/api";
import type { BrandRow, SpareStockRow } from "../../types/catalog";

const inputClass =
  "mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm text-stone-900 outline-none ring-zimson-400/40 focus:ring-2";

const categories = ["Glass", "Movement", "Battery", "Crown", "Gasket", "Strap", "Dial", "Hands", "Lubricant", "Tool", "Consumable", "Stem", "Other"];

function formatLocationKey(key: string): string {
  if (key.startsWith("REGION:")) return `Region · ${key.slice(7)}`;
  if (key.startsWith("HO:")) return `HO · ${key.slice(3)}`;
  if (key.startsWith("STORE:")) {
    const rest = key.slice(6);
    const i = rest.indexOf(":");
    if (i === -1) return key;
    return `Store · ${rest.slice(0, i)} / ${rest.slice(i + 1)}`;
  }
  return key;
}

export function InventorySpareCatalogPage() {
  const api = useApiMode();
  const { user, authReady } = useAuth();
  const { spares, addSpare } = useSpares();
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Other");
  const [uom, setUom] = useState("PCS");
  const [hsn, setHsn] = useState("");
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [pgCatalog, setPgCatalog] = useState<"unknown" | "yes" | "no">("unknown");
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mrpDraft, setMrpDraft] = useState<Record<string, string>>({});
  const [stockRows, setStockRows] = useState<SpareStockRow[]>([]);
  const [stockDelta, setStockDelta] = useState<Record<string, string>>({});
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [catalogErr, setCatalogErr] = useState<string | null>(null);

  useEffect(() => {
    if (!api || !authReady || !user) {
      setPgCatalog("no");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await apiJson<{ brands: BrandRow[] }>("/api/catalog/brands");
        if (cancelled) return;
        setBrands(data.brands);
        setPgCatalog("yes");
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404) setPgCatalog("no");
        else setPgCatalog("no");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, authReady, user?.id]);

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

  const reloadMrpAndStock = useCallback(async () => {
    if (!selectedId || pgCatalog !== "yes") return;
    setCatalogBusy(true);
    setCatalogErr(null);
    try {
      const [mrp, st] = await Promise.all([
        apiJson<{ lines: { brandId: string; mrpInr: number }[] }>(`/api/catalog/spares/${selectedId}/brand-mrp`),
        apiJson<{ stock: SpareStockRow[] }>(`/api/catalog/stock?spareId=${encodeURIComponent(selectedId)}`),
      ]);
      const draft: Record<string, string> = {};
      for (const b of brands) {
        const line = mrp.lines.find((l) => l.brandId === b.id);
        draft[b.id] = String(line?.mrpInr ?? 0);
      }
      setMrpDraft(draft);
      setStockRows(st.stock);
      setStockDelta({});
    } catch (e) {
      setCatalogErr(e instanceof ApiError ? e.message : "Could not load catalogue detail.");
    } finally {
      setCatalogBusy(false);
    }
  }, [selectedId, pgCatalog, brands]);

  useEffect(() => {
    if (pgCatalog !== "yes" || !selectedId) return;
    void reloadMrpAndStock();
  }, [pgCatalog, selectedId, reloadMrpAndStock]);

  async function saveMrp(brandId: string) {
    if (!selectedId || pgCatalog !== "yes") return;
    const raw = mrpDraft[brandId] ?? "0";
    const mrpInr = Number(raw);
    if (Number.isNaN(mrpInr) || mrpInr < 0) {
      setCatalogErr("MRP must be a non-negative number.");
      return;
    }
    setCatalogErr(null);
    try {
      await apiJson("/api/catalog/spares/" + encodeURIComponent(selectedId) + "/brand-mrp", {
        method: "PUT",
        json: { brandId, mrpInr },
      });
      await reloadMrpAndStock();
    } catch (e) {
      setCatalogErr(e instanceof ApiError ? e.message : "Save failed.");
    }
  }

  async function applyStockDelta(row: SpareStockRow) {
    if (pgCatalog !== "yes") return;
    const raw = stockDelta[row.id] ?? "";
    const delta = Number(raw);
    if (raw.trim() === "" || Number.isNaN(delta)) {
      setCatalogErr("Enter a numeric adjustment (e.g. 5 or -2).");
      return;
    }
    setCatalogErr(null);
    try {
      await apiJson("/api/catalog/stock/adjust", {
        method: "POST",
        json: { spareId: row.spareId, locationKey: row.locationKey, delta },
      });
      setStockDelta((d) => ({ ...d, [row.id]: "" }));
      await reloadMrpAndStock();
    } catch (e) {
      setCatalogErr(e instanceof ApiError ? e.message : "Stock update failed.");
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const r = await addSpare({
      sku,
      name,
      category,
      uom,
      hsn: hsn.trim() || null,
    });
    if ("error" in r) {
      setMsg({ type: "err", text: r.error });
      return;
    }
    setMsg({ type: "ok", text: `Spare ${r.ok.sku} added to catalogue.` });
    setSku("");
    setName("");
    setCategory("Other");
    setUom("PCS");
    setHsn("");
  }

  return (
    <div>
      <InventoryBreadcrumb current="Spare catalogue" />
      <PageHeader
        title="Spare master"
        description={
          pgCatalog === "yes"
            ? "Master data per SKU, brand-wise MRP, and stock by region, HO, and store."
            : "Spare catalogue from the API."
        }
        actions={
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              to="/inventory/spare-price-fixing"
              className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
            >
              Regional prices
            </Link>
            <Link
              to="/inventory"
              className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
            >
              Inventory home
            </Link>
          </div>
        }
      />

      <div className="grid gap-8 lg:grid-cols-5">
        <Card title="Add spare" subtitle="New SKU in master" className="lg:col-span-2">
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
                Description *
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
                <label htmlFor="sp-uom" className="text-xs font-medium text-stone-600">
                  UoM
                </label>
                <select id="sp-uom" value={uom} onChange={(e) => setUom(e.target.value)} className={inputClass}>
                  <option value="PCS">PCS</option>
                  <option value="SET">SET</option>
                  <option value="ML">ML</option>
                  <option value="PAIR">PAIR</option>
                </select>
              </div>
              <div>
                <label htmlFor="sp-hsn" className="text-xs font-medium text-stone-600">
                  HSN (optional)
                </label>
                <input
                  id="sp-hsn"
                  value={hsn}
                  onChange={(e) => setHsn(e.target.value)}
                  className={inputClass}
                  placeholder="8-digit chapter"
                  maxLength={8}
                />
              </div>
            </div>
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
              Add to catalogue
            </button>
          </form>
        </Card>

        <Card
          title="Catalogue"
          subtitle={`${spares.length} SKU(s)`}
          className="lg:col-span-3"
        >
          <div className="max-h-[480px] overflow-auto rounded-xl border border-zimson-200/80">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 border-b border-zimson-200 bg-zimson-50/95 text-xs font-semibold uppercase tracking-wide text-stone-600">
                <tr>
                  <th className="px-3 py-2">SKU</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">UoM</th>
                  <th className="px-3 py-2">HSN</th>
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
                    <td className="px-3 py-2 text-stone-600">{s.category}</td>
                    <td className="px-3 py-2 text-stone-600">{s.uom}</td>
                    <td className="px-3 py-2 font-mono text-xs text-stone-600">{s.hsn ?? "—"}</td>
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

      {pgCatalog === "yes" && selectedSpare ? (
        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          <Card
            title="Brand-wise MRP"
            subtitle={`MRP (INR) per brand for ${selectedSpare.sku}.`}
          >
            {catalogErr ? (
              <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">{catalogErr}</p>
            ) : null}
            {catalogBusy ? <p className="text-sm text-stone-500">Loading…</p> : null}
            <div className="max-h-[360px] overflow-auto rounded-xl border border-zimson-200/80">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 border-b border-zimson-200 bg-zimson-50/95 text-xs font-semibold uppercase text-stone-600">
                  <tr>
                    <th className="px-3 py-2">Brand</th>
                    <th className="px-3 py-2">MRP (₹)</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {brands.map((b) => (
                    <tr key={b.id} className="border-b border-zimson-100 last:border-0">
                      <td className="px-3 py-2">
                        <span className="font-mono text-xs text-zimson-900">{b.code}</span>
                        <span className="ml-2 text-stone-700">{b.name}</span>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={mrpDraft[b.id] ?? ""}
                          onChange={(e) => setMrpDraft((d) => ({ ...d, [b.id]: e.target.value }))}
                          className="w-28 rounded-lg border border-zimson-300/80 bg-white px-2 py-1.5 text-sm"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => void saveMrp(b.id)}
                          className="rounded-lg bg-zimson-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zimson-700"
                        >
                          Save
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Stock by location" subtitle={`On-hand for ${selectedSpare.sku} by location key.`}>
            <div className="max-h-[400px] overflow-auto rounded-xl border border-zimson-200/80">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 border-b border-zimson-200 bg-zimson-50/95 text-xs font-semibold uppercase text-stone-600">
                  <tr>
                    <th className="px-3 py-2">Location</th>
                    <th className="px-3 py-2">Key</th>
                    <th className="px-3 py-2">Qty</th>
                    <th className="px-3 py-2">Δ</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {stockRows.map((r) => (
                    <tr key={r.id} className="border-b border-zimson-100 last:border-0">
                      <td className="px-3 py-2 text-stone-800">{formatLocationKey(r.locationKey)}</td>
                      <td className="px-3 py-2 font-mono text-[10px] text-stone-500">{r.locationKey}</td>
                      <td className="px-3 py-2 font-medium text-zimson-900">{r.quantity}</td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step={0.001}
                          placeholder="0"
                          value={stockDelta[r.id] ?? ""}
                          onChange={(e) => setStockDelta((d) => ({ ...d, [r.id]: e.target.value }))}
                          className="w-24 rounded-lg border border-zimson-300/80 bg-white px-2 py-1 text-sm"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => void applyStockDelta(r)}
                          className="rounded-lg border border-zimson-400 bg-white px-2 py-1 text-xs font-semibold text-zimson-900 hover:bg-zimson-50"
                        >
                          Apply
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
