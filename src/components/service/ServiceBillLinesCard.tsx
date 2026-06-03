import { useMemo, useState } from "react";
import { Card } from "../ui/Card";
import { GstSummaryBlock } from "./GstSummaryBlock";
import { sanitizeDecimalInput, sanitizeTextInput } from "../../lib/inputSanitize";
import { gstRateFromHsn, normalizeHsnCode } from "../../lib/hsnGst";
import {
  formatPlaceOfSupplyLabel,
  resolveCustomerSupplyStateCode,
  resolveSellerStateCode,
  stateCodeLabel,
} from "../../lib/gstSupply";
import { isNatureOfRepairTaxable, natureOfRepairBillingNote } from "../../lib/natureOfRepair";
import type { ServiceBillEditorLine } from "../../lib/serviceBillEditorLines";
import { editorLineAmountInr } from "../../lib/serviceBillEditorLines";
import type { computeServiceBillGst } from "../../lib/serviceBillGst";
import {
  storeServiceChargeMaxLabel,
  validateStoreServiceAmountInr,
} from "../../lib/serviceChargeLimits";
import { inputClass } from "../../lib/uiForm";
import type { ServiceTaxSettings } from "../../types/serviceTaxSettings";

export type ServiceBillSpareOption = {
  id: string;
  sku: string;
  name: string;
  hsn: string | null;
  price: number;
};

type Props = {
  watchBrand: string;
  spareOptions: ServiceBillSpareOption[];
  lines: ServiceBillEditorLine[];
  onLinesChange: (lines: ServiceBillEditorLine[]) => void;
  serviceChargeInr: string;
  onServiceChargeInrChange: (value: string) => void;
  customerBillingState: string;
  onCustomerBillingStateChange: (value: string) => void;
  customerType: "B2C" | "B2B";
  customerGst?: string;
  customerAddress?: string;
  customerCity?: string;
  serviceSacHsn: string;
  serviceTaxSettings: ServiceTaxSettings | null;
  storeGstin?: string;
  natureOfRepair?: string | null;
  taxPreview: ReturnType<typeof computeServiceBillGst> | null;
  billSubtotalInr: number;
  advanceInr: number;
  standardTotalInr: number;
  userRole?: string | null;
  /** Store user: slip spares read-only; only labour / service charge editable. */
  labourChargesOnly?: boolean;
  onValidationError?: (message: string | null) => void;
};

function emptyEditableLine(): ServiceBillEditorLine {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, description: "", amount: "" };
}

export function ServiceBillLinesCard({
  watchBrand,
  spareOptions,
  lines,
  onLinesChange,
  serviceChargeInr,
  onServiceChargeInrChange,
  customerBillingState,
  onCustomerBillingStateChange,
  customerType,
  customerGst = "",
  customerAddress,
  customerCity,
  serviceSacHsn,
  serviceTaxSettings,
  storeGstin,
  natureOfRepair,
  taxPreview,
  billSubtotalInr,
  advanceInr,
  standardTotalInr,
  userRole,
  labourChargesOnly = false,
  onValidationError,
}: Props) {
  const [barcodeSku, setBarcodeSku] = useState("");
  const [partPick, setPartPick] = useState("");

  const serviceHsnGstRate = gstRateFromHsn(serviceSacHsn, serviceTaxSettings?.gstRatePercent ?? 18);
  const serviceChargeNum = Number.parseFloat(serviceChargeInr);
  const hasServiceCharge = Number.isFinite(serviceChargeNum) && serviceChargeNum > 0;

  const sellerStateCode = resolveSellerStateCode(storeGstin);
  const customerStateCode = resolveCustomerSupplyStateCode({
    customerType,
    customerGstin: customerGst,
    billingStateName: customerBillingState,
    addressText: customerAddress ?? null,
    cityText: customerCity ?? null,
    sellerStateCode,
  });

  function updateLine(id: string, patch: Partial<ServiceBillEditorLine>) {
    onLinesChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function validateAmount(amountInr: number): boolean {
    const err = validateStoreServiceAmountInr(amountInr, userRole);
    if (err) {
      onValidationError?.(err);
      return false;
    }
    onValidationError?.(null);
    return true;
  }

  function handleManualLineAmount(id: string, raw: string) {
    const amount = sanitizeDecimalInput(raw);
    const n = Number.parseFloat(amount);
    if (Number.isFinite(n) && n > 0 && !validateAmount(n)) return;
    updateLine(id, { amount });
  }

  function handleServiceChargeChange(raw: string) {
    const amount = sanitizeDecimalInput(raw);
    const n = Number.parseFloat(amount);
    if (Number.isFinite(n) && n > 0 && !validateAmount(n)) return;
    onServiceChargeInrChange(amount);
  }

  function addChargeLine() {
    if (labourChargesOnly) return;
    onLinesChange([...lines, emptyEditableLine()]);
  }

  function removeLine(id: string) {
    if (labourChargesOnly) return;
    const line = lines.find((l) => l.id === id);
    if (line?.locked) return;
    onLinesChange(lines.filter((l) => l.id !== id));
  }

  function addPartLine(spareId: string) {
    if (labourChargesOnly) return;
    const spare = spareOptions.find((s) => s.id === spareId);
    if (!spare) {
      onValidationError?.("Spare not found in catalogue.");
      return;
    }
    onLinesChange([
      ...lines,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        description: `${spare.name} (${spare.sku})`,
        amount: String(spare.price),
        spareId: spare.id,
        hsn: spare.hsn,
      },
    ]);
    onValidationError?.(null);
    setPartPick("");
  }

  function addScannedSku() {
    const sku = barcodeSku.trim().toUpperCase();
    if (!sku) return;
    const option = spareOptions.find((s) => s.sku.toUpperCase() === sku);
    if (!option) {
      onValidationError?.(`Scanned SKU ${sku} not found in spare catalogue.`);
      setBarcodeSku("");
      return;
    }
    addPartLine(option.id);
    setBarcodeSku("");
  }

  return (
    <Card
      title="Service lines"
      subtitle={
        labourChargesOnly
          ? "Spares from the supervisor slip are fixed — enter labour / service charge only."
          : "Same layout as Quick Bill — spares, labour SAC, and GST"
      }
    >
      {!labourChargesOnly ? (
      <div className="mb-4 flex min-w-0 flex-col gap-3 border-b border-zimson-100 pb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-600">Add lines</p>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-stretch">
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:max-w-md sm:flex-row">
            <input
              value={barcodeSku}
              onChange={(e) => setBarcodeSku(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addScannedSku();
                }
              }}
              className="min-w-0 flex-1 rounded-lg border border-zimson-400 bg-white px-2 py-2 text-xs font-semibold text-zimson-900 shadow-sm"
              placeholder="Scan barcode / SKU"
              aria-label="Scan barcode sku"
            />
            <button
              type="button"
              onClick={addScannedSku}
              className="shrink-0 rounded-lg border border-zimson-400 bg-white px-3 py-2 text-xs font-semibold text-zimson-900 shadow-sm hover:bg-zimson-50"
            >
              Add by scan
            </button>
          </div>
          <select
            value={partPick}
            onChange={(e) => {
              const v = e.target.value;
              setPartPick(v);
              if (v) addPartLine(v);
            }}
            className="min-w-0 w-full rounded-lg border border-zimson-400 bg-white px-2 py-2 text-xs font-semibold text-zimson-900 shadow-sm sm:min-w-[12rem] sm:flex-1"
            aria-label="Add spare from catalogue"
          >
            <option value="">+ Spare from catalogue…</option>
            {spareOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.sku}) — ₹{s.price.toFixed(2)}
              </option>
            ))}
          </select>
        </div>
        {watchBrand.trim() ? (
          <p className="text-[11px] text-stone-500">
            Watch brand: <span className="font-semibold">{watchBrand}</span> — supervisor slip lines are locked;
            add extra spares or charges below.
          </p>
        ) : null}
      </div>
      ) : null}

      <div className="space-y-3">
        {lines.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zimson-200 bg-zimson-50/40 px-3 py-4 text-sm text-stone-600">
            No spares on slip yet. Add spares from the catalogue or enter labour in the service charge row below.
          </p>
        ) : (
          lines.map((line, index) => {
            const lineHsn = line.spareId ? normalizeHsnCode(line.hsn) || "—" : null;
            const lineGstRate =
              line.spareId && lineHsn && lineHsn !== "—"
                ? gstRateFromHsn(lineHsn, serviceTaxSettings?.gstRatePercent ?? 18)
                : null;
            const readOnly = labourChargesOnly || Boolean(line.spareId) || Boolean(line.locked);
            return (
              <div
                key={line.id}
                className="grid min-w-0 grid-cols-1 gap-3 rounded-xl border border-zimson-200/80 bg-zimson-50/30 p-3 sm:grid-cols-[1fr_minmax(0,7rem)_minmax(0,9rem)_auto] sm:items-end"
              >
                <div className="min-w-0">
                  <span className="text-xs font-medium text-stone-600">
                    {line.locked ? "Spare (from slip)" : line.spareId ? "Spare" : "Description"}
                  </span>
                  <input
                    value={line.description}
                    readOnly={readOnly}
                    onChange={
                      readOnly
                        ? undefined
                        : (e) =>
                            updateLine(line.id, {
                              description: sanitizeTextInput(e.target.value, 200),
                            })
                    }
                    className={readOnly ? `${inputClass} cursor-not-allowed bg-stone-100` : inputClass}
                    placeholder={`Line ${index + 1}`}
                  />
                </div>
                {line.spareId ? (
                  <div className="min-w-0 w-full">
                    <span className="text-xs font-medium text-stone-600">HSN (inventory)</span>
                    <input
                      value={lineHsn ?? "—"}
                      readOnly
                      className={`${inputClass} cursor-not-allowed bg-stone-100 font-mono text-xs`}
                    />
                    {lineGstRate != null ? (
                      <p className="mt-0.5 text-[10px] text-stone-500">GST {lineGstRate}%</p>
                    ) : null}
                  </div>
                ) : (
                  <div className="hidden sm:block" aria-hidden />
                )}
                <div className="min-w-0 w-full">
                  <span className="text-xs font-medium text-stone-600">Amount (INR)</span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={line.amount}
                    readOnly={readOnly}
                    onChange={readOnly ? undefined : (e) => handleManualLineAmount(line.id, e.target.value)}
                    className={readOnly ? `${inputClass} cursor-not-allowed bg-stone-100` : inputClass}
                    placeholder="0"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeLine(line.id)}
                  disabled={line.locked || labourChargesOnly}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
                >
                  {line.locked || labourChargesOnly ? "On slip" : "Remove"}
                </button>
              </div>
            );
          })
        )}
        {!labourChargesOnly ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={addChargeLine}
              className="rounded-lg border border-zimson-400 bg-white px-3 py-1.5 text-xs font-semibold text-zimson-900 hover:bg-zimson-50"
            >
              Add charge line
            </button>
          </div>
        ) : null}
        <div className="grid min-w-0 grid-cols-1 gap-3 rounded-xl border border-zimson-200/80 bg-zimson-50/30 p-3 sm:grid-cols-[1fr_minmax(0,7rem)_minmax(0,9rem)_auto] sm:items-end">
          <div className="min-w-0">
            <span className="text-xs font-medium text-stone-600">Service / repair charge</span>
            <input readOnly value="Labour / service charge" className={`${inputClass} cursor-default bg-stone-100`} />
          </div>
          <div className="min-w-0 w-full">
            <span className="text-xs font-medium text-stone-600">HSN / SAC</span>
            <input
              readOnly
              value={serviceSacHsn}
              className={`${inputClass} cursor-not-allowed bg-stone-100 font-mono text-xs`}
            />
            <p className="mt-0.5 text-[10px] text-stone-500">GST {serviceHsnGstRate}%</p>
          </div>
          <div className="min-w-0 w-full">
            <span className="text-xs font-medium text-stone-600">Amount (INR)</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={serviceChargeInr}
              onChange={(e) => handleServiceChargeChange(e.target.value)}
              className={inputClass}
              placeholder="0"
            />
            <p className="mt-0.5 text-[10px] text-stone-500">{storeServiceChargeMaxLabel(userRole)}</p>
          </div>
          <button
            type="button"
            onClick={() => onServiceChargeInrChange("")}
            className="w-full rounded-lg border border-stone-200 px-3 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50 sm:w-auto"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-3 rounded-xl border border-zimson-200/80 bg-zimson-50/40 p-3 sm:p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-600">Tax details (GST)</p>
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          {hasServiceCharge ? (
            <div className="min-w-0 sm:col-span-2">
              <p className="text-xs text-stone-600">
                Service / repair charge SAC:{" "}
                <span className="font-mono font-semibold">{serviceSacHsn}</span> (GST {serviceHsnGstRate}%)
              </p>
            </div>
          ) : null}
          {customerType === "B2C" ? (
            <div className="min-w-0">
              <label htmlFor="srf-bill-cust-state" className="text-xs font-medium text-stone-600">
                Customer state (place of supply)
              </label>
              <input
                id="srf-bill-cust-state"
                value={customerBillingState}
                onChange={(e) => onCustomerBillingStateChange(sanitizeTextInput(e.target.value, 48))}
                className={inputClass}
                placeholder="e.g. Tamil Nadu"
              />
              <p className="mt-1 text-[11px] text-stone-500">Leave blank to use store state (walk-in at counter)</p>
            </div>
          ) : (
            <div className="min-w-0">
              <span className="text-xs font-medium text-stone-600">Place of supply</span>
              <p className="mt-1 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-800">
                {customerGst.trim()
                  ? `From GSTIN (state ${customerGst.trim().slice(0, 2)})`
                  : "Customer GSTIN on file"}
              </p>
            </div>
          )}
        </div>
        {natureOfRepair && natureOfRepairBillingNote(natureOfRepair) ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
            {natureOfRepairBillingNote(natureOfRepair)}
          </p>
        ) : null}
        {taxPreview ? (
          <div className="rounded-lg border border-zimson-200 bg-white p-3 text-sm text-stone-800">
            <p className="font-semibold text-zimson-900">
              {taxPreview.isInterstate ? "Interstate supply — IGST" : "Intrastate supply — CGST + SGST"}
            </p>
            <p className="mt-1 text-xs text-stone-600">
              Seller: {stateCodeLabel(sellerStateCode)} · Customer: {stateCodeLabel(customerStateCode)}
              {!isNatureOfRepairTaxable(natureOfRepair) ? " · No tax (nature of repair)" : null}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
              <div>
                <dt className="text-stone-500">Taxable</dt>
                <dd className="font-semibold">₹{taxPreview.grossTaxable.toFixed(2)}</dd>
              </div>
              {taxPreview.isInterstate ? (
                <div>
                  <dt className="text-stone-500">IGST</dt>
                  <dd className="font-semibold">₹{taxPreview.igst.toFixed(2)}</dd>
                </div>
              ) : (
                <>
                  <div>
                    <dt className="text-stone-500">CGST</dt>
                    <dd className="font-semibold">₹{taxPreview.cgst.toFixed(2)}</dd>
                  </div>
                  <div>
                    <dt className="text-stone-500">SGST</dt>
                    <dd className="font-semibold">₹{taxPreview.sgst.toFixed(2)}</dd>
                  </div>
                </>
              )}
              <div>
                <dt className="text-stone-500">Total tax</dt>
                <dd className="font-semibold">₹{taxPreview.totalTax.toFixed(2)}</dd>
              </div>
            </dl>
            <div className="mt-3">
              <GstSummaryBlock
                taxPreview={taxPreview}
                pricesTaxInclusive={Boolean(serviceTaxSettings?.pricesTaxInclusive)}
                billSubtotalInr={billSubtotalInr}
                advanceInr={advanceInr}
                standardTotalInr={standardTotalInr}
              />
            </div>
          </div>
        ) : (
          <p className="text-xs text-stone-500">Add billable line items to see IGST / CGST / SGST breakdown.</p>
        )}
      </div>
    </Card>
  );
}
