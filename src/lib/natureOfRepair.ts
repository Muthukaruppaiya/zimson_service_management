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
  { value: "regular", label: "Regular", taxNote: "Tax included" },
  { value: "warranty_chargeable", label: "Warranty — chargeable", taxNote: "Tax included" },
  { value: "warranty_non_chargeable", label: "Warranty — non chargeable", taxNote: "No tax" },
  { value: "internal_service", label: "Internal service", taxNote: "No tax" },
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

/** Regular + warranty chargeable → GST applied; warranty non-chargeable + internal → no tax. */
export function isNatureOfRepairTaxable(raw: string | null | undefined): boolean {
  const norm = normalizeNatureOfRepair(raw);
  if (!norm) return true;
  if (norm === "warranty_non_chargeable" || norm === "internal_service") return false;
  if (norm === "regular" || norm === "warranty_chargeable") return true;
  if (/internal/i.test(norm)) return false;
  if (/non.?charg|no tax/i.test(norm)) return false;
  return true;
}

export function effectiveGstRatePercent(
  natureOfRepair: string | null | undefined,
  configuredRate: number,
): number {
  return isNatureOfRepairTaxable(natureOfRepair) ? Math.max(0, configuredRate) : 0;
}
