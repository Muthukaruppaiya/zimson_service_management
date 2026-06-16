import type { Express, NextFunction, Request, Response } from "express";
import type { Pool } from "pg";
import {
  edocEnabled,
  getMastersIndiaEdocConfig,
  testEdocConnection,
  tryGenerateEinvoiceForQuickBill,
  tryGenerateEinvoiceForSrfClose,
} from "./mastersIndiaEdoc";

type Authed = Request & { userId: string };

export function registerEdocRoutes(
  app: Express,
  pool: Pool,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
): void {
  app.get("/api/edoc/status", requireAuth, (_req, res) => {
    const cfg = getMastersIndiaEdocConfig();
    res.json({
      configured: Boolean(cfg),
      enabled: edocEnabled(),
      apiBase: cfg?.apiBase ?? null,
      ewayApiBase: cfg?.ewayApiBase ?? null,
      sellerGstinOverride: cfg?.sellerGstinOverride ?? null,
      ewayUserGstin: cfg?.ewayUserGstin ?? null,
    });
  });

  app.post("/api/edoc/test-token", requireAuth, async (_req, res) => {
    const cfg = getMastersIndiaEdocConfig();
    if (!cfg) {
      res.status(400).json({ error: "Set MASTERS_INDIA_EDOC_USERNAME and MASTERS_INDIA_EDOC_PASSWORD (or MASTERS_INDIA_USERNAME/PASSWORD)." });
      return;
    }
    const result = await testEdocConnection(cfg);
    if (!result.ok) {
      res.status(400).json({ error: result.error ?? "Token test failed" });
      return;
    }
    res.json({ ok: true });
  });

  app.post("/api/edoc/quick-bills/:billId/generate-einvoice", requireAuth, async (req, res) => {
    const billId = String(req.params.billId ?? "").trim();
    if (!billId) {
      res.status(400).json({ error: "billId required" });
      return;
    }
    const result = await tryGenerateEinvoiceForQuickBill(pool, billId);
    res.status(result.ok ? 200 : 400).json({ edoc: result });
  });

  app.post("/api/edoc/srf-jobs/:srfId/generate-einvoice", requireAuth, async (req, res) => {
    const srfId = String(req.params.srfId ?? "").trim();
    if (!srfId) {
      res.status(400).json({ error: "srfId required" });
      return;
    }
    const result = await tryGenerateEinvoiceForSrfClose(pool, srfId);
    res.status(result.ok ? 200 : 400).json({ edoc: result });
  });
}
