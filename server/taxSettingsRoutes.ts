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
  supplier_tax_person_types: unknown;
  srf_prefix: string;
  srf_suffix: string;
  pr_prefix: string;
  pr_suffix: string;
  po_prefix: string;
  po_suffix: string;
  grn_prefix: string;
  grn_suffix: string;
  dc_prefix: string;
  dc_suffix: string;
  odc_prefix: string;
  odc_suffix: string;
  app_logo_url: string;
  app_favicon_url: string;
  notes: string;
  updated_at: Date;
  updated_by: string | null;
};

function num(v: string): number {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function rowToPayload(row: TaxRow) {
  const supplierTaxPersonTypes = Array.isArray(row.supplier_tax_person_types)
    ? row.supplier_tax_person_types.map((x) => String(x ?? "").trim()).filter(Boolean)
    : ["INTRASTATE_TAXABLE_PERSON", "INTERSTATE_TAXABLE_PERSON"];
  return {
    gstRatePercent: num(row.gst_rate_percent),
    cgstRatePercent: num(row.cgst_rate_percent),
    sgstRatePercent: num(row.sgst_rate_percent),
    igstRatePercent: num(row.igst_rate_percent),
    defaultSacHsn: row.default_sac_hsn.trim() || "9987",
    pricesTaxInclusive: Boolean(row.prices_tax_inclusive),
    supplierTaxPersonTypes,
    srfPrefix: row.srf_prefix ?? "SRF",
    srfSuffix: row.srf_suffix ?? "",
    prPrefix: row.pr_prefix ?? "PR",
    prSuffix: row.pr_suffix ?? "",
    poPrefix: row.po_prefix ?? "PO",
    poSuffix: row.po_suffix ?? "",
    grnPrefix: row.grn_prefix ?? "GRN",
    grnSuffix: row.grn_suffix ?? "",
    dcPrefix: row.dc_prefix ?? "DC",
    dcSuffix: row.dc_suffix ?? "",
    odcPrefix: row.odc_prefix ?? "ODC",
    odcSuffix: row.odc_suffix ?? "",
    appLogoUrl: row.app_logo_url ?? "",
    appFaviconUrl: row.app_favicon_url ?? "",
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

function parseSeriesPart(raw: unknown, fallback: string): string {
  const s = String(raw ?? fallback).trim().toUpperCase();
  const cleaned = s.replace(/[^A-Z0-9_-]/g, "");
  return (cleaned || fallback).slice(0, 16);
}

function parseSeriesSuffix(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 16);
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
                igst_rate_percent::text, default_sac_hsn, prices_tax_inclusive, supplier_tax_person_types,
                srf_prefix, srf_suffix, pr_prefix, pr_suffix, po_prefix, po_suffix,
                grn_prefix, grn_suffix, dc_prefix, dc_suffix, odc_prefix, odc_suffix,
                notes,
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
    const supplierTaxPersonTypes = Array.isArray(body.supplierTaxPersonTypes)
      ? body.supplierTaxPersonTypes.map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, 20)
      : ["INTRASTATE_TAXABLE_PERSON", "INTERSTATE_TAXABLE_PERSON"];
    const srfPrefix = parseSeriesPart(body.srfPrefix, "SRF");
    const srfSuffix = parseSeriesSuffix(body.srfSuffix);
    const prPrefix = parseSeriesPart(body.prPrefix, "PR");
    const prSuffix = parseSeriesSuffix(body.prSuffix);
    const poPrefix = parseSeriesPart(body.poPrefix, "PO");
    const poSuffix = parseSeriesSuffix(body.poSuffix);
    const grnPrefix = parseSeriesPart(body.grnPrefix, "GRN");
    const grnSuffix = parseSeriesSuffix(body.grnSuffix);
    const dcPrefix = parseSeriesPart(body.dcPrefix, "DC");
    const dcSuffix = parseSeriesSuffix(body.dcSuffix);
    const odcPrefix = parseSeriesPart(body.odcPrefix, "ODC");
    const odcSuffix = parseSeriesSuffix(body.odcSuffix);
    const notes = String(body.notes ?? "").slice(0, 2000);
    const appLogoUrl = String(body.appLogoUrl ?? "").trim().slice(0, 4000);
    const appFaviconUrl = String(body.appFaviconUrl ?? "").trim().slice(0, 4000);
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
           supplier_tax_person_types = $7::jsonb,
           srf_prefix = $8,
           srf_suffix = $9,
           pr_prefix = $10,
           pr_suffix = $11,
           po_prefix = $12,
           po_suffix = $13,
           grn_prefix = $14,
           grn_suffix = $15,
           dc_prefix = $16,
           dc_suffix = $17,
           odc_prefix = $18,
           odc_suffix = $19,
           app_logo_url = $20,
           app_favicon_url = $21,
           notes = $22,
           updated_at = now(),
           updated_by = $23
         WHERE id = 1
         RETURNING id, gst_rate_percent::text, cgst_rate_percent::text, sgst_rate_percent::text,
                  igst_rate_percent::text, default_sac_hsn, prices_tax_inclusive, supplier_tax_person_types,
                   srf_prefix, srf_suffix, pr_prefix, pr_suffix, po_prefix, po_suffix,
                  grn_prefix, grn_suffix, dc_prefix, dc_suffix, odc_prefix, odc_suffix,
                  app_logo_url, app_favicon_url, notes,
                   updated_at, updated_by`,
        [
          gstRatePercent,
          cgstRatePercent,
          sgstRatePercent,
          igstRatePercent,
          sac,
          pricesTaxInclusive,
          JSON.stringify(supplierTaxPersonTypes),
          srfPrefix,
          srfSuffix,
          prPrefix,
          prSuffix,
          poPrefix,
          poSuffix,
          grnPrefix,
          grnSuffix,
          dcPrefix,
          dcSuffix,
          odcPrefix,
          odcSuffix,
          appLogoUrl,
          appFaviconUrl,
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
