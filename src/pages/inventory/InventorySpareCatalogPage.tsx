import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { InventoryBreadcrumb } from "../../components/inventory/InventoryBreadcrumb";
import { AppModal } from "../../components/ui/AppModal";
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
import type { SparePart, SparePriceLine } from "../../types/spare";
import { CustomFieldsSection } from "../../components/customFields/CustomFieldsSection";
import { useCustomFields } from "../../hooks/useCustomFields";
import {
  customFieldsMatchSearch,
  formatCustomFieldDisplay,
  listCustomFieldDefs,
  parseCustomFieldValues,
  requiredCustomFieldError,
} from "../../lib/customFields";
import type { CustomFieldValues } from "../../types/customField";
import { modalBtnPrimary, modalBtnSecondary, modalFooterClass, modalInputClass } from "../../lib/appModalStyles";
import { buildSpareStickerData, printSpareStickers, type SpareStickerData } from "../../lib/spareSticker";

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
  if (eventType === "PURCHASE_RETURN") return "Purchase return";
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

function SpareStickerPreview({ data }: { data: SpareStickerData }) {
  return (
    <div className="inline-flex h-[25mm] w-[70mm] flex-col justify-between rounded-[3.4mm] border border-stone-300 bg-white px-3 py-1.5 font-[Arial,Helvetica,sans-serif] text-[#111]">
      <div className="flex items-baseline justify-between gap-2 text-[9pt] font-bold leading-none">
        <span>{data.itemNumber}</span>
        <span className="truncate text-right">{data.sku}</span>
      </div>
      <div className="flex min-h-[9mm] items-center justify-center px-3">
        <img src={data.barcodeSrc} alt="" className="h-[9mm] w-full object-contain" />
      </div>
      <div className="flex items-baseline justify-between gap-2 text-[9pt] font-bold leading-none">
        <span>{data.mrpLabel}</span>
        <span className="text-right">{data.brandMark}</span>
      </div>
    </div>
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

function IconEdit({ className = "h-[1.125rem] w-[1.125rem]" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
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

const categories = ["Glass", "Movement", "Movement Part", "Battery", "Crown", "Gasket", "Strap", "Bracelet", "Dial", "Hands", "Lubricant", "Tool", "Consumable", "Stem", "Case Part", "Other"];

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
  const [addSpareBrand, setAddSpareBrand] = useState("");
  const [altSku, setAltSku] = useState("");
  const [name, setName] = useState("");
  const [altName, setAltName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Other");
  const [modelNo, setModelNo] = useState("");
  const [caliber, setCaliber] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [size, setSize] = useState("");
  const [colour, setColour] = useState("");
  const [hsn, setHsn] = useState("");
  const [gstPercent, setGstPercent] = useState("18");
  const [mrpInr, setMrpInr] = useState("");
  const [editHsn, setEditHsn] = useState("");
  const [editGstPercent, setEditGstPercent] = useState("");
  const [editName, setEditName] = useState("");
  const [editBrand, setEditBrand] = useState("");
  const [editAltSku, setEditAltSku] = useState("");
  const [editAltName, setEditAltName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategory, setEditCategory] = useState("Other");
  const [editModelNo, setEditModelNo] = useState("");
  const [editCaliber, setEditCaliber] = useState("");
  const [editSubCategory, setEditSubCategory] = useState("");
  const [editSize, setEditSize] = useState("");
  const [editColour, setEditColour] = useState("");
  const [editCostPriceInr, setEditCostPriceInr] = useState("");
  const [editSellingPriceInr, setEditSellingPriceInr] = useState("");
  const [editMrpInr, setEditMrpInr] = useState("");
  const [editIsActive, setEditIsActive] = useState(true);
  const [propsEditBusy, setPropsEditBusy] = useState(false);
  const [taxEditMsg, setTaxEditMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [costPriceInr, setCostPriceInr] = useState("");
  const [sellingPriceInr, setSellingPriceInr] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [addCustomFields, setAddCustomFields] = useState<CustomFieldValues>({});
  const [editCustomFields, setEditCustomFields] = useState<CustomFieldValues>({});
  const { fields: extraFieldDefs } = useCustomFields("spare");
  const listExtras = useMemo(() => listCustomFieldDefs(extraFieldDefs), [extraFieldDefs]);
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
  const [stickerPrintSpare, setStickerPrintSpare] = useState<SparePart | null>(null);
  const [stickerPrintBrand, setStickerPrintBrand] = useState("");
  const [stickerPrintCount, setStickerPrintCount] = useState("1");
  const [stickerPrintBusy, setStickerPrintBusy] = useState(false);
  const [historyRows, setHistoryRows] = useState<SpareHistoryRow[]>([]);
  const [historyErr, setHistoryErr] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const canCreateSpare = user?.role === "super_admin" || user?.role === "admin";
  /** Property edit only (not stock) — Admin / Super Admin. */
  const canEditProperties = canCreateSpare;
  const hoOnlyRole =
    user?.role === "service_centre_clerk" || user?.role === "service_centre_supervisor" || user?.role === "technician";
  const canViewLogs = !hideStockLogsButton;

  useEffect(() => {
    if (regions.length > 0 && !regionId) setRegionId(regions[0]!.id);
  }, [regions, regionId]);

  useEffect(() => {
    if (brandOptions.length === 0) return;
    if (!brand || !brandOptions.includes(brand)) setBrand(brandOptions[0]!);
    if (!addSpareBrand || !brandOptions.includes(addSpareBrand)) setAddSpareBrand(brandOptions[0]!);
  }, [brandOptions, brand, addSpareBrand]);

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

  const stickerLocationCode = useMemo(() => {
    const region = regions.find((r) => r.id === (regionId || user?.regionId));
    const store = region?.stores.find((s) => s.id === user?.storeId);
    return store?.invoiceNumberStoreCode?.trim() || region?.regionCode?.trim() || "";
  }, [regions, regionId, user?.regionId, user?.storeId]);

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
        const hay = `${s.sku} ${s.altSku ?? ""} ${s.brand ?? ""} ${s.name} ${s.altName ?? ""} ${s.description} ${s.category} ${s.subCategory ?? ""} ${s.modelNo ?? ""} ${s.caliber ?? ""} ${s.size ?? ""} ${s.colour ?? ""} ${s.hsn ?? ""}`.toLowerCase();
        if (!hay.includes(q) && !customFieldsMatchSearch(s.customFields, extraFieldDefs, q)) return false;
      }
      return true;
    });
  }, [spares, query, categoryFilter, activeFilter, extraFieldDefs]);

  useEffect(() => {
    if (!selectedSpare) return;
    setEditName(selectedSpare.name);
    setEditBrand(selectedSpare.brand ?? "");
    setEditAltSku(selectedSpare.altSku ?? "");
    setEditAltName(selectedSpare.altName ?? "");
    setEditDescription(selectedSpare.description ?? "");
    setEditCategory(selectedSpare.category || "Other");
    setEditModelNo(selectedSpare.modelNo ?? "");
    setEditCaliber(selectedSpare.caliber ?? "");
    setEditSubCategory(selectedSpare.subCategory ?? "");
    setEditSize(selectedSpare.size ?? "");
    setEditColour(selectedSpare.colour ?? "");
    setEditHsn(selectedSpare.hsn ?? "");
    setEditGstPercent(selectedSpare.gstPercent != null ? String(selectedSpare.gstPercent) : "");
    setEditCostPriceInr(selectedSpare.costPriceInr != null ? String(selectedSpare.costPriceInr) : "");
    setEditMrpInr(selectedSpare.mrpInr != null ? String(selectedSpare.mrpInr) : "");
    setEditSellingPriceInr(
      selectedSpare.sellingPriceInr != null
        ? String(selectedSpare.sellingPriceInr)
        : selectedSpare.mrpInr != null
          ? String(selectedSpare.mrpInr)
          : "",
    );
    setEditIsActive(selectedSpare.isActive);
    setEditCustomFields(parseCustomFieldValues(selectedSpare.customFields));
    setTaxEditMsg(null);
  }, [
    selectedSpare?.id,
    selectedSpare?.name,
    selectedSpare?.brand,
    selectedSpare?.altSku,
    selectedSpare?.altName,
    selectedSpare?.description,
    selectedSpare?.category,
    selectedSpare?.modelNo,
    selectedSpare?.caliber,
    selectedSpare?.subCategory,
    selectedSpare?.size,
    selectedSpare?.colour,
    selectedSpare?.hsn,
    selectedSpare?.gstPercent,
    selectedSpare?.costPriceInr,
    selectedSpare?.sellingPriceInr,
    selectedSpare?.mrpInr,
    selectedSpare?.isActive,
    selectedSpare?.customFields,
  ]);

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

  async function resolveStickerBrand(spare: { id: string; brand?: string }): Promise<string> {
    if (spare.brand?.trim()) return spare.brand.trim();
    if (spare.id === selectedId && prices.length > 0) {
      const match = brand ? prices.find((p) => p.brand === brand) : null;
      return (match ?? prices[0])?.brand ?? "";
    }
    try {
      const q = regionId ? `?regionId=${encodeURIComponent(regionId)}` : "";
      const data = await apiJson<{ prices: SparePriceLine[] }>(
        `/api/catalog/spares/${encodeURIComponent(spare.id)}/prices${q}`,
      );
      return data.prices[0]?.brand ?? "";
    } catch {
      return "";
    }
  }

  async function openStickerPrint(target = selectedSpare) {
    if (!target) return;
    setStickerPrintBusy(true);
    try {
      const stickerBrand = await resolveStickerBrand(target);
      setStickerPrintSpare(target);
      setStickerPrintBrand(stickerBrand);
      setStickerPrintCount("1");
    } finally {
      setStickerPrintBusy(false);
    }
  }

  function confirmStickerPrint() {
    if (!stickerPrintSpare) return;
    const n = Number.parseInt(stickerPrintCount.trim(), 10);
    const copies = Number.isFinite(n) ? Math.max(1, Math.min(99, n)) : 1;
    printSpareStickers(
      [buildSpareStickerData(stickerPrintSpare, { brand: stickerPrintBrand, locationCode: stickerLocationCode })],
      copies,
    );
    setStickerPrintSpare(null);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const costValue = costPriceInr.trim() === "" ? null : Number(costPriceInr);
    const sellingValue = sellingPriceInr.trim() === "" ? null : Number(sellingPriceInr);
    const mrpValue = mrpInr.trim() === "" ? null : Number(mrpInr);
    if (costValue != null && (Number.isNaN(costValue) || costValue < 0)) {
      setMsg({ type: "err", text: "Cost must be a non-negative number." });
      return;
    }
    if (sellingValue != null && (Number.isNaN(sellingValue) || sellingValue < 0)) {
      setMsg({ type: "err", text: "Selling price must be a non-negative number." });
      return;
    }
    if (mrpValue != null && (Number.isNaN(mrpValue) || mrpValue < 0)) {
      setMsg({ type: "err", text: "MRP must be a non-negative number." });
      return;
    }
    const gstValue = gstPercent.trim() === "" ? null : Number(gstPercent);
    if (gstValue != null && (Number.isNaN(gstValue) || gstValue < 0 || gstValue > 100)) {
      setMsg({ type: "err", text: "GST % must be between 0 and 100." });
      return;
    }
    if (!sku.trim() || !addSpareBrand.trim()) {
      setMsg({ type: "err", text: "Part number and brand are required." });
      return;
    }
    const customErr = requiredCustomFieldError(extraFieldDefs, addCustomFields);
    if (customErr) {
      setMsg({ type: "err", text: customErr });
      return;
    }
    const r = await addSpare({
      sku,
      brand: addSpareBrand.trim(),
      altSku,
      name,
      altName,
      description,
      category,
      modelNo,
      caliber,
      subCategory,
      size,
      colour,
      hsn: hsn.trim() || null,
      gstPercent: gstValue,
      costPriceInr: costValue,
      sellingPriceInr: sellingValue ?? mrpValue,
      mrpInr: mrpValue ?? sellingValue,
      isActive,
      customFields: addCustomFields,
    });
    if ("error" in r) {
      setMsg({ type: "err", text: r.error });
      return;
    }
    setMsg({ type: "ok", text: `Spare ${r.ok.sku} (${r.ok.brand}) added.` });
    setSku("");
    setAddSpareBrand(brandOptions[0] ?? "");
    setAltSku("");
    setName("");
    setAltName("");
    setDescription("");
    setCategory("Other");
    setModelNo("");
    setCaliber("");
    setSubCategory("");
    setSize("");
    setColour("");
    setHsn("");
    setGstPercent("18");
    setCostPriceInr("");
    setSellingPriceInr("");
    setMrpInr("");
    setIsActive(true);
    setAddCustomFields({});
    setAddSpareOpen(false);
  }

  async function addPriceLine(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    const brandValue = (selectedSpare?.brand?.trim() || brand.trim());
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

  async function saveSpareProperties(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSpare || !canEditProperties) return;
    setTaxEditMsg(null);
    const gstValue = editGstPercent.trim() === "" ? null : Number(editGstPercent);
    if (gstValue != null && (Number.isNaN(gstValue) || gstValue < 0 || gstValue > 100)) {
      setTaxEditMsg({ type: "err", text: "GST % must be between 0 and 100." });
      return;
    }
    const costValue = editCostPriceInr.trim() === "" ? null : Number(editCostPriceInr);
    if (costValue != null && (Number.isNaN(costValue) || costValue < 0)) {
      setTaxEditMsg({ type: "err", text: "Cost price must be a non-negative number." });
      return;
    }
    const sellingValue = editSellingPriceInr.trim() === "" ? null : Number(editSellingPriceInr);
    if (sellingValue != null && (Number.isNaN(sellingValue) || sellingValue < 0)) {
      setTaxEditMsg({ type: "err", text: "Selling price must be a non-negative number." });
      return;
    }
    const mrpValue = editMrpInr.trim() === "" ? null : Number(editMrpInr);
    if (mrpValue != null && (Number.isNaN(mrpValue) || mrpValue < 0)) {
      setTaxEditMsg({ type: "err", text: "MRP must be a non-negative number." });
      return;
    }
    if (!editName.trim()) {
      setTaxEditMsg({ type: "err", text: "Name is required." });
      return;
    }
    if (!editBrand.trim()) {
      setTaxEditMsg({ type: "err", text: "Brand is required." });
      return;
    }
    const customErr = requiredCustomFieldError(extraFieldDefs, editCustomFields);
    if (customErr) {
      setTaxEditMsg({ type: "err", text: customErr });
      return;
    }
    setPropsEditBusy(true);
    try {
      const r = await updateSpare(selectedSpare.id, {
        brand: editBrand.trim(),
        altSku: editAltSku,
        name: editName.trim(),
        altName: editAltName,
        description: editDescription.trim(),
        category: editCategory.trim() || "Other",
        modelNo: editModelNo,
        caliber: editCaliber,
        subCategory: editSubCategory,
        size: editSize,
        colour: editColour,
        hsn: editHsn.trim() || null,
        gstPercent: gstValue,
        costPriceInr: costValue,
        sellingPriceInr: sellingValue,
        mrpInr: mrpValue,
        isActive: editIsActive,
        customFields: editCustomFields,
      });
      if ("error" in r) {
        setTaxEditMsg({ type: "err", text: r.error });
        return;
      }
      setTaxEditMsg({ type: "ok", text: "Spare properties saved." });
    } finally {
      setPropsEditBusy(false);
    }
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
              placeholder="Part number, alt part no, brand, name, model, caliber…"
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
                  <th className="whitespace-nowrap px-3 py-3 text-left font-semibold">Part no</th>
                  <th className="whitespace-nowrap px-3 py-3 text-left font-semibold">Brand</th>
                  <th className="min-w-[14rem] px-3 py-3 text-left font-semibold">Part full name</th>
                  <th className="whitespace-nowrap px-3 py-3 text-right font-semibold">Cost / MRP</th>
                  <th className="whitespace-nowrap px-3 py-3 text-left font-semibold">Active</th>
                  {listExtras.map((f) => (
                    <th key={f.id} className="whitespace-nowrap px-3 py-3 text-left font-semibold">{f.label}</th>
                  ))}
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
                      {s.altSku ? (
                        <span className="mt-0.5 block whitespace-nowrap font-mono text-[11px] text-rlx-ink-muted">
                          Alt {s.altSku}
                        </span>
                      ) : null}
                    </td>
                    <td className="align-middle px-3 py-3">
                      <span className="block whitespace-nowrap text-sm font-medium text-rlx-ink">
                        {s.brand?.trim() || "—"}
                      </span>
                    </td>
                    <td className="align-middle px-3 py-3">
                      <span className="block break-words text-sm font-medium leading-snug text-rlx-ink">{s.name}</span>
                      {s.altName ? (
                        <span className="block text-xs leading-snug text-rlx-ink-muted">Alt name: {s.altName}</span>
                      ) : null}
                      <span className="block text-xs leading-snug text-rlx-ink-muted">
                        {s.category}
                        {s.subCategory ? ` · ${s.subCategory}` : ""}
                        {s.modelNo ? ` · Model ${s.modelNo}` : ""}
                        {s.caliber ? ` · Cal ${s.caliber}` : ""}
                        {s.size ? ` · ${s.size}` : ""}
                        {s.colour ? ` · ${s.colour}` : ""}
                        {s.description ? ` · ${s.description}` : ""}
                      </span>
                    </td>
                    <td className="align-middle whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-rlx-ink">
                      {s.costPriceInr == null ? "—" : s.costPriceInr.toLocaleString()}
                      {" / "}
                      {s.mrpInr == null ? "—" : s.mrpInr.toLocaleString()}
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
                    {listExtras.map((f) => (
                      <td key={f.id} className="align-middle px-3 py-3 text-sm text-rlx-ink">
                        {formatCustomFieldDisplay(f, s.customFields)}
                      </td>
                    ))}
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
                        {canEditProperties ? (
                          <button
                            type="button"
                            onClick={() => openDetails(s.id)}
                            className={btnIcon}
                            title="Edit properties"
                            aria-label="Edit properties"
                          >
                            <IconEdit />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void openStickerPrint(s)}
                          className={btnIcon}
                          title="Print inventory sticker"
                          aria-label="Print inventory sticker"
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
        <div className="legacy-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-6">
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
                  Part number *
                </label>
                <input
                  id="sp-sku"
                  value={sku}
                  onChange={(e) => setSku(sanitizeAlphanumericInput(e.target.value, 48))}
                  className={inputClass}
                  placeholder="e.g. WSPBAT001"
                  autoComplete="off"
                />
              </div>
              <div>
                <label htmlFor="sp-alt-sku" className="text-xs font-medium text-stone-600">
                  Alternative part number
                </label>
                <input
                  id="sp-alt-sku"
                  value={altSku}
                  onChange={(e) => setAltSku(sanitizeAlphanumericInput(e.target.value, 48))}
                  className={inputClass}
                  placeholder="Optional second part number"
                  autoComplete="off"
                />
              </div>
              <div>
                <label htmlFor="sp-brand" className="text-xs font-medium text-stone-600">
                  Brand *
                </label>
                <select
                  id="sp-brand"
                  value={addSpareBrand}
                  onChange={(e) => setAddSpareBrand(e.target.value)}
                  className={inputClass}
                  required
                >
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
                <p className="mt-1 text-xs text-stone-500">Same part number can be added again for a different brand.</p>
              </div>
              <div>
                <label htmlFor="sp-name" className="text-xs font-medium text-stone-600">
                  Part full name *
                </label>
                <input
                  id="sp-name"
                  value={name}
                  onChange={(e) => setName(sanitizeTextInput(e.target.value, 200))}
                  className={inputClass}
                  placeholder="Part full name"
                />
              </div>
              <div>
                <label htmlFor="sp-alt-name" className="text-xs font-medium text-stone-600">
                  Alternative name
                </label>
                <input
                  id="sp-alt-name"
                  value={altName}
                  onChange={(e) => setAltName(sanitizeTextInput(e.target.value, 200))}
                  className={inputClass}
                  placeholder="Optional second name"
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
                  <label htmlFor="sp-subcat" className="text-xs font-medium text-stone-600">
                    Sub category
                  </label>
                  <input
                    id="sp-subcat"
                    value={subCategory}
                    onChange={(e) => setSubCategory(sanitizeTextInput(e.target.value, 80))}
                    className={inputClass}
                    placeholder="Leather, Metal, Bezel…"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label htmlFor="sp-model" className="text-xs font-medium text-stone-600">
                    Model no.
                  </label>
                  <input
                    id="sp-model"
                    value={modelNo}
                    onChange={(e) => setModelNo(sanitizeTextInput(e.target.value, 80))}
                    className={inputClass}
                    placeholder="Watch / clock model"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label htmlFor="sp-caliber" className="text-xs font-medium text-stone-600">
                    Caliber
                  </label>
                  <input
                    id="sp-caliber"
                    value={caliber}
                    onChange={(e) => setCaliber(sanitizeTextInput(e.target.value, 80))}
                    className={inputClass}
                    placeholder="Movement caliber"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label htmlFor="sp-size" className="text-xs font-medium text-stone-600">
                    Size
                  </label>
                  <input
                    id="sp-size"
                    value={size}
                    onChange={(e) => setSize(sanitizeTextInput(e.target.value, 80))}
                    className={inputClass}
                    placeholder="e.g. 22 MM"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label htmlFor="sp-colour" className="text-xs font-medium text-stone-600">
                    Colour
                  </label>
                  <input
                    id="sp-colour"
                    value={colour}
                    onChange={(e) => setColour(sanitizeTextInput(e.target.value, 80))}
                    className={inputClass}
                    placeholder="e.g. Black"
                    autoComplete="off"
                  />
                </div>
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
                    Tax % *
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
                    Cost
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
                  <label htmlFor="sp-mrp" className="text-xs font-medium text-stone-600">
                    MRP
                  </label>
                  <input
                    id="sp-mrp"
                    type="number"
                    min={0}
                    step={0.01}
                    value={mrpInr}
                    onChange={(e) => setMrpInr(sanitizeDecimalInput(e.target.value))}
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
              <CustomFieldsSection
                fields={extraFieldDefs}
                values={addCustomFields}
                onChange={setAddCustomFields}
                variant="plain"
                inputClass={inputClass}
                labelClass="text-xs font-medium text-stone-600"
              />
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
        <div className="legacy-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-6">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-stone-900">Bulk import preview / check</h3>
                <p className="text-sm text-stone-600">Template or client inventory file (Brand + Part Reference + Description). Part numbers can be auto-generated.</p>
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

      {detailsOpen && selectedSpare ? (
        <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-rlx-ink/70 p-0 backdrop-blur-sm sm:items-center sm:p-3 md:p-5">
          <div className="flex h-[100dvh] w-full max-w-[96rem] flex-col overflow-hidden bg-white shadow-[0_32px_80px_-20px_rgba(0,0,0,0.5)] sm:h-[min(96dvh,58rem)] sm:max-h-[96dvh]">
            <div className="flex shrink-0 items-center justify-between gap-3 bg-rlx-green px-4 py-3 sm:px-6">
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-semibold uppercase tracking-[0.35em] text-rlx-gold">Spare details</p>
                <h3 className="truncate font-mono text-base font-semibold text-white sm:text-lg">
                  {selectedSpare.sku}
                  {selectedSpare.brand ? ` · ${selectedSpare.brand}` : ""}
                </h3>
                <p className="mt-0.5 truncate text-xs text-white/65 sm:text-sm">
                  {selectedSpare.name} · {selectedSpare.category}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void openStickerPrint()}
                  className={`${modalIconGhost} border-rlx-gold/50 bg-rlx-gold text-rlx-green-deep hover:bg-rlx-gold-dark`}
                  title="Print inventory sticker"
                  aria-label="Print inventory sticker"
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
                            Part no
                          </th>
                          <td className="px-3 py-2.5 font-mono font-semibold text-rlx-green">{selectedSpare.sku}</td>
                        </tr>
                        <tr className="border-b border-rlx-rule">
                          <th className="w-40 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.12em] text-rlx-ink-muted">
                            Alt part no
                          </th>
                          <td className="px-3 py-2.5 font-mono">{selectedSpare.altSku || "—"}</td>
                        </tr>
                        <tr className="border-b border-rlx-rule">
                          <th className="w-40 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.12em] text-rlx-ink-muted">
                            Brand
                          </th>
                          <td className="px-3 py-2.5">{selectedSpare.brand?.trim() || "—"}</td>
                        </tr>
                        {!canEditProperties ? (
                          <>
                            <tr className="border-b border-rlx-rule">
                              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.12em] text-rlx-ink-muted">
                                Part full name
                              </th>
                              <td className="px-3 py-2.5">{selectedSpare.name}</td>
                            </tr>
                            <tr className="border-b border-rlx-rule">
                              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.12em] text-rlx-ink-muted">
                                Alt name
                              </th>
                              <td className="px-3 py-2.5">{selectedSpare.altName || "—"}</td>
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
                                Sub category
                              </th>
                              <td className="px-3 py-2.5">{selectedSpare.subCategory || "—"}</td>
                            </tr>
                            <tr className="border-b border-rlx-rule">
                              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.12em] text-rlx-ink-muted">
                                Model no
                              </th>
                              <td className="px-3 py-2.5">{selectedSpare.modelNo || "—"}</td>
                            </tr>
                            <tr className="border-b border-rlx-rule">
                              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.12em] text-rlx-ink-muted">
                                Caliber
                              </th>
                              <td className="px-3 py-2.5">{selectedSpare.caliber || "—"}</td>
                            </tr>
                            <tr className="border-b border-rlx-rule">
                              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.12em] text-rlx-ink-muted">
                                Size
                              </th>
                              <td className="px-3 py-2.5">{selectedSpare.size || "—"}</td>
                            </tr>
                            <tr className="border-b border-rlx-rule">
                              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.12em] text-rlx-ink-muted">
                                Colour
                              </th>
                              <td className="px-3 py-2.5">{selectedSpare.colour || "—"}</td>
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
                                {selectedSpare.sellingPriceInr ?? "—"}
                              </td>
                            </tr>
                            <tr className="border-b border-rlx-rule">
                              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.12em] text-rlx-ink-muted">
                                MRP
                              </th>
                              <td className="px-3 py-2.5">{selectedSpare.mrpInr ?? "—"}</td>
                            </tr>
                            <tr className="border-b border-rlx-rule">
                              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.12em] text-rlx-ink-muted">
                                HSN / Tax %
                              </th>
                              <td className="px-3 py-2.5">
                                {selectedSpare.hsn || "—"}
                                {selectedSpare.gstPercent != null ? ` · ${selectedSpare.gstPercent}%` : ""}
                              </td>
                            </tr>
                          </>
                        ) : null}
                      </tbody>
                    </table>
                  </div>

                  {(() => {
                    const sticker = buildSpareStickerData(selectedSpare, {
                      brand:
                        selectedSpare.brand?.trim() ||
                        ((brand && prices.some((p) => p.brand === brand) ? brand : prices[0]?.brand) ?? ""),
                      locationCode: stickerLocationCode,
                    });
                    return (
                      <div className="border border-rlx-rule bg-stone-200/70 p-4">
                        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-stone-500">
                          Inventory sticker
                        </p>
                        <SpareStickerPreview data={sticker} />
                      </div>
                    );
                  })()}

                  {canEditProperties ? (
                    <Card
                      title="Edit properties"
                      subtitle="Admin only — updates spare master fields (not stock quantity)."
                    >
                      <form onSubmit={(e) => void saveSpareProperties(e)} className="grid gap-4 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <label className="text-xs font-medium text-stone-600">Part full name *</label>
                          <input
                            value={editName}
                            onChange={(e) => setEditName(sanitizeTextInput(e.target.value, 200))}
                            className={inputClass}
                            required
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-stone-600">Alternative part number</label>
                          <input
                            value={editAltSku}
                            onChange={(e) => setEditAltSku(sanitizeAlphanumericInput(e.target.value, 48))}
                            className={inputClass}
                            placeholder="Optional"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-stone-600">Alternative name</label>
                          <input
                            value={editAltName}
                            onChange={(e) => setEditAltName(sanitizeTextInput(e.target.value, 200))}
                            className={inputClass}
                            placeholder="Optional"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-stone-600">Brand *</label>
                          <select
                            value={editBrand}
                            onChange={(e) => setEditBrand(e.target.value)}
                            className={inputClass}
                            required
                          >
                            {brandOptions.length === 0 ? (
                              <option value="">No brands</option>
                            ) : (
                              brandOptions.map((b) => (
                                <option key={b} value={b}>
                                  {b}
                                </option>
                              ))
                            )}
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-xs font-medium text-stone-600">Description</label>
                          <textarea
                            value={editDescription}
                            onChange={(e) => setEditDescription(sanitizeMultilineTextInput(e.target.value, 500))}
                            className={inputClass}
                            rows={3}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-stone-600">Category *</label>
                          <select
                            value={editCategory}
                            onChange={(e) => setEditCategory(sanitizeTextInput(e.target.value, 40))}
                            className={inputClass}
                          >
                            {categories.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-stone-600">Sub category</label>
                          <input
                            value={editSubCategory}
                            onChange={(e) => setEditSubCategory(sanitizeTextInput(e.target.value, 80))}
                            className={inputClass}
                            placeholder="Leather, Metal…"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-stone-600">Model no.</label>
                          <input
                            value={editModelNo}
                            onChange={(e) => setEditModelNo(sanitizeTextInput(e.target.value, 80))}
                            className={inputClass}
                            placeholder="Optional"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-stone-600">Caliber</label>
                          <input
                            value={editCaliber}
                            onChange={(e) => setEditCaliber(sanitizeTextInput(e.target.value, 80))}
                            className={inputClass}
                            placeholder="Optional"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-stone-600">Size</label>
                          <input
                            value={editSize}
                            onChange={(e) => setEditSize(sanitizeTextInput(e.target.value, 80))}
                            className={inputClass}
                            placeholder="e.g. 22 MM"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-stone-600">Colour</label>
                          <input
                            value={editColour}
                            onChange={(e) => setEditColour(sanitizeTextInput(e.target.value, 80))}
                            className={inputClass}
                            placeholder="e.g. Black"
                          />
                        </div>
                        <div className="flex items-end pb-1">
                          <label className="inline-flex items-center gap-2 text-sm text-stone-800">
                            <input
                              type="checkbox"
                              checked={editIsActive}
                              onChange={(e) => setEditIsActive(e.target.checked)}
                              className="h-4 w-4 rounded border-zimson-300"
                            />
                            Active
                          </label>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-stone-600">HSN / SAC</label>
                          <input
                            value={editHsn}
                            onChange={(e) => setEditHsn(sanitizeAlphanumericInput(e.target.value, 16))}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-stone-600">Tax %</label>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.01}
                            value={editGstPercent}
                            onChange={(e) => setEditGstPercent(sanitizeDecimalInput(e.target.value))}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-stone-600">Cost</label>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={editCostPriceInr}
                            onChange={(e) => setEditCostPriceInr(sanitizeDecimalInput(e.target.value))}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-stone-600">MRP</label>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={editMrpInr}
                            onChange={(e) => setEditMrpInr(sanitizeDecimalInput(e.target.value))}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-stone-600">Selling price (INR)</label>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={editSellingPriceInr}
                            onChange={(e) => setEditSellingPriceInr(sanitizeDecimalInput(e.target.value))}
                            className={inputClass}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <CustomFieldsSection
                            fields={extraFieldDefs}
                            values={editCustomFields}
                            onChange={setEditCustomFields}
                            variant="plain"
                            inputClass={inputClass}
                            labelClass="text-xs font-medium text-stone-600"
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                          <button
                            type="submit"
                            disabled={propsEditBusy}
                            className="rounded-xl bg-zimson-600 px-4 py-2 text-sm font-semibold text-white hover:bg-zimson-700 disabled:opacity-60"
                          >
                            {propsEditBusy ? "Saving…" : "Save properties"}
                          </button>
                          <p className="text-xs text-stone-500">Part number cannot be changed. Stock is not edited here.</p>
                          {taxEditMsg ? (
                            <p className={`text-sm ${taxEditMsg.type === "ok" ? "text-emerald-800" : "text-red-800"}`}>
                              {taxEditMsg.text}
                            </p>
                          ) : null}
                        </div>
                      </form>
                    </Card>
                  ) : null}

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
                      {selectedSpare.brand?.trim() ? (
                        <input className={inputClass} value={selectedSpare.brand} readOnly />
                      ) : (
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
                      )}
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

      <AppModal
        open={stickerPrintSpare != null}
        onClose={() => setStickerPrintSpare(null)}
        title="Print spare stickers"
        eyebrow="Inventory sticker"
        subtitle={stickerPrintSpare?.sku}
        description="Enter how many labels to print for this spare."
        size="sm"
        zIndex={70}
        footer={
          <div className={modalFooterClass}>
            <button type="button" className={modalBtnSecondary} onClick={() => setStickerPrintSpare(null)}>
              Cancel
            </button>
            <button
              type="button"
              className={modalBtnPrimary}
              onClick={confirmStickerPrint}
              disabled={stickerPrintBusy || Number.parseInt(stickerPrintCount, 10) < 1}
            >
              Print
            </button>
          </div>
        }
      >
        {stickerPrintSpare ? (
          <div className="space-y-4">
            <div className="flex justify-center bg-stone-200/80 p-4">
              <SpareStickerPreview
                data={buildSpareStickerData(stickerPrintSpare, {
                  brand: stickerPrintBrand,
                  locationCode: stickerLocationCode,
                })}
              />
            </div>
            <label className="block text-sm font-medium text-slate-700">
              How many stickers to print?
              <input
                type="number"
                min={1}
                max={99}
                step={1}
                inputMode="numeric"
                className={modalInputClass}
                value={stickerPrintCount}
                onChange={(e) => setStickerPrintCount(e.target.value.replace(/[^\d]/g, "").slice(0, 2))}
                onFocus={(e) => e.currentTarget.select()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    confirmStickerPrint();
                  }
                }}
                autoFocus
              />
            </label>
            <p className="text-xs text-slate-500">Whole numbers from 1 to 99.</p>
          </div>
        ) : null}
      </AppModal>
    </div>
  );
}
