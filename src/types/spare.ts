export type SparePart = {
  id: string;
  sku: string;
  name: string;
  category: string;
  uom: string;
  hsn: string | null;
  isActive: boolean;
  createdAt: string;
};

export type CreateSpareInput = {
  sku: string;
  name: string;
  category: string;
  uom: string;
  hsn?: string | null;
};
