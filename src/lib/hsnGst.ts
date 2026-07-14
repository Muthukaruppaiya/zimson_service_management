/** Default GST % when HSN is missing or not in the master (India standard slab). */
export const DEFAULT_HSN_GST_PERCENT = 18;

/**
 * Built-in HSN/SAC prefix → GST % (India). Longest prefix wins at lookup time.
 * Billing never uses a manually entered GST % — only HSN/SAC drives the rate.
 */
export const BUILTIN_HSN_GST: Record<string, number> = {
  // Watches & parts (Ch. 91) — 18%
  "910111": 18,
  "910119": 18,
  "910121": 18,
  "910129": 18,
  "910191": 18,
  "910199": 18,
  "910211": 18,
  "910212": 18,
  "910219": 18,
  "910221": 18,
  "910229": 18,
  "910291": 18,
  "910299": 18,
  "910310": 18,
  "910390": 18,
  "910400": 18,
  "910511": 18,
  "910519": 18,
  "910521": 18,
  "910529": 18,
  "910591": 18,
  "910599": 18,
  "910610": 18,
  "910690": 18,
  "910700": 18,
  "910811": 18,
  "910812": 18,
  "910819": 18,
  "910820": 18,
  "910890": 18,
  "910910": 18,
  "911011": 18,
  "911012": 18,
  "911019": 18,
  "911090": 18,
  "911110": 18,
  "911120": 18,
  "911180": 18,
  "911190": 18,
  "911220": 18,
  "911290": 18,
  "911310": 18,
  "911320": 18,
  "911390": 18,
  "911430": 18,
  "911440": 18,
  "911490": 18,
  "9101": 18,
  "9102": 18,
  "9103": 18,
  "9104": 18,
  "9105": 18,
  "9106": 18,
  "9107": 18,
  "9108": 18,
  "9109": 18,
  "9110": 18,
  "9111": 18,
  "9112": 18,
  "9113": 18,
  "9114": 18,
  // Jewellery (Ch. 71) — common slabs
  "7113": 3,
  "7114": 3,
  "7115": 3,
  "7116": 3,
  "7117": 3,
  "7118": 3,
  "7101": 0.25,
  "7102": 0.25,
  "7106": 3,
  "7108": 3,
  // Electrical / batteries
  "8506": 18,
  "8507": 18,
  "8544": 18,
  "8548": 18,
  // Chemicals / consumables
  "3402": 18,
  "3403": 18,
  "3824": 18,
  // Textile / straps — 12%
  "5903": 12,
  "5911": 12,
  "5806": 12,
  "5807": 12,
  // Valves / precision parts
  "8481": 18,
  "8483": 18,
  // Services (SAC)
  "9987": 18,
  "998714": 18,
  "9983": 18,
  "998313": 18,
  "998314": 18,
  "998331": 18,
  "998332": 18,
  "998381": 18,
  "998382": 18,
  "998383": 18,
  "998384": 18,
  "998385": 18,
  "998386": 18,
  "998387": 18,
  "998388": 18,
  "998389": 18,
  "998399": 18,
  /** Maintenance / repair services (SAC) — 12% */
  "998346": 12,
  "9954": 18,
  // 5% slab (selected chapters — e.g. some agro / specified goods)
  "0401": 5,
  "0402": 5,
  "0403": 5,
  "0405": 5,
  "0406": 5,
  "1001": 5,
  "1006": 5,
  "1905": 5,
  "2106": 5,
  "2201": 5,
  "2202": 5,
  "3004": 5,
  "3006": 5,
  "4901": 5,
  "4902": 5,
};

/** Two-digit chapter fallback when no exact prefix is in the master. */
export const HSN_CHAPTER_DEFAULT_GST: Record<string, number> = {
  "71": 3,
  "91": 18,
  "85": 18,
  "84": 18,
  "59": 12,
  "58": 12,
  "99": 18,
  "34": 18,
  "38": 18,
};

export type HsnGstLookupOptions = {
  /** DB / API overrides (longest prefix still wins across merged table). */
  extraRates?: Record<string, number>;
};

/** Normalize catalogue HSN (often 6–8 digits) for lookup. */
export function normalizeHsnCode(hsn: string | null | undefined): string {
  return String(hsn ?? "")
    .trim()
    .replace(/\s/g, "");
}

function mergedRateTable(extraRates?: Record<string, number>): Record<string, number> {
  if (!extraRates || Object.keys(extraRates).length === 0) return BUILTIN_HSN_GST;
  return { ...BUILTIN_HSN_GST, ...extraRates };
}

/**
 * GST % from HSN/SAC only (5 / 12 / 18 / … per master).
 * No manual GST % is used in billing arithmetic.
 */
export function gstRateFromHsn(
  hsn: string | null | undefined,
  options?: HsnGstLookupOptions,
): number {
  const h = normalizeHsnCode(hsn);
  if (!h) return DEFAULT_HSN_GST_PERCENT;

  const table = mergedRateTable(options?.extraRates);

  // Longest match wins — include exact HSN length (e.g. 6-digit SAC before 4-digit "9983").
  const prefixLengths = [8, 7, 6, 5, 4, 2] as const;
  const tryLengths = [...new Set([h.length, ...prefixLengths].filter((len) => h.length >= len))].sort(
    (a, b) => b - a,
  );
  for (const len of tryLengths) {
    const key = h.slice(0, len);
    if (table[key] != null) return table[key]!;
  }

  const chapter = h.slice(0, 2);
  if (HSN_CHAPTER_DEFAULT_GST[chapter] != null) return HSN_CHAPTER_DEFAULT_GST[chapter]!;

  return DEFAULT_HSN_GST_PERCENT;
}

/** Valid 6-digit SAC for repair/labour (IRP rejects legacy 4-digit 9987). */
export const DEFAULT_SERVICE_SAC = "998714";

/** Normalize SAC for billing display and GST lookup. */
export function formatSacForBilling(sac: string | null | undefined): string {
  const d = normalizeHsnCode(sac).replace(/\D/g, "");
  if (!d.startsWith("99")) return DEFAULT_SERVICE_SAC;
  if (d === "9987") return DEFAULT_SERVICE_SAC;
  if (d.length >= 6) return d.slice(0, 6);
  if (d.length >= 4) return d.padEnd(6, "0");
  return DEFAULT_SERVICE_SAC;
}

/**
 * HSN/SAC for printed invoices and GST buckets.
 * - Service SAC (starts with 99, or missing): always print valid 6-digit SAC (9987 → 998714).
 * - Goods HSN (does not start with 99): keep inventory digits as stored.
 */
export function formatPrintedHsnSac(hsnSac: string | null | undefined): string {
  const d = normalizeHsnCode(hsnSac).replace(/\D/g, "");
  if (!d || d.startsWith("99") || d === "9987") return formatSacForBilling(d || DEFAULT_SERVICE_SAC);
  return d;
}

/** @deprecated Use BUILTIN_HSN_GST */
export const HSN_GST = BUILTIN_HSN_GST;
