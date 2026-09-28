import { applyInvoiceRoundOff, invoicePayableFromGstParts } from "./invoiceRoundOff";

/** Amount the customer must pay (collect at counter / payment splits). */
export function customerPayableInr(
  subtotalInr: number,
  totalTaxInr: number,
  pricesTaxInclusive: boolean,
  grossTaxableInr?: number,
  tcsInr = 0,
): number {
  const sub = Math.round(subtotalInr * 100) / 100;
  const tax = Math.round(Math.max(0, totalTaxInr) * 100) / 100;
  const tcs = Math.round(Math.max(0, tcsInr) * 100) / 100;
  if (grossTaxableInr != null && Number.isFinite(grossTaxableInr)) {
    return invoicePayableFromGstParts(grossTaxableInr, tax, tcs).netPayableInr;
  }
  if (pricesTaxInclusive) {
    return applyInvoiceRoundOff(sub + tcs).netPayableInr;
  }
  return invoicePayableFromGstParts(sub, tax, tcs).netPayableInr;
}
