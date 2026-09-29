import type { Express, NextFunction, Request, Response } from "express";
import multer from "multer";
import type { Pool, PoolClient } from "pg";
import * as XLSX from "xlsx";
import type { DemoUser } from "../src/types/user";
import { isValidGstin } from "./mastersIndiaEdoc/types";
import {
  canonicalSupplierBulkHeader,
  supplierBulkRequiredKeys,
  supplierBulkColumnLabel,
  supplierBulkHeaderLabels,
} from "../src/lib/supplierBulkImportColumns";
import { EXCEL_YES_NO, withExcelDropdowns } from "./excelListValidation";
import { nextSupplierCode } from "./numberSequences";

type Authed = Request & { userId: string };

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

const HEADER_LABELS = supplierBulkHeaderLabels();
const DEFAULT_TAX_TYPES = ["INTRASTATE_TAXABLE_PERSON", "INTERSTATE_TAXABLE_PERSON"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PIN_RE = /^[1-9][0-9]{5}$/;
const MAX_ERRORS = 80;

type SupplierImportRow = {
  rowNum: number;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  alternatePhone: string | null;
  gst: string | null;
  taxPersonType: string | null;
  isActive: boolean;
  doorNo: string;
  street: string;
  place: string;
  district: string;
  state: string;
  pinCode: string;
};

function canImport(actor: DemoUser | null): boolean {
  return (
    actor?.role === "super_admin" ||
    actor?.role === "admin" ||
    actor?.role === "ho_manager" ||
    actor?.role === "ho_purchase"
  );
}

function cellStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "";
    if (Math.abs(v) >= 1e12) return String(Math.round(v));
    return String(Math.trunc(v) === v ? v : v);
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.text === "string") return o.text.trim();
    if (Array.isArray(o.richText)) {
      return (o.richText as { text?: string }[]).map((p) => p.text ?? "").join("").trim();
    }
    if (typeof o.w === "string") return o.w.trim();
    if ("v" in o) return cellStr(o.v);
  }
  return String(v).trim();
}

function parseBool(v: unknown): boolean | null {
  const s = cellStr(v).toLowerCase();
  if (!s) return null;
  if (["y", "yes", "true", "1", "active"].includes(s)) return true;
  if (["n", "no", "false", "0", "inactive"].includes(s)) return false;
  return null;
}

function findSheet(wb: XLSX.WorkBook, name: string): XLSX.WorkSheet | undefined {
  const n = name.toLowerCase();
  const sn = wb.SheetNames.find((s) => s.trim().toLowerCase() === n);
  return sn ? wb.Sheets[sn] : undefined;
}

function sheetRows(sheet: XLSX.WorkSheet | undefined): Record<string, unknown>[] {
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  if (rows.length < 2) return [];
  const headerRaw = rows[0] as unknown[];
  const headers = headerRaw.map((h) => canonicalSupplierBulkHeader(h));
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

function findSuppliersSheet(wb: XLSX.WorkBook): XLSX.WorkSheet | undefined {
  const named = findSheet(wb, "Suppliers") ?? findSheet(wb, "Vendor") ?? findSheet(wb, "Vendors");
  if (named) return named;
  for (const name of wb.SheetNames) {
    if (name.trim().toLowerCase() === "readme") continue;
    const sh = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sh, { header: 1, defval: "" });
    const headers = ((rows[0] as unknown[]) ?? []).map((h) => canonicalSupplierBulkHeader(h));
    if (headers.includes("name")) return sh;
  }
  return undefined;
}

function assertHeaders(sheet: XLSX.WorkSheet | undefined): string[] {
  if (!sheet) return ['Missing "Suppliers" sheet. Use the downloaded template or a file with a Supplier Name column.'];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  if (rows.length < 1) return ["Suppliers: sheet is empty."];
  const headerRaw = rows[0] as unknown[];
  const headers = headerRaw.map((h) => canonicalSupplierBulkHeader(h)).filter(Boolean);
  const missing = supplierBulkRequiredKeys().filter((e) => !headers.includes(e));
  if (missing.length) {
    const missingLabels = missing.map((k) => supplierBulkColumnLabel(k));
    return [`Suppliers: missing required column(s): ${missingLabels.join(", ")}.`];
  }
  return [];
}

function normalizeTaxType(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "_");
}

function digitsOnly(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}

const EMAIL_FIND_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_SPLIT_RE = /[/|,;／∕⁄\n\r]+|\band\b|\bor\b/i;

/** Prefix a short local number with the STD taken from the first (e.g. 0124 4098292 / 4098293). */
function withStdFromFirst(first: string, next: string): string {
  if (next.length >= 10 || !first.startsWith("0") || first.length < 10) return next;
  if (next.length < 6 || next.length > 8) return next;
  const std = first.slice(0, first.length - next.length);
  if (std.length >= 2 && std.length <= 5) return std + next;
  const m = first.match(/^(0\d{2,4})/);
  return m?.[1] ? m[1] + next : next;
}

function phoneKey(digits: string): string {
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

/** Split "080-40395900 / ravi.as@seiko.in" or "4347777 / 4347700" into phones + emails. */
function parsePhoneCell(raw: string): { phones: string[]; emails: string[] } {
  const emails: string[] = [];
  const withoutEmail = String(raw ?? "").replace(EMAIL_FIND_RE, (m) => {
    emails.push(m.trim().toLowerCase());
    return "|";
  });
  const parts = withoutEmail
    .split(PHONE_SPLIT_RE)
    .map((s) => s.trim())
    .filter(Boolean);
  const phones: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    const d = digitsOnly(p);
    if (d.length < 6 || d.length > 15) continue;
    const key = phoneKey(d);
    if (seen.has(d) || seen.has(key)) continue;
    seen.add(d);
    seen.add(key);
    phones.push(d);
  }
  if (phones.length === 0) {
    const d = digitsOnly(withoutEmail);
    if (d.length >= 10 && d.length <= 15) phones.push(d);
  }
  if (phones.length >= 2) {
    const first = phones[0]!;
    for (let i = 1; i < phones.length; i++) {
      phones[i] = withStdFromFirst(first, phones[i]!);
    }
    const deduped: string[] = [];
    const seenAfter = new Set<string>();
    for (const d of phones) {
      const key = phoneKey(d);
      if (seenAfter.has(d) || seenAfter.has(key)) continue;
      seenAfter.add(d);
      seenAfter.add(key);
      deduped.push(d);
    }
    return { phones: deduped, emails };
  }
  return { phones, emails };
}

function phoneDigitsOk(digits: string): boolean {
  return digits.length >= 6 && digits.length <= 15;
}

function parseRows(
  rows: Record<string, unknown>[],
  taxTypes: string[],
): { rows: SupplierImportRow[]; errors: string[] } {
  const errors: string[] = [];
  const parsed: SupplierImportRow[] = [];
  const seenGst = new Map<string, number>();
  const seenPhones = new Map<string, { rowNum: number; who: string }>();
  const taxSet = new Set(taxTypes.map((t) => normalizeTaxType(t)));

  rows.forEach((r, idx) => {
    const rowNum = idx + 2;
    const name = cellStr(r.name);
    const rowErrs: string[] = [];
    if (!name) rowErrs.push(`Suppliers row ${rowNum}: Supplier Name is required.`);
    if (name.length > 240) rowErrs.push(`Suppliers row ${rowNum}: Supplier Name is too long.`);
    const who = name || `row ${rowNum}`;

    const contactName = cellStr(r.contact_name) || null;
    let emailRaw = cellStr(r.email);
    const phoneRaw = cellStr(r.phone);
    const altColRaw = cellStr(r.alternate_phone);
    const fromPhone = phoneRaw ? parsePhoneCell(phoneRaw) : { phones: [] as string[], emails: [] as string[] };
    const fromAlt = altColRaw ? parsePhoneCell(altColRaw) : { phones: [] as string[], emails: [] as string[] };
    if (!emailRaw && (fromPhone.emails[0] || fromAlt.emails[0])) {
      emailRaw = fromPhone.emails[0] || fromAlt.emails[0] || "";
    }
    if (emailRaw && !EMAIL_RE.test(emailRaw)) {
      rowErrs.push(`Suppliers row ${rowNum}: Email is not valid for "${who}".`);
    }
    const phones: string[] = [];
    const seenPhone = new Set<string>();
    for (const d of [...fromPhone.phones, ...fromAlt.phones]) {
      const key = phoneKey(d);
      if (seenPhone.has(d) || seenPhone.has(key)) continue;
      seenPhone.add(d);
      seenPhone.add(key);
      phones.push(d);
    }
    let phone: string | null = null;
    let alternatePhone: string | null = null;
    const hadPhoneInput = Boolean(phoneRaw || altColRaw);
    const pulledEmailOnly = phones.length === 0 && (fromPhone.emails.length > 0 || fromAlt.emails.length > 0);
    if (hadPhoneInput && !pulledEmailOnly) {
      const invalid = phones.filter((d) => !phoneDigitsOk(d));
      if (phones.length === 0 || invalid.length > 0) {
        rowErrs.push(
          `Suppliers row ${rowNum}: Phone must have 10–15 digits for "${who}" (two numbers in one cell are stored as alternate).`,
        );
      } else {
        phone = phones[0] ?? null;
        alternatePhone = phones.slice(1).join(" / ") || null;
        for (const d of phones) {
          const key = phoneKey(d);
          const prev = seenPhones.get(key);
          if (prev) {
            rowErrs.push(
              `Suppliers row ${rowNum}: Phone ${d} is duplicated (also on row ${prev.rowNum} — ${prev.who}).`,
            );
          } else {
            seenPhones.set(key, { rowNum, who });
          }
        }
      }
    }

    const gstRaw = cellStr(r.gstin).toUpperCase().replace(/\s/g, "");
    let gst: string | null = gstRaw || null;
    if (gstRaw) {
      if (!isValidGstin(gstRaw)) {
        rowErrs.push(
          `Suppliers row ${rowNum}: GSTIN must be a valid 15-character GSTIN for "${who}" (got ${gstRaw.length} character${gstRaw.length === 1 ? "" : "s"}: ${gstRaw}).`,
        );
      } else {
        const gstPrev = seenGst.get(gstRaw);
        if (gstPrev) {
          rowErrs.push(`Suppliers row ${rowNum}: GSTIN ${gstRaw} is duplicated (also on row ${gstPrev}).`);
        } else {
          seenGst.set(gstRaw, rowNum);
        }
      }
    }

    const taxRaw = cellStr(r.tax_person_type);
    let taxPersonType: string | null = null;
    if (taxRaw) {
      const norm = normalizeTaxType(taxRaw);
      if (taxSet.size > 0 && !taxSet.has(norm)) {
        rowErrs.push(
          `Suppliers row ${rowNum}: Tax Person Type "${taxRaw}" is not in Tax & billing settings. Allowed: ${taxTypes.join(", ")}.`,
        );
      } else {
        taxPersonType = norm;
      }
    }

    const activeP = parseBool(r.is_active);
    if (activeP === null && cellStr(r.is_active) !== "") {
      rowErrs.push(`Suppliers row ${rowNum}: Active must be Y/N or true/false for "${who}".`);
    }

    const pinCode = cellStr(r.pin_code).replace(/\s/g, "");
    if (pinCode && !PIN_RE.test(pinCode)) {
      rowErrs.push(`Suppliers row ${rowNum}: PIN Code must be a 6-digit Indian PIN for "${who}".`);
    }

    errors.push(...rowErrs);
    if (rowErrs.length > 0) return;

    parsed.push({
      rowNum,
      name,
      contactName,
      email: emailRaw || null,
      phone,
      alternatePhone,
      gst,
      taxPersonType,
      isActive: activeP ?? true,
      doorNo: cellStr(r.door_no),
      street: cellStr(r.street),
      place: cellStr(r.place),
      district: cellStr(r.district),
      state: cellStr(r.state),
      pinCode,
    });
  });

  return { rows: parsed, errors: errors.slice(0, MAX_ERRORS) };
}

function toLocations(row: SupplierImportRow): Array<{
  doorNo: string;
  street: string;
  place: string;
  district: string;
  state: string;
  pinCode: string;
}> {
  if (!row.doorNo && !row.street && !row.place && !row.district && !row.state && !row.pinCode) {
    return [];
  }
  return [
    {
      doorNo: row.doorNo,
      street: row.street,
      place: row.place,
      district: row.district,
      state: row.state,
      pinCode: row.pinCode,
    },
  ];
}

function toLegacyAddress(
  locations: Array<{ doorNo: string; street: string; place: string; district: string; state: string; pinCode: string }>,
): string | null {
  if (locations.length === 0) return null;
  const first = locations[0]!;
  const parts = [first.doorNo, first.street, first.place, first.district, first.state, first.pinCode].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

async function loadTaxTypes(pool: Pool): Promise<string[]> {
  try {
    const { rows } = await pool.query<{ supplier_tax_person_types: unknown }>(
      `SELECT supplier_tax_person_types FROM service_tax_settings WHERE id = 1`,
    );
    const raw = rows[0]?.supplier_tax_person_types;
    if (Array.isArray(raw)) {
      const list = raw.map((x) => String(x ?? "").trim()).filter(Boolean);
      if (list.length > 0) return list;
    }
  } catch {
    /* use defaults */
  }
  return DEFAULT_TAX_TYPES;
}

const SEED_SUPPLIERS: string[][] = [
  [
    "Southern Watch Batteries Pvt Ltd",
    "R. Krishnan",
    "9876543210",
    "",
    "sales@swbatteries.example",
    "33AABCS1234A1Z5",
    "INTRASTATE_TAXABLE_PERSON",
    "Y",
    "12",
    "Avinashi Road",
    "Peelamedu",
    "Coimbatore",
    "Tamil Nadu",
    "641004",
  ],
  [
    "Precision Crystal House",
    "Meera Shah",
    "9988776655",
    "",
    "orders@pchcrystal.example",
    "29AABCT5678B1ZC",
    "INTERSTATE_TAXABLE_PERSON",
    "Y",
    "44",
    "Commercial Street",
    "Shivajinagar",
    "Bengaluru Urban",
    "Karnataka",
    "560001",
  ],
  [
    "Kerala Strap Works",
    "Anil Kumar",
    "9123456780",
    "",
    "anil@keralastrap.example",
    "32AABCU9012C1ZO",
    "INTERSTATE_TAXABLE_PERSON",
    "Y",
    "8/21",
    "MG Road",
    "Ernakulam",
    "Ernakulam",
    "Kerala",
    "682011",
  ],
];

async function buildTemplateWorkbook(taxTypes: string[]): Promise<Buffer> {
  const wb = XLSX.utils.book_new();

  const readme: string[][] = [
    ["ZIMSON SERVICE MANAGEMENT — Supplier Bulk Import"],
    [""],
    ["HOW TO USE"],
    ["1. Do NOT change column header names (row 1) on the Suppliers sheet."],
    ["2. Replace or delete the sample rows, then add your suppliers from row 2."],
    ["3. Save as .xlsx and upload on Supplier Master → Bulk import."],
    ["4. Click Check file first. Import is enabled only after validation passes."],
    ["5. Matching GSTIN updates the existing supplier. New GSTINs (or rows without GSTIN) create a supplier with an auto-generated code (SUP + year + sequence)."],
    ["6. Do not enter Supplier Code. The system always assigns it. An old Supplier Code column in the file is ignored."],
    [""],
    ["SHEET: Suppliers"],
    ["  Supplier Name     – Company / trading name. Required. Supplier Code is auto-generated (not a column)."],
    ["  Contact Person    – Optional."],
    ["  Phone             – Optional. 10–15 digits. Two numbers in one cell (4347777 / 4347700) are saved as Phone + Alternate Phone. An email in the phone cell is moved to Email."],
    ["  Alternate Phone   – Optional second number."],
    ["  Email             – Optional. Must be a valid email if filled."],
    ["  GSTIN             – Optional. Must be a valid 15-character GSTIN if filled. Duplicate GSTINs in the file are rejected."],
    ["  Tax Person Type   – Optional. Must match values on the Tax Types sheet."],
    ["  Active            – Y or N (default Y)."],
    ["  Door / Plot No., Street, Place / Area, District, State, PIN Code – primary address."],
    [""],
    ["DROPDOWNS"],
    ["Active is Y / N. Tax Person Type uses the Tax Types sheet. Both are Excel dropdowns."],
    ["Check file still validates after upload."],
    [""],
    ["Sample rows in this file are examples only. Delete them before a live import unless you want them saved."],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(readme), "README");

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADER_LABELS, ...SEED_SUPPLIERS]), "Suppliers");

  const taxSheet: string[][] = [
    ["Tax Person Type (use exactly in the Tax Person Type column)"],
    ...taxTypes.map((t) => [t]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(taxSheet), "Tax Types");

  const taxEnd = Math.max(2, taxTypes.length + 1);
  return withExcelDropdowns(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer, [
    { sheetName: "Suppliers", header: "Active", values: [...EXCEL_YES_NO] },
    {
      sheetName: "Suppliers",
      header: "Tax Person Type",
      values: taxTypes,
      sourceRange: taxTypes.length ? `'Tax Types'!$A$2:$A$${taxEnd}` : undefined,
    },
  ]);
}

async function parseUploaded(
  pool: Pool,
  buffer: Buffer,
): Promise<{
  headerErrors: string[];
  rows: SupplierImportRow[];
  parseErrors: string[];
  taxTypes: string[];
}> {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = findSuppliersSheet(wb);
  const headerErrors = assertHeaders(sheet);
  const taxTypes = await loadTaxTypes(pool);
  if (headerErrors.length) {
    return { headerErrors, rows: [], parseErrors: [], taxTypes };
  }
  const raw = sheetRows(sheet);
  const { rows, errors } = parseRows(raw, taxTypes);
  const parseErrors = [...errors];
  if (rows.length === 0 && errors.length === 0) {
    parseErrors.push("No supplier rows found. Add at least one row under the header.");
  }
  return { headerErrors, rows, parseErrors, taxTypes };
}

async function classifyAgainstDb(
  pool: Pool,
  rows: SupplierImportRow[],
): Promise<{ willCreate: number; willUpdate: number; preview: Array<{ supplierCode: string; name: string; action: "create" | "update" }> }> {
  const gstins = rows.map((r) => r.gst).filter((g): g is string => Boolean(g));
  const { rows: existingByGst } = gstins.length
    ? await pool.query<{ supplier_code: string; gst: string }>(
        `SELECT supplier_code, gst FROM suppliers WHERE gst = ANY($1::text[])`,
        [gstins],
      )
    : { rows: [] as Array<{ supplier_code: string; gst: string }> };
  const gstToCode = new Map(existingByGst.map((r) => [String(r.gst).toUpperCase(), String(r.supplier_code)]));
  let willCreate = 0;
  let willUpdate = 0;
  const preview = rows.slice(0, 25).map((r) => {
    const existingCode = r.gst ? gstToCode.get(r.gst) : undefined;
    const action: "create" | "update" = existingCode ? "update" : "create";
    if (action === "update") willUpdate += 1;
    else willCreate += 1;
    return {
      supplierCode: existingCode || "(auto)",
      name: r.name,
      action,
    };
  });
  if (rows.length > 25) {
    for (const r of rows.slice(25)) {
      if (r.gst && gstToCode.has(r.gst)) willUpdate += 1;
      else willCreate += 1;
    }
  }
  return { willCreate, willUpdate, preview };
}

async function commitRows(client: PoolClient, actorId: string, rows: SupplierImportRow[]): Promise<void> {
  for (const row of rows) {
    const locations = toLocations(row);
    const address = toLegacyAddress(locations);
    let code = "";
    if (row.gst) {
      const found = await client.query<{ supplier_code: string }>(
        `SELECT supplier_code FROM suppliers WHERE gst = $1 LIMIT 1`,
        [row.gst],
      );
      code = found.rows[0]?.supplier_code ?? "";
    }
    if (!code) code = await nextSupplierCode(client);
    await client.query(
      `INSERT INTO suppliers (
          supplier_code, name, contact_name, email, phone, alternate_phone, address, locations_json,
          gst, tax_person_type, is_active, created_by, modified_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $12)
        ON CONFLICT (supplier_code) DO UPDATE SET
          name = EXCLUDED.name,
          contact_name = EXCLUDED.contact_name,
          email = EXCLUDED.email,
          phone = EXCLUDED.phone,
          alternate_phone = EXCLUDED.alternate_phone,
          address = EXCLUDED.address,
          locations_json = EXCLUDED.locations_json,
          gst = EXCLUDED.gst,
          tax_person_type = EXCLUDED.tax_person_type,
          is_active = EXCLUDED.is_active,
          modified_by = EXCLUDED.modified_by,
          updated_at = now()`,
      [
        code,
        row.name,
        row.contactName,
        row.email,
        row.phone,
        row.alternatePhone,
        address,
        JSON.stringify(locations),
        row.gst,
        row.taxPersonType,
        row.isActive,
        actorId,
      ],
    );
  }
}

export function registerSupplierBulkImportRoutes(
  app: Express,
  pool: Pool,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
  getUserById: (id: string) => DemoUser | null,
): void {
  app.get("/api/inventory/suppliers/bulk-import/template", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!canImport(actor)) {
      res.status(403).json({ error: "Only HO admins can download the supplier import template." });
      return;
    }
    try {
      const taxTypes = await loadTaxTypes(pool);
      const buf = await buildTemplateWorkbook(taxTypes);
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader("Content-Disposition", 'attachment; filename="zimson_supplier_bulk_import.xlsx"');
      res.send(buf);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not build template workbook." });
    }
  });

  app.post("/api/inventory/suppliers/bulk-import/validate", requireAuth, upload.single("file"), async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!canImport(actor)) {
      res.status(403).json({ error: "Only HO admins can validate supplier imports." });
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

  app.post("/api/inventory/suppliers/bulk-import/commit", requireAuth, upload.single("file"), async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!canImport(actor) || !actor) {
      res.status(403).json({ error: "Only HO admins can import suppliers." });
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
        await commitRows(client, actor.id, rows);
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
