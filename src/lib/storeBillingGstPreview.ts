import type { ServiceBillGstLine } from "./serviceBillGst";
import {
  buildStoreBillingInvoiceLines,
  type StoreBillingAmounts,
} from "./storeBillingAmounts";
import type { SrfJob } from "../types/srfJob";

export type StoreBillingAdditionalCharge = {
  description: string;
  amountInr: number;
  spareId?: string | null;
};

/** GST computation lines aligned with tax invoice line items. */
export function buildStoreBillingGstLines(
  job: SrfJob,
  amounts: StoreBillingAmounts,
  additionalCharges: StoreBillingAdditionalCharge[],
  defaultSacHsn: string,
): ServiceBillGstLine[] {
  const invoiceLines = buildStoreBillingInvoiceLines(job, amounts, additionalCharges);
  const spareIdByDesc = new Map<string, string>();
  for (const ac of additionalCharges) {
    if (ac.spareId && ac.description.trim()) {
      spareIdByDesc.set(ac.description.trim(), ac.spareId);
    }
  }
  return invoiceLines
    .filter((l) => Number.isFinite(l.amountInr) && l.amountInr > 0)
    .map((l) => ({
      amountInr: l.amountInr,
      spareId: spareIdByDesc.get(l.description.trim()) ?? null,
      hsnSac: defaultSacHsn,
    }));
}
