/** Indian rupee display with ₹ prefix (en-IN grouping). */
export function formatInr(amount: number, fractionDigits = 2): string {
  const n = Number(amount ?? 0);
  const formatted = n.toLocaleString("en-IN", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  return `₹${formatted}`;
}

/** Column / field labels — service estimates are indicative only. */
export const ESTIMATE_LABEL_APPROX = "Estimate (approx.)";
export const ESTIMATE_AMOUNT_LABEL_APPROX = "Estimate amount (approx.)";

/** Display SRF / service estimate amounts with Approx. prefix. */
export function formatApproxEstimateInr(amount: number, fractionDigits = 2): string {
  return `Approx. ${formatInr(amount, fractionDigits)}`;
}

/** `Approx. INR 1,234.00` — for legacy INR-prefixed displays. */
export function formatApproxEstimateInrPlain(amount: number, fractionDigits = 2): string {
  const n = Number(amount ?? 0);
  const formatted = n.toLocaleString("en-IN", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  return `Approx. INR ${formatted}`;
}

/** Locale currency with Approx. prefix (tables using `style: "currency"`). */
export function formatApproxEstimateCurrency(
  amount: number,
  options?: Intl.NumberFormatOptions,
): string {
  const formatted = Number(amount ?? 0).toLocaleString(undefined, {
    style: "currency",
    currency: "INR",
    ...options,
  });
  return `Approx. ${formatted}`;
}
