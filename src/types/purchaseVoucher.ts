export type PurchaseVoucherItem = {
  id: string;
  spareId: string;
  qtyOrdered: number;
  unitPrice: number;
  receivedQty: number;
  mrp?: number;
  gstRate?: number;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  uom?: string;
  hsn?: string | null;
  brand?: string | null;
  partCode?: string | null;
  productName?: string | null;
};

export type PurchaseVoucher = {
  id: string;
  voucherNumber: string;
  supplierId: string;
  supplierName: string;
  regionId: string;
  regionName?: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  status: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  items: PurchaseVoucherItem[];
};
