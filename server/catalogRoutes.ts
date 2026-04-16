import type { Express, NextFunction, Request, Response } from "express";
import type { Pool } from "pg";
import type { CreateSpareInput, SparePart } from "../src/types/spare";

type Authed = Request & { userId: string };

function rowToSpare(r: {
  id: string;
  sku: string;
  name: string;
  category: string;
  uom: string;
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
    category: r.category,
    uom: r.uom,
    hsn: r.hsn,
    isActive: r.is_active,
    createdAt,
  };
}

export function registerCatalogRoutes(
  app: Express,
  pool: Pool,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
): void {
  app.get("/api/spares", requireAuth, async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, sku, name, category, uom, hsn, is_active, created_at
         FROM spares ORDER BY sku`,
      );
      res.json({ spares: rows.map((r) => rowToSpare(r as Parameters<typeof rowToSpare>[0])) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to load spares." });
    }
  });

  app.post("/api/spares", requireAuth, async (req, res) => {
    const input = req.body as CreateSpareInput;
    const sku = input.sku.trim().toUpperCase();
    const name = input.name.trim();
    const category = input.category.trim();
    const uom = input.uom.trim() || "PCS";
    if (!sku || !name || !category) {
      res.status(400).json({ error: "SKU, description, and category are required." });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const ins = await client.query(
        `INSERT INTO spares (sku, name, category, uom, hsn, is_active)
         VALUES ($1, $2, $3, $4, $5, true)
         RETURNING id, sku, name, category, uom, hsn, is_active, created_at`,
        [sku, name, category, uom, input.hsn?.trim() || null],
      );
      const row = ins.rows[0] as Parameters<typeof rowToSpare>[0];
      const spareId = row.id;

      const { rows: gen } = await client.query<{ id: string }>(
        `SELECT id FROM brands WHERE code = 'GENERIC' LIMIT 1`,
      );
      if (gen[0]) {
        await client.query(
          `INSERT INTO spare_brand_mrp (spare_id, brand_id, mrp_inr) VALUES ($1, $2, 0)
           ON CONFLICT (spare_id, brand_id) DO NOTHING`,
          [spareId, gen[0].id],
        );
      }

      const { rows: locs } = await client.query<{ location_key: string }>(
        `SELECT DISTINCT location_key FROM spare_stock LIMIT 5000`,
      );
      if (locs.length > 0) {
        for (const { location_key } of locs) {
          await client.query(
            `INSERT INTO spare_stock (spare_id, location_key, quantity) VALUES ($1, $2, 0)
             ON CONFLICT (spare_id, location_key) DO NOTHING`,
            [spareId, location_key],
          );
        }
      }

      await client.query("COMMIT");
      res.json({ spare: rowToSpare(row) });
    } catch (e: unknown) {
      await client.query("ROLLBACK").catch(() => {});
      const err = e as { code?: string };
      if (err.code === "23505") {
        res.status(400).json({ error: "A spare with this SKU already exists." });
        return;
      }
      console.error(e);
      res.status(500).json({ error: "Could not create spare." });
    } finally {
      client.release();
    }
  });

  app.get("/api/catalog/brands", requireAuth, async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, code, name, created_at AS "createdAt" FROM brands ORDER BY code`,
      );
      res.json({ brands: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to load brands." });
    }
  });

  app.get("/api/catalog/spares/:spareId/brand-mrp", requireAuth, async (req, res) => {
    const spareId = req.params.spareId;
    try {
      const { rows } = await pool.query(
        `SELECT m.id, m.spare_id AS "spareId", m.brand_id AS "brandId", b.code AS "brandCode",
                b.name AS "brandName", m.mrp_inr::float8 AS "mrpInr", m.currency
         FROM spare_brand_mrp m
         JOIN brands b ON b.id = m.brand_id
         WHERE m.spare_id = $1::uuid
         ORDER BY b.code`,
        [spareId],
      );
      res.json({ lines: rows });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Invalid spare or failed to load MRP lines." });
    }
  });

  app.put("/api/catalog/spares/:spareId/brand-mrp", requireAuth, async (req, res) => {
    const spareId = req.params.spareId;
    const brandId = String(req.body?.brandId ?? "");
    const mrpInr = Number(req.body?.mrpInr);
    if (!brandId || Number.isNaN(mrpInr) || mrpInr < 0) {
      res.status(400).json({ error: "brandId and non-negative mrpInr required." });
      return;
    }
    try {
      await pool.query(
        `INSERT INTO spare_brand_mrp (spare_id, brand_id, mrp_inr)
         VALUES ($1::uuid, $2::uuid, $3)
         ON CONFLICT (spare_id, brand_id)
         DO UPDATE SET mrp_inr = EXCLUDED.mrp_inr, updated_at = now()`,
        [spareId, brandId, mrpInr],
      );
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Could not save MRP for this spare/brand." });
    }
  });

  app.get("/api/catalog/stock", requireAuth, async (req, res) => {
    const spareId = typeof req.query.spareId === "string" ? req.query.spareId : null;
    try {
      const { rows } = await pool.query(
        `SELECT sk.id, sk.spare_id AS "spareId", s.sku, sk.location_key AS "locationKey",
                sk.quantity::float8 AS quantity, sk.updated_at AS "updatedAt"
         FROM spare_stock sk
         JOIN spares s ON s.id = sk.spare_id
         WHERE ($1::uuid IS NULL OR sk.spare_id = $1::uuid)
         ORDER BY s.sku, sk.location_key`,
        [spareId],
      );
      res.json({ stock: rows });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Invalid spare filter or failed to load stock." });
    }
  });

  app.post("/api/catalog/stock/adjust", requireAuth, async (req, res) => {
    const spareId = String(req.body?.spareId ?? "");
    const locationKey = String(req.body?.locationKey ?? "").trim();
    const delta = Number(req.body?.delta);
    if (!spareId || !locationKey || Number.isNaN(delta)) {
      res.status(400).json({ error: "spareId, locationKey, and numeric delta required." });
      return;
    }
    const u = (req as Authed).userId;
    try {
      const r = await pool.query(
        `UPDATE spare_stock SET quantity = quantity + $3, updated_at = now()
         WHERE spare_id = $1::uuid AND location_key = $2
         RETURNING quantity::float8 AS quantity`,
        [spareId, locationKey, delta],
      );
      if (r.rowCount === 0) {
        res.status(404).json({ error: "Stock row not found for this spare and location." });
        return;
      }
      res.json({ ok: true, quantity: r.rows[0]?.quantity, adjustedBy: u });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Stock adjustment failed." });
    }
  });
}
