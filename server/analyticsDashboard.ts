import type { Pool } from "pg";
import type { DemoUser } from "../src/types/user";

export type AnalyticsFilters = {
  from: string;
  to: string;
  regionId?: string;
  view: AnalyticsViewKey;
};

export type AnalyticsViewKey =
  | "sales"
  | "srf"
  | "quick_bill"
  | "b2b_b2c"
  | "purchase"
  | "store"
  | "region"
  | "margin";

const ANALYTICS_VIEWS: AnalyticsViewKey[] = [
  "sales",
  "srf",
  "quick_bill",
  "b2b_b2c",
  "purchase",
  "store",
  "region",
  "margin",
];

export type ChartSlice = { name: string; value: number };

export type AnalyticsDashboardData = {
  filters: AnalyticsFilters;
  kpis: {
    totalSalesInr: number;
    srfSalesInr: number;
    quickBillSalesInr: number;
    purchaseInr: number;
    srfOpened: number;
    srfClosed: number;
    srfActive: number;
    quickBillCount: number;
    b2bSalesInr: number;
    b2cSalesInr: number;
    srfInvoiceCount: number;
  };
  derived: {
    avgSrfTicketInr: number;
    avgQuickBillInr: number;
    srfCloseRatePct: number;
    b2bSharePct: number;
    grossMarginInr: number;
    grossMarginPct: number;
  };
  compare: {
    label: string;
    totalSalesInr: number;
    srfSalesInr: number;
    quickBillSalesInr: number;
    purchaseInr: number;
    srfOpened: number;
    srfClosed: number;
  };
  salesTrend: ChartSlice[];
  salesByMonth: ChartSlice[];
  purchaseByMonth: ChartSlice[];
  srfStatusBreakdown: ChartSlice[];
  srfPipelineBuckets: ChartSlice[];
  srfOpenedByMonth: ChartSlice[];
  srfClosedByMonth: ChartSlice[];
  salesByStore: ChartSlice[];
  salesByRegion: ChartSlice[];
  b2bVsB2c: ChartSlice[];
  srfVsQuickBill: ChartSlice[];
  paymentModes: ChartSlice[];
  purchaseByVendor: ChartSlice[];
  purchaseByHsn: ChartSlice[];
  quickBillTrend: ChartSlice[];
  srfSalesTrend: ChartSlice[];
  b2bB2cByChannel: ChartSlice[];
  srfByBrand: ChartSlice[];
  quickBillByBrand: ChartSlice[];
  storeDetail: { name: string; srfInr: number; quickBillInr: number; totalInr: number }[];
};

const REPORT_TZ = "Asia/Kolkata";

function parseAnalyticsFilters(query: Record<string, unknown>): AnalyticsFilters {
  let from =
    String(query.from ?? "").trim() || new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  let to = String(query.to ?? "").trim() || new Date().toISOString().slice(0, 10);
  if (from > to) [from, to] = [to, from];
  const regionId = String(query.regionId ?? "").trim() || undefined;
  const viewRaw = String(query.view ?? "sales").trim() as AnalyticsViewKey;
  const view = ANALYTICS_VIEWS.includes(viewRaw) ? viewRaw : "sales";
  return { from, to, regionId, view };
}

function sqlIstDate(tsColumn: string): string {
  return `(${tsColumn} AT TIME ZONE '${REPORT_TZ}')::date`;
}

function sqlDateBetween(dateExpr: string, fromIdx: number, toIdx: number): string {
  return `${dateExpr} >= $${fromIdx}::date AND ${dateExpr} <= $${toIdx}::date`;
}

function sqlTsBetween(tsColumn: string, fromIdx: number, toIdx: number): string {
  return sqlDateBetween(sqlIstDate(tsColumn), fromIdx, toIdx);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function rowsToChart(rows: Array<{ name: string; value: string | number }>): ChartSlice[] {
  return rows
    .map((r) => ({ name: String(r.name || "—"), value: round2(Number(r.value) || 0) }))
    .filter((r) => r.value > 0 || r.name !== "—");
}

function previousPeriod(from: string, to: string): { prevFrom: string; prevTo: string; label: string } {
  const fromD = new Date(`${from}T12:00:00`);
  const toD = new Date(`${to}T12:00:00`);
  const days = Math.max(1, Math.round((toD.getTime() - fromD.getTime()) / 86400000) + 1);
  const prevToD = new Date(fromD);
  prevToD.setDate(prevToD.getDate() - 1);
  const prevFromD = new Date(prevToD);
  prevFromD.setDate(prevFromD.getDate() - days + 1);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { prevFrom: fmt(prevFromD), prevTo: fmt(prevToD), label: `vs prior ${days} day${days === 1 ? "" : "s"}` };
}

function aggregateByMonth(slices: ChartSlice[]): ChartSlice[] {
  const map = new Map<string, number>();
  for (const s of slices) {
    const month = s.name.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    map.set(month, (map.get(month) ?? 0) + s.value);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => ({ name, value: round2(value) }));
}

const SRF_STAGE_SQL = `CASE
  WHEN sj.status IN ('draft','photo_pending','at_store','store_self_pending','store_self_assigned','store_self_working') THEN 'Store — booking & waiting'
  WHEN sj.status IN ('in_transit_sc','dispatched_to_store','ready_for_outward') THEN 'In transit'
  WHEN sj.status IN ('received_at_sc','assigned','estimate_ok','reestimate_required','customer_rejected','inter_ho_reestimate_pending_sender','inter_ho_reestimate_customer_accepted','inter_ho_brand_estimate_pending_sender','inter_ho_brand_estimate_customer_accepted','sent_to_other_ho') THEN 'HO — repair in progress'
  WHEN sj.status IN ('sent_to_brand','brand_estimate_pending','brand_estimate_customer_pending','brand_estimate_customer_accepted','brand_approved','brand_repair_in_progress','received_from_brand','brand_outward_pending','brand_dispatch_pending','brand_credit_note_pending','brand_credit_note_active') THEN 'Brand service desk'
  WHEN sj.status = 'received_at_store' THEN 'Ready for customer pickup'
  WHEN sj.status = 'closed' THEN 'Closed'
  WHEN sj.status = 'cancelled' THEN 'Cancelled'
  ELSE 'Other'
END`;

function scopeRegion(
  actor: DemoUser,
  params: unknown[],
  regionExpr: string,
  filters: AnalyticsFilters,
): string {
  const regionId = filters.regionId ?? (actor.role === "super_admin" ? "" : actor.regionId ?? "");
  if (regionId) {
    params.push(regionId);
    return `${regionExpr} = $${params.length}`;
  }
  if (actor.role === "super_admin") return "TRUE";
  if (actor.regionId) {
    params.push(actor.regionId);
    return `${regionExpr} = $${params.length}`;
  }
  return "FALSE";
}

const SRF_NOT_ARCHIVED = `sj.reference NOT LIKE '%-ARCH-%'`;

const SRF_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  photo_pending: "Photo pending",
  at_store: "At store",
  store_self_pending: "Store self — pending",
  store_self_assigned: "Store self — assigned",
  store_self_working: "Store self — working",
  in_transit_sc: "In transit to HO",
  received_at_sc: "Received at HO",
  sent_to_other_ho: "Sent to other HO",
  assigned: "Assigned to technician",
  estimate_ok: "Estimate OK",
  reestimate_required: "Re-estimate required",
  customer_rejected: "Customer rejected",
  inter_ho_reestimate_pending_sender: "Inter-HO re-estimate (sender)",
  inter_ho_reestimate_customer_accepted: "Inter-HO re-estimate accepted",
  inter_ho_brand_estimate_pending_sender: "Inter-HO brand est. (sender)",
  inter_ho_brand_estimate_customer_accepted: "Inter-HO brand accepted",
  brand_outward_pending: "Brand outward pending",
  brand_dispatch_pending: "Brand dispatch pending",
  sent_to_brand: "Sent to brand",
  brand_estimate_pending: "Brand estimate pending",
  brand_estimate_customer_pending: "Brand estimate — customer",
  brand_estimate_customer_accepted: "Brand estimate accepted",
  brand_approved: "Brand approved",
  brand_repair_in_progress: "Brand repair in progress",
  received_from_brand: "Received from brand",
  brand_credit_note_pending: "Brand credit note pending",
  brand_credit_note_active: "Brand credit note active",
  ready_for_outward: "Ready for outward",
  dispatched_to_store: "Dispatched to store",
  received_at_store: "Received at store",
  closed: "Closed",
  cancelled: "Cancelled",
};

export function canAccessAnalytics(actor: DemoUser): boolean {
  return actor.role === "super_admin" || actor.role === "admin" || actor.role === "ho_manager";
}

export function parseAnalyticsQuery(query: Record<string, unknown>): AnalyticsFilters {
  return parseAnalyticsFilters(query);
}

export async function fetchAnalyticsDashboard(
  pool: Pool,
  actor: DemoUser,
  filters: AnalyticsFilters,
): Promise<AnalyticsDashboardData> {
  const view = filters.view;
  const kpis = {
    totalSalesInr: 0,
    srfSalesInr: 0,
    quickBillSalesInr: 0,
    purchaseInr: 0,
    srfOpened: 0,
    srfClosed: 0,
    srfActive: 0,
    quickBillCount: 0,
    b2bSalesInr: 0,
    b2cSalesInr: 0,
    srfInvoiceCount: 0,
  };

  const needQbSales =
    view === "sales" || view === "quick_bill" || view === "b2b_b2c" || view === "store" || view === "margin";
  const needSrfSales = view === "sales" || view === "srf" || view === "b2b_b2c" || view === "store" || view === "margin";
  const needGrn = view === "purchase" || view === "margin";
  const needSrfPipeline = view === "srf";
  const needSalesTrend = view === "sales" || view === "margin";
  const needQbTrend = view === "quick_bill" || view === "sales" || view === "margin";
  const needSrfTrend = view === "srf" || view === "sales" || view === "margin";
  const needStore = view === "store" || view === "sales";
  const needRegion = view === "region" || (view === "sales" && actor.role === "super_admin" && !filters.regionId);
  const needPayment = view === "quick_bill";

  let qbB2b = 0;
  let qbB2c = 0;
  let srfB2b = 0;
  let srfB2c = 0;

  if (needQbSales) {
    const qbParams: unknown[] = [filters.from, filters.to];
    const qbScope = scopeRegion(actor, qbParams, "qb.region_id", filters);
    const qbSales = await pool.query<{ total: string; cnt: string; b2b: string; b2c: string }>(
      `SELECT COALESCE(SUM(qb.total_inr), 0)::float8 AS total,
              COUNT(*)::int AS cnt,
              COALESCE(SUM(CASE WHEN qb.customer_type = 'B2B' THEN qb.total_inr ELSE 0 END), 0)::float8 AS b2b,
              COALESCE(SUM(CASE WHEN qb.customer_type = 'B2C' THEN qb.total_inr ELSE 0 END), 0)::float8 AS b2c
       FROM quick_bills qb
       WHERE ${sqlTsBetween("qb.created_at", 1, 2)} AND ${qbScope}`,
      qbParams,
    );
    kpis.quickBillSalesInr = Number(qbSales.rows[0]?.total ?? 0);
    kpis.quickBillCount = Number(qbSales.rows[0]?.cnt ?? 0);
    qbB2b = Number(qbSales.rows[0]?.b2b ?? 0);
    qbB2c = Number(qbSales.rows[0]?.b2c ?? 0);
  }

  if (needSrfSales) {
    const invParams: unknown[] = [filters.from, filters.to];
    const invScope = scopeRegion(actor, invParams, "COALESCE(NULLIF(si.region_id, ''), sj.region_id)", filters);
    const srfSales = await pool.query<{ total: string; b2b: string; b2c: string; cnt: string }>(
      `SELECT COALESCE(SUM(si.total_inr), 0)::float8 AS total,
              COUNT(si.id)::int AS cnt,
              COALESCE(SUM(CASE WHEN COALESCE(sj.customer_kind, 'B2C') = 'B2B' THEN si.total_inr ELSE 0 END), 0)::float8 AS b2b,
              COALESCE(SUM(CASE WHEN COALESCE(sj.customer_kind, 'B2C') = 'B2C' THEN si.total_inr ELSE 0 END), 0)::float8 AS b2c
       FROM service_invoices si
       LEFT JOIN srf_jobs sj ON sj.id::text = si.source_id
         AND si.source_type IN ('srf_store', 'inter_ho_repair')
       WHERE si.source_type IN ('srf_store', 'inter_ho_repair')
         AND ${sqlDateBetween(`COALESCE(si.invoice_date, ${sqlIstDate("si.created_at")})`, 1, 2)}
         AND ${invScope}`,
      invParams,
    );
    kpis.srfSalesInr = Number(srfSales.rows[0]?.total ?? 0);
    kpis.srfInvoiceCount = Number(srfSales.rows[0]?.cnt ?? 0);
    srfB2b = Number(srfSales.rows[0]?.b2b ?? 0);
    srfB2c = Number(srfSales.rows[0]?.b2c ?? 0);
  }

  if (view === "b2b_b2c" || view === "sales" || view === "store" || view === "margin") {
    kpis.b2bSalesInr = round2(qbB2b + srfB2b);
    kpis.b2cSalesInr = round2(qbB2c + srfB2c);
    kpis.totalSalesInr = round2(kpis.srfSalesInr + kpis.quickBillSalesInr);
  }

  if (needGrn) {
    const grnParams: unknown[] = [filters.from, filters.to];
    const grnScope = scopeRegion(actor, grnParams, "g.region_id", filters);
    const grnSales = await pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(
         (gi.qty_received * gi.cost_price) + COALESCE(gi.tax_amount, (gi.qty_received * gi.cost_price * COALESCE(gi.gst_rate, 18) / 100))
       ), 0)::float8 AS total
       FROM grn_items gi
       JOIN grns g ON g.id = gi.grn_id
       WHERE ${sqlDateBetween(`COALESCE(g.invoice_date, ${sqlIstDate("g.created_at")})`, 1, 2)}
         AND ${grnScope}`,
      grnParams,
    );
    kpis.purchaseInr = Number(grnSales.rows[0]?.total ?? 0);
  }

  let srfStatusBreakdown: ChartSlice[] = [];
  let srfOpenedByMonth: ChartSlice[] = [];
  let srfClosedByMonth: ChartSlice[] = [];
  let srfPipelineBuckets: ChartSlice[] = [];
  let srfByBrand: ChartSlice[] = [];

  if (needSrfPipeline) {
    const sjParams: unknown[] = [];
    const sjScope = scopeRegion(actor, sjParams, "sj.region_id", filters);
    const srfActiveRes = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*)::int AS cnt FROM srf_jobs sj
       WHERE ${SRF_NOT_ARCHIVED}
         AND sj.status NOT IN ('closed', 'cancelled')
         AND ${sjScope}`,
      sjParams,
    );
    kpis.srfActive = Number(srfActiveRes.rows[0]?.cnt ?? 0);

    const openParams: unknown[] = [filters.from, filters.to];
    const openScope = scopeRegion(actor, openParams, "sj.region_id", filters);
    const openedRes = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*)::int AS cnt FROM srf_jobs sj
       WHERE ${SRF_NOT_ARCHIVED}
         AND ${sqlTsBetween("sj.created_at", 1, 2)}
         AND ${openScope}`,
      openParams,
    );
    kpis.srfOpened = Number(openedRes.rows[0]?.cnt ?? 0);

    const closedParams: unknown[] = [filters.from, filters.to];
    const closedScope = scopeRegion(actor, closedParams, "sj.region_id", filters);
    const closedRes = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*)::int AS cnt FROM srf_jobs sj
       WHERE ${SRF_NOT_ARCHIVED}
         AND sj.status = 'closed'
         AND ${sqlTsBetween("COALESCE(sj.closed_at, sj.updated_at)", 1, 2)}
         AND ${closedScope}`,
      closedParams,
    );
    kpis.srfClosed = Number(closedRes.rows[0]?.cnt ?? 0);

    const statusParams: unknown[] = [];
    const statusScope = scopeRegion(actor, statusParams, "sj.region_id", filters);
    const statusRes = await pool.query<{ status: string; cnt: string }>(
      `SELECT sj.status, COUNT(*)::int AS cnt
       FROM srf_jobs sj
       WHERE ${SRF_NOT_ARCHIVED} AND ${statusScope}
       GROUP BY sj.status
       ORDER BY cnt DESC`,
      statusParams,
    );
    srfStatusBreakdown = statusRes.rows.map((r) => ({
      name: SRF_STATUS_LABELS[r.status] ?? r.status,
      value: Number(r.cnt),
    }));

    const openedMonthP: unknown[] = [filters.from, filters.to];
    const openedMonthScope = scopeRegion(actor, openedMonthP, "sj.region_id", filters);
    const openedMonth = await pool.query<{ name: string; value: string }>(
      `SELECT to_char(${sqlIstDate("sj.created_at")}, 'YYYY-MM') AS name, COUNT(*)::int AS value
       FROM srf_jobs sj
       WHERE ${SRF_NOT_ARCHIVED} AND ${sqlTsBetween("sj.created_at", 1, 2)} AND ${openedMonthScope}
       GROUP BY 1 ORDER BY 1`,
      openedMonthP,
    );
    srfOpenedByMonth = rowsToChart(openedMonth.rows);

    const closedMonthP: unknown[] = [filters.from, filters.to];
    const closedMonthScope = scopeRegion(actor, closedMonthP, "sj.region_id", filters);
    const closedMonth = await pool.query<{ name: string; value: string }>(
      `SELECT to_char(${sqlIstDate("COALESCE(sj.closed_at, sj.updated_at)")}, 'YYYY-MM') AS name, COUNT(*)::int AS value
       FROM srf_jobs sj
       WHERE ${SRF_NOT_ARCHIVED} AND sj.status = 'closed'
         AND ${sqlTsBetween("COALESCE(sj.closed_at, sj.updated_at)", 1, 2)}
         AND ${closedMonthScope}
       GROUP BY 1 ORDER BY 1`,
      closedMonthP,
    );
    srfClosedByMonth = rowsToChart(closedMonth.rows);

    const bucketP: unknown[] = [];
    const bucketScope = scopeRegion(actor, bucketP, "sj.region_id", filters);
    const bucketRes = await pool.query<{ name: string; value: string }>(
      `SELECT stage AS name, COUNT(*)::int AS value FROM (
         SELECT ${SRF_STAGE_SQL} AS stage FROM srf_jobs sj
         WHERE ${SRF_NOT_ARCHIVED} AND ${bucketScope}
       ) x GROUP BY stage ORDER BY value DESC`,
      bucketP,
    );
    srfPipelineBuckets = rowsToChart(bucketRes.rows);

    const brandP: unknown[] = [filters.from, filters.to];
    const brandScope = scopeRegion(actor, brandP, "sj.region_id", filters);
    const brandRes = await pool.query<{ name: string; value: string }>(
      `SELECT COALESCE(NULLIF(TRIM(sj.watch_brand), ''), 'Unknown') AS name, COUNT(*)::int AS value
       FROM srf_jobs sj
       WHERE ${SRF_NOT_ARCHIVED} AND ${sqlTsBetween("sj.created_at", 1, 2)} AND ${brandScope}
       GROUP BY 1 ORDER BY value DESC LIMIT 12`,
      brandP,
    );
    srfByBrand = rowsToChart(brandRes.rows);
  }

  let salesTrend: ChartSlice[] = [];
  let quickBillTrend: ChartSlice[] = [];
  let srfSalesTrend: ChartSlice[] = [];

  if (needSalesTrend || needQbTrend || needSrfTrend) {
    if (needQbTrend || needSalesTrend) {
      const qbTrendParams: unknown[] = [filters.from, filters.to];
      const qbTrendScope = scopeRegion(actor, qbTrendParams, "qb.region_id", filters);
      const qbTrend = await pool.query<{ day: string; total: string }>(
        `SELECT ${sqlIstDate("qb.created_at")}::text AS day, SUM(qb.total_inr)::float8 AS total
         FROM quick_bills qb
         WHERE ${sqlTsBetween("qb.created_at", 1, 2)} AND ${qbTrendScope}
         GROUP BY 1 ORDER BY 1`,
        qbTrendParams,
      );
      quickBillTrend = qbTrend.rows.map((r) => ({
        name: String(r.day).slice(0, 10),
        value: round2(Number(r.total)),
      }));
    }

    if (needSrfTrend || needSalesTrend) {
      const invTrendParams: unknown[] = [filters.from, filters.to];
      const invTrendScope = scopeRegion(actor, invTrendParams, "si.region_id", filters);
      const invTrend = await pool.query<{ day: string; total: string }>(
        `SELECT COALESCE(si.invoice_date::text, ${sqlIstDate("si.created_at")}::text) AS day,
                SUM(si.total_inr)::float8 AS total
         FROM service_invoices si
         WHERE si.source_type IN ('srf_store', 'inter_ho_repair')
           AND ${sqlDateBetween(`COALESCE(si.invoice_date, ${sqlIstDate("si.created_at")})`, 1, 2)}
           AND ${invTrendScope}
         GROUP BY 1 ORDER BY 1`,
        invTrendParams,
      );
      srfSalesTrend = invTrend.rows.map((r) => ({
        name: String(r.day).slice(0, 10),
        value: round2(Number(r.total)),
      }));
    }

    if (needSalesTrend) {
      const trendMap = new Map<string, number>();
      for (const r of [...quickBillTrend, ...srfSalesTrend]) {
        trendMap.set(r.name, (trendMap.get(r.name) ?? 0) + r.value);
      }
      salesTrend = [...trendMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, value]) => ({ name, value: round2(value) }));
    }
  }

  let salesByStore: ChartSlice[] = [];
  let storeDetail: { name: string; srfInr: number; quickBillInr: number; totalInr: number }[] = [];
  if (needStore) {
    const storeQbP: unknown[] = [filters.from, filters.to];
    const storeQbScope = scopeRegion(actor, storeQbP, "qb.region_id", filters);
    const storeQb = await pool.query<{ store_name: string; total: string }>(
      `SELECT COALESCE(st.name, 'Unknown') AS store_name, SUM(qb.total_inr)::float8 AS total
       FROM quick_bills qb
       LEFT JOIN stores st ON st.id = qb.store_id
       WHERE ${sqlTsBetween("qb.created_at", 1, 2)} AND ${storeQbScope}
       GROUP BY st.name`,
      storeQbP,
    );
    const storeInvP: unknown[] = [filters.from, filters.to];
    const storeInvScope = scopeRegion(actor, storeInvP, "si.region_id", filters);
    const storeInv = await pool.query<{ store_name: string; total: string }>(
      `SELECT COALESCE(st.name, 'Unknown') AS store_name, SUM(si.total_inr)::float8 AS total
       FROM service_invoices si
       LEFT JOIN srf_jobs sj ON sj.id::text = si.source_id
       LEFT JOIN stores st ON st.id = COALESCE(NULLIF(si.store_id, ''), sj.store_id)
       WHERE si.source_type IN ('srf_store', 'inter_ho_repair')
         AND ${sqlDateBetween(`COALESCE(si.invoice_date, ${sqlIstDate("si.created_at")})`, 1, 2)}
         AND ${storeInvScope}
       GROUP BY st.name`,
      storeInvP,
    );
    const storeMap = new Map<string, number>();
    const srfStoreMap = new Map<string, number>();
    const qbStoreMap = new Map<string, number>();
    for (const r of storeQb.rows) {
      const name = r.store_name || "Unknown";
      qbStoreMap.set(name, (qbStoreMap.get(name) ?? 0) + Number(r.total));
      storeMap.set(name, (storeMap.get(name) ?? 0) + Number(r.total));
    }
    for (const r of storeInv.rows) {
      const name = r.store_name || "Unknown";
      srfStoreMap.set(name, (srfStoreMap.get(name) ?? 0) + Number(r.total));
      storeMap.set(name, (storeMap.get(name) ?? 0) + Number(r.total));
    }
    salesByStore = [...storeMap.entries()]
      .map(([name, value]) => ({ name, value: round2(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);
    storeDetail = [...storeMap.entries()]
      .map(([name, totalInr]) => ({
        name,
        srfInr: round2(srfStoreMap.get(name) ?? 0),
        quickBillInr: round2(qbStoreMap.get(name) ?? 0),
        totalInr: round2(totalInr),
      }))
      .sort((a, b) => b.totalInr - a.totalInr)
      .slice(0, 20);
  }

  let salesByRegion: ChartSlice[] = [];
  if (needRegion && actor.role === "super_admin" && !filters.regionId) {
    const regQbP: unknown[] = [filters.from, filters.to];
    const regQb = await pool.query<{ region_name: string; total: string }>(
      `SELECT COALESCE(r.name, 'Unknown') AS region_name, SUM(qb.total_inr)::float8 AS total
       FROM quick_bills qb
       LEFT JOIN regions r ON r.id = qb.region_id
       WHERE ${sqlTsBetween("qb.created_at", 1, 2)}
       GROUP BY r.name`,
      regQbP,
    );
    const regInvP: unknown[] = [filters.from, filters.to];
    const regInv = await pool.query<{ region_name: string; total: string }>(
      `SELECT COALESCE(r.name, 'Unknown') AS region_name, SUM(si.total_inr)::float8 AS total
       FROM service_invoices si
       LEFT JOIN regions r ON r.id = si.region_id
       WHERE si.source_type IN ('srf_store', 'inter_ho_repair')
         AND ${sqlDateBetween(`COALESCE(si.invoice_date, ${sqlIstDate("si.created_at")})`, 1, 2)}
       GROUP BY r.name`,
      regInvP,
    );
    const regMap = new Map<string, number>();
    for (const r of [...regQb.rows, ...regInv.rows]) {
      regMap.set(r.region_name, (regMap.get(r.region_name) ?? 0) + Number(r.total));
    }
    salesByRegion = [...regMap.entries()]
      .map(([name, value]) => ({ name, value: round2(value) }))
      .sort((a, b) => b.value - a.value);
  }

  let paymentModes: ChartSlice[] = [];
  let quickBillByBrand: ChartSlice[] = [];
  if (needPayment) {
    const payQbP: unknown[] = [filters.from, filters.to];
    const payQbScope = scopeRegion(actor, payQbP, "qb.region_id", filters);
    const payModes = await pool.query<{ name: string; value: string }>(
      `SELECT COALESCE(NULLIF(TRIM(qb.payment_mode), ''), 'Cash') AS name, SUM(qb.total_inr)::float8 AS value
       FROM quick_bills qb
       WHERE ${sqlTsBetween("qb.created_at", 1, 2)} AND ${payQbScope}
       GROUP BY 1`,
      payQbP,
    );
    paymentModes = rowsToChart(payModes.rows);

    const qbBrandP: unknown[] = [filters.from, filters.to];
    const qbBrandScope = scopeRegion(actor, qbBrandP, "qb.region_id", filters);
    const qbBrandRes = await pool.query<{ name: string; value: string }>(
      `SELECT COALESCE(NULLIF(TRIM(qb.watch_brand), ''), 'Unknown') AS name, SUM(qb.total_inr)::float8 AS value
       FROM quick_bills qb
       WHERE ${sqlTsBetween("qb.created_at", 1, 2)} AND ${qbBrandScope}
       GROUP BY 1 ORDER BY value DESC LIMIT 12`,
      qbBrandP,
    );
    quickBillByBrand = rowsToChart(qbBrandRes.rows);
  }

  let purchaseByVendor: ChartSlice[] = [];
  let purchaseByHsn: ChartSlice[] = [];
  let purchaseByMonth: ChartSlice[] = [];
  if (needGrn) {
    const vendorP: unknown[] = [filters.from, filters.to];
    const vendorScope = scopeRegion(actor, vendorP, "g.region_id", filters);
    const vendorRes = await pool.query<{ name: string; value: string }>(
      `SELECT COALESCE(s.name, 'Unknown') AS name,
              SUM((gi.qty_received * gi.cost_price) + COALESCE(gi.tax_amount, 0))::float8 AS value
       FROM grn_items gi
       JOIN grns g ON g.id = gi.grn_id
       JOIN suppliers s ON s.id = g.supplier_id
       WHERE ${sqlDateBetween(`COALESCE(g.invoice_date, ${sqlIstDate("g.created_at")})`, 1, 2)}
         AND ${vendorScope}
       GROUP BY s.name
       ORDER BY value DESC
       LIMIT 10`,
      vendorP,
    );
    purchaseByVendor = rowsToChart(vendorRes.rows);

    const hsnP: unknown[] = [filters.from, filters.to];
    const hsnScope = scopeRegion(actor, hsnP, "g.region_id", filters);
    const hsnRes = await pool.query<{ name: string; value: string }>(
      `SELECT COALESCE(sp.hsn, '—') AS name,
              SUM((gi.qty_received * gi.cost_price) + COALESCE(gi.tax_amount, 0))::float8 AS value
       FROM grn_items gi
       JOIN grns g ON g.id = gi.grn_id
       JOIN spares sp ON sp.id = gi.spare_id
       WHERE ${sqlDateBetween(`COALESCE(g.invoice_date, ${sqlIstDate("g.created_at")})`, 1, 2)}
         AND ${hsnScope}
       GROUP BY sp.hsn
       ORDER BY value DESC
       LIMIT 10`,
      hsnP,
    );
    purchaseByHsn = rowsToChart(hsnRes.rows);

    const grnMonthP: unknown[] = [filters.from, filters.to];
    const grnMonthScope = scopeRegion(actor, grnMonthP, "g.region_id", filters);
    const grnMonth = await pool.query<{ name: string; value: string }>(
      `SELECT to_char(COALESCE(g.invoice_date, ${sqlIstDate("g.created_at")}), 'YYYY-MM') AS name,
              SUM((gi.qty_received * gi.cost_price) + COALESCE(gi.tax_amount, 0))::float8 AS value
       FROM grn_items gi
       JOIN grns g ON g.id = gi.grn_id
       WHERE ${sqlDateBetween(`COALESCE(g.invoice_date, ${sqlIstDate("g.created_at")})`, 1, 2)}
         AND ${grnMonthScope}
       GROUP BY 1 ORDER BY 1`,
      grnMonthP,
    );
    purchaseByMonth = rowsToChart(grnMonth.rows);
  }

  const salesByMonth = aggregateByMonth(salesTrend);

  const derived = {
    avgSrfTicketInr: kpis.srfInvoiceCount > 0 ? round2(kpis.srfSalesInr / kpis.srfInvoiceCount) : 0,
    avgQuickBillInr: kpis.quickBillCount > 0 ? round2(kpis.quickBillSalesInr / kpis.quickBillCount) : 0,
    srfCloseRatePct: kpis.srfOpened > 0 ? round2((kpis.srfClosed / kpis.srfOpened) * 100) : 0,
    b2bSharePct: kpis.totalSalesInr > 0 ? round2((kpis.b2bSalesInr / kpis.totalSalesInr) * 100) : 0,
    grossMarginInr: round2(kpis.totalSalesInr - kpis.purchaseInr),
    grossMarginPct:
      kpis.totalSalesInr > 0 ? round2(((kpis.totalSalesInr - kpis.purchaseInr) / kpis.totalSalesInr) * 100) : 0,
  };

  const pp = previousPeriod(filters.from, filters.to);
  const compare = {
    label: pp.label,
    totalSalesInr: 0,
    srfSalesInr: 0,
    quickBillSalesInr: 0,
    purchaseInr: 0,
    srfOpened: 0,
    srfClosed: 0,
  };

  if (needQbSales) {
    const p: unknown[] = [pp.prevFrom, pp.prevTo];
    const scope = scopeRegion(actor, p, "qb.region_id", filters);
    const r = await pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(qb.total_inr), 0)::float8 AS total FROM quick_bills qb
       WHERE ${sqlTsBetween("qb.created_at", 1, 2)} AND ${scope}`,
      p,
    );
    compare.quickBillSalesInr = Number(r.rows[0]?.total ?? 0);
  }
  if (needSrfSales) {
    const p: unknown[] = [pp.prevFrom, pp.prevTo];
    const scope = scopeRegion(actor, p, "COALESCE(NULLIF(si.region_id, ''), sj.region_id)", filters);
    const r = await pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(si.total_inr), 0)::float8 AS total
       FROM service_invoices si
       LEFT JOIN srf_jobs sj ON sj.id::text = si.source_id AND si.source_type IN ('srf_store', 'inter_ho_repair')
       WHERE si.source_type IN ('srf_store', 'inter_ho_repair')
         AND ${sqlDateBetween(`COALESCE(si.invoice_date, ${sqlIstDate("si.created_at")})`, 1, 2)}
         AND ${scope}`,
      p,
    );
    compare.srfSalesInr = Number(r.rows[0]?.total ?? 0);
  }
  if (needGrn) {
    const p: unknown[] = [pp.prevFrom, pp.prevTo];
    const scope = scopeRegion(actor, p, "g.region_id", filters);
    const r = await pool.query<{ total: string }>(
      `SELECT COALESCE(SUM((gi.qty_received * gi.cost_price) + COALESCE(gi.tax_amount, 0)), 0)::float8 AS total
       FROM grn_items gi JOIN grns g ON g.id = gi.grn_id
       WHERE ${sqlDateBetween(`COALESCE(g.invoice_date, ${sqlIstDate("g.created_at")})`, 1, 2)} AND ${scope}`,
      p,
    );
    compare.purchaseInr = Number(r.rows[0]?.total ?? 0);
  }
  if (needSrfPipeline) {
    const openP: unknown[] = [pp.prevFrom, pp.prevTo];
    const openScope = scopeRegion(actor, openP, "sj.region_id", filters);
    const opened = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*)::int AS cnt FROM srf_jobs sj
       WHERE ${SRF_NOT_ARCHIVED} AND ${sqlTsBetween("sj.created_at", 1, 2)} AND ${openScope}`,
      openP,
    );
    compare.srfOpened = Number(opened.rows[0]?.cnt ?? 0);
    const closedP: unknown[] = [pp.prevFrom, pp.prevTo];
    const closedScope = scopeRegion(actor, closedP, "sj.region_id", filters);
    const closed = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*)::int AS cnt FROM srf_jobs sj
       WHERE ${SRF_NOT_ARCHIVED} AND sj.status = 'closed'
         AND ${sqlTsBetween("COALESCE(sj.closed_at, sj.updated_at)", 1, 2)} AND ${closedScope}`,
      closedP,
    );
    compare.srfClosed = Number(closed.rows[0]?.cnt ?? 0);
  }
  compare.totalSalesInr = round2(compare.srfSalesInr + compare.quickBillSalesInr);

  const b2bB2cByChannel = [
    { name: "SRF · B2B", value: round2(srfB2b) },
    { name: "SRF · B2C", value: round2(srfB2c) },
    { name: "Quick bill · B2B", value: round2(qbB2b) },
    { name: "Quick bill · B2C", value: round2(qbB2c) },
  ].filter((x) => x.value > 0);

  return {
    filters,
    kpis,
    derived,
    compare,
    salesTrend,
    salesByMonth,
    purchaseByMonth,
    srfStatusBreakdown,
    srfPipelineBuckets,
    srfOpenedByMonth,
    srfClosedByMonth,
    salesByStore,
    salesByRegion,
    b2bVsB2c:
      view === "b2b_b2c" || view === "sales"
        ? [
            { name: "B2B", value: kpis.b2bSalesInr },
            { name: "B2C", value: kpis.b2cSalesInr },
          ].filter((x) => x.value > 0)
        : [],
    srfVsQuickBill:
      view === "sales" || view === "margin"
        ? [
            { name: "SRF billing", value: kpis.srfSalesInr },
            { name: "Quick bill", value: kpis.quickBillSalesInr },
          ].filter((x) => x.value > 0)
        : [],
    paymentModes,
    purchaseByVendor,
    purchaseByHsn,
    quickBillTrend,
    srfSalesTrend,
    b2bB2cByChannel: view === "b2b_b2c" ? b2bB2cByChannel : [],
    srfByBrand: view === "srf" ? srfByBrand : [],
    quickBillByBrand: view === "quick_bill" ? quickBillByBrand : [],
    storeDetail: view === "store" ? storeDetail : [],
  };
}
