import { getZimsonCompanyGstinByGstin, normalizeGstin } from "./zimsonCompanyGst";

/** True when string looks like a real 15-character GSTIN (not demo/placeholder text). */
export function isValidGstinFormat(gstin: string | null | undefined): boolean {
  const g = normalizeGstin(gstin ?? "");
  return g.length === 15 && /^\d{2}[0-9A-Z]{13}$/.test(g);
}

/** First two digits of a valid GSTIN = state code (place of supply for B2B). */
export function gstinStateCode(gstin: string | null | undefined): string | null {
  const g = normalizeGstin(gstin ?? "");
  if (!isValidGstinFormat(g)) return null;
  return g.slice(0, 2);
}

/** Default seller state when GSTIN missing — Tamil Nadu (Chennai HQ / most stores). */
export const DEFAULT_SELLER_STATE_CODE = "33";

/**
 * Seller registration state from store/org GSTIN.
 * Do not use Karnataka (29) branding fallback — it inverts IGST vs CGST+SGST for TN bills.
 */
export function resolveSellerStateCode(
  gstin: string | null | undefined,
  fallback: string = DEFAULT_SELLER_STATE_CODE,
): string {
  const fromGst = gstinStateCode(gstin);
  if (fromGst) return fromGst;
  const z = getZimsonCompanyGstinByGstin(gstin ?? "");
  if (z?.stateCode) return z.stateCode;
  return fallback.replace(/\D/g, "").padStart(2, "0").slice(0, 2);
}

const STATE_NAME_TO_CODE: Record<string, string> = {
  "jammu and kashmir": "01",
  "himachal pradesh": "02",
  punjab: "03",
  chandigarh: "04",
  uttarakhand: "05",
  haryana: "06",
  delhi: "07",
  rajasthan: "08",
  "uttar pradesh": "09",
  bihar: "10",
  sikkim: "11",
  "arunachal pradesh": "12",
  nagaland: "13",
  manipur: "14",
  mizoram: "15",
  tripura: "16",
  meghalaya: "17",
  assam: "18",
  "west bengal": "19",
  jharkhand: "20",
  odisha: "21",
  orissa: "21",
  chhattisgarh: "22",
  "madhya pradesh": "23",
  gujarat: "24",
  "dadra and nagar haveli and daman and diu": "26",
  "dadra and nagar haveli": "26",
  daman: "26",
  diu: "26",
  "dadra & nagar haveli": "26",
  maharashtra: "27",
  "andhra pradesh": "37",
  "andhra pradesh (new)": "37",
  karnataka: "29",
  goa: "30",
  lakshadweep: "31",
  kerala: "32",
  "tamil nadu": "33",
  puducherry: "34",
  pondicherry: "34",
  "andaman and nicobar": "35",
  "andaman & nicobar": "35",
  telangana: "36",
  ladakh: "38",
};

export function stateCodeFromName(stateName: string | null | undefined): string | null {
  const key = String(stateName ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!key) return null;
  return STATE_NAME_TO_CODE[key] ?? null;
}

export type CustomerSupplyContext = {
  customerType: "B2C" | "B2B";
  customerGstin?: string | null;
  billingStateName?: string | null;
  /** Flat address / city on bill or customer (used to detect state when name not set). */
  addressText?: string | null;
  cityText?: string | null;
  /** POS / store state when customer state is unknown (typical walk-in B2C). */
  sellerStateCode: string;
};

const STATE_ENTRIES_BY_NAME_LEN = Object.entries(STATE_NAME_TO_CODE).sort(
  (a, b) => b[0].length - a[0].length,
);

/** Detect GST state code from free-text address (e.g. "Bangalore, Karnataka" → 29). */
export function parseStateCodeFromText(
  ...parts: (string | null | undefined)[]
): string | null {
  const combined = parts
    .map((p) => String(p ?? "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
  if (!combined) return null;
  for (const [name, code] of STATE_ENTRIES_BY_NAME_LEN) {
    if (combined.includes(name)) return code;
  }
  return null;
}

/** Place-of-supply state code for GST (B2B GSTIN → billing state name → address text → store). */
export function resolveCustomerSupplyStateCode(ctx: CustomerSupplyContext): string {
  if (ctx.customerType === "B2B") {
    const fromGst = gstinStateCode(ctx.customerGstin);
    if (fromGst) return fromGst;
  }
  const fromName = stateCodeFromName(ctx.billingStateName);
  if (fromName) return fromName;
  const fromAddr = parseStateCodeFromText(
    ctx.billingStateName,
    ctx.addressText,
    ctx.cityText,
  );
  if (fromAddr) return fromAddr;
  return ctx.sellerStateCode;
}

/** Invoice header: customer place of supply (not seller store/region). */
export function formatPlaceOfSupplyLabel(params: {
  customerStateCode: string;
  billingStateName?: string | null;
  addressText?: string | null;
  cityText?: string | null;
}): string {
  const fromName = params.billingStateName?.trim();
  const stateLabel = fromName || stateCodeLabel(params.customerStateCode);
  const city = params.cityText?.trim();
  if (city && stateLabel) {
    const cityLower = city.toLowerCase();
    const stateLower = stateLabel.toLowerCase();
    if (!cityLower.includes(stateLower)) return `${city}, ${stateLabel}`;
    return city;
  }
  const addr = params.addressText?.trim();
  if (addr) {
    const parsed = parseStateCodeFromText(addr);
    if (parsed && stateCodeLabel(parsed) === stateLabel) {
      const segments = addr.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
      if (segments.length >= 2) return segments.slice(-2).join(", ");
    }
    return addr.length > 96 ? `${addr.slice(0, 93)}…` : addr;
  }
  return stateLabel;
}

/**
 * Interstate (other state) → IGST.
 * Intrastate (same state) → CGST + SGST.
 */
export function isInterstateSupply(sellerStateCode: string, customerStateCode: string): boolean {
  const s = sellerStateCode.replace(/\D/g, "").padStart(2, "0").slice(0, 2);
  const c = customerStateCode.replace(/\D/g, "").padStart(2, "0").slice(0, 2);
  return s !== c;
}

/** Split total GST amount: interstate = full IGST; intrastate = CGST + SGST halves. */
export function splitGstAmount(
  taxable: number,
  totalRatePercent: number,
  cgstRatePercent: number,
  sgstRatePercent: number,
  interstate: boolean,
): { cgst: number; sgst: number; igst: number; total: number } {
  const rate = Math.max(0, totalRatePercent) / 100;
  const tax = Math.round(taxable * rate * 100) / 100;
  if (tax <= 0) return { cgst: 0, sgst: 0, igst: 0, total: 0 };
  if (interstate) {
    return { cgst: 0, sgst: 0, igst: tax, total: tax };
  }
  const cgstPct = cgstRatePercent > 0 ? cgstRatePercent : totalRatePercent / 2;
  const sgstPct = sgstRatePercent > 0 ? sgstRatePercent : totalRatePercent / 2;
  const cgst = Math.round(taxable * (cgstPct / 100) * 100) / 100;
  const sgst = Math.round(taxable * (sgstPct / 100) * 100) / 100;
  return { cgst, sgst, igst: 0, total: Math.round((cgst + sgst) * 100) / 100 };
}

const STATE_CODE_LABEL: Record<string, string> = {
  "29": "Karnataka",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "37": "Andhra Pradesh",
};

export function stateCodeLabel(code: string | null | undefined): string {
  const c = String(code ?? "")
    .replace(/\D/g, "")
    .padStart(2, "0")
    .slice(0, 2);
  return STATE_CODE_LABEL[c] ?? `State ${c}`;
}
