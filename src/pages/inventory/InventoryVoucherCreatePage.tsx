import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { InventoryBreadcrumb } from "../../components/inventory/InventoryBreadcrumb";
import { SparePicker } from "../../components/inventory/SparePicker";
import { SupplierPicker } from "../../components/inventory/SupplierPicker";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useRegions } from "../../context/RegionsContext";
import { useSpares } from "../../context/SparesContext";
import { ApiError, apiJson } from "../../lib/api";
import { computePoLineAmounts } from "../../lib/poLineAmounts";
import { DEFAULT_LINE_GST_PERCENT } from "../../lib/serviceBillGst";
import { taxPersonTypeFromGstin } from "../../lib/supplierGstFill";
import type { SparePart, SparePriceLine } from "../../types/spare";
import type { Supplier } from "../../types/supplier";

type StandaloneLine = {
  spareId: string;
  partCode: string;
  productName: string;
  qty: string;
  purchasePrice: string;
  mrp: string;
  gstPercent: string;
  uom: string;
  brand: string;
  hsn: string;
  cgst: string;
  sgst: string;
  igst: string;
  totalMrp: string;
  totalCost: string;
  finalCost: string;
  priceBrands: string[];
};

function emptyStandaloneLine(): StandaloneLine {
  return {
    spareId: "",
    partCode: "",
    productName: "",
    qty: "1",
    purchasePrice: "",
    mrp: "",
    gstPercent: String(DEFAULT_LINE_GST_PERCENT),
    uom: "Nos",
    brand: "",
    hsn: "",
    cgst: "0.00",
    sgst: "0.00",
    igst: "0.00",
    totalMrp: "0.00",
    totalCost: "0.00",
    finalCost: "0.00",
    priceBrands: [],
  };
}

function withComputed(line: StandaloneLine, interstate: boolean): StandaloneLine {
  const t = computePoLineAmounts({
    qty: Number(line.qty) || 0,
    purchasePrice: Number(line.purchasePrice) || 0,
    mrp: Number(line.mrp) || 0,
    gstPercent: Number(line.gstPercent) || 0,
    interstate,
  });
  return {
    ...line,
    cgst: t.cgst.toFixed(2),
    sgst: t.sgst.toFixed(2),
    igst: t.igst.toFixed(2),
    totalMrp: t.totalMrp.toFixed(2),
    totalCost: t.totalCost.toFixed(2),
    finalCost: t.finalCost.toFixed(2),
  };
}

function lineFromSpare(spare: SparePart | undefined, prev: StandaloneLine): StandaloneLine {
  if (!spare) return { ...emptyStandaloneLine(), qty: prev.qty || "1" };
  return {
    ...emptyStandaloneLine(),
    spareId: spare.id,
    partCode: spare.sku ?? "",
    productName: spare.name ?? "",
    qty: prev.qty || "1",
    purchasePrice: spare.costPriceInr != null ? String(spare.costPriceInr) : "",
    mrp: spare.mrpInr != null ? String(spare.mrpInr) : spare.sellingPriceInr != null ? String(spare.sellingPriceInr) : "",
    gstPercent: spare.gstPercent != null ? String(spare.gstPercent) : String(DEFAULT_LINE_GST_PERCENT),
    uom: prev.uom || "Nos",
    brand: "",
    hsn: spare.hsn ?? "",
  };
}

function brandFromPriceLines(prices: SparePriceLine[]): { brand: string; priceBrands: string[] } {
  const priceBrands = [...new Set(prices.map((p) => p.brand.trim()).filter(Boolean))];
  return { brand: priceBrands.join(", "), priceBrands };
}

function fmtMoney(v: number) {
  return v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

const fieldCls =
  "mt-1 w-full border border-rlx-rule bg-white px-3 py-2 text-sm text-stone-800 outline-none focus:border-rlx-green";

function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="block text-[10px] font-semibold uppercase tracking-widest text-stone-400">{children}</span>;
}

function LineMeta({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-rlx-rule bg-stone-50/80 px-4 py-2 text-xs">
      {children}
    </div>
  );
}

function MetaItem({
  label,
  value,
  emphasize,
  muted,
  mono,
}: {
  label: string;
  value?: string | number | null;
  emphasize?: boolean;
  muted?: boolean;
  mono?: boolean;
}) {
  if (value == null || value === "") return null;
  return (
    <span className={`whitespace-nowrap ${muted ? "opacity-40" : ""}`.trim()}>
      {label ? <span className="mr-1 text-[10px] font-semibold uppercase tracking-widest text-stone-400">{label}</span> : null}
      <span
        className={`${mono ? "font-mono" : ""} ${
          emphasize ? "font-bold text-rlx-green" : "font-semibold text-stone-800"
        }`}
      >
        {value}
      </span>
    </span>
  );
}

function AmountChip({ label, value, emphasize }: { label: string; value: number; emphasize?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-400">{label}</p>
      <p className={`mt-0.5 tabular-nums ${emphasize ? "text-base font-bold text-rlx-green" : "text-sm font-semibold text-stone-800"}`}>
        ₹{fmtMoney(value)}
      </p>
    </div>
  );
}

function VoucherSuccessModal({
  voucherNumber,
  onClose,
}: {
  voucherNumber: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.55)" }}>
      <div className="w-full max-w-sm bg-white shadow-2xl overflow-hidden">
        <div className="bg-rlx-green px-6 py-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/30 bg-white/10">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" className="h-7 w-7">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 className="text-base font-semibold uppercase tracking-[0.15em] text-white">Voucher Created</h2>
        </div>
        <div className="px-6 py-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-stone-400">Voucher Number</p>
          <p className="mt-2 font-mono text-xl font-bold text-rlx-green">{voucherNumber}</p>
          <p className="mt-3 text-sm text-stone-500">GRN this voucher from the GRN screen.</p>
        </div>
        <div className="flex gap-2 border-t border-rlx-rule bg-rlx-bg px-6 py-4">
          <Link
            to={`/inventory/po-inward?voucher=${encodeURIComponent(voucherNumber)}`}
            className="flex-1 border border-rlx-rule bg-white py-2 text-center text-sm font-semibold text-stone-700 hover:bg-stone-50 transition"
          >
            GRN against voucher
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-rlx-green py-2 text-sm font-semibold text-white hover:bg-rlx-green/90 transition"
          >
            Create Another
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="border-b border-rlx-rule bg-rlx-green px-5 py-4">
      <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-white">{title}</h3>
    </div>
  );
}

export function InventoryVoucherCreatePage() {
  const { user } = useAuth();
  const { spares } = useSpares();
  const { regions } = useRegions();
  const navigate = useNavigate();

  const isHo =
    user?.role === "admin" || user?.role === "super_admin" ||
    user?.role === "ho_manager" || user?.role === "ho_purchase";

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [successVoucherNumber, setSuccessVoucherNumber] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState("");
  const [regionId, setRegionId] = useState(user?.regionId ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(todayIsoDate());
  const [notes, setNotes] = useState("");
  const [standaloneLines, setStandaloneLines] = useState<StandaloneLine[]>([emptyStandaloneLine()]);

  const spareById = useMemo(() => {
    const m = new Map<string, SparePart>();
    for (const s of spares) m.set(s.id, s);
    return m;
  }, [spares]);

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === supplierId) ?? null,
    [suppliers, supplierId],
  );

  const hoGstin = useMemo(() => {
    const region = regions.find((r) => r.id === regionId) ?? regions[0];
    return region?.gst?.trim() || null;
  }, [regions, regionId]);

  const interstate = useMemo(() => {
    if (!selectedSupplier) return false;
    if (selectedSupplier.taxPersonType === "INTERSTATE_TAXABLE_PERSON") return true;
    if (selectedSupplier.taxPersonType === "INTRASTATE_TAXABLE_PERSON") return false;
    if (selectedSupplier.gst) {
      return taxPersonTypeFromGstin(selectedSupplier.gst, hoGstin) === "INTERSTATE_TAXABLE_PERSON";
    }
    return false;
  }, [selectedSupplier, hoGstin]);

  const standaloneTotals = useMemo(() => {
    return standaloneLines.reduce(
      (acc, line) => {
        const cgst = Number(line.cgst) || 0;
        const sgst = Number(line.sgst) || 0;
        const igst = Number(line.igst) || 0;
        return {
          totalMrp: acc.totalMrp + (Number(line.totalMrp) || 0),
          totalCost: acc.totalCost + (Number(line.totalCost) || 0),
          tax: acc.tax + cgst + sgst + igst,
          finalCost: acc.finalCost + (Number(line.finalCost) || 0),
        };
      },
      { totalMrp: 0, totalCost: 0, tax: 0, finalCost: 0 },
    );
  }, [standaloneLines]);

  const readyLineCount = standaloneLines.filter((l) => l.spareId && (Number(l.qty) || 0) > 0).length;

  function patchStandalone(idx: number, patch: Partial<StandaloneLine>) {
    setStandaloneLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function patchComputed(idx: number, patch: Partial<StandaloneLine>) {
    setStandaloneLines((prev) => prev.map((l, i) => (i === idx ? withComputed({ ...l, ...patch }, interstate) : l)));
  }

  async function fillLineFromSpare(idx: number, spareId: string, prev: StandaloneLine) {
    const base = withComputed(lineFromSpare(spareById.get(spareId), prev), interstate);
    patchStandalone(idx, base);
    if (!spareId) return;
    try {
      const q = regionId ? `?regionId=${encodeURIComponent(regionId)}` : "";
      const data = await apiJson<{ prices: SparePriceLine[] }>(
        `/api/catalog/spares/${encodeURIComponent(spareId)}/prices${q}`,
      );
      const mapped = brandFromPriceLines(data.prices);
      setStandaloneLines((current) =>
        current.map((l, i) => (i === idx ? { ...l, brand: mapped.brand || l.brand, priceBrands: mapped.priceBrands } : l)),
      );
    } catch {
      setStandaloneLines((current) => current.map((l, i) => (i === idx ? { ...l, brand: "", priceBrands: [] } : l)));
    }
  }

  const loadAll = useCallback(async () => {
    try {
      const supData = await apiJson<{ suppliers: Supplier[] }>("/api/inventory/suppliers");
      setSuppliers(supData.suppliers);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not load data.");
    }
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);

  useEffect(() => {
    if (!regionId && (user?.regionId || regions[0])) setRegionId(user?.regionId || regions[0]!.id);
  }, [regionId, regions, user?.regionId]);

  useEffect(() => {
    setStandaloneLines((prev) => prev.map((l) => withComputed(l, interstate)));
  }, [interstate]);

  async function createVoucher() {
    const items = standaloneLines
      .map((l) => ({
        spareId: l.spareId,
        qtyOrdered: Number(l.qty) || 0,
        unitPrice: Number(l.purchasePrice) || 0,
        mrp: Number(l.mrp) || 0,
        gstRate: Number(l.gstPercent) || 0,
        cgstAmount: Number(l.cgst) || 0,
        sgstAmount: Number(l.sgst) || 0,
        igstAmount: Number(l.igst) || 0,
        uom: l.uom.trim() || "Nos",
        hsn: l.hsn.trim() || null,
        brand: l.brand.trim() || null,
        partCode: l.partCode.trim() || null,
        productName: l.productName.trim() || null,
      }))
      .filter((l) => l.spareId && l.qtyOrdered > 0);
    if (!supplierId) {
      setErr("Select a supplier.");
      return;
    }
    if (!regionId) {
      setErr("Select a region.");
      return;
    }
    if (!invoiceNumber.trim()) {
      setErr("Enter the supplier invoice number.");
      return;
    }
    if (items.length === 0) {
      setErr("Add at least one spare with quantity.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const data = await apiJson<{ voucherNumber: string }>("/api/inventory/vouchers", {
        method: "POST",
        json: {
          supplierId,
          regionId,
          invoiceNumber: invoiceNumber.trim(),
          invoiceDate: invoiceDate || null,
          notes,
          items,
        },
      });
      setStandaloneLines([emptyStandaloneLine()]);
      setNotes("");
      setInvoiceNumber("");
      setInvoiceDate(todayIsoDate());
      setSuccessVoucherNumber(data.voucherNumber);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not create voucher.");
    } finally {
      setBusy(false);
    }
  }

  if (!isHo) {
    return (
      <div>
        <InventoryBreadcrumb current="Purchase vouchers" />
        <PageHeader title="Create Purchase Voucher" description="" />
        <div className="border border-rlx-rule bg-white px-6 py-8 text-center text-sm text-stone-400">
          Purchase vouchers are created by HO.
          <div className="mt-3">
            <Link to="/inventory/voucher-history" className="font-semibold text-rlx-green hover:underline">View voucher history →</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <InventoryBreadcrumb current="Create voucher" />
      <PageHeader
        title="Create Purchase Voucher"
        description=""
        actions={
          <div className="flex gap-2">
            <Link to="/inventory/voucher-history" className="border border-rlx-green px-4 py-2 text-xs font-semibold uppercase tracking-widest text-rlx-green hover:bg-rlx-green/5 transition">
              Voucher History
            </Link>
            <Link to="/inventory/po-inward" className="border border-rlx-rule bg-white px-4 py-2 text-xs font-semibold uppercase tracking-widest text-stone-600 hover:bg-stone-50 transition">
              GRN
            </Link>
            <button type="button" onClick={() => navigate(-1)} className="border border-rlx-rule bg-white px-4 py-2 text-xs font-semibold uppercase tracking-widest text-stone-600 hover:bg-stone-50 transition">
              ← Back
            </button>
          </div>
        }
      />

      {err && <div className="mb-5 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">✕ {err}</div>}

      <div className="border border-rlx-rule bg-white shadow-sm">
        <SectionHeader title="Create purchase voucher" />
        <div className="space-y-5 p-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <label>
              <FieldLabel>Supplier name</FieldLabel>
              <SupplierPicker
                value={supplierId}
                onChange={setSupplierId}
                suppliers={suppliers.filter((s) => s.isActive)}
              />
              {selectedSupplier ? (
                <p className="mt-1.5 text-[11px] text-stone-500">
                  {selectedSupplier.gst ? `GSTIN ${selectedSupplier.gst}` : "No GSTIN"}
                  {" · "}
                  {interstate ? "Interstate — IGST" : "Intrastate — CGST + SGST"}
                </p>
              ) : null}
            </label>
            <label>
              <FieldLabel>Region name</FieldLabel>
              <select
                className={fieldCls}
                value={regionId}
                disabled={Boolean(user?.regionId) && user?.role !== "super_admin"}
                onChange={(e) => setRegionId(e.target.value)}
              >
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </label>
            <label>
              <FieldLabel>Invoice number *</FieldLabel>
              <input
                className={fieldCls}
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
              />
            </label>
            <label>
              <FieldLabel>Invoice date</FieldLabel>
              <input
                type="date"
                className={fieldCls}
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
              />
            </label>
            <label className="lg:col-span-2">
              <FieldLabel>Remark</FieldLabel>
              <input
                className={fieldCls}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h4 className="text-xs font-bold uppercase tracking-[0.18em] text-stone-500">Line items</h4>
              <span className="text-[11px] text-stone-400">{readyLineCount} spare{readyLineCount === 1 ? "" : "s"} ready</span>
            </div>
            <div className="space-y-3">
              {standaloneLines.map((line, idx) => (
                <div key={idx} className="relative z-0 overflow-visible border border-rlx-rule bg-white focus-within:z-40">
                  <div className="flex flex-wrap items-end gap-3 px-4 py-2">
                    <div className="mb-px flex h-10 w-9 shrink-0 items-center justify-center bg-rlx-green text-sm font-bold text-white">
                      {idx + 1}
                    </div>
                    <div className="relative min-w-[220px] flex-1">
                      <FieldLabel>Select spare</FieldLabel>
                      <SparePicker
                        value={line.spareId}
                        onChange={(id) => void fillLineFromSpare(idx, id, line)}
                        spares={spares}
                        className="relative mt-1"
                        showSku
                      />
                    </div>
                    <label className="w-24 shrink-0">
                      <FieldLabel>Qty *</FieldLabel>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        inputMode="numeric"
                        className={`${fieldCls} text-right font-semibold tabular-nums`}
                        value={line.qty}
                        onChange={(e) => patchComputed(idx, { qty: e.target.value })}
                      />
                    </label>
                    <label className="w-32 shrink-0">
                      <FieldLabel>Price *</FieldLabel>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className={`${fieldCls} text-right font-semibold tabular-nums`}
                        value={line.purchasePrice}
                        placeholder="0.00"
                        onChange={(e) => patchComputed(idx, { purchasePrice: e.target.value })}
                      />
                    </label>
                    <button
                      type="button"
                      className="mb-px h-10 shrink-0 px-3 text-xs font-semibold uppercase tracking-widest text-stone-400 hover:text-red-600"
                      onClick={() =>
                        setStandaloneLines((prev) => (prev.length === 1 ? [emptyStandaloneLine()] : prev.filter((_, i) => i !== idx)))
                      }
                    >
                      Remove
                    </button>
                  </div>
                  {line.spareId ? (
                    <LineMeta>
                      <MetaItem label="Part" value={line.partCode} mono />
                      <MetaItem label="Name" value={line.productName} />
                      <MetaItem label="Brand" value={line.brand} />
                      <MetaItem label="HSN" value={line.hsn} mono />
                      <MetaItem label="UOM" value={line.uom} />
                      <MetaItem label="MRP" value={line.mrp ? `₹${fmtMoney(Number(line.mrp) || 0)}` : undefined} />
                      <MetaItem label="GST" value={line.gstPercent ? `${line.gstPercent}%` : undefined} />
                      <MetaItem label="CGST" value={`₹${fmtMoney(Number(line.cgst) || 0)}`} muted={interstate} />
                      <MetaItem label="SGST" value={`₹${fmtMoney(Number(line.sgst) || 0)}`} muted={interstate} />
                      <MetaItem label="IGST" value={`₹${fmtMoney(Number(line.igst) || 0)}`} muted={!interstate} />
                      <MetaItem label="Total MRP" value={`₹${fmtMoney(Number(line.totalMrp) || 0)}`} />
                      <MetaItem label="Total cost" value={`₹${fmtMoney(Number(line.totalCost) || 0)}`} />
                      <MetaItem label="Final" value={`₹${fmtMoney(Number(line.finalCost) || 0)}`} emphasize />
                    </LineMeta>
                  ) : null}
                </div>
              ))}
            </div>
            <button
              type="button"
              className="mt-3 w-full border border-dashed border-rlx-rule py-2 text-sm font-semibold text-rlx-green transition hover:border-rlx-green hover:bg-rlx-green/5"
              onClick={() => setStandaloneLines((prev) => [...prev, emptyStandaloneLine()])}
            >
              + Add another spare
            </button>
          </div>

          <div className="sticky bottom-0 z-10 -mx-5 border-t border-rlx-rule bg-white px-5 py-4 shadow-[0_-8px_16px_rgba(0,0,0,0.04)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
                <AmountChip label="Total MRP" value={standaloneTotals.totalMrp} />
                <AmountChip label="Total cost" value={standaloneTotals.totalCost} />
                <AmountChip label={interstate ? "IGST" : "CGST + SGST"} value={standaloneTotals.tax} />
                <AmountChip label="Final cost" value={standaloneTotals.finalCost} emphasize />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={busy || readyLineCount === 0 || !supplierId || !invoiceNumber.trim()}
                  onClick={() => void createVoucher()}
                  className="bg-rlx-green px-8 py-2.5 text-sm font-semibold text-white transition hover:bg-rlx-green/90 disabled:opacity-40"
                >
                  {busy ? "Creating…" : "Create voucher"}
                </button>
                <Link to="/inventory/po-inward" className="text-sm font-semibold text-stone-500 hover:text-rlx-green">
                  GRN →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {successVoucherNumber ? (
        <VoucherSuccessModal voucherNumber={successVoucherNumber} onClose={() => setSuccessVoucherNumber(null)} />
      ) : null}
    </div>
  );
}
