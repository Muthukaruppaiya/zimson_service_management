import type { Express, NextFunction, Request, Response } from "express";
import multer from "multer";
import type { Pool, PoolClient } from "pg";
import * as XLSX from "xlsx";
import type { DemoUser } from "../src/types/user";
import { appendStockHistory } from "./db/stockHistory";

type Authed = Request & { userId: string };

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

const SPARES_HEADERS = ["sku", "name", "description", "category", "hsn", "mrp_inr", "is_active"] as const;
const PRICES_HEADERS = ["sku", "region_name", "watch_brand", "price_inr"] as const;
const STOCK_HEADERS = ["sku", "location_type", "region_name", "store_name", "quantity"] as const;

type SpareRow = {
  rowNum: number;
  sku: string;
  name: string;
  description: string;
  category: string;
  hsn: string | null;
  mrpInr: number | null;
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
  locationType: "HO" | "STORE";
  regionName: string;
  storeName: string | null;
  quantity: number;
};

function normHeader(h: unknown): string {
  return String(h ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function cellStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  return String(v).trim();
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

function parseSpares(rows: Record<string, unknown>[], baseRow: number): { rows: SpareRow[]; errors: string[] } {
  const errors: string[] = [];
  const parsed: SpareRow[] = [];
  rows.forEach((r, idx) => {
    const rowNum = baseRow + idx + 2;
    const sku = cellStr(r.sku).toUpperCase();
    if (!sku) return;
    const name = cellStr(r.name);
    const description = cellStr(r.description);
    const category = cellStr(r.category);
    const rowErrs: string[] = [];
    if (!name) rowErrs.push(`Spares row ${rowNum}: name is required for SKU "${sku}".`);
    if (!description) rowErrs.push(`Spares row ${rowNum}: description is required for SKU "${sku}".`);
    if (!category) rowErrs.push(`Spares row ${rowNum}: category is required for SKU "${sku}".`);
    const hsnRaw = cellStr(r.hsn);
    const mrp = parseNum(r.mrp_inr);
    if (r.mrp_inr != null && cellStr(r.mrp_inr) !== "" && mrp == null) {
      rowErrs.push(`Spares row ${rowNum}: mrp_inr must be a number for SKU "${sku}".`);
    }
    const activeP = parseBool(r.is_active);
    if (activeP === null && cellStr(r.is_active) !== "") {
      rowErrs.push(`Spares row ${rowNum}: is_active must be Y/N or true/false for SKU "${sku}".`);
    }
    errors.push(...rowErrs);
    if (rowErrs.length > 0) return;
    const isActive = activeP ?? true;
    parsed.push({
      rowNum,
      sku,
      name,
      description,
      category,
      hsn: hsnRaw || null,
      mrpInr: mrp,
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
    if (!regionName) rowErrs.push(`Prices row ${rowNum}: region_name is required for SKU "${sku}".`);
    if (!watchBrand) rowErrs.push(`Prices row ${rowNum}: watch_brand is required for SKU "${sku}".`);
    if (price == null || price < 0) {
      rowErrs.push(`Prices row ${rowNum}: price_inr must be a non-negative number for SKU "${sku}".`);
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
    const regionName = cellStr(r.region_name);
    const storeNameRaw = cellStr(r.store_name);
    const qty = parseNum(r.quantity);
    const rowErrs: string[] = [];
    if (lt !== "HO" && lt !== "STORE") {
      rowErrs.push(`Stock row ${rowNum}: location_type must be HO or STORE for SKU "${sku}".`);
    }
    if (!regionName) rowErrs.push(`Stock row ${rowNum}: region_name is required for SKU "${sku}".`);
    if (lt === "STORE" && !storeNameRaw) {
      rowErrs.push(`Stock row ${rowNum}: store_name is required when location_type is STORE for SKU "${sku}".`);
    }
    if (lt === "HO" && storeNameRaw) {
      rowErrs.push(`Stock row ${rowNum}: store_name must be empty for HO for SKU "${sku}".`);
    }
    if (qty == null || qty < 0) {
      rowErrs.push(`Stock row ${rowNum}: quantity must be a non-negative number for SKU "${sku}".`);
    }
    errors.push(...rowErrs);
    if (rowErrs.length > 0) return;
    parsed.push({
      rowNum,
      sku,
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

  const shSpares = findSheet(wb, "Spares");
  const shPrices = findSheet(wb, "Prices");
  const shStock = findSheet(wb, "Stock");

  if (!shSpares) parseErrors.push('Missing sheet "Spares". Use the downloaded template.');
  if (!shPrices) parseErrors.push('Missing sheet "Prices". Use the downloaded template.');
  if (!shStock) parseErrors.push('Missing sheet "Stock". Use the downloaded template.');

  const rawSpares = sheetRows(shSpares);
  const rawPrices = sheetRows(shPrices);
  const rawStock = sheetRows(shStock);

  const sp = parseSpares(rawSpares, 0);
  const pr = parsePrices(rawPrices, 0);
  const st = parseStock(rawStock, 0);

  return {
    spareRows: sp.rows,
    priceRows: pr.rows,
    stockRows: st.rows,
    parseErrors: [...parseErrors, ...sp.errors, ...pr.errors, ...st.errors],
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

  const skusNeeded = new Set<string>();
  for (const p of priceRows) skusNeeded.add(p.sku);
  for (const s of stockRows) skusNeeded.add(s.sku);
  for (const s of spareRows) skusNeeded.add(s.sku);

  const skuList = [...skusNeeded];
  const existing = new Set<string>();
  if (skuList.length > 0) {
    const { rows } = await pool.query<{ sku: string }>(
      `SELECT UPPER(TRIM(sku)) AS sku FROM spares WHERE UPPER(TRIM(sku)) = ANY($1::text[])`,
      [skuList],
    );
    for (const r of rows) existing.add(r.sku.toUpperCase());
  }

  const skusFromSparesSheet = new Set(spareRows.map((r) => r.sku));
  const spareSkuSeen = new Set<string>();
  for (const s of spareRows) {
    if (spareSkuSeen.has(s.sku)) {
      errors.push(`Spares: duplicate SKU "${s.sku}" (row ${s.rowNum}). Each SKU may appear only once on the Spares sheet.`);
    }
    spareSkuSeen.add(s.sku);
  }

  for (const sku of skusNeeded) {
    if (!skusFromSparesSheet.has(sku) && !existing.has(sku)) {
      errors.push(
        `SKU "${sku}" appears in Prices or Stock but is not in the Spares sheet and does not exist in the database. Add a Spares row or create the spare first.`,
      );
    }
  }

  const scopeRegion = actor.role === "regional_admin" ? actor.regionId : null;

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
  const skuToId = new Map<string, string>();

  let sparesUpserted = 0;
  for (const s of spareRows) {
    const before = await client.query<{ id: string }>(`SELECT id FROM spares WHERE UPPER(TRIM(sku)) = $1`, [s.sku]);
    const wasExisting = before.rows.length > 0;
    const ins = await client.query<{ id: string }>(
      `INSERT INTO spares (sku, name, description, category, hsn, mrp_inr, selling_price_inr, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $6, $7)
       ON CONFLICT (sku) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         category = EXCLUDED.category,
         hsn = EXCLUDED.hsn,
         mrp_inr = EXCLUDED.mrp_inr,
         selling_price_inr = EXCLUDED.selling_price_inr,
         is_active = EXCLUDED.is_active,
         updated_at = now()
       RETURNING id`,
      [s.sku, s.name, s.description, s.category, s.hsn, s.mrpInr, s.isActive],
    );
    const id = ins.rows[0]!.id;
    skuToId.set(s.sku, id);
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
  }

  const skusForPrice = new Set(priceRows.map((p) => p.sku));
  for (const sku of skusForPrice) {
    if (!skuToId.has(sku)) {
      const { rows } = await client.query<{ id: string; sku: string }>(
        `SELECT id, UPPER(TRIM(sku)) AS sku FROM spares WHERE UPPER(TRIM(sku)) = $1`,
        [sku],
      );
      if (rows[0]) skuToId.set(sku, rows[0]!.id);
    }
  }

  let pricesUpserted = 0;
  for (const p of priceRows) {
    const spareId = skuToId.get(p.sku);
    if (!spareId) throw new Error(`Internal: missing spare id for ${p.sku}`);
    const brandCanon = brandNamesLower.get(p.watchBrand.trim().toLowerCase());
    if (!brandCanon) throw new Error(`Internal: brand not resolved for ${p.watchBrand}`);
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

  const skusForStock = new Set(stockRows.map((p) => p.sku));
  for (const sku of skusForStock) {
    if (!skuToId.has(sku)) {
      const { rows } = await client.query<{ id: string }>(
        `SELECT id FROM spares WHERE UPPER(TRIM(sku)) = $1`,
        [sku],
      );
      if (rows[0]) skuToId.set(sku, rows[0]!.id);
    }
  }

  let stockUpserted = 0;
  for (const s of stockRows) {
    const spareId = skuToId.get(s.sku);
    if (!spareId) throw new Error(`Internal: missing spare id for ${s.sku}`);
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

  return { sparesUpserted, pricesUpserted, stockUpserted };
}

function assertHeaders(sheet: XLSX.WorkSheet | undefined, expected: readonly string[], sheetLabel: string): string[] {
  if (!sheet) return [`Missing ${sheetLabel} sheet.`];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  if (rows.length < 1) return [`${sheetLabel}: sheet is empty.`];
  const headerRaw = rows[0] as unknown[];
  const headers = headerRaw.map((h) => normHeader(h)).filter(Boolean);
  const missing = expected.filter((e) => !headers.includes(e));
  if (missing.length) {
    return [
      `${sheetLabel}: missing column(s): ${missing.join(", ")}. First row must be headers exactly as in the template (${expected.join(", ")}).`,
    ];
  }
  return [];
}

async function buildTemplateWorkbook(pool: Pool): Promise<Buffer> {
  const wb = XLSX.utils.book_new();

  const readme: string[][] = [
    ["Inventory bulk import — read me"],
    [""],
    ["Sheets (required names): Spares, Prices, Stock"],
    ["Fill data starting row 2 on each sheet. Row 1 must be the header row exactly as in the template."],
    [""],
    ["Spares: one row per SKU. sku, name, description, category are required. hsn optional. mrp_inr optional number."],
    ["is_active: Y/N or true/false (default Y). SKU is matched case-insensitively; stored uppercase."],
    [""],
    ["Prices: sku must exist in Spares sheet or already in DB. region_name and watch_brand (active brand name) and price_inr required."],
    [""],
    ["Stock: sku, location_type (HO or STORE), region_name, quantity required. store_name required for STORE, empty for HO."],
    ["location_key is built from DB IDs internally after name lookup."],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(readme), "README");

  const { rows: regRows } = await pool.query<{ id: string; name: string }>(
    `SELECT id, name FROM regions ORDER BY name`,
  );
  const { rows: storeRows } = await pool.query<{ id: string; region_id: string; name: string }>(
    `SELECT id, region_id, name FROM stores ORDER BY region_id, name`,
  );

  const { rows: brandRows } = await pool.query<{ name: string }>(
    `SELECT name FROM brands WHERE is_active = true ORDER BY sort_order, name`,
  );
  const sampleRegion = regRows[0]?.name ?? "REPLACE_WITH_REGION_NAME";
  const sampleRegionId = regRows[0]?.id ?? "";
  const sampleStore = storeRows.find((s) => s.region_id === sampleRegionId)?.name ?? "";
  const sampleBrand = brandRows[0]?.name ?? "Citizen";

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      [...SPARES_HEADERS],
      ["DEMO-SKU-001", "Demo spare", "Sample row — replace or delete", "Battery", "8544", "199", "Y"],
    ]),
    "Spares",
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      [...PRICES_HEADERS],
      ["DEMO-SKU-001", sampleRegion, sampleBrand, "150"],
    ]),
    "Prices",
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      [...STOCK_HEADERS],
      ["DEMO-SKU-001", "HO", sampleRegion, "", "10"],
      ...(sampleStore
        ? ([["DEMO-SKU-001", "STORE", sampleRegion, sampleStore, "2"]] as string[][])
        : ([] as string[][])),
    ]),
    "Stock",
  );

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function registerInventoryBulkImportRoutes(
  app: Express,
  pool: Pool,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
  getUserById: (id: string) => DemoUser | null,
): void {
  app.get("/api/inventory/bulk-import/template", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || (actor.role !== "super_admin" && actor.role !== "regional_admin" && actor.role !== "ho_admin")) {
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
    if (!actor || (actor.role !== "super_admin" && actor.role !== "regional_admin" && actor.role !== "ho_admin")) {
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
        ...assertHeaders(findSheet(wb, "Spares"), SPARES_HEADERS, "Spares"),
        ...assertHeaders(findSheet(wb, "Prices"), PRICES_HEADERS, "Prices"),
        ...assertHeaders(findSheet(wb, "Stock"), STOCK_HEADERS, "Stock"),
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
    if (!actor || (actor.role !== "super_admin" && actor.role !== "regional_admin" && actor.role !== "ho_admin")) {
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
        ...assertHeaders(findSheet(wb, "Spares"), SPARES_HEADERS, "Spares"),
        ...assertHeaders(findSheet(wb, "Prices"), PRICES_HEADERS, "Prices"),
        ...assertHeaders(findSheet(wb, "Stock"), STOCK_HEADERS, "Stock"),
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
