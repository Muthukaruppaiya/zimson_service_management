import type { Express, NextFunction, Request, Response } from "express";
import multer from "multer";
import type { Pool, PoolClient } from "pg";
import * as XLSX from "xlsx";
import type { DemoUser } from "../src/types/user";
import {
  BULK_IMPORT_PRICES_COLUMNS,
  BULK_IMPORT_SPARES_COLUMNS,
  BULK_IMPORT_STOCK_COLUMNS,
  bulkImportColumnLabel,
  bulkImportHeaderLabels,
  bulkImportRequiredKeys,
  canonicalBulkImportHeader,
  type BulkImportColumn,
} from "../src/lib/inventoryBulkImportColumns";
import { appendStockHistory } from "./db/stockHistory";
import { spareSkuBrandKey, normalizeAltName, normalizeAltSku, optionalMasterText } from "../src/lib/spareIdentity";
import { nextPartNumber } from "./numberSequences";
import {
  EXCEL_LOCATION_TYPES,
  EXCEL_SPARE_CATEGORIES,
  EXCEL_YES_NO,
  withExcelDropdowns,
} from "./excelListValidation";

type Authed = Request & { userId: string };

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

const SPARES_HEADER_LABELS = bulkImportHeaderLabels(BULK_IMPORT_SPARES_COLUMNS);
const PRICES_HEADER_LABELS = bulkImportHeaderLabels(BULK_IMPORT_PRICES_COLUMNS);
const STOCK_HEADER_LABELS = bulkImportHeaderLabels(BULK_IMPORT_STOCK_COLUMNS);

type SpareRow = {
  rowNum: number;
  sku: string;
  autoSku: boolean;
  brand: string;
  altSku: string | null;
  name: string;
  altName: string | null;
  description: string;
  category: string;
  subCategory: string | null;
  modelNo: string | null;
  caliber: string | null;
  size: string | null;
  colour: string | null;
  hsn: string | null;
  mrpInr: number | null;
  costInr: number | null;
  gstPercent: number | null;
  quantity: number | null;
  isActive: boolean;
};

type PriceRow = {
  rowNum: number;
  sku: string;
  regionName: string;
  watchBrand: string;
  priceInr: number;
};

type StockRow = {
  rowNum: number;
  sku: string;
  brand: string;
  locationType: "HO" | "STORE";
  regionName: string;
  storeName: string | null;
  quantity: number;
};

function normHeader(h: unknown): string {
  return canonicalBulkImportHeader(h);
}

function cellStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  return String(v).trim();
}

function blankNa(raw: unknown): string {
  const s = cellStr(raw);
  if (!s) return "";
  if (/^(n\/?a|nil|none|null|-|—|–)$/i.test(s)) return "";
  return s;
}

function mapSpareCategory(raw: string): string {
  const s = blankNa(raw);
  if (!s) return "Other";
  const key = s.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  const aliases: Record<string, string> = {
    "case part": "Case Part",
    "case parts": "Case Part",
    case: "Case Part",
    glass: "Glass",
    crystal: "Glass",
    movement: "Movement",
    "movement part": "Movement Part",
    "clock movement": "Movement Part",
    battery: "Battery",
    batteries: "Battery",
    crown: "Crown",
    gasket: "Gasket",
    strap: "Strap",
    bracelet: "Bracelet",
    dial: "Dial",
    hands: "Hands",
    lubricant: "Lubricant",
    oil: "Lubricant",
    tool: "Tool",
    tools: "Tool",
    consumable: "Consumable",
    stem: "Stem",
    other: "Other",
  };
  if (aliases[key]) return aliases[key];
  const hit = EXCEL_SPARE_CATEGORIES.find((c) => c.toLowerCase() === key);
  return hit ?? "Other";
}

function categoryFromRow(r: Record<string, unknown>): string {
  const direct = blankNa(r.category);
  if (direct) return mapSpareCategory(direct);
  const hint = `${blankNa(r.alt_name)} ${blankNa(r.name)} ${blankNa(r.description)}`.toLowerCase();
  if (/\bglass\b|\bcrystal\b/.test(hint)) return "Glass";
  if (/\bmovement\b|\bmodule\b/.test(hint)) return "Movement Part";
  if (/\bstrap\b/.test(hint)) return "Strap";
  if (/\bbracelet\b|\bchain\b/.test(hint)) return "Bracelet";
  return "Other";
}

function sheetHeaderKeys(sheet: XLSX.WorkSheet | undefined): string[] {
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  if (rows.length < 1) return [];
  return (rows[0] as unknown[]).map((h) => normHeader(h)).filter(Boolean);
}

function sheetLooksLikeSpares(headers: string[]): boolean {
  const h = new Set(headers);
  if (h.has("price_inr")) return false;
  if (h.has("location_type") && !h.has("description") && !h.has("name") && !h.has("category")) return false;
  const hasBrand = h.has("watch_brand");
  const hasPart = h.has("sku") || h.has("name") || h.has("description") || h.has("category");
  return hasBrand && hasPart;
}

function findSparesSheets(wb: XLSX.WorkBook): Array<{ name: string; sheet: XLSX.WorkSheet }> {
  const skip = new Set(["prices", "stock", "readme", "dropdowns", "tax types", "tax_types"]);
  const out: Array<{ name: string; sheet: XLSX.WorkSheet }> = [];
  const seen = new Set<XLSX.WorkSheet>();
  for (const name of ["Spares", "Inventory", "Parts"]) {
    const sh = findSheet(wb, name);
    if (sh && !seen.has(sh)) {
      seen.add(sh);
      out.push({ name, sheet: sh });
    }
  }
  for (const name of wb.SheetNames) {
    if (skip.has(name.trim().toLowerCase())) continue;
    const sh = wb.Sheets[name];
    if (!sh || seen.has(sh)) continue;
    if (sheetLooksLikeSpares(sheetHeaderKeys(sh))) {
      seen.add(sh);
      out.push({ name, sheet: sh });
    }
  }
  return out;
}

function parseBool(v: unknown): boolean | null {
  const s = cellStr(v).toLowerCase();
  if (!s) return null;
  if (["y", "yes", "true", "1", "active"].includes(s)) return true;
  if (["n", "no", "false", "0", "inactive"].includes(s)) return false;
  return null;
}

function parseNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number.parseFloat(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function sheetRows(sheet: XLSX.WorkSheet | undefined): Record<string, unknown>[] {
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  if (rows.length < 2) return [];
  const headerRaw = rows[0] as unknown[];
  const headers = headerRaw.map((h) => normHeader(h));
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

function findSheet(wb: XLSX.WorkBook, name: string): XLSX.WorkSheet | undefined {
  const n = name.toLowerCase();
  const sn = wb.SheetNames.find((s) => s.trim().toLowerCase() === n);
  return sn ? wb.Sheets[sn] : undefined;
}

function parseSpares(
  rows: Record<string, unknown>[],
  baseRow: number,
  sheetLabel = "Spares",
  seenSkuBrand = new Map<string, number>(),
): { rows: SpareRow[]; errors: string[] } {
  const errors: string[] = [];
  const parsed: SpareRow[] = [];
  const loc = (rowNum: number) => `${sheetLabel} row ${rowNum}`;
  rows.forEach((r, idx) => {
    const rowNum = baseRow + idx + 2;
    const skuRaw = blankNa(r.sku).toUpperCase();
    const brand = blankNa(r.watch_brand);
    const nameFromCol = blankNa(r.name);
    const descriptionFromCol = blankNa(r.description);
    const name = nameFromCol || descriptionFromCol;
    const description = descriptionFromCol || nameFromCol;
    if (!skuRaw && !name) return;
    const rowErrs: string[] = [];
    if (!brand) rowErrs.push(`${loc(rowNum)}: Brand / Watch Brand is required.`);
    if (!name) rowErrs.push(`${loc(rowNum)}: Product Name or Description is required.`);
    const hsnRaw = blankNa(r.hsn);
    const mrp = parseNum(r.mrp_inr);
    if (r.mrp_inr != null && cellStr(r.mrp_inr) !== "" && blankNa(r.mrp_inr) && mrp == null) {
      rowErrs.push(`${loc(rowNum)}: MRP (INR) must be a number.`);
    }
    const cost = parseNum(r.cost_inr);
    if (r.cost_inr != null && cellStr(r.cost_inr) !== "" && blankNa(r.cost_inr) && cost == null) {
      rowErrs.push(`${loc(rowNum)}: Cost (INR) must be a number.`);
    }
    const gst = parseNum(r.gst_percent);
    if (r.gst_percent != null && cellStr(r.gst_percent) !== "" && blankNa(r.gst_percent) && gst == null) {
      rowErrs.push(`${loc(rowNum)}: Tax % must be a number.`);
    }
    if (gst != null && (gst < 0 || gst > 100)) {
      rowErrs.push(`${loc(rowNum)}: Tax % must be between 0 and 100.`);
    }
    const qty = parseNum(r.quantity);
    if (r.quantity != null && cellStr(r.quantity) !== "" && blankNa(r.quantity) && (qty == null || qty < 0)) {
      rowErrs.push(`${loc(rowNum)}: Qty must be a non-negative number.`);
    }
    const activeP = parseBool(r.is_active);
    if (activeP === null && cellStr(r.is_active) !== "" && blankNa(r.is_active)) {
      rowErrs.push(`${loc(rowNum)}: Active must be Y/N or true/false.`);
    }
    errors.push(...rowErrs);
    if (rowErrs.length > 0) return;
    const isActive = activeP ?? true;
    let sku = skuRaw;
    let altSku = normalizeAltSku(blankNa(r.alt_sku));
    if (sku) {
      const seenKey = `${sku}::${brand.trim().toLowerCase()}`;
      const n = (seenSkuBrand.get(seenKey) ?? 0) + 1;
      seenSkuBrand.set(seenKey, n);
      if (n > 1) {
        if (!altSku) altSku = sku;
        sku = `${sku}-${n}`.slice(0, 64);
      }
    }
    parsed.push({
      rowNum,
      sku,
      autoSku: !sku,
      brand,
      altSku,
      name,
      altName: normalizeAltName(blankNa(r.alt_name)),
      description,
      category: categoryFromRow(r),
      subCategory: optionalMasterText(blankNa(r.sub_category)),
      modelNo: optionalMasterText(blankNa(r.model_no)),
      caliber: optionalMasterText(blankNa(r.caliber)),
      size: optionalMasterText(blankNa(r.size), 80),
      colour: optionalMasterText(blankNa(r.colour), 80),
      hsn: hsnRaw || null,
      mrpInr: mrp,
      costInr: cost,
      gstPercent: gst,
      quantity: qty,
      isActive,
    });
  });
  return { rows: parsed, errors };
}

function parsePrices(rows: Record<string, unknown>[], baseRow: number): { rows: PriceRow[]; errors: string[] } {
  const errors: string[] = [];
  const parsed: PriceRow[] = [];
  rows.forEach((r, idx) => {
    const rowNum = baseRow + idx + 2;
    const sku = cellStr(r.sku).toUpperCase();
    if (!sku) return;
    const regionName = cellStr(r.region_name);
    const watchBrand = cellStr(r.watch_brand);
    const price = parseNum(r.price_inr);
    const rowErrs: string[] = [];
    if (!regionName) rowErrs.push(`Prices row ${rowNum}: Region Name is required for product code "${sku}".`);
    if (!watchBrand) rowErrs.push(`Prices row ${rowNum}: Watch Brand is required for product code "${sku}".`);
    if (price == null || price < 0) {
      rowErrs.push(`Prices row ${rowNum}: Price (INR) must be a non-negative number for product code "${sku}".`);
    }
    errors.push(...rowErrs);
    if (rowErrs.length > 0) return;
    parsed.push({ rowNum, sku, regionName, watchBrand, priceInr: price! });
  });
  return { rows: parsed, errors };
}

function parseStock(rows: Record<string, unknown>[], baseRow: number): { rows: StockRow[]; errors: string[] } {
  const errors: string[] = [];
  const parsed: StockRow[] = [];
  rows.forEach((r, idx) => {
    const rowNum = baseRow + idx + 2;
    const sku = cellStr(r.sku).toUpperCase();
    if (!sku) return;
    const lt = cellStr(r.location_type).toUpperCase();
    const watchBrand = cellStr(r.watch_brand);
    const regionName = cellStr(r.region_name);
    const storeNameRaw = cellStr(r.store_name);
    const qty = parseNum(r.quantity);
    const rowErrs: string[] = [];
    if (!watchBrand) rowErrs.push(`Stock row ${rowNum}: Watch Brand is required for product code "${sku}".`);
    if (lt !== "HO" && lt !== "STORE") {
      rowErrs.push(`Stock row ${rowNum}: Location Type must be HO or STORE for product code "${sku}".`);
    }
    if (!regionName) rowErrs.push(`Stock row ${rowNum}: Region Name is required for product code "${sku}".`);
    if (lt === "STORE" && !storeNameRaw) {
      rowErrs.push(`Stock row ${rowNum}: Store Name is required when Location Type is STORE for product code "${sku}".`);
    }
    if (lt === "HO" && storeNameRaw) {
      rowErrs.push(`Stock row ${rowNum}: Store Name must be empty for HO for product code "${sku}".`);
    }
    if (qty == null || qty < 0) {
      rowErrs.push(`Stock row ${rowNum}: Quantity must be a non-negative number for product code "${sku}".`);
    }
    errors.push(...rowErrs);
    if (rowErrs.length > 0) return;
    parsed.push({
      rowNum,
      sku,
      brand: watchBrand,
      locationType: lt === "STORE" ? "STORE" : "HO",
      regionName,
      storeName: lt === "STORE" ? storeNameRaw || null : null,
      quantity: qty!,
    });
  });
  return { rows: parsed, errors };
}

function parseWorkbook(buf: Buffer): {
  spareRows: SpareRow[];
  priceRows: PriceRow[];
  stockRows: StockRow[];
  parseErrors: string[];
} {
  const wb = XLSX.read(buf, { type: "buffer" });
  const parseErrors: string[] = [];

  const spareSheets = findSparesSheets(wb);
  const shPrices = findSheet(wb, "Prices");
  const shStock = findSheet(wb, "Stock");

  if (spareSheets.length === 0) {
    parseErrors.push(
      'No inventory sheet found. Use a "Spares" sheet, or a client file with Brand plus Part Reference Number / Description (Watch / Clock / Strap sheets are accepted).',
    );
  }

  const seenSkuBrand = new Map<string, number>();
  const spareRows: SpareRow[] = [];
  const spareParseErrors: string[] = [];
  for (const { name, sheet } of spareSheets) {
    const sp = parseSpares(sheetRows(sheet), 0, name, seenSkuBrand);
    spareRows.push(...sp.rows);
    spareParseErrors.push(...sp.errors);
  }
  const rawPrices = sheetRows(shPrices);
  const rawStock = sheetRows(shStock);

  const pr = parsePrices(rawPrices, 0);
  const st = parseStock(rawStock, 0);

  if (spareSheets.length > 0 && spareRows.length === 0 && spareParseErrors.length === 0) {
    parseErrors.push("No spare rows found. Add at least one row under the header.");
  }

  return {
    spareRows,
    priceRows: pr.rows,
    stockRows: st.rows,
    parseErrors: [...parseErrors, ...spareParseErrors, ...pr.errors, ...st.errors],
  };
}

type DbQuery = {
  query: Pool["query"];
};

async function loadRefs(pool: DbQuery): Promise<{
  regionByName: Map<string, { id: string; name: string }>;
  storeByRegionAndName: Map<string, { id: string; regionId: string; name: string }>;
  brandNamesLower: Map<string, string>;
}> {
  const [regions, stores, brands] = await Promise.all([
    pool.query<{ id: string; name: string }>(`SELECT id, name FROM regions`),
    pool.query<{ id: string; region_id: string; name: string }>(`SELECT id, region_id, name FROM stores`),
    pool.query<{ name: string }>(`SELECT name FROM brands WHERE is_active = true`),
  ]);
  const regionByName = new Map<string, { id: string; name: string }>();
  for (const r of regions.rows) {
    regionByName.set(r.name.trim().toLowerCase(), { id: r.id, name: r.name });
  }
  const storeByRegionAndName = new Map<string, { id: string; regionId: string; name: string }>();
  for (const s of stores.rows) {
    const key = `${s.region_id}::${s.name.trim().toLowerCase()}`;
    storeByRegionAndName.set(key, { id: s.id, regionId: s.region_id, name: s.name });
  }
  const brandNamesLower = new Map<string, string>();
  for (const b of brands.rows) {
    brandNamesLower.set(b.name.trim().toLowerCase(), b.name.trim());
  }
  return { regionByName, storeByRegionAndName, brandNamesLower };
}

async function validateAgainstDb(
  pool: Pool,
  actor: DemoUser,
  spareRows: SpareRow[],
  priceRows: PriceRow[],
  stockRows: StockRow[],
): Promise<string[]> {
  const errors: string[] = [];
  const { regionByName, storeByRegionAndName, brandNamesLower } = await loadRefs(pool);

  const skuList = [
    ...new Set([
      ...priceRows.map((p) => p.sku),
      ...stockRows.map((s) => s.sku),
      ...spareRows.filter((s) => s.sku).map((s) => s.sku),
    ]),
  ];
  const existing = new Set<string>();
  if (skuList.length > 0) {
    const { rows } = await pool.query<{ sku: string; brand: string }>(
      `SELECT UPPER(TRIM(sku)) AS sku, UPPER(TRIM(brand)) AS brand
       FROM spares
       WHERE UPPER(TRIM(sku)) = ANY($1::text[])`,
      [skuList],
    );
    for (const r of rows) existing.add(spareSkuBrandKey(r.sku, r.brand));
  }

  const fromSheet = new Set<string>();
  const spareKeySeen = new Set<string>();
  for (const s of spareRows) {
    const canon = brandNamesLower.get(s.brand.trim().toLowerCase()) ?? s.brand.trim();
    const key = s.sku ? spareSkuBrandKey(s.sku, canon) : `AUTO:${s.brand.trim().toLowerCase()}::${s.name.trim().toLowerCase()}::${s.rowNum}`;
    if (s.sku && spareKeySeen.has(key)) {
      errors.push(
        `Spares: duplicate part number + brand "${s.sku}" / "${s.brand}" (row ${s.rowNum}). Each combination may appear only once.`,
      );
    }
    spareKeySeen.add(key);
    fromSheet.add(spareSkuBrandKey(s.sku || `AUTO-${s.rowNum}`, canon));
  }

  for (const p of priceRows) {
    const canon = brandNamesLower.get(p.watchBrand.trim().toLowerCase());
    const key = spareSkuBrandKey(p.sku, canon ?? p.watchBrand);
    if (!fromSheet.has(key) && !existing.has(key)) {
      errors.push(
        `Prices row ${p.rowNum}: "${p.sku}" + "${p.watchBrand}" is not in the Spares sheet and does not exist in the catalogue.`,
      );
    }
  }
  for (const s of stockRows) {
    const canon = brandNamesLower.get(s.brand.trim().toLowerCase());
    const key = spareSkuBrandKey(s.sku, canon ?? s.brand);
    if (!fromSheet.has(key) && !existing.has(key)) {
      errors.push(
        `Stock row ${s.rowNum}: "${s.sku}" + "${s.brand}" is not in the Spares sheet and does not exist in the catalogue.`,
      );
    }
  }

  const scopeRegion = actor.role === "admin" ? actor.regionId : null;

  for (const p of priceRows) {
    const region = regionByName.get(p.regionName.trim().toLowerCase());
    if (!region) {
      errors.push(`Prices row ${p.rowNum}: region_name "${p.regionName}" is not a valid region.`);
    } else if (scopeRegion && region.id !== scopeRegion) {
      errors.push(`Prices row ${p.rowNum}: you may only import prices for your region.`);
    }
    const canon = brandNamesLower.get(p.watchBrand.trim().toLowerCase());
    if (!canon) {
      errors.push(
        `Prices row ${p.rowNum}: watch_brand "${p.watchBrand}" must match an active brand (Inventory → Brands).`,
      );
    }
  }

  for (const s of stockRows) {
    const region = regionByName.get(s.regionName.trim().toLowerCase());
    if (!region) {
      errors.push(`Stock row ${s.rowNum}: region_name "${s.regionName}" is not a valid region.`);
      continue;
    }
    if (scopeRegion && region.id !== scopeRegion) {
      errors.push(`Stock row ${s.rowNum}: you may only import stock for your region.`);
    }
    if (s.locationType === "STORE" && s.storeName) {
      const st = storeByRegionAndName.get(`${region.id}::${s.storeName.trim().toLowerCase()}`);
      if (!st) {
        errors.push(
          `Stock row ${s.rowNum}: store_name "${s.storeName}" does not belong to region "${region.name}".`,
        );
      }
    }
  }

  return errors;
}

async function ensureBrand(
  client: PoolClient,
  rawName: string,
  brandNamesLower: Map<string, string>,
): Promise<string> {
  const name = rawName.trim();
  const existing = brandNamesLower.get(name.toLowerCase());
  if (existing) return existing;
  const { rows: found } = await client.query<{ name: string }>(
    `SELECT name FROM brands WHERE LOWER(BTRIM(name)) = LOWER(BTRIM($1)) LIMIT 1`,
    [name],
  );
  if (found[0]) {
    brandNamesLower.set(name.toLowerCase(), found[0].name);
    return found[0].name;
  }
  const codeBase = name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 24) || "BRAND";
  let code = codeBase;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    try {
      await client.query(
        `INSERT INTO brands (code, name, sort_order, is_active, serial_number_required)
         VALUES ($1, $2, 100, true, false)`,
        [code, name],
      );
      brandNamesLower.set(name.toLowerCase(), name);
      return name;
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code !== "23505") throw e;
      const again = await client.query<{ name: string }>(
        `SELECT name FROM brands WHERE LOWER(BTRIM(name)) = LOWER(BTRIM($1)) LIMIT 1`,
        [name],
      );
      if (again.rows[0]) {
        brandNamesLower.set(name.toLowerCase(), again.rows[0].name);
        return again.rows[0].name;
      }
      const suffix = String(attempt + 1);
      code = `${codeBase}`.slice(0, Math.max(1, 32 - suffix.length)) + suffix;
    }
  }
  throw new Error(`Could not create brand "${name}".`);
}

async function commitImport(
  client: PoolClient,
  actor: DemoUser,
  spareRows: SpareRow[],
  priceRows: PriceRow[],
  stockRows: StockRow[],
  brandNamesLower: Map<string, string>,
  regionByName: Map<string, { id: string; name: string }>,
  storeByRegionAndName: Map<string, { id: string; regionId: string; name: string }>,
): Promise<{ sparesUpserted: number; pricesUpserted: number; stockUpserted: number }> {
  const skuBrandToId = new Map<string, string>();

  async function rememberSpare(sku: string, brand: string, id: string) {
    skuBrandToId.set(spareSkuBrandKey(sku, brand), id);
  }

  async function lookupSpareId(sku: string, brand: string): Promise<string | undefined> {
    const key = spareSkuBrandKey(sku, brand);
    const cached = skuBrandToId.get(key);
    if (cached) return cached;
    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM spares
       WHERE UPPER(BTRIM(sku)) = $1 AND UPPER(BTRIM(brand)) = UPPER(BTRIM($2))`,
      [sku, brand],
    );
    if (rows[0]) {
      skuBrandToId.set(key, rows[0].id);
      return rows[0].id;
    }
    return undefined;
  }

  let sparesUpserted = 0;
  let inlineStock = 0;
  const defaultRegion =
    (actor.regionId
      ? [...regionByName.values()].find((r) => r.id === actor.regionId)
      : undefined) ?? [...regionByName.values()][0];

  for (const s of spareRows) {
    const brandCanon = await ensureBrand(client, s.brand, brandNamesLower);
    let sku = s.sku;
    if (!sku) {
      sku = await nextPartNumber(client);
      s.sku = sku;
    }
    const before = await client.query<{ id: string }>(
      `SELECT id FROM spares
       WHERE UPPER(BTRIM(sku)) = $1 AND UPPER(BTRIM(brand)) = UPPER(BTRIM($2))`,
      [sku, brandCanon],
    );
    const wasExisting = before.rows.length > 0;
    const ins = await client.query<{ id: string }>(
      `INSERT INTO spares (sku, brand, alt_sku, name, alt_name, description, category, model_no, caliber, sub_category, size, colour, hsn, gst_percent, mrp_inr, cost_price_inr, selling_price_inr, is_active, custom_fields)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $15, $17, '{}'::jsonb)
       ON CONFLICT ((UPPER(BTRIM(sku))), (UPPER(BTRIM(brand)))) DO UPDATE SET
         alt_sku = COALESCE(EXCLUDED.alt_sku, spares.alt_sku),
         name = EXCLUDED.name,
         alt_name = EXCLUDED.alt_name,
         description = EXCLUDED.description,
         category = EXCLUDED.category,
         model_no = EXCLUDED.model_no,
         caliber = EXCLUDED.caliber,
         sub_category = EXCLUDED.sub_category,
         size = EXCLUDED.size,
         colour = EXCLUDED.colour,
         hsn = EXCLUDED.hsn,
         gst_percent = EXCLUDED.gst_percent,
         mrp_inr = EXCLUDED.mrp_inr,
         cost_price_inr = EXCLUDED.cost_price_inr,
         selling_price_inr = EXCLUDED.selling_price_inr,
         is_active = EXCLUDED.is_active,
         custom_fields = CASE
           WHEN EXCLUDED.custom_fields = '{}'::jsonb THEN spares.custom_fields
           ELSE COALESCE(spares.custom_fields, '{}'::jsonb) || EXCLUDED.custom_fields
         END,
         updated_at = now()
       RETURNING id`,
      [
        sku,
        brandCanon,
        s.altSku,
        s.name,
        s.altName,
        s.description,
        s.category,
        s.modelNo,
        s.caliber,
        s.subCategory,
        s.size,
        s.colour,
        s.hsn,
        s.gstPercent,
        s.mrpInr,
        s.costInr,
        s.isActive,
      ],
    );
    const id = ins.rows[0]!.id;
    await rememberSpare(sku, brandCanon, id);
    sparesUpserted += 1;
    if (!wasExisting) {
      await appendStockHistory(client, {
        spareId: id,
        eventType: "SPARE_CREATED",
        referenceType: "MANUAL",
        note: "Spare master row created via bulk import.",
        createdBy: actor.id,
      });
    }
    if (s.quantity != null && defaultRegion) {
      const locationKey = `HO:${defaultRegion.id}`;
      const prev = await client.query<{ qty: number }>(
        `SELECT quantity::float8 AS qty FROM spare_stock WHERE spare_id = $1::uuid AND location_key = $2 FOR UPDATE`,
        [id, locationKey],
      );
      const prevQty = prev.rows[0]?.qty ?? 0;
      await client.query(
        `INSERT INTO spare_stock (spare_id, location_key, location_type, region_id, store_id, quantity)
         VALUES ($1::uuid, $2, 'HO', $3, NULL, $4)
         ON CONFLICT (spare_id, location_key)
         DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now()`,
        [id, locationKey, defaultRegion.id, s.quantity],
      );
      await appendStockHistory(client, {
        spareId: id,
        eventType: "MANUAL_STOCK_SET",
        locationKey,
        locationType: "HO",
        regionId: defaultRegion.id,
        storeId: null,
        quantityChange: s.quantity - prevQty,
        balanceAfter: s.quantity,
        referenceType: "MANUAL",
        note: "Bulk import qty from inventory sheet.",
        createdBy: actor.id,
      });
      inlineStock += 1;
    }
  }

  let pricesUpserted = 0;
  for (const p of priceRows) {
    const brandCanon = brandNamesLower.get(p.watchBrand.trim().toLowerCase());
    if (!brandCanon) throw new Error(`Internal: brand not resolved for ${p.watchBrand}`);
    const spareId = await lookupSpareId(p.sku, brandCanon);
    if (!spareId) throw new Error(`Internal: missing spare id for ${p.sku} / ${brandCanon}`);
    const region = regionByName.get(p.regionName.trim().toLowerCase());
    if (!region) throw new Error(`Internal: region not resolved for ${p.regionName}`);
    await client.query(
      `INSERT INTO spare_prices (spare_id, region_id, brand, price)
       VALUES ($1::uuid, $2::text, $3, $4)
       ON CONFLICT (spare_id, brand, region_id)
       DO UPDATE SET price = EXCLUDED.price, updated_at = now()`,
      [spareId, region.id, brandCanon, p.priceInr],
    );
    pricesUpserted += 1;
  }

  let stockUpserted = 0;
  for (const s of stockRows) {
    const brandCanon = brandNamesLower.get(s.brand.trim().toLowerCase());
    if (!brandCanon) throw new Error(`Internal: brand not resolved for ${s.brand}`);
    const spareId = await lookupSpareId(s.sku, brandCanon);
    if (!spareId) throw new Error(`Internal: missing spare id for ${s.sku} / ${brandCanon}`);
    const region = regionByName.get(s.regionName.trim().toLowerCase());
    if (!region) throw new Error(`Internal: region not resolved for ${s.regionName}`);
    const store =
      s.locationType === "STORE" && s.storeName
        ? storeByRegionAndName.get(`${region.id}::${s.storeName.trim().toLowerCase()}`)
        : null;
    const storeId = s.locationType === "STORE" ? store?.id ?? null : null;
    const locationKey =
      s.locationType === "HO" ? `HO:${region.id}` : `STORE:${region.id}:${storeId ?? ""}`;
    const prev = await client.query<{ qty: number }>(
      `SELECT quantity::float8 AS qty FROM spare_stock WHERE spare_id = $1::uuid AND location_key = $2 FOR UPDATE`,
      [spareId, locationKey],
    );
    const prevQty = prev.rows[0]?.qty ?? 0;
    await client.query(
      `INSERT INTO spare_stock (spare_id, location_key, location_type, region_id, store_id, quantity)
       VALUES ($1::uuid, $2, $3, $4, $5, $6)
       ON CONFLICT (spare_id, location_key)
       DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now()`,
      [spareId, locationKey, s.locationType, region.id, storeId, s.quantity],
    );
    await appendStockHistory(client, {
      spareId,
      eventType: "MANUAL_STOCK_SET",
      locationKey,
      locationType: s.locationType,
      regionId: region.id,
      storeId,
      quantityChange: s.quantity - prevQty,
      balanceAfter: s.quantity,
      referenceType: "MANUAL",
      note: "Bulk import stock set.",
      createdBy: actor.id,
    });
    stockUpserted += 1;
  }

  return { sparesUpserted, pricesUpserted, stockUpserted: stockUpserted + inlineStock };
}

function assertSpareSheetHeaders(wb: XLSX.WorkBook): string[] {
  const sheets = findSparesSheets(wb);
  if (sheets.length === 0) {
    return [
      'No inventory sheet found. Use a "Spares" sheet, or a client file with Brand plus Part Reference Number / Description (Watch / Clock / Strap sheets are accepted).',
    ];
  }
  return sheets.flatMap(({ name, sheet }) => assertHeaders(sheet, BULK_IMPORT_SPARES_COLUMNS, name));
}

function assertHeaders(
  sheet: XLSX.WorkSheet | undefined,
  columns: BulkImportColumn[],
  sheetLabel: string,
  opts?: { optional?: boolean },
): string[] {
  if (!sheet) {
    return opts?.optional ? [] : [`Missing ${sheetLabel} sheet.`];
  }
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  if (rows.length < 1) return [`${sheetLabel}: sheet is empty.`];
  const headerRaw = rows[0] as unknown[];
  const headers = headerRaw.map((h) => normHeader(h)).filter(Boolean);
  const expectedKeys = bulkImportRequiredKeys(columns);
  const missing = expectedKeys.filter((e) => !headers.includes(e));
  if (missing.length) {
    const missingLabels = missing.map((k) => bulkImportColumnLabel(columns, k));
    return [
      `${sheetLabel}: missing required column(s): ${missingLabels.join(", ")}.`,
    ];
  }
  return [];
}

function canBulkImport(actor: DemoUser | null): actor is DemoUser {
  const role = actor?.role;
  return role === "super_admin" || role === "admin" || role === "ho_manager" || role === "ho_purchase";
}

// ── Seeded spare parts catalogue ─────────────────────────────────────────────
// [sku, name, description, category, hsn, mrp_inr, is_active]
const SEED_SPARES: string[][] = [
  ["BAT-SR626SW",  "SR626SW Watch Battery",        "Silver oxide 1.55V button cell — fits most ladies quartz watches",         "Battery",     "8506900090", "85",    "Y"],
  ["BAT-SR621SW",  "SR621SW Watch Battery",        "Silver oxide 1.55V thin cell — slim quartz movement",                     "Battery",     "8506900090", "85",    "Y"],
  ["BAT-CR2016",   "CR2016 Lithium Battery",       "Lithium 3V coin cell — chronograph & multi-function modules",             "Battery",     "8506900090", "95",    "Y"],
  ["BAT-CR2032",   "CR2032 Lithium Battery",       "Lithium 3V coin cell — standard digital / solar-backup modules",         "Battery",     "8506900090", "90",    "Y"],
  ["GLS-MIN-28",   "Mineral Glass 28mm Round",     "1.5mm mineral crystal — fits standard 28mm round case",                  "Glass",       "7015900090", "320",   "Y"],
  ["GLS-MIN-34",   "Mineral Glass 34mm Round",     "1.5mm mineral crystal — standard 34mm round case",                      "Glass",       "7015900090", "380",   "Y"],
  ["GLS-SAP-36",   "Sapphire Crystal 36mm Round",  "Scratch-resistant sapphire 1.2mm — dress watch 36mm case",              "Glass",       "7015900090", "950",   "Y"],
  ["GLS-SAP-40",   "Sapphire Crystal 40mm Round",  "Scratch-resistant sapphire 1.2mm — sports / gents 40mm case",           "Glass",       "7015900090", "1150",  "Y"],
  ["CRN-STD-4MM",  "Steel Crown 4mm Screw-down",   "316L SS screw-down crown — diameter 4mm, thread M0.9",                   "Crown",       "9114900090", "180",   "Y"],
  ["CRN-PUSH-3MM", "Push-pull Crown 3mm",          "316L SS push-pull crown — diameter 3mm for slim ladies movement",        "Crown",       "9114900090", "120",   "Y"],
  ["GSK-CASE-28",  "Case Gasket Set 28mm",         "Rubber O-ring + back gasket pair — 28mm round waterproof case",          "Gasket",      "8484900090", "95",    "Y"],
  ["GSK-CROWN-4",  "Crown Tube Gasket 4mm",        "Crown tube O-ring for 4mm screw-down crown — 3-pack",                   "Gasket",      "8484900090", "55",    "Y"],
  ["STP-LTH-18",   "Genuine Leather Strap 18mm",   "Calf-leather padded strap, brown/black — 18mm lug, stainless buckle",   "Strap",       "4205009090", "650",   "Y"],
  ["STP-RBR-20",   "Silicone Sport Strap 20mm",    "Moulded silicone strap — 20mm lug, deployant clasp ready",              "Strap",       "4016991090", "420",   "Y"],
  ["STM-MNH-5",    "Watch Stem M0.9 x 5mm",        "Winding stem thread M0.9, length 5mm — fits ETA-style NH35 movement",   "Stem",        "9114900090", "145",   "Y"],
  ["LUB-M9000",    "Moebius 9000 Silicone Grease",  "Waterproofing lubricant for crown tube, gaskets — 1ml syringe",          "Lubricant",   "3403910090", "890",   "Y"],
  ["LUB-9010",     "Moebius 9010 Movement Oil",    "Ultra-thin movement oil for balance pivots and pallet stones — 1ml",     "Lubricant",   "3403910090", "1250",  "Y"],
  ["TOOL-OPENER",  "Case Back Opener (Press)",     "Friction press-fit stainless case back removal tool",                   "Tool",        "9015809090", "380",   "Y"],
  ["TOOL-PRYTIP",  "Nylon Pry Tip Set (6pc)",      "Anti-scratch crystal and gasket pry tips — set of 6 sizes",             "Tool",        "9015809090", "220",   "Y"],
  ["CONS-CLTH-10", "Micro-fibre Cleaning Cloth",   "Anti-static lint-free cloth for crystal and case cleaning — 10-pack",   "Consumable",  "6307909090", "110",   "Y"],
];

async function buildTemplateWorkbook(pool: Pool): Promise<Buffer> {
  const wb = XLSX.utils.book_new();

  // Fetch real regions, stores and brands from DB for seeded price/stock rows
  const { rows: regRows } = await pool.query<{ id: string; name: string }>(
    `SELECT id, name FROM regions ORDER BY name`,
  );
  const { rows: storeRows } = await pool.query<{ id: string; region_id: string; name: string }>(
    `SELECT id, region_id, name FROM stores ORDER BY region_id, name`,
  );
  const { rows: brandRows } = await pool.query<{ name: string }>(
    `SELECT name FROM brands WHERE is_active = true ORDER BY sort_order, name`,
  );

  const regions = regRows.length > 0 ? regRows : [{ id: "", name: "COIMBATORE HO" }];
  const brands  = brandRows.length  > 0 ? brandRows.map((b) => b.name) : ["Citizen", "Titan", "Casio"];

  // ── README ──────────────────────────────────────────────────────────────
  const readme: string[][] = [
    ["ZIMSON SERVICE MANAGEMENT — Spares Bulk Import"],
    [""],
    ["HOW TO USE"],
    ["1. Do NOT change column header names (row 1) on any sheet."],
    ["2. Add your data from row 2 onwards."],
    ["3. Delete the seeded sample rows before importing, or they will be upserted into your catalogue."],
    ["4. Save as .xlsx and upload on the Bulk Import page."],
    [""],
    ["SHEET: Spares  (or client Watch / Clock / Strap sheets — all matching sheets are imported)"],
    ["  Product Code          – Optional. Leave blank and the system assigns PRT + year + sequence."],
    ["  Part Reference Number – Accepted as Product Code (client inventory format)."],
    ["  Watch Brand / Brand   – Required. Created in brand master if it does not exist yet."],
    ["  Product Name          – Optional if Description is filled."],
    ["  Alternative Part No   – Optional second part number (cross-reference)."],
    ["  Alternative Name      – Optional second spare name. N/A is treated as blank."],
    ["  Product Description   – Optional if Product Name is filled."],
    ["  Category              – Mapped to catalogue categories (CASE PART → Case Part, Movement Part, Bracelet). Blank → Other."],
    ["  Sub Category          – Optional (Leather / Metal / BiMetal on Strap sheets)."],
    ["  Model No / Clock Model / Caliber / Size / Colour / HSN / MRP / Cost / Tax % (or IGST %) — optional."],
    ["  Qty                   – Optional. Written as HO opening stock when a number is present."],
    ["  Active                – Y or N (default Y)."],
    [""],
    ["SHEET: Prices  (optional — not required for client inventory files)"],
    ["  Product Code          – Must match Product Code + Watch Brand in Spares or catalogue."],
    ["  Region Name           – Exact region name from your system (e.g. COIMBATORE HO)."],
    ["  Watch Brand           – Active brand name (e.g. Citizen)."],
    ["  Price (INR)           – Selling price in INR (number)."],
    [""],
    ["SHEET: Stock   (optional — not required for client inventory files)"],
    ["  Product Code          – Must match Product Code + Watch Brand."],
    ["  Watch Brand           – Must match the spare’s brand."],
    ["  Location Type         – HO or STORE (uppercase)."],
    ["  Region Name           – Exact region name."],
    ["  Store Name            – Required when Location Type = STORE; leave empty for HO."],
    ["  Quantity              – Non-negative integer."],
    [""],
    ["DROPDOWNS"],
    ["Category, Active, Location Type, Region Name, and Watch Brand are Excel dropdowns."],
    ["See the Dropdowns sheet. Check file still validates after upload."],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(readme), "README");

  const sampleBrand = brands[0] ?? "Citizen";
  const spareSheetRows = SEED_SPARES.map((row) => [
    row[0],
    sampleBrand,
    row[1],
    "",
    "",
    row[2],
    row[3],
    "",
    "",
    "",
    "",
    "",
    row[4],
    row[5],
    "",
    "18",
    "",
    row[6],
  ]);
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([SPARES_HEADER_LABELS, ...spareSheetRows]),
    "Spares",
  );

  // ── Prices sheet — one row per spare × region (spare’s brand) ────────────
  const priceRows: string[][] = [PRICES_HEADER_LABELS];
  for (const spare of SEED_SPARES) {
    const sku = spare[0];
    const mrpStr = spare[5] ?? "";
    const mrp = parseFloat(mrpStr) || 0;
    for (const region of regions) {
      const sellingPrice = Math.round(mrp * 0.85);
      priceRows.push([sku, region.name, sampleBrand, String(sellingPrice > 0 ? sellingPrice : 100)]);
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(priceRows), "Prices");

  // ── Stock sheet — HO stock + first store per region ──────────────────────
  const stockRows: string[][] = [STOCK_HEADER_LABELS];
  for (const spare of SEED_SPARES) {
    const sku = spare[0];
    for (const region of regions) {
      stockRows.push([sku, sampleBrand, "HO", region.name, "", "20"]);
      const store = storeRows.find((s) => s.region_id === region.id);
      if (store) {
        stockRows.push([sku, sampleBrand, "STORE", region.name, store.name, "5"]);
      }
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(stockRows), "Stock");

  const regionNames = regions.map((r) => r.name).filter(Boolean);
  return withExcelDropdowns(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer, [
    { sheetName: "Spares", header: "Category", values: [...EXCEL_SPARE_CATEGORIES] },
    { sheetName: "Spares", header: "Active", values: [...EXCEL_YES_NO] },
    { sheetName: "Spares", header: "Watch Brand", values: brands },
    { sheetName: "Prices", header: "Watch Brand", values: brands },
    { sheetName: "Prices", header: "Region Name", values: regionNames },
    { sheetName: "Stock", header: "Watch Brand", values: brands },
    { sheetName: "Stock", header: "Location Type", values: [...EXCEL_LOCATION_TYPES] },
    { sheetName: "Stock", header: "Region Name", values: regionNames },
  ]);
}

export function registerInventoryBulkImportRoutes(
  app: Express,
  pool: Pool,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
  getUserById: (id: string) => DemoUser | null,
): void {
  app.get("/api/inventory/bulk-import/template", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!canBulkImport(actor)) {
      res.status(403).json({ error: "Only super or regional admins can download the import template." });
      return;
    }
    try {
      const buf = await buildTemplateWorkbook(pool);
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader("Content-Disposition", 'attachment; filename="inventory_bulk_import_template.xlsx"');
      res.send(buf);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not build template workbook." });
    }
  });

  app.post("/api/inventory/bulk-import/validate", requireAuth, upload.single("file"), async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!canBulkImport(actor)) {
      res.status(403).json({ error: "Only super or regional admins can validate imports." });
      return;
    }
    if (!req.file?.buffer) {
      res.status(400).json({ error: "Upload an .xlsx file using the field name \"file\"." });
      return;
    }
    try {
      const wb = XLSX.read(req.file.buffer, { type: "buffer" });
      const headerErrors = [
        ...assertSpareSheetHeaders(wb),
        ...assertHeaders(findSheet(wb, "Prices"), BULK_IMPORT_PRICES_COLUMNS, "Prices", { optional: true }),
        ...assertHeaders(findSheet(wb, "Stock"), BULK_IMPORT_STOCK_COLUMNS, "Stock", { optional: true }),
      ];
      if (headerErrors.length) {
        res.status(400).json({ ok: false, errors: headerErrors });
        return;
      }

      const { spareRows, priceRows, stockRows, parseErrors } = parseWorkbook(req.file.buffer);
      const dbErrors = await validateAgainstDb(pool, actor, spareRows, priceRows, stockRows);
      const errors = [...parseErrors, ...dbErrors];
      if (errors.length) {
        res.status(400).json({ ok: false, errors });
        return;
      }
      res.json({
        ok: true,
        summary: {
          spareRows: spareRows.length,
          priceRows: priceRows.length,
          stockRows: stockRows.length,
        },
      });
    } catch (e) {
      console.error(e);
      res.status(400).json({ ok: false, errors: ["Could not read the Excel file. Use the template .xlsx format."] });
    }
  });

  app.post("/api/inventory/bulk-import/commit", requireAuth, upload.single("file"), async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!canBulkImport(actor)) {
      res.status(403).json({ error: "Only super or regional admins can commit imports." });
      return;
    }
    if (!req.file?.buffer) {
      res.status(400).json({ error: "Upload the same validated .xlsx file using the field name \"file\"." });
      return;
    }
    try {
      const wb = XLSX.read(req.file.buffer, { type: "buffer" });
      const headerErrors = [
        ...assertSpareSheetHeaders(wb),
        ...assertHeaders(findSheet(wb, "Prices"), BULK_IMPORT_PRICES_COLUMNS, "Prices", { optional: true }),
        ...assertHeaders(findSheet(wb, "Stock"), BULK_IMPORT_STOCK_COLUMNS, "Stock", { optional: true }),
      ];
      if (headerErrors.length) {
        res.status(400).json({ ok: false, errors: headerErrors });
        return;
      }

      const { spareRows, priceRows, stockRows, parseErrors } = parseWorkbook(req.file.buffer);
      const dbErrors = await validateAgainstDb(pool, actor, spareRows, priceRows, stockRows);
      const errors = [...parseErrors, ...dbErrors];
      if (errors.length) {
        res.status(400).json({ ok: false, errors });
        return;
      }

      const { brandNamesLower, regionByName, storeByRegionAndName } = await loadRefs(pool);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const summary = await commitImport(
          client,
          actor,
          spareRows,
          priceRows,
          stockRows,
          brandNamesLower,
          regionByName,
          storeByRegionAndName,
        );
        await client.query("COMMIT");
        res.json({ ok: true, summary });
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
