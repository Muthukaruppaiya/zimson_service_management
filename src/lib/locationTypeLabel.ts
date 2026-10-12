export function locationTypeLabel(locationType: string | null | undefined): string {
  const t = String(locationType ?? "");
  return t === "HO" ? "CSC" : t;
}
