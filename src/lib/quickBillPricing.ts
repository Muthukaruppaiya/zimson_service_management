import type { ServiceTaxSettings } from "../types/serviceTaxSettings";

/** Quick bill spare / service line amounts are counter MRP — GST is included in the entered price. */
export const QUICK_BILL_PRICES_TAX_INCLUSIVE = true;

export function taxSettingsForQuickBill(
  settings: ServiceTaxSettings | null | undefined,
): ServiceTaxSettings | null {
  if (!settings) return null;
  return { ...settings, pricesTaxInclusive: QUICK_BILL_PRICES_TAX_INCLUSIVE };
}
