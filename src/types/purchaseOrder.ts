export type PurchaseOrderItem = {
  id: string;
  prItemId: string | null;
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

export type PurchaseOrder = {
  id: string;
  poNumber: string;
  prId: string | null;
  prNumber: string | null;
  prNumbers?: string[] | null;
  storeId?: string | null;
  storeName?: string | null;
  supplierId: string;
  supplierName: string;
  regionId: string;
  regionName?: string;
  status: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  items: PurchaseOrderItem[];
};
