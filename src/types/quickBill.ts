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
  createdAt: string;
  regionId: string;
  regionName: string | null;
  storeId: string | null;
  storeName: string | null;
  customerType: "B2C" | "B2B";
  customerName: string | null;
  company: string | null;
  watchBrand: string;
  paymentMode: "Cash" | "Card" | "UPI";
  totalInr: number;
  createdBy: string;
};

export type QuickBillInvoice = {
  id: string;
  billNumber: string;
  createdAt: string;
  regionId: string;
  regionName: string | null;
  storeId: string | null;
  storeName: string | null;
  customerType: "B2C" | "B2B";
  customerName: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
  gst: string | null;
  pan: string | null;
  watchBrand: string;
  watchModel: string;
  watchRef: string | null;
  technicianId: string | null;
  technicianName: string | null;
  paymentMode: "Cash" | "Card" | "UPI";
  notes: string;
  totalInr: number;
  lines: QuickBillLineInvoice[];
};
