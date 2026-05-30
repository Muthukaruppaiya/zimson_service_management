/** Amount the customer must pay (collect at counter / payment splits). */
export function customerPayableInr(
  subtotalInr: number,
  totalTaxInr: number,
  pricesTaxInclusive: boolean,
): number {
  const sub = Math.round(subtotalInr * 100) / 100;
  if (pricesTaxInclusive) return sub;
  const tax = Math.round(Math.max(0, totalTaxInr) * 100) / 100;
  return Math.round((sub + tax) * 100) / 100;
}
