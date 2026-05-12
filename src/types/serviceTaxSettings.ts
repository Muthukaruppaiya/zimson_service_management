export type ServiceTaxSettings = {
  gstRatePercent: number;
  cgstRatePercent: number;
  sgstRatePercent: number;
  igstRatePercent: number;
  defaultSacHsn: string;
  pricesTaxInclusive: boolean;
  supplierTaxPersonTypes: string[];
  srfPrefix: string;
  srfSuffix: string;
  prPrefix: string;
  prSuffix: string;
  poPrefix: string;
  poSuffix: string;
  grnPrefix: string;
  grnSuffix: string;
  dcPrefix: string;
  dcSuffix: string;
  odcPrefix: string;
  odcSuffix: string;
  appLogoUrl: string;
  appFaviconUrl: string;
  /** Invoice print: store trading name (e.g. ZIMSON - THE WATCH STORE). */
  invoiceStoreDisplayName: string;
  invoiceStoreTagline: string;
  /** Multiline store address for invoices */
  invoiceStoreAddress: string;
  invoiceStorePhone: string;
  invoiceStoreEmail: string;
  invoiceStoreGstin: string;
  /** "For …" signatory line */
  invoiceLegalEntityName: string;
  /** Numbered terms: one paragraph per line */
  invoiceTerms: string;
  notes: string;
  updatedAt: string;
  updatedBy: string | null;
};
