/** Service warranty periods offered on the store tax invoice. */
export const SERVICE_WARRANTY_MONTHS = [3, 4, 6, 9, 12] as const;

export function isServiceWarrantyMonths(value: unknown): value is number {
  const n = Number(value);
  return Number.isInteger(n) && (SERVICE_WARRANTY_MONTHS as readonly number[]).includes(n);
}

export function parseServiceWarrantyMonths(value: unknown): number | null {
  return isServiceWarrantyMonths(value) ? Number(value) : null;
}

export function formatWarrantyMonthsLabel(months: number): string {
  return months === 1 ? "1 month" : `${months} months`;
}

export function addMonthsYmd(from: Date, months: number): string {
  const d = new Date(from.getFullYear(), from.getMonth() + months, from.getDate());
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatWarrantyTillDisplay(ymd: string | null | undefined): string {
  const raw = String(ymd ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  const [year, month, day] = raw.split("-");
  return `${day}/${month}/${year}`;
}

export function formatWarrantyInvoiceLine(months: number, tillYmd?: string | null): string {
  const label = formatWarrantyMonthsLabel(months);
  const till = formatWarrantyTillDisplay(tillYmd);
  return till ? `${label} (till ${till})` : label;
}
