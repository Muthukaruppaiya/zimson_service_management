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
  supplierCode: string;
  autoCode: boolean;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
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
  if (typeof v === "number") return Number.isFinite(v) ? String(Math.trunc(v) === v ? v : v) : "";
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

function parseRows(
  rows: Record<string, unknown>[],
  taxTypes: string[],
): { rows: SupplierImportRow[]; errors: string[] } {
  const errors: string[] = [];
  const parsed: SupplierImportRow[] = [];
  const seenCodes = new Map<string, number>();
  const seenGst = new Map<string, number>();
  const taxSet = new Set(taxTypes.map((t) => normalizeTaxType(t)));

  rows.forEach((r, idx) => {
    const rowNum = idx + 2;
    const supplierCode = cellStr(r.supplier_code).toUpperCase();
    if (supplierCode.length > 64) {
      errors.push(`Suppliers row ${rowNum}: Supplier Code must be 64 characters or fewer.`);
      return;
    }
    if (supplierCode) {
      const prev = seenCodes.get(supplierCode);
      if (prev) {
        errors.push(`Suppliers row ${rowNum}: duplicate Supplier Code "${supplierCode}" (also on row ${prev}).`);
        return;
      }
      seenCodes.set(supplierCode, rowNum);
    }

    const name = cellStr(r.name);
    const rowErrs: string[] = [];
    if (!name) rowErrs.push(`Suppliers row ${rowNum}: Supplier Name is required.`);
    if (name.length > 240) rowErrs.push(`Suppliers row ${rowNum}: Supplier Name is too long.`);

    const contactName = cellStr(r.contact_name) || null;
    const emailRaw = cellStr(r.email);
    if (emailRaw && !EMAIL_RE.test(emailRaw)) {
      rowErrs.push(`Suppliers row ${rowNum}: Email is not valid for "${supplierCode}".`);
    }
    const phoneRaw = cellStr(r.phone);
    let phone: string | null = phoneRaw || null;
    if (phoneRaw) {
      const d = digitsOnly(phoneRaw);
      if (d.length < 10 || d.length > 15) {
        rowErrs.push(`Suppliers row ${rowNum}: Phone must have 10–15 digits for "${supplierCode}".`);
      }
    }

    const gstRaw = cellStr(r.gstin).toUpperCase().replace(/\s/g, "");
    let gst: string | null = gstRaw || null;
    if (gstRaw) {
      if (!isValidGstin(gstRaw)) {
        rowErrs.push(`Suppliers row ${rowNum}: GSTIN must be a valid 15-character GSTIN for "${supplierCode}".`);
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
      rowErrs.push(`Suppliers row ${rowNum}: Active must be Y/N or true/false for "${supplierCode}".`);
    }

    const pinCode = cellStr(r.pin_code).replace(/\s/g, "");
    if (pinCode && !PIN_RE.test(pinCode)) {
      rowErrs.push(`Suppliers row ${rowNum}: PIN Code must be a 6-digit Indian PIN for "${supplierCode}".`);
    }

    errors.push(...rowErrs);
    if (rowErrs.length > 0) return;

    parsed.push({
      rowNum,
      supplierCode,
      autoCode: !supplierCode,
      name,
      contactName,
      email: emailRaw || null,
      phone,
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
    "SUP-BAT-01",
    "Southern Watch Batteries Pvt Ltd",
    "R. Krishnan",
    "9876543210",
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
    "SUP-GLS-01",
    "Precision Crystal House",
    "Meera Shah",
    "9988776655",
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
    "SUP-STR-01",
    "Kerala Strap Works",
    "Anil Kumar",
    "9123456780",
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
    ["5. Matching Supplier Code (or GSTIN when code is blank) updates the existing supplier; new rows create suppliers."],
    [""],
    ["SHEET: Suppliers"],
    ["  Supplier Code     – Optional. Leave blank and the system assigns SUP + year + sequence."],
    ["  Supplier Name     – Company / trading name. Required."],
    ["  Contact Person    – Optional."],
    ["  Phone             – Optional. 10–15 digits."],
    ["  Email             – Optional. Must be a valid email if filled."],
    ["  GSTIN             – Optional. Must be a valid 15-character GSTIN if filled."],
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
  const codes = rows.map((r) => r.supplierCode).filter(Boolean);
  const gstins = rows.map((r) => r.gst).filter((g): g is string => Boolean(g));
  const { rows: existingByCode } = codes.length
    ? await pool.query<{ supplier_code: string }>(
        `SELECT supplier_code FROM suppliers WHERE supplier_code = ANY($1::text[])`,
        [codes],
      )
    : { rows: [] as Array<{ supplier_code: string }> };
  const { rows: existingByGst } = gstins.length
    ? await pool.query<{ supplier_code: string; gst: string }>(
        `SELECT supplier_code, gst FROM suppliers WHERE gst = ANY($1::text[])`,
        [gstins],
      )
    : { rows: [] as Array<{ supplier_code: string; gst: string }> };
  const existingSet = new Set(existingByCode.map((r) => String(r.supplier_code).toUpperCase()));
  const gstToCode = new Map(existingByGst.map((r) => [String(r.gst).toUpperCase(), String(r.supplier_code)]));
  let willCreate = 0;
  let willUpdate = 0;
  const preview = rows.slice(0, 25).map((r) => {
    const matched = r.supplierCode
      ? existingSet.has(r.supplierCode)
      : Boolean(r.gst && gstToCode.has(r.gst));
    const action: "create" | "update" = matched ? "update" : "create";
    if (action === "update") willUpdate += 1;
    else willCreate += 1;
    return {
      supplierCode: r.supplierCode || (r.gst ? gstToCode.get(r.gst) : "") || "(auto)",
      name: r.name,
      action,
    };
  });
  if (rows.length > 25) {
    for (const r of rows.slice(25)) {
      const matched = r.supplierCode
        ? existingSet.has(r.supplierCode)
        : Boolean(r.gst && gstToCode.has(r.gst));
      if (matched) willUpdate += 1;
      else willCreate += 1;
    }
  }
  return { willCreate, willUpdate, preview };
}

async function commitRows(client: PoolClient, actorId: string, rows: SupplierImportRow[]): Promise<void> {
  for (const row of rows) {
    const locations = toLocations(row);
    const address = toLegacyAddress(locations);
    let code = row.supplierCode;
    if (!code && row.gst) {
      const found = await client.query<{ supplier_code: string }>(
        `SELECT supplier_code FROM suppliers WHERE gst = $1 LIMIT 1`,
        [row.gst],
      );
      code = found.rows[0]?.supplier_code ?? "";
    }
    if (!code) code = await nextSupplierCode(client);
    await client.query(
      `INSERT INTO suppliers (
          supplier_code, name, contact_name, email, phone, address, locations_json,
          gst, tax_person_type, is_active, created_by, modified_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $11)
        ON CONFLICT (supplier_code) DO UPDATE SET
          name = EXCLUDED.name,
          contact_name = EXCLUDED.contact_name,
          email = EXCLUDED.email,
          phone = EXCLUDED.phone,
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
