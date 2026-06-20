import type { Express, NextFunction, Request, Response } from "express";
import type { Pool } from "pg";
import {
  getMastersIndiaEdocConfig,
  testEdocConnection,
  tryGenerateEinvoiceForQuickBill,
  tryGenerateEinvoiceForSrfClose,
  tryGenerateEwayForChallanId,
} from "./mastersIndiaEdoc";
import { toPublicEdocSettings, refreshEdocSettingsCache } from "./edocSettingsStore";

type Authed = Request & { userId: string };

export function registerEdocRoutes(
  app: Express,
  pool: Pool,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
): void {
  app.get("/api/edoc/status", requireAuth, (_req, res) => {
    const publicSettings = toPublicEdocSettings();
    res.json({
      configured: publicSettings.configured,
      enabled: publicSettings.enabled,
      failOpen: publicSettings.failOpen,
      apiBase: publicSettings.apiBase,
      ewayApiBase: publicSettings.ewayApiBase,
      sellerGstinOverride: publicSettings.sellerGstinOverride || null,
      ewayUserGstin: publicSettings.ewayUserGstin || null,
      envFallbackActive: publicSettings.envFallbackActive,
    });
  });

  app.post("/api/edoc/test-token", requireAuth, async (_req, res) => {
    await refreshEdocSettingsCache();
    const cfg = getMastersIndiaEdocConfig();
    if (!cfg) {
      res.status(400).json({ error: "Set Masters India e-doc username and password in Settings → E-invoice & e-way." });
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

  app.post("/api/edoc/delivery-challans/:dcId/generate-eway", requireAuth, async (req, res) => {
    const dcId = String(req.params.dcId ?? "").trim();
    if (!dcId) {
      res.status(400).json({ error: "dcId required" });
      return;
    }
    const result = await tryGenerateEwayForChallanId(pool, dcId);
    res.status(result.ok ? 200 : result.skipped ? 200 : 400).json({ edoc: result });
  });
}
