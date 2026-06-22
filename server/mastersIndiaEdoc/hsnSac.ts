import { normalizeHsnCode } from "../../src/lib/hsnGst";

/** Default goods HSN for watch spare parts when catalogue HSN is missing or invalid. */
export const WATCH_SPARE_FALLBACK_HSN = "91139000";

export function isServiceSacCode(hsn: string | null | undefined): boolean {
  const digits = normalizeHsnCode(hsn).replace(/\D/g, "");
  return digits.startsWith("99") && digits.length >= 4;
}

function digitsOnly(hsn: string | null | undefined): string {
  return normalizeHsnCode(hsn).replace(/\D/g, "");
}

/** SAC codes for IRP (typically 4 or 6 digits). */
export function formatSacCodeForEdoc(hsn: string, fallback = "9987"): string {
  const d = digitsOnly(hsn);
  if (!d.startsWith("99")) return fallback;
  if (d.length >= 6) return d.slice(0, 6);
  if (d.length >= 4) return d.slice(0, 4);
  return fallback;
}

/** Goods HSN for IRP (8 digits). */
export function formatGoodsHsnForEdoc(hsn: string, fallback = WATCH_SPARE_FALLBACK_HSN): string {
  const d = digitsOnly(hsn);
  if (!d || d.startsWith("99")) return fallback;
  if (d.length >= 8) return d.slice(0, 8);
  if (d.length === 6) return d.padEnd(8, "0");
  if (d.length === 4) return d.padEnd(8, "0");
  return fallback;
}

const GOODS_CHAPTERS = new Set([
  34, 38, 39, 40, 48, 58, 59, 71, 73, 74, 76, 83, 84, 85, 90, 91, 96,
]);

/** Reject catalogue typos / non-HSN values before calling IRP. */
export function isPlausibleGoodsHsn(digits: string): boolean {
  if (digits.length < 6 || digits.length > 10) return false;
  if (digits.startsWith("99")) return false;
  const chapter = Number.parseInt(digits.slice(0, 2), 10);
  if (!Number.isFinite(chapter) || chapter < 1 || chapter > 97) return false;
  if (!GOODS_CHAPTERS.has(chapter)) return false;
  return true;
}

export function isPlausibleSac(digits: string): boolean {
  return digits.startsWith("99") && digits.length >= 4 && digits.length <= 8;
}

export function defaultUqcForEdocLine(isService: boolean): string {
  /** GST UQC — numbers for spare parts; OTH for labour/SAC service lines. */
  return isService ? "OTH" : "NOS";
}

export function resolveEdocHsnSac(
  raw: string | null | undefined,
  opts: { labourLine?: boolean; defaultSacHsn?: string },
): { code: string; isService: boolean } {
  const defaultSac = (opts.defaultSacHsn ?? "9987").trim() || "9987";
  if (opts.labourLine) {
    return { code: formatSacCodeForEdoc(defaultSac, defaultSac), isService: true };
  }

  const digits = digitsOnly(raw);
  if (digits && isPlausibleSac(digits)) {
    return { code: formatSacCodeForEdoc(digits, defaultSac), isService: true };
  }
  if (digits && isPlausibleGoodsHsn(digits)) {
    return { code: formatGoodsHsnForEdoc(digits), isService: false };
  }
  return { code: WATCH_SPARE_FALLBACK_HSN, isService: false };
}
