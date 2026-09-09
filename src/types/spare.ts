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
  customFields?: Record<string, string | number | boolean | null>;
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
  customFields?: Record<string, string | number | boolean | null>;
};

/** Property-only spare master updates (not stock). Admin / Super Admin. */
export type UpdateSparePatch = {
  name?: string;
  description?: string;
  category?: string;
  hsn?: string | null;
  gstPercent?: number | null;
  costPriceInr?: number | null;
  sellingPriceInr?: number | null;
  mrpInr?: number | null;
  isActive?: boolean;
  customFields?: Record<string, string | number | boolean | null>;
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
