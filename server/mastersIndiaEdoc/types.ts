/** Result of an e-invoice or e-way attempt (stored on bill / challan rows). */
export type EdocResult = {
  ok: boolean;
  skipped?: boolean;
  /** Transient IRP failure — background worker will retry. */
  pending?: boolean;
  skipReason?: string;
  irn?: string | null;
  ackNo?: string | null;
  ackDate?: string | null;
  ewayBillNo?: string | null;
  ewayValidUpto?: string | null;
  qrUrl?: string | null;
  pdfUrl?: string | null;
  requestId?: string | null;
  error?: string | null;
  rawStatus?: string | null;
};

export type EdocParty = {
  gstin: string;
  legalName: string;
  tradeName?: string;
  address1: string;
  address2?: string;
  location: string;
  pincode: number;
  stateCode: string;
  phone?: string;
  email?: string;
};

export type EdocLine = {
  slNo: number;
  description: string;
  hsnSac: string;
  qty: number;
  unitPrice: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  /** Notified GST % for the line (avoids IRP rate mismatch from rounding). */
  gstRatePercent?: number;
  /** IRP item flag — goods (N) vs SAC service (Y). */
  isService?: boolean;
  /** GST unit quantity code (NOS, OTH, KGS, …). */
  uqc?: string;
};

export type EdocValueTotals = {
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  roundOff?: number;
  isInterstate: boolean;
};

export type EinvoicingBuildInput = {
  userGstin: string;
  documentNumber: string;
  documentDate: Date;
  seller: EdocParty;
  buyer: EdocParty;
  lines: EdocLine[];
  totals: EdocValueTotals;
  placeOfSupplyStateCode: string;
};

export type EwayBuildInput = {
  userGstin: string;
  documentNumber: string;
  documentDate: Date;
  consignor: EdocParty;
  consignee: EdocParty;
  taxableAmount: number;
  totalInvoiceValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  itemDescription: string;
  hsnSac: string;
  qty: number;
  transportationDistanceKm?: string;
  subSupplyDescription?: string;
  vehicleNumber?: string;
  transportationMode?: string;
  transporterName?: string;
  documentType?: string;
};

/** User-supplied fields when generating an e-way bill manually. */
export type EwayGenerateInput = {
  taxableAmountInr?: number;
  totalInvoiceValueInr?: number;
  vehicleNumber?: string;
  transportationDistanceKm?: string;
  transportationMode?: string;
  transporterName?: string;
  forceRegenerate?: boolean;
  consigneeGstin?: string;
  consigneeLegalName?: string;
  consigneeAddress?: string;
  consigneePlace?: string;
  consigneePincode?: string;
};

export type EwayPrefill = {
  documentNumber: string;
  flowLabel: string;
  fromLabel: string;
  toLabel: string;
  consignorGstin: string;
  consigneeGstin: string;
  vehicleNumber: string;
  defaultValueInr: number;
  interstate: boolean;
  existingEwayBillNo?: string | null;
  requiresConsigneeInput?: boolean;
  watchBrand?: string;
  brandConsignees?: Array<{
    id: string;
    brandId: string;
    brandName: string;
    locationName: string;
    legalName: string;
    gstin: string;
    address: string;
    city: string;
    pincode: string;
  }>;
  defaultConsigneeId?: string | null;
};

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Masters India sandbox test GSTIN — not a standard-format GSTIN but valid for sandb-api. */
export const SANDBOX_EDOC_TEST_GSTIN = "09AAAPG7885R002";

export function isValidGstin(gstin: string | null | undefined): boolean {
  const g = String(gstin ?? "")
    .trim()
    .toUpperCase();
  if (g === SANDBOX_EDOC_TEST_GSTIN) return true;
  return GSTIN_RE.test(g);
}

export type MastersIndiaEdocConfig = {
  enabled: boolean;
  failOpen: boolean;
  username: string;
  password: string;
  ewayUsername: string;
  ewayPassword: string;
  apiBase: string;
  ewayApiBase: string;
  tokenUrl: string;
  einvoicePath: string;
  ewayPath: string;
  sellerGstinOverride: string | null;
  ewayUserGstin: string | null;
  ewayNominalValueInr: number;
  ewayAutoEnabled: boolean;
};
