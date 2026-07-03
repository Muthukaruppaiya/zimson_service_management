import type { Express, NextFunction, Request, Response } from "express";
import type { Pool } from "pg";
import type { DemoUser } from "../src/types/user";
import type { BrandEwayConsignee } from "../src/types/brandEwayConsignee";
import { isValidGstin } from "./mastersIndiaEdoc/types";

type Authed = Request & { userId: string };

function isHoAdminRole(role: string): boolean {
  return role === "super_admin" || role === "admin";
}

function rowToConsignee(r: {
  id: string;
  brand_id: string;
  brand_name: string;
  location_name: string;
  legal_name: string;
  gstin: string;
  address: string;
  city: string;
  pincode: string;
  sort_order: number;
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}): BrandEwayConsignee {
  return {
    id: r.id,
    brandId: r.brand_id,
    brandName: r.brand_name,
    locationName: r.location_name,
    legalName: r.legal_name,
    gstin: r.gstin,
    address: r.address,
    city: r.city,
    pincode: r.pincode,
    sortOrder: r.sort_order,
    isActive: r.is_active,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

const SELECT_JOIN = `
  SELECT c.id,
         c.brand_id,
         b.name AS brand_name,
         c.location_name,
         c.legal_name,
         c.gstin,
         c.address,
         c.city,
         c.pincode,
         c.sort_order,
         c.is_active,
         c.created_at,
         c.updated_at
  FROM brand_eway_consignees c
  JOIN brands b ON b.id = c.brand_id
`;

export async function loadBrandEwayConsigneeOptions(
  pool: Pool,
  watchBrand: string,
): Promise<BrandEwayConsignee[]> {
  const brand = String(watchBrand ?? "").trim();
  const params: unknown[] = [];
  let where = "WHERE c.is_active = true AND b.is_active = true";
  if (brand) {
    params.push(brand);
    where += ` AND LOWER(TRIM(b.name)) = LOWER(TRIM($${params.length}))`;
  }
  const { rows } = await pool.query(
    `${SELECT_JOIN}
     ${where}
     ORDER BY b.sort_order, b.name, c.sort_order, c.location_name`,
    params,
  );
  if (rows.length > 0 || !brand) {
    return rows.map((r) => rowToConsignee(r as Parameters<typeof rowToConsignee>[0]));
  }
  const fallback = await pool.query(
    `${SELECT_JOIN}
     WHERE c.is_active = true AND b.is_active = true
     ORDER BY b.sort_order, b.name, c.sort_order, c.location_name`,
  );
  return fallback.rows.map((r) => rowToConsignee(r as Parameters<typeof rowToConsignee>[0]));
}

export function registerBrandEwayConsigneeRoutes(
  app: Express,
  pool: Pool,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
  getUserById: (id: string) => DemoUser | null,
): void {
  app.get("/api/edoc/brand-eway-consignees", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    const watchBrand = String(req.query.watchBrand ?? "").trim();
    const allQ = String(req.query.all ?? "").trim() === "1";
    try {
      if (allQ && isHoAdminRole(actor.role)) {
        const { rows } = await pool.query(
          `${SELECT_JOIN}
           ORDER BY b.sort_order, b.name, c.sort_order, c.location_name`,
        );
        res.json({ rows: rows.map((r) => rowToConsignee(r as Parameters<typeof rowToConsignee>[0])) });
        return;
      }
      const rows = await loadBrandEwayConsigneeOptions(pool, watchBrand);
      res.json({ rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not load brand e-way consignees." });
    }
  });

  app.post("/api/edoc/brand-eway-consignees", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || !isHoAdminRole(actor.role)) {
      res.status(403).json({ error: "Only HO admins can manage brand e-way consignees." });
      return;
    }
    const brandId = String(req.body?.brandId ?? "").trim();
    const locationName = String(req.body?.locationName ?? "").trim();
    const legalName = String(req.body?.legalName ?? "").trim();
    const gstin = String(req.body?.gstin ?? "").trim().toUpperCase();
    const address = String(req.body?.address ?? "").trim();
    const city = String(req.body?.city ?? "").trim();
    const pincode = String(req.body?.pincode ?? "").trim().replace(/\D/g, "").slice(0, 6);
    const sortOrderRaw = req.body?.sortOrder;
    const sortOrder =
      sortOrderRaw === undefined || sortOrderRaw === null || sortOrderRaw === ""
        ? 0
        : Number(sortOrderRaw);

    if (!brandId) {
      res.status(400).json({ error: "Brand is required." });
      return;
    }
    if (!locationName) {
      res.status(400).json({ error: "Location name is required." });
      return;
    }
    if (!legalName) {
      res.status(400).json({ error: "Legal name is required." });
      return;
    }
    if (!isValidGstin(gstin)) {
      res.status(400).json({ error: "Valid 15-character consignee GSTIN is required." });
      return;
    }
    if (!address) {
      res.status(400).json({ error: "Address is required." });
      return;
    }
    if (!city) {
      res.status(400).json({ error: "City / place is required." });
      return;
    }
    if (!/^\d{6}$/.test(pincode)) {
      res.status(400).json({ error: "Valid 6-digit pincode is required." });
      return;
    }
    if (Number.isNaN(sortOrder)) {
      res.status(400).json({ error: "sortOrder must be a number." });
      return;
    }

    try {
      const brandCheck = await pool.query(`SELECT id FROM brands WHERE id = $1::uuid`, [brandId]);
      if (!brandCheck.rowCount) {
        res.status(400).json({ error: "Brand not found." });
        return;
      }
      const ins = await pool.query(
        `INSERT INTO brand_eway_consignees
           (brand_id, location_name, legal_name, gstin, address, city, pincode, sort_order)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, brand_id, location_name, legal_name, gstin, address, city, pincode, sort_order, is_active, created_at, updated_at`,
        [brandId, locationName, legalName, gstin, address, city, pincode, sortOrder],
      );
      const row = ins.rows[0] as {
        id: string;
        brand_id: string;
        location_name: string;
        legal_name: string;
        gstin: string;
        address: string;
        city: string;
        pincode: string;
        sort_order: number;
        is_active: boolean;
        created_at: Date;
        updated_at: Date;
      };
      const { rows: brandRows } = await pool.query<{ name: string }>(`SELECT name FROM brands WHERE id = $1::uuid`, [
        brandId,
      ]);
      res.json({
        row: rowToConsignee({
          ...row,
          brand_name: brandRows[0]?.name ?? "",
        }),
      });
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === "23505") {
        res.status(400).json({ error: "This brand and location combination already exists." });
        return;
      }
      console.error(e);
      res.status(500).json({ error: "Could not save brand e-way consignee." });
    }
  });

  app.patch("/api/edoc/brand-eway-consignees/:id", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || !isHoAdminRole(actor.role)) {
      res.status(403).json({ error: "Only HO admins can manage brand e-way consignees." });
      return;
    }
    const id = String(req.params.id ?? "").trim();
    if (!id) {
      res.status(400).json({ error: "id required." });
      return;
    }

    const updates: string[] = [];
    const params: unknown[] = [];

    if (req.body?.brandId !== undefined) {
      const brandId = String(req.body.brandId).trim();
      if (!brandId) {
        res.status(400).json({ error: "brandId cannot be empty." });
        return;
      }
      params.push(brandId);
      updates.push(`brand_id = $${params.length}::uuid`);
    }
    if (req.body?.locationName !== undefined) {
      const v = String(req.body.locationName).trim();
      if (!v) {
        res.status(400).json({ error: "locationName cannot be empty." });
        return;
      }
      params.push(v);
      updates.push(`location_name = $${params.length}`);
    }
    if (req.body?.legalName !== undefined) {
      const v = String(req.body.legalName).trim();
      if (!v) {
        res.status(400).json({ error: "legalName cannot be empty." });
        return;
      }
      params.push(v);
      updates.push(`legal_name = $${params.length}`);
    }
    if (req.body?.gstin !== undefined) {
      const v = String(req.body.gstin).trim().toUpperCase();
      if (!isValidGstin(v)) {
        res.status(400).json({ error: "Valid GSTIN is required." });
        return;
      }
      params.push(v);
      updates.push(`gstin = $${params.length}`);
    }
    if (req.body?.address !== undefined) {
      const v = String(req.body.address).trim();
      if (!v) {
        res.status(400).json({ error: "address cannot be empty." });
        return;
      }
      params.push(v);
      updates.push(`address = $${params.length}`);
    }
    if (req.body?.city !== undefined) {
      const v = String(req.body.city).trim();
      if (!v) {
        res.status(400).json({ error: "city cannot be empty." });
        return;
      }
      params.push(v);
      updates.push(`city = $${params.length}`);
    }
    if (req.body?.pincode !== undefined) {
      const v = String(req.body.pincode).trim().replace(/\D/g, "").slice(0, 6);
      if (!/^\d{6}$/.test(v)) {
        res.status(400).json({ error: "Valid pincode is required." });
        return;
      }
      params.push(v);
      updates.push(`pincode = $${params.length}`);
    }
    if (req.body?.sortOrder !== undefined) {
      const so = Number(req.body.sortOrder);
      if (Number.isNaN(so)) {
        res.status(400).json({ error: "sortOrder must be a number." });
        return;
      }
      params.push(so);
      updates.push(`sort_order = $${params.length}`);
    }
    if (req.body?.isActive !== undefined) {
      params.push(Boolean(req.body.isActive));
      updates.push(`is_active = $${params.length}`);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: "No fields to update." });
      return;
    }

    params.push(id);
    try {
      const { rows } = await pool.query(
        `UPDATE brand_eway_consignees
         SET ${updates.join(", ")}, updated_at = now()
         WHERE id = $${params.length}::uuid
         RETURNING id`,
        params,
      );
      if (!rows[0]) {
        res.status(404).json({ error: "Consignee not found." });
        return;
      }
      const full = await pool.query(`${SELECT_JOIN} WHERE c.id = $1::uuid`, [id]);
      const row = full.rows[0];
      if (!row) {
        res.status(404).json({ error: "Consignee not found." });
        return;
      }
      res.json({ row: rowToConsignee(row as Parameters<typeof rowToConsignee>[0]) });
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === "23505") {
        res.status(400).json({ error: "This brand and location combination already exists." });
        return;
      }
      console.error(e);
      res.status(500).json({ error: "Could not update brand e-way consignee." });
    }
  });
}
