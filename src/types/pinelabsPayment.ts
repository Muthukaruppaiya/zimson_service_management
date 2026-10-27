export type PinelabsTxnStatus = "UPLOADED" | "APPROVED" | "FAILED" | "CANCELLED";

export type PinelabsPosMode = "card" | "upi";

export type PinelabsTxn = {
  id: string;
  storeId: string | null;
  transactionNumber: string;
  ptrid: number | null;
  amountInr: number;
  status: PinelabsTxnStatus;
  responseMessage: string | null;
  paymentMode: string | null;
  rrn: string | null;
  approvalCode: string | null;
  cardLast4: string | null;
  createdAt: string;
};

export type PinelabsPublicConfig = {
  enabled: boolean;
  storeId: string | null;
  environment: "uat" | "production" | null;
};
