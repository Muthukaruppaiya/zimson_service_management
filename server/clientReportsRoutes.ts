import type { Express, Request, Response } from "express";
import type { Pool } from "pg";
import type { DemoUser } from "../src/types/user";
import {
  buildMultiSheetReportWorkbook,
  buildReportWorkbook,
  fetchHsnPurchaseRows,
  fetchRevenueReportSheets,
  fetchSrReturnedRows,
  fetchSummarySaleRows,
  HSN_PURCHASE_HEADERS,
  parseReportFilters,
  REVENUE_HEADERS,
  SR_RETURNED_HEADERS,
  SUMMARY_SALE_HEADERS,
} from "./clientReports";
import { syncInvoicesFromLegacySources } from "./serviceInvoiceLedger";

type Authed = Request & { userId: string };

function canAccessReports(actor: DemoUser): boolean {
  return (
    actor.role === "super_admin" ||
    actor.role === "admin" ||
    actor.role === "ho_accounts" ||
    actor.role === "ho_manager" ||
    actor.role === "store_accounts" ||
    actor.role === "service_centre_supervisor"
  );
}

function sendXlsx(res: Response, filename: string, buffer: Buffer) {
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buffer);
}

async function prepareReportData(pool: Pool): Promise<void> {
  try {
    await syncInvoicesFromLegacySources(pool);
  } catch (e) {
    console.warn("[reports] invoice sync skipped:", e);
  }
}

export function registerClientReportsRoutes(
  app: Express,
  pool: Pool,
  requireAuth: (req: Request, res: Response, next: () => void) => void,
  getUserById: (id: string) => DemoUser | null,
): void {
  app.get("/api/accounts/reports/meta", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || !canAccessReports(actor)) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
    res.json({
      reports: [
        { id: "revenue", label: "Revenue report", description: "SRF revenue (sheet 1) and quick bill revenue (sheet 2) with HSN, tax, and customer details." },
        { id: "summary-sale", label: "Summary sale report", description: "One row per invoice with payment breakdown." },
        { id: "hsn-purchase", label: "HSN purchase report", description: "GRN / purchase inward grouped by HSN." },
        { id: "sr-returned", label: "SR returned report", description: "Watches returned without billing or inter-HO no-repair returns." },
      ],
    });
  });

  app.get("/api/accounts/reports/revenue", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || !canAccessReports(actor)) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
    try {
      await prepareReportData(pool);
      const filters = parseReportFilters(req.query as Record<string, unknown>);
      const { srfLines, quickBillLines } = await fetchRevenueReportSheets(pool, actor, filters);
      const buf = buildMultiSheetReportWorkbook([
        { layout: { headers: REVENUE_HEADERS, title: "Revenue Report", sheetName: "SR Revenue" }, rows: srfLines },
        {
          layout: { headers: REVENUE_HEADERS, title: "Quick Bill Revenue Report", sheetName: "Quick Bill Revenue" },
          rows: quickBillLines,
        },
      ]);
      sendXlsx(res, `revenue_report_${Date.now()}.xlsx`, buf);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not generate revenue report." });
    }
  });

  app.get("/api/accounts/reports/summary-sale", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || !canAccessReports(actor)) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
    try {
      await prepareReportData(pool);
      const filters = parseReportFilters(req.query as Record<string, unknown>);
      const rows = await fetchSummarySaleRows(pool, actor, filters);
      const buf = buildReportWorkbook({ headers: SUMMARY_SALE_HEADERS, title: "Revenue Summary Report" }, rows);
      sendXlsx(res, `summary_sale_report_${Date.now()}.xlsx`, buf);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not generate summary sale report." });
    }
  });

  app.get("/api/accounts/reports/hsn-purchase", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || !canAccessReports(actor)) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
    try {
      const filters = parseReportFilters(req.query as Record<string, unknown>);
      const rows = await fetchHsnPurchaseRows(pool, actor, filters);
      const buf = buildReportWorkbook({ headers: HSN_PURCHASE_HEADERS }, rows);
      sendXlsx(res, `hsn_purchase_report_${Date.now()}.xlsx`, buf);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not generate HSN purchase report." });
    }
  });

  app.get("/api/accounts/reports/sr-returned", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || !canAccessReports(actor)) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
    try {
      const filters = parseReportFilters(req.query as Record<string, unknown>);
      const rows = await fetchSrReturnedRows(pool, actor, filters);
      const buf = buildReportWorkbook({ headers: SR_RETURNED_HEADERS, title: "SR Returned Report" }, rows);
      sendXlsx(res, `sr_returned_report_${Date.now()}.xlsx`, buf);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not generate SR returned report." });
    }
  });
}
