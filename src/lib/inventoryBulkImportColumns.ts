export type BulkImportColumn = {
  key: string;
  label: string;
  required?: boolean;
  note?: string;
};

export const BULK_IMPORT_SPARES_COLUMNS: BulkImportColumn[] = [
  { key: "sku", label: "Product Code", required: false, note: "Leave blank to auto-generate (PRT…). Client part reference is also accepted." },
  { key: "watch_brand", label: "Watch Brand", required: true, note: "Created automatically if the brand is not in master yet" },
  { key: "name", label: "Product Name", required: false, note: "Uses Description when blank" },
  { key: "alt_sku", label: "Alternative Part No", required: false, note: "Optional second part number" },
  { key: "alt_name", label: "Alternative Name", required: false, note: "Optional second display name" },
  { key: "description", label: "Product Description", required: false, note: "Uses Product Name when blank. One of Name or Description is required." },
  { key: "category", label: "Category", required: false, note: "Unknown values (e.g. CASE PART) are mapped; blank becomes Other" },
  { key: "sub_category", label: "Sub Category", required: false, note: "Strap type: Leather, Metal, BiMetal…" },
  { key: "model_no", label: "Model No", required: false, note: "Watch or clock model this spare fits" },
  { key: "caliber", label: "Caliber", required: false, note: "Movement caliber" },
  { key: "size", label: "Size", required: false, note: "Optional (client inventory files)" },
  { key: "colour", label: "Colour", required: false, note: "Optional (client inventory files)" },
  { key: "hsn", label: "HSN", required: false, note: "HSN tariff code" },
  { key: "mrp_inr", label: "MRP (INR)", required: false, note: "Maximum retail price in INR" },
  { key: "cost_inr", label: "Cost (INR)", required: false, note: "Cost price in INR" },
  { key: "gst_percent", label: "Tax %", required: false, note: "GST / tax percent 0–100 (IGST % also accepted)" },
  { key: "quantity", label: "Qty", required: false, note: "Optional opening qty — stored as HO stock when present" },
  { key: "is_active", label: "Active", required: false, note: "Y / N — default Y" },
];

export const BULK_IMPORT_PRICES_COLUMNS: BulkImportColumn[] = [
  { key: "sku", label: "Product Code", required: true, note: "Must match Product Code + Watch Brand in Spares" },
  { key: "region_name", label: "Region Name", required: true, note: "Excel dropdown of your regions" },
  { key: "watch_brand", label: "Watch Brand", required: true, note: "Excel dropdown of active brands" },
  { key: "price_inr", label: "Price (INR)", required: true, note: "Selling price in INR (numeric)" },
];

export const BULK_IMPORT_STOCK_COLUMNS: BulkImportColumn[] = [
  { key: "sku", label: "Product Code", required: true, note: "Must match Product Code + Watch Brand in Spares" },
  { key: "watch_brand", label: "Watch Brand", required: true, note: "Excel dropdown of active brands" },
  { key: "location_type", label: "Location Type", required: true, note: "HO or STORE — Excel dropdown" },
  { key: "region_name", label: "Region Name", required: true, note: "Excel dropdown of your regions" },
  { key: "store_name", label: "Store Name", required: false, note: "Required when Location Type = STORE" },
  { key: "quantity", label: "Quantity", required: true, note: "Integer quantity (non-negative)" },
];

/** Normalized Excel header → internal field key (supports client inventory files). */
export const BULK_IMPORT_HEADER_ALIASES: Record<string, string> = {
  sku: "sku",
  product_code: "sku",
  part_no: "sku",
  part_number: "sku",
  part_reference_number: "sku",
  part_reference_no: "sku",
  part_reference: "sku",
  part_ref: "sku",
  part_ref_no: "sku",
  reference_number: "sku",
  name: "name",
  product_name: "name",
  part_full_name: "name",
  alt_sku: "alt_sku",
  alternative_part_no: "alt_sku",
  alternative_part_number: "alt_sku",
  alt_part_no: "alt_sku",
  alt_name: "alt_name",
  alternative_name: "alt_name",
  description: "description",
  product_description: "description",
  category: "category",
  sub_category: "sub_category",
  subcategory: "sub_category",
  model_no: "model_no",
  model: "model_no",
  clock_model: "model_no",
  caliber: "caliber",
  calibre: "caliber",
  size: "size",
  colour: "colour",
  color: "colour",
  hsn: "hsn",
  hsn_code: "hsn",
  hsncode: "hsn",
  mrp_inr: "mrp_inr",
  mrp: "mrp_inr",
  mrp_inr_inr: "mrp_inr",
  cost_inr: "cost_inr",
  cost: "cost_inr",
  gst_percent: "gst_percent",
  tax_percent: "gst_percent",
  tax: "gst_percent",
  igst: "gst_percent",
  igst_percent: "gst_percent",
  cgst_percent: "gst_percent",
  is_active: "is_active",
  active: "is_active",
  region_name: "region_name",
  watch_brand: "watch_brand",
  clock_brand: "watch_brand",
  brand: "watch_brand",
  price_inr: "price_inr",
  location_type: "location_type",
  store_name: "store_name",
  quantity: "quantity",
  qty: "quantity",
  si_no: "si_no",
  sl_no: "si_no",
  sno: "si_no",
};

export function normBulkImportHeader(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/%/g, " percent")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
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

export function bulkImportRequiredKeys(columns: BulkImportColumn[]): string[] {
  return columns.filter((c) => c.required).map((c) => c.key);
}

export function bulkImportColumnLabel(columns: BulkImportColumn[], key: string): string {
  return columns.find((c) => c.key === key)?.label ?? key;
}
