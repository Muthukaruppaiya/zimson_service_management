import type { Express, NextFunction, Request, Response } from "express";
import multer from "multer";
import type { Pool, PoolClient } from "pg";
import * as XLSX from "xlsx";
import { createId } from "../src/lib/id";
import { validateCustomerAnniversary } from "../src/lib/customerAddress";
import { validateCustomerB2bGstin } from "../src/lib/zimsonCompanyGst";
import type { CustomerKind, TaxPreference } from "../src/types/customer";
import type { DemoUser } from "../src/types/user";
import { isValidGstin } from "./mastersIndiaEdoc/types";
import {
  canonicalCustomerBulkHeader,
  customerBulkRequiredKeys,
  customerBulkColumnLabel,
  customerBulkHeaderLabels,
} from "../src/lib/customerBulkImportColumns";
import {
  EXCEL_CUSTOMER_KINDS,
  EXCEL_SALUTATIONS,
  EXCEL_TAX_PREFERENCES,
  EXCEL_YES_NO,
  withExcelDropdowns,
} from "./excelListValidation";

type Authed = Request & { userId: string };

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

const HEADER_LABELS = customerBulkHeaderLabels();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const SALUTATIONS = new Set(["MR.", "MRS.", "MS.", "MISS", "DR."]);
const MAX_ERRORS = 80;

type Addr = {
  addressLine1: string;
  addressLine2: string;
  city: string;
  district: string;
  state: string;
  countryId: string;
  pincode: string;
};

type CustomerImportRow = {
  rowNum: number;
  customerCode: string | null;
  customerKind: CustomerKind;
  salutation: string | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  phone: string;
  phoneLast10: string;
  otpPhone: string | null;
  alternatePhone: string | null;
  telephone: string | null;
  email: string;
  dob: string | null;
  anniversaryDate: string | null;
  company: string | null;
  gst: string | null;
  pan: string | null;
  taxPreference: TaxPreference | null;
  remarkAttention: string | null;
  referenceName: string | null;
  representativeName: string | null;
  billing: Addr;
  shipping: Addr;
  additional: Addr[];
};

function canImport(actor: DemoUser | null): boolean {
  const role = actor?.role;
  return (
    role === "super_admin" ||
    role === "admin" ||
    role === "ho_manager" ||
    role === "ho_accounts" ||
    role === "store_user" ||
    role === "store_manager" ||
    role === "store_accounts"
  );
}

function cellStr(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  return String(v).trim();
}

function parseBool(v: unknown, defaultYes = false): boolean | null {
  const s = cellStr(v).toLowerCase();
  if (!s) return defaultYes ? true : null;
  if (["y", "yes", "true", "1"].includes(s)) return true;
  if (["n", "no", "false", "0"].includes(s)) return false;
  return null;
}

function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, "");
}

function phoneLast10(raw: string): string {
  const d = digitsOnly(raw);
  return d.length > 10 ? d.slice(-10) : d;
}

function findSheet(wb: XLSX.WorkBook, name: string): XLSX.WorkSheet | undefined {
  const n = name.toLowerCase();
  const sn = wb.SheetNames.find((s) => s.trim().toLowerCase() === n);
  return sn ? wb.Sheets[sn] : undefined;
}

function sheetRows(sheet: XLSX.WorkSheet | undefined): Record<string, unknown>[] {
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true });
  if (rows.length < 2) return [];
  const headers = (rows[0] as unknown[]).map((h) => canonicalCustomerBulkHeader(h));
  const out: Record<string, unknown>[] = [];
  for (let i = 1; i < rows.length; i++) {
    const line = rows[i] as unknown[];
    if (!line || line.every((c) => cellStr(c) === "")) continue;
    const obj: Record<string, unknown> = {};
    for (let j = 0; j < headers.length; j++) {
      const key = headers[j];
      if (!key) continue;
      obj[key] = line[j];
    }
    out.push(obj);
  }
  return out;
}

function findCustomersSheet(wb: XLSX.WorkBook): XLSX.WorkSheet | undefined {
  const named = findSheet(wb, "Customers") ?? findSheet(wb, "Customer");
  if (named) return named;
  for (const name of wb.SheetNames) {
    if (name.trim().toLowerCase() === "readme") continue;
    const sh = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sh, { header: 1, defval: "" });
    const headers = ((rows[0] as unknown[]) ?? []).map((h) => canonicalCustomerBulkHeader(h));
    if (headers.includes("phone") || headers.includes("first_name")) return sh;
  }
  return undefined;
}

function assertHeaders(sheet: XLSX.WorkSheet | undefined): string[] {
  if (!sheet) return ['Missing "Customers" sheet. Use the downloaded template or a file with Primary Mobile.'];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  if (rows.length < 1) return ["Customers: sheet is empty."];
  const headers = (rows[0] as unknown[]).map((h) => canonicalCustomerBulkHeader(h)).filter(Boolean);
  const missing = customerBulkRequiredKeys().filter((e) => !headers.includes(e));
  if (missing.length) {
    const missingLabels = missing.map((k) => customerBulkColumnLabel(k));
    return [`Customers: missing required column(s): ${missingLabels.join(", ")}.`];
  }
  return [];
}

function parseExcelDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    const parsed = XLSX.SSF.parse_date_code(v);
    if (!parsed) return null;
    return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const s = cellStr(v);
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${dmy[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

function normalizeSalutation(raw: string): string | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!s.endsWith(".") && s.toUpperCase() !== "MISS") s = `${s}.`;
  const key = s.toUpperCase();
  if (key === "MISS" || key === "MISS.") return "Miss";
  if (SALUTATIONS.has(key)) {
    return `${key.charAt(0)}${key.slice(1, -1).toLowerCase()}.`;
  }
  return null;
}

function normalizeKind(raw: string): CustomerKind | null {
  const s = raw.trim().toUpperCase();
  if (s === "B2C" || s === "B2B") return s;
  return null;
}

function normalizeTaxPref(raw: string): TaxPreference | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, "_");
  if (!s) return null;
  if (["with_tax", "withtax", "taxable", "yes"].includes(s)) return "with_tax";
  if (["without_tax_exhibited", "without_tax", "exhibited", "no"].includes(s)) return "without_tax_exhibited";
  return null;
}

function addrHasAny(a: { line1: string; line2: string; city: string; district: string; state: string; pin: string }): boolean {
  return !!(a.line1 || a.line2 || a.city || a.district || a.state || a.pin);
}

function addrComplete(a: Addr): boolean {
  const pin = a.pincode.trim();
  if (pin.length < 4 || pin.length > 12) return false;
  return !!(a.addressLine1 && a.city && a.district && a.state && a.countryId);
}

function toStorageAddr(a: Addr): Record<string, string> {
  return {
    addressLine1: a.addressLine1,
    addressLine2: a.addressLine2,
    doorNo: a.addressLine1,
    street: a.addressLine2,
    city: a.city,
    district: a.district,
    state: a.state,
    countryId: a.countryId,
    pincode: a.pincode,
  };
}

function resolveCountry(
  raw: string,
  byId: Map<string, string>,
  byName: Map<string, string>,
): string | null {
  const s = raw.trim();
  if (!s) return "IN";
  const idHit = byId.get(s.toUpperCase());
  if (idHit) return idHit;
  const nameHit = byName.get(s.toLowerCase());
  if (nameHit) return nameHit;
  return null;
}

function buildAddr(
  r: Record<string, unknown>,
  prefix: "bill" | "ship" | "add1" | "add2",
  countriesById: Map<string, string>,
  countriesByName: Map<string, string>,
): { addr: Addr; countryErr: string | null } {
  const line1Key = prefix === "bill" ? "bill_line1" : prefix === "ship" ? "ship_line1" : `${prefix}_line1`;
  const line2Key = prefix === "bill" ? "bill_line2" : prefix === "ship" ? "ship_line2" : `${prefix}_line2`;
  const cityKey = prefix === "bill" ? "bill_city" : prefix === "ship" ? "ship_city" : `${prefix}_city`;
  const distKey = prefix === "bill" ? "bill_district" : prefix === "ship" ? "ship_district" : `${prefix}_district`;
  const stateKey = prefix === "bill" ? "bill_state" : prefix === "ship" ? "ship_state" : `${prefix}_state`;
  const ctryKey = prefix === "bill" ? "bill_country" : prefix === "ship" ? "ship_country" : `${prefix}_country`;
  const pinKey = prefix === "bill" ? "bill_pin" : prefix === "ship" ? "ship_pin" : `${prefix}_pin`;
  const countryRaw = cellStr(r[ctryKey]);
  const countryId = resolveCountry(countryRaw, countriesById, countriesByName);
  return {
    addr: {
      addressLine1: cellStr(r[line1Key]),
      addressLine2: cellStr(r[line2Key]),
      city: cellStr(r[cityKey]),
      district: cellStr(r[distKey]),
      state: cellStr(r[stateKey]),
      countryId: countryId ?? "",
      pincode: cellStr(r[pinKey]).replace(/\s/g, ""),
    },
    countryErr: countryRaw && countryId == null ? `Unknown country "${countryRaw}"` : null,
  };
}

function parseRows(
  rows: Record<string, unknown>[],
  countriesById: Map<string, string>,
  countriesByName: Map<string, string>,
): { rows: CustomerImportRow[]; errors: string[] } {
  const errors: string[] = [];
  const parsed: CustomerImportRow[] = [];
  const seenPhone = new Map<string, number>();

  rows.forEach((r, idx) => {
    const rowNum = idx + 2;
    const kind = normalizeKind(cellStr(r.customer_kind));
    const phoneRaw = cellStr(r.phone);
    const p10 = phoneLast10(phoneRaw);
    const rowErrs: string[] = [];

    if (!kind) rowErrs.push(`Customers row ${rowNum}: Customer Kind must be B2C or B2B.`);
    if (p10.length !== 10) {
      rowErrs.push(`Customers row ${rowNum}: Primary Mobile must be a 10-digit number.`);
    } else {
      const prev = seenPhone.get(p10);
      if (prev) rowErrs.push(`Customers row ${rowNum}: duplicate Primary Mobile (also on row ${prev}).`);
      else seenPhone.set(p10, rowNum);
    }

    const salRaw = cellStr(r.salutation);
    let salutation: string | null = null;
    if (salRaw) {
      salutation = normalizeSalutation(salRaw);
      if (!salutation) rowErrs.push(`Customers row ${rowNum}: Salutation must be Mr. / Mrs. / Ms. / Miss / Dr.`);
    }

    const firstName = cellStr(r.first_name) || null;
    const lastName = cellStr(r.last_name) || null;
    const displayIn = cellStr(r.display_name);
    const emailRaw = cellStr(r.email).toLowerCase();
    if (emailRaw && !EMAIL_RE.test(emailRaw)) {
      rowErrs.push(`Customers row ${rowNum}: Email is not valid. Leave blank if unknown — email is not mandatory.`);
    }

    const dob = r.dob != null && cellStr(r.dob) !== "" ? parseExcelDate(r.dob) : null;
    if (r.dob != null && cellStr(r.dob) !== "" && !dob) {
      rowErrs.push(`Customers row ${rowNum}: Date of Birth must be DD/MM/YYYY (e.g. 12/04/1988).`);
    }
    const anniversaryDate =
      r.anniversary_date != null && cellStr(r.anniversary_date) !== "" ? parseExcelDate(r.anniversary_date) : null;
    if (r.anniversary_date != null && cellStr(r.anniversary_date) !== "" && !anniversaryDate) {
      rowErrs.push(`Customers row ${rowNum}: Anniversary Date must be DD/MM/YYYY (e.g. 20/12/2014).`);
    }
    if (dob || anniversaryDate) {
      const annErr = validateCustomerAnniversary(dob ?? "", anniversaryDate ?? "");
      if (annErr) rowErrs.push(`Customers row ${rowNum}: ${annErr}`);
    }

    const company = cellStr(r.company) || null;
    const gstRaw = cellStr(r.gstin).toUpperCase().replace(/\s/g, "");
    const panRaw = cellStr(r.pan).toUpperCase().replace(/\s/g, "");
    const taxRaw = cellStr(r.tax_preference);
    let taxPreference: TaxPreference | null = null;
    if (taxRaw) {
      taxPreference = normalizeTaxPref(taxRaw);
      if (!taxPreference) {
        rowErrs.push(`Customers row ${rowNum}: Tax Preference must be with_tax or without_tax_exhibited.`);
      }
    }

    if (kind === "B2C") {
      if (!firstName) rowErrs.push(`Customers row ${rowNum}: First Name is required for B2C.`);
      if (panRaw && !PAN_RE.test(panRaw)) rowErrs.push(`Customers row ${rowNum}: PAN is invalid.`);
      if (gstRaw) {
        if (!isValidGstin(gstRaw)) rowErrs.push(`Customers row ${rowNum}: GSTIN must be a valid 15-character GSTIN.`);
        const z = validateCustomerB2bGstin(gstRaw);
        if (z) rowErrs.push(`Customers row ${rowNum}: ${z}`);
      }
    } else if (kind === "B2B") {
      if (!displayIn) rowErrs.push(`Customers row ${rowNum}: Display Name is required for B2B.`);
      if (!company) rowErrs.push(`Customers row ${rowNum}: Company is required for B2B.`);
      if (!gstRaw || !isValidGstin(gstRaw)) {
        rowErrs.push(`Customers row ${rowNum}: Valid 15-character GSTIN is required for B2B.`);
      } else {
        const z = validateCustomerB2bGstin(gstRaw);
        if (z) rowErrs.push(`Customers row ${rowNum}: ${z}`);
      }
      const panValue = panRaw || (gstRaw.length === 15 ? gstRaw.slice(2, 12) : "");
      if (!PAN_RE.test(panValue)) rowErrs.push(`Customers row ${rowNum}: Valid PAN is required for B2B.`);
      if (!taxPreference) taxPreference = "with_tax";
    }

    const billBuilt = buildAddr(r, "bill", countriesById, countriesByName);
    if (billBuilt.countryErr) rowErrs.push(`Customers row ${rowNum}: Billing — ${billBuilt.countryErr}.`);
    if (!addrComplete(billBuilt.addr)) {
      rowErrs.push(`Customers row ${rowNum}: Complete billing address (line 1, city, district, state, country, PIN).`);
    }

    const sameShip = parseBool(r.same_shipping, true);
    if (sameShip === null) {
      rowErrs.push(`Customers row ${rowNum}: Same Shipping As Billing must be Y or N.`);
    }
    let shipping = billBuilt.addr;
    if (sameShip === false) {
      const shipBuilt = buildAddr(r, "ship", countriesById, countriesByName);
      if (shipBuilt.countryErr) rowErrs.push(`Customers row ${rowNum}: Shipping — ${shipBuilt.countryErr}.`);
      if (!addrComplete(shipBuilt.addr)) {
        rowErrs.push(`Customers row ${rowNum}: Complete shipping address or set Same Shipping As Billing to Y.`);
      }
      shipping = shipBuilt.addr;
    }

    const additional: Addr[] = [];
    for (const prefix of ["add1", "add2"] as const) {
      const built = buildAddr(r, prefix, countriesById, countriesByName);
      const partial = {
        line1: built.addr.addressLine1,
        line2: built.addr.addressLine2,
        city: built.addr.city,
        district: built.addr.district,
        state: built.addr.state,
        pin: built.addr.pincode,
      };
      if (!addrHasAny(partial) && !cellStr(r[`${prefix}_country`])) continue;
      if (built.countryErr) rowErrs.push(`Customers row ${rowNum}: Extra address — ${built.countryErr}.`);
      if (!addrComplete(built.addr)) {
        rowErrs.push(
          `Customers row ${rowNum}: Extra address ${prefix === "add1" ? "1" : "2"} is incomplete (or clear all its columns).`,
        );
      } else {
        additional.push(built.addr);
      }
    }

    const alt = cellStr(r.alternate_phone);
    const tel = cellStr(r.telephone);
    const otpRaw = cellStr(r.otp_phone);
    const otpDigits = digitsOnly(otpRaw);
    const otpPhoneStored =
      otpDigits.length >= 10 && phoneLast10(otpDigits) !== p10 ? otpDigits.slice(-10) : null;

    errors.push(...rowErrs);
    if (rowErrs.length > 0 || !kind || p10.length !== 10) return;

    const displayName =
      kind === "B2B"
        ? displayIn
        : [salutation, firstName, lastName].filter(Boolean).join(" ").trim() || displayIn;

    parsed.push({
      rowNum,
      customerCode: cellStr(r.customer_code).toUpperCase() || null,
      customerKind: kind,
      salutation,
      firstName,
      lastName,
      displayName,
      phone: p10,
      phoneLast10: p10,
      otpPhone: otpPhoneStored,
      alternatePhone: alt ? digitsOnly(alt) || null : null,
      telephone: tel || null,
      email: emailRaw,
      dob,
      anniversaryDate,
      company: kind === "B2B" ? company : company,
      gst: gstRaw || null,
      pan: panRaw || (kind === "B2B" && gstRaw ? gstRaw.slice(2, 12) : null),
      taxPreference: kind === "B2B" ? taxPreference : null,
      remarkAttention: cellStr(r.remark_attention) || null,
      referenceName: cellStr(r.reference_name) || null,
      representativeName: cellStr(r.representative_name) || null,
      billing: billBuilt.addr,
      shipping,
      additional,
    });
  });

  return { rows: parsed, errors: errors.slice(0, MAX_ERRORS) };
}

async function loadCountries(pool: Pool): Promise<{ byId: Map<string, string>; byName: Map<string, string> }> {
  const byId = new Map<string, string>();
  const byName = new Map<string, string>();
  try {
    const { rows } = await pool.query<{ id: string; name: string }>(`SELECT id, name FROM countries`);
    for (const row of rows) {
      byId.set(row.id.toUpperCase(), row.id);
      byName.set(row.name.toLowerCase(), row.id);
    }
  } catch {
    /* fallback */
  }
  if (!byId.has("IN")) {
    byId.set("IN", "IN");
    byName.set("india", "IN");
  }
  return { byId, byName };
}

async function nextCustomerCode(
  client: PoolClient,
): Promise<string> {
  const yy = String(new Date().getFullYear()).slice(-2);
  const seq = await client.query<{ last_value: number }>(
    `INSERT INTO number_sequences (prefix, scope_code, year_2, last_value)
     VALUES ('CUST', 'GLOBAL', $1, 1001)
     ON CONFLICT (prefix, scope_code, year_2)
     DO UPDATE SET last_value = number_sequences.last_value + 1
     RETURNING last_value`,
    [yy],
  );
  const num = String(seq.rows[0]!.last_value).padStart(5, "0");
  return `CUST${yy}${num}`;
}

const SEED_CUSTOMERS: string[][] = [
  [
    "B2C", "Mr.", "Arun", "Nair", "", "9876501234", "", "", "", "", "12/04/1988", "",
    "", "", "", "", "", "", "",
    "12 Anna Nagar", "2nd Street", "Coimbatore", "Coimbatore", "Tamil Nadu", "IN", "641004",
    "Y", "", "", "", "", "", "", "",
    "", "", "", "", "", "", "",
    "", "", "", "", "", "", "",
  ],
  [
    "B2C", "Ms.", "Priya", "Menon", "", "9876505678", "", "9123456780", "", "priya.menon@example.com", "03/11/1992", "20/12/2014",
    "", "", "", "", "", "", "",
    "8 Race Course", "", "Chennai", "Chennai", "Tamil Nadu", "IN", "600006",
    "Y", "", "", "", "", "", "", "",
    "", "", "", "", "", "", "",
    "", "", "", "", "", "", "",
  ],
  [
    "B2B", "Mr.", "", "", "Horizon Timepieces", "9876509999", "", "", "0441234567", "accounts@horizontime.example", "", "",
    "Horizon Timepieces Pvt Ltd", "33AABCH1234A1Z5", "AABCH1234A", "with_tax", "Accounts", "Ravi", "Suresh",
    "44 Avinashi Road", "Peelamedu", "Coimbatore", "Coimbatore", "Tamil Nadu", "IN", "641004",
    "N", "Warehouse 2", "SIDCO", "Coimbatore", "Coimbatore", "Tamil Nadu", "IN", "641021",
    "", "", "", "", "", "", "",
    "", "", "", "", "", "", "",
  ],
];

async function buildTemplateWorkbook(): Promise<Buffer> {
  const wb = XLSX.utils.book_new();
  const readme: string[][] = [
    ["ZIMSON SERVICE MANAGEMENT — Customer Bulk Import"],
    [""],
    ["HOW TO USE"],
    ["1. Do NOT change column header names (row 1) on the Customers sheet."],
    ["2. Replace or delete the sample rows, then add customers from row 2."],
    ["3. Save as .xlsx and upload on Customer master → Bulk import."],
    ["4. Click Check file first. Import is enabled only after validation passes."],
    ["5. Matching Primary Mobile updates the existing customer; new mobiles create customers."],
    ["6. Customer Number is assigned by the system (CUST + year + sequence). Leave any Customer Number column blank."],
    [""],
    ["VERIFICATION"],
    ["Bulk import does NOT send SMS or email OTP. Email is optional."],
    ["Imported customers are saved as migrated (unverified). Verify later from the counter if needed."],
    [""],
    ["B2C: First Name + Primary Mobile + billing address. Last / second name is optional."],
    ["B2B: Display Name + Company + GSTIN + PAN + Primary Mobile + billing address."],
    ["Same Shipping As Billing = Y copies billing to shipping."],
    ["Dates (Date of Birth, Anniversary): use DD/MM/YYYY, e.g. 12/04/1988."],
    [""],
    ["DROPDOWNS"],
    ["Customer Kind, Salutation, Tax Preference, and Same Shipping As Billing are Excel dropdowns."],
    ["Pick from the list (see the Dropdowns sheet). Check file still validates after upload."],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(readme), "README");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADER_LABELS, ...SEED_CUSTOMERS]), "Customers");
  return withExcelDropdowns(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer, [
    { sheetName: "Customers", header: "Customer Kind", values: [...EXCEL_CUSTOMER_KINDS] },
    { sheetName: "Customers", header: "Salutation", values: [...EXCEL_SALUTATIONS] },
    { sheetName: "Customers", header: "Tax Preference", values: [...EXCEL_TAX_PREFERENCES] },
    { sheetName: "Customers", header: "Same Shipping As Billing", values: [...EXCEL_YES_NO] },
  ]);
}

async function parseUploaded(pool: Pool, buffer: Buffer) {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = findCustomersSheet(wb);
  const headerErrors = assertHeaders(sheet);
  const { byId, byName } = await loadCountries(pool);
  if (headerErrors.length) {
    return { headerErrors, rows: [] as CustomerImportRow[], parseErrors: [] as string[] };
  }
  const raw = sheetRows(sheet);
  const { rows, errors } = parseRows(raw, byId, byName);
  const parseErrors = [...errors];
  if (rows.length === 0 && errors.length === 0) {
    parseErrors.push("No customer rows found. Add at least one row under the header.");
  }
  return { headerErrors, rows, parseErrors };
}

async function classifyAgainstDb(pool: Pool, rows: CustomerImportRow[]) {
  const phones = rows.map((r) => r.phoneLast10);
  const { rows: existing } = await pool.query<{ phone_last10: string }>(
    `SELECT phone_last10 FROM customers WHERE phone_last10 = ANY($1::text[])`,
    [phones],
  );
  const existingSet = new Set(existing.map((r) => String(r.phone_last10)));
  let willCreate = 0;
  let willUpdate = 0;
  const preview = rows.slice(0, 25).map((r) => {
    const action: "create" | "update" = existingSet.has(r.phoneLast10) ? "update" : "create";
    if (action === "update") willUpdate += 1;
    else willCreate += 1;
    return { phone: r.phoneLast10, name: r.displayName, kind: r.customerKind, action };
  });
  if (rows.length > 25) {
    for (const r of rows.slice(25)) {
      if (existingSet.has(r.phoneLast10)) willUpdate += 1;
      else willCreate += 1;
    }
  }
  return { willCreate, willUpdate, preview, existingSet };
}

function legacyAddress(billing: Addr): { address: string; city: string } {
  const address = [
    `Billing: ${billing.addressLine1}, ${billing.addressLine2}`.replace(/, $/, ""),
    `${billing.city}, ${billing.district}, ${billing.state}`,
  ].join("\n");
  return { address, city: `${billing.city}, ${billing.district}`.slice(0, 120) };
}

async function commitRows(
  client: PoolClient,
  actorId: string,
  rows: CustomerImportRow[],
  existingSet: Set<string>,
  registeredStoreId: string | null,
): Promise<void> {
  for (const row of rows) {
    const { address, city } = legacyAddress(row.billing);
    const billJson = JSON.stringify(toStorageAddr(row.billing));
    const shipJson = JSON.stringify(toStorageAddr(row.shipping));
    const addJson = JSON.stringify(row.additional.map((a) => toStorageAddr(a)));
    if (existingSet.has(row.phoneLast10)) {
      await client.query(
        `UPDATE customers SET
           display_name = $2,
           salutation = $3,
           first_name = $4,
           last_name = $5,
           phone = $6,
           phone_last10 = $7,
           alternate_phone = $8,
           otp_phone = $9,
           telephone = $10,
           email = $11,
           dob = $12::date,
           anniversary_date = $13::date,
           address = $14,
           city = $15,
           customer_kind = $16,
           company = $17,
           gst = $18,
           pan = $19,
           billing_address = $20::jsonb,
           shipping_address = $21::jsonb,
           tax_preference = $22,
           b2b_trade_display_name = $23,
           remark_attention = $24,
           reference_name = $25,
           representative_name = $26,
           additional_addresses = $27::jsonb,
           is_active = true,
           modified_by = $28,
           updated_at = now()
         WHERE phone_last10 = $1`,
        [
          row.phoneLast10,
          row.displayName,
          row.salutation,
          row.firstName,
          row.lastName,
          row.phone,
          row.phoneLast10,
          row.alternatePhone,
          row.otpPhone,
          row.telephone,
          row.email,
          row.dob,
          row.anniversaryDate,
          address,
          city,
          row.customerKind,
          row.company,
          row.gst,
          row.pan,
          billJson,
          shipJson,
          row.taxPreference,
          row.customerKind === "B2B" ? row.displayName : null,
          row.remarkAttention,
          row.referenceName,
          row.representativeName,
          addJson,
          actorId,
        ],
      );
    } else {
      const id = createId("cust");
      let customerCode = row.customerCode;
      if (customerCode) {
        const taken = await client.query(`SELECT 1 FROM customers WHERE customer_code = $1 LIMIT 1`, [customerCode]);
        if (taken.rowCount && taken.rowCount > 0) customerCode = null;
      }
      if (!customerCode) customerCode = await nextCustomerCode(client);
      await client.query(
        `INSERT INTO customers (
           id, customer_code, display_name, salutation, first_name, last_name,
           phone, phone_last10, alternate_phone, otp_phone, telephone, email,
           dob, anniversary_date,
           address, city,
           customer_kind, company, gst, pan,
           billing_address, shipping_address,
           tax_preference, b2b_trade_display_name,
           remark_attention, reference_name, representative_name,
           additional_addresses,
           phone_verified_at, email_verified_at, customer_data_source,
           created_by, modified_by, registered_store_id
         ) VALUES (
           $1, $2, $3, $4, $5, $6,
           $7, $8, $9, $10, $11, $12,
           $13::date, $14::date,
           $15, $16,
           $17, $18, $19, $20,
           $21::jsonb, $22::jsonb,
           $23, $24,
           $25, $26, $27,
           $28::jsonb,
           NULL, NULL, 'migrated',
           $29, $29, $30
         )`,
        [
          id,
          customerCode,
          row.displayName,
          row.salutation,
          row.firstName,
          row.lastName,
          row.phone,
          row.phoneLast10,
          row.alternatePhone,
          row.otpPhone,
          row.telephone,
          row.email,
          row.dob,
          row.anniversaryDate,
          address,
          city,
          row.customerKind,
          row.company,
          row.gst,
          row.pan,
          billJson,
          shipJson,
          row.taxPreference,
          row.customerKind === "B2B" ? row.displayName : null,
          row.remarkAttention,
          row.referenceName,
          row.representativeName,
          addJson,
          actorId,
          registeredStoreId,
        ],
      );
    }
  }
}

export function registerCustomerBulkImportRoutes(
  app: Express,
  pool: Pool,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
  getUserById: (id: string) => DemoUser | null,
): void {
  app.get("/api/customers/bulk-import/template", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!canImport(actor)) {
      res.status(403).json({ error: "You do not have permission to download the customer import template." });
      return;
    }
    try {
      const buf = await buildTemplateWorkbook();
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader("Content-Disposition", 'attachment; filename="zimson_customer_bulk_import.xlsx"');
      res.send(buf);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not build template workbook." });
    }
  });

  app.post("/api/customers/bulk-import/validate", requireAuth, upload.single("file"), async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!canImport(actor)) {
      res.status(403).json({ error: "You do not have permission to validate customer imports." });
      return;
    }
    if (!req.file?.buffer) {
      res.status(400).json({ error: "Upload an .xlsx file using the field name \"file\"." });
      return;
    }
    try {
      const { headerErrors, rows, parseErrors } = await parseUploaded(pool, req.file.buffer);
      const errors = [...headerErrors, ...parseErrors];
      if (errors.length) {
        res.status(400).json({ ok: false, errors });
        return;
      }
      const classified = await classifyAgainstDb(pool, rows);
      res.json({
        ok: true,
        summary: {
          rowCount: rows.length,
          willCreate: classified.willCreate,
          willUpdate: classified.willUpdate,
        },
        preview: classified.preview,
      });
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, errors: ["Could not read the Excel file. Use the template .xlsx format."] });
    }
  });

  app.post("/api/customers/bulk-import/commit", requireAuth, upload.single("file"), async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!canImport(actor) || !actor) {
      res.status(403).json({ error: "You do not have permission to import customers." });
      return;
    }
    if (!req.file?.buffer) {
      res.status(400).json({ error: "Upload the same validated .xlsx file using the field name \"file\"." });
      return;
    }
    try {
      const { headerErrors, rows, parseErrors } = await parseUploaded(pool, req.file.buffer);
      const errors = [...headerErrors, ...parseErrors];
      if (errors.length) {
        res.status(400).json({ ok: false, errors });
        return;
      }
      const classified = await classifyAgainstDb(pool, rows);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        let registeredStoreId: string | null = String(actor.storeId ?? "").trim() || null;
        if (registeredStoreId) {
          const st = await client.query<{ id: string }>(
            `SELECT id FROM stores WHERE id = $1::text LIMIT 1`,
            [registeredStoreId],
          );
          registeredStoreId = st.rows[0]?.id ?? null;
        }
        await commitRows(client, actor.id, rows, classified.existingSet, registeredStoreId);
        await client.query("COMMIT");
        res.json({
          ok: true,
          summary: {
            created: classified.willCreate,
            updated: classified.willUpdate,
            rowCount: rows.length,
          },
        });
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "Import failed.";
      res.status(500).json({ ok: false, errors: [msg] });
    }
  });
}
