import type { BulkImportColumn } from "./inventoryBulkImportColumns";
import { normBulkImportHeader } from "./inventoryBulkImportColumns";

export type { BulkImportColumn };

/** One supplier per row. Location columns map to the primary address. */
export const SUPPLIER_BULK_IMPORT_COLUMNS: BulkImportColumn[] = [
  { key: "supplier_code", label: "Supplier Code", required: true, note: "Unique code, stored uppercase (e.g. SUP001). Used to update if the supplier already exists." },
  { key: "name", label: "Supplier Name", required: true, note: "Company / trading name" },
  { key: "contact_name", label: "Contact Person", required: false, note: "Primary contact name" },
  { key: "phone", label: "Phone", required: false, note: "10–15 digits; +91 allowed" },
  { key: "email", label: "Email", required: false, note: "Valid email if provided" },
  { key: "gstin", label: "GSTIN", required: false, note: "15-character GSTIN if registered" },
  { key: "tax_person_type", label: "Tax Person Type", required: false, note: "Excel dropdown from Tax Types sheet (Tax & billing settings)" },
  { key: "is_active", label: "Active", required: true, note: "Y / N — Excel dropdown" },
  { key: "door_no", label: "Door / Plot No.", required: false, note: "Primary location" },
  { key: "street", label: "Street", required: false, note: "Primary location" },
  { key: "place", label: "Place / Area", required: false, note: "Primary location" },
  { key: "district", label: "District", required: false, note: "Primary location" },
  { key: "state", label: "State", required: false, note: "e.g. Tamil Nadu" },
  { key: "pin_code", label: "PIN Code", required: false, note: "6-digit PIN if provided" },
];

const SUPPLIER_HEADER_ALIASES: Record<string, string> = {
  supplier_code: "supplier_code",
  code: "supplier_code",
  name: "name",
  supplier_name: "name",
  contact_name: "contact_name",
  contact_person: "contact_name",
  contact: "contact_name",
  phone: "phone",
  mobile: "phone",
  email: "email",
  gstin: "gstin",
  gst: "gstin",
  tax_person_type: "tax_person_type",
  tax_type: "tax_person_type",
  is_active: "is_active",
  active: "is_active",
  door_no: "door_no",
  "door_/_plot_no.": "door_no",
  "door_/_plot_no": "door_no",
  street: "street",
  place: "place",
  "place_/_area": "place",
  district: "district",
  state: "state",
  pin_code: "pin_code",
  pincode: "pin_code",
  pin: "pin_code",
};

export function canonicalSupplierBulkHeader(raw: unknown): string {
  const norm = normBulkImportHeader(raw);
  if (!norm) return "";
  return SUPPLIER_HEADER_ALIASES[norm] ?? norm;
}

export function supplierBulkHeaderLabels(): string[] {
  return SUPPLIER_BULK_IMPORT_COLUMNS.map((c) => c.label);
}

export function supplierBulkColumnKeys(): string[] {
  return SUPPLIER_BULK_IMPORT_COLUMNS.map((c) => c.key);
}

export function supplierBulkColumnLabel(key: string): string {
  return SUPPLIER_BULK_IMPORT_COLUMNS.find((c) => c.key === key)?.label ?? key;
}
