export type SparePart = {
  id: string;
  sku: string;
  name: string;
  description: string;
  category: string;
  hsn: string | null;
  /** GST % for billing — set per spare in Inventory catalogue. */
  gstPercent: number | null;
  costPriceInr?: number | null;
  sellingPriceInr?: number | null;
  mrpInr: number | null;
  isActive: boolean;
  createdAt: string;
};

export type CreateSpareInput = {
  sku: string;
  name: string;
  description: string;
  category: string;
  hsn?: string | null;
  gstPercent?: number | null;
  costPriceInr?: number | null;
  sellingPriceInr?: number | null;
  mrpInr?: number | null;
  isActive?: boolean;
};

export type SparePriceLine = {
  id: string;
  spareId: string;
  regionId: string | null;
  brand: string;
  price: number;
  createdAt: string;
};

export type SpareStockRow = {
  id: string;
  spareId: string;
  locationType: "HO" | "STORE";
  regionId: string;
  storeId: string | null;
  quantity: number;
  updatedAt: string;
};
