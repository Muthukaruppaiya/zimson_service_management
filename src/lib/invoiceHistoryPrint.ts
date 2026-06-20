import type { SeedRegion } from "../data/seed";
import type { CustomerRecord } from "../types/customer";
import type { ServiceInvoiceViewModel } from "../types/serviceInvoice";
import type { ServiceTaxSettings } from "../types/serviceTaxSettings";
import type { ServiceInvoiceRecord } from "../types/serviceInvoiceRecord";
import type { SrfJob } from "../types/srfJob";
import type { SparePart } from "../types/spare";
import { seedStoreToInvoiceProfile } from "../types/storeInvoice";
import {
  buildInterHoRepairInvoiceViewModel,
  type InterHoBillingLine,
} from "./interHoBillingInvoice";
import { phoneLast10 } from "./customerLookup";
import { buildStoreBillingInvoiceFromClosedJob } from "./storeBillingAmounts";
import { normalizeStoreBillingSnapshot } from "./storeBillingSnapshot";

export function invoiceHistoryPdfFilename(invoiceNumber: string): string {
  const base = invoiceNumber.replace(/[^\w.-]+/g, "_") || "invoice";
  return `Zimson-Invoice-${base}.pdf`;
}

function usedSparesToBillingLines(usedSpares: unknown): InterHoBillingLine[] {
  if (!Array.isArray(usedSpares)) return [];
  return usedSpares
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;
      const l = raw as Record<string, unknown>;
      const name = String(l.name ?? "Spare").trim();
      const qty = Number(l.qty ?? 0);
      const rate = Number(l.unitPriceInr ?? l.unit_price_inr ?? 0);
      if (!name || qty <= 0 || rate <= 0) return null;
      return {
        description: name,
        qty: String(qty),
        rate: String(rate),
        spareId: typeof l.spareId === "string" ? l.spareId : typeof l.spare_id === "string" ? l.spare_id : undefined,
        gstPercent:
          l.gstPercent != null && Number.isFinite(Number(l.gstPercent))
            ? String(l.gstPercent)
            : l.gst_percent != null && Number.isFinite(Number(l.gst_percent))
              ? String(l.gst_percent)
              : undefined,
        hsn: typeof l.hsn === "string" ? l.hsn : undefined,
      };
    })
    .filter((l): l is InterHoBillingLine => l != null);
}

export type InvoiceHistoryPrintContext = {
  job: SrfJob | null;
  regions: SeedRegion[];
  spares: SparePart[];
  taxSettings: ServiceTaxSettings | null;
  customers: CustomerRecord[];
  generatedBy?: string | null;
};

export function buildInvoiceVmFromHistoryRecord(
  record: ServiceInvoiceRecord,
  ctx: InvoiceHistoryPrintContext,
): ServiceInvoiceViewModel | null {
  const defaultSacHsn = ctx.taxSettings?.defaultSacHsn?.trim() || "9987";
  const spareHsnLookup = (spareId: string) => ctx.spares.find((s) => s.id === spareId)?.hsn?.trim() || null;
  const spareGstLookup = (spareId: string) => ctx.spares.find((s) => s.id === spareId)?.gstPercent ?? null;
  const job = ctx.job ?? null;

  if (record.sourceType === "srf_store") {
    if (!job) return null;
    const store = ctx.regions.flatMap((r) => r.stores).find((s) => s.id === job.storeId);
    const customer =
      ctx.customers.find((c) => phoneLast10(c.phone) === phoneLast10(job.phone)) ?? null;
    const snapshot =
      normalizeStoreBillingSnapshot(record.snapshotJson) ??
      normalizeStoreBillingSnapshot(job.storeBillingSnapshot) ??
      null;
    return buildStoreBillingInvoiceFromClosedJob(job, {
      taxSettings: ctx.taxSettings,
      storeInvoice: seedStoreToInvoiceProfile(store),
      generatedBy: ctx.generatedBy ?? null,
      customer,
      defaultHsnSac: defaultSacHsn,
      spareHsnLookup,
      spareGstLookup,
      storeBillingSnapshot: snapshot,
      collectionAmountInr: record.totalInr,
      invoiceNumberOverride: record.invoiceNumber,
    });
  }

  if (record.sourceType === "inter_ho_repair") {
    const snap =
      record.snapshotJson && typeof record.snapshotJson === "object"
        ? (record.snapshotJson as Record<string, unknown>)
        : {};
    const lines = usedSparesToBillingLines(snap.usedSpares);
    if (lines.length === 0 && !job) return null;

    const repairRegionId = job?.regionId ?? record.regionId ?? "";
    const senderRegionId =
      job?.transferSourceRegionId ??
      (typeof snap.transferSourceRegionId === "string" ? snap.transferSourceRegionId : null) ??
      "";

    return buildInterHoRepairInvoiceViewModel({
      billRef: record.invoiceNumber,
      interHo: {
        reference: job?.reference ?? record.srfReference ?? record.rootSrfReference ?? record.invoiceNumber,
        watchBrand: job?.watchBrand ?? "—",
        watchModel: job?.watchModel ?? "—",
        serial: job?.serial ?? "—",
        complaint: job?.complaint ?? "",
        fromRegionId: repairRegionId,
        toRegionId: senderRegionId,
      },
      lines,
      billToName: record.customerName,
      repairRegion: ctx.regions.find((r) => r.id === repairRegionId),
      senderRegion: ctx.regions.find((r) => r.id === senderRegionId),
      taxSettings: ctx.taxSettings,
      defaultSacHsn,
      spareGstFallback: spareGstLookup,
      generatedBy: ctx.generatedBy ?? null,
      grandTotal: record.totalInr,
      edocIrn: record.edocIrn,
      edocAckNo: record.edocAckNo,
      edocQr: record.edocQr,
    });
  }

  return null;
}
