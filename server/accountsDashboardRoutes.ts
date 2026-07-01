import type { Express, Request, Response } from "express";
import type { Pool } from "pg";
import type { DemoUser } from "../src/types/user";
import {
  canAccessAccountsServiceDashboard,
  canAccessBrandCreditHistory,
  fetchAccountsServiceDashboard,
  fetchBrandCreditHistory,
  parseAccountsServiceDashboardQuery,
} from "./accountsServiceDashboard";

type Authed = Request & { userId: string };

export function registerAccountsDashboardRoutes(
  app: Express,
  pool: Pool,
  requireAuth: (req: Request, res: Response, next: () => void) => void,
  getUserById: (id: string) => DemoUser | null,
): void {
  app.get("/api/accounts/service-dashboard", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || !canAccessAccountsServiceDashboard(actor)) {
      res.status(403).json({ error: "Service outcomes dashboard is restricted to analytics roles." });
      return;
    }
    try {
      const filters = parseAccountsServiceDashboardQuery(req.query as Record<string, unknown>);
      const data = await fetchAccountsServiceDashboard(pool, actor, filters);
      res.json(data);
    } catch (e) {
      console.error("[accounts] service dashboard error:", e);
      res.status(500).json({ error: e instanceof Error ? e.message : "Could not load service dashboard." });
    }
  });

  app.get("/api/accounts/brand-credit-history", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || !canAccessBrandCreditHistory(actor)) {
      res.status(403).json({ error: "Brand credit note history is restricted." });
      return;
    }
    try {
      const filters = parseAccountsServiceDashboardQuery(req.query as Record<string, unknown>);
      const q = String(req.query.q ?? "").trim();
      const data = await fetchBrandCreditHistory(pool, actor, filters, q || undefined);
      res.json(data);
    } catch (e) {
      console.error("[accounts] brand credit history error:", e);
      res.status(500).json({ error: e instanceof Error ? e.message : "Could not load brand credit history." });
    }
  });
}
