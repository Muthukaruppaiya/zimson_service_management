import type { Express, NextFunction, Request, Response } from "express";
import type { Pool } from "pg";
import type { DemoUser } from "../src/types/user";

type Authed = Request & { userId: string };

function isHoAdminRole(role: string): boolean {
  return role === "super_admin" || role === "admin";
}

function canAddHsnCode(actor: DemoUser | null): boolean {
  return !!actor && (isHoAdminRole(actor.role) || actor.role === "service_centre_supervisor");
}

function normalizeHsnCode(raw: string): string {
  return raw.trim().replace(/\D/g, "").slice(0, 16);
}

function rowToHsn(r: {
  id: string;
  code: string;
  description: string;
  gst_percent: number | string | null;
  sort_order: number;
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}) {
  const iso = (d: Date | string) => (d instanceof Date ? d.toISOString() : new Date(d).toISOString());
  const gstRaw = r.gst_percent;
  const gstPercent =
    gstRaw == null || gstRaw === ""
      ? null
      : Number.isFinite(Number(gstRaw))
        ? Number(gstRaw)
        : null;
  return {
    id: r.id,
    code: r.code,
    description: r.description,
    gstPercent,
    sortOrder: r.sort_order,
    isActive: r.is_active,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

export function registerHsnMasterRoutes(
  app: Express,
  pool: Pool,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
  getUserById: (id: string) => DemoUser | null,
): void {
  app.get("/api/hsn-master", requireAuth, async (req, res) => {
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
        `SELECT id, code, description, gst_percent, sort_order, is_active, created_at, updated_at
         FROM hsn_master
         ${where}
         ORDER BY sort_order, code`,
      );
      res.json({ rows: rows.map((r) => rowToHsn(r as Parameters<typeof rowToHsn>[0])) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not load HSN master." });
    }
  });

  app.post("/api/hsn-master", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!canAddHsnCode(actor)) {
      res.status(403).json({ error: "Only supervisors and HO admins can add HSN codes." });
      return;
    }
    const code = normalizeHsnCode(String(req.body?.code ?? ""));
    const description = String(req.body?.description ?? "").trim();
    if (!code || code.length < 4) {
      res.status(400).json({ error: "Valid HSN code is required (at least 4 digits)." });
      return;
    }
    const sortOrderRaw = req.body?.sortOrder;
    const sortOrder =
      sortOrderRaw === undefined || sortOrderRaw === null || sortOrderRaw === ""
        ? 0
        : Number(sortOrderRaw);
    if (Number.isNaN(sortOrder)) {
      res.status(400).json({ error: "sortOrder must be a number." });
      return;
    }
    const gstRaw = req.body?.gstPercent;
    const gstPercent =
      gstRaw === undefined || gstRaw === null || gstRaw === ""
        ? null
        : Number(gstRaw);
    if (gstPercent != null && (Number.isNaN(gstPercent) || gstPercent < 0 || gstPercent > 100)) {
      res.status(400).json({ error: "gstPercent must be between 0 and 100." });
      return;
    }
    try {
      const ins = await pool.query(
        `INSERT INTO hsn_master (code, description, gst_percent, sort_order)
         VALUES ($1, $2, $3, $4)
         RETURNING id, code, description, gst_percent, sort_order, is_active, created_at, updated_at`,
        [code, description || code, gstPercent, sortOrder],
      );
      res.json({ row: rowToHsn(ins.rows[0] as Parameters<typeof rowToHsn>[0]) });
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === "23505") {
        res.status(400).json({ error: "This HSN code already exists." });
        return;
      }
      console.error(e);
      res.status(400).json({ error: "Could not add HSN code." });
    }
  });

  app.patch("/api/hsn-master/:hsnId", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || !isHoAdminRole(actor.role)) {
      res.status(403).json({ error: "Only HO admins can manage HSN master." });
      return;
    }
    const hsnId = String(req.params.hsnId ?? "").trim();
    const description =
      req.body?.description !== undefined ? String(req.body.description ?? "").trim() : undefined;
    const sortOrderRaw = req.body?.sortOrder;
    const sortOrder =
      sortOrderRaw === undefined || sortOrderRaw === null || sortOrderRaw === ""
        ? undefined
        : Number(sortOrderRaw);
    if (sortOrder !== undefined && Number.isNaN(sortOrder)) {
      res.status(400).json({ error: "sortOrder must be a number." });
      return;
    }
    const gstRaw = req.body?.gstPercent;
    const gstPercent =
      gstRaw === undefined
        ? undefined
        : gstRaw === null || gstRaw === ""
          ? null
          : Number(gstRaw);
    if (gstPercent != null && gstPercent !== undefined && (Number.isNaN(gstPercent) || gstPercent < 0 || gstPercent > 100)) {
      res.status(400).json({ error: "gstPercent must be between 0 and 100." });
      return;
    }
    const isActive = req.body?.isActive;
    try {
      const upd = await pool.query(
        `UPDATE hsn_master
         SET description = COALESCE($2, description),
             sort_order = COALESCE($3, sort_order),
             gst_percent = CASE WHEN $4::text IS NULL THEN gst_percent ELSE $4::numeric END,
             is_active = COALESCE($5, is_active),
             updated_at = now()
         WHERE id = $1::uuid
         RETURNING id, code, description, gst_percent, sort_order, is_active, created_at, updated_at`,
        [
          hsnId,
          description,
          sortOrder,
          gstPercent === undefined ? null : gstPercent,
          typeof isActive === "boolean" ? isActive : null,
        ],
      );
      if (!upd.rows[0]) {
        res.status(404).json({ error: "HSN row not found." });
        return;
      }
      res.json({ row: rowToHsn(upd.rows[0] as Parameters<typeof rowToHsn>[0]) });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Could not update HSN row." });
    }
  });
}
