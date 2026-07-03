export type BulkImportColumn = {
  key: string;
  label: string;
  required?: boolean;
  note?: string;
};

export const BULK_IMPORT_SPARES_COLUMNS: BulkImportColumn[] = [
  { key: "sku", label: "Product Code", required: true, note: "Unique identifier, e.g. SP-GLASS-001" },
  { key: "name", label: "Product Name", required: true, note: "Short display name" },
  { key: "description", label: "Product Description", required: true, note: "Longer product description" },
  { key: "category", label: "Category", required: true, note: "Glass / Battery / Crown / Strap / Movement / Other…" },
  { key: "hsn", label: "HSN", required: false, note: "HSN tariff code" },
  { key: "mrp_inr", label: "MRP (INR)", required: false, note: "Maximum retail price in INR" },
  { key: "is_active", label: "Active", required: true, note: "Y / N — controls catalogue visibility" },
];

export const BULK_IMPORT_PRICES_COLUMNS: BulkImportColumn[] = [
  { key: "sku", label: "Product Code", required: true, note: "Must match a product code in the Spares sheet" },
  { key: "region_name", label: "Region Name", required: true, note: "Exact region name (e.g. COIMBATORE HO)" },
  { key: "watch_brand", label: "Watch Brand", required: true, note: "Brand name the price applies to" },
  { key: "price_inr", label: "Price (INR)", required: true, note: "Selling price in INR (numeric)" },
];

export const BULK_IMPORT_STOCK_COLUMNS: BulkImportColumn[] = [
  { key: "sku", label: "Product Code", required: true, note: "Must match a product code in the Spares sheet" },
  { key: "location_type", label: "Location Type", required: true, note: "HO or STORE" },
  { key: "region_name", label: "Region Name", required: true, note: "Region name (e.g. COIMBATORE HO)" },
  { key: "store_name", label: "Store Name", required: false, note: "Required when Location Type = STORE" },
  { key: "quantity", label: "Quantity", required: true, note: "Integer quantity (non-negative)" },
];

/** Normalized Excel header → internal field key (supports legacy template headers). */
export const BULK_IMPORT_HEADER_ALIASES: Record<string, string> = {
  sku: "sku",
  product_code: "sku",
  name: "name",
  product_name: "name",
  description: "description",
  product_description: "description",
  category: "category",
  hsn: "hsn",
  mrp_inr: "mrp_inr",
  mrp: "mrp_inr",
  "mrp_(inr)": "mrp_inr",
  is_active: "is_active",
  active: "is_active",
  region_name: "region_name",
  watch_brand: "watch_brand",
  price_inr: "price_inr",
  "price_(inr)": "price_inr",
  location_type: "location_type",
  store_name: "store_name",
  quantity: "quantity",
};

export function normBulkImportHeader(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

export function canonicalBulkImportHeader(raw: unknown): string {
  const norm = normBulkImportHeader(raw);
  if (!norm) return "";
  return BULK_IMPORT_HEADER_ALIASES[norm] ?? norm;
}

export function bulkImportHeaderLabels(columns: BulkImportColumn[]): string[] {
  return columns.map((c) => c.label);
}

export function bulkImportColumnKeys(columns: BulkImportColumn[]): string[] {
  return columns.map((c) => c.key);
}

export function bulkImportColumnLabel(columns: BulkImportColumn[], key: string): string {
  return columns.find((c) => c.key === key)?.label ?? key;
}
