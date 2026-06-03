/**
 * Zimson Times Pvt. Ltd. — company GSTINs (seller / branch registrations).
 * Must NOT be saved on B2B customer records; use for store/region invoice "Bill From" instead.
 */
export type ZimsonCompanyGstEntry = {
  state: string;
  stateCode: string;
  legalName: string;
  gstin: string;
};

export const ZIMSON_COMPANY_GST_ENTRIES: readonly ZimsonCompanyGstEntry[] = [
  {
    state: "Tamil Nadu",
    stateCode: "33",
    legalName: "Zimson Times Pvt. Ltd.",
    gstin: "33AAACZ0566D1ZN",
  },
  {
    state: "Karnataka",
    stateCode: "29",
    legalName: "Zimson Times Pvt. Ltd.",
    gstin: "29AAACZ0566D1ZC",
  },
  {
    state: "Kerala",
    stateCode: "32",
    legalName: "Zimson Times Pvt. Ltd.",
    gstin: "32AAACZ0566D2ZO",
  },
  {
    state: "Puducherry",
    stateCode: "34",
    legalName: "Zimson Times Pvt. Ltd.",
    gstin: "34AAACZ0566D1ZL",
  },
] as const;

const ZIMSON_GSTIN_SET = new Set(
  ZIMSON_COMPANY_GST_ENTRIES.map((e) => normalizeGstin(e.gstin)),
);

export const CUSTOMER_B2B_ZIMSON_GST_ERROR =
  "This GSTIN is Zimson's own company registration (Tamil Nadu, Karnataka, Kerala, or Puducherry). Enter the customer's GSTIN, not Zimson's.";

/** Short UI hint under B2B GSTIN fields. */
export const ZIMSON_OWN_GSTIN_FIELD_HINT =
  "";

export function normalizeGstin(value: string): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s/g, "");
}

export function isZimsonCompanyGstin(gst: string): boolean {
  const g = normalizeGstin(gst);
  return g.length > 0 && ZIMSON_GSTIN_SET.has(g);
}

/** Returns an error message when a B2B customer must not use this GSTIN; null if OK. */
export function validateCustomerB2bGstin(gst: string): string | null {
  if (!gst.trim()) return null;
  if (isZimsonCompanyGstin(gst)) return CUSTOMER_B2B_ZIMSON_GST_ERROR;
  return null;
}

/** Match by first two digits of GSTIN (state code). */
export function getZimsonCompanyGstinByStateCode(stateCode: string): ZimsonCompanyGstEntry | undefined {
  const sc = String(stateCode ?? "")
    .trim()
    .replace(/\D/g, "")
    .padStart(2, "0")
    .slice(0, 2);
  return ZIMSON_COMPANY_GST_ENTRIES.find((e) => e.stateCode === sc);
}

export function getZimsonCompanyGstinByGstin(gstin: string): ZimsonCompanyGstEntry | undefined {
  const g = normalizeGstin(gstin);
  return ZIMSON_COMPANY_GST_ENTRIES.find((e) => normalizeGstin(e.gstin) === g);
}
