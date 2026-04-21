/** View model for the printable service invoice shell (Quick bill, billing, etc.). */
export type ServiceInvoiceViewModel = {
  documentLabel: string;
  invoiceNumber: string;
  invoiceDate: string;
  placeOfSupply: string;
  reverseCharge: string;
  seller: {
    legalName: string;
    addressLines: string[];
    gstin: string;
    phone?: string;
    email?: string;
    stateCode?: string;
  };
  billTo: {
    name: string;
    address?: string | null;
    gstin?: string | null;
    pan?: string | null;
    phone?: string | null;
    email?: string | null;
  };
  /** Watch, technician, payment, etc. */
  serviceMeta: { label: string; value: string }[];
  lines: { slNo: number; description: string; hsnSac: string; amount: number }[];
  totalAmount: number;
  /** Placeholder until dynamic amount-in-words is wired. */
  amountInWordsNote?: string;
  paymentMode?: string;
  bankDetailsLines?: string[];
  notes?: string;
  footerTerms?: string[];
};
