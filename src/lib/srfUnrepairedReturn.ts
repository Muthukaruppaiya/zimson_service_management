export const CANNOT_REPAIR_AT = ["store", "ho", "other_ho", "brand"] as const;
export type CannotRepairAt = (typeof CANNOT_REPAIR_AT)[number];

export const CANNOT_REPAIR_AT_OPTIONS: { value: CannotRepairAt; label: string }[] = [
  { value: "store", label: "Cannot repair at store" },
  { value: "ho", label: "Cannot repair at this HO" },
  { value: "other_ho", label: "Cannot repair at other HO" },
  { value: "brand", label: "Cannot repair at brand" },
];

export function isCannotRepairAt(value: string): value is CannotRepairAt {
  return (CANNOT_REPAIR_AT as readonly string[]).includes(value);
}

export function cannotRepairAtLabel(value: string | null | undefined): string {
  const hit = CANNOT_REPAIR_AT_OPTIONS.find((o) => o.value === value);
  return hit?.label ?? "Cannot repair";
}

/** Watch came back unrepaired — store must not raise a repair invoice. */
export function isUnrepairedReturnJob(job: {
  customerReestimateResponse?: "accepted" | "rejected" | null;
  hoReturnWithoutRepair?: boolean | null;
  brandReturnWithoutRepair?: boolean | null;
  interHoReturnWithoutRepair?: boolean | null;
}): boolean {
  return (
    job.customerReestimateResponse === "rejected" ||
    Boolean(job.hoReturnWithoutRepair) ||
    Boolean(job.brandReturnWithoutRepair) ||
    Boolean(job.interHoReturnWithoutRepair)
  );
}
