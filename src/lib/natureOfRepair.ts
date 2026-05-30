/** Stored in DB (`nature_of_repair` on SRF / quick bill). */
export const NATURE_OF_REPAIR_VALUES = [
  "regular",
  "warranty_chargeable",
  "warranty_non_chargeable",
  "internal_service",
] as const;

export type NatureOfRepairValue = (typeof NATURE_OF_REPAIR_VALUES)[number];

export const NATURE_OF_REPAIR_OPTIONS: {
  value: NatureOfRepairValue;
  label: string;
  taxNote: string;
}[] = [
  { value: "regular", label: "Regular", taxNote: "Full charges + tax" },
  { value: "warranty_chargeable", label: "Warranty — chargeable", taxNote: "Full charges + tax" },
  {
    value: "warranty_non_chargeable",
    label: "Warranty — non chargeable",
    taxNote: "No charge (parts & labour)",
  },
  { value: "internal_service", label: "Internal service", taxNote: "Labour only (no spare charges)" },
];

const LABEL_BY_VALUE = new Map(NATURE_OF_REPAIR_OPTIONS.map((o) => [o.value, o.label]));
const VALUE_BY_LABEL = new Map(
  NATURE_OF_REPAIR_OPTIONS.map((o) => [o.label.toLowerCase(), o.value]),
);

export function natureOfRepairLabel(raw: string | null | undefined): string {
  const v = String(raw ?? "").trim();
  if (!v) return "";
  if (LABEL_BY_VALUE.has(v as NatureOfRepairValue)) {
    return LABEL_BY_VALUE.get(v as NatureOfRepairValue)!;
  }
  return v;
}

/** Normalize legacy free text or label to a known value when possible. */
export function normalizeNatureOfRepair(raw: string | null | undefined): string {
  const v = String(raw ?? "").trim();
  if (!v) return "";
  if (NATURE_OF_REPAIR_VALUES.includes(v as NatureOfRepairValue)) return v;
  const byLabel = VALUE_BY_LABEL.get(v.toLowerCase());
  if (byLabel) return byLabel;
  if (/internal/i.test(v)) return "internal_service";
  if (/warranty.*non|non.?charg/i.test(v)) return "warranty_non_chargeable";
  if (/warranty/i.test(v)) return "warranty_chargeable";
  if (/regular/i.test(v)) return "regular";
  return v;
}

/** Regular + warranty chargeable → GST on billable amounts; warranty non → none. */
export function isNatureOfRepairTaxable(raw: string | null | undefined): boolean {
  const norm = normalizeNatureOfRepair(raw);
  if (!norm) return true;
  return norm !== "warranty_non_chargeable";
}

export function effectiveGstRatePercent(
  natureOfRepair: string | null | undefined,
  configuredRate: number,
): number {
  return isNatureOfRepairTaxable(natureOfRepair) ? Math.max(0, configuredRate) : 0;
}

/**
 * Billable INR for a line: warranty non → 0; internal → 0 for spare lines only.
 */
export function billableLineAmount(
  natureOfRepair: string | null | undefined,
  amountInr: number,
  spareId: string | null | undefined,
): number {
  const amt = Math.max(0, Number(amountInr) || 0);
  const norm = normalizeNatureOfRepair(natureOfRepair);
  if (norm === "warranty_non_chargeable") return 0;
  if (spareId && norm === "internal_service") return 0;
  return amt;
}

/** Service / repair labour field on Quick Bill (not a spare line). */
export function billableServiceChargeInr(
  natureOfRepair: string | null | undefined,
  serviceChargeInr: number,
): number {
  return billableLineAmount(natureOfRepair, serviceChargeInr, null);
}

export function sumQuickBillBillableSubtotal(
  natureOfRepair: string | null | undefined,
  lines: { amountInr?: number; amount?: number; spareId?: string | null }[],
  serviceChargeInr = 0,
): number {
  let sum = 0;
  for (const l of lines) {
    const amt = Number(l.amountInr ?? l.amount ?? 0);
    sum += billableLineAmount(natureOfRepair, amt, l.spareId ?? null);
  }
  sum += billableServiceChargeInr(natureOfRepair, serviceChargeInr);
  return Math.round(sum * 100) / 100;
}

/** Zero-total bills allowed (warranty non-chargeable with parts on job card). */
export function allowsZeroBillTotal(natureOfRepair: string | null | undefined): boolean {
  const norm = normalizeNatureOfRepair(natureOfRepair);
  return norm === "warranty_non_chargeable" || norm === "internal_service";
}

export function natureOfRepairBillingNote(raw: string | null | undefined): string {
  const norm = normalizeNatureOfRepair(raw);
  if (norm === "warranty_non_chargeable") {
    return "Customer not charged — spare lines and service/labour are billed at ₹0.";
  }
  if (norm === "internal_service") {
    return "Spare/part lines are not charged; service/labour and other non-spare lines follow normal tax.";
  }
  return "";
}
