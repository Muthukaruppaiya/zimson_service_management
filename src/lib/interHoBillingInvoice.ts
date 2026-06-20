import { mapSrfPreviewToServiceInvoiceViewModel } from "../components/service/mapQuickBillToServiceInvoice";
import type { SeedRegion } from "../data/seed";
import type { ServiceInvoiceViewModel } from "../types/serviceInvoice";
import type { ServiceTaxSettings } from "../types/serviceTaxSettings";
import type { StoreInvoicePrintProfile } from "../types/storeInvoice";
import { formatRegionAddress } from "./transferDocumentKind";

export type InterHoBillingLine = {
  description: string;
  qty: string;
  rate: string;
  spareId?: string;
  gstPercent?: string;
  hsn?: string;
};

export type InterHoSrfInvoiceContext = {
  reference: string;
  watchBrand: string;
  watchModel: string;
  serial: string;
  complaint: string;
  fromRegionId: string;
  toRegionId: string;
};

function regionToInvoiceProfile(region: SeedRegion | undefined): StoreInvoicePrintProfile | null {
  if (!region) return null;
  const label = `${region.name} HO`;
  return {
    invoiceStoreDisplayName: label,
    invoiceStoreTagline: "",
    invoiceStoreAddress: formatRegionAddress(region),
    invoiceStorePhone: region.phone?.trim() || "",
    invoiceStoreEmail: region.email?.trim() || "",
    invoiceStoreGstin: region.gst?.trim() || "",
    invoiceLegalEntityName: label,
    invoiceTerms: "",
  };
}

export function interHoInvoicePdfFilename(invoiceRef: string): string {
  const base = invoiceRef.replace(/[^\w.-]+/g, "_") || "inter-ho-invoice";
  return `Zimson-Inter-HO-Invoice-${base}.pdf`;
}

export function buildInterHoRepairInvoiceViewModel(params: {
  billRef: string;
  interHo: InterHoSrfInvoiceContext;
  lines: InterHoBillingLine[];
  billToName: string;
  repairRegion?: SeedRegion;
  senderRegion?: SeedRegion;
  taxSettings: ServiceTaxSettings | null;
  defaultSacHsn: string;
  spareGstFallback?: (spareId: string) => number | null;
  generatedBy?: string | null;
  grandTotal: number;
  edocIrn?: string | null;
  edocAckNo?: string | null;
  edocQr?: string | null;
}): ServiceInvoiceViewModel {
  const billLines = params.lines
    .map((l) => {
      const q = Number.parseFloat(l.qty) || 0;
      const r = Number.parseFloat(l.rate) || 0;
      const amountInr = q * r;
      return {
        description: l.description.trim(),
        amountInr,
        spareId: l.spareId ?? null,
        hsnSac: l.hsn?.trim() || params.defaultSacHsn,
      };
    })
    .filter((l) => l.description && l.amountInr > 0);

  const estimateTotal = billLines.reduce((sum, line) => sum + line.amountInr, 0);

  return mapSrfPreviewToServiceInvoiceViewModel(
    {
      reference: params.interHo.reference,
      invoiceNumber: params.billRef,
      customerName: params.billToName,
      phone: params.senderRegion?.phone?.trim() || "-",
      email: params.senderRegion?.email?.trim() || "",
      gst: params.senderRegion?.gst?.trim() || undefined,
      pan: params.senderRegion?.pan?.trim() || undefined,
      address: params.senderRegion ? formatRegionAddress(params.senderRegion) : "",
      watchBrand: params.interHo.watchBrand,
      watchModel: params.interHo.watchModel,
      serial: params.interHo.serial,
      complaint: params.interHo.complaint,
      estimateTotalInr: estimateTotal,
      billLines,
      collectionAmountInr: params.grandTotal,
      collectionPaymentMode: "Inter-HO settlement",
      natureOfRepair: "Inter-HO repair",
    },
    {
      taxSettings: params.taxSettings,
      defaultHsnSac: params.defaultSacHsn,
      storeInvoice: regionToInvoiceProfile(params.repairRegion) ?? undefined,
      invoiceKind: "service_bill",
      customerType: "B2B",
      customerGstin: params.senderRegion?.gst?.trim() || undefined,
      customerBillingState: params.senderRegion ? formatRegionAddress(params.senderRegion) : undefined,
      spareGstLookup: (spareId) => {
        const line = params.lines.find((l) => l.spareId === spareId);
        if (line?.gstPercent?.trim()) {
          const n = Number.parseFloat(line.gstPercent);
          if (Number.isFinite(n)) return n;
        }
        return params.spareGstFallback?.(spareId) ?? null;
      },
      spareHsnLookup: (spareId) => {
        const line = params.lines.find((l) => l.spareId === spareId);
        return line?.hsn?.trim() || null;
      },
      invoiceNumber: params.billRef,
      generatedBy: params.generatedBy ?? null,
      edocIrn: params.edocIrn,
      edocAckNo: params.edocAckNo,
      edocQr: params.edocQr,
    },
  );
}
