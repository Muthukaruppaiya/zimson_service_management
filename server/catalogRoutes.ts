import type { Express, NextFunction, Request, Response } from "express";
import type { Pool } from "pg";
import type { CreateSpareInput, SparePart } from "../src/types/spare";
import type { DemoUser } from "../src/types/user";

type Authed = Request & { userId: string };

function rowToSpare(r: {
  id: string;
  sku: string;
  name: string;
  description: string;
  category: string;
  hsn: string | null;
  is_active: boolean;
  created_at: Date | string;
}): SparePart {
  const createdAt =
    r.created_at instanceof Date ? r.created_at.toISOString() : new Date(r.created_at).toISOString();
  return {
    id: r.id,
    sku: r.sku,
    name: r.name,
    description: r.description,
    category: r.category,
    hsn: r.hsn,
    isActive: r.is_active,
    createdAt,
  };
}

export function registerCatalogRoutes(
  app: Express,
  pool: Pool,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
  getUserById: (id: string) => DemoUser | null,
): void {
  app.get("/api/spares", requireAuth, async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, sku, name, description, category, hsn, is_active, created_at
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
    if (!actor || (actor.role !== "super_admin" && actor.role !== "regional_admin")) {
      res.status(403).json({ error: "Only admin users can create spare master rows." });
      return;
    }

    const input = req.body as CreateSpareInput;
    const sku = input.sku.trim().toUpperCase();
    const name = input.name.trim();
    const description = input.description.trim();
    const category = input.category.trim();
    const isActive = input.isActive ?? true;
    if (!sku || !name || !description || !category) {
      res.status(400).json({ error: "sku, name, description and category are required." });
      return;
    }
    try {
      const ins = await pool.query(
        `INSERT INTO spares (sku, name, description, category, hsn, is_active)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, sku, name, description, category, hsn, is_active, created_at`,
        [sku, name, description, category, input.hsn?.trim() || null, isActive],
      );
      const row = ins.rows[0] as Parameters<typeof rowToSpare>[0];
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

  app.get("/api/catalog/spares/:spareId/prices", requireAuth, async (req, res) => {
    const spareId = req.params.spareId;
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    const requestedRegion = String(req.query.regionId ?? "").trim();
    let regionId: string | null = null;
    if (actor.role === "super_admin") {
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
    if (!actor || (actor.role !== "super_admin" && actor.role !== "regional_admin")) {
      res.status(403).json({ error: "Only admin users can save prices." });
      return;
    }

    const brand = String(req.body?.brand ?? "").trim();
    const price = Number(req.body?.price);
    const requestedRegion = String(req.body?.regionId ?? "").trim();
    const regionId = actor.role === "super_admin" ? requestedRegion || null : actor.regionId;
    if (!brand || Number.isNaN(price) || price < 0) {
      res.status(400).json({ error: "brand and non-negative price are required." });
      return;
    }
    if (actor.role === "super_admin" && !regionId) {
      res.status(400).json({ error: "regionId is required for region price." });
      return;
    }
    if (!regionId) {
      res.status(400).json({ error: "Actor region is required for pricing." });
      return;
    }
    try {
      await pool.query(
        `INSERT INTO spare_prices (spare_id, region_id, brand, price)
         VALUES ($1::uuid, $2::text, $3, $4)
         ON CONFLICT (spare_id, brand, region_id)
         DO UPDATE SET price = EXCLUDED.price, updated_at = now()`,
        [spareId, regionId, brand, price],
      );
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Could not save price line." });
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
      if (actor.role === "regional_admin") {
        params.push(actor.regionId);
        whereExtra = " AND region_id = $2::text";
      } else if (actor.role === "store_user") {
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
    const spareId = req.params.spareId;
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }

    const locationType = String(req.body?.locationType ?? "").toUpperCase();
    const regionId = String(req.body?.regionId ?? "").trim();
    const storeIdRaw = req.body?.storeId;
    const storeId = storeIdRaw == null || storeIdRaw === "" ? null : String(storeIdRaw);
    const quantity = Number(req.body?.quantity);

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
    } else if (actor.role === "regional_admin") {
      if (actor.regionId !== regionId) {
        res.status(403).json({ error: "Regional admin can update only own region stock." });
        return;
      }
    } else if (actor.role !== "super_admin") {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    const locationKey = locationType === "HO" ? `HO:${regionId}` : `STORE:${regionId}:${storeId}`;
    try {
      await pool.query(
        `INSERT INTO spare_stock (spare_id, location_key, location_type, region_id, store_id, quantity)
         VALUES ($1::uuid, $2, $3, $4, $5, $6)
         ON CONFLICT (spare_id, location_key)
         DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now()`,
        [spareId, locationKey, locationType, regionId, storeId, quantity],
      );
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Could not save stock row." });
    }
  });
}
