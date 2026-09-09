import type { Express, NextFunction, Request, Response } from "express";
import multer from "multer";
import type { Pool, PoolClient } from "pg";
import * as XLSX from "xlsx";
import type { DemoUser } from "../src/types/user";
import {
  canonicalBrandBulkHeader,
  brandBulkColumnKeys,
  brandBulkColumnLabel,
  brandBulkHeaderLabels,
} from "../src/lib/brandBulkImportColumns";
import { EXCEL_YES_NO, withExcelDropdowns } from "./excelListValidation";

type Authed = Request & { userId: string };

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

const HEADER_LABELS = brandBulkHeaderLabels();
const MAX_ERRORS = 80;

type BrandImportRow = {
  rowNum: number;
  name: string;
  code: string;
  sortOrder: number;
  isActive: boolean;
  serialNumberRequired: boolean;
};

function canImport(actor: DemoUser | null): boolean {
  return actor?.role === "super_admin" || actor?.role === "admin";
}

function brandCodeFromName(name: string): string {
  const base = name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 24);
  return base || "BRAND";
}

function normalizeBrandCodeInput(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 32);
}

function cellStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  return String(v).trim();
}

function parseBool(v: unknown): boolean | null {
  const s = cellStr(v).toLowerCase();
  if (!s) return null;
  if (["y", "yes", "true", "1"].includes(s)) return true;
  if (["n", "no", "false", "0"].includes(s)) return false;
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
  const headers = (rows[0] as unknown[]).map((h) => canonicalBrandBulkHeader(h));
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

function assertHeaders(sheet: XLSX.WorkSheet | undefined): string[] {
  if (!sheet) return ['Missing "Brands" sheet. Use the downloaded template.'];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  if (rows.length < 1) return ["Brands: sheet is empty."];
  const headers = (rows[0] as unknown[]).map((h) => canonicalBrandBulkHeader(h)).filter(Boolean);
  const missing = brandBulkColumnKeys().filter((e) => !headers.includes(e));
  if (missing.length) {
    const missingLabels = missing.map((k) => brandBulkColumnLabel(k));
    return [
      `Brands: missing column(s): ${missingLabels.join(", ")}. First row must match the template (${HEADER_LABELS.join(", ")}).`,
    ];
  }
  return [];
}

function parseRows(rows: Record<string, unknown>[]): { rows: BrandImportRow[]; errors: string[] } {
  const errors: string[] = [];
  const parsed: BrandImportRow[] = [];
  const seenNames = new Map<string, number>();
  const seenCodes = new Map<string, number>();

  rows.forEach((r, idx) => {
    const rowNum = idx + 2;
    const name = cellStr(r.name);
    const rowErrs: string[] = [];
    if (!name) {
      rowErrs.push(`Brands row ${rowNum}: Brand Name is required.`);
    } else if (name.length > 120) {
      rowErrs.push(`Brands row ${rowNum}: Brand Name is too long.`);
    } else {
      const key = name.toLowerCase();
      const prev = seenNames.get(key);
      if (prev) rowErrs.push(`Brands row ${rowNum}: duplicate Brand Name "${name}" (also on row ${prev}).`);
      else seenNames.set(key, rowNum);
    }

    const codeRaw = cellStr(r.code);
    const code = codeRaw ? normalizeBrandCodeInput(codeRaw) : name ? brandCodeFromName(name) : "";
    if (name && !code) {
      rowErrs.push(`Brands row ${rowNum}: Could not derive a brand code; provide Code explicitly.`);
    }
    if (code) {
      const prevCode = seenCodes.get(code);
      if (prevCode) rowErrs.push(`Brands row ${rowNum}: duplicate Code "${code}" (also on row ${prevCode}).`);
      else seenCodes.set(code, rowNum);
    }

    let sortOrder = 0;
    const sortRaw = cellStr(r.sort_order);
    if (sortRaw !== "") {
      const n = Number(sortRaw);
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        rowErrs.push(`Brands row ${rowNum}: Display Order must be a whole number.`);
      } else {
        sortOrder = n;
      }
    }

    const activeP = parseBool(r.is_active);
    if (activeP === null) {
      rowErrs.push(`Brands row ${rowNum}: Active must be Y or N.`);
    }
    const serialP = parseBool(r.serial_number_required);
    if (serialP === null) {
      rowErrs.push(`Brands row ${rowNum}: Serial Number Mandatory must be Y or N.`);
    }

    errors.push(...rowErrs);
    if (rowErrs.length > 0 || !name || !code || activeP === null || serialP === null) return;

    parsed.push({
      rowNum,
      name,
      code,
      sortOrder,
      isActive: activeP,
      serialNumberRequired: serialP,
    });
  });

  return { rows: parsed, errors: errors.slice(0, MAX_ERRORS) };
}

type ExistingBrand = { id: string; code: string; name: string };

async function loadExisting(pool: Pool): Promise<{
  byName: Map<string, ExistingBrand>;
  byCode: Map<string, ExistingBrand>;
}> {
  const { rows } = await pool.query<{ id: string; code: string; name: string }>(
    `SELECT id, code, name FROM brands`,
  );
  const byName = new Map<string, ExistingBrand>();
  const byCode = new Map<string, ExistingBrand>();
  for (const row of rows) {
    const rec = { id: row.id, code: row.code, name: row.name };
    byName.set(row.name.trim().toLowerCase(), rec);
    byCode.set(row.code.trim().toUpperCase(), rec);
  }
  return { byName, byCode };
}

function classify(
  rows: BrandImportRow[],
  byName: Map<string, ExistingBrand>,
  byCode: Map<string, ExistingBrand>,
): { willCreate: number; willUpdate: number; preview: Array<{ name: string; code: string; action: "create" | "update" }>; errors: string[] } {
  const errors: string[] = [];
  let willCreate = 0;
  let willUpdate = 0;
  const preview: Array<{ name: string; code: string; action: "create" | "update" }> = [];
  for (const row of rows) {
    const existingByName = byName.get(row.name.toLowerCase());
    const existingByCode = byCode.get(row.code);
    if (existingByCode && existingByName && existingByCode.id !== existingByName.id) {
      errors.push(
        `Brands row ${row.rowNum}: Code "${row.code}" belongs to "${existingByCode.name}" and Name "${row.name}" belongs to another brand.`,
      );
      continue;
    }
    if (existingByCode && !existingByName) {
      errors.push(
        `Brands row ${row.rowNum}: Code "${row.code}" is already used by "${existingByCode.name}". Use a different code or that brand name.`,
      );
      continue;
    }
    const action: "create" | "update" = existingByName ? "update" : "create";
    if (action === "update") willUpdate += 1;
    else willCreate += 1;
    if (preview.length < 25) preview.push({ name: row.name, code: row.code, action });
  }
  return { willCreate, willUpdate, preview, errors };
}

const SEED_BRANDS: string[][] = [
  ["Rolex", "ROLEX", "10", "Y", "Y"],
  ["Omega", "OMEGA", "20", "Y", "Y"],
  ["Tudor", "TUDOR", "30", "Y", "N"],
  ["Titan", "TITAN", "40", "Y", "N"],
  ["Citizen", "CITIZEN", "50", "Y", "N"],
];

async function buildTemplateWorkbook(): Promise<Buffer> {
  const wb = XLSX.utils.book_new();
  const readme: string[][] = [
    ["ZIMSON SERVICE MANAGEMENT — Brand Bulk Import"],
    [""],
    ["HOW TO USE"],
    ["1. Do NOT change column header names (row 1) on the Brands sheet."],
    ["2. Replace or delete the sample rows, then add brands from row 2."],
    ["3. Save as .xlsx and upload on Brand master → Bulk import."],
    ["4. Click Check file first. Import is enabled only after validation passes."],
    ["5. Matching Brand Name updates the existing brand; new names create brands."],
    [""],
    ["COLUMNS"],
    ["  Brand Name                 – Required. Unique. Upsert key."],
    ["  Code                       – Optional. Letters/digits only. Auto from name if blank."],
    ["  Display Order              – Optional integer (default 0)."],
    ["  Active                     – Y or N."],
    ["  Serial Number Mandatory    – Y or N."],
    [""],
    ["DROPDOWNS"],
    ["Active and Serial Number Mandatory are Excel dropdowns (Y / N). See the Dropdowns sheet."],
    ["Check file still validates after upload."],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(readme), "README");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADER_LABELS, ...SEED_BRANDS]), "Brands");
  return withExcelDropdowns(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer, [
    { sheetName: "Brands", header: "Active", values: [...EXCEL_YES_NO] },
    { sheetName: "Brands", header: "Serial Number Mandatory", values: [...EXCEL_YES_NO] },
  ]);
}

async function parseUploaded(pool: Pool, buffer: Buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const headerErrors = assertHeaders(findSheet(wb, "Brands"));
  if (headerErrors.length) {
    return { headerErrors, rows: [] as BrandImportRow[], parseErrors: [] as string[], byName: new Map(), byCode: new Map() };
  }
  const raw = sheetRows(findSheet(wb, "Brands"));
  const { rows, errors } = parseRows(raw);
  const parseErrors = [...errors];
  if (rows.length === 0 && errors.length === 0) {
    parseErrors.push("No brand rows found. Add at least one row under the header.");
  }
  const { byName, byCode } = await loadExisting(pool);
  return { headerErrors, rows, parseErrors, byName, byCode };
}

async function commitRows(client: PoolClient, rows: BrandImportRow[], byName: Map<string, ExistingBrand>): Promise<void> {
  for (const row of rows) {
    const existing = byName.get(row.name.toLowerCase());
    if (existing) {
      await client.query(
        `UPDATE brands
         SET code = $2, name = $3, sort_order = $4, is_active = $5, serial_number_required = $6, updated_at = now()
         WHERE id = $1::uuid`,
        [existing.id, row.code, row.name, row.sortOrder, row.isActive, row.serialNumberRequired],
      );
    } else {
      await client.query(
        `INSERT INTO brands (code, name, sort_order, is_active, serial_number_required)
         VALUES ($1, $2, $3, $4, $5)`,
        [row.code, row.name, row.sortOrder, row.isActive, row.serialNumberRequired],
      );
    }
  }
}

export function registerBrandBulkImportRoutes(
  app: Express,
  pool: Pool,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
  getUserById: (id: string) => DemoUser | null,
): void {
  app.get("/api/brands/bulk-import/template", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!canImport(actor)) {
      res.status(403).json({ error: "Only HO admins can download the brand import template." });
      return;
    }
    try {
      const buf = await buildTemplateWorkbook();
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader("Content-Disposition", 'attachment; filename="zimson_brand_bulk_import.xlsx"');
      res.send(buf);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not build template workbook." });
    }
  });

  app.post("/api/brands/bulk-import/validate", requireAuth, upload.single("file"), async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!canImport(actor)) {
      res.status(403).json({ error: "Only HO admins can validate brand imports." });
      return;
    }
    if (!req.file?.buffer) {
      res.status(400).json({ error: "Upload an .xlsx file using the field name \"file\"." });
      return;
    }
    try {
      const { headerErrors, rows, parseErrors, byName, byCode } = await parseUploaded(pool, req.file.buffer);
      const classified = rows.length ? classify(rows, byName, byCode) : { willCreate: 0, willUpdate: 0, preview: [], errors: [] };
      const errors = [...headerErrors, ...parseErrors, ...classified.errors];
      if (errors.length) {
        res.status(400).json({ ok: false, errors });
        return;
      }
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

  app.post("/api/brands/bulk-import/commit", requireAuth, upload.single("file"), async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!canImport(actor) || !actor) {
      res.status(403).json({ error: "Only HO admins can import brands." });
      return;
    }
    if (!req.file?.buffer) {
      res.status(400).json({ error: "Upload the same validated .xlsx file using the field name \"file\"." });
      return;
    }
    try {
      const { headerErrors, rows, parseErrors, byName, byCode } = await parseUploaded(pool, req.file.buffer);
      const classified = rows.length ? classify(rows, byName, byCode) : { willCreate: 0, willUpdate: 0, preview: [], errors: [] };
      const errors = [...headerErrors, ...parseErrors, ...classified.errors];
      if (errors.length) {
        res.status(400).json({ ok: false, errors });
        return;
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await commitRows(client, rows, byName);
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
