import type { Express, NextFunction, Request, Response } from "express";
import type { Pool } from "pg";
import type { DemoUser } from "../src/types/user";

type Authed = Request & { userId: string };

type TaxRow = {
  id: number;
  gst_rate_percent: string;
  cgst_rate_percent: string;
  sgst_rate_percent: string;
  igst_rate_percent: string;
  default_sac_hsn: string;
  prices_tax_inclusive: boolean;
  notes: string;
  updated_at: Date;
  updated_by: string | null;
};

function num(v: string): number {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function rowToPayload(row: TaxRow) {
  return {
    gstRatePercent: num(row.gst_rate_percent),
    cgstRatePercent: num(row.cgst_rate_percent),
    sgstRatePercent: num(row.sgst_rate_percent),
    igstRatePercent: num(row.igst_rate_percent),
    defaultSacHsn: row.default_sac_hsn.trim() || "9987",
    pricesTaxInclusive: Boolean(row.prices_tax_inclusive),
    notes: row.notes ?? "",
    updatedAt: row.updated_at.toISOString(),
    updatedBy: row.updated_by,
  };
}

function clampRate(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

function parseSacHsn(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (s.length > 32) return null;
  if (!/^[0-9A-Za-z\-./]+$/.test(s)) return null;
  return s;
}

export function registerTaxSettingsRoutes(
  app: Express,
  pool: Pool,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
  getUserById: (id: string) => DemoUser | null,
): void {
  app.get("/api/settings/tax", requireAuth, async (_req, res) => {
    try {
      const { rows } = await pool.query<TaxRow>(
        `SELECT id, gst_rate_percent::text, cgst_rate_percent::text, sgst_rate_percent::text,
                igst_rate_percent::text, default_sac_hsn, prices_tax_inclusive, notes,
                updated_at, updated_by
         FROM service_tax_settings WHERE id = 1`,
      );
      if (rows.length === 0) {
        res.status(500).json({ error: "Tax settings not initialized." });
        return;
      }
      res.json({ settings: rowToPayload(rows[0]!) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not load tax settings." });
    }
  });

  app.put("/api/settings/tax", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    if (actor.role !== "super_admin" && actor.role !== "regional_admin" && actor.role !== "ho_admin") {
      res.status(403).json({ error: "Only super or regional admins can update tax settings." });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const gstRatePercent = clampRate(Number(body.gstRatePercent));
    const cgstRatePercent = clampRate(Number(body.cgstRatePercent));
    const sgstRatePercent = clampRate(Number(body.sgstRatePercent));
    const igstRatePercent = clampRate(Number(body.igstRatePercent));
    const sac = parseSacHsn(body.defaultSacHsn);
    if (!sac) {
      res.status(400).json({ error: "defaultSacHsn must be a non-empty code (max 32 chars, alphanumeric / - .)."});
      return;
    }
    const pricesTaxInclusive = Boolean(body.pricesTaxInclusive);
    const notes = String(body.notes ?? "").slice(0, 2000);
    const updatedBy = actor.displayName?.trim() || actor.email;

    try {
      const { rows } = await pool.query<TaxRow>(
        `UPDATE service_tax_settings SET
           gst_rate_percent = $1,
           cgst_rate_percent = $2,
           sgst_rate_percent = $3,
           igst_rate_percent = $4,
           default_sac_hsn = $5,
           prices_tax_inclusive = $6,
           notes = $7,
           updated_at = now(),
           updated_by = $8
         WHERE id = 1
         RETURNING id, gst_rate_percent::text, cgst_rate_percent::text, sgst_rate_percent::text,
                   igst_rate_percent::text, default_sac_hsn, prices_tax_inclusive, notes,
                   updated_at, updated_by`,
        [
          gstRatePercent,
          cgstRatePercent,
          sgstRatePercent,
          igstRatePercent,
          sac,
          pricesTaxInclusive,
          notes,
          updatedBy,
        ],
      );
      if (rows.length === 0) {
        res.status(500).json({ error: "Tax settings row missing." });
        return;
      }
      res.json({ settings: rowToPayload(rows[0]!) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not save tax settings." });
    }
  });
}
