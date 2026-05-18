/** Indian rupee display with ₹ prefix (en-IN grouping). */
export function formatInr(amount: number, fractionDigits = 2): string {
  const n = Number(amount ?? 0);
  const formatted = n.toLocaleString("en-IN", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  return `₹${formatted}`;
}
