import { SERVICE_INVOICE_BRANDING } from "../../config/serviceInvoiceBranding";
import type { QuickBillInvoice, QuickBillWarrantyStatus } from "../../types/quickBill";
import type { ServiceInvoiceViewModel } from "../../types/serviceInvoice";

export type ServiceInvoiceMappingOptions = {
  /** Default SAC/HSN for service line rows (from organisation tax settings). */
  defaultHsnSac?: string;
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
      return "Under warranty (effect on bill amount — policy to be finalised)";
    case "extended":
      return "Extended warranty (effect on bill amount — policy to be finalised)";
    default:
      return "Not specified";
  }
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
  notes: string;
  lines: { description: string; amount: number }[];
  total: number;
};

/** Same shell as a saved quick bill, for API-off demo completion. */
export function buildDemoServiceInvoiceViewModel(
  input: DemoInvoiceInput,
  options?: ServiceInvoiceMappingOptions,
): ServiceInvoiceViewModel {
  const hsnSac = resolvedHsnSac(options);
  const billName =
    input.customerType === "B2B" ? (input.company.trim() || "—") : input.customerName.trim() || "Walk-in / B2C";
  const serviceMeta: { label: string; value: string }[] = [
    { label: "Watch brand", value: input.watchBrand },
    { label: "Model", value: input.watchModel },
  ];
  if (input.watchRef.trim()) serviceMeta.push({ label: "Serial number", value: input.watchRef.trim() });
  if (input.watchRemark?.trim()) serviceMeta.push({ label: "Watch remark", value: input.watchRemark.trim() });
  serviceMeta.push({ label: "Warranty", value: warrantyLabel(input.warrantyStatus) });
  if (input.watchDocumentPath?.trim())
    serviceMeta.push({ label: "Document", value: input.watchDocumentPath.trim() });
  if (input.watchImagePath?.trim()) serviceMeta.push({ label: "Image", value: input.watchImagePath.trim() });
  if (input.technicianName) serviceMeta.push({ label: "Technician", value: input.technicianName });
  serviceMeta.push({ label: "Payment mode", value: input.paymentMode });
  serviceMeta.push({ label: "Mode", value: "Counter billing" });

  const lines = input.lines
    .map((l, i) => ({
      slNo: i + 1,
      description: l.description.trim(),
      hsnSac,
      amount: l.amount,
    }))
    .filter((l) => l.description);

  return {
    documentLabel: input.customerType === "B2B" ? "TAX INVOICE" : "BILL OF SUPPLY / TAX INVOICE",
    invoiceNumber: input.billNumber,
    invoiceDate: new Date().toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
    placeOfSupply: input.placeOfSupply || "—",
    reverseCharge: "No",
    seller: {
      legalName: SERVICE_INVOICE_BRANDING.sellerLegalName,
      addressLines: [...SERVICE_INVOICE_BRANDING.sellerAddressLines],
      gstin: SERVICE_INVOICE_BRANDING.sellerGstin,
      phone: SERVICE_INVOICE_BRANDING.sellerPhone,
      email: SERVICE_INVOICE_BRANDING.sellerEmail,
      stateCode: SERVICE_INVOICE_BRANDING.sellerStateCode,
    },
    billTo: {
      name: billName,
      gstin: input.customerType === "B2B" ? input.gst.trim() || null : null,
      pan: input.customerType === "B2B" ? input.pan.trim().toUpperCase() || null : null,
      phone: input.phone.trim() || null,
      email: input.email.trim() || null,
    },
    serviceMeta,
    lines,
    totalAmount: input.total,
    amountInWordsNote: "Amount in words: (to be generated dynamically from settings.)",
    paymentMode: input.paymentMode,
    bankDetailsLines: [...SERVICE_INVOICE_BRANDING.bankDetailsLines],
    notes: input.notes.trim() || undefined,
    footerTerms: [...SERVICE_INVOICE_BRANDING.footerTerms],
  };
}

export function mapQuickBillInvoiceToViewModel(
  inv: QuickBillInvoice,
  options?: ServiceInvoiceMappingOptions,
): ServiceInvoiceViewModel {
  const hsnSac = resolvedHsnSac(options);
  const placeParts = [inv.regionName, inv.storeName].filter(Boolean);
  const placeOfSupply = placeParts.length > 0 ? placeParts.join(" · ") : inv.regionId;
  const billName =
    inv.customerType === "B2B" ? (inv.company ?? "—") : inv.customerName?.trim() || "Walk-in / B2C";

  const serviceMeta: { label: string; value: string }[] = [
    { label: "Watch brand", value: inv.watchBrand },
    { label: "Model", value: inv.watchModel },
  ];
  if (inv.watchRef) serviceMeta.push({ label: "Serial number", value: inv.watchRef });
  if (inv.watchRemark?.trim()) serviceMeta.push({ label: "Watch remark", value: inv.watchRemark.trim() });
  serviceMeta.push({ label: "Warranty", value: warrantyLabel(inv.warrantyStatus) });
  if (inv.watchDocumentPath?.trim())
    serviceMeta.push({ label: "Document", value: inv.watchDocumentPath.trim() });
  if (inv.watchImagePath?.trim()) serviceMeta.push({ label: "Image", value: inv.watchImagePath.trim() });
  if (inv.technicianName) serviceMeta.push({ label: "Technician", value: inv.technicianName });
  serviceMeta.push({ label: "Payment mode", value: inv.paymentMode });

  return {
    documentLabel: inv.customerType === "B2B" ? "TAX INVOICE" : "BILL OF SUPPLY / TAX INVOICE",
    invoiceNumber: inv.billNumber,
    invoiceDate: new Date(inv.createdAt).toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
    placeOfSupply,
    reverseCharge: "No",
    seller: {
      legalName: SERVICE_INVOICE_BRANDING.sellerLegalName,
      addressLines: [...SERVICE_INVOICE_BRANDING.sellerAddressLines],
      gstin: SERVICE_INVOICE_BRANDING.sellerGstin,
      phone: SERVICE_INVOICE_BRANDING.sellerPhone,
      email: SERVICE_INVOICE_BRANDING.sellerEmail,
      stateCode: SERVICE_INVOICE_BRANDING.sellerStateCode,
    },
    billTo: {
      name: billName,
      gstin: inv.customerType === "B2B" ? inv.gst : null,
      pan: inv.customerType === "B2B" ? inv.pan : null,
      phone: inv.phone,
      email: inv.email,
    },
    serviceMeta,
    lines: inv.lines.map((ln) => ({
      slNo: ln.lineNo,
      description: ln.description,
      hsnSac,
      amount: ln.amountInr,
    })),
    totalAmount: inv.totalInr,
    amountInWordsNote: "Amount in words: (to be generated dynamically from settings.)",
    paymentMode: inv.paymentMode,
    bankDetailsLines: [...SERVICE_INVOICE_BRANDING.bankDetailsLines],
    notes: inv.notes?.trim() || undefined,
    footerTerms: [...SERVICE_INVOICE_BRANDING.footerTerms],
  };
}
