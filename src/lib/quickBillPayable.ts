import { applyInvoiceRoundOff, invoicePayableFromGstParts } from "./invoiceRoundOff";

/** Amount the customer must pay (collect at counter / payment splits). */
export function customerPayableInr(
  subtotalInr: number,
  totalTaxInr: number,
  pricesTaxInclusive: boolean,
  grossTaxableInr?: number,
): number {
  const sub = Math.round(subtotalInr * 100) / 100;
  const tax = Math.round(Math.max(0, totalTaxInr) * 100) / 100;
  if (grossTaxableInr != null && Number.isFinite(grossTaxableInr)) {
    return invoicePayableFromGstParts(grossTaxableInr, tax).netPayableInr;
  }
  if (pricesTaxInclusive) {
    return applyInvoiceRoundOff(sub).netPayableInr;
  }
  return invoicePayableFromGstParts(sub, tax).netPayableInr;
}
