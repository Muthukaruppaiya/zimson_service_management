import type { BulkImportColumn } from "./inventoryBulkImportColumns";
import { normBulkImportHeader } from "./inventoryBulkImportColumns";

export type { BulkImportColumn };

export const BRAND_BULK_IMPORT_COLUMNS: BulkImportColumn[] = [
  { key: "name", label: "Brand Name", required: true, note: "Unique display name (e.g. Rolex). Matching name updates the existing brand." },
  { key: "code", label: "Code", required: false, note: "Letters and digits, stored uppercase. Auto-generated from the name if blank." },
  { key: "sort_order", label: "Display Order", required: false, note: "Integer. Lower numbers appear first. Default 0." },
  { key: "is_active", label: "Active", required: true, note: "Y / N — Excel dropdown. Inactive brands are hidden from dropdowns." },
  { key: "serial_number_required", label: "Serial Number Mandatory", required: true, note: "Y / N — Excel dropdown. If Y, serial is required on SRF / billing." },
];

const BRAND_HEADER_ALIASES: Record<string, string> = {
  name: "name",
  brand_name: "name",
  brand: "name",
  code: "code",
  brand_code: "code",
  sort_order: "sort_order",
  display_order: "sort_order",
  order: "sort_order",
  is_active: "is_active",
  active: "is_active",
  serial_number_required: "serial_number_required",
  serial_number_mandatory: "serial_number_required",
  serial_mandatory: "serial_number_required",
};

export function canonicalBrandBulkHeader(raw: unknown): string {
  const norm = normBulkImportHeader(raw);
  if (!norm) return "";
  return BRAND_HEADER_ALIASES[norm] ?? norm;
}

export function brandBulkHeaderLabels(): string[] {
  return BRAND_BULK_IMPORT_COLUMNS.map((c) => c.label);
}

export function brandBulkColumnKeys(): string[] {
  return BRAND_BULK_IMPORT_COLUMNS.map((c) => c.key);
}

export function brandBulkColumnLabel(key: string): string {
  return BRAND_BULK_IMPORT_COLUMNS.find((c) => c.key === key)?.label ?? key;
}
