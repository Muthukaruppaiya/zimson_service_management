export type PurchaseOrderItem = {
  id: string;
  prItemId: string | null;
  spareId: string;
  qtyOrdered: number;
  unitPrice: number;
  receivedQty: number;
};

export type PurchaseOrder = {
  id: string;
  poNumber: string;
  prId: string | null;
  prNumber: string | null;
  supplierId: string;
  supplierName: string;
  regionId: string;
  status: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  items: PurchaseOrderItem[];
};
