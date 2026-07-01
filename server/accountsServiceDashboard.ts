import type { Pool } from "pg";
import type { DemoUser } from "../src/types/user";
import { canAccessAnalytics } from "./analyticsDashboard";

const REPORT_TZ = "Asia/Kolkata";

export type ServiceOutcomeKey = "same_ho" | "other_ho" | "online_store" | "send_to_brand" | "cannot_repair";

export type AccountsServiceDashboardFilters = {
  from: string;
  to: string;
  regionId?: string;
};

export type ServiceOutcomeStat = {
  key: ServiceOutcomeKey;
  label: string;
  closedCount: number;
  activeCount: number;
};

export type AccountsServiceDashboardData = {
  filters: AccountsServiceDashboardFilters;
  pendingCreditNotes: number;
  outcomeStats: ServiceOutcomeStat[];
  outcomeClosedChart: { name: string; value: number }[];
};

export type BrandCreditHistoryRow = {
  id: string;
  reference: string;
  customerName: string;
  phone: string;
  watchBrand: string;
  watchModel: string;
  serial: string;
  regionName: string | null;
  storeName: string | null;
  brandInvoiceRef: string | null;
  brandInvoiceMeta: Record<string, unknown> | null;
  brandCouponCode: string | null;
  brandCouponValueInr: number | null;
  brandCouponValidUntil: string | null;
  brandCouponReceivedAt: string | null;
  brandCreditNoteApprovedAt: string | null;
  brandCreditNoteApprovedBy: string | null;
  closedAt: string | null;
  createdAt: string;
};

const OUTCOME_LABELS: Record<ServiceOutcomeKey, string> = {
  same_ho: "Repaired at same HO",
  other_ho: "Sent to other HO",
  online_store: "Online store (spares)",
  send_to_brand: "Sent to brand",
  cannot_repair: "Cannot repair",
};

const SRF_NOT_ARCHIVED = `j.reference NOT LIKE '%-ARCH-%'`;

function parseFilters(query: Record<string, unknown>): AccountsServiceDashboardFilters {
  let from =
    String(query.from ?? "").trim() || new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  let to = String(query.to ?? "").trim() || new Date().toISOString().slice(0, 10);
  if (from > to) [from, to] = [to, from];
  const regionId = String(query.regionId ?? "").trim() || undefined;
  return { from, to, regionId };
}

function sqlIstDate(tsColumn: string): string {
  return `(${tsColumn} AT TIME ZONE '${REPORT_TZ}')::date`;
}

function scopeRegion(
  actor: DemoUser,
  params: unknown[],
  regionExpr: string,
  filters: AccountsServiceDashboardFilters,
): string {
  const regionId = filters.regionId ?? (actor.role === "super_admin" ? "" : actor.regionId ?? "");
  if (regionId) {
    params.push(regionId);
    return `${regionExpr} = $${params.length}`;
  }
  if (actor.role === "super_admin" || actor.role === "admin") return "TRUE";
  if (actor.regionId) {
    params.push(actor.regionId);
    return `${regionExpr} = $${params.length}`;
  }
  return "FALSE";
}

const OUTCOME_CASE_SQL = `CASE
  WHEN j.brand_credit_note_approved_at IS NOT NULL OR EXISTS (
    SELECT 1 FROM srf_action_log a
    WHERE a.srf_id = j.id AND a.action IN (
      'brand_return_without_repair',
      'inter_ho_return_without_repair',
      'store_self_return_without_repair',
      'brand_outward_no_repair'
    )
  ) THEN 'cannot_repair'
  WHEN EXISTS (
    SELECT 1 FROM srf_action_log a
    WHERE a.srf_id = j.id AND a.action IN (
      'technician_recommend_brand',
      'brand_confirm_dispatch',
      'brand_clerk_log_dispatch',
      'brand_return_received',
      'brand_invoice_logged',
      'brand_estimate_received',
      'brand_mail_acknowledged'
    )
  ) THEN 'send_to_brand'
  WHEN EXISTS (
    SELECT 1 FROM srf_action_log a
    WHERE a.srf_id = j.id AND a.action IN ('supervisor_transfer_other_ho', 'convert_to_local_close_source', 'convert_to_local_new_child')
  ) OR j.status = 'sent_to_other_ho' THEN 'other_ho'
  WHEN EXISTS (
    SELECT 1 FROM srf_inter_ho_spare_orders o WHERE o.srf_id = j.id
  ) THEN 'online_store'
  ELSE 'same_ho'
END`;

export function canAccessAccountsServiceDashboard(actor: DemoUser | null): boolean {
  return canAccessAnalytics(actor);
}

export function canAccessBrandCreditHistory(actor: DemoUser | null): boolean {
  return (
    canAccessAnalytics(actor) ||
    (!!actor &&
      (actor.role === "ho_accounts" ||
        actor.role === "store_accounts" ||
        actor.role === "super_admin" ||
        actor.role === "admin"))
  );
}

export function parseAccountsServiceDashboardQuery(
  query: Record<string, unknown>,
): AccountsServiceDashboardFilters {
  return parseFilters(query);
}

export async function fetchAccountsServiceDashboard(
  pool: Pool,
  actor: DemoUser,
  filters: AccountsServiceDashboardFilters,
): Promise<AccountsServiceDashboardData> {
  const pendingParams: unknown[] = [];
  const pendingScope = scopeRegion(actor, pendingParams, "j.region_id", filters);
  const pendingRes = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*)::int AS cnt
     FROM srf_jobs j
     WHERE ${SRF_NOT_ARCHIVED}
       AND j.status = 'brand_credit_note_pending'
       AND j.brand_coupon_value_inr IS NOT NULL
       AND j.brand_coupon_value_inr > 0
       AND ${pendingScope}`,
    pendingParams,
  );
  const pendingCreditNotes = Number(pendingRes.rows[0]?.cnt ?? 0);

  const closedParams: unknown[] = [filters.from, filters.to];
  const closedScope = scopeRegion(actor, closedParams, "j.region_id", filters);
  const closedRes = await pool.query<{ outcome: ServiceOutcomeKey; cnt: string }>(
    `SELECT outcome, COUNT(*)::int AS cnt FROM (
       SELECT ${OUTCOME_CASE_SQL} AS outcome
       FROM srf_jobs j
       WHERE ${SRF_NOT_ARCHIVED}
         AND j.status = 'closed'
         AND ${sqlIstDate("COALESCE(j.closed_at, j.updated_at)")} >= $1::date
         AND ${sqlIstDate("COALESCE(j.closed_at, j.updated_at)")} <= $2::date
         AND ${closedScope}
     ) x
     GROUP BY outcome`,
    closedParams,
  );
  const closedMap = new Map<ServiceOutcomeKey, number>();
  for (const row of closedRes.rows) {
    closedMap.set(row.outcome, Number(row.cnt));
  }

  const activeParams: unknown[] = [];
  const activeScope = scopeRegion(actor, activeParams, "j.region_id", filters);
  const activeRes = await pool.query<{ outcome: ServiceOutcomeKey; cnt: string }>(
    `SELECT outcome, COUNT(*)::int AS cnt FROM (
       SELECT CASE
         WHEN j.status = 'brand_credit_note_pending' OR j.status = 'brand_credit_note_active' THEN 'cannot_repair'
         WHEN j.status IN (
           'sent_to_brand','brand_estimate_pending','brand_estimate_customer_pending',
           'brand_estimate_customer_accepted','brand_approved','brand_repair_in_progress',
           'received_from_brand','brand_outward_pending','brand_dispatch_pending'
         ) THEN 'send_to_brand'
         WHEN j.status = 'sent_to_other_ho' THEN 'other_ho'
         WHEN EXISTS (SELECT 1 FROM srf_inter_ho_spare_orders o WHERE o.srf_id = j.id AND o.status = 'REQUESTED') THEN 'online_store'
         WHEN j.status IN (
           'received_at_sc','assigned','estimate_ok','reestimate_required','customer_rejected',
           'inter_ho_reestimate_pending_sender','inter_ho_reestimate_customer_accepted',
           'inter_ho_brand_estimate_pending_sender','inter_ho_brand_estimate_customer_accepted',
           'ready_for_outward','dispatched_to_store'
         ) THEN 'same_ho'
         ELSE NULL
       END AS outcome
       FROM srf_jobs j
       WHERE ${SRF_NOT_ARCHIVED}
         AND j.status NOT IN ('closed', 'cancelled', 'draft', 'photo_pending', 'at_store',
           'store_self_pending','store_self_assigned','store_self_working','in_transit_sc','received_at_store')
         AND ${activeScope}
     ) x
     WHERE outcome IS NOT NULL
     GROUP BY outcome`,
    activeParams,
  );
  const activeMap = new Map<ServiceOutcomeKey, number>();
  for (const row of activeRes.rows) {
    activeMap.set(row.outcome, Number(row.cnt));
  }

  const outcomeKeys: ServiceOutcomeKey[] = [
    "same_ho",
    "other_ho",
    "online_store",
    "send_to_brand",
    "cannot_repair",
  ];
  const outcomeStats: ServiceOutcomeStat[] = outcomeKeys.map((key) => ({
    key,
    label: OUTCOME_LABELS[key],
    closedCount: closedMap.get(key) ?? 0,
    activeCount: activeMap.get(key) ?? 0,
  }));

  return {
    filters,
    pendingCreditNotes,
    outcomeStats,
    outcomeClosedChart: outcomeStats
      .filter((s) => s.closedCount > 0)
      .map((s) => ({ name: s.label, value: s.closedCount })),
  };
}

export async function fetchBrandCreditHistory(
  pool: Pool,
  actor: DemoUser,
  filters: AccountsServiceDashboardFilters,
  queryText?: string,
): Promise<{ filters: AccountsServiceDashboardFilters; rows: BrandCreditHistoryRow[] }> {
  const params: unknown[] = [filters.from, filters.to];
  const scope = scopeRegion(actor, params, "j.region_id", filters);
  const q = String(queryText ?? "").trim().toLowerCase();
  let searchSql = "";
  if (q) {
    params.push(`%${q}%`);
    const idx = params.length;
    searchSql = `AND (
      LOWER(j.reference) LIKE $${idx}
      OR LOWER(j.customer_name) LIKE $${idx}
      OR j.phone LIKE $${idx}
      OR LOWER(j.brand_coupon_code) LIKE $${idx}
      OR LOWER(COALESCE(j.brand_invoice_ref, '')) LIKE $${idx}
      OR LOWER(j.watch_brand || ' ' || j.watch_model) LIKE $${idx}
    )`;
  }

  const { rows } = await pool.query<BrandCreditHistoryRow>(
    `SELECT j.id,
            j.reference,
            j.customer_name AS "customerName",
            j.phone,
            j.watch_brand AS "watchBrand",
            j.watch_model AS "watchModel",
            j.serial,
            r.name AS "regionName",
            st.name AS "storeName",
            j.brand_invoice_ref AS "brandInvoiceRef",
            j.brand_invoice_meta AS "brandInvoiceMeta",
            j.brand_coupon_code AS "brandCouponCode",
            j.brand_coupon_value_inr::float8 AS "brandCouponValueInr",
            j.brand_coupon_valid_until AS "brandCouponValidUntil",
            j.brand_coupon_received_at AS "brandCouponReceivedAt",
            j.brand_credit_note_approved_at AS "brandCreditNoteApprovedAt",
            j.brand_credit_note_approved_by AS "brandCreditNoteApprovedBy",
            j.closed_at AS "closedAt",
            j.created_at AS "createdAt"
     FROM srf_jobs j
     LEFT JOIN regions r ON r.id = j.region_id
     LEFT JOIN stores st ON st.id = j.store_id
     WHERE ${SRF_NOT_ARCHIVED}
       AND j.status = 'closed'
       AND j.brand_credit_note_approved_at IS NOT NULL
       AND ${sqlIstDate("j.brand_credit_note_approved_at")} >= $1::date
       AND ${sqlIstDate("j.brand_credit_note_approved_at")} <= $2::date
       AND ${scope}
       ${searchSql}
     ORDER BY j.brand_credit_note_approved_at DESC
     LIMIT 500`,
    params,
  );

  return { filters, rows };
}
