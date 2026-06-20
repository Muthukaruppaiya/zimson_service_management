export type ServiceInvoiceSourceType = "quick_bill" | "srf_store" | "inter_ho_repair" | "ho_billing";

export type InvoicePaymentStatus = "unpaid" | "partial" | "paid";

export type ServiceInvoiceRecord = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  sourceType: ServiceInvoiceSourceType;
  sourceId: string | null;
  regionId: string | null;
  storeId: string | null;
  customerId: string | null;
  customerName: string;
  customerPhone: string | null;
  customerGstin: string | null;
  srfReference: string | null;
  rootSrfReference: string | null;
  totalInr: number;
  paidInr: number;
  balanceDueInr: number;
  paymentStatus: InvoicePaymentStatus;
  taxJson: unknown;
  snapshotJson: unknown;
  edocIrn?: string | null;
  edocAckNo?: string | null;
  edocAckDate?: string | null;
  edocStatus?: string | null;
  edocError?: string | null;
  edocQr?: string | null;
  edocGeneratedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InvoicePaymentRecord = {
  id: string;
  voucherRef: string;
  amountInr: number;
  paymentMode: string;
  paymentDetails: unknown;
  narration: string | null;
  postedAt: string;
  createdBy: string | null;
};

export type LedgerEntryRecord = {
  id: string;
  voucherRef: string;
  voucherType: string;
  accountCode: string;
  accountName: string;
  debitInr: number;
  creditInr: number;
  referenceType: string | null;
  referenceId: string | null;
  narration: string | null;
  regionId: string | null;
  postedAt: string;
};

export function invoiceSourceLabel(source: ServiceInvoiceSourceType): string {
  switch (source) {
    case "quick_bill":
      return "Quick bill";
    case "srf_store":
      return "SRF store billing";
    case "inter_ho_repair":
      return "Inter-HO repair";
    case "ho_billing":
      return "HO billing";
    default:
      return source;
  }
}

export function paymentStatusLabel(status: InvoicePaymentStatus): string {
  switch (status) {
    case "paid":
      return "Paid";
    case "partial":
      return "Partial";
    default:
      return "Unpaid";
  }
}
