import type express from "express";
import type { Pool } from "pg";
import type { DemoUser } from "../src/types/user";

type RequireAuth = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) => void | Promise<void>;

function canManageTechnicianMaster(actor: DemoUser | null): boolean {
  if (!actor) return false;
  return [
    "super_admin",
    "regional_admin",
    "ho_admin",
    "ho_manager",
    "service_centre_supervisor",
    "service_centre_clerk",
  ].includes(actor.role);
}

export function registerTechnicianRoutes(
  app: express.Express,
  pool: Pool,
  requireAuth: RequireAuth,
  getUserById: (id: string) => DemoUser | null,
) {
  app.get("/api/service/technicians", requireAuth, async (req, res) => {
    const actor = getUserById((req as { userId?: string }).userId ?? "");
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    const activeOnly = String(req.query.activeOnly ?? "1").trim() !== "0";
    const regionId = String(req.query.regionId ?? "").trim();
    const params: unknown[] = [];
    const where: string[] = [];
    let i = 1;
    if (activeOnly) where.push(`t.is_active = true`);
    if (regionId) {
      where.push(`t.region_id = $${i++}::text`);
      params.push(regionId);
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    try {
      const { rows } = await pool.query(
        `SELECT t.id,
                t.employee_code AS "employeeCode",
                t.full_name AS "fullName",
                t.email,
                t.phone,
                t.grade,
                t.region_id AS "regionId",
                r.name AS "regionName",
                t.specialization,
                t.experience_years::float8 AS "experienceYears",
                t.notes,
                t.is_active AS "isActive",
                t.created_at AS "createdAt",
                t.updated_at AS "updatedAt"
         FROM technician_profiles t
         LEFT JOIN regions r ON r.id = t.region_id
         ${whereSql}
         ORDER BY t.full_name ASC`,
        params,
      );
      res.json({ rows });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Could not load technicians." });
    }
  });

  app.post("/api/service/technicians", requireAuth, async (req, res) => {
    const actor = getUserById((req as { userId?: string }).userId ?? "");
    if (!canManageTechnicianMaster(actor)) {
      res.status(403).json({ error: "Only authorized HO/SC roles can create technicians." });
      return;
    }
    const employeeCode = String(req.body?.employeeCode ?? "").trim().toUpperCase();
    const fullName = String(req.body?.fullName ?? "").trim();
    const email = String(req.body?.email ?? "").trim() || null;
    const phone = String(req.body?.phone ?? "").trim() || null;
    const grade = String(req.body?.grade ?? "").trim();
    const regionId = String(req.body?.regionId ?? "").trim() || null;
    const specialization = String(req.body?.specialization ?? "").trim();
    const experienceYears = Number(req.body?.experienceYears ?? 0);
    const notes = String(req.body?.notes ?? "").trim();
    if (!employeeCode || !fullName || !grade) {
      res.status(400).json({ error: "employeeCode, fullName and grade are required." });
      return;
    }
    try {
      const out = await pool.query<{ id: string }>(
        `INSERT INTO technician_profiles
           (employee_code, full_name, email, phone, grade, region_id, specialization, experience_years, notes, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
         RETURNING id`,
        [employeeCode, fullName, email, phone, grade, regionId, specialization, Number.isFinite(experienceYears) ? experienceYears : 0, notes],
      );
      res.json({ ok: true, id: out.rows[0]?.id ?? null });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Could not create technician profile. Employee code might already exist." });
    }
  });
}
