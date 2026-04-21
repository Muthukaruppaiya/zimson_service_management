export type ServiceTaxSettings = {
  gstRatePercent: number;
  cgstRatePercent: number;
  sgstRatePercent: number;
  igstRatePercent: number;
  defaultSacHsn: string;
  pricesTaxInclusive: boolean;
  notes: string;
  updatedAt: string;
  updatedBy: string | null;
};
