import { mapSrfPreviewToServiceInvoiceViewModel } from "../components/service/mapQuickBillToServiceInvoice";
import {
  billableServiceBaseInr,
  billableStoreLineAmount,
  billableUsedSparesInr,
} from "./natureOfRepairBilling";
import { normalizeNatureOfRepair } from "./natureOfRepair";
import { customerPayableInr } from "./quickBillPayable";
import { STORE_BILLING_PRICES_TAX_INCLUSIVE } from "./quickBillPricing";
import { resolveCustomerSupplyStateCode, resolveSellerStateCode } from "./gstSupply";
import { computeServiceBillGst } from "./serviceBillGst";
import { buildStoreBillingGstLines } from "./storeBillingGstPreview";
import type { CustomerRecord } from "../types/customer";
import { formatCustomerBillingAddress } from "./customerLookup";
import type { ServiceInvoiceViewModel } from "../types/serviceInvoice";
import type { ServiceTaxSettings } from "../types/serviceTaxSettings";
import type { StoreInvoicePrintProfile } from "../types/storeInvoice";
import type { SrfJob } from "../types/srfJob";
import type { InvoiceBillLine } from "./serviceBillEditorLines";
import { editorLinesToInvoiceBillLines } from "./serviceBillEditorLines";
import type { ServiceBillEditorLine } from "./serviceBillEditorLines";
import {
  normalizeStoreBillingSnapshot,
  snapshotInvoiceBillLines,
  type StoreBillingSnapshot,
  type StoreBillingSnapshotLine,
} from "./storeBillingSnapshot";

export type { StoreBillingSnapshot, StoreBillingSnapshotLine };

export function buildStoreBillingSnapshot(params: {
  job: SrfJob;
  useQuickBillStyleLines: boolean;
  billLines: ServiceBillEditorLine[];
  serviceChargeBillable: number;
  additionalCharges: { description: string; amountInr: number; spareId?: string | null }[];
  defaultSacHsn: string;
  billSubtotalInr: number;
  collectionAmountInr: number;
  collectionPaymentMode: string;
  paymentDetails?: import("./paymentModes").MultiPaymentDetails;
}): StoreBillingSnapshot {
  const invoiceLines: InvoiceBillLine[] = params.useQuickBillStyleLines
    ? editorLinesToInvoiceBillLines(
        params.billLines,
        params.job.natureOfRepair,
        params.serviceChargeBillable,
        params.defaultSacHsn,
      )
    : buildStoreBillingInvoiceLines(
        params.job,
        resolveStoreBillingAmounts(params.job),
        params.additionalCharges,
      ).map((l) => ({ ...l, spareId: null, hsnSac: params.defaultSacHsn }));
  return {
    billLines: invoiceLines,
    serviceChargeInr: params.serviceChargeBillable > 0 ? params.serviceChargeBillable : undefined,
    billSubtotalInr: params.billSubtotalInr,
    collectionAmountInr: params.collectionAmountInr,
    collectionPaymentMode: params.collectionPaymentMode,
    paymentDetails: params.paymentDetails,
    closedAt: new Date().toISOString(),
  };
}

export function sumUsedSparesInr(job: SrfJob): number {
  return Number(
    (job.usedSpares ?? []).reduce((sum, line) => {
      const lineTotal = Number(line.lineTotalInr ?? NaN);
      if (Number.isFinite(lineTotal)) return sum + lineTotal;
      const qty = Number(line.qty ?? 0);
      const unit = Number(line.unitPriceInr ?? 0);
      return sum + (Number.isFinite(qty) ? qty : 0) * (Number.isFinite(unit) ? unit : 0);
    }, 0),
  );
}

/** Watch returned from another HO after inter-HO repair (customer collects at originating store). */
export function isInterHoReturnJob(job: SrfJob): boolean {
  return Boolean(
    (job.transferSourceRegionId ?? "").trim() || (job.transferSourceReference ?? "").trim(),
  );
}

/** Customer-facing service total: accepted re-estimate or original booking estimate. */
export function resolveCustomerServiceBaseInr(job: SrfJob): number {
  if (job.customerReestimateResponse === "accepted") {
    const re = Number(job.reestimateRequestedInr ?? 0);
    if (Number.isFinite(re) && re > 0) return re;
  }
  const est = Number(job.estimateTotalInr ?? 0);
  return Number.isFinite(est) && est >= 0 ? est : 0;
}

export type StoreBillingAmounts = {
  isInterHoReturn: boolean;
  isBrandRepair: boolean;
  usedSparesAmount: number;
  serviceBaseAmount: number;
  billableBaseAmount: number;
};

export function resolveStoreBillingAmounts(job: SrfJob): StoreBillingAmounts {
  const usedSparesAmountRaw = sumUsedSparesInr(job);
  const usedSparesAmount = billableUsedSparesInr(job, usedSparesAmountRaw);
  const isBrandRepair = Boolean(job.brandInvoiceAmountInr && job.brandInvoiceAmountInr > 0);
  const isInterHoReturn = !isBrandRepair && isInterHoReturnJob(job);
  const brandAmount = isBrandRepair ? Number(job.brandInvoiceAmountInr ?? 0) : 0;
  const customerEstimateInr = resolveCustomerServiceBaseInr(job);
  /** Inter-HO return: estimate is reference only — bill repair-HO spares + entered labour/charges. */
  const serviceBaseRaw = isInterHoReturn ? customerEstimateInr : 0;
  const serviceBaseAmount = billableServiceBaseInr(job, serviceBaseRaw);
  let billableBaseAmount = isBrandRepair
    ? brandAmount
    : isInterHoReturn
      ? usedSparesAmount
      : usedSparesAmount;
  if (normalizeNatureOfRepair(job.natureOfRepair) === "warranty_non_chargeable" && !isBrandRepair) {
    billableBaseAmount = 0;
  }
  return {
    isInterHoReturn,
    isBrandRepair,
    usedSparesAmount,
    serviceBaseAmount,
    billableBaseAmount,
  };
}

/** Tax invoice lines — inter-HO uses spare lines + labour like repair-HO → sender-HO billing. */
export function buildStoreBillingInvoiceLines(
  job: SrfJob,
  amounts: StoreBillingAmounts,
  additionalCharges: { description: string; amountInr: number }[],
): { description: string; amountInr: number }[] {
  const lines: { description: string; amountInr: number }[] = [];

  if (amounts.isBrandRepair) {
    if (amounts.billableBaseAmount > 0) {
      lines.push({ description: "Brand repair invoice charges", amountInr: amounts.billableBaseAmount });
    }
    lines.push(...additionalCharges);
    return lines;
  }

  if (!amounts.isBrandRepair) {
    for (const spare of job.usedSpares ?? []) {
      const lineTotal = Number(spare.lineTotalInr ?? NaN);
      const qty = Number(spare.qty ?? 0);
      const unit = Number(spare.unitPriceInr ?? 0);
      const amtRaw = Number.isFinite(lineTotal)
        ? lineTotal
        : (Number.isFinite(qty) ? qty : 0) * (Number.isFinite(unit) ? unit : 0);
      const amt = billableStoreLineAmount(job.natureOfRepair, amtRaw, { isSpareLine: true });
      if (amt > 0) {
        lines.push({
          description: spare.qty > 1 ? `${spare.name} x ${spare.qty}` : spare.name,
          amountInr: amt,
        });
      }
    }
    lines.push(...additionalCharges);
    if (lines.length > 0) return lines;
  }

  if (amounts.billableBaseAmount > 0) {
    lines.push({
      description: amounts.isBrandRepair
        ? "Brand repair invoice charges"
        : "Service repair / spares charges",
      amountInr: amounts.billableBaseAmount,
    });
  }
  lines.push(...additionalCharges);
  return lines;
}

export type StoreBillingInvoiceBuildOptions = {
  taxSettings?: ServiceTaxSettings | null;
  storeInvoice?: StoreInvoicePrintProfile | null;
  generatedBy?: string | null;
  /** Customer master row (email, GST, address, code). */
  customer?: CustomerRecord | null;
  defaultHsnSac?: string;
  spareHsnLookup?: (spareId: string) => string | null | undefined;
  spareGstLookup?: (spareId: string) => number | null | undefined;
  additionalCharges?: { description: string; amountInr: number }[];
  /** Balance collected at billing (overrides computed standard total). */
  collectionAmountInr?: number;
  collectionPaymentMode?: string | null;
  /** Saved when the store closed billing (includes labour / service charge lines). */
  storeBillingSnapshot?: StoreBillingSnapshot | null;
  /** Override printed invoice number (e.g. from invoice history register). */
  invoiceNumberOverride?: string | null;
  edocIrn?: string | null;
  edocAckNo?: string | null;
  edocQr?: string | null;
};

function resolveBillingCustomerFields(
  job: SrfJob,
  customer: CustomerRecord | null | undefined,
): {
  customerName: string;
  email?: string;
  gst?: string;
  pan?: string;
  address?: string;
  customerKind: "B2C" | "B2B";
  customerGstin: string | null;
  customerBillingState: string | null;
  customerCode: string | null;
} {
  const kind = customer?.customerKind ?? job.customerKind ?? "B2C";
  const name =
    kind === "B2B"
      ? (customer?.company?.trim() || job.company?.trim() || job.customerName)
      : job.customerName;
  return {
    customerName: name.trim() || "Customer",
    email: customer?.email?.trim() || undefined,
    gst: customer?.gst?.trim() || undefined,
    pan: customer?.pan?.trim() || undefined,
    address: formatCustomerBillingAddress(customer ?? null) || undefined,
    customerKind: kind,
    customerGstin: customer?.gst?.trim().toUpperCase() || null,
    customerBillingState:
      customer?.billingAddress?.state?.trim() || customer?.city?.trim() || null,
    customerCode: customer?.customerCode?.trim() || null,
  };
}

function resolveEdocForInvoice(
  job: SrfJob,
  options: StoreBillingInvoiceBuildOptions,
): { edocIrn?: string | null; edocAckNo?: string | null; edocQr?: string | null } {
  return {
    edocIrn: options.edocIrn?.trim() || job.edocIrn?.trim() || null,
    edocAckNo: options.edocAckNo?.trim() || job.edocAckNo?.trim() || null,
    edocQr: options.edocQr?.trim() || job.edocQr?.trim() || null,
  };
}

/** Rebuild tax invoice view model for a closed SRF (history reprint / resend). */
export function buildStoreBillingInvoiceFromClosedJob(
  job: SrfJob,
  options: StoreBillingInvoiceBuildOptions = {},
): ServiceInvoiceViewModel {
  const advance = Number(job.advanceInr ?? 0);
  const edoc = resolveEdocForInvoice(job, options);
  const snapshot =
    options.storeBillingSnapshot ??
    normalizeStoreBillingSnapshot(job.storeBillingSnapshot) ??
    null;

  if (snapshot) {
    const invoiceLines = snapshotInvoiceBillLines(snapshot);
    const billSubtotal =
      snapshot.billSubtotalInr ??
      invoiceLines.reduce((s, l) => s + l.amountInr, 0);
    const hsnSac = options.defaultHsnSac?.trim() || options.taxSettings?.defaultSacHsn?.trim() || "9987";
    const gstLines = invoiceLines.map((l) => ({
      amountInr: l.amountInr,
      spareId: l.spareId ?? null,
      hsnSac: l.hsnSac?.trim() || hsnSac,
    }));
    const taxPreview = computeStoreBillingTaxPreview(job, options, gstLines, billSubtotal);
    const pricesTaxInclusive = STORE_BILLING_PRICES_TAX_INCLUSIVE;
    const invoiceTotalInr = customerPayableInr(
      billSubtotal,
      taxPreview?.totalTax ?? 0,
      pricesTaxInclusive,
    );
    const standardDue = Math.max(Math.round((invoiceTotalInr - advance) * 100) / 100, 0);
    const collectionAmount =
      snapshot.collectionAmountInr != null && Number.isFinite(snapshot.collectionAmountInr)
        ? Math.max(snapshot.collectionAmountInr, 0)
        : options.collectionAmountInr != null && Number.isFinite(options.collectionAmountInr)
          ? Math.max(options.collectionAmountInr, 0)
          : standardDue;
    const cust = resolveBillingCustomerFields(job, options.customer);
    const invoiceNumber =
      options.invoiceNumberOverride?.trim() || job.invoiceNumber?.trim() || undefined;
    return mapSrfPreviewToServiceInvoiceViewModel(
      {
        reference: job.reference,
        invoiceNumber,
        customerName: cust.customerName,
        phone: job.phone,
        email: cust.email,
        gst: cust.gst,
        pan: cust.pan,
        address: cust.address,
        customerCode: cust.customerCode ?? undefined,
        watchBrand: job.watchBrand,
        watchModel: job.watchModel,
        serial: job.serial,
        complaint: job.complaint || "",
        estimateTotalInr: billSubtotal,
        advanceInr: advance,
        advancePaymentMode: job.advancePaymentMode,
        billLines: invoiceLines,
        collectionAmountInr: collectionAmount,
        collectionPaymentMode: snapshot.collectionPaymentMode?.trim() || undefined,
        collectionPaymentDetails:
          (snapshot.paymentDetails as import("./paymentModes").MultiPaymentDetails | undefined) ??
          undefined,
        natureOfRepair: job.natureOfRepair?.trim() || "Service completed",
      },
      {
        taxSettings: options.taxSettings,
        defaultHsnSac: hsnSac,
        storeInvoice: options.storeInvoice,
        invoiceKind: "service_bill",
        customerType: cust.customerKind,
        customerGstin: cust.customerGstin,
        customerBillingState: cust.customerBillingState,
        spareHsnLookup: options.spareHsnLookup,
        spareGstLookup: options.spareGstLookup,
        generatedBy: options.generatedBy,
        invoiceNumber,
        edocIrn: edoc.edocIrn,
        edocAckNo: edoc.edocAckNo,
        edocQr: edoc.edocQr,
      },
    );
  }

  const amounts = resolveStoreBillingAmounts(job);
  const additionalCharges = options.additionalCharges ?? [];
  const billLines = buildStoreBillingInvoiceLines(job, amounts, additionalCharges);
  const billSubtotal =
    amounts.billableBaseAmount +
    additionalCharges.reduce((s, c) => s + (Number.isFinite(c.amountInr) ? c.amountInr : 0), 0);
  const hsnSac = options.defaultHsnSac?.trim() || options.taxSettings?.defaultSacHsn?.trim() || "9987";
  const gstLines = buildStoreBillingGstLines(job, amounts, additionalCharges, hsnSac);
  const taxPreview =
    gstLines.length > 0
      ? computeStoreBillingTaxPreview(job, options, gstLines, billSubtotal)
      : null;
  const pricesTaxInclusive = STORE_BILLING_PRICES_TAX_INCLUSIVE;
  const invoiceTotalInr = customerPayableInr(
    billSubtotal,
    taxPreview?.totalTax ?? 0,
    pricesTaxInclusive,
  );
  const standardDue = Math.max(Math.round((invoiceTotalInr - advance) * 100) / 100, 0);
  const collectionAmount =
    options.collectionAmountInr != null && Number.isFinite(options.collectionAmountInr)
      ? Math.max(options.collectionAmountInr, 0)
      : standardDue;
  const cust = resolveBillingCustomerFields(job, options.customer);
  const invoiceNumber =
    options.invoiceNumberOverride?.trim() || job.invoiceNumber?.trim() || undefined;

  return mapSrfPreviewToServiceInvoiceViewModel(
    {
      reference: job.reference,
      invoiceNumber,
      customerName: cust.customerName,
      phone: job.phone,
      email: cust.email,
      gst: cust.gst,
      pan: cust.pan,
      address: cust.address,
      customerCode: cust.customerCode ?? undefined,
      watchBrand: job.watchBrand,
      watchModel: job.watchModel,
      serial: job.serial,
      complaint: job.complaint || "",
      estimateTotalInr: billSubtotal,
      advanceInr: advance,
      advancePaymentMode: job.advancePaymentMode,
      billLines,
      collectionAmountInr: collectionAmount,
      collectionPaymentMode: options.collectionPaymentMode?.trim() || undefined,
      natureOfRepair: job.natureOfRepair?.trim() || "Service completed",
    },
    {
      taxSettings: options.taxSettings,
      defaultHsnSac: hsnSac,
      storeInvoice: options.storeInvoice,
      invoiceKind: "service_bill",
      customerType: cust.customerKind,
      customerGstin: cust.customerGstin,
      customerBillingState: cust.customerBillingState,
      spareHsnLookup: options.spareHsnLookup,
      spareGstLookup: options.spareGstLookup,
      generatedBy: options.generatedBy,
      invoiceNumber,
      edocIrn: edoc.edocIrn,
      edocAckNo: edoc.edocAckNo,
      edocQr: edoc.edocQr,
    },
  );
}

function computeStoreBillingTaxPreview(
  job: SrfJob,
  options: StoreBillingInvoiceBuildOptions,
  gstLines: ReturnType<typeof buildStoreBillingGstLines>,
  billSubtotal: number,
) {
  const tax = options.taxSettings;
  const storeGstin =
    options.storeInvoice?.invoiceStoreGstin?.trim() ||
    tax?.invoiceStoreGstin?.trim() ||
    "";
  const sellerState = resolveSellerStateCode(storeGstin);
  const cust = resolveBillingCustomerFields(job, options.customer);
  const customerState = resolveCustomerSupplyStateCode({
    customerType: cust.customerKind,
    customerGstin: cust.customerGstin,
    billingStateName: cust.customerBillingState,
    addressText: cust.address ?? null,
    cityText: options.customer?.city ?? null,
    sellerStateCode: sellerState,
  });
  return computeServiceBillGst({
    lines: gstLines,
    defaultHsnSac: options.defaultHsnSac?.trim() || tax?.defaultSacHsn?.trim() || "9987",
    spareHsnLookup: options.spareHsnLookup,
    spareGstLookup: options.spareGstLookup,
    defaultSacGstPercent: tax?.gstRatePercent ?? 18,
    pricesTaxInclusive: STORE_BILLING_PRICES_TAX_INCLUSIVE,
    natureOfRepair: job.natureOfRepair,
    sellerStateCode: sellerState,
    customerStateCode: customerState,
    billTotalInr: billSubtotal,
  });
}
