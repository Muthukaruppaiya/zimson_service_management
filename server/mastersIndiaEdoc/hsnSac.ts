import { normalizeHsnCode } from "../../src/lib/hsnGst";

/** Default goods HSN for watch spare parts when catalogue HSN is missing or invalid. */
export const WATCH_SPARE_FALLBACK_HSN = "91149000";

/** Valid 6-digit SAC for repair/labour on IRP (legacy settings often used 4-digit 9987). */
export const DEFAULT_SERVICE_SAC = "998714";

export function isServiceSacCode(hsn: string | null | undefined): boolean {
  const digits = normalizeHsnCode(hsn).replace(/\D/g, "");
  return digits.startsWith("99") && digits.length >= 4;
}

function digitsOnly(hsn: string | null | undefined): string {
  return normalizeHsnCode(hsn).replace(/\D/g, "");
}

/** SAC codes for IRP — must be 6 digits for Masters India / NIC. */
export function formatSacCodeForEdoc(hsn: string, fallback = DEFAULT_SERVICE_SAC): string {
  const d = digitsOnly(hsn);
  if (!d.startsWith("99")) return fallback;
  if (d === "9987") return DEFAULT_SERVICE_SAC;
  if (d.length >= 6) return d.slice(0, 6);
  if (d.length >= 4) return d.padEnd(6, "0");
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
  if (digits.length < 4 || digits.length > 10) return false;
  if (digits.startsWith("99")) return false;
  const chapter = Number.parseInt(digits.slice(0, 2), 10);
  if (!Number.isFinite(chapter) || chapter < 1 || chapter > 97) return false;
  if (digits.length >= 6 && !GOODS_CHAPTERS.has(chapter)) return false;
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
  opts: { labourLine?: boolean; defaultSacHsn?: string; preferGoods?: boolean },
): { code: string; isService: boolean } {
  const defaultSac =
    formatSacCodeForEdoc((opts.defaultSacHsn ?? DEFAULT_SERVICE_SAC).trim() || DEFAULT_SERVICE_SAC);
  if (opts.labourLine) {
    return { code: formatSacCodeForEdoc(defaultSac, defaultSac), isService: true };
  }

  const digits = digitsOnly(raw);

  if (opts.preferGoods) {
    if (digits && !digits.startsWith("99") && digits.length >= 4) {
      return { code: formatGoodsHsnForEdoc(digits), isService: false };
    }
    return { code: formatGoodsHsnForEdoc(WATCH_SPARE_FALLBACK_HSN), isService: false };
  }

  if (digits && isPlausibleSac(digits)) {
    return { code: formatSacCodeForEdoc(digits, defaultSac), isService: true };
  }
  if (digits && isPlausibleGoodsHsn(digits)) {
    return { code: formatGoodsHsnForEdoc(digits), isService: false };
  }
  if (digits && !digits.startsWith("99") && digits.length >= 4) {
    return { code: formatGoodsHsnForEdoc(digits), isService: false };
  }
  return { code: formatGoodsHsnForEdoc(WATCH_SPARE_FALLBACK_HSN), isService: false };
}
