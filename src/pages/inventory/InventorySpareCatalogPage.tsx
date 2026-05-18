import JsBarcode from "jsbarcode";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { InventoryBreadcrumb } from "../../components/inventory/InventoryBreadcrumb";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useBrands } from "../../context/BrandsContext";
import { useRegions } from "../../context/RegionsContext";
import { useSpares } from "../../context/SparesContext";
import { ApiError, apiJson, useApiMode } from "../../lib/api";
import {
  sanitizeAlphanumericInput,
  sanitizeDecimalInput,
  sanitizeMultilineTextInput,
  sanitizeTextInput,
} from "../../lib/inputSanitize";
import type { SparePriceLine } from "../../types/spare";

const inputClass =
  "mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm text-stone-900 outline-none ring-zimson-400/40 focus:ring-2";

const categories = ["Glass", "Movement", "Battery", "Crown", "Gasket", "Strap", "Dial", "Hands", "Lubricant", "Tool", "Consumable", "Stem", "Other"];

type SpareHistoryRow = {
  id: string;
  eventType: string;
  locationType: "HO" | "STORE" | null;
  regionName: string | null;
  storeName: string | null;
  quantityChange: number | null;
  balanceAfter: number | null;
  referenceType: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
};

export function InventorySpareCatalogPage() {
  const apiMode = useApiMode();
  const { spares, addSpare } = useSpares();
  const { user } = useAuth();
  const hideStockLogsButton =
    user?.role === "ho_purchase" || user?.role === "ho_manager" || user?.role === "admin" || user?.role === "ho_manager";
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Other");
  const [hsn, setHsn] = useState("");
  const [costPriceInr, setCostPriceInr] = useState("");
  const [sellingPriceInr, setSellingPriceInr] = useState("");
  const [isActive, setIsActive] = useState(true);
  const { regions } = useRegions();
  const { brands: brandMasterRows } = useBrands();
  const brandOptions = useMemo(() => brandMasterRows.map((b) => b.name), [brandMasterRows]);
  const [regionId, setRegionId] = useState("");
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [prices, setPrices] = useState<SparePriceLine[]>([]);
  const [brand, setBrand] = useState("");
  const [price, setPrice] = useState("");
  const [priceErr, setPriceErr] = useState<string | null>(null);
  const [addSpareOpen, setAddSpareOpen] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState<null | "download" | "validate" | "commit">(null);
  const [bulkValidated, setBulkValidated] = useState(false);
  const [bulkErrors, setBulkErrors] = useState<string[]>([]);
  const [bulkMsg, setBulkMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [bulkFileName, setBulkFileName] = useState<string | null>(null);
  const [bulkSummary, setBulkSummary] = useState<{ spareRows: number; priceRows: number; stockRows: number } | null>(
    null,
  );
  const bulkFileRef = useRef<File | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState<SpareHistoryRow[]>([]);
  const [historyErr, setHistoryErr] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const canCreateSpare = user?.role === "super_admin" || user?.role === "admin";
  const hoOnlyRole =
    user?.role === "service_centre_clerk" || user?.role === "service_centre_supervisor" || user?.role === "technician";

  useEffect(() => {
    if (regions.length > 0 && !regionId) setRegionId(regions[0]!.id);
  }, [regions, regionId]);

  useEffect(() => {
    if (brandOptions.length === 0) return;
    if (!brand || !brandOptions.includes(brand)) setBrand(brandOptions[0]!);
  }, [brandOptions, brand]);

  useEffect(() => {
    if (!user) return;
    if (user.role !== "super_admin") {
      if (user.regionId) setRegionId(user.regionId);
      if (user.role === "store_user") {
        return;
      } else if (hoOnlyRole) {
        return;
      }
    }
  }, [user, hoOnlyRole]);

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

  async function loadHistory(spareId: string) {
    setHistoryLoading(true);
    setHistoryErr(null);
    try {
      const data = await apiJson<{ history: SpareHistoryRow[] }>(
        `/api/catalog/spares/${encodeURIComponent(spareId)}/stock-history?limit=120`,
      );
      setHistoryRows(data.history);
    } catch (e) {
      setHistoryRows([]);
      setHistoryErr(e instanceof ApiError ? e.message : "Could not load spare logs.");
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    if (!selectedId) return;
    setPriceErr(null);
    void loadPrices(selectedId);
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

  function printBarcodeLabel(target = selectedSpare) {
    if (!target || !barcodeRef.current) return;
    JsBarcode(barcodeRef.current, target.sku, {
      format: "CODE128",
      displayValue: true,
      lineColor: "#111827",
      width: 2,
      height: 60,
      margin: 8,
    });
    const popup = window.open("", "_blank", "width=480,height=640");
    if (!popup) return;
    popup.document.write(`<!doctype html>
<html>
  <head>
    <title>Spare Barcode - ${target.sku}</title>
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
      <div class="name">${target.name}</div>
      <div class="sku">${target.sku}</div>
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
    const costValue = costPriceInr.trim() === "" ? null : Number(costPriceInr);
    const sellingValue = sellingPriceInr.trim() === "" ? null : Number(sellingPriceInr);
    if (costValue != null && (Number.isNaN(costValue) || costValue < 0)) {
      setMsg({ type: "err", text: "Cost price must be a non-negative number." });
      return;
    }
    if (sellingValue != null && (Number.isNaN(sellingValue) || sellingValue < 0)) {
      setMsg({ type: "err", text: "Selling price must be a non-negative number." });
      return;
    }
    const r = await addSpare({
      sku,
      name,
      description,
      category,
      hsn: hsn.trim() || null,
      costPriceInr: costValue,
      sellingPriceInr: sellingValue,
      mrpInr: sellingValue,
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
    setCostPriceInr("");
    setSellingPriceInr("");
    setIsActive(true);
    setAddSpareOpen(false);
  }

  async function addPriceLine(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    const brandValue = brand.trim();
    const priceValue = Number(price);
    if (!regionId || !brandValue || Number.isNaN(priceValue) || priceValue < 0) {
      setPriceErr("Select region, brand, and a non-negative price.");
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

  function openDetails(spareId: string) {
    setSelectedId(spareId);
    setDetailsOpen(true);
  }

  function openLogs(spareId: string) {
    setSelectedId(spareId);
    setLogsOpen(true);
    void loadHistory(spareId);
  }

  async function downloadBulkTemplate() {
    if (!apiMode) {
      setBulkMsg({ type: "err", text: "API mode is off. Enable API mode to use bulk import." });
      return;
    }
    setBulkBusy("download");
    setBulkMsg(null);
    try {
      const res = await fetch("/api/inventory/bulk-import/template", { credentials: "include" });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? res.statusText);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "inventory_bulk_import_template.xlsx";
      a.click();
      URL.revokeObjectURL(url);
      setBulkMsg({ type: "ok", text: "Template downloaded." });
    } catch (e) {
      setBulkMsg({ type: "err", text: e instanceof Error ? e.message : "Template download failed." });
    } finally {
      setBulkBusy(null);
    }
  }

  function onPickBulkFile(file: File | null) {
    bulkFileRef.current = file;
    setBulkFileName(file?.name ?? null);
    setBulkValidated(false);
    setBulkErrors([]);
    setBulkSummary(null);
    setBulkMsg(null);
  }

  async function validateBulkFile() {
    if (!apiMode || !bulkFileRef.current) {
      setBulkMsg({ type: "err", text: "Choose an .xlsx file first." });
      return;
    }
    setBulkBusy("validate");
    setBulkErrors([]);
    setBulkMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", bulkFileRef.current);
      const res = await fetch("/api/inventory/bulk-import/validate", { method: "POST", body: fd, credentials: "include" });
      const data = (await res.json()) as {
        ok?: boolean;
        errors?: string[];
        summary?: { spareRows: number; priceRows: number; stockRows: number };
      };
      if (!res.ok || !data.ok) {
        setBulkValidated(false);
        setBulkErrors(Array.isArray(data.errors) ? data.errors : ["Validation failed."]);
        setBulkMsg({ type: "err", text: "Fix errors and check again." });
        return;
      }
      setBulkValidated(true);
      setBulkSummary(data.summary ?? null);
      setBulkMsg({
        type: "ok",
        text: `Preview OK: ${data.summary?.spareRows ?? 0} spares, ${data.summary?.priceRows ?? 0} prices, ${data.summary?.stockRows ?? 0} stock.`,
      });
    } catch {
      setBulkValidated(false);
      setBulkMsg({ type: "err", text: "Could not validate file." });
    } finally {
      setBulkBusy(null);
    }
  }

  async function importBulkFile() {
    if (!apiMode || !bulkFileRef.current || !bulkValidated) {
      setBulkMsg({ type: "err", text: "Run Check first, then import." });
      return;
    }
    setBulkBusy("commit");
    setBulkErrors([]);
    setBulkMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", bulkFileRef.current);
      const res = await fetch("/api/inventory/bulk-import/commit", { method: "POST", body: fd, credentials: "include" });
      const data = (await res.json()) as {
        ok?: boolean;
        errors?: string[];
        summary?: { sparesUpserted: number; pricesUpserted: number; stockUpserted: number };
      };
      if (!res.ok || !data.ok) {
        setBulkErrors(Array.isArray(data.errors) ? data.errors : ["Import failed."]);
        setBulkMsg({ type: "err", text: "Import rejected. See errors." });
        return;
      }
      setBulkValidated(false);
      setBulkSummary(null);
      setBulkMsg({
        type: "ok",
        text: `Imported: ${data.summary?.sparesUpserted ?? 0} spares, ${data.summary?.pricesUpserted ?? 0} prices, ${data.summary?.stockUpserted ?? 0} stock.`,
      });
      setBulkFileName(null);
      bulkFileRef.current = null;
      setBulkImportOpen(false);
    } catch {
      setBulkMsg({ type: "err", text: "Could not import file." });
    } finally {
      setBulkBusy(null);
    }
  }

  return (
    <div>
      <InventoryBreadcrumb current="Spare catalogue" />
      <PageHeader
        title="Spare master"
        description=""
        actions={
          <Link
            to="/inventory"
            className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
          >
            Inventory home
          </Link>
        }
      />

      <div className="grid gap-8">
        <Card
          title="Spares"
          subtitle={`${spares.length} row(s)`}
          action={
            canCreateSpare ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setBulkMsg(null);
                    setBulkImportOpen(true);
                  }}
                  className="rounded-xl border border-zimson-300 bg-white px-4 py-2 text-sm font-semibold text-zimson-900 hover:bg-zimson-50"
                >
                  Bulk import
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMsg(null);
                    setAddSpareOpen(true);
                  }}
                  className="rounded-xl bg-zimson-600 px-4 py-2 text-sm font-semibold text-white hover:bg-zimson-700"
                >
                  Add spare
                </button>
              </div>
            ) : undefined
          }
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
                  <th className="px-3 py-2">Cost price</th>
                  <th className="px-3 py-2">Active</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {spares.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-zimson-100 last:border-0 hover:bg-zimson-50/80"
                  >
                    <td className="px-3 py-2 font-mono text-xs font-semibold text-zimson-900">{s.sku}</td>
                    <td className="max-w-[220px] truncate px-3 py-2 text-stone-800" title={s.name}>{s.name}</td>
                    <td className="max-w-[260px] truncate px-3 py-2 text-stone-700" title={s.description}>{s.description}</td>
                    <td className="px-3 py-2 text-stone-600">{s.category}</td>
                    <td className="px-3 py-2 font-mono text-xs text-stone-600">{s.hsn ?? "-"}</td>
                    <td className="px-3 py-2 text-stone-700">
                      {s.costPriceInr == null ? "-" : s.costPriceInr}
                    </td>
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
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openDetails(s.id)}
                          className="rounded-lg border border-zimson-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-zimson-900 hover:bg-zimson-50"
                        >
                          Details
                        </button>
                        <button
                          type="button"
                          onClick={() => printBarcodeLabel(s)}
                          className="rounded-lg border border-zimson-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-zimson-900 hover:bg-zimson-50"
                        >
                          Print barcode
                        </button>
                        {hideStockLogsButton ? null : (
                        <button
                          type="button"
                          onClick={() => openLogs(s.id)}
                          className="rounded-lg border border-zimson-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-zimson-900 hover:bg-zimson-50"
                        >
                          Logs
                        </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {addSpareOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-stone-900">Add spare</h3>
                <p className="text-sm text-stone-600">Create a spare master row</p>
              </div>
              <button type="button" onClick={() => setAddSpareOpen(false)} className="rounded-lg border px-3 py-1.5 text-sm">
                Close
              </button>
            </div>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label htmlFor="sp-sku" className="text-xs font-medium text-stone-600">
                  SKU *
                </label>
                <input
                  id="sp-sku"
                  value={sku}
                  onChange={(e) => setSku(sanitizeAlphanumericInput(e.target.value, 48))}
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
                  onChange={(e) => setName(sanitizeTextInput(e.target.value, 200))}
                  className={inputClass}
                  placeholder="Part name"
                />
              </div>
              <div>
                <label htmlFor="sp-desc" className="text-xs font-medium text-stone-600">
                  Description *
                </label>
                <textarea
                  id="sp-desc"
                  value={description}
                  onChange={(e) => setDescription(sanitizeMultilineTextInput(e.target.value, 500))}
                  className={inputClass}
                  rows={3}
                />
              </div>
              <div>
                <label htmlFor="sp-cat" className="text-xs font-medium text-stone-600">
                  Category *
                </label>
                <select
                  id="sp-cat"
                  value={category}
                  onChange={(e) => setCategory(sanitizeTextInput(e.target.value, 40))}
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
                  <input
                    id="sp-hsn"
                    value={hsn}
                    onChange={(e) => setHsn(sanitizeAlphanumericInput(e.target.value, 16))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="sp-cost" className="text-xs font-medium text-stone-600">
                    Cost price (INR)
                  </label>
                  <input
                    id="sp-cost"
                    type="number"
                    min={0}
                    step={0.01}
                    value={costPriceInr}
                    onChange={(e) => setCostPriceInr(sanitizeDecimalInput(e.target.value))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="sp-selling" className="text-xs font-medium text-stone-600">
                    Selling price (INR)
                  </label>
                  <input
                    id="sp-selling"
                    type="number"
                    min={0}
                    step={0.01}
                    value={sellingPriceInr}
                    onChange={(e) => setSellingPriceInr(sanitizeDecimalInput(e.target.value))}
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
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAddSpareOpen(false)}
                  className="rounded-xl border border-zimson-300 bg-white px-4 py-2 text-sm font-semibold text-zimson-900 hover:bg-zimson-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-zimson-600 px-4 py-2 text-sm font-semibold text-white hover:bg-zimson-700"
                >
                  Save spare
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {bulkImportOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-stone-900">Bulk import preview / check</h3>
                <p className="text-sm text-stone-600">Download template, upload file, check, then import</p>
              </div>
              <button type="button" onClick={() => setBulkImportOpen(false)} className="rounded-lg border px-3 py-1.5 text-sm">
                Close
              </button>
            </div>

            {bulkMsg ? (
              <p
                className={`mb-4 rounded-xl px-3 py-2 text-sm ring-1 ${
                  bulkMsg.type === "ok"
                    ? "bg-emerald-50 text-emerald-900 ring-emerald-200"
                    : "bg-red-50 text-red-800 ring-red-200"
                }`}
              >
                {bulkMsg.text}
              </p>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <Card title="Template">
                <button
                  type="button"
                  onClick={() => void downloadBulkTemplate()}
                  disabled={!apiMode || bulkBusy !== null}
                  className="rounded-xl bg-zimson-600 px-4 py-2 text-sm font-semibold text-white hover:bg-zimson-700 disabled:opacity-50"
                >
                  {bulkBusy === "download" ? "Preparing..." : "Download .xlsx template"}
                </button>
              </Card>
              <Card title="Upload + check">
                <input
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="block w-full text-sm text-stone-700 file:mr-3 file:rounded-lg file:border file:border-zimson-300 file:bg-white file:px-3 file:py-2 file:text-sm file:font-semibold file:text-zimson-900"
                  onChange={(e) => onPickBulkFile(e.target.files?.[0] ?? null)}
                />
                {bulkFileName ? <p className="mt-2 text-xs text-stone-500">Selected: {bulkFileName}</p> : null}
                {bulkSummary && bulkValidated ? (
                  <p className="mt-2 text-xs text-stone-600">
                    Preview: {bulkSummary.spareRows} spares, {bulkSummary.priceRows} prices, {bulkSummary.stockRows} stock
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void validateBulkFile()}
                    disabled={!apiMode || !bulkFileRef.current || bulkBusy !== null}
                    className="rounded-xl border border-zimson-300 bg-white px-4 py-2 text-sm font-semibold text-zimson-900 hover:bg-zimson-50 disabled:opacity-50"
                  >
                    {bulkBusy === "validate" ? "Checking..." : "Check"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void importBulkFile()}
                    disabled={!apiMode || !bulkValidated || !bulkFileRef.current || bulkBusy !== null}
                    className="rounded-xl bg-zimson-600 px-4 py-2 text-sm font-semibold text-white hover:bg-zimson-700 disabled:opacity-50"
                  >
                    {bulkBusy === "commit" ? "Importing..." : "Import"}
                  </button>
                </div>
              </Card>
            </div>

            {bulkErrors.length > 0 ? (
              <Card title="Errors" className="mt-4">
                <ul className="list-disc space-y-1.5 pl-5 text-sm text-red-900">
                  {bulkErrors.map((err) => (
                    <li key={err}>{err}</li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="hidden">
        <svg ref={barcodeRef} />
      </div>

      {detailsOpen && selectedSpare ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-6xl overflow-auto rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-stone-900">Spare details</h3>
                <p className="text-sm text-stone-600">{selectedSpare.name} · {selectedSpare.sku}</p>
              </div>
              <button type="button" onClick={() => setDetailsOpen(false)} className="rounded-lg border px-3 py-1.5 text-sm">
                Close
              </button>
            </div>
            <div className="mb-5 flex justify-end">
              <button
                type="button"
                onClick={() => printBarcodeLabel()}
                className="rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zimson-700"
              >
                Print barcode
              </button>
            </div>
            <Card title="Master prices" subtitle="Spare master values">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-zimson-200 bg-zimson-50/40 px-3 py-2">
                  <p className="text-xs text-stone-500">Cost price</p>
                  <p className="text-sm font-semibold text-stone-900">
                    {selectedSpare.costPriceInr == null ? "-" : selectedSpare.costPriceInr}
                  </p>
                </div>
                <div className="rounded-lg border border-zimson-200 bg-zimson-50/40 px-3 py-2">
                  <p className="text-xs text-stone-500">Selling price</p>
                  <p className="text-sm font-semibold text-stone-900">
                    {selectedSpare.sellingPriceInr ?? selectedSpare.mrpInr ?? "-"}
                  </p>
                </div>
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
              <select value={brand} onChange={(e) => setBrand(e.target.value)} className={inputClass}>
                {brandOptions.length === 0 ? (
                  <option value="">No brands — add under Inventory → Brands</option>
                ) : (
                  brandOptions.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))
                )}
              </select>
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
            </div>
          </div>
        </div>
      ) : null}

      {logsOpen && selectedSpare ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-5xl overflow-auto rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-stone-900">Spare logs</h3>
                <p className="text-sm text-stone-600">{selectedSpare.name} · {selectedSpare.sku}</p>
              </div>
              <button type="button" onClick={() => setLogsOpen(false)} className="rounded-lg border px-3 py-1.5 text-sm">
                Close
              </button>
            </div>
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => void loadHistory(selectedSpare.id)}
                className="rounded-lg border border-zimson-300 bg-white px-3 py-1.5 text-xs font-semibold text-zimson-900 hover:bg-zimson-50"
              >
                {historyLoading ? "Loading…" : "Refresh"}
              </button>
            </div>
            {historyErr ? <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{historyErr}</p> : null}
            <div className="max-h-[58vh] overflow-auto rounded-xl border border-zimson-200/80">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 border-b border-zimson-200 bg-zimson-50/95 text-xs font-semibold uppercase text-stone-600">
                  <tr>
                    <th className="px-3 py-2">Time</th>
                    <th className="px-3 py-2">Event</th>
                    <th className="px-3 py-2">Location</th>
                    <th className="px-3 py-2">Qty change</th>
                    <th className="px-3 py-2">Balance</th>
                    <th className="px-3 py-2">By</th>
                    <th className="px-3 py-2">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRows.map((h) => (
                    <tr key={h.id} className="border-b border-zimson-100">
                      <td className="whitespace-nowrap px-3 py-2">{new Date(h.createdAt).toLocaleString()}</td>
                      <td className="px-3 py-2">{h.eventType}</td>
                      <td className="px-3 py-2">
                        {[h.locationType ?? "-", h.regionName ?? "-", h.storeName ?? "-"].filter((v, i) => i === 0 || v !== "-").join(" · ")}
                      </td>
                      <td className="px-3 py-2">{h.quantityChange ?? "-"}</td>
                      <td className="px-3 py-2">{h.balanceAfter ?? "-"}</td>
                      <td className="px-3 py-2">{h.createdBy ?? "-"}</td>
                      <td className="max-w-[320px] truncate px-3 py-2" title={h.note ?? ""}>{h.note ?? "-"}</td>
                    </tr>
                  ))}
                  {historyRows.length === 0 && !historyLoading ? (
                    <tr>
                      <td className="px-3 py-4 text-sm text-stone-500" colSpan={7}>
                        No logs found.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
