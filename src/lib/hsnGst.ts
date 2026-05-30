/** Common HSN chapters → default GST % for service / watch retail (India). */
export const HSN_GST: Record<string, number> = {
  "9101": 18,
  "9102": 18,
  "9103": 18,
  "9104": 18,
  "9108": 18,
  "9109": 18,
  "9110": 18,
  "9111": 18,
  "9112": 18,
  "9113": 18,
  "9114": 18,
  "8506": 18,
  "8544": 18,
  "3402": 18,
  "5911": 12,
  "3824": 18,
  "8481": 18,
  "9987": 18,
  "9983": 18,
};

/** GST % from HSN/SAC code; falls back to `fallbackPercent` (default 18). */
/** Normalize catalogue HSN (often 6–8 digits) for lookup. */
export function normalizeHsnCode(hsn: string | null | undefined): string {
  return String(hsn ?? "")
    .trim()
    .replace(/\s/g, "");
}

export function gstRateFromHsn(
  hsn: string | null | undefined,
  fallbackPercent = 18,
): number {
  const h = normalizeHsnCode(hsn);
  if (!h) return fallbackPercent;
  for (const len of [8, 6, 4, 2] as const) {
    if (h.length >= len) {
      const key = h.slice(0, len);
      if (HSN_GST[key] != null) return HSN_GST[key]!;
    }
  }
  return fallbackPercent;
}
