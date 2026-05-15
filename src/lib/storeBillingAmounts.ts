import { mapSrfPreviewToServiceInvoiceViewModel } from "../components/service/mapQuickBillToServiceInvoice";
import type { ServiceInvoiceViewModel } from "../types/serviceInvoice";
import type { ServiceTaxSettings } from "../types/serviceTaxSettings";
import type { StoreInvoicePrintProfile } from "../types/storeInvoice";
import type { SrfJob } from "../types/srfJob";

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
  const usedSparesAmount = sumUsedSparesInr(job);
  const isBrandRepair = Boolean(job.brandInvoiceAmountInr && job.brandInvoiceAmountInr > 0);
  const isInterHoReturn = !isBrandRepair && isInterHoReturnJob(job);
  const brandAmount = isBrandRepair ? Number(job.brandInvoiceAmountInr ?? 0) : 0;
  const serviceBaseAmount = isInterHoReturn ? resolveCustomerServiceBaseInr(job) : usedSparesAmount;
  const billableBaseAmount = isBrandRepair
    ? brandAmount
    : isInterHoReturn
      ? Math.max(serviceBaseAmount, usedSparesAmount)
      : usedSparesAmount;
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

  if (amounts.isInterHoReturn) {
    for (const spare of job.usedSpares ?? []) {
      const lineTotal = Number(spare.lineTotalInr ?? NaN);
      const qty = Number(spare.qty ?? 0);
      const unit = Number(spare.unitPriceInr ?? 0);
      const amt = Number.isFinite(lineTotal)
        ? lineTotal
        : (Number.isFinite(qty) ? qty : 0) * (Number.isFinite(unit) ? unit : 0);
      if (amt > 0) {
        lines.push({
          description: spare.qty > 1 ? `${spare.name} x ${spare.qty}` : spare.name,
          amountInr: amt,
        });
      }
    }
    const remainder = Math.max(amounts.serviceBaseAmount - amounts.usedSparesAmount, 0);
    if (remainder > 0.02) {
      lines.push({
        description: "Service / repair labour (per estimate)",
        amountInr: remainder,
      });
    }
    lines.push(...additionalCharges);
    return lines;
  }

  if (amounts.billableBaseAmount > 0) {
    lines.push({
      description: "Service repair / spares charges",
      amountInr: amounts.billableBaseAmount,
    });
  }
  lines.push(...additionalCharges);
  return lines;
}

/** Rebuild tax invoice view model for a closed SRF (history reprint / resend). */
export function buildStoreBillingInvoiceFromClosedJob(
  job: SrfJob,
  options: {
    taxSettings?: ServiceTaxSettings | null;
    storeInvoice?: StoreInvoicePrintProfile | null;
    generatedBy?: string | null;
  },
): ServiceInvoiceViewModel {
  const amounts = resolveStoreBillingAmounts(job);
  const advance = Number(job.advanceInr ?? 0);
  const collectionAmount = Math.max(amounts.billableBaseAmount - advance, 0);
  const billLines = buildStoreBillingInvoiceLines(job, amounts, []);
  return mapSrfPreviewToServiceInvoiceViewModel(
    {
      reference: job.reference,
      invoiceNumber: job.invoiceNumber ?? undefined,
      customerName: job.customerName,
      phone: job.phone,
      watchBrand: job.watchBrand,
      watchModel: job.watchModel,
      serial: job.serial,
      complaint: job.complaint || "",
      estimateTotalInr: amounts.billableBaseAmount,
      advanceInr: advance,
      advancePaymentMode: job.advancePaymentMode,
      billLines,
      collectionAmountInr: collectionAmount,
      collectionPaymentMode: job.advancePaymentMode,
      natureOfRepair: "Service completed",
    },
    {
      taxSettings: options.taxSettings,
      storeInvoice: options.storeInvoice,
      invoiceKind: "service_bill",
      generatedBy: options.generatedBy,
    },
  );
}
