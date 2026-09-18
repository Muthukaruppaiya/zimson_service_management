export type SparePart = {
  id: string;
  sku: string;
  /** Watch brand this part number belongs to. Unique together with sku. */
  brand: string;
  /** Optional second part number (cross-reference / old code). */
  altSku: string | null;
  name: string;
  /** Optional second display name. */
  altName: string | null;
  description: string;
  category: string;
  /** Watch model this spare fits (optional). */
  modelNo: string | null;
  /** Movement caliber (optional). */
  caliber: string | null;
  /** Strap / part sub-type (Leather, Metal, BiMetal…). */
  subCategory: string | null;
  size: string | null;
  colour: string | null;
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
  brand: string;
  altSku?: string | null;
  name: string;
  altName?: string | null;
  description: string;
  category: string;
  modelNo?: string | null;
  caliber?: string | null;
  subCategory?: string | null;
  size?: string | null;
  colour?: string | null;
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
  brand?: string;
  altSku?: string | null;
  name?: string;
  altName?: string | null;
  description?: string;
  category?: string;
  modelNo?: string | null;
  caliber?: string | null;
  subCategory?: string | null;
  size?: string | null;
  colour?: string | null;
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
