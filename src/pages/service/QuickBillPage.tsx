import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DemoOtpGate } from "../../components/service/DemoOtpGate";
import { ServiceBreadcrumb } from "../../components/service/ServiceBreadcrumb";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useBrands } from "../../context/BrandsContext";
import { useRegions } from "../../context/RegionsContext";
import { useSpares } from "../../context/SparesContext";
import { ApiError, apiJson, useApiMode } from "../../lib/api";
import { buildDemoServiceInvoiceViewModel, mapQuickBillInvoiceToViewModel } from "../../components/service/mapQuickBillToServiceInvoice";
import { ServiceInvoiceTemplate } from "../../components/service/ServiceInvoiceTemplate";
import { printServiceInvoice } from "../../lib/printServiceInvoice";
import type { QuickBillHistoryRow, QuickBillInvoice } from "../../types/quickBill";
import type { ServiceInvoiceViewModel } from "../../types/serviceInvoice";
import type { SparePriceLine, SpareStockRow } from "../../types/spare";
import {
  generateDemoOtp,
  isValidGstFormat,
  isValidPanFormat,
  nextQuickBillRef,
  SEED_TECHNICIANS,
  watchModelsForBrand,
} from "../../data/serviceSeed";

type LineItem = { id: string; description: string; amount: string; spareId?: string; qty?: number };

type CompletionState = null | { mode: "demo"; ref: string } | { mode: "api"; invoice: QuickBillInvoice };
type QuickBillSpareOption = {
  id: string;
  sku: string;
  name: string;
  price: number;
  stockQty: number;
};

function emptyLine(): LineItem {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, description: "", amount: "" };
}

const inputClass =
  "mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm text-stone-900 outline-none ring-zimson-400/40 placeholder:text-stone-400 focus:ring-2";

function customerLabelForHistory(row: QuickBillHistoryRow): string {
  if (row.customerType === "B2B") return row.company?.trim() || "—";
  return row.customerName?.trim() || "Walk-in / B2C";
}

function QuickBillHistoryCard({
  rows,
  loading,
  error,
  onRefresh,
  className = "",
}: {
  rows: QuickBillHistoryRow[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  className?: string;
}) {
  return (
    <Card
      title="Quick bill history"
      subtitle="Saved bills for your access scope (newest first)."
      className={`print:hidden ${className}`.trim()}
      action={
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="rounded-lg border border-zimson-400 bg-white px-3 py-1.5 text-xs font-semibold text-zimson-900 shadow-sm hover:bg-zimson-50 disabled:opacity-50"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      }
    >
      {error ? <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      {rows.length === 0 && !loading ? (
        <p className="text-sm text-stone-500">No saved quick bills yet.</p>
      ) : null}
      {rows.length > 0 ? (
        <div className="max-h-[320px] overflow-auto rounded-xl border border-zimson-200/80">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 border-b border-zimson-200 bg-zimson-50/95 text-xs font-semibold uppercase text-stone-600">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Invoice #</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Brand</th>
                <th className="px-3 py-2">Location</th>
                <th className="px-3 py-2">Pay</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-zimson-100">
                  <td className="whitespace-nowrap px-3 py-2 text-stone-600">
                    {new Date(row.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs font-semibold text-zimson-900">{row.billNumber}</td>
                  <td className="max-w-[180px] truncate px-3 py-2 text-stone-800" title={customerLabelForHistory(row)}>
                    {customerLabelForHistory(row)}
                  </td>
                  <td className="px-3 py-2">{row.watchBrand}</td>
                  <td className="max-w-[140px] truncate px-3 py-2 text-xs text-stone-600" title={row.storeName ?? row.regionName ?? row.regionId}>
                    {row.storeName ?? row.regionName ?? row.regionId}
                  </td>
                  <td className="px-3 py-2">{row.paymentMode}</td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums text-stone-900">
                    {row.totalInr.toLocaleString(undefined, { style: "currency", currency: "INR" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Card>
  );
}

function QuickBillInvoicePanel({
  viewModel,
  onNew,
}: {
  viewModel: ServiceInvoiceViewModel;
  onNew: () => void;
}) {
  return (
    <div className="space-y-6">
      <p className="text-xs text-stone-500 print:hidden">
        Preview uses the same layout as print. Sidebar and top bar are hidden when you print.
      </p>
      <ServiceInvoiceTemplate data={viewModel} idPrefix="qb" />
      <div className="flex flex-wrap gap-3 print:hidden">
        <button
          type="button"
          onClick={() => printServiceInvoice()}
          className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
        >
          Print invoice
        </button>
        <button
          type="button"
          onClick={onNew}
          className="inline-flex rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700"
        >
          New quick bill
        </button>
        <Link
          to="/service"
          className="inline-flex items-center rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
        >
          Back to service
        </Link>
      </div>
    </div>
  );
}

export function QuickBillPage() {
  const apiMode = useApiMode();
  const { user } = useAuth();
  const { regions } = useRegions();
  const { brands: catalogBrands } = useBrands();
  const brandNames = useMemo(() => catalogBrands.map((b) => b.name), [catalogBrands]);
  const { spares } = useSpares();
  const [billingRegionId, setBillingRegionId] = useState("");
  const [customerType, setCustomerType] = useState<"B2C" | "B2B">("B2C");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [gst, setGst] = useState("");
  const [pan, setPan] = useState("");

  const [watchBrand, setWatchBrand] = useState("");
  const models = watchModelsForBrand(watchBrand);
  const [watchModel, setWatchModel] = useState<string>(models[0]?.model ?? "");
  const [watchRef, setWatchRef] = useState("");

  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);
  const [partPick, setPartPick] = useState("");
  const [technicianId, setTechnicianId] = useState<string>(SEED_TECHNICIANS[0]?.id ?? "");
  const [paymentMode, setPaymentMode] = useState<"Cash" | "Card" | "UPI">("Cash");
  const [notes, setNotes] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [completion, setCompletion] = useState<CompletionState>(null);
  const [isSavingBill, setIsSavingBill] = useState(false);

  const [awaitingOtp, setAwaitingOtp] = useState<string | null>(null);
  const [otpInput, setOtpInput] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [spareOptions, setSpareOptions] = useState<QuickBillSpareOption[]>([]);
  const [spareOptionsLoading, setSpareOptionsLoading] = useState(false);
  const [barcodeSku, setBarcodeSku] = useState("");
  const [historyRows, setHistoryRows] = useState<QuickBillHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [invoiceHsnSac, setInvoiceHsnSac] = useState("9987");

  const loadQuickBillHistory = useCallback(async () => {
    if (!apiMode || !user) {
      setHistoryRows([]);
      return;
    }
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const qs = new URLSearchParams();
      qs.set("limit", "50");
      if (user.role === "super_admin" && billingRegionId.trim()) {
        qs.set("regionId", billingRegionId.trim());
      }
      const data = await apiJson<{ bills: QuickBillHistoryRow[] }>(`/api/service/quick-bills?${qs.toString()}`);
      setHistoryRows(data.bills);
    } catch (e) {
      setHistoryError(e instanceof ApiError ? e.message : "Could not load quick bill history.");
      setHistoryRows([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [apiMode, user, billingRegionId]);

  useEffect(() => {
    void loadQuickBillHistory();
  }, [loadQuickBillHistory]);

  useEffect(() => {
    if (!apiMode || !user) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiJson<{ settings: { defaultSacHsn: string } }>("/api/settings/tax");
        if (cancelled) return;
        setInvoiceHsnSac(data.settings.defaultSacHsn.trim() || "9987");
      } catch {
        /* keep default */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiMode, user]);

  const priceRegionQuery = useMemo(() => {
    const rid = user?.role === "super_admin" ? billingRegionId : user?.regionId ?? "";
    return rid ? `?regionId=${encodeURIComponent(rid)}` : "";
  }, [user?.role, user?.regionId, billingRegionId]);

  const stockQuerySuffix = useMemo(() => {
    const qs = new URLSearchParams();
    qs.set("aggregate", "region");
    if (user?.role === "super_admin" && billingRegionId.trim()) {
      qs.set("regionId", billingRegionId.trim());
    }
    return `?${qs.toString()}`;
  }, [user?.role, billingRegionId]);

  useEffect(() => {
    if (!apiMode || user?.role !== "super_admin") return;
    if (regions.length > 0 && !billingRegionId) setBillingRegionId(regions[0]!.id);
  }, [apiMode, user?.role, regions, billingRegionId]);

  const syncModelForBrand = useCallback((nextBrand: string) => {
    setWatchBrand(nextBrand);
    const ms = watchModelsForBrand(nextBrand);
    const first = ms[0];
    setWatchModel(first?.model ?? "");
    if (first?.refHint) setWatchRef(first.refHint);
    else setWatchRef("");
  }, []);

  useEffect(() => {
    if (brandNames.length === 0) return;
    if (!watchBrand || !brandNames.includes(watchBrand)) {
      syncModelForBrand(brandNames[0]!);
    }
  }, [brandNames, watchBrand, syncModelForBrand]);

  useEffect(() => {
    let cancelled = false;
    async function loadBrandSpareOptions() {
      if (spares.length === 0) {
        setSpareOptions([]);
        return;
      }
      setSpareOptionsLoading(true);
      try {
        const resolved = await Promise.all(
          spares.map(async (spare) => {
            try {
              const [priceData, stockData] = await Promise.all([
                apiJson<{ prices: SparePriceLine[] }>(
                  `/api/catalog/spares/${encodeURIComponent(spare.id)}/prices${priceRegionQuery}`,
                ),
                apiJson<{ stock: SpareStockRow[] }>(
                  `/api/catalog/spares/${encodeURIComponent(spare.id)}/stock${stockQuerySuffix}`,
                ),
              ]);
              const matchedPrice = priceData.prices.find(
                (p) => p.brand.trim().toLowerCase() === watchBrand.trim().toLowerCase(),
              );
              if (!matchedPrice) return null;
              const stockQty = stockData.stock.reduce((sum, row) => sum + row.quantity, 0);
              return {
                id: spare.id,
                sku: spare.sku,
                name: spare.name,
                price: matchedPrice.price,
                stockQty,
              } satisfies QuickBillSpareOption;
            } catch {
              return null;
            }
          }),
        );
        if (cancelled) return;
        const sorted = resolved
          .filter((r): r is QuickBillSpareOption => Boolean(r))
          .sort((a, b) => a.name.localeCompare(b.name) || a.sku.localeCompare(b.sku));
        setSpareOptions(sorted);
      } catch {
        if (!cancelled) setSpareOptions([]);
      } finally {
        if (!cancelled) setSpareOptionsLoading(false);
      }
    }
    void loadBrandSpareOptions();
    return () => {
      cancelled = true;
    };
  }, [spares, watchBrand, priceRegionQuery, stockQuerySuffix]);

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function updateLine(id: string, patch: Partial<LineItem>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function removeLine(id: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.id !== id)));
  }

  async function addPartLine(spareId: string) {
    const spare = spareOptions.find((s) => s.id === spareId);
    if (!spare) {
      const fallback = spares.find((s) => s.id === spareId);
      setError(
        fallback
          ? `No ${watchBrand} price for ${fallback.name} (${fallback.sku}) in this region — add it under Inventory → Spare catalogue.`
          : "Spare not found.",
      );
      return;
    }
    try {
      if (spare.stockQty <= 0) {
        setError(`${spare.name} (${spare.sku}) is out of stock.`);
        setPartPick("");
        return;
      }
      setLines((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          description: `${spare.name} (${spare.sku})`,
          amount: String(spare.price),
          spareId: spare.id,
          qty: 1,
        },
      ]);
      setError(null);
      setPartPick("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not fetch spare amount/stock.");
      setPartPick("");
    }
  }

  function addScannedSku() {
    const sku = barcodeSku.trim().toUpperCase();
    if (!sku) return;
    const option = spareOptions.find((s) => s.sku.toUpperCase() === sku);
    if (!option) {
      setError(
        `Scanned SKU ${sku} has no ${watchBrand} price in this region (or is out of stock).`,
      );
      setBarcodeSku("");
      return;
    }
    void addPartLine(option.id);
    setBarcodeSku("");
  }

  function validateBeforeOtp(): boolean {
    setError(null);
    if (customerType === "B2B") {
      if (!company.trim()) {
        setError("B2B: company / legal name is required to create the customer.");
        return false;
      }
      if (!isValidGstFormat(gst)) {
        setError("B2B: enter a valid 15-character GSTIN.");
        return false;
      }
      if (!isValidPanFormat(pan)) {
        setError("B2B: enter a valid PAN (e.g. ABCDE1234F).");
        return false;
      }
      if (!customerName.trim() || !phone.trim()) {
        setError("B2B: contact person name and phone are required for the customer record.");
        return false;
      }
    }
    if (!watchBrand || !watchModel.trim()) {
      setError("Choose a watch brand and model from the catalog.");
      return false;
    }
    if (apiMode && user?.role === "super_admin" && !billingRegionId.trim()) {
      setError("Select billing region (required to load prices and save the bill).");
      return false;
    }
    const parsed = lines
      .map((l) => ({
        description: l.description.trim(),
        amount: Number.parseFloat(l.amount),
      }))
      .filter((l) => l.description && !Number.isNaN(l.amount) && l.amount >= 0);
    if (parsed.length === 0) {
      setError("Add at least one service line (or pick a part from the catalog).");
      return false;
    }
    return true;
  }

  function handlePrepareComplete(e: React.FormEvent) {
    e.preventDefault();
    if (awaitingOtp) return;
    if (!validateBeforeOtp()) return;
    const code = generateDemoOtp();
    setAwaitingOtp(code);
    setOtpInput("");
    setOtpError(null);
  }

  async function handleVerifyOtp() {
    setOtpError(null);
    if (!awaitingOtp) return;
    if (otpInput.trim() !== awaitingOtp) {
      setOtpError("Incorrect OTP. No changes were saved. Enter the code shown above.");
      return;
    }
    const parsedLines = lines
      .map((l) => ({
        description: l.description.trim(),
        amount: Number.parseFloat(l.amount),
        spareId: l.spareId,
        qty: l.qty ?? 1,
      }))
      .filter((l) => l.description && !Number.isNaN(l.amount) && l.amount >= 0);

    if (apiMode) {
      const regionId =
        user?.role === "super_admin" ? billingRegionId.trim() : user?.regionId?.trim() ?? "";
      if (!regionId) {
        setOtpError("Missing region for this account. Select billing region or re-login.");
        return;
      }
      const tech = SEED_TECHNICIANS.find((t) => t.id === technicianId);
      setIsSavingBill(true);
      try {
        const { invoice } = await apiJson<{ invoice: QuickBillInvoice }>("/api/service/quick-bills", {
          method: "POST",
          json: {
            regionId,
            storeId: user?.role === "store_user" ? user.storeId : null,
            customerType,
            customerName: customerName.trim() || null,
            phone: phone.trim() || null,
            email: email.trim() || null,
            company: company.trim() || null,
            gst: gst.trim().toUpperCase() || null,
            pan: pan.trim().toUpperCase() || null,
            watchBrand,
            watchModel,
            watchRef: watchRef.trim() || null,
            technicianId: technicianId || null,
            technicianName: tech?.name ?? null,
            paymentMode,
            notes: notes.trim(),
            lines: parsedLines.map((l) => ({
              description: l.description,
              amount: l.amount,
              spareId: l.spareId,
              qty: l.qty,
            })),
          },
        });
        setCompletion({ mode: "api", invoice });
        setAwaitingOtp(null);
        setOtpInput("");
        void loadQuickBillHistory();
      } catch (e) {
        setOtpError(e instanceof ApiError ? e.message : "Could not save quick bill to the server.");
      } finally {
        setIsSavingBill(false);
      }
      return;
    }

    setCompletion({ mode: "demo", ref: nextQuickBillRef() });
    setAwaitingOtp(null);
    setOtpInput("");
  }

  function cancelOtp() {
    setAwaitingOtp(null);
    setOtpInput("");
    setOtpError(null);
  }

  function regenerateOtp() {
    if (!validateBeforeOtp()) {
      setAwaitingOtp(null);
      return;
    }
    setAwaitingOtp(generateDemoOtp());
    setOtpInput("");
    setOtpError(null);
  }

  const total = lines.reduce((sum, l) => {
    const n = Number.parseFloat(l.amount);
    return sum + (Number.isNaN(n) ? 0 : n);
  }, 0);

  function resetForm() {
    setCustomerType("B2C");
    setCustomerName("");
    setPhone("");
    setEmail("");
    setCompany("");
    setGst("");
    setPan("");
    const b0 = brandNames[0] ?? "";
    if (b0) syncModelForBrand(b0);
    else {
      setWatchBrand("");
      setWatchModel("");
      setWatchRef("");
    }
    setLines([emptyLine()]);
    setPartPick("");
    setTechnicianId(SEED_TECHNICIANS[0]?.id ?? "");
    setPaymentMode("Cash");
    setNotes("");
    setError(null);
    setCompletion(null);
    setIsSavingBill(false);
    setAwaitingOtp(null);
    setOtpInput("");
    setOtpError(null);
    void loadQuickBillHistory();
  }

  if (completion?.mode === "api") {
    return (
      <div>
        <ServiceBreadcrumb current="Quick bill" className="print:hidden" />
        <PageHeader
          title="Quick bill"
          description="Bill saved. Print or start another sale from this screen — no separate invoicing page."
          className="print:hidden"
        />
        <QuickBillInvoicePanel
          viewModel={mapQuickBillInvoiceToViewModel(completion.invoice, { defaultHsnSac: invoiceHsnSac })}
          onNew={resetForm}
        />
        <QuickBillHistoryCard
          className="mt-8"
          rows={historyRows}
          loading={historyLoading}
          error={historyError}
          onRefresh={() => void loadQuickBillHistory()}
        />
      </div>
    );
  }

  if (completion?.mode === "demo") {
    const techName = SEED_TECHNICIANS.find((t) => t.id === technicianId)?.name ?? null;
    const placeOfSupply =
      user?.regionId != null
        ? (regions.find((r) => r.id === user.regionId)?.name ?? user.regionId)
        : "—";
    const demoLines = lines
      .map((l) => ({
        description: l.description.trim(),
        amount: Number.parseFloat(l.amount),
      }))
      .filter((l) => l.description && !Number.isNaN(l.amount) && l.amount >= 0);
    const demoVm = buildDemoServiceInvoiceViewModel(
      {
        billNumber: completion.ref,
        placeOfSupply,
        customerType,
        customerName,
        company,
        phone,
        email,
        gst,
        pan,
        watchBrand,
        watchModel,
        watchRef,
        technicianName: techName,
        paymentMode,
        notes,
        lines: demoLines,
        total,
      },
      { defaultHsnSac: invoiceHsnSac },
    );
    return (
      <div>
        <ServiceBreadcrumb current="Quick bill" className="print:hidden" />
        <PageHeader title="Quick bill" description="Demo mode — bill not persisted (API off)." className="print:hidden" />
        <QuickBillInvoicePanel viewModel={demoVm} onNew={resetForm} />
      </div>
    );
  }

  return (
    <div>
      <ServiceBreadcrumb current="Quick bill" />
      <PageHeader
        title="Quick bill"
        description="B2C: customer fields are optional. B2B: GSTIN and PAN required. After OTP, the bill is saved (API on) and the invoice appears below on this page — no separate billing route."
      />

      {apiMode && user?.role === "super_admin" ? (
        <Card
          title="Billing region"
          subtitle="Used for regional spare prices and stored on the quick bill."
          className="mb-8"
        >
          <label htmlFor="qb-bill-region" className="text-xs font-medium text-stone-600">
            Region *
          </label>
          <select
            id="qb-bill-region"
            value={billingRegionId}
            onChange={(e) => setBillingRegionId(e.target.value)}
            className={inputClass}
          >
            <option value="">Select region</option>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Card>
      ) : null}

      {apiMode ? (
        <QuickBillHistoryCard
          className="mb-8"
          rows={historyRows}
          loading={historyLoading}
          error={historyError}
          onRefresh={() => void loadQuickBillHistory()}
        />
      ) : (
        <Card title="Quick bill history" subtitle="API mode is off — saved bills are not listed." className="mb-8 print:hidden">
          <p className="text-sm text-stone-600">Turn on the API to load history from the database.</p>
        </Card>
      )}

      <form onSubmit={handlePrepareComplete} className="space-y-8">
        <Card
          title="Customer"
          subtitle={
            customerType === "B2B"
              ? "Business — customer master with GST & PAN (mandatory)"
              : "Retail — details optional for walk-in quick sale"
          }
        >
          <div className="mb-4 flex gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="qb-cust"
                checked={customerType === "B2C"}
                onChange={() => {
                  setCustomerType("B2C");
                  setError(null);
                }}
                className="text-zimson-600 focus:ring-zimson-500"
              />
              B2C
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="qb-cust"
                checked={customerType === "B2B"}
                onChange={() => {
                  setCustomerType("B2B");
                  setError(null);
                }}
                className="text-zimson-600 focus:ring-zimson-500"
              />
              B2B
            </label>
          </div>

          {customerType === "B2B" ? (
            <p className="mb-4 rounded-xl border border-zimson-200 bg-zimson-50/80 px-3 py-2 text-xs text-stone-700">
              Create / attach a <strong>business customer</strong>: company, GSTIN, PAN, and primary
              contact are required before completing the bill.
            </p>
          ) : (
            <p className="mb-4 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-600">
              For B2C, name and phone are <strong>optional</strong>. Leave blank for anonymous counter
              sales if your policy allows it.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {customerType === "B2B" ? (
              <div className="sm:col-span-2">
                <label htmlFor="qb-company" className="text-xs font-medium text-stone-600">
                  Company / legal name *
                </label>
                <input
                  id="qb-company"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className={inputClass}
                  placeholder="Registered business name"
                />
              </div>
            ) : null}
            {customerType === "B2B" ? (
              <>
                <div>
                  <label htmlFor="qb-gst" className="text-xs font-medium text-stone-600">
                    GSTIN *
                  </label>
                  <input
                    id="qb-gst"
                    value={gst}
                    onChange={(e) => setGst(e.target.value.toUpperCase())}
                    className={inputClass}
                    placeholder="15-character GSTIN"
                    maxLength={15}
                  />
                </div>
                <div>
                  <label htmlFor="qb-pan" className="text-xs font-medium text-stone-600">
                    PAN *
                  </label>
                  <input
                    id="qb-pan"
                    value={pan}
                    onChange={(e) => setPan(e.target.value.toUpperCase())}
                    className={inputClass}
                    placeholder="ABCDE1234F"
                    maxLength={10}
                  />
                </div>
              </>
            ) : null}
            <div className="sm:col-span-2">
              <label htmlFor="qb-name" className="text-xs font-medium text-stone-600">
                {customerType === "B2B" ? "Contact person *" : "Customer name (optional)"}
              </label>
              <input
                id="qb-name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className={inputClass}
                placeholder={customerType === "B2B" ? "Name on account" : "Walk-in — optional"}
              />
            </div>
            <div>
              <label htmlFor="qb-phone" className="text-xs font-medium text-stone-600">
                {customerType === "B2B" ? "Contact phone *" : "Phone (optional)"}
              </label>
              <input
                id="qb-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputClass}
                placeholder="+91 …"
              />
            </div>
            <div>
              <label htmlFor="qb-email" className="text-xs font-medium text-stone-600">
                Email (optional)
              </label>
              <input
                id="qb-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="optional"
              />
            </div>
          </div>
        </Card>

        <Card title="Watch (catalog)" subtitle="Brand list from master data; models from demo catalog for that brand">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="qb-brand" className="text-xs font-medium text-stone-600">
                Brand *
              </label>
              <select
                id="qb-brand"
                value={watchBrand}
                onChange={(e) => syncModelForBrand(e.target.value)}
                className={inputClass}
              >
                {brandNames.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="qb-model" className="text-xs font-medium text-stone-600">
                Model *
              </label>
              <select
                id="qb-model"
                value={watchModel}
                onChange={(e) => {
                  setWatchModel(e.target.value);
                  const m = models.find((x) => x.model === e.target.value);
                  if (m?.refHint) setWatchRef(m.refHint);
                }}
                className={inputClass}
              >
                {models.map((m) => (
                  <option key={m.id} value={m.model}>
                    {m.model}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="qb-ref" className="text-xs font-medium text-stone-600">
                Serial / ref (optional)
              </label>
              <input
                id="qb-ref"
                value={watchRef}
                onChange={(e) => setWatchRef(e.target.value)}
                className={inputClass}
                placeholder="Unit serial or reference"
              />
            </div>
          </div>
        </Card>

        <Card
          title="Service lines"
          subtitle="Only spares that have a regional price row for the selected watch brand appear here; stock is summed across HO + stores in the region"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2">
                <input
                  value={barcodeSku}
                  onChange={(e) => setBarcodeSku(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addScannedSku();
                    }
                  }}
                  className="rounded-lg border border-zimson-400 bg-white px-2 py-1.5 text-xs font-semibold text-zimson-900 shadow-sm"
                  placeholder="Scan barcode / SKU"
                  aria-label="Scan barcode sku"
                />
                <button
                  type="button"
                  onClick={addScannedSku}
                  className="rounded-lg border border-zimson-400 bg-white px-3 py-1.5 text-xs font-semibold text-zimson-900 shadow-sm hover:bg-zimson-50"
                >
                  Add by scan
                </button>
              </div>
              <select
                value={partPick}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) void addPartLine(v);
                }}
                className="rounded-lg border border-zimson-400 bg-white px-2 py-1.5 text-xs font-semibold text-zimson-900 shadow-sm"
                aria-label="Add part from catalog"
              >
                <option value="">
                  {spareOptionsLoading
                    ? "Loading spares for selected brand…"
                    : `+ Spare with ${watchBrand} price in region…`}
                </option>
                {spareOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.sku}) — ₹{s.price} · regional qty {s.stockQty}
                    {s.stockQty <= 0 ? " · Out of stock" : ""}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={addLine}
                className="rounded-lg border border-zimson-400 bg-white px-3 py-1.5 text-xs font-semibold text-zimson-900 shadow-sm hover:bg-zimson-50"
              >
                Empty line
              </button>
            </div>
          }
        >
          <div className="space-y-3">
            {lines.map((line, index) => (
              <div
                key={line.id}
                className="flex flex-col gap-3 rounded-xl border border-zimson-200/80 bg-zimson-50/30 p-3 sm:flex-row sm:items-end"
              >
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-medium text-stone-600">Description</span>
                  <input
                    value={line.description}
                    onChange={(e) => updateLine(line.id, { description: e.target.value })}
                    className={inputClass}
                    placeholder={`Line ${index + 1}`}
                  />
                </div>
                <div className="w-full sm:w-36">
                  <span className="text-xs font-medium text-stone-600">Amount (INR)</span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={line.amount}
                    onChange={(e) => updateLine(line.id, { amount: e.target.value })}
                    className={inputClass}
                    placeholder="0"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeLine(line.id)}
                  disabled={lines.length <= 1}
                  className="rounded-lg border border-stone-200 px-3 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <p className="mt-4 text-right text-sm font-semibold text-stone-900">
            Total: {total.toLocaleString(undefined, { style: "currency", currency: "INR" })}
          </p>
        </Card>

        <Card title="Assignment & payment">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="qb-tech" className="text-xs font-medium text-stone-600">
                Technician
              </label>
              <select
                id="qb-tech"
                value={technicianId}
                onChange={(e) => setTechnicianId(e.target.value)}
                className={inputClass}
              >
                {SEED_TECHNICIANS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.grade}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="qb-pay" className="text-xs font-medium text-stone-600">
                Payment mode
              </label>
              <select
                id="qb-pay"
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as typeof paymentMode)}
                className={inputClass}
              >
                <option value="Cash">Cash</option>
                <option value="Card">Card</option>
                <option value="UPI">UPI</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="qb-notes" className="text-xs font-medium text-stone-600">
                Notes
              </label>
              <textarea
                id="qb-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={inputClass}
                placeholder="Optional remarks for receipt"
              />
            </div>
          </div>
        </Card>

        {error ? (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">
            {error}
          </p>
        ) : null}

        {!awaitingOtp ? (
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              className="rounded-xl bg-zimson-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700"
            >
              Send OTP &amp; review
            </button>
            <Link
              to="/service"
              className="inline-flex items-center rounded-xl border border-zimson-400 bg-white px-5 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
            >
              Cancel
            </Link>
          </div>
        ) : null}
      </form>

      {awaitingOtp ? (
        <div className="mt-8 space-y-4">
          <DemoOtpGate
            title="Verify quick bill"
            issuedCode={awaitingOtp}
            value={otpInput}
            onChange={setOtpInput}
            error={otpError}
            onVerify={() => void handleVerifyOtp()}
            onRegenerate={regenerateOtp}
            verifyBusy={isSavingBill}
          />
          <button
            type="button"
            onClick={cancelOtp}
            className="text-sm font-medium text-stone-600 underline decoration-zimson-300 underline-offset-2 hover:text-stone-900"
          >
            Cancel verification (edit form)
          </button>
        </div>
      ) : null}
    </div>
  );
}
