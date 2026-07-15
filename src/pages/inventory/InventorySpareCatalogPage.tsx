import JsBarcode from "jsbarcode";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { InventoryBreadcrumb } from "../../components/inventory/InventoryBreadcrumb";
import { Card } from "../../components/ui/Card";
import { FilterField } from "../../components/ui/FilterField";
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
  return eventType.replace(/_/g, " ");
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

function IconBarcode({ className = "h-[1.125rem] w-[1.125rem]" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 6v12M7 6v12M9 6v12M12 6v12M14 6v12M17 6v12M20 6v12"
      />
    </svg>
  );
}

function IconLogs({ className = "h-[1.125rem] w-[1.125rem]" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
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
  const { spares, addSpare, updateSpare } = useSpares();
  const { user } = useAuth();
  const hideStockLogsButton =
    user?.role === "ho_purchase" || user?.role === "ho_manager" || user?.role === "admin" || user?.role === "ho_manager";
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Other");
  const [hsn, setHsn] = useState("");
  const [gstPercent, setGstPercent] = useState("18");
  const [editHsn, setEditHsn] = useState("");
  const [editGstPercent, setEditGstPercent] = useState("");
  const [taxEditMsg, setTaxEditMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
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
  const [detailsTab, setDetailsTab] = useState<"details" | "logs">("details");
  const [historyRows, setHistoryRows] = useState<SpareHistoryRow[]>([]);
  const [historyErr, setHistoryErr] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const canCreateSpare = user?.role === "super_admin" || user?.role === "admin";
  const hoOnlyRole =
    user?.role === "service_centre_clerk" || user?.role === "service_centre_supervisor" || user?.role === "technician";
  const canViewLogs = !hideStockLogsButton;

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

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of spares) {
      if (s.category) set.add(s.category);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [spares]);

  const filteredSpares = useMemo(() => {
    const q = query.trim().toLowerCase();
    return spares.filter((s) => {
      if (categoryFilter && s.category !== categoryFilter) return false;
      if (activeFilter === "ACTIVE" && !s.isActive) return false;
      if (activeFilter === "INACTIVE" && s.isActive) return false;
      if (q) {
        const hay = `${s.sku} ${s.name} ${s.description} ${s.category} ${s.hsn ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [spares, query, categoryFilter, activeFilter]);

  const barcodeRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!selectedSpare) return;
    setEditHsn(selectedSpare.hsn ?? "");
    setEditGstPercent(selectedSpare.gstPercent != null ? String(selectedSpare.gstPercent) : "");
    setTaxEditMsg(null);
  }, [selectedSpare?.id, selectedSpare?.hsn, selectedSpare?.gstPercent]);

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
      @import url("https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap");
      body { font-family: "Poppins", ui-sans-serif, system-ui, sans-serif; margin: 24px; color: #111827; }
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
    const gstValue = gstPercent.trim() === "" ? null : Number(gstPercent);
    if (gstValue != null && (Number.isNaN(gstValue) || gstValue < 0 || gstValue > 100)) {
      setMsg({ type: "err", text: "GST % must be between 0 and 100." });
      return;
    }
    const r = await addSpare({
      sku,
      name,
      description,
      category,
      hsn: hsn.trim() || null,
      gstPercent: gstValue,
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
    setGstPercent("18");
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

  function openDetails(spareId: string, tab: "details" | "logs" = "details") {
    setSelectedId(spareId);
    setDetailsTab(tab);
    setDetailsOpen(true);
    if (tab === "logs") void loadHistory(spareId);
  }

  async function saveSpareTaxDetails(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSpare) return;
    setTaxEditMsg(null);
    const gstValue = editGstPercent.trim() === "" ? null : Number(editGstPercent);
    if (gstValue != null && (Number.isNaN(gstValue) || gstValue < 0 || gstValue > 100)) {
      setTaxEditMsg({ type: "err", text: "GST % must be between 0 and 100." });
      return;
    }
    const r = await updateSpare(selectedSpare.id, {
      hsn: editHsn.trim() || null,
      gstPercent: gstValue,
    });
    if ("error" in r) {
      setTaxEditMsg({ type: "err", text: r.error });
      return;
    }
    setTaxEditMsg({ type: "ok", text: "HSN and GST % saved." });
  }

  function openLogs(spareId: string) {
    openDetails(spareId, "logs");
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
    <div className="ui-page-bleed px-3 font-sans text-rlx-ink sm:px-4 md:px-5">
      <InventoryBreadcrumb current="Spare catalogue" />
      <PageHeader
        title="Spare master"
        description="Spare catalogue with tax, prices, barcode, and stock logs."
        actions={
          <div className="flex flex-wrap gap-2">
            {canCreateSpare ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setBulkMsg(null);
                    setBulkImportOpen(true);
                  }}
                  className="inline-flex border border-rlx-rule bg-white px-4 py-2.5 text-sm font-semibold text-rlx-green transition hover:border-rlx-green hover:bg-rlx-green-light"
                >
                  Bulk import
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMsg(null);
                    setAddSpareOpen(true);
                  }}
                  className="inline-flex border border-rlx-gold/70 bg-rlx-gold px-4 py-2.5 text-sm font-semibold text-rlx-green-deep transition hover:bg-rlx-gold-dark"
                >
                  Add spare
                </button>
              </>
            ) : null}
            <Link
              to="/inventory"
              className="inline-flex border border-rlx-rule bg-white px-4 py-2.5 text-sm font-semibold text-rlx-green no-underline transition hover:border-rlx-green hover:bg-rlx-green-light"
            >
              Inventory home
            </Link>
          </div>
        }
      />

      <section className="mb-5 border border-rlx-rule bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rlx-rule bg-rlx-bg px-3 py-2.5 sm:px-4">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-rlx-ink-muted">
            Filters · {filteredSpares.length} of {spares.length}
          </h2>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setCategoryFilter("");
              setActiveFilter("ALL");
            }}
            className="ui-btn-secondary"
          >
            Reset
          </button>
        </div>
        <div className="ui-filter-grid p-3 sm:p-4">
          <FilterField label="Search" htmlFor="spare-q" className="ui-filter-span-2-sm min-w-0">
            <input
              id="spare-q"
              className="ui-field"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="SKU, name, description, HSN…"
            />
          </FilterField>
          <FilterField label="Category" htmlFor="spare-cat" className="min-w-0">
            <select
              id="spare-cat"
              className="ui-field"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="">All categories</option>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Status" htmlFor="spare-active" className="min-w-0">
            <select
              id="spare-active"
              className="ui-field"
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value as typeof activeFilter)}
            >
              <option value="ALL">All</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </FilterField>
        </div>
      </section>

      {filteredSpares.length === 0 ? (
        <p className="border border-rlx-rule bg-white px-4 py-8 text-center text-sm text-rlx-ink-muted">
          No spares match the current filters.
        </p>
      ) : (
        <>
          <p className="mb-2 text-xs text-rlx-ink-muted md:hidden">Swipe horizontally to see more columns →</p>
          <div className="ui-table-scroll border border-rlx-rule bg-white shadow-sm">
            <table className="ui-table-dense w-full min-w-[40rem] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-rlx-green text-[11px] font-semibold uppercase tracking-[0.14em] text-white">
                <tr className="border-b-2 border-rlx-gold">
                  <th className="whitespace-nowrap px-3 py-3 text-left font-semibold">SKU</th>
                  <th className="min-w-[14rem] px-3 py-3 text-left font-semibold">Item</th>
                  <th className="whitespace-nowrap px-3 py-3 text-right font-semibold">Cost</th>
                  <th className="whitespace-nowrap px-3 py-3 text-left font-semibold">Active</th>
                  <th className="whitespace-nowrap px-3 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSpares.map((s, idx) => (
                  <tr
                    key={s.id}
                    onClick={() => openDetails(s.id)}
                    className={`cursor-pointer border-b border-rlx-rule transition-colors hover:bg-rlx-green-light ${
                      idx % 2 === 1 ? "bg-rlx-bg" : "bg-white"
                    }`}
                  >
                    <td className="align-middle px-3 py-3">
                      <span className="block whitespace-nowrap font-mono text-sm font-semibold text-rlx-green">
                        {s.sku}
                      </span>
                    </td>
                    <td className="align-middle px-3 py-3">
                      <span className="block break-words text-sm font-medium leading-snug text-rlx-ink">{s.name}</span>
                      <span className="block text-xs leading-snug text-rlx-ink-muted">
                        {s.category}
                        {s.description ? ` · ${s.description}` : ""}
                      </span>
                    </td>
                    <td className="align-middle whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-rlx-ink">
                      {s.costPriceInr == null ? "—" : s.costPriceInr.toLocaleString()}
                    </td>
                    <td className="align-middle px-3 py-3">
                      <span
                        className={`inline-flex rounded px-2 py-1 text-xs font-semibold ring-1 ring-inset ${
                          s.isActive
                            ? "bg-emerald-50 text-emerald-900 ring-emerald-300/70"
                            : "bg-stone-100 text-stone-700 ring-stone-300/70"
                        }`}
                      >
                        {s.isActive ? "Yes" : "No"}
                      </span>
                    </td>
                    <td className="align-middle px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-nowrap items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openDetails(s.id)}
                          className={btnIcon}
                          title="Details"
                          aria-label="Details"
                        >
                          <IconDetails />
                        </button>
                        <button
                          type="button"
                          onClick={() => printBarcodeLabel(s)}
                          className={btnIcon}
                          title="Print barcode"
                          aria-label="Print barcode"
                        >
                          <IconBarcode />
                        </button>
                        {canViewLogs ? (
                          <button
                            type="button"
                            onClick={() => openLogs(s.id)}
                            className={btnIcon}
                            title="Stock logs"
                            aria-label="Stock logs"
                          >
                            <IconLogs />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

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
                  <label htmlFor="sp-gst" className="text-xs font-medium text-stone-600">
                    GST % *
                  </label>
                  <input
                    id="sp-gst"
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={gstPercent}
                    onChange={(e) => setGstPercent(sanitizeDecimalInput(e.target.value))}
                    className={inputClass}
                    required
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
        <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-rlx-ink/70 p-0 backdrop-blur-sm sm:items-center sm:p-3 md:p-5">
          <div className="flex h-[100dvh] w-full max-w-[96rem] flex-col overflow-hidden bg-white shadow-[0_32px_80px_-20px_rgba(0,0,0,0.5)] sm:h-[min(96dvh,58rem)] sm:max-h-[96dvh]">
            <div className="flex shrink-0 items-center justify-between gap-3 bg-rlx-green px-4 py-3 sm:px-6">
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-semibold uppercase tracking-[0.35em] text-rlx-gold">Spare details</p>
                <h3 className="truncate font-mono text-base font-semibold text-white sm:text-lg">{selectedSpare.sku}</h3>
                <p className="mt-0.5 truncate text-xs text-white/65 sm:text-sm">
                  {selectedSpare.name} · {selectedSpare.category}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => printBarcodeLabel()}
                  className={`${modalIconGhost} border-rlx-gold/50 bg-rlx-gold text-rlx-green-deep hover:bg-rlx-gold-dark`}
                  title="Print barcode"
                  aria-label="Print barcode"
                >
                  <IconBarcode />
                </button>
                <button
                  type="button"
                  onClick={() => setDetailsOpen(false)}
                  className={modalIconGhost}
                  title="Close"
                  aria-label="Close"
                >
                  <IconClose />
                </button>
              </div>
            </div>

            {canViewLogs ? (
              <div className="flex shrink-0 gap-1.5 border-b border-rlx-rule bg-rlx-bg px-4 py-2 sm:px-6">
                <button
                  type="button"
                  onClick={() => setDetailsTab("details")}
                  className={`px-3 py-1.5 text-xs font-semibold transition ${
                    detailsTab === "details"
                      ? "bg-rlx-green text-white"
                      : "border border-rlx-rule bg-white text-rlx-green hover:bg-rlx-green-light"
                  }`}
                >
                  Details & prices
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDetailsTab("logs");
                    void loadHistory(selectedSpare.id);
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold transition ${
                    detailsTab === "logs"
                      ? "bg-rlx-green text-white"
                      : "border border-rlx-rule bg-white text-rlx-green hover:bg-rlx-green-light"
                  }`}
                >
                  Full stock history
                </button>
              </div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              {detailsTab === "details" || !canViewLogs ? (
                <div className="space-y-5">
                  <div className="overflow-hidden border border-rlx-rule">
                    <table className="w-full text-left text-sm">
                      <tbody className="odd:[&>tr]:bg-white even:[&>tr]:bg-rlx-bg">
                        <tr className="border-b border-rlx-rule">
                          <th className="w-40 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.12em] text-rlx-ink-muted">
                            SKU
                          </th>
                          <td className="px-3 py-2.5 font-mono font-semibold text-rlx-green">{selectedSpare.sku}</td>
                        </tr>
                        <tr className="border-b border-rlx-rule">
                          <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.12em] text-rlx-ink-muted">
                            Name
                          </th>
                          <td className="px-3 py-2.5">{selectedSpare.name}</td>
                        </tr>
                        <tr className="border-b border-rlx-rule">
                          <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.12em] text-rlx-ink-muted">
                            Description
                          </th>
                          <td className="px-3 py-2.5">{selectedSpare.description || "—"}</td>
                        </tr>
                        <tr className="border-b border-rlx-rule">
                          <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.12em] text-rlx-ink-muted">
                            Category
                          </th>
                          <td className="px-3 py-2.5">{selectedSpare.category}</td>
                        </tr>
                        <tr className="border-b border-rlx-rule">
                          <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.12em] text-rlx-ink-muted">
                            Active
                          </th>
                          <td className="px-3 py-2.5">{selectedSpare.isActive ? "Yes" : "No"}</td>
                        </tr>
                        <tr className="border-b border-rlx-rule">
                          <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.12em] text-rlx-ink-muted">
                            Cost / Selling
                          </th>
                          <td className="px-3 py-2.5">
                            {selectedSpare.costPriceInr ?? "—"} /{" "}
                            {selectedSpare.sellingPriceInr ?? selectedSpare.mrpInr ?? "—"}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <Card title="HSN & GST (billing)" subtitle="Used on Quick Bill, store billing, and GRN">
                    <form onSubmit={(e) => void saveSpareTaxDetails(e)} className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="text-xs font-medium text-stone-600">HSN / SAC</label>
                        <input
                          value={editHsn}
                          onChange={(e) => setEditHsn(sanitizeAlphanumericInput(e.target.value, 16))}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-stone-600">GST %</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.01}
                          value={editGstPercent}
                          onChange={(e) => setEditGstPercent(sanitizeDecimalInput(e.target.value))}
                          className={inputClass}
                          required
                        />
                      </div>
                      <div className="flex items-center gap-3 sm:col-span-2">
                        <button
                          type="submit"
                          className="rounded-xl bg-zimson-600 px-4 py-2 text-sm font-semibold text-white hover:bg-zimson-700"
                        >
                          Save HSN & GST
                        </button>
                        {taxEditMsg ? (
                          <p className={`text-sm ${taxEditMsg.type === "ok" ? "text-emerald-800" : "text-red-800"}`}>
                            {taxEditMsg.text}
                          </p>
                        ) : null}
                      </div>
                    </form>
                  </Card>

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
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        className={inputClass}
                        placeholder="Price"
                      />
                      <button
                        type="submit"
                        className="rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zimson-700"
                      >
                        Save price
                      </button>
                    </form>
                    {priceErr ? <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{priceErr}</p> : null}
                    <div className="max-h-[280px] overflow-auto border border-rlx-rule">
                      <table className="min-w-full text-left text-sm">
                        <thead className="sticky top-0 bg-rlx-bg text-[11px] font-semibold uppercase tracking-[0.12em] text-rlx-ink-muted">
                          <tr className="border-b border-rlx-rule">
                            <th className="px-3 py-2">Region</th>
                            <th className="px-3 py-2">Brand</th>
                            <th className="px-3 py-2">Price</th>
                            <th className="px-3 py-2">Created</th>
                          </tr>
                        </thead>
                        <tbody>
                          {prices.map((p) => (
                            <tr key={p.id} className="border-b border-rlx-rule">
                              <td className="px-3 py-2">
                                {regions.find((r) => r.id === p.regionId)?.name ?? p.regionId ?? "-"}
                              </td>
                              <td className="px-3 py-2">{p.brand}</td>
                              <td className="px-3 py-2">{p.price}</td>
                              <td className="px-3 py-2 text-xs text-rlx-ink-muted">
                                {new Date(p.createdAt).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                          {prices.length === 0 ? (
                            <tr>
                              <td className="px-3 py-4 text-sm text-rlx-ink-muted" colSpan={4}>
                                No brand price lines yet.
                              </td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </div>
              ) : (
                <div>
                  <div className="mb-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => void loadHistory(selectedSpare.id)}
                      className="border border-rlx-rule bg-white px-3 py-1.5 text-xs font-semibold text-rlx-green hover:bg-rlx-green-light"
                    >
                      {historyLoading ? "Loading…" : "Refresh"}
                    </button>
                  </div>
                  {historyErr ? (
                    <p className="mb-3 border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{historyErr}</p>
                  ) : null}
                  {historyLoading && historyRows.length === 0 ? (
                    <p className="text-sm text-rlx-ink-muted">Loading history…</p>
                  ) : historyRows.length === 0 ? (
                    <p className="border border-rlx-rule bg-rlx-bg px-3 py-6 text-center text-sm text-rlx-ink-muted">
                      No stock history found.
                    </p>
                  ) : (
                    <div className="overflow-auto border border-rlx-rule">
                      <table className="w-full table-fixed text-left text-sm">
                        <colgroup>
                          <col className="w-[9rem]" />
                          <col className="w-[10rem]" />
                          <col />
                          <col className="w-[5rem]" />
                          <col className="w-[5rem]" />
                          <col className="w-[8rem]" />
                        </colgroup>
                        <thead className="sticky top-0 z-10 bg-rlx-bg text-[11px] font-semibold uppercase tracking-[0.12em] text-rlx-ink-muted">
                          <tr className="border-b border-rlx-rule">
                            <th className="px-3 py-2.5 text-left">When</th>
                            <th className="px-3 py-2.5 text-left">Event</th>
                            <th className="px-3 py-2.5 text-left">Place</th>
                            <th className="px-3 py-2.5 text-right">Change</th>
                            <th className="px-3 py-2.5 text-right">Balance</th>
                            <th className="px-3 py-2.5 text-left">By</th>
                          </tr>
                        </thead>
                        <tbody>
                          {historyRows.map((h, idx) => {
                            const change = h.quantityChange;
                            return (
                              <tr
                                key={h.id}
                                className={`border-b border-rlx-rule ${idx % 2 === 1 ? "bg-rlx-bg" : "bg-white"}`}
                              >
                                <td className="px-3 py-2.5 align-top text-xs text-rlx-ink-muted">
                                  {new Date(h.createdAt).toLocaleString(undefined, {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </td>
                                <td className="px-3 py-2.5 align-top text-sm">{eventLabel(h.eventType)}</td>
                                <td className="break-words px-3 py-2.5 align-top text-sm">
                                  {[h.locationType ?? "Master", h.regionName, h.storeName].filter(Boolean).join(" · ")}
                                  {h.note ? (
                                    <span className="mt-0.5 block text-xs text-rlx-ink-muted">{h.note}</span>
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
                                <td className="px-3 py-2.5 align-top text-right text-sm font-semibold tabular-nums">
                                  {h.balanceAfter == null ? "—" : h.balanceAfter.toLocaleString()}
                                </td>
                                <td className="break-words px-3 py-2.5 align-top text-xs text-rlx-ink-muted">
                                  {h.createdBy ?? "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
