import type { Express, NextFunction, Request, Response } from "express";
import type { Pool } from "pg";
import type { BrandRow } from "../src/types/brand";
import type { CreateSpareInput, SparePart } from "../src/types/spare";
import type { DemoUser } from "../src/types/user";
import { appendStockHistory } from "./db/stockHistory";
import { clearSpareGstCache } from "./hsnGstRates";

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
  name: string;
  description: string;
  category: string;
  hsn: string | null;
  gst_percent: number | string | null;
  mrp_inr: number | null;
  cost_price_inr: number | null;
  selling_price_inr: number | null;
  is_active: boolean;
  created_at: Date | string;
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
    name: r.name,
    description: r.description,
    category: r.category,
    hsn: r.hsn,
    gstPercent,
    costPriceInr: r.cost_price_inr == null ? null : Number(r.cost_price_inr),
    sellingPriceInr: r.selling_price_inr == null ? (r.mrp_inr == null ? null : Number(r.mrp_inr)) : Number(r.selling_price_inr),
    mrpInr: r.mrp_inr == null ? null : Number(r.mrp_inr),
    isActive: r.is_active,
    createdAt,
  };
}

const SPARE_SELECT = `id, sku, name, description, category, hsn, gst_percent, mrp_inr, cost_price_inr, selling_price_inr, is_active, created_at`;

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

  app.post("/api/spares", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || (actor.role !== "super_admin" && actor.role !== "admin" && actor.role !== "admin")) {
      res.status(403).json({ error: "Only admin users can create spare master rows." });
      return;
    }

    const input = req.body as CreateSpareInput;
    const sku = input.sku.trim().toUpperCase();
    const name = input.name.trim();
    const description = input.description.trim();
    const category = input.category.trim();
    const isActive = input.isActive ?? true;
    const gstPercent = input.gstPercent;
    if (gstPercent != null && (Number.isNaN(gstPercent) || gstPercent < 0 || gstPercent > 100)) {
      res.status(400).json({ error: "gstPercent must be between 0 and 100." });
      return;
    }
    if (!sku || !name || !description || !category) {
      res.status(400).json({ error: "sku, name, description and category are required." });
      return;
    }
    try {
      const ins = await pool.query(
        `INSERT INTO spares (sku, name, description, category, hsn, gst_percent, mrp_inr, cost_price_inr, selling_price_inr, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING ${SPARE_SELECT}`,
        [
          sku,
          name,
          description,
          category,
          input.hsn?.trim() || null,
          gstPercent ?? null,
          input.sellingPriceInr ?? input.mrpInr ?? null,
          input.costPriceInr ?? null,
          input.sellingPriceInr ?? input.mrpInr ?? null,
          isActive,
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
        res.status(400).json({ error: "A spare with this SKU already exists." });
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
    const hsn = req.body?.hsn != null ? String(req.body.hsn).trim() || null : undefined;
    const gstPercentRaw = req.body?.gstPercent;
    const gstPercent =
      gstPercentRaw === undefined || gstPercentRaw === null || gstPercentRaw === ""
        ? undefined
        : Number(gstPercentRaw);
    if (gstPercent !== undefined && (Number.isNaN(gstPercent) || gstPercent < 0 || gstPercent > 100)) {
      res.status(400).json({ error: "gstPercent must be between 0 and 100." });
      return;
    }
    if (hsn === undefined && gstPercent === undefined) {
      res.status(400).json({ error: "Nothing to update." });
      return;
    }
    try {
      const sets: string[] = ["updated_at = now()"];
      const vals: unknown[] = [];
      let i = 1;
      if (hsn !== undefined) {
        sets.push(`hsn = $${i++}`);
        vals.push(hsn);
      }
      if (gstPercent !== undefined) {
        sets.push(`gst_percent = $${i++}`);
        vals.push(gstPercent);
      }
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
    } catch {
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
      await pool.query(
        `INSERT INTO spare_prices (spare_id, region_id, brand, price)
         VALUES ($1::uuid, $2::text, $3, $4)
         ON CONFLICT (spare_id, brand, region_id)
         DO UPDATE SET price = EXCLUDED.price, updated_at = now()`,
        [spareId, regionId, brandCanonical, price],
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
}
