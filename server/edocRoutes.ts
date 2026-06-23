import type { Express, NextFunction, Request, Response } from "express";
import type { Pool } from "pg";
import {
  getMastersIndiaEdocConfig,
  testEdocConnection,
  tryGenerateEinvoiceForQuickBill,
  tryGenerateEinvoiceForSrfClose,
  tryGenerateEwayForChallanId,
  tryGenerateEwayForBrandSend,
  tryGenerateEwayForOnlineSpareOrder,
  getEwayPrefillForChallan,
  getEwayPrefillForBrandSend,
  getEwayPrefillForOnlineSpareOrder,
  parseEwayGenerateInput,
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

  app.get("/api/edoc/delivery-challans/:dcId/eway-prefill", requireAuth, async (req, res) => {
    const dcId = String(req.params.dcId ?? "").trim();
    if (!dcId) {
      res.status(400).json({ error: "dcId required" });
      return;
    }
    const prefill = await getEwayPrefillForChallan(pool, dcId);
    if (!prefill) {
      res.status(404).json({ error: "E-way prefill not available for this challan." });
      return;
    }
    res.json({ prefill });
  });

  app.post("/api/edoc/delivery-challans/:dcId/generate-eway", requireAuth, async (req, res) => {
    const dcId = String(req.params.dcId ?? "").trim();
    if (!dcId) {
      res.status(400).json({ error: "dcId required" });
      return;
    }
    const input = parseEwayGenerateInput(req.body);
    const result = await tryGenerateEwayForChallanId(pool, dcId, input);
    res.status(result.ok ? 200 : result.skipped ? 200 : 400).json({ edoc: result });
  });

  app.get("/api/edoc/srf-jobs/:srfId/eway-prefill", requireAuth, async (req, res) => {
    const srfId = String(req.params.srfId ?? "").trim();
    if (!srfId) {
      res.status(400).json({ error: "srfId required" });
      return;
    }
    const prefill = await getEwayPrefillForBrandSend(pool, srfId);
    if (!prefill) {
      res.status(404).json({ error: "E-way prefill not available — send watch to brand first." });
      return;
    }
    res.json({ prefill });
  });

  app.post("/api/edoc/srf-jobs/:srfId/generate-eway", requireAuth, async (req, res) => {
    const srfId = String(req.params.srfId ?? "").trim();
    if (!srfId) {
      res.status(400).json({ error: "srfId required" });
      return;
    }
    const input = parseEwayGenerateInput(req.body);
    const result = await tryGenerateEwayForBrandSend(pool, srfId, input);
    res.status(result.ok ? 200 : result.skipped ? 200 : 400).json({ edoc: result });
  });

  app.get("/api/edoc/inter-ho-spare-orders/:orderId/eway-prefill", requireAuth, async (req, res) => {
    const orderId = String(req.params.orderId ?? "").trim();
    if (!orderId) {
      res.status(400).json({ error: "orderId required" });
      return;
    }
    const prefill = await getEwayPrefillForOnlineSpareOrder(pool, orderId);
    if (!prefill) {
      res.status(404).json({ error: "E-way prefill not available — complete outward dispatch first." });
      return;
    }
    res.json({ prefill });
  });

  app.post("/api/edoc/inter-ho-spare-orders/:orderId/generate-eway", requireAuth, async (req, res) => {
    const orderId = String(req.params.orderId ?? "").trim();
    if (!orderId) {
      res.status(400).json({ error: "orderId required" });
      return;
    }
    const input = parseEwayGenerateInput(req.body);
    const result = await tryGenerateEwayForOnlineSpareOrder(pool, orderId, input);
    res.status(result.ok ? 200 : result.skipped ? 200 : 400).json({ edoc: result });
  });
}
