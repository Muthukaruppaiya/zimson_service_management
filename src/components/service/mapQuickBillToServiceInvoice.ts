import { SERVICE_INVOICE_BRANDING } from "../../config/serviceInvoiceBranding";
import type { AdvancePaymentDetails, MultiPaymentDetails } from "../../lib/paymentModes";
import { paymentSplitsFromDetails } from "../../lib/paymentModes";
import { inrAmountToWords } from "../../lib/inrAmountToWords";
import { billableLineAmount, natureOfRepairLabel } from "../../lib/natureOfRepair";
import {
  formatPlaceOfSupplyLabel,
  resolveCustomerSupplyStateCode,
  resolveSellerStateCode,
} from "../../lib/gstSupply";
import { gstRateFromHsn } from "../../lib/hsnGst";
import { computeServiceBillGst } from "../../lib/serviceBillGst";
import type { QuickBillInvoice, QuickBillLineInvoice } from "../../types/quickBill";
import type {
  PaymentSplit,
  ServiceInvoiceLineView,
  ServiceInvoiceTaxRow,
  ServiceInvoiceViewModel,
} from "../../types/serviceInvoice";
import type { ServiceTaxSettings } from "../../types/serviceTaxSettings";
import type { StoreInvoicePrintProfile } from "../../types/storeInvoice";

export type ServiceInvoiceMappingOptions = {
  defaultHsnSac?: string;
  taxSettings?: ServiceTaxSettings | null;
  /** Per-store printed invoice header (Regions & stores); overrides org tax invoice fields when set. */
  storeInvoice?: StoreInvoicePrintProfile | null;
  invoiceKind?: "quick_bill" | "service_bill";
  /**
   * The specific QB or SRF reference to display as "Quick Bill No" / "SR No" on the invoice.
   * Distinct from invoiceNumber (which is the shared sequential store invoice number).
   */
  serviceReference?: string | null;
  /**
   * Pre-generated store invoice number (CHN0126-00001 style), common across QB and SRF
   * from the same store. Falls back to the bill's own number when not provided.
   */
  invoiceNumber?: string | null;
  generatedBy?: string | null;
  /** Customer billing state (name) for B2C place of supply when no GSTIN. */
  customerBillingState?: string | null;
  customerType?: "B2C" | "B2B";
  customerGstin?: string | null;
  spareHsnLookup?: (spareId: string) => string | null | undefined;
};

function resolvedHsnSac(options?: ServiceInvoiceMappingOptions): string {
  const v = options?.defaultHsnSac?.trim();
  return v || "9987";
}

function watchDetailMetaRows(source: {
  caseType?: string | null;
  strapChainType?: string | null;
  natureOfRepair?: string | null;
  chainCount?: string | null;
  customerRemarks?: string | null;
}): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  if (source.caseType?.trim()) rows.push({ label: "Case Type", value: source.caseType.trim() });
  if (source.strapChainType?.trim()) rows.push({ label: "Strap / Chain Type", value: source.strapChainType.trim() });
  if (source.natureOfRepair?.trim()) {
    rows.push({ label: "Nature of Repair", value: natureOfRepairLabel(source.natureOfRepair) });
  }
  if (source.chainCount?.trim()) rows.push({ label: "Chain Count", value: source.chainCount.trim() });
  if (source.customerRemarks?.trim()) rows.push({ label: "Customer Remarks", value: source.customerRemarks.trim() });
  return rows;
}

function parseSpareCodeFromDescription(description: string): string | null {
  const m = description.trim().match(/\(([^)]+)\)\s*$/);
  return m?.[1]?.trim() || null;
}

function mergeSellerFromSettings(
  tax: ServiceTaxSettings | null | undefined,
  store: StoreInvoicePrintProfile | null | undefined,
): {
  legalName: string;
  addressLines: string[];
  gstin: string;
  phone?: string;
  email?: string;
  stateCode?: string;
  tagline: string;
  logoUrl: string | null;
  legalFooter: string;
  footerTerms: string[];
} {
  const b = SERVICE_INVOICE_BRANDING;
  if (!tax && !store) {
    return {
      legalName: b.sellerLegalName,
      addressLines: [...b.sellerAddressLines],
      gstin: b.sellerGstin,
      phone: b.sellerPhone,
      email: b.sellerEmail,
      stateCode: b.sellerStateCode,
      tagline: "",
      logoUrl: null,
      legalFooter: b.sellerLegalName,
      footerTerms: [...b.footerTerms],
    };
  }
  const name =
    store?.invoiceStoreDisplayName?.trim() ||
    tax?.invoiceStoreDisplayName?.trim() ||
    b.sellerLegalName;
  const addrRaw =
    store?.invoiceStoreAddress?.trim() || tax?.invoiceStoreAddress?.trim();
  const addressLines = addrRaw
    ? addrRaw.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)
    : [...b.sellerAddressLines];
  const gstin =
    store?.invoiceStoreGstin?.trim() || tax?.invoiceStoreGstin?.trim() || b.sellerGstin;
  const phone =
    store?.invoiceStorePhone?.trim() || tax?.invoiceStorePhone?.trim() || b.sellerPhone;
  const email =
    store?.invoiceStoreEmail?.trim() || tax?.invoiceStoreEmail?.trim() || b.sellerEmail;
  const tagline =
    store?.invoiceStoreTagline?.trim() || tax?.invoiceStoreTagline?.trim() || "";
  const legalFooter =
    store?.invoiceLegalEntityName?.trim() ||
    tax?.invoiceLegalEntityName?.trim() ||
    name;
  const termsRaw =
    store?.invoiceTerms?.trim() || tax?.invoiceTerms?.trim();
  const footerTerms = termsRaw
    ? termsRaw.split(/\r?\n/).map((t) => t.trim()).filter(Boolean)
    : [...b.footerTerms];
  const logoUrl = tax?.appLogoUrl?.trim() || null;
  const stateCode = resolveSellerStateCode(gstin);
  return {
    legalName: name,
    addressLines,
    gstin,
    phone,
    email,
    stateCode,
    tagline,
    logoUrl,
    legalFooter,
    footerTerms,
  };
}

function lineHsnForInvoice(
  ln: QuickBillLineInvoice & { hsnSac?: string },
  defaultHsnSac: string,
  spareHsnLookup?: (spareId: string) => string | null | undefined,
): string {
  const preset = ln.hsnSac?.trim();
  if (preset) return preset;
  if (ln.spareId && spareHsnLookup) {
    const h = spareHsnLookup(ln.spareId)?.trim();
    if (h) return h;
  }
  return defaultHsnSac;
}

function buildGstLines(
  invLines: QuickBillLineInvoice[],
  defaultHsnSac: string,
  tax: ServiceTaxSettings | null | undefined,
  totalInr: number,
  natureOfRepair: string | null | undefined,
  sellerStateCode: string,
  customerStateCode: string,
  spareHsnLookup?: (spareId: string) => string | null | undefined,
): {
  lines: ServiceInvoiceLineView[];
  taxRows: ServiceInvoiceTaxRow[];
  gross: number;
  cgst: number;
  sgst: number;
  igst: number;
  tax: number;
  net: number;
  totalQty: number;
  isInterstate: boolean;
} {
  const configured = tax?.gstRatePercent ?? 18;
  const gstResult = computeServiceBillGst({
    lines: invLines.map((ln) => ({
      amountInr: billableLineAmount(natureOfRepair, ln.amountInr, ln.spareId),
      qty: ln.qty,
      spareId: ln.spareId,
      hsnSac: lineHsnForInvoice(ln, defaultHsnSac, spareHsnLookup),
    })),
    defaultHsnSac,
    spareHsnLookup,
    configuredGstPercent: configured,
    cgstRatePercent: tax?.cgstRatePercent ?? configured / 2,
    sgstRatePercent: tax?.sgstRatePercent ?? configured / 2,
    igstRatePercent: tax?.igstRatePercent ?? configured,
    pricesTaxInclusive: Boolean(tax?.pricesTaxInclusive),
    natureOfRepair,
    sellerStateCode,
    customerStateCode,
    billTotalInr: invLines.reduce(
      (s, ln) => s + billableLineAmount(natureOfRepair, ln.amountInr, ln.spareId),
      0,
    ),
  });

  const outLines: ServiceInvoiceLineView[] = [];
  let totalQty = 0;
  invLines.forEach((ln, i) => {
    const qty = Math.max(Number(ln.qty) || 1, 0.0001);
    const lineAmt = billableLineAmount(natureOfRepair, Number(ln.amountInr) || 0, ln.spareId);
    const hsn = lineHsnForInvoice(ln, defaultHsnSac, spareHsnLookup);
    const rate = gstRateFromHsn(hsn, configured);
    const g = rate / 100;
    let taxableLine = lineAmt;
    if (tax?.pricesTaxInclusive && g > 0) taxableLine = lineAmt / (1 + g);
    const unitTaxable = taxableLine / qty;
    totalQty += qty;
    outLines.push({
      slNo: ln.lineNo || i + 1,
      spareCode: parseSpareCodeFromDescription(ln.description),
      description: ln.description,
      hsnSac: hsn,
      unitPrice: Math.round(unitTaxable * 100) / 100,
      qty: Math.round(qty * 1000) / 1000,
      grossValue: Math.round(taxableLine * 100) / 100,
    });
  });

  return {
    lines: outLines,
    taxRows: gstResult.taxRows,
    gross: gstResult.grossTaxable,
    cgst: gstResult.cgst,
    sgst: gstResult.sgst,
    igst: gstResult.igst,
    tax: gstResult.totalTax,
    net: gstResult.netPayable,
    totalQty,
    isInterstate: gstResult.isInterstate,
  };
}

type GstSupplySource = {
  customerType?: "B2C" | "B2B";
  gst?: string | null;
  address?: string | null;
  city?: string | null;
};

function gstSupplyContext(
  options: ServiceInvoiceMappingOptions | undefined,
  sellerPack: ReturnType<typeof mergeSellerFromSettings>,
  inv?: GstSupplySource,
): { sellerStateCode: string; customerStateCode: string; placeOfSupply: string } {
  const sellerStateCode = resolveSellerStateCode(sellerPack.gstin);
  const billingStateName = options?.customerBillingState ?? null;
  const addressText = inv?.address ?? null;
  const cityText = inv?.city ?? null;
  const customerStateCode = resolveCustomerSupplyStateCode({
    customerType: options?.customerType ?? inv?.customerType ?? "B2C",
    customerGstin: options?.customerGstin ?? inv?.gst ?? null,
    billingStateName,
    addressText,
    cityText,
    sellerStateCode,
  });
  const placeOfSupply = formatPlaceOfSupplyLabel({
    customerStateCode,
    billingStateName,
    addressText,
    cityText,
  });
  return { sellerStateCode, customerStateCode, placeOfSupply };
}

export type DemoInvoiceInput = {
  billNumber: string;
  placeOfSupply: string;
  customerType: "B2C" | "B2B";
  customerName: string;
  company: string;
  phone: string;
  email: string;
  gst: string;
  pan: string;
  customerCode?: string;
  address?: string;
  watchBrand: string;
  watchFamily?: string;
  watchModel: string;
  watchRef: string;
  watchRemark?: string;
  caseType?: string;
  strapChainType?: string;
  natureOfRepair?: string;
  chainCount?: string;
  customerRemarks?: string;
  watchDocumentPath?: string | null;
  watchImagePath?: string | null;
  technicianName: string | null;
  paymentMode: string;
  paymentDetails?: AdvancePaymentDetails | null;
  notes: string;
  lines: { description: string; amount: number }[];
  total: number;
};


export function buildDemoServiceInvoiceViewModel(
  input: DemoInvoiceInput,
  options?: ServiceInvoiceMappingOptions,
): ServiceInvoiceViewModel {
  const hsnSac = resolvedHsnSac(options);
  const tax = options?.taxSettings ?? null;
  const sellerPack = mergeSellerFromSettings(tax, options?.storeInvoice ?? undefined);
  const billName =
    input.customerType === "B2B" ? (input.company.trim() || "—") : input.customerName.trim() || "Walk-in / B2C";
  const qbLines: QuickBillLineInvoice[] = input.lines
    .filter((l) => l.description.trim())
    .map((l, idx) => ({
      lineNo: idx + 1,
      description: l.description.trim(),
      amountInr: l.amount,
      spareId: null,
      qty: 1,
    }));
  const supply = gstSupplyContext(options, sellerPack, {
    customerType: input.customerType,
    gst: input.gst,
    address: input.address,
    city: undefined,
  });
  const gst = buildGstLines(
    qbLines,
    hsnSac,
    tax,
    input.total,
    input.natureOfRepair,
    supply.sellerStateCode,
    supply.customerStateCode,
    options?.spareHsnLookup,
  );
  const serviceMeta = watchDetailMetaRows(input);
  const kind = options?.invoiceKind === "service_bill" ? "Service bill" : "Quick Bill";
  // invoiceNumber = shared sequential store invoice number (common for QB + SRF)
  // serviceReference = QB-specific reference number
  const demoInvoiceNumber = options?.invoiceNumber?.trim() || input.billNumber;
  const demoServiceRef = options?.serviceReference?.trim() || input.billNumber;

  const now = new Date();
  const demoDate = `${now.getDate().toString().padStart(2, "0")}/${(now.getMonth() + 1).toString().padStart(2, "0")}/${now.getFullYear()}`;

  return {
    documentLabel: input.customerType === "B2B" ? "TAX INVOICE" : "BILL OF SUPPLY / TAX INVOICE",
    invoiceType: kind,
    invoiceNumber: demoInvoiceNumber,
    serviceReference: demoServiceRef,
    invoiceDate: demoDate,
    placeOfSupply: supply.placeOfSupply || input.placeOfSupply || "—",
    reverseCharge: "No",
    seller: {
      legalName: sellerPack.legalName,
      addressLines: sellerPack.addressLines,
      gstin: sellerPack.gstin,
      phone: sellerPack.phone,
      email: sellerPack.email,
      stateCode: sellerPack.stateCode,
    },
    sellerTagline: sellerPack.tagline || undefined,
    sellerLogoUrl: sellerPack.logoUrl,
    billTo: {
      name: billName,
      gstin: input.customerType === "B2B" ? input.gst.trim() || null : null,
      pan: input.customerType === "B2B" ? input.pan.trim().toUpperCase() || null : null,
      phone: input.phone.trim() || null,
      email: input.email.trim() || null,
      address: input.address?.trim() || null,
      customerCode: input.customerCode?.trim() || null,
    },
    serviceMeta,
    productBlock: {
      brandName: input.watchBrand,
      brandModel: [input.watchFamily?.trim(), input.watchModel].filter(Boolean).join(" · ") || input.watchModel,
      modelOrSerial: input.watchRef.trim() || "—",
      natureOfRepair:
        natureOfRepairLabel(input.natureOfRepair) ||
        input.natureOfRepair?.trim() ||
        "—",
    },
    lines: gst.lines,
    totalAmount: input.total,
    amountInWords: inrAmountToWords(input.total),
    paymentMode: input.paymentMode,
    bankDetailsLines: [],
    notes: input.notes.trim() || undefined,
    footerTerms: sellerPack.footerTerms,
    grossTaxableTotal: gst.gross,
    totalCgst: gst.cgst,
    totalSgst: gst.sgst,
    totalIgst: gst.igst,
    totalTax: gst.tax,
    netPayable: gst.net,
    totalQty: gst.totalQty,
    advanceAmount: 0,
    amountPaid: input.total,
    paymentRemarks: input.notes.trim() || undefined,
    taxBreakdownRows: gst.taxRows,
    generatedBy: options?.generatedBy ?? null,
    invoiceLegalFooter: sellerPack.legalFooter,
  };
}

/** Quick Bill–style payment block: advance, balance collection, invoice total (incl. GST). */
export function buildServiceInvoicePaymentSection(input: {
  advanceInr?: number;
  balanceCollectedInr: number;
  invoiceNetPayable: number;
  paymentMode?: string | null;
  paymentDetails?: AdvancePaymentDetails | MultiPaymentDetails | null;
}): {
  paymentMode?: string;
  paymentSplits?: PaymentSplit[];
  advanceAmount?: number;
  balanceCollectedInr?: number;
  amountPaid: number;
  netPayable: number;
  totalAmount: number;
  amountInWords: string;
} {
  const adv = Math.max(Number(input.advanceInr ?? 0), 0);
  const invoiceNet = input.invoiceNetPayable;
  const balance = Math.max(Number(input.balanceCollectedInr ?? 0), 0);
  const payMode = input.paymentMode?.trim() || undefined;
  const splitTotal = adv > 0 ? balance : invoiceNet;
  const splits = paymentSplitsFromDetails(payMode ?? "Cash", input.paymentDetails ?? undefined, splitTotal);
  const paymentSplits =
    splits.length > 0 && splits.some((s) => s.amountInr > 0) ? splits : undefined;

  return {
    paymentMode: payMode,
    paymentSplits,
    advanceAmount: adv > 0 ? adv : undefined,
    balanceCollectedInr: adv > 0 ? balance : invoiceNet,
    amountPaid: invoiceNet,
    netPayable: invoiceNet,
    totalAmount: invoiceNet,
    amountInWords: inrAmountToWords(invoiceNet),
  };
}

export function mapQuickBillInvoiceToViewModel(
  inv: QuickBillInvoice,
  options?: ServiceInvoiceMappingOptions,
): ServiceInvoiceViewModel {
  const hsnSac = resolvedHsnSac(options);
  const tax = options?.taxSettings ?? null;
  const sellerPack = mergeSellerFromSettings(tax, options?.storeInvoice ?? undefined);
  const billName =
    inv.customerType === "B2B" ? (inv.company ?? "—") : inv.customerName?.trim() || "Walk-in / B2C";

  const serviceMeta = watchDetailMetaRows(inv);

  const supply = gstSupplyContext(options, sellerPack, {
    customerType: inv.customerType,
    gst: inv.gst,
    address: inv.address,
    city: inv.city,
  });
  const gst = buildGstLines(
    inv.lines,
    hsnSac,
    tax,
    inv.totalInr,
    inv.natureOfRepair,
    supply.sellerStateCode,
    supply.customerStateCode,
    options?.spareHsnLookup,
  );
  const kind = options?.invoiceKind === "service_bill" ? "Service bill" : "Quick Bill";

  function fmtDate(dateStr: string): string {
    const d = new Date(dateStr);
    const dd = d.getDate().toString().padStart(2, "0");
    const mm = (d.getMonth() + 1).toString().padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  return {
    documentLabel: inv.customerType === "B2B" ? "TAX INVOICE" : "BILL OF SUPPLY / TAX INVOICE",
    invoiceType: kind,
    // invoiceNumber = formatted store invoice number (CHN0126-00001 style)
    // serviceReference = QB internal reference (QB26REG1012)
    invoiceNumber: inv.invoiceNumber,
    serviceReference: inv.billNumber,
    invoiceDate: fmtDate(inv.createdAt),
    placeOfSupply: supply.placeOfSupply,
    reverseCharge: "No",
    seller: {
      legalName: sellerPack.legalName,
      addressLines: sellerPack.addressLines,
      gstin: sellerPack.gstin,
      phone: sellerPack.phone,
      email: sellerPack.email,
      stateCode: sellerPack.stateCode,
    },
    sellerTagline: sellerPack.tagline || undefined,
    sellerLogoUrl: sellerPack.logoUrl,
    billTo: {
      name: billName,
      customerCode: inv.customerCode?.trim() || null,
      gstin: inv.customerType === "B2B" ? inv.gst : null,
      pan: inv.customerType === "B2B" ? inv.pan : null,
      phone: inv.phone,
      email: inv.email,
      address: inv.address?.trim() || null,
    },
    serviceMeta,
    productBlock: {
      brandName: inv.watchBrand,
      brandModel: [inv.watchFamily?.trim(), inv.watchModel].filter(Boolean).join(" · ") || inv.watchModel,
      modelOrSerial: inv.watchRef?.trim() || "—",
      natureOfRepair:
        natureOfRepairLabel(inv.natureOfRepair) ||
        inv.natureOfRepair?.trim() ||
        "—",
    },
    lines: gst.lines,
    ...buildServiceInvoicePaymentSection({
      advanceInr: 0,
      balanceCollectedInr: gst.net,
      invoiceNetPayable: gst.net,
      paymentMode: inv.paymentMode,
      paymentDetails: inv.paymentDetails ?? undefined,
    }),
    bankDetailsLines: [],
    notes: inv.notes?.trim() || undefined,
    footerTerms: sellerPack.footerTerms,
    grossTaxableTotal: gst.gross,
    totalCgst: gst.cgst,
    totalSgst: gst.sgst,
    totalIgst: gst.igst,
    totalTax: gst.tax,
    totalQty: gst.totalQty,
    paymentRemarks: inv.notes?.trim() || undefined,
    taxBreakdownRows: gst.taxRows,
    generatedBy: options?.generatedBy ?? null,
    invoiceLegalFooter: sellerPack.legalFooter,
  };
}

export type SrfServiceBillPreviewInput = {
  reference: string;
  /** Printed invoice number (store FY sequence); SR number stays in `reference`. */
  invoiceNumber?: string | null;
  customerName: string;
  phone: string;
  email?: string;
  gst?: string;
  pan?: string;
  address?: string;
  watchBrand: string;
  watchModel: string;
  serial: string;
  complaint: string;
  estimateTotalInr: number;
  advanceInr?: number;
  advancePaymentMode?: string | null;
  /** Line items for the tax invoice (same layout as quick bill). */
  billLines?: {
    description: string;
    amountInr: number;
    spareId?: string | null;
    hsnSac?: string | null;
  }[];
  /** Amount collected at store billing (balance due). */
  collectionAmountInr?: number;
  /** Raw payment mode at collection (UPI, Cash, …). */
  collectionPaymentMode?: string | null;
  collectionPaymentDetails?: MultiPaymentDetails | AdvancePaymentDetails | null;
  natureOfRepair?: string;
  customerCode?: string;
};

export function mapSrfPreviewToServiceInvoiceViewModel(
  input: SrfServiceBillPreviewInput,
  options?: ServiceInvoiceMappingOptions,
): ServiceInvoiceViewModel {
  const tax = options?.taxSettings ?? null;
  const sellerPack = mergeSellerFromSettings(tax, options?.storeInvoice ?? undefined);
  const hsnSac = resolvedHsnSac(options);
  const adv = Number(input.advanceInr ?? 0);
  const netBeforeCollection = Math.max(input.estimateTotalInr - adv, 0);
  const collected = Number(input.collectionAmountInr ?? netBeforeCollection);
  const net = Number.isFinite(collected) && collected >= 0 ? collected : netBeforeCollection;
  const rawLines =
    input.billLines?.filter((l) => l.description.trim() && Number.isFinite(l.amountInr) && l.amountInr > 0) ?? [];
  const qbLines: QuickBillLineInvoice[] =
    rawLines.length > 0
      ? rawLines.map((l, idx) => ({
          lineNo: idx + 1,
          description: l.description.trim(),
          amountInr: l.amountInr,
          spareId: l.spareId ?? null,
          qty: 1,
          hsnSac: l.hsnSac?.trim() || undefined,
        }))
      : [
          {
            lineNo: 1,
            description:
              adv > 0
                ? `Service / repair charges (balance after INR ${adv.toFixed(2)} advance)`
                : "Service / repair charges",
            amountInr: net,
            spareId: null,
            qty: 1,
          },
        ];
  const supply = gstSupplyContext(options, sellerPack, {
    customerType: input.gst?.trim() ? "B2B" : "B2C",
    gst: input.gst,
    address: input.address,
    city: undefined,
  });
  const gst = buildGstLines(
    qbLines,
    hsnSac,
    tax,
    net,
    input.natureOfRepair,
    supply.sellerStateCode,
    supply.customerStateCode,
    options?.spareHsnLookup,
  );
  const serviceMeta: { label: string; value: string }[] = [];
  if (input.complaint.trim()) serviceMeta.push({ label: "Complaint", value: input.complaint.trim() });
  if (adv > 0) {
    serviceMeta.push({
      label: "Advance collected",
      value: `INR ${adv.toFixed(2)} (${input.advancePaymentMode ?? "-"})`,
    });
  }
  const payMode = input.collectionPaymentMode?.trim() || undefined;
  const paymentFields = buildServiceInvoicePaymentSection({
    advanceInr: adv,
    balanceCollectedInr: net,
    invoiceNetPayable: gst.net,
    paymentMode: payMode,
    paymentDetails: input.collectionPaymentDetails ?? undefined,
  });

  const srfNow = new Date();
  const srfDate = `${srfNow.getDate().toString().padStart(2, "0")}/${(srfNow.getMonth() + 1).toString().padStart(2, "0")}/${srfNow.getFullYear()}`;

  return {
    documentLabel: "TAX INVOICE",
    invoiceType: "Service bill",
    // serviceReference = SRF-specific reference number
    serviceReference: input.reference,
    // invoiceNumber = shared sequential store invoice number (same sequence as QB invoices)
    invoiceNumber: options?.invoiceNumber?.trim() || (input.invoiceNumber ?? "").trim() || input.reference,
    invoiceDate: srfDate,
    placeOfSupply: supply.placeOfSupply,
    reverseCharge: "No",
    seller: {
      legalName: sellerPack.legalName,
      addressLines: sellerPack.addressLines,
      gstin: sellerPack.gstin,
      phone: sellerPack.phone,
      email: sellerPack.email,
      stateCode: sellerPack.stateCode,
    },
    sellerTagline: sellerPack.tagline || undefined,
    sellerLogoUrl: sellerPack.logoUrl,
    billTo: {
      name: input.customerName.trim() || "Customer",
      address: input.address?.trim() || null,
      gstin: input.gst?.trim() || null,
      pan: input.pan?.trim()?.toUpperCase() || null,
      phone: input.phone.trim() || null,
      email: input.email?.trim() || null,
      customerCode: input.customerCode?.trim() || null,
    },
    serviceMeta,
    productBlock: {
      brandName: input.watchBrand,
      brandModel: input.watchModel,
      modelOrSerial: input.serial.trim() || "—",
      natureOfRepair:
        natureOfRepairLabel(input.natureOfRepair) || input.natureOfRepair?.trim() || "Service completed",
    },
    lines: gst.lines,
    ...paymentFields,
    bankDetailsLines: [...SERVICE_INVOICE_BRANDING.bankDetailsLines],
    footerTerms: sellerPack.footerTerms,
    grossTaxableTotal: gst.gross,
    totalCgst: gst.cgst,
    totalSgst: gst.sgst,
    totalIgst: gst.igst,
    totalTax: gst.tax,
    totalQty: gst.totalQty,
    taxBreakdownRows: gst.taxRows,
    generatedBy: options?.generatedBy ?? null,
    invoiceLegalFooter: sellerPack.legalFooter,
  };
}
