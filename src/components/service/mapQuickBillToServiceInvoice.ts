import { SERVICE_INVOICE_BRANDING } from "../../config/serviceInvoiceBranding";
import {
  ADVANCE_CASH_DENOMS,
  type AdvanceCashDenominations,
  type AdvancePaymentDetails,
} from "../../lib/paymentModes";
import { inrAmountToWords } from "../../lib/inrAmountToWords";
import type { QuickBillInvoice, QuickBillLineInvoice, QuickBillWarrantyStatus } from "../../types/quickBill";
import type { ServiceInvoiceLineView, ServiceInvoiceTaxRow, ServiceInvoiceViewModel } from "../../types/serviceInvoice";
import type { ServiceTaxSettings } from "../../types/serviceTaxSettings";
import type { StoreInvoicePrintProfile } from "../../types/storeInvoice";

export type ServiceInvoiceMappingOptions = {
  defaultHsnSac?: string;
  taxSettings?: ServiceTaxSettings | null;
  /** Per-store printed invoice header (Regions & stores); overrides org tax invoice fields when set. */
  storeInvoice?: StoreInvoicePrintProfile | null;
  invoiceKind?: "quick_bill" | "service_bill";
  serviceReference?: string | null;
  generatedBy?: string | null;
};

function resolvedHsnSac(options?: ServiceInvoiceMappingOptions): string {
  const v = options?.defaultHsnSac?.trim();
  return v || "9987";
}

function warrantyLabel(status: QuickBillWarrantyStatus | undefined): string {
  switch (status) {
    case "none":
      return "No manufacturer warranty";
    case "under_warranty":
      return "Under warranty";
    case "extended":
      return "Extended warranty";
    default:
      return "Not specified";
  }
}

function cashBreakdownForMeta(c: AdvanceCashDenominations | undefined): string | null {
  if (!c) return null;
  const bits: string[] = [];
  for (const { key, face } of ADVANCE_CASH_DENOMS) {
    const qty = Number(c[key]);
    if (Number.isFinite(qty) && qty > 0) bits.push(`₹${face}×${qty}`);
  }
  const coins = Number(c.coinsInr);
  if (Number.isFinite(coins) && coins > 0) bits.push(`coins ₹${coins.toFixed(2)}`);
  return bits.length ? bits.join(", ") : null;
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
  return {
    legalName: name,
    addressLines,
    gstin,
    phone,
    email,
    stateCode: b.sellerStateCode,
    tagline,
    logoUrl,
    legalFooter,
    footerTerms,
  };
}

function buildGstLines(
  invLines: QuickBillLineInvoice[],
  hsnSac: string,
  gstRatePercent: number,
  pricesTaxInclusive: boolean,
  totalInr: number,
): { lines: ServiceInvoiceLineView[]; taxRows: ServiceInvoiceTaxRow[]; gross: number; cgst: number; sgst: number; tax: number; net: number; totalQty: number } {
  const g = Math.max(0, gstRatePercent) / 100;
  const outLines: ServiceInvoiceLineView[] = [];
  let sumTaxable = 0;
  let totalQty = 0;
  invLines.forEach((ln, i) => {
    const qty = Math.max(Number(ln.qty) || 1, 0.0001);
    const lineAmt = Number(ln.amountInr) || 0;
    let taxableLine: number;
    if (pricesTaxInclusive && g > 0) {
      taxableLine = lineAmt / (1 + g);
    } else {
      taxableLine = lineAmt;
    }
    const unitTaxable = taxableLine / qty;
    sumTaxable += taxableLine;
    totalQty += qty;
    outLines.push({
      slNo: ln.lineNo || i + 1,
      spareCode: parseSpareCodeFromDescription(ln.description),
      description: ln.description,
      hsnSac,
      unitPrice: Math.round(unitTaxable * 100) / 100,
      qty: Math.round(qty * 1000) / 1000,
      grossValue: Math.round(taxableLine * 100) / 100,
    });
  });
  sumTaxable = Math.round(sumTaxable * 100) / 100;
  let tax = g > 0 ? Math.round(sumTaxable * g * 100) / 100 : 0;
  let net = Math.round((sumTaxable + tax) * 100) / 100;
  const target = Math.round(totalInr * 100) / 100;
  if (Math.abs(net - target) > 0.02) {
    tax = Math.round((target - sumTaxable) * 100) / 100;
    net = target;
  }
  const cgst = Math.round((tax / 2) * 100) / 100;
  const sgst = Math.round((tax - cgst) * 100) / 100;
  const taxRows: ServiceInvoiceTaxRow[] =
    tax > 0
      ? [
          {
            description: `${gstRatePercent}% (CGST+SGST)`,
            taxable: sumTaxable,
            cgst,
            sgst,
            total: tax,
          },
        ]
      : [];
  return { lines: outLines, taxRows, gross: sumTaxable, cgst, sgst, tax, net, totalQty };
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
  watchBrand: string;
  watchModel: string;
  watchRef: string;
  watchRemark?: string;
  warrantyStatus?: QuickBillWarrantyStatus;
  watchDocumentPath?: string | null;
  watchImagePath?: string | null;
  technicianName: string | null;
  paymentMode: string;
  paymentDetails?: AdvancePaymentDetails | null;
  notes: string;
  lines: { description: string; amount: number }[];
  total: number;
};

function serviceMetaExtras(input: {
  watchDocumentPath?: string | null;
  watchImagePath?: string | null;
  technicianName: string | null;
  paymentMode: string;
  paymentDetails?: AdvancePaymentDetails | null;
}): { label: string; value: string }[] {
  const meta: { label: string; value: string }[] = [];
  if (input.watchDocumentPath?.trim()) meta.push({ label: "Document", value: input.watchDocumentPath.trim() });
  if (input.watchImagePath?.trim()) meta.push({ label: "Image", value: input.watchImagePath.trim() });
  if (input.technicianName) meta.push({ label: "Technician", value: input.technicianName });
  meta.push({ label: "Payment mode", value: input.paymentMode });
  if (input.paymentMode === "Cash") {
    const br = cashBreakdownForMeta(input.paymentDetails?.cash);
    if (br) meta.push({ label: "Cash breakdown", value: br });
  } else if (input.paymentDetails?.reference?.trim()) {
    meta.push({ label: "Payment reference", value: input.paymentDetails.reference.trim() });
  }
  return meta;
}

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
  const gst = buildGstLines(qbLines, hsnSac, tax?.gstRatePercent ?? 18, Boolean(tax?.pricesTaxInclusive), input.total);
  const serviceMeta = serviceMetaExtras({
    watchDocumentPath: input.watchDocumentPath,
    watchImagePath: input.watchImagePath,
    technicianName: input.technicianName,
    paymentMode: input.paymentMode,
    paymentDetails: input.paymentDetails,
  });
  const kind = options?.invoiceKind === "service_bill" ? "Service bill" : "Quick Bill";
  const serviceRef = options?.serviceReference?.trim() || input.billNumber;

  return {
    documentLabel: input.customerType === "B2B" ? "TAX INVOICE" : "BILL OF SUPPLY / TAX INVOICE",
    invoiceType: kind,
    serviceReference: serviceRef,
    invoiceNumber: input.billNumber,
    invoiceDate: new Date().toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
    placeOfSupply: input.placeOfSupply || "—",
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
    },
    serviceMeta,
    productBlock: {
      brandName: input.watchBrand,
      brandModel: input.watchModel,
      modelOrSerial: input.watchRef.trim() || "—",
      natureOfRepair: warrantyLabel(input.warrantyStatus),
    },
    lines: gst.lines,
    totalAmount: input.total,
    amountInWords: inrAmountToWords(input.total),
    paymentMode: input.paymentMode,
    bankDetailsLines: [...SERVICE_INVOICE_BRANDING.bankDetailsLines],
    notes: input.notes.trim() || undefined,
    footerTerms: sellerPack.footerTerms,
    grossTaxableTotal: gst.gross,
    totalCgst: gst.cgst,
    totalSgst: gst.sgst,
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

export function mapQuickBillInvoiceToViewModel(
  inv: QuickBillInvoice,
  options?: ServiceInvoiceMappingOptions,
): ServiceInvoiceViewModel {
  const hsnSac = resolvedHsnSac(options);
  const tax = options?.taxSettings ?? null;
  const sellerPack = mergeSellerFromSettings(tax, options?.storeInvoice ?? undefined);
  const placeParts = [inv.regionName, inv.storeName].filter(Boolean);
  const placeOfSupply = placeParts.length > 0 ? placeParts.join(" · ") : inv.regionId;
  const billName =
    inv.customerType === "B2B" ? (inv.company ?? "—") : inv.customerName?.trim() || "Walk-in / B2C";

  const serviceMeta: { label: string; value: string }[] = [];
  if (inv.watchDocumentPath?.trim()) serviceMeta.push({ label: "Document", value: inv.watchDocumentPath.trim() });
  if (inv.watchImagePath?.trim()) serviceMeta.push({ label: "Image", value: inv.watchImagePath.trim() });
  if (inv.technicianName) serviceMeta.push({ label: "Technician", value: inv.technicianName });
  serviceMeta.push({ label: "Payment mode", value: inv.paymentMode });
  if (inv.paymentMode === "Cash") {
    const br = cashBreakdownForMeta(inv.paymentDetails?.cash ?? undefined);
    if (br) serviceMeta.push({ label: "Cash breakdown", value: br });
  } else if (inv.paymentDetails?.reference?.trim()) {
    serviceMeta.push({ label: "Payment reference", value: inv.paymentDetails.reference.trim() });
  }

  const gst = buildGstLines(inv.lines, hsnSac, tax?.gstRatePercent ?? 18, Boolean(tax?.pricesTaxInclusive), inv.totalInr);
  const kind = options?.invoiceKind === "service_bill" ? "Service bill" : "Quick Bill";
  const serviceRef = options?.serviceReference?.trim() || inv.billNumber;

  return {
    documentLabel: inv.customerType === "B2B" ? "TAX INVOICE" : "BILL OF SUPPLY / TAX INVOICE",
    invoiceType: kind,
    serviceReference: serviceRef,
    invoiceNumber: inv.billNumber,
    invoiceDate: new Date(inv.createdAt).toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
    placeOfSupply,
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
      gstin: inv.customerType === "B2B" ? inv.gst : null,
      pan: inv.customerType === "B2B" ? inv.pan : null,
      phone: inv.phone,
      email: inv.email,
    },
    serviceMeta,
    productBlock: {
      brandName: inv.watchBrand,
      brandModel: inv.watchModel,
      modelOrSerial: inv.watchRef?.trim() || "—",
      natureOfRepair: warrantyLabel(inv.warrantyStatus),
    },
    lines: gst.lines,
    totalAmount: inv.totalInr,
    amountInWords: inrAmountToWords(inv.totalInr),
    paymentMode: inv.paymentMode,
    bankDetailsLines: [...SERVICE_INVOICE_BRANDING.bankDetailsLines],
    notes: inv.notes?.trim() || undefined,
    footerTerms: sellerPack.footerTerms,
    grossTaxableTotal: gst.gross,
    totalCgst: gst.cgst,
    totalSgst: gst.sgst,
    totalTax: gst.tax,
    netPayable: gst.net,
    totalQty: gst.totalQty,
    advanceAmount: 0,
    amountPaid: inv.totalInr,
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
};

export function mapSrfPreviewToServiceInvoiceViewModel(
  input: SrfServiceBillPreviewInput,
  options?: ServiceInvoiceMappingOptions,
): ServiceInvoiceViewModel {
  const tax = options?.taxSettings ?? null;
  const sellerPack = mergeSellerFromSettings(tax, options?.storeInvoice ?? undefined);
  const hsnSac = resolvedHsnSac(options);
  const adv = Number(input.advanceInr ?? 0);
  const net = Math.max(input.estimateTotalInr - adv, 0);
  const line: QuickBillLineInvoice = {
    lineNo: 1,
    description:
      adv > 0
        ? `Estimated service / repair (balance after INR ${adv.toFixed(2)} advance)`
        : "Estimated service / repair (provisional)",
    amountInr: net,
    spareId: null,
    qty: 1,
  };
  const gst = buildGstLines([line], hsnSac, tax?.gstRatePercent ?? 18, Boolean(tax?.pricesTaxInclusive), net);
  const serviceMeta: { label: string; value: string }[] = [];
  if (input.complaint.trim()) serviceMeta.push({ label: "Complaint", value: input.complaint.trim() });
  if (adv > 0) {
    serviceMeta.push({
      label: "Advance collected",
      value: `INR ${adv.toFixed(2)} (${input.advancePaymentMode ?? "-"})`,
    });
  }

  return {
    documentLabel: "TAX INVOICE / PROFORMA",
    invoiceType: "Service bill",
    serviceReference: input.reference,
    invoiceNumber: (input.invoiceNumber ?? "").trim() || input.reference,
    invoiceDate: new Date().toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
    placeOfSupply: "—",
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
    },
    serviceMeta,
    productBlock: {
      brandName: input.watchBrand,
      brandModel: input.watchModel,
      modelOrSerial: input.serial.trim() || "—",
      natureOfRepair: "Estimate (subject to assessment)",
    },
    lines: gst.lines,
    totalAmount: net,
    amountInWords: inrAmountToWords(net),
    paymentMode: input.advancePaymentMode ?? undefined,
    bankDetailsLines: [...SERVICE_INVOICE_BRANDING.bankDetailsLines],
    footerTerms: sellerPack.footerTerms,
    grossTaxableTotal: gst.gross,
    totalCgst: gst.cgst,
    totalSgst: gst.sgst,
    totalTax: gst.tax,
    netPayable: gst.net,
    totalQty: gst.totalQty,
    advanceAmount: adv,
    amountPaid: adv,
    taxBreakdownRows: gst.taxRows,
    generatedBy: options?.generatedBy ?? null,
    invoiceLegalFooter: sellerPack.legalFooter,
  };
}
