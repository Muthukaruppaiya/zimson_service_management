export const PURCHASE_RETURN_REASONS = [
  { value: "DEFECTIVE", label: "Defective / damaged" },
  { value: "EXCESS", label: "Excess supply" },
  { value: "WRONG_PART", label: "Wrong part" },
  { value: "QUALITY", label: "Quality rejection" },
  { value: "OTHER", label: "Other" },
] as const;

export type PurchaseReturnReason = (typeof PURCHASE_RETURN_REASONS)[number]["value"];

export function purchaseReturnReasonLabel(value: string): string {
  return PURCHASE_RETURN_REASONS.find((r) => r.value === value)?.label ?? value;
}
