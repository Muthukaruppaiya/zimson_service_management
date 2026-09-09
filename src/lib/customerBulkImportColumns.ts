import type { BulkImportColumn } from "./inventoryBulkImportColumns";
import { normBulkImportHeader } from "./inventoryBulkImportColumns";

export type { BulkImportColumn };

export const CUSTOMER_BULK_IDENTITY_COLUMNS: BulkImportColumn[] = [
  { key: "customer_kind", label: "Customer Kind", required: true, note: "B2C or B2B — Excel dropdown in the template" },
  { key: "salutation", label: "Salutation", required: false, note: "Mr. / Mrs. / Ms. / Miss / Dr. — Excel dropdown" },
  { key: "first_name", label: "First Name", required: false, note: "Required for B2C" },
  { key: "last_name", label: "Last Name", required: false, note: "Required for B2C" },
  { key: "display_name", label: "Display Name", required: false, note: "Required for B2B (trade / display name)" },
  { key: "phone", label: "Primary Mobile", required: true, note: "10 digits. Upsert key — matching mobile updates the existing customer." },
  { key: "otp_phone", label: "OTP Mobile", required: false, note: "If SMS OTP should go to a different number later. Not verified on import." },
  { key: "alternate_phone", label: "Alternate Mobile", required: false, note: "Optional extra mobile" },
  { key: "telephone", label: "Telephone", required: false, note: "Landline / other" },
  { key: "email", label: "Email", required: false, note: "Optional. Format checked if filled. No email OTP on bulk import." },
  { key: "dob", label: "Date of Birth", required: false, note: "DD/MM/YYYY (e.g. 12/04/1988)" },
  { key: "anniversary_date", label: "Anniversary Date", required: false, note: "DD/MM/YYYY (e.g. 20/12/2014); must be at least 18 years after DOB if both set" },
  { key: "company", label: "Company", required: false, note: "Required for B2B" },
  { key: "gstin", label: "GSTIN", required: false, note: "Required for B2B — valid 15-character GSTIN" },
  { key: "pan", label: "PAN", required: false, note: "Required for B2B. Optional for B2C." },
  { key: "tax_preference", label: "Tax Preference", required: false, note: "B2B: with_tax or without_tax_exhibited — Excel dropdown" },
  { key: "remark_attention", label: "Remark / Attention", required: false, note: "Optional remark" },
  { key: "reference_name", label: "Reference Name", required: false, note: "Optional" },
  { key: "representative_name", label: "Representative Name", required: false, note: "Optional" },
];

export const CUSTOMER_BULK_BILLING_COLUMNS: BulkImportColumn[] = [
  { key: "bill_line1", label: "Billing Address Line 1", required: true, note: "Door / plot / building" },
  { key: "bill_line2", label: "Billing Address Line 2", required: false, note: "Street / area" },
  { key: "bill_city", label: "Billing City", required: true, note: "" },
  { key: "bill_district", label: "Billing District", required: true, note: "" },
  { key: "bill_state", label: "Billing State", required: true, note: "" },
  { key: "bill_country", label: "Billing Country", required: false, note: "Country id or name (default IN)" },
  { key: "bill_pin", label: "Billing PIN", required: true, note: "4–12 characters (6-digit PIN for India)" },
  { key: "same_shipping", label: "Same Shipping As Billing", required: false, note: "Y / N (default Y) — Excel dropdown. If Y, shipping columns are ignored." },
  { key: "ship_line1", label: "Shipping Address Line 1", required: false, note: "Required when Same Shipping = N" },
  { key: "ship_line2", label: "Shipping Address Line 2", required: false, note: "" },
  { key: "ship_city", label: "Shipping City", required: false, note: "Required when Same Shipping = N" },
  { key: "ship_district", label: "Shipping District", required: false, note: "Required when Same Shipping = N" },
  { key: "ship_state", label: "Shipping State", required: false, note: "Required when Same Shipping = N" },
  { key: "ship_country", label: "Shipping Country", required: false, note: "Default IN" },
  { key: "ship_pin", label: "Shipping PIN", required: false, note: "Required when Same Shipping = N" },
];

export const CUSTOMER_BULK_EXTRA_COLUMNS: BulkImportColumn[] = [
  { key: "add1_line1", label: "Addl Address 1 Line 1", required: false, note: "Leave blank to skip extra address 1" },
  { key: "add1_line2", label: "Addl Address 1 Line 2", required: false, note: "" },
  { key: "add1_city", label: "Addl Address 1 City", required: false, note: "Required if extra address 1 is used" },
  { key: "add1_district", label: "Addl Address 1 District", required: false, note: "" },
  { key: "add1_state", label: "Addl Address 1 State", required: false, note: "" },
  { key: "add1_country", label: "Addl Address 1 Country", required: false, note: "" },
  { key: "add1_pin", label: "Addl Address 1 PIN", required: false, note: "" },
  { key: "add2_line1", label: "Addl Address 2 Line 1", required: false, note: "Leave blank to skip extra address 2" },
  { key: "add2_line2", label: "Addl Address 2 Line 2", required: false, note: "" },
  { key: "add2_city", label: "Addl Address 2 City", required: false, note: "Required if extra address 2 is used" },
  { key: "add2_district", label: "Addl Address 2 District", required: false, note: "" },
  { key: "add2_state", label: "Addl Address 2 State", required: false, note: "" },
  { key: "add2_country", label: "Addl Address 2 Country", required: false, note: "" },
  { key: "add2_pin", label: "Addl Address 2 PIN", required: false, note: "" },
];

export const CUSTOMER_BULK_IMPORT_COLUMNS: BulkImportColumn[] = [
  ...CUSTOMER_BULK_IDENTITY_COLUMNS,
  ...CUSTOMER_BULK_BILLING_COLUMNS,
  ...CUSTOMER_BULK_EXTRA_COLUMNS,
];

const CUSTOMER_HEADER_ALIASES: Record<string, string> = {
  customer_kind: "customer_kind",
  type: "customer_kind",
  kind: "customer_kind",
  salutation: "salutation",
  first_name: "first_name",
  last_name: "last_name",
  display_name: "display_name",
  b2b_display_name: "display_name",
  trade_name: "display_name",
  phone: "phone",
  primary_mobile: "phone",
  mobile: "phone",
  otp_phone: "otp_phone",
  otp_mobile: "otp_phone",
  alternate_phone: "alternate_phone",
  alternate_mobile: "alternate_phone",
  telephone: "telephone",
  email: "email",
  dob: "dob",
  date_of_birth: "dob",
  anniversary_date: "anniversary_date",
  anniversary: "anniversary_date",
  company: "company",
  gstin: "gstin",
  gst: "gstin",
  pan: "pan",
  tax_preference: "tax_preference",
  remark_attention: "remark_attention",
  remark: "remark_attention",
  attention: "remark_attention",
  reference_name: "reference_name",
  representative_name: "representative_name",
  billing_address_line_1: "bill_line1",
  billing_address_line_2: "bill_line2",
  billing_city: "bill_city",
  billing_district: "bill_district",
  billing_state: "bill_state",
  billing_country: "bill_country",
  billing_pin: "bill_pin",
  same_shipping_as_billing: "same_shipping",
  shipping_address_line_1: "ship_line1",
  shipping_address_line_2: "ship_line2",
  shipping_city: "ship_city",
  shipping_district: "ship_district",
  shipping_state: "ship_state",
  shipping_country: "ship_country",
  shipping_pin: "ship_pin",
  addl_address_1_line_1: "add1_line1",
  addl_address_1_line_2: "add1_line2",
  addl_address_1_city: "add1_city",
  addl_address_1_district: "add1_district",
  addl_address_1_state: "add1_state",
  addl_address_1_country: "add1_country",
  addl_address_1_pin: "add1_pin",
  addl_address_2_line_1: "add2_line1",
  addl_address_2_line_2: "add2_line2",
  addl_address_2_city: "add2_city",
  addl_address_2_district: "add2_district",
  addl_address_2_state: "add2_state",
  addl_address_2_country: "add2_country",
  addl_address_2_pin: "add2_pin",
};

export function canonicalCustomerBulkHeader(raw: unknown): string {
  const norm = normBulkImportHeader(raw);
  if (!norm) return "";
  return CUSTOMER_HEADER_ALIASES[norm] ?? norm;
}

export function customerBulkHeaderLabels(): string[] {
  return CUSTOMER_BULK_IMPORT_COLUMNS.map((c) => c.label);
}

export function customerBulkColumnKeys(): string[] {
  return CUSTOMER_BULK_IMPORT_COLUMNS.map((c) => c.key);
}

export function customerBulkColumnLabel(key: string): string {
  return CUSTOMER_BULK_IMPORT_COLUMNS.find((c) => c.key === key)?.label ?? key;
}
