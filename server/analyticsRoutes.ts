import type { Express, Request, Response } from "express";
import type { Pool } from "pg";
import type { DemoUser } from "../src/types/user";
import { canAccessAnalytics, fetchAnalyticsDashboard, parseAnalyticsQuery } from "./analyticsDashboard";
import { syncInvoicesFromLegacySources } from "./serviceInvoiceLedger";

type Authed = Request & { userId: string };

export function registerAnalyticsRoutes(
  app: Express,
  pool: Pool,
  requireAuth: (req: Request, res: Response, next: () => void) => void,
  getUserById: (id: string) => DemoUser | null,
): void {
  app.get("/api/analytics/dashboard", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || !canAccessAnalytics(actor)) {
      res.status(403).json({ error: "Analytics dashboard is restricted to admin, super admin, and HO manager." });
      return;
    }
    try {
      try {
        await syncInvoicesFromLegacySources(pool);
      } catch (e) {
        console.warn("[analytics] invoice sync skipped:", e);
      }
      const filters = parseAnalyticsQuery(req.query as Record<string, unknown>);
      const data = await fetchAnalyticsDashboard(pool, actor, filters);
      res.json(data);
    } catch (e) {
      console.error("[analytics] dashboard error:", e);
      res.status(500).json({ error: e instanceof Error ? e.message : "Could not load analytics." });
    }
  });
}
