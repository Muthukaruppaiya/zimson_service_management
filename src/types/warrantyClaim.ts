export type WarrantyClaimStatus = "PENDING" | "APPROVED" | "REJECTED";

export type WarrantyPurchaseClaim = {
  id: string;
  claimNumber: string;
  regionId: string | null;
  regionName: string | null;
  storeId: string | null;
  storeName: string | null;
  customerName: string;
  phone: string;
  watchBrand: string;
  watchModel: string;
  serial: string;
  purchaseInvoiceNumber: string;
  purchaseDate: string;
  purchasedFrom: string;
  purchaseAmountInr: number | null;
  warrantyMonths: number;
  warrantyTillDate: string;
  invoiceFilePath: string;
  invoiceFileName: string | null;
  invoiceFileMime: string | null;
  remarks: string;
  status: WarrantyClaimStatus;
  reviewNote: string;
  submittedBy: string | null;
  submittedByName: string | null;
  submittedAt: string;
  reviewedBy: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
};

/** Prefix used in the SRF warranty reference field for an approved purchase claim. */
export const WARRANTY_CLAIM_REF_PREFIX = "claim:";
