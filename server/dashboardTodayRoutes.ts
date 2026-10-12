import type { Express, NextFunction, Request, Response } from "express";
import type { Pool } from "pg";
import type { DemoUser } from "../src/types/user";

type Authed = Request & { userId: string };

const TODAY_IST = `(now() AT TIME ZONE 'Asia/Kolkata')::date`;
const isTodayIst = (col: string) => `(${col} AT TIME ZONE 'Asia/Kolkata')::date = ${TODAY_IST}`;

const STORE_ROLES = new Set(["store_user", "store_manager", "store_accounts"]);
const ALL_ROLES = new Set(["super_admin", "admin"]);

/** Returns a `{ store, region }` filter for the actor, or null when the actor has no scope. */
function actorScope(actor: DemoUser): { storeId: string; regionId: string } | null {
  if (ALL_ROLES.has(actor.role)) return { storeId: "", regionId: "" };
  if (STORE_ROLES.has(actor.role)) {
    const storeId = String(actor.storeId ?? "").trim();
    return storeId ? { storeId, regionId: "" } : null;
  }
  const regionId = String(actor.regionId ?? "").trim();
  return regionId ? { storeId: "", regionId } : null;
}

export function registerDashboardTodayRoutes(
  app: Express,
  pool: Pool,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
  getUserById: (id: string) => DemoUser | null,
): void {
  app.get("/api/dashboard/today-sales", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    const scope = actorScope(actor);
    if (!scope) {
      res.json({ quickBills: { count: 0, revenue: 0 }, srf: { count: 0, revenue: 0, advance: 0 } });
      return;
    }
    const params = [scope.storeId, scope.regionId];
    const scopeSql = (alias: string) =>
      `($1 = '' OR ${alias}.store_id = $1) AND ($2 = '' OR ${alias}.region_id = $2)`;
    try {
      const [qb, srf, srfInv, srfAdv] = await Promise.all([
        pool.query<{ count: string; revenue: string }>(
          `SELECT COUNT(*)::text AS count, COALESCE(SUM(q.total_inr), 0)::text AS revenue
           FROM quick_bills q
           WHERE ${isTodayIst("q.created_at")} AND ${scopeSql("q")}`,
          params,
        ),
        pool.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count
           FROM srf_jobs s
           WHERE s.status <> 'draft' AND ${isTodayIst("s.created_at")} AND ${scopeSql("s")}`,
          params,
        ),
        pool.query<{ revenue: string }>(
          `SELECT COALESCE(SUM(i.total_inr), 0)::text AS revenue
           FROM service_invoices i
           WHERE i.source_type = 'srf_store' AND ${isTodayIst("i.created_at")} AND ${scopeSql("i")}`,
          params,
        ),
        pool.query<{ advance: string }>(
          `SELECT COALESCE(SUM(p.amount_inr), 0)::text AS advance
           FROM srf_payments p
           JOIN srf_jobs s ON s.id = p.srf_id
           WHERE ${isTodayIst("p.created_at")} AND ${scopeSql("s")}`,
          params,
        ),
      ]);
      res.json({
        quickBills: {
          count: Number(qb.rows[0]?.count ?? 0),
          revenue: Number(qb.rows[0]?.revenue ?? 0),
        },
        srf: {
          count: Number(srf.rows[0]?.count ?? 0),
          revenue: Number(srfInv.rows[0]?.revenue ?? 0),
          advance: Number(srfAdv.rows[0]?.advance ?? 0),
        },
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not load today's sales." });
    }
  });
}
