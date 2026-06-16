/** Result of an e-invoice or e-way attempt (stored on bill / challan rows). */
export type EdocResult = {
  ok: boolean;
  skipped?: boolean;
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
};

export type EdocValueTotals = {
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
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
};
