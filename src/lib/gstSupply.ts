import { getZimsonCompanyGstinByGstin, normalizeGstin } from "./zimsonCompanyGst";

/** First two digits of a valid 15-char GSTIN = state code (place of supply for B2B). */
export function gstinStateCode(gstin: string | null | undefined): string | null {
  const g = normalizeGstin(gstin ?? "");
  if (g.length < 2 || !/^\d{2}/.test(g)) return null;
  return g.slice(0, 2);
}

/** Seller state from printed store/org GSTIN. */
export function resolveSellerStateCode(gstin: string | null | undefined, fallback = "33"): string {
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
  /** POS / store state when customer state is unknown (typical walk-in B2C). */
  sellerStateCode: string;
};

/** Place-of-supply state code for GST (B2B GSTIN wins; else billing state; B2C defaults to store). */
export function resolveCustomerSupplyStateCode(ctx: CustomerSupplyContext): string {
  if (ctx.customerType === "B2B") {
    const fromGst = gstinStateCode(ctx.customerGstin);
    if (fromGst) return fromGst;
  }
  const fromName = stateCodeFromName(ctx.billingStateName);
  if (fromName) return fromName;
  return ctx.sellerStateCode;
}

/** Interstate when customer place of supply ≠ seller registration state. */
export function isInterstateSupply(sellerStateCode: string, customerStateCode: string): boolean {
  const s = sellerStateCode.replace(/\D/g, "").padStart(2, "0").slice(0, 2);
  const c = customerStateCode.replace(/\D/g, "").padStart(2, "0").slice(0, 2);
  return s !== c;
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
