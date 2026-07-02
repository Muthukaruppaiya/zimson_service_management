import type { AdvancePaymentDetails, AppPaymentMode } from "../lib/paymentModes";

export type QuickBillWarrantyStatus = "unspecified" | "none" | "under_warranty" | "extended";

export type QuickBillLineInvoice = {
  lineNo: number;
  description: string;
  amountInr: number;
  spareId: string | null;
  qty: number;
};

/** Summary row for quick bill history lists (GET /api/service/quick-bills). */
export type QuickBillHistoryRow = {
  id: string;
  billNumber: string;
  invoiceNumber: string;
  createdAt: string;
  regionId: string;
  regionName: string | null;
  storeId: string | null;
  storeName: string | null;
  customerType: "B2C" | "B2B";
  customerId?: string | null;
  customerCode?: string | null;
  customerName: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
  gst: string | null;
  pan: string | null;
  address: string | null;
  city: string | null;
  watchBrand: string;
  watchModel: string;
  watchRef: string | null;
  watchRemark: string;
  warrantyStatus: QuickBillWarrantyStatus;
  technicianName: string | null;
  paymentMode: string;
  notes: string;
  totalInr: number;
  createdBy: string;
  edocIrn?: string | null;
  edocStatus?: string | null;
  edocError?: string | null;
};

export type QuickBillInvoice = {
  id: string;
  /** Internal QB reference number (QB26REG1012 style) */
  billNumber: string;
  /** Formatted store invoice number (CHN0126-00001 style); falls back to billNumber for region-only bills */
  invoiceNumber: string;
  createdAt: string;
  regionId: string;
  regionName: string | null;
  storeId: string | null;
  storeName: string | null;
  customerType: "B2C" | "B2B";
  customerId?: string | null;
  customerCode?: string | null;
  customerName: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
  gst: string | null;
  pan: string | null;
  address?: string | null;
  city?: string | null;
  /** Customer place-of-supply state (e.g. Karnataka) for GST / invoice header. */
  customerBillingState?: string | null;
  watchBrand: string;
  watchFamily?: string;
  watchModel: string;
  watchRef: string | null;
  watchRemark?: string;
  caseType?: string;
  strapChainType?: string;
  natureOfRepair?: string;
  chainCount?: string;
  customerRemarks?: string;
  warrantyStatus?: QuickBillWarrantyStatus;
  watchDocumentPath?: string | null;
  watchImagePath?: string | null;
  technicianId: string | null;
  technicianName: string | null;
  paymentMode: string;
  /** Cash denominations, UPI/card/bank reference, etc. */
  paymentDetails?: AdvancePaymentDetails | null;
  notes: string;
  totalInr: number;
  lines: QuickBillLineInvoice[];
  /** GST e-invoice IRN when generated via Masters India. */
  edocIrn?: string | null;
  edocAckNo?: string | null;
  edocQr?: string | null;
  edocStatus?: string | null;
  edocError?: string | null;
};

/** API response from POST /api/service/quick-bills */
export type QuickBillEdocInfo = {
  ok: boolean;
  skipped?: boolean;
  pending?: boolean;
  skipReason?: string;
  irn?: string | null;
  ackNo?: string | null;
  ackDate?: string | null;
  qrUrl?: string | null;
  /** IRP e-invoice PDF URL when returned by Masters India / GST portal. */
  pdfUrl?: string | null;
  error?: string | null;
};
