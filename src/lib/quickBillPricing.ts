import type { ServiceTaxSettings } from "../types/serviceTaxSettings";

/** Counter / MRP line amounts include GST (Quick Bill + SRF store billing). */
export const COUNTER_PRICES_TAX_INCLUSIVE = true;

/** @deprecated Use COUNTER_PRICES_TAX_INCLUSIVE */
export const QUICK_BILL_PRICES_TAX_INCLUSIVE = COUNTER_PRICES_TAX_INCLUSIVE;

export const STORE_BILLING_PRICES_TAX_INCLUSIVE = COUNTER_PRICES_TAX_INCLUSIVE;

export function taxSettingsForCounterBilling(
  settings: ServiceTaxSettings | null | undefined,
): ServiceTaxSettings | null {
  if (!settings) return null;
  return { ...settings, pricesTaxInclusive: COUNTER_PRICES_TAX_INCLUSIVE };
}

export function taxSettingsForQuickBill(
  settings: ServiceTaxSettings | null | undefined,
): ServiceTaxSettings | null {
  return taxSettingsForCounterBilling(settings);
}

export function taxSettingsForStoreBilling(
  settings: ServiceTaxSettings | null | undefined,
): ServiceTaxSettings | null {
  return taxSettingsForCounterBilling(settings);
}
