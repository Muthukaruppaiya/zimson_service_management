import type { Express, NextFunction, Request, Response } from "express";
import type { Pool } from "pg";
import type { BrandRow } from "../src/types/brand";
import type { CreateSpareInput, SparePart } from "../src/types/spare";
import type { DemoUser } from "../src/types/user";
import { appendStockHistory } from "./db/stockHistory";
import { clearSpareGstCache } from "./hsnGstRates";
import { validateEntityCustomFields } from "./customFields";
import { normalizeAltName, normalizeAltSku, optionalMasterText } from "../src/lib/spareIdentity";

function isHoAdminRole(role: string): boolean {
  return role === "super_admin" || role === "admin" || role === "admin";
}

function brandCodeFromName(name: string): string {
  const base = name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 24);
  return base || "BRAND";
}

function normalizeBrandCodeInput(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 32);
}

function rowToBrand(r: {
  id: string;
  code: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  serial_number_required: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}): BrandRow {
  const iso = (d: Date | string) => (d instanceof Date ? d.toISOString() : new Date(d).toISOString());
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    sortOrder: r.sort_order,
    isActive: r.is_active,
    serialNumberRequired: r.serial_number_required,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

type Authed = Request & { userId: string };

function rowToSpare(r: {
  id: string;
  sku: string;
  brand?: string | null;
  alt_sku?: string | null;
  name: string;
  alt_name?: string | null;
  description: string;
  category: string;
  model_no?: string | null;
  caliber?: string | null;
  sub_category?: string | null;
  size?: string | null;
  colour?: string | null;
  hsn: string | null;
  gst_percent: number | string | null;
  mrp_inr: number | null;
  cost_price_inr: number | null;
  selling_price_inr: number | null;
  is_active: boolean;
  created_at: Date | string;
  custom_fields?: unknown;
}): SparePart {
  const createdAt =
    r.created_at instanceof Date ? r.created_at.toISOString() : new Date(r.created_at).toISOString();
  const gstRaw = r.gst_percent;
  const gstPercent =
    gstRaw == null || gstRaw === ""
      ? null
      : Number.isFinite(Number(gstRaw))
        ? Number(gstRaw)
        : null;
  return {
    id: r.id,
    sku: r.sku,
    brand: String(r.brand ?? "").trim(),
    altSku: String(r.alt_sku ?? "").trim() || null,
    name: r.name,
    altName: String(r.alt_name ?? "").trim() || null,
    description: r.description,
    category: r.category,
    modelNo: String(r.model_no ?? "").trim() || null,
    caliber: String(r.caliber ?? "").trim() || null,
    subCategory: String(r.sub_category ?? "").trim() || null,
    size: String(r.size ?? "").trim() || null,
    colour: String(r.colour ?? "").trim() || null,
    hsn: r.hsn,
    gstPercent,
    costPriceInr: r.cost_price_inr == null ? null : Number(r.cost_price_inr),
    sellingPriceInr: r.selling_price_inr == null ? (r.mrp_inr == null ? null : Number(r.mrp_inr)) : Number(r.selling_price_inr),
    mrpInr: r.mrp_inr == null ? null : Number(r.mrp_inr),
    isActive: r.is_active,
    customFields:
      r.custom_fields && typeof r.custom_fields === "object" && !Array.isArray(r.custom_fields)
        ? (r.custom_fields as SparePart["customFields"])
        : {},
    createdAt,
  };
}

const SPARE_SELECT = `id, sku, brand, alt_sku, name, alt_name, description, category, model_no, caliber, sub_category, size, colour, hsn, gst_percent, mrp_inr, cost_price_inr, selling_price_inr, is_active, created_at, custom_fields`;

export function registerCatalogRoutes(
  app: Express,
  pool: Pool,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
  getUserById: (id: string) => DemoUser | null,
): void {
  app.get("/api/spares", requireAuth, async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT ${SPARE_SELECT}
         FROM spares
         ORDER BY created_at DESC`,
      );
      res.json({ spares: rows.map((r) => rowToSpare(r as Parameters<typeof rowToSpare>[0])) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to load spares." });
    }
  });

  app.get("/api/catalog/spares-by-brand", requireAuth, async (req, res) => {
    const brand = String(req.query.brand ?? "").trim();
    if (!brand) {
      res.status(400).json({ error: "brand is required." });
      return;
    }
    try {
      const { rows } = await pool.query(
        `SELECT ${SPARE_SELECT}
         FROM spares s
         WHERE s.is_active = true
           AND (
             LOWER(BTRIM(s.brand)) = LOWER(BTRIM($1))
             OR (
               BTRIM(s.brand) = ''
               AND EXISTS (
                 SELECT 1
                 FROM spare_prices p
                 WHERE p.spare_id = s.id
                   AND LOWER(TRIM(p.brand)) = LOWER(TRIM($1))
               )
             )
           )
         ORDER BY s.name ASC, s.sku ASC`,
        [brand],
      );
      res.json({ spares: rows.map((r) => rowToSpare(r as Parameters<typeof rowToSpare>[0])) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to load brand spares." });
    }
  });

  app.post("/api/spares", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || (actor.role !== "super_admin" && actor.role !== "admin" && actor.role !== "admin")) {
      res.status(403).json({ error: "Only admin users can create spare master rows." });
      return;
    }

    const input = req.body as CreateSpareInput;
    const sku = input.sku.trim().toUpperCase();
    const brandRaw = String(input.brand ?? "").trim();
    const name = input.name.trim();
    const description = input.description.trim();
    const category = input.category.trim();
    const isActive = input.isActive ?? true;
    const gstPercent = input.gstPercent;
    if (gstPercent != null && (Number.isNaN(gstPercent) || gstPercent < 0 || gstPercent > 100)) {
      res.status(400).json({ error: "gstPercent must be between 0 and 100." });
      return;
    }
    if (!sku || !brandRaw || !name || !description || !category) {
      res.status(400).json({ error: "sku, brand, name, description and category are required." });
      return;
    }
    const customChecked = await validateEntityCustomFields(pool, "spare", input.customFields);
    if (!customChecked.ok) {
      res.status(400).json({ error: customChecked.error });
      return;
    }
    try {
      const bRes = await pool.query<{ name: string }>(
        `SELECT name FROM brands WHERE is_active = true AND LOWER(TRIM(name)) = LOWER(TRIM($1)) LIMIT 1`,
        [brandRaw],
      );
      if (bRes.rowCount === 0) {
        res.status(400).json({ error: "Brand must match an active master brand from Inventory → Brands." });
        return;
      }
      const brand = bRes.rows[0]!.name;
      const altSku = normalizeAltSku(input.altSku);
      const altName = normalizeAltName(input.altName);
      const modelNo = optionalMasterText(input.modelNo);
      const caliber = optionalMasterText(input.caliber);
      const subCategory = optionalMasterText(input.subCategory);
      const size = optionalMasterText(input.size, 80);
      const colour = optionalMasterText(input.colour, 80);
      const ins = await pool.query(
        `INSERT INTO spares (sku, brand, alt_sku, name, alt_name, description, category, model_no, caliber, sub_category, size, colour, hsn, gst_percent, mrp_inr, cost_price_inr, selling_price_inr, is_active, custom_fields)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19::jsonb)
         RETURNING ${SPARE_SELECT}`,
        [
          sku,
          brand,
          altSku,
          name,
          altName,
          description,
          category,
          modelNo,
          caliber,
          subCategory,
          size,
          colour,
          input.hsn?.trim() || null,
          gstPercent ?? null,
          input.mrpInr ?? input.sellingPriceInr ?? null,
          input.costPriceInr ?? null,
          input.sellingPriceInr ?? input.mrpInr ?? null,
          isActive,
          JSON.stringify(customChecked.values),
        ],
      );
      const row = ins.rows[0] as Parameters<typeof rowToSpare>[0];
      clearSpareGstCache();
      await appendStockHistory(pool, {
        spareId: row.id,
        eventType: "SPARE_CREATED",
        referenceType: "MANUAL",
        note: "Spare master row created.",
        createdBy: actor.id,
      });
      res.json({ spare: rowToSpare(row) });
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === "23505") {
        res.status(400).json({ error: "A spare with this part number and brand already exists." });
        return;
      }
      console.error(e);
      res.status(500).json({ error: "Could not create spare." });
    }
  });

  app.patch("/api/spares/:spareId", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || (actor.role !== "super_admin" && actor.role !== "admin")) {
      res.status(403).json({ error: "Only admin users can update spare master rows." });
      return;
    }
    const spareId = req.params.spareId;
    const body = req.body ?? {};

    const name = body.name != null ? String(body.name).trim() : undefined;
    const brandRaw = body.brand != null ? String(body.brand).trim() : undefined;
    const altSku = body.altSku !== undefined ? normalizeAltSku(body.altSku) : undefined;
    const altName = body.altName !== undefined ? normalizeAltName(body.altName) : undefined;
    const description = body.description != null ? String(body.description).trim() : undefined;
    const category = body.category != null ? String(body.category).trim() : undefined;
    const modelNo = body.modelNo !== undefined ? optionalMasterText(body.modelNo) : undefined;
    const caliber = body.caliber !== undefined ? optionalMasterText(body.caliber) : undefined;
    const subCategory = body.subCategory !== undefined ? optionalMasterText(body.subCategory) : undefined;
    const size = body.size !== undefined ? optionalMasterText(body.size, 80) : undefined;
    const colour = body.colour !== undefined ? optionalMasterText(body.colour, 80) : undefined;
    const hsn = body.hsn != null ? String(body.hsn).trim() || null : undefined;
    const gstPercentRaw = body.gstPercent;
    const gstPercent =
      gstPercentRaw === undefined
        ? undefined
        : gstPercentRaw === null || gstPercentRaw === ""
          ? null
          : Number(gstPercentRaw);
    const costRaw = body.costPriceInr;
    const costPriceInr =
      costRaw === undefined
        ? undefined
        : costRaw === null || costRaw === ""
          ? null
          : Number(costRaw);
    const sellRaw = body.sellingPriceInr;
    const sellingPriceInr =
      sellRaw === undefined
        ? undefined
        : sellRaw === null || sellRaw === ""
          ? null
          : Number(sellRaw);
    const mrpRaw = body.mrpInr;
    const mrpInr =
      mrpRaw === undefined
        ? undefined
        : mrpRaw === null || mrpRaw === ""
          ? null
          : Number(mrpRaw);
    const isActive = body.isActive === undefined ? undefined : Boolean(body.isActive);

    if (name !== undefined && !name) {
      res.status(400).json({ error: "Name is required." });
      return;
    }
    if (brandRaw !== undefined && !brandRaw) {
      res.status(400).json({ error: "Brand is required." });
      return;
    }
    if (category !== undefined && !category) {
      res.status(400).json({ error: "Category is required." });
      return;
    }
    if (gstPercent !== undefined && gstPercent != null && (Number.isNaN(gstPercent) || gstPercent < 0 || gstPercent > 100)) {
      res.status(400).json({ error: "gstPercent must be between 0 and 100." });
      return;
    }
    if (costPriceInr !== undefined && costPriceInr != null && (Number.isNaN(costPriceInr) || costPriceInr < 0)) {
      res.status(400).json({ error: "costPriceInr must be a non-negative number." });
      return;
    }
    if (sellingPriceInr !== undefined && sellingPriceInr != null && (Number.isNaN(sellingPriceInr) || sellingPriceInr < 0)) {
      res.status(400).json({ error: "sellingPriceInr must be a non-negative number." });
      return;
    }
    if (mrpInr !== undefined && mrpInr != null && (Number.isNaN(mrpInr) || mrpInr < 0)) {
      res.status(400).json({ error: "mrpInr must be a non-negative number." });
      return;
    }

    const sets: string[] = ["updated_at = now()"];
    const vals: unknown[] = [];
    let i = 1;
    if (name !== undefined) {
      sets.push(`name = $${i++}`);
      vals.push(name);
    }
    if (brandRaw !== undefined) {
      const bRes = await pool.query<{ name: string }>(
        `SELECT name FROM brands WHERE is_active = true AND LOWER(TRIM(name)) = LOWER(TRIM($1)) LIMIT 1`,
        [brandRaw],
      );
      if (bRes.rowCount === 0) {
        res.status(400).json({ error: "Brand must match an active master brand from Inventory → Brands." });
        return;
      }
      sets.push(`brand = $${i++}`);
      vals.push(bRes.rows[0]!.name);
    }
    if (altSku !== undefined) {
      sets.push(`alt_sku = $${i++}`);
      vals.push(altSku);
    }
    if (altName !== undefined) {
      sets.push(`alt_name = $${i++}`);
      vals.push(altName);
    }
    if (description !== undefined) {
      sets.push(`description = $${i++}`);
      vals.push(description);
    }
    if (category !== undefined) {
      sets.push(`category = $${i++}`);
      vals.push(category);
    }
    if (modelNo !== undefined) {
      sets.push(`model_no = $${i++}`);
      vals.push(modelNo);
    }
    if (caliber !== undefined) {
      sets.push(`caliber = $${i++}`);
      vals.push(caliber);
    }
    if (subCategory !== undefined) {
      sets.push(`sub_category = $${i++}`);
      vals.push(subCategory);
    }
    if (size !== undefined) {
      sets.push(`size = $${i++}`);
      vals.push(size);
    }
    if (colour !== undefined) {
      sets.push(`colour = $${i++}`);
      vals.push(colour);
    }
    if (hsn !== undefined) {
      sets.push(`hsn = $${i++}`);
      vals.push(hsn);
    }
    if (gstPercent !== undefined) {
      sets.push(`gst_percent = $${i++}`);
      vals.push(gstPercent);
    }
    if (costPriceInr !== undefined) {
      sets.push(`cost_price_inr = $${i++}`);
      vals.push(costPriceInr);
    }
    if (sellingPriceInr !== undefined) {
      sets.push(`selling_price_inr = $${i++}`);
      vals.push(sellingPriceInr);
      // Keep legacy MRP aligned with selling price when selling is updated and MRP not sent.
      if (mrpInr === undefined) {
        sets.push(`mrp_inr = $${i++}`);
        vals.push(sellingPriceInr);
      }
    }
    if (mrpInr !== undefined) {
      sets.push(`mrp_inr = $${i++}`);
      vals.push(mrpInr);
    }
    if (isActive !== undefined) {
      sets.push(`is_active = $${i++}`);
      vals.push(isActive);
    }
    if (body.customFields !== undefined) {
      const customChecked = await validateEntityCustomFields(pool, "spare", body.customFields);
      if (!customChecked.ok) {
        res.status(400).json({ error: customChecked.error });
        return;
      }
      sets.push(`custom_fields = $${i++}::jsonb`);
      vals.push(JSON.stringify(customChecked.values));
    }

    if (sets.length === 1) {
      res.status(400).json({ error: "Nothing to update." });
      return;
    }

    try {
      vals.push(spareId);
      const upd = await pool.query(
        `UPDATE spares SET ${sets.join(", ")} WHERE id = $${i}::uuid RETURNING ${SPARE_SELECT}`,
        vals,
      );
      if (!upd.rows[0]) {
        res.status(404).json({ error: "Spare not found." });
        return;
      }
      clearSpareGstCache();
      res.json({ spare: rowToSpare(upd.rows[0] as Parameters<typeof rowToSpare>[0]) });
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === "23505") {
        res.status(400).json({ error: "A spare with this part number and brand already exists." });
        return;
      }
      res.status(400).json({ error: "Could not update spare." });
    }
  });

  app.get("/api/catalog/spares/:spareId/prices", requireAuth, async (req, res) => {
    const spareId = req.params.spareId;
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    const requestedRegion = String(req.query.regionId ?? "").trim();
    let regionId: string | null = null;
    if (actor.role === "super_admin" || actor.role === "admin") {
      regionId = requestedRegion || null;
    } else {
      regionId = actor.regionId;
    }
    try {
      const { rows } = await pool.query(
        `SELECT id,
                spare_id AS "spareId",
                region_id AS "regionId",
                brand,
                price::float8 AS price,
                created_at AS "createdAt"
         FROM spare_prices
         WHERE spare_id = $1::uuid
           AND (($2::text IS NULL AND region_id IS NULL) OR region_id = $2::text)
         ORDER BY brand`,
        [spareId, regionId],
      );
      res.json({ prices: rows });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Invalid spare id." });
    }
  });

  app.post("/api/catalog/spares/:spareId/prices", requireAuth, async (req, res) => {
    const spareId = req.params.spareId;
    const actor = getUserById((req as Authed).userId);
    if (!actor || (actor.role !== "super_admin" && actor.role !== "admin" && actor.role !== "admin")) {
      res.status(403).json({ error: "Only admin users can save prices." });
      return;
    }

    const brand = String(req.body?.brand ?? "").trim();
    const price = Number(req.body?.price);
    const requestedRegion = String(req.body?.regionId ?? "").trim();
    const regionId = actor.role === "super_admin" || actor.role === "admin" ? requestedRegion || null : actor.regionId;
    if (!brand || Number.isNaN(price) || price < 0) {
      res.status(400).json({ error: "brand and non-negative price are required." });
      return;
    }
    if ((actor.role === "super_admin" || actor.role === "admin") && !regionId) {
      res.status(400).json({ error: "regionId is required for region price." });
      return;
    }
    if (!regionId) {
      res.status(400).json({ error: "Actor region is required for pricing." });
      return;
    }
    try {
      const bRes = await pool.query<{ name: string }>(
        `SELECT name FROM brands WHERE is_active = true AND LOWER(TRIM(name)) = LOWER(TRIM($1)) LIMIT 1`,
        [brand],
      );
      if (bRes.rowCount === 0) {
        res.status(400).json({ error: "Brand must match an active master brand from Inventory → Brands." });
        return;
      }
      const brandCanonical = bRes.rows[0]!.name;
      const spareRes = await pool.query<{ brand: string }>(`SELECT brand FROM spares WHERE id = $1::uuid`, [spareId]);
      const spareBrand = String(spareRes.rows[0]?.brand ?? "").trim();
      if (spareBrand && spareBrand.toLowerCase() !== brandCanonical.toLowerCase()) {
        res.status(400).json({
          error: `This spare is for ${spareBrand}. Add a separate catalogue row for ${brandCanonical} with the same part number.`,
        });
        return;
      }
      const priceBrand = spareBrand || brandCanonical;
      await pool.query(
        `INSERT INTO spare_prices (spare_id, region_id, brand, price)
         VALUES ($1::uuid, $2::text, $3, $4)
         ON CONFLICT (spare_id, brand, region_id)
         DO UPDATE SET price = EXCLUDED.price, updated_at = now()`,
        [spareId, regionId, priceBrand, price],
      );
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Could not save price line." });
    }
  });

  app.get("/api/brands", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    const allQ = String(req.query.all ?? "").trim() === "1";
    const includeInactive = allQ && isHoAdminRole(actor.role);
    try {
      const where = includeInactive ? "" : "WHERE is_active = true";
      const { rows } = await pool.query(
        `SELECT id, code, name, sort_order, is_active, serial_number_required, created_at, updated_at
         FROM brands
         ${where}
         ORDER BY sort_order, name`,
      );
      res.json({ brands: rows.map((r) => rowToBrand(r as Parameters<typeof rowToBrand>[0])) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not load brands." });
    }
  });

  app.post("/api/brands", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || !isHoAdminRole(actor.role)) {
      res.status(403).json({ error: "Only HO admins can manage brands." });
      return;
    }
    const name = String(req.body?.name ?? "").trim();
    if (!name) {
      res.status(400).json({ error: "name is required." });
      return;
    }
    const sortOrderRaw = req.body?.sortOrder;
    const sortOrder =
      sortOrderRaw === undefined || sortOrderRaw === null || sortOrderRaw === ""
        ? 0
        : Number(sortOrderRaw);
    const serialNumberRequired = req.body?.serialNumberRequired === true;
    if (Number.isNaN(sortOrder)) {
      res.status(400).json({ error: "sortOrder must be a number." });
      return;
    }
    let baseCode = String(req.body?.code ?? "").trim();
    baseCode = baseCode ? normalizeBrandCodeInput(baseCode) : brandCodeFromName(name);
    if (!baseCode) {
      res.status(400).json({ error: "Could not derive a brand code; provide code explicitly." });
      return;
    }
    try {
      const dupName = await pool.query(`SELECT id FROM brands WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) LIMIT 1`, [
        name,
      ]);
      if (dupName.rowCount && dupName.rowCount > 0) {
        res.status(400).json({ error: "A brand with this name already exists." });
        return;
      }
      let attempt = 0;
      let code = baseCode;
      while (attempt < 24) {
        try {
          const ins = await pool.query(
            `INSERT INTO brands (code, name, sort_order, serial_number_required)
             VALUES ($1, $2, $3, $4)
             RETURNING id, code, name, sort_order, is_active, serial_number_required, created_at, updated_at`,
            [code, name, sortOrder, serialNumberRequired],
          );
          const row = ins.rows[0] as Parameters<typeof rowToBrand>[0];
          res.json({ brand: rowToBrand(row) });
          return;
        } catch (e: unknown) {
          const err = e as { code?: string };
          if (err.code === "23505") {
            attempt += 1;
            const suffix = String(attempt);
            code = `${baseCode}`.slice(0, Math.max(1, 32 - suffix.length)) + suffix;
            continue;
          }
          throw e;
        }
      }
      res.status(400).json({ error: "Could not allocate a unique brand code." });
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === "23505") {
        res.status(400).json({ error: "A brand with this name or code already exists." });
        return;
      }
      console.error(e);
      res.status(500).json({ error: "Could not create brand." });
    }
  });

  app.patch("/api/brands/:brandId", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || !isHoAdminRole(actor.role)) {
      res.status(403).json({ error: "Only HO admins can manage brands." });
      return;
    }
    const brandId = req.params.brandId;
    const nameRaw = req.body?.name;
    const codeRaw = req.body?.code;
    const sortOrderRaw = req.body?.sortOrder;
    const isActiveRaw = req.body?.isActive;
    const serialNumberRequiredRaw = req.body?.serialNumberRequired;
    const updates: string[] = [];
    const params: unknown[] = [];
    if (nameRaw !== undefined) {
      const name = String(nameRaw).trim();
      if (!name) {
        res.status(400).json({ error: "name cannot be empty." });
        return;
      }
      params.push(name);
      updates.push(`name = $${params.length}`);
    }
    if (codeRaw !== undefined) {
      const code = normalizeBrandCodeInput(String(codeRaw));
      if (!code) {
        res.status(400).json({ error: "code cannot be empty." });
        return;
      }
      params.push(code);
      updates.push(`code = $${params.length}`);
    }
    if (sortOrderRaw !== undefined) {
      const sortOrder = Number(sortOrderRaw);
      if (Number.isNaN(sortOrder)) {
        res.status(400).json({ error: "sortOrder must be a number." });
        return;
      }
      params.push(sortOrder);
      updates.push(`sort_order = $${params.length}`);
    }
    if (isActiveRaw !== undefined) {
      params.push(Boolean(isActiveRaw));
      updates.push(`is_active = $${params.length}`);
    }
    if (serialNumberRequiredRaw !== undefined) {
      params.push(Boolean(serialNumberRequiredRaw));
      updates.push(`serial_number_required = $${params.length}`);
    }
    if (updates.length === 0) {
      res.status(400).json({ error: "No fields to update." });
      return;
    }
    params.push(brandId);
    try {
      const upd = await pool.query(
        `UPDATE brands SET ${updates.join(", ")}, updated_at = now()
         WHERE id = $${params.length}::uuid
         RETURNING id, code, name, sort_order, is_active, serial_number_required, created_at, updated_at`,
        params,
      );
      if (upd.rowCount === 0) {
        res.status(404).json({ error: "Brand not found." });
        return;
      }
      const row = upd.rows[0] as Parameters<typeof rowToBrand>[0];
      res.json({ brand: rowToBrand(row) });
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === "23505") {
        res.status(400).json({ error: "Name or code conflicts with another brand." });
        return;
      }
      console.error(e);
      res.status(500).json({ error: "Could not update brand." });
    }
  });

  app.get("/api/catalog/spares/:spareId/stock", requireAuth, async (req, res) => {
    const spareId = req.params.spareId;
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    try {
      let whereExtra = "";
      const params: unknown[] = [spareId];
      const aggregateRegion = String(req.query.aggregate ?? "").trim() === "region";
      const regionScopeQ = String(req.query.regionId ?? "").trim();
      const storeIdQ = String(req.query.storeId ?? "").trim();

      if (storeIdQ) {
        if (
          (actor.role === "store_user" ||
            actor.role === "store_manager" ||
            actor.role === "store_accounts") &&
          storeIdQ !== actor.storeId
        ) {
          res.status(403).json({ error: "Cannot view stock for another store." });
          return;
        }
        let regionId = regionScopeQ || actor.regionId || "";
        if (!regionId) {
          const storeRow = await pool.query<{ region_id: string }>(
            `SELECT region_id FROM stores WHERE id = $1::text`,
            [storeIdQ],
          );
          regionId = String(storeRow.rows[0]?.region_id ?? "").trim();
        }
        if (!regionId) {
          res.status(400).json({ error: "regionId is required with storeId." });
          return;
        }
        if (actor.role === "admin" && actor.regionId !== regionId) {
          res.status(403).json({ error: "Cannot view stock outside your region." });
          return;
        }
        params.push(regionId, storeIdQ);
        whereExtra = " AND location_type = 'STORE' AND region_id = $2::text AND store_id = $3::text";
      } else if (aggregateRegion) {
        const scope =
          actor.role === "super_admin" || actor.role === "admin" ? regionScopeQ || null : actor.regionId ?? null;
        if (scope) {
          params.push(scope);
          whereExtra = " AND region_id = $2::text";
        }
      }
      if (!whereExtra) {
        if (actor.role === "admin") {
          params.push(actor.regionId);
          whereExtra = " AND region_id = $2::text";
        } else if (
          actor.role === "store_user" ||
          actor.role === "store_manager" ||
          actor.role === "store_accounts"
        ) {
          if (!actor.regionId || !actor.storeId) {
            res.status(400).json({ error: "Store account is missing region or store assignment." });
            return;
          }
          params.push(actor.regionId, actor.storeId);
          whereExtra = " AND location_type = 'STORE' AND region_id = $2::text AND store_id = $3::text";
        } else if (
          actor.role === "service_centre_clerk" ||
          actor.role === "service_centre_supervisor" ||
          actor.role === "technician"
        ) {
          params.push(actor.regionId);
          whereExtra = " AND location_type = 'HO' AND region_id = $2::text";
        }
      }

      const { rows } = await pool.query(
        `SELECT id,
                spare_id AS "spareId",
                location_type AS "locationType",
                region_id AS "regionId",
                store_id AS "storeId",
                quantity::float8 AS quantity,
                updated_at AS "updatedAt"
         FROM spare_stock
         WHERE spare_id = $1::uuid${whereExtra}
         ORDER BY location_type, region_id, store_id`,
        params,
      );
      res.json({ stock: rows });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Could not load stock rows." });
    }
  });

  app.post("/api/catalog/spares/:spareId/stock", requireAuth, async (req, res) => {
    const sid = req.params.spareId;
    const spareId = Array.isArray(sid) ? sid[0] ?? "" : String(sid ?? "");
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    if (!spareId) {
      res.status(400).json({ error: "Invalid spare id." });
      return;
    }

    const locationType = String(req.body?.locationType ?? "").toUpperCase();
    const regionId = String(req.body?.regionId ?? "").trim();
    const storeIdRaw = req.body?.storeId;
    const storeId = storeIdRaw == null || storeIdRaw === "" ? null : String(storeIdRaw);
    const quantity = Number(req.body?.quantity);
    const modeRaw = String(req.body?.mode ?? "add").toLowerCase();
    const mode = modeRaw === "set" ? "set" : "add";

    if ((locationType !== "HO" && locationType !== "STORE") || !regionId || Number.isNaN(quantity) || quantity < 0) {
      res.status(400).json({ error: "locationType(HO/STORE), regionId and non-negative quantity are required." });
      return;
    }
    if (locationType === "STORE" && !storeId) {
      res.status(400).json({ error: "storeId is required for STORE location." });
      return;
    }

    if (actor.role === "store_user") {
      if (locationType !== "STORE" || actor.regionId !== regionId || actor.storeId !== storeId) {
        res.status(403).json({ error: "Store user can update only own store stock." });
        return;
      }
    } else if (
      actor.role === "service_centre_clerk" ||
      actor.role === "service_centre_supervisor" ||
      actor.role === "technician"
    ) {
      if (locationType !== "HO" || actor.regionId !== regionId) {
        res.status(403).json({ error: "HO users can update only own region HO stock." });
        return;
      }
    } else if (actor.role === "admin") {
      if (actor.regionId !== regionId) {
        res.status(403).json({ error: "Regional admin can update only own region stock." });
        return;
      }
    } else if (actor.role !== "super_admin" && actor.role !== "admin") {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    const locationKey = locationType === "HO" ? `HO:${regionId}` : `STORE:${regionId}:${storeId}`;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const prev = await client.query<{ qty: number }>(
        `SELECT quantity::float8 AS qty
         FROM spare_stock
         WHERE spare_id = $1::uuid AND location_key = $2
         FOR UPDATE`,
        [spareId, locationKey],
      );
      const prevQty = prev.rows[0]?.qty ?? 0;
      const newQty = mode === "set" ? quantity : prevQty + quantity;
      await client.query(
        `INSERT INTO spare_stock (spare_id, location_key, location_type, region_id, store_id, quantity)
         VALUES ($1::uuid, $2, $3, $4, $5, $6)
         ON CONFLICT (spare_id, location_key)
         DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now()`,
        [spareId, locationKey, locationType, regionId, storeId, newQty],
      );
      await appendStockHistory(client, {
        spareId,
        eventType: "MANUAL_STOCK_SET",
        locationKey,
        locationType: locationType as "HO" | "STORE",
        regionId,
        storeId,
        quantityChange: newQty - prevQty,
        balanceAfter: newQty,
        referenceType: "MANUAL",
        note:
          mode === "set"
            ? "Manual stock set (absolute) from inventory master."
            : "Manual stock adjustment (add to existing) from inventory master.",
        createdBy: actor.id,
      });
      await client.query("COMMIT");
      res.json({ ok: true });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(e);
      res.status(400).json({ error: "Could not save stock row." });
    } finally {
      client.release();
    }
  });

  app.get("/api/catalog/spares/:spareId/stock-history", requireAuth, async (req, res) => {
    const spareId = req.params.spareId;
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    const regionIdQ = String(req.query.regionId ?? "").trim();
    const storeIdQ = String(req.query.storeId ?? "").trim();
    const locationTypeQ = String(req.query.locationType ?? "").trim().toUpperCase();
    const limitRaw = Number(req.query.limit ?? 100);
    const limit = Number.isNaN(limitRaw) ? 100 : Math.max(20, Math.min(500, limitRaw));
    const params: unknown[] = [spareId];
    let where = "h.spare_id = $1::uuid";

    if (locationTypeQ === "HO" || locationTypeQ === "STORE") {
      params.push(locationTypeQ);
      where += ` AND h.location_type = $${params.length}`;
    }
    if (regionIdQ) {
      params.push(regionIdQ);
      where += ` AND h.region_id = $${params.length}::text`;
    }
    if (storeIdQ) {
      params.push(storeIdQ);
      where += ` AND h.store_id = $${params.length}::text`;
    }

    if (actor.role === "admin") {
      params.push(actor.regionId);
      where += ` AND (h.event_type = 'SPARE_CREATED' OR h.region_id = $${params.length}::text)`;
    } else if (actor.role === "store_user") {
      params.push(actor.regionId, actor.storeId);
      where += ` AND (
        h.event_type = 'SPARE_CREATED'
        OR (h.location_type = 'STORE' AND h.region_id = $${params.length - 1}::text AND h.store_id = $${params.length}::text)
      )`;
    } else if (
      actor.role === "service_centre_clerk" ||
      actor.role === "service_centre_supervisor" ||
      actor.role === "technician"
    ) {
      params.push(actor.regionId);
      where += ` AND (h.event_type = 'SPARE_CREATED' OR (h.location_type = 'HO' AND h.region_id = $${params.length}::text))`;
    } else if (actor.role !== "super_admin" && actor.role !== "admin") {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    params.push(limit);
    try {
      const { rows } = await pool.query(
        `SELECT h.id,
                h.spare_id AS "spareId",
                h.event_type AS "eventType",
                h.location_key AS "locationKey",
                h.location_type AS "locationType",
                h.region_id AS "regionId",
                h.store_id AS "storeId",
                h.quantity_change::float8 AS "quantityChange",
                h.balance_after::float8 AS "balanceAfter",
                h.reference_type AS "referenceType",
                h.reference_number AS "referenceNumber",
                h.note,
                h.created_by AS "createdBy",
                h.created_at AS "createdAt",
                r.name AS "regionName",
                s.name AS "storeName"
         FROM spare_stock_history h
         LEFT JOIN regions r ON r.id = h.region_id
         LEFT JOIN stores s ON s.id = h.store_id
         WHERE ${where}
         ORDER BY h.created_at DESC
         LIMIT $${params.length}`,
        params,
      );
      res.json({ history: rows });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Could not load stock history." });
    }
  });

  async function loadServicePackages(filters: {
    brand?: string;
    serviceType?: string;
    includeInactive?: boolean;
  }) {
    const where: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (filters.brand?.trim()) {
      where.push(`LOWER(TRIM(p.brand)) = LOWER(TRIM($${i++}))`);
      params.push(filters.brand.trim());
    }
    if (filters.serviceType === "quartz" || filters.serviceType === "mechanical") {
      where.push(`p.service_type = $${i++}`);
      params.push(filters.serviceType);
    }
    if (!filters.includeInactive) {
      where.push("p.is_active = true");
    }
    const sqlWhere = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const { rows: pkgs } = await pool.query<{
      id: string;
      brand: string;
      service_type: string;
      package_type: string;
      price_inr: number;
      is_active: boolean;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT id, brand, service_type, package_type, price_inr::float8 AS price_inr,
              is_active, created_at, updated_at
       FROM service_packages p
       ${sqlWhere}
       ORDER BY p.brand, p.service_type, p.package_type`,
      params,
    );
    if (pkgs.length === 0) return [];
    const ids = pkgs.map((p) => p.id);
    const { rows: spareRows } = await pool.query<{
      package_id: string;
      spare_id: string;
      qty: number;
      sort_order: number;
      name: string;
      sku: string;
    }>(
      `SELECT ps.package_id, ps.spare_id, ps.qty::float8 AS qty, ps.sort_order,
              s.name, s.sku
       FROM service_package_spares ps
       JOIN spares s ON s.id = ps.spare_id
       WHERE ps.package_id = ANY($1::uuid[])
       ORDER BY ps.sort_order, s.name`,
      [ids],
    );
    const byPkg = new Map<string, typeof spareRows>();
    for (const row of spareRows) {
      const list = byPkg.get(row.package_id) ?? [];
      list.push(row);
      byPkg.set(row.package_id, list);
    }
    return pkgs.map((p) => ({
      id: p.id,
      brand: p.brand,
      serviceType: p.service_type,
      packageType: p.package_type,
      priceInr: Number(p.price_inr) || 0,
      isActive: p.is_active,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
      spares: (byPkg.get(p.id) ?? []).map((s) => ({
        spareId: s.spare_id,
        name: s.name,
        sku: s.sku,
        qty: Number(s.qty) || 1,
      })),
    }));
  }

  async function replacePackageSpares(
    client: { query: Pool["query"] },
    packageId: string,
    spares: Array<{ spareId: string; qty?: number }>,
  ) {
    await client.query(`DELETE FROM service_package_spares WHERE package_id = $1::uuid`, [packageId]);
    let sort = 0;
    for (const sp of spares) {
      const spareId = String(sp.spareId ?? "").trim();
      if (!spareId) continue;
      const qty = Number(sp.qty);
      await client.query(
        `INSERT INTO service_package_spares (package_id, spare_id, qty, sort_order)
         VALUES ($1::uuid, $2::uuid, $3, $4)`,
        [packageId, spareId, Number.isFinite(qty) && qty > 0 ? Math.round(qty) : 1, sort],
      );
      sort += 1;
    }
  }

  app.get("/api/catalog/service-packages", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    try {
      const packages = await loadServicePackages({
        brand: String(req.query.brand ?? "").trim() || undefined,
        serviceType: String(req.query.serviceType ?? "").trim() || undefined,
        includeInactive: String(req.query.all ?? "") === "1" && isHoAdminRole(actor.role),
      });
      res.json({ packages });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not load service packages." });
    }
  });

  app.get("/api/catalog/service-packages/:packageId", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    const packageId = String(req.params.packageId ?? "").trim();
    if (!packageId) {
      res.status(400).json({ error: "packageId is required." });
      return;
    }
    try {
      const packages = await loadServicePackages({ includeInactive: true });
      const found = packages.find((p) => p.id === packageId);
      if (!found) {
        res.status(404).json({ error: "Package not found." });
        return;
      }
      res.json({ package: found });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not load service package." });
    }
  });

  app.post("/api/catalog/service-packages", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || !isHoAdminRole(actor.role)) {
      res.status(403).json({ error: "Only HO admins can manage service packages." });
      return;
    }
    const brand = String(req.body?.brand ?? "").trim();
    const serviceType = String(req.body?.serviceType ?? "").trim().toLowerCase();
    const packageType = String(req.body?.packageType ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 40);
    const priceInr = Number(req.body?.priceInr ?? 0);
    const sparesRaw = Array.isArray(req.body?.spares) ? req.body.spares : [];
    if (!brand) {
      res.status(400).json({ error: "Brand is required." });
      return;
    }
    if (serviceType !== "quartz" && serviceType !== "mechanical") {
      res.status(400).json({ error: "Service type must be Quartz or Mechanical." });
      return;
    }
    if (!packageType) {
      res.status(400).json({ error: "Package type is required (Complete, Partial, …)." });
      return;
    }
    if (!Number.isFinite(priceInr) || priceInr < 0) {
      res.status(400).json({ error: "Enter a valid package price." });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const ins = await client.query<{ id: string }>(
        `INSERT INTO service_packages (brand, service_type, package_type, price_inr)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [brand, serviceType, packageType, priceInr],
      );
      const id = ins.rows[0]?.id;
      if (!id) throw new Error("insert failed");
      await replacePackageSpares(
        client,
        id,
        sparesRaw.map((s: { spareId?: string; qty?: number }) => ({
          spareId: String(s?.spareId ?? ""),
          qty: Number(s?.qty ?? 1),
        })),
      );
      await client.query("COMMIT");
      const [created] = await loadServicePackages({ includeInactive: true, brand });
      const match = created.find((p) => p.id === id) ?? (await loadServicePackages({ includeInactive: true })).find((p) => p.id === id);
      res.json({ package: match });
    } catch (e: unknown) {
      await client.query("ROLLBACK").catch(() => {});
      const msg = e instanceof Error ? e.message : "";
      if (/unique|duplicate/i.test(msg)) {
        res.status(400).json({ error: "A package already exists for this brand, service type, and package type." });
        return;
      }
      console.error(e);
      res.status(400).json({ error: "Could not save service package." });
    } finally {
      client.release();
    }
  });

  app.patch("/api/catalog/service-packages/:packageId", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || !isHoAdminRole(actor.role)) {
      res.status(403).json({ error: "Only HO admins can manage service packages." });
      return;
    }
    const packageId = String(req.params.packageId ?? "").trim();
    if (!packageId) {
      res.status(400).json({ error: "packageId is required." });
      return;
    }
    const brand = req.body?.brand != null ? String(req.body.brand).trim() : undefined;
    const serviceType =
      req.body?.serviceType != null ? String(req.body.serviceType).trim().toLowerCase() : undefined;
    const packageType =
      req.body?.packageType != null
        ? String(req.body.packageType)
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "_")
            .replace(/[^a-z0-9_]/g, "")
            .slice(0, 40)
        : undefined;
    const priceRaw = req.body?.priceInr;
    const priceInr = priceRaw != null && priceRaw !== "" ? Number(priceRaw) : undefined;
    const isActive = typeof req.body?.isActive === "boolean" ? req.body.isActive : undefined;
    const sparesRaw = Array.isArray(req.body?.spares) ? req.body.spares : undefined;
    if (serviceType != null && serviceType !== "quartz" && serviceType !== "mechanical") {
      res.status(400).json({ error: "Service type must be Quartz or Mechanical." });
      return;
    }
    if (priceInr != null && (!Number.isFinite(priceInr) || priceInr < 0)) {
      res.status(400).json({ error: "Enter a valid package price." });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const sets: string[] = ["updated_at = now()"];
      const params: unknown[] = [];
      let i = 1;
      if (brand) {
        sets.push(`brand = $${i++}`);
        params.push(brand);
      }
      if (serviceType) {
        sets.push(`service_type = $${i++}`);
        params.push(serviceType);
      }
      if (packageType) {
        sets.push(`package_type = $${i++}`);
        params.push(packageType);
      }
      if (priceInr != null) {
        sets.push(`price_inr = $${i++}`);
        params.push(priceInr);
      }
      if (isActive != null) {
        sets.push(`is_active = $${i++}`);
        params.push(isActive);
      }
      params.push(packageId);
      const upd = await client.query(
        `UPDATE service_packages SET ${sets.join(", ")} WHERE id = $${i}::uuid`,
        params,
      );
      if ((upd.rowCount ?? 0) === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Package not found." });
        return;
      }
      if (sparesRaw) {
        await replacePackageSpares(
          client,
          packageId,
          sparesRaw.map((s: { spareId?: string; qty?: number }) => ({
            spareId: String(s?.spareId ?? ""),
            qty: Number(s?.qty ?? 1),
          })),
        );
      }
      await client.query("COMMIT");
      const all = await loadServicePackages({ includeInactive: true });
      res.json({ package: all.find((p) => p.id === packageId) ?? null });
    } catch (e: unknown) {
      await client.query("ROLLBACK").catch(() => {});
      const msg = e instanceof Error ? e.message : "";
      if (/unique|duplicate/i.test(msg)) {
        res.status(400).json({ error: "A package already exists for this brand, service type, and package type." });
        return;
      }
      console.error(e);
      res.status(400).json({ error: "Could not update service package." });
    } finally {
      client.release();
    }
  });
}
