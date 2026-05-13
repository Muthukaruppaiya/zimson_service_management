import type { Express, NextFunction, Request, Response } from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import type { Pool, PoolClient } from "pg";
import { APP_PAYMENT_MODES, sumAdvanceCashDenominations, type AdvancePaymentDetails } from "../src/lib/paymentModes";
import type { DemoUser, UserRole } from "../src/types/user";
import { sendReestimateDecisionNotification, sendTrackingLink } from "./notificationService";
import { resolvePublicAppBaseUrl } from "./publicAppUrl";
import { appendStockHistory } from "./db/stockHistory";
import { allocateStoreInvoiceNumber } from "./storeInvoiceNumber";

type Authed = Request & { userId: string };

export type InAppNotifier = (
  userIds: string[],
  payload: { title: string; message: string; category: string },
) => Promise<void>;

const STORE_ROLES = new Set<UserRole>([
  "store_user",
  "store_user",
  "store_manager",
  "store_accounts",
]);
const HO_SC_ROLES = new Set<UserRole>([
  "super_admin",
  "admin",
  "admin",
  "ho_manager",
  "ho_purchase",
  "service_centre_clerk",
  "service_centre_supervisor",
  "service_centre_clerk",
  "service_centre_clerk",
  "technician",
]);

const SC_DC_INWARD_ROLES = new Set<UserRole>([
  "super_admin",
  "admin",
  "admin",
  "ho_manager",
  "service_centre_clerk",
  "service_centre_clerk",
]);

const SC_ODC_OUTWARD_ROLES = new Set<UserRole>([
  "super_admin",
  "admin",
  "admin",
  "ho_manager",
  "service_centre_clerk",
  "service_centre_clerk",
]);

function canSupervisorDecide(actor: DemoUser | null): boolean {
  if (!actor) return false;
  const role = String(actor.role ?? "").trim().toLowerCase();
  return (
    role === "service_centre_supervisor" ||
    role === "sc_supervisor" ||
    role === "service centre supervisor" ||
    role === "service_centre_clerk" ||
    role === "sc_clerk" ||
    role === "ho_manager" ||
    role === "ho_manager" ||
    role === "admin" ||
    role === "super_admin" ||
    role === "admin"
  );
}

function canManageBrandDesk(actor: DemoUser | null): boolean {
  return !!actor && (actor.role === "service_centre_supervisor" || actor.role === "super_admin" || actor.role === "admin");
}

function toJsonMeta(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

const SRF_UPLOAD_ROOT = path.resolve(process.cwd(), "uploads", "srf");
fs.mkdirSync(SRF_UPLOAD_ROOT, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, SRF_UPLOAD_ROOT),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").slice(0, 10) || ".jpg";
      cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
});

function roleCanCreateDraft(actor: DemoUser): boolean {
  return STORE_ROLES.has(actor.role) || actor.role === "super_admin" || actor.role === "admin";
}

function roleCanView(actor: DemoUser): boolean {
  return roleCanCreateDraft(actor) || HO_SC_ROLES.has(actor.role);
}

function visibleWhere(actor: DemoUser, idxStart = 1): { sql: string; params: unknown[]; nextIdx: number } {
  let i = idxStart;
  if (actor.role === "super_admin" || actor.role === "admin") {
    return { sql: "1=1", params: [], nextIdx: i };
  }
  if (STORE_ROLES.has(actor.role)) {
    return {
      sql: `(j.store_id = $${i++}::text OR j.destination_store_id = $${i++}::text)`,
      params: [actor.storeId, actor.storeId],
      nextIdx: i,
    };
  }
  return { sql: "j.region_id = $" + i + "::text", params: [actor.regionId], nextIdx: i + 1 };
}

async function getSeriesPrefixSuffix(
  client: PoolClient,
  doc: "srf" | "dc" | "odc",
  fallbackPrefix: string,
): Promise<{ prefix: string; suffix: string }> {
  const prefixColumn = doc === "srf" ? "srf_prefix" : doc === "dc" ? "dc_prefix" : "odc_prefix";
  const suffixColumn = doc === "srf" ? "srf_suffix" : doc === "dc" ? "dc_suffix" : "odc_suffix";
  const { rows } = await client.query<{ prefix: string; suffix: string }>(
    `SELECT ${prefixColumn} AS prefix, ${suffixColumn} AS suffix
     FROM service_tax_settings
     WHERE id = 1`,
  );
  return {
    prefix: String(rows[0]?.prefix ?? fallbackPrefix).trim() || fallbackPrefix,
    suffix: String(rows[0]?.suffix ?? "").trim(),
  };
}

async function nextDocNumber(client: PoolClient, prefix: string, suffix: string, scopeCode: string): Promise<string> {
  const yy = String(new Date().getFullYear()).slice(-2);
  const seq = await client.query<{ last_value: number }>(
    `INSERT INTO number_sequences (prefix, scope_code, year_2, last_value)
     VALUES ($1, $2, $3, 1001)
     ON CONFLICT (prefix, scope_code, year_2)
     DO UPDATE SET last_value = number_sequences.last_value + 1
     RETURNING last_value`,
    [prefix, scopeCode, yy],
  );
  const num = String(seq.rows[0]?.last_value ?? 1001).padStart(4, "0");
  return `${prefix}${yy}${scopeCode}${num}${suffix}`;
}

function scopeCode(code: string, fallback: string, maxLen = 3): string {
  return (code || fallback)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, maxLen)
    .padEnd(maxLen, "0");
}

function srfStoreScopeCode(storeName: string | null | undefined, storeId: string): string {
  const normalizedName = String(storeName ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .trim();
  const parts = normalizedName.split(/\s+/).filter(Boolean);
  const preferred = parts.find((p) => /[A-Z]{2,}[0-9]{0,3}/.test(p) && p.length >= 3);
  if (preferred) return scopeCode(preferred, "STR", 6);
  const compactName = normalizedName.replace(/\s+/g, "");
  if (compactName.length >= 3) return scopeCode(compactName, "STR", 6);
  const idTail = String(storeId ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(-6);
  if (idTail.length >= 3) return scopeCode(idTail, "STR", 6);
  return scopeCode("STR", "STR", 6);
}

function tokenHash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function phoneLast10(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

async function getOrCreateTrackingToken(client: PoolClient, phone: string): Promise<string> {
  const p10 = phoneLast10(phone);
  if (!p10) throw new Error("Invalid customer phone for tracking.");
  const openRows = await client.query<{ c: number }>(
    `SELECT COUNT(*)::int AS c
     FROM srf_jobs
     WHERE RIGHT(regexp_replace(phone, '\D', '', 'g'), 10) = $1
       AND status NOT IN ('closed', 'cancelled')`,
    [p10],
  );
  const hasOpenSrf = (openRows.rows[0]?.c ?? 0) > 0;
  const existing = await client.query<{ token_plain: string }>(
    `SELECT token_plain
     FROM customer_tracking_tokens
     WHERE phone_last10 = $1
       AND is_active = true
       AND disabled_at IS NULL
     LIMIT 1`,
    [p10],
  );
  if (existing.rows[0]?.token_plain && hasOpenSrf) return existing.rows[0].token_plain;

  const token = crypto.randomBytes(24).toString("hex");
  await client.query(
    `INSERT INTO customer_tracking_tokens (token_plain, token_hash, phone_last10, is_active)
     VALUES ($1, $2, $3, true)
     ON CONFLICT (phone_last10) DO UPDATE SET
       token_plain = EXCLUDED.token_plain,
       token_hash = EXCLUDED.token_hash,
       is_active = true,
       disabled_at = NULL`,
    [token, tokenHash(token), p10],
  );
  return token;
}

async function maybeDisableTrackingToken(client: PoolClient, phone: string): Promise<void> {
  const p10 = phoneLast10(phone);
  if (!p10) return;
  const openRows = await client.query<{ c: number }>(
    `SELECT COUNT(*)::int AS c
     FROM srf_jobs
     WHERE RIGHT(regexp_replace(phone, '\D', '', 'g'), 10) = $1
       AND status NOT IN ('closed', 'cancelled')`,
    [p10],
  );
  if ((openRows.rows[0]?.c ?? 0) > 0) return;
  await client.query(
    `UPDATE customer_tracking_tokens
     SET is_active = false, disabled_at = now()
     WHERE phone_last10 = $1`,
    [p10],
  );
}

async function appendStatusHistory(
  client: PoolClient,
  srfId: string,
  status: string,
  changedBy: string | null,
  note: string,
): Promise<void> {
  await client.query(
    `INSERT INTO srf_status_history (srf_id, status, note, changed_by)
     VALUES ($1::uuid, $2, $3, $4)`,
    [srfId, status, note, changedBy],
  );
}

type ActionLogInput = {
  action: string;
  description: string;
  details?: unknown;
  amountInr?: number | null;
  referenceDoc?: string | null;
  actor?: DemoUser | null;
  actorOverride?: { id?: string | null; role?: string | null; name?: string | null };
};

type Queryable = Pool | PoolClient;

async function appendActionLog(executor: Queryable, srfId: string, input: ActionLogInput): Promise<void> {
  const actorId = input.actorOverride?.id ?? input.actor?.id ?? null;
  const actorRole = input.actorOverride?.role ?? input.actor?.role ?? null;
  const actorName = input.actorOverride?.name ?? input.actor?.displayName ?? null;
  await executor.query(
    `INSERT INTO srf_action_log
       (srf_id, action, description, details, amount_inr, reference_doc, actor_id, actor_role, actor_name)
     VALUES ($1::uuid, $2, $3, $4::jsonb, $5, $6, $7, $8, $9)`,
    [
      srfId,
      input.action,
      input.description,
      input.details === undefined ? null : JSON.stringify(input.details),
      input.amountInr ?? null,
      input.referenceDoc ?? null,
      actorId,
      actorRole,
      actorName,
    ],
  );
}

async function startReestimateAttempt(
  client: PoolClient,
  srfId: string,
  payload: { amountInr: number; remark: string; raisedBy: DemoUser | null },
): Promise<{ id: string; attemptNo: number }> {
  await client.query(
    `UPDATE srf_reestimate_attempts
       SET closed_at = COALESCE(closed_at, now())
     WHERE srf_id = $1::uuid AND closed_at IS NULL`,
    [srfId],
  );
  const { rows } = await client.query<{ next_no: number }>(
    `SELECT COALESCE(MAX(attempt_no), 0) + 1 AS next_no
       FROM srf_reestimate_attempts
      WHERE srf_id = $1::uuid`,
    [srfId],
  );
  const attemptNo = rows[0]?.next_no ?? 1;
  const ins = await client.query<{ id: string }>(
    `INSERT INTO srf_reestimate_attempts
       (srf_id, attempt_no, amount_inr, remark, raised_by_id, raised_by_role, raised_by_name)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      srfId,
      attemptNo,
      payload.amountInr,
      payload.remark,
      payload.raisedBy?.id ?? null,
      payload.raisedBy?.role ?? null,
      payload.raisedBy?.displayName ?? null,
    ],
  );
  return { id: ins.rows[0]!.id, attemptNo };
}

async function recordReestimateCustomerResponse(
  client: PoolClient,
  srfId: string,
  payload: { response: "accepted" | "rejected"; note: string },
): Promise<void> {
  await client.query(
    `UPDATE srf_reestimate_attempts
       SET customer_response = $2::varchar,
           customer_response_at = now(),
           customer_response_note = $3,
           closed_at = CASE WHEN $2::varchar = 'accepted' THEN now() ELSE closed_at END
     WHERE id = (
       SELECT id FROM srf_reestimate_attempts
        WHERE srf_id = $1::uuid AND customer_response IS NULL
        ORDER BY attempt_no DESC
        LIMIT 1
     )`,
    [srfId, payload.response, payload.note],
  );
}

async function recordSupervisorFollowup(
  client: PoolClient,
  srfId: string,
  payload: { followup: "negotiate" | "move_to_odc"; note: string; actor: DemoUser | null },
): Promise<void> {
  await client.query(
    `UPDATE srf_reestimate_attempts
       SET supervisor_followup = $2::varchar,
           supervisor_followup_note = $3,
           supervisor_followup_at = now(),
           supervisor_followup_by_id = $4,
           supervisor_followup_by_name = $5,
           closed_at = CASE WHEN $2::varchar = 'move_to_odc' THEN now() ELSE closed_at END
     WHERE id = (
       SELECT id FROM srf_reestimate_attempts
        WHERE srf_id = $1::uuid AND customer_response = 'rejected'
        ORDER BY attempt_no DESC
        LIMIT 1
     )`,
    [
      srfId,
      payload.followup,
      payload.note,
      payload.actor?.id ?? null,
      payload.actor?.displayName ?? null,
    ],
  );
}

function ensurePhotoTokenSession(row: {
  id: string;
  status: string;
  revoked_at: Date | null;
  expires_at: Date;
  capture_link_disabled_at: Date | null;
} | undefined): string | null {
  if (!row) return "Invalid upload token.";
  if (row.capture_link_disabled_at) return "This photo link is already disabled.";
  if (row.revoked_at) return "This photo link has been revoked.";
  if (new Date(row.expires_at).getTime() < Date.now()) return "This photo link has expired.";
  if (row.status !== "draft" && row.status !== "photo_pending") return "This SRF is already finalized.";
  return null;
}

function normalizePhotoKind(input: string): "front" | "back" | "strap" | "serial" | "damage" | "other" {
  const v = input.trim().toLowerCase();
  if (v === "front" || v === "back" || v === "strap" || v === "serial" || v === "damage") return v;
  return "other";
}

function parseReestimateEntry(
  note: string,
  changedAt: string,
): { amountInr: number | null; note: string; requestedAt: string } {
  const raw = String(note ?? "").trim();
  const m = raw.match(/^Re-estimate INR\s+([0-9]+(?:\.[0-9]+)?)\s*:\s*(.*)$/i);
  if (!m) {
    return { amountInr: null, note: raw, requestedAt: changedAt };
  }
  return {
    amountInr: Number(m[1]),
    note: String(m[2] ?? "").trim(),
    requestedAt: changedAt,
  };
}

function canManageInterHoSpareOrders(actor: DemoUser | null): boolean {
  if (!actor) return false;
  return actor.role === "service_centre_supervisor" || actor.role === "admin" || actor.role === "super_admin" || actor.role === "ho_manager";
}

async function nextSpareOrderNumber(client: PoolClient): Promise<string> {
  for (let i = 0; i < 8; i += 1) {
    const now = new Date();
    const y = now.getFullYear().toString().slice(-2);
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const rand = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, "0");
    const candidate = `SPO${y}${m}${d}${rand}`;
    const exists = await client.query<{ id: string }>(
      `SELECT id FROM srf_inter_ho_spare_orders WHERE order_number = $1 LIMIT 1`,
      [candidate],
    );
    if (!exists.rows[0]) return candidate;
  }
  return `SPO${Date.now()}`;
}

export function registerSrfRoutes(
  app: Express,
  pool: Pool,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
  getUserById: (id: string) => DemoUser | null,
  pushInApp?: InAppNotifier,
): void {
  app.get("/api/service/srf-jobs", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    if (!roleCanView(actor)) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
    const statusQ = String(req.query.status ?? "").trim();
    const dcQ = String(req.query.dcNumber ?? "").trim();
    const odcQ = String(req.query.outwardDcNumber ?? "").trim();
    const regionQ = String(req.query.regionId ?? "").trim();
    try {
      const scope = visibleWhere(actor);
      let where = `WHERE ${scope.sql}`;
      const params: unknown[] = [...scope.params];
      let i = scope.nextIdx;
      if (statusQ) {
        params.push(statusQ);
        where += ` AND j.status = $${i++}`;
      }
      if (dcQ) {
        params.push(dcQ);
        where += ` AND j.dc_number = $${i++}`;
      }
      if (odcQ) {
        params.push(odcQ);
        where += ` AND j.outward_dc_number = $${i++}`;
      }
      if (regionQ && (actor.role === "super_admin" || actor.role === "admin")) {
        params.push(regionQ);
        where += ` AND j.region_id = $${i++}::text`;
      }
      const { rows } = await pool.query(
        `SELECT j.id,
                j.reference,
                j.region_id AS "regionId",
                j.store_id AS "storeId",
                j.customer_name AS "customerName",
                j.phone,
                j.customer_kind AS "customerKind",
                j.company,
                j.watch_brand AS "watchBrand",
                j.watch_model AS "watchModel",
                j.serial,
                j.complaint,
                j.estimate_total_inr::float8 AS "estimateTotalInr",
                j.estimated_finish_date::text AS "estimatedFinishDate",
                j.advance_inr::float8 AS "advanceInr",
                j.advance_payment_mode AS "advancePaymentMode",
                j.advance_payment_details AS "advancePaymentDetails",
                j.selected_part_ids AS "selectedPartIds",
                j.status,
                j.dc_number AS "dcNumber",
                j.dispatched_to_sc_at AS "dispatchedToScAt",
                j.inward_at AS "inwardAt",
                j.assigned_technician_id AS "assignedTechnicianId",
                j.assigned_at AS "assignedAt",
                j.estimate_ok_at AS "estimateOkAt",
                j.reestimate_requested_note AS "reestimateRequestedNote",
                j.reestimate_requested_inr::float8 AS "reestimateRequestedInr",
                j.reestimate_requested_at AS "reestimateRequestedAt",
                j.reestimate_approved_note AS "reestimateApprovedNote",
                j.reestimate_approved_at AS "reestimateApprovedAt",
                j.customer_reestimate_response AS "customerReestimateResponse",
                j.customer_reestimate_responded_at AS "customerReestimateRespondedAt",
                (
                  SELECT ctt.token_plain
                  FROM customer_tracking_tokens ctt
                  WHERE ctt.phone_last10 = RIGHT(regexp_replace(j.phone, '\D', '', 'g'), 10)
                    AND ctt.is_active = true
                    AND ctt.disabled_at IS NULL
                  LIMIT 1
                ) AS "trackingToken",
                j.used_spares AS "usedSpares",
                j.spares_slip_submitted_at AS "sparesSlipSubmittedAt",
                j.spares_slip_submitted_by AS "sparesSlipSubmittedBy",
                j.ho_spares_bill_ref AS "hoSparesBillRef",
                j.store_bill_ref AS "storeBillRef",
                j.completed_at_sc AS "completedAtSc",
                j.ready_for_outward_at AS "readyForOutwardAt",
                j.destination_store_id AS "destinationStoreId",
                j.outward_dc_number AS "outwardDcNumber",
                j.dispatched_to_store_at AS "dispatchedToStoreAt",
                j.received_back_at_store_at AS "receivedBackAtStoreAt",
                j.closed_at AS "closedAt",
                j.photo_session_active AS "photoSessionActive",
                j.capture_link_disabled_at AS "captureLinkDisabledAt",
                j.requires_local_conversion AS "requiresLocalConversion",
                j.transfer_target_region_id AS "transferTargetRegionId",
                j.transfer_target_store_id AS "transferTargetStoreId",
                j.transfer_source_region_id AS "transferSourceRegionId",
                j.transfer_source_store_id AS "transferSourceStoreId",
                j.transfer_source_reference AS "transferSourceReference",
                j.brand_sent_at AS "brandSentAt",
                j.brand_dispatch_ref AS "brandDispatchRef",
                j.brand_dispatch_note AS "brandDispatchNote",
                j.brand_dispatch_doc_path AS "brandDispatchDocPath",
                j.brand_odc_number AS "brandOdcNumber",
                j.brand_inward_ref AS "brandInwardRef",
                j.brand_estimate_inr::float8 AS "brandEstimateInr",
                j.brand_estimate_currency AS "brandEstimateCurrency",
                j.brand_estimate_received_at AS "brandEstimateReceivedAt",
                j.brand_estimate_email_meta AS "brandEstimateEmailMeta",
                j.brand_ho_approval_sent_at AS "brandHoApprovalSentAt",
                j.brand_ho_approval_email_meta AS "brandHoApprovalEmailMeta",
                j.brand_return_received_at AS "brandReturnReceivedAt",
                j.brand_invoice_ref AS "brandInvoiceRef",
                j.brand_invoice_amount_inr::float8 AS "brandInvoiceAmountInr",
                j.brand_invoice_meta AS "brandInvoiceMeta",
                j.brand_coupon_code AS "brandCouponCode",
                j.brand_coupon_value_inr::float8 AS "brandCouponValueInr",
                j.brand_coupon_received_at AS "brandCouponReceivedAt",
                j.brand_coupon_valid_until AS "brandCouponValidUntil",
                j.customer_coupon_notified_at AS "customerCouponNotifiedAt",
                j.customer_coupon_notify_channels AS "customerCouponNotifyChannels",
                j.created_by AS "createdBy",
                j.modified_by AS "modifiedBy",
                j.created_at AS "createdAt",
                j.updated_at AS "updatedAt",
                r.name AS "regionName",
                s.name AS "storeName",
                ds.name AS "destinationStoreName",
                COALESCE((
                  SELECT json_agg(
                    json_build_object(
                      'id', p.id,
                      'photoKind', p.photo_kind,
                      'filePath', p.file_path,
                      'mime', p.mime,
                      'bytes', p.bytes,
                      'createdAt', p.created_at
                    ) ORDER BY p.created_at DESC
                  )
                  FROM srf_job_photos p
                  WHERE p.srf_id = j.id
                ), '[]'::json) AS photos,
                COALESCE((
                  SELECT COUNT(*)::int FROM srf_job_photos p WHERE p.srf_id = j.id
                ), 0) AS "photoCount"
         FROM srf_jobs j
         JOIN regions r ON r.id = j.region_id
         JOIN stores s ON s.id = j.store_id
         LEFT JOIN stores ds ON ds.id = j.destination_store_id
         ${where}
         ORDER BY j.created_at DESC`,
        params,
      );
      const baseUrl = resolvePublicAppBaseUrl(req);
      const jobs = rows.map((r) => {
        const trackingToken = (r as { trackingToken?: string | null }).trackingToken;
        return {
          ...r,
          trackingUrl: trackingToken ? `${baseUrl}/track?t=${encodeURIComponent(trackingToken)}` : null,
        };
      });
      res.json({ jobs });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to load SRFs." });
    }
  });

  app.get("/api/service/srf-jobs/:srfId/status-history", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || !roleCanView(actor)) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
    try {
      const { rows } = await pool.query(
        `SELECT h.id,
                h.status,
                h.note,
                h.changed_by AS "changedBy",
                u.display_name AS "changedByName",
                u.role AS "changedByRole",
                h.changed_at AS "changedAt"
         FROM srf_status_history h
         LEFT JOIN app_users u ON u.id = h.changed_by
         WHERE h.srf_id = $1::uuid
         ORDER BY h.changed_at DESC`,
        [req.params.srfId],
      );
      res.json({ rows });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Could not load status history." });
    }
  });

  app.get("/api/service/srf-jobs/:srfId/trace", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || !roleCanView(actor)) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
    const srfId = String(req.params.srfId ?? "").trim();
    if (!srfId) {
      res.status(400).json({ error: "Invalid SRF id." });
      return;
    }
    try {
      const jobRes = await pool.query<{
        id: string;
        reference: string;
        status: string;
        customerName: string;
        phone: string;
        watchBrand: string;
        watchModel: string;
        serial: string;
        complaint: string;
        estimateTotalInr: number;
        estimatedFinishDate: string | null;
        advanceInr: number;
        advancePaymentMode: string | null;
        advancePaymentDetails: unknown;
        regionId: string;
        storeId: string;
        destinationStoreId: string | null;
        dcNumber: string | null;
        outwardDcNumber: string | null;
        hoSparesBillRef: string | null;
        storeBillRef: string | null;
        transferSourceReference: string | null;
        transferSourceRegionId: string | null;
        transferTargetRegionId: string | null;
        brandSentAt: string | null;
        brandDispatchRef: string | null;
        brandDispatchNote: string | null;
        brandOdcNumber: string | null;
        brandInwardRef: string | null;
        brandEstimateInr: number | null;
        brandEstimateCurrency: string | null;
        brandEstimateReceivedAt: string | null;
        brandHoApprovalSentAt: string | null;
        brandReturnReceivedAt: string | null;
        brandInvoiceRef: string | null;
        brandInvoiceAmountInr: number | null;
        brandCouponCode: string | null;
        brandCouponValueInr: number | null;
        brandCouponReceivedAt: string | null;
        brandCouponValidUntil: string | null;
        customerCouponNotifiedAt: string | null;
        createdAt: string;
      }>(
        `SELECT id, reference, status,
                customer_name AS "customerName",
                phone,
                watch_brand AS "watchBrand",
                watch_model AS "watchModel",
                serial,
                complaint,
                estimate_total_inr::float8 AS "estimateTotalInr",
                estimated_finish_date::text AS "estimatedFinishDate",
                advance_inr::float8 AS "advanceInr",
                advance_payment_mode AS "advancePaymentMode",
                advance_payment_details AS "advancePaymentDetails",
                region_id AS "regionId",
                store_id AS "storeId",
                destination_store_id AS "destinationStoreId",
                dc_number AS "dcNumber",
                outward_dc_number AS "outwardDcNumber",
                ho_spares_bill_ref AS "hoSparesBillRef",
                store_bill_ref AS "storeBillRef",
                transfer_source_reference AS "transferSourceReference",
                transfer_source_region_id AS "transferSourceRegionId",
                transfer_target_region_id AS "transferTargetRegionId",
                brand_sent_at AS "brandSentAt",
                brand_dispatch_ref AS "brandDispatchRef",
                brand_dispatch_note AS "brandDispatchNote",
                brand_odc_number AS "brandOdcNumber",
                brand_inward_ref AS "brandInwardRef",
                brand_estimate_inr::float8 AS "brandEstimateInr",
                brand_estimate_currency AS "brandEstimateCurrency",
                brand_estimate_received_at AS "brandEstimateReceivedAt",
                brand_ho_approval_sent_at AS "brandHoApprovalSentAt",
                brand_return_received_at AS "brandReturnReceivedAt",
                brand_invoice_ref AS "brandInvoiceRef",
                brand_invoice_amount_inr::float8 AS "brandInvoiceAmountInr",
                brand_coupon_code AS "brandCouponCode",
                brand_coupon_value_inr::float8 AS "brandCouponValueInr",
                brand_coupon_received_at AS "brandCouponReceivedAt",
                brand_coupon_valid_until AS "brandCouponValidUntil",
                customer_coupon_notified_at AS "customerCouponNotifiedAt",
                created_at AS "createdAt"
         FROM srf_jobs
         WHERE id = $1::uuid`,
        [srfId],
      );
      const job = jobRes.rows[0];
      if (!job) {
        res.status(404).json({ error: "SRF not found." });
        return;
      }

      const statusHistoryRes = await pool.query(
        `SELECT h.id,
                h.status,
                h.note,
                h.changed_by AS "changedById",
                u.display_name AS "changedByName",
                u.role AS "changedByRole",
                h.changed_at AS "changedAt"
         FROM srf_status_history h
         LEFT JOIN app_users u ON u.id = h.changed_by
         WHERE h.srf_id = $1::uuid
         ORDER BY h.changed_at ASC`,
        [srfId],
      );

      const actionsRes = await pool.query(
        `SELECT id,
                action,
                description,
                details,
                amount_inr::float8 AS "amountInr",
                reference_doc AS "referenceDoc",
                actor_id AS "actorId",
                actor_role AS "actorRole",
                actor_name AS "actorName",
                created_at AS "createdAt"
         FROM srf_action_log
         WHERE srf_id = $1::uuid
         ORDER BY created_at ASC`,
        [srfId],
      );

      const reestimatesRes = await pool.query(
        `SELECT id,
                attempt_no AS "attemptNo",
                amount_inr::float8 AS "amountInr",
                remark,
                raised_by_id AS "raisedById",
                raised_by_name AS "raisedByName",
                raised_by_role AS "raisedByRole",
                raised_at AS "raisedAt",
                customer_response AS "customerResponse",
                customer_response_at AS "customerResponseAt",
                customer_response_note AS "customerResponseNote",
                supervisor_followup AS "supervisorFollowup",
                supervisor_followup_note AS "supervisorFollowupNote",
                supervisor_followup_at AS "supervisorFollowupAt",
                supervisor_followup_by_id AS "supervisorFollowupById",
                supervisor_followup_by_name AS "supervisorFollowupByName",
                closed_at AS "closedAt"
         FROM srf_reestimate_attempts
         WHERE srf_id = $1::uuid
         ORDER BY attempt_no ASC`,
        [srfId],
      );

      res.json({
        job,
        statusHistory: statusHistoryRes.rows,
        actions: actionsRes.rows,
        reestimates: reestimatesRes.rows,
      });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Could not load SRF trace." });
    }
  });

  app.get("/api/service/inter-ho-spare-orders", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || !canManageInterHoSpareOrders(actor)) {
      res.status(403).json({ error: "Only supervisor/admin can view online spare orders." });
      return;
    }
    const direction = String(req.query.direction ?? "all").trim().toLowerCase();
    const status = String(req.query.status ?? "").trim().toUpperCase();
    const srfId = String(req.query.srfId ?? "").trim();
    const orderId = String(req.query.orderId ?? "").trim();
    try {
      const params: unknown[] = [];
      const where: string[] = [];
      let i = 1;
      if (actor.role !== "super_admin" && actor.role !== "admin") {
        if (!actor.regionId) {
          res.status(400).json({ error: "User region is not configured." });
          return;
        }
        if (direction === "incoming") {
          where.push(`o.to_region_id = $${i++}::text`);
          params.push(actor.regionId);
        } else if (direction === "outgoing") {
          where.push(`o.from_region_id = $${i++}::text`);
          params.push(actor.regionId);
        } else {
          where.push(`(o.from_region_id = $${i}::text OR o.to_region_id = $${i + 1}::text)`);
          params.push(actor.regionId, actor.regionId);
          i += 2;
        }
      }
      if (status && ["REQUESTED", "FULFILLED", "CANCELLED"].includes(status)) {
        where.push(`o.status = $${i++}`);
        params.push(status);
      }
      if (srfId) {
        where.push(`o.srf_id = $${i++}::uuid`);
        params.push(srfId);
      }
      if (orderId) {
        where.push(`o.id = $${i++}::uuid`);
        params.push(orderId);
      }
      const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
      const { rows } = await pool.query(
        `SELECT o.id,
                o.order_number AS "orderNumber",
                o.srf_id AS "srfId",
                o.srf_reference AS "srfReference",
                o.from_region_id AS "fromRegionId",
                fr.name AS "fromRegionName",
                o.to_region_id AS "toRegionId",
                tr.name AS "toRegionName",
                o.status,
                o.note,
                o.requested_by AS "requestedBy",
                o.requested_by_name AS "requestedByName",
                o.requested_at AS "requestedAt",
                o.invoice_ref AS "invoiceRef",
                o.fulfilled_note AS "fulfilledNote",
                o.fulfilled_by AS "fulfilledBy",
                o.fulfilled_by_name AS "fulfilledByName",
                o.fulfilled_at AS "fulfilledAt",
                o.dispatch_note AS "dispatchNote",
                o.dispatched_by AS "dispatchedBy",
                o.dispatched_by_name AS "dispatchedByName",
                o.dispatched_at AS "dispatchedAt",
                o.inward_note AS "inwardNote",
                o.inward_received_by AS "inwardReceivedBy",
                o.inward_received_by_name AS "inwardReceivedByName",
                o.inward_received_at AS "inwardReceivedAt",
                j.customer_name AS "customerName",
                j.phone AS "customerPhone",
                j.watch_brand AS "watchBrand",
                j.watch_model AS "watchModel",
                j.serial,
                j.complaint,
                COALESCE((
                  SELECT json_agg(
                    json_build_object(
                      'id', l.id,
                      'spareId', l.spare_id,
                      'spareName', l.spare_name,
                      'qty', l.qty::float8,
                      'unitPriceInr', l.unit_price_inr::float8,
                      'lineTotalInr', l.line_total_inr::float8
                    ) ORDER BY l.id
                  )
                  FROM srf_inter_ho_spare_order_lines l
                  WHERE l.order_id = o.id
                ), '[]'::json) AS lines
         FROM srf_inter_ho_spare_orders o
         JOIN srf_jobs j ON j.id = o.srf_id
         JOIN regions fr ON fr.id = o.from_region_id
         JOIN regions tr ON tr.id = o.to_region_id
         ${whereSql}
         ORDER BY o.requested_at DESC`,
        params,
      );
      res.json({ rows });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Could not load online spare orders." });
    }
  });

  app.post("/api/service/srf-jobs/:srfId/supervisor/request-spares-other-ho", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || !canManageInterHoSpareOrders(actor)) {
      res.status(403).json({ error: "Only supervisor/admin can request spares from other HO." });
      return;
    }
    const srfId = String(req.params.srfId ?? "").trim();
    const targetRegionId = String(req.body?.targetRegionId ?? "").trim();
    const note = String(req.body?.note ?? "").trim();
    const lines = Array.isArray(req.body?.lines)
      ? req.body.lines
          .map((x: unknown) => ({
            spareId: String((x as { spareId?: unknown })?.spareId ?? "").trim(),
            qty: Number((x as { qty?: unknown })?.qty ?? 0),
          }))
          .filter((x: { spareId: string; qty: number }) => x.spareId && Number.isFinite(x.qty) && x.qty > 0)
      : [];
    if (!targetRegionId) {
      res.status(400).json({ error: "targetRegionId is required." });
      return;
    }
    if (targetRegionId === (actor.regionId ?? "")) {
      res.status(400).json({ error: "Choose another HO region for spare request." });
      return;
    }
    if (lines.length === 0) {
      res.status(400).json({ error: "Add at least one spare line." });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const srfRes = await client.query<{ reference: string; region_id: string; status: string }>(
        `SELECT reference, region_id, status FROM srf_jobs WHERE id = $1::uuid FOR UPDATE`,
        [srfId],
      );
      const srf = srfRes.rows[0];
      if (!srf) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "SRF not found." });
        return;
      }
      if (actor.role !== "super_admin" && actor.role !== "admin") {
        if (!actor.regionId || actor.regionId !== srf.region_id) {
          await client.query("ROLLBACK");
          res.status(403).json({ error: "You can request spares only for your own HO SRFs." });
          return;
        }
      }
      if (!["assigned", "estimate_ok", "reestimate_required"].includes(srf.status)) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Spare order can be raised only while SRF is under diagnosis/repair." });
        return;
      }
      const spareIds = lines.map((l: { spareId: string }) => l.spareId);
      const spareMapRes = await client.query<{ id: string; name: string }>(
        `SELECT id, name FROM spares WHERE id = ANY($1::uuid[])`,
        [spareIds],
      );
      const nameById = new Map(spareMapRes.rows.map((r) => [r.id, r.name] as const));
      const missing = spareIds.filter((id) => !nameById.has(id));
      if (missing.length > 0) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Some selected spares are invalid." });
        return;
      }
      const orderNumber = await nextSpareOrderNumber(client);
      const orderIns = await client.query<{ id: string }>(
        `INSERT INTO srf_inter_ho_spare_orders
           (order_number, srf_id, srf_reference, from_region_id, to_region_id, status, note, requested_by, requested_by_name)
         VALUES ($1, $2::uuid, $3, $4::text, $5::text, 'REQUESTED', $6, $7, $8)
         RETURNING id`,
        [orderNumber, srfId, srf.reference, srf.region_id, targetRegionId, note, actor.id, actor.displayName],
      );
      const orderId = orderIns.rows[0]?.id;
      if (!orderId) throw new Error("Could not create spare order.");
      for (const line of lines) {
        const qty = Number(line.qty);
        await client.query(
          `INSERT INTO srf_inter_ho_spare_order_lines (order_id, spare_id, spare_name, qty, unit_price_inr, line_total_inr)
           VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)`,
          [orderId, line.spareId, nameById.get(line.spareId) ?? line.spareId, qty, 0, 0],
        );
      }
      await appendActionLog(client, srfId, {
        action: "inter_ho_spare_order_requested",
        description: `Online spare sales order ${orderNumber} raised from ${srf.region_id} to authorized partner ${targetRegionId}.`,
        actor,
        referenceDoc: orderNumber,
        details: { targetRegionId, note, lines },
      });
      await appendStatusHistory(
        client,
        srfId,
        srf.status,
        actor.id,
        `Online spare order ${orderNumber} raised to ${targetRegionId}${note ? `: ${note}` : ""}`,
      );
      await client.query("COMMIT");
      res.json({ ok: true, orderId, orderNumber });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(e);
      res.status(400).json({ error: "Could not create online spare order." });
    } finally {
      client.release();
    }
  });

  app.post("/api/service/inter-ho-spare-orders/:orderId/fulfill", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || !canManageInterHoSpareOrders(actor)) {
      res.status(403).json({ error: "Only supervisor/admin can fulfill online spare order." });
      return;
    }
    const orderId = String(req.params.orderId ?? "").trim();
    const invoiceRef = String(req.body?.invoiceRef ?? "").trim();
    const fulfilledNote = String(req.body?.note ?? "").trim();
    const invoiceLines = Array.isArray(req.body?.lines)
      ? req.body.lines
          .map((x: unknown) => ({
            lineId: String((x as { lineId?: unknown })?.lineId ?? "").trim(),
            spareId: String((x as { spareId?: unknown })?.spareId ?? "").trim(),
            qty: Number((x as { qty?: unknown })?.qty ?? 0),
            unitPriceInr: Number((x as { unitPriceInr?: unknown })?.unitPriceInr ?? 0),
          }))
          .filter((x: { lineId: string; spareId: string; qty: number; unitPriceInr: number }) => x.lineId || x.spareId)
      : [];
    if (!invoiceRef) {
      res.status(400).json({ error: "invoiceRef is required." });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const orderRes = await client.query<{
        id: string;
        order_number: string;
        status: string;
        srf_id: string;
        to_region_id: string;
        from_region_id: string;
      }>(
        `SELECT id, order_number, status, srf_id, to_region_id, from_region_id
         FROM srf_inter_ho_spare_orders
         WHERE id = $1::uuid
         FOR UPDATE`,
        [orderId],
      );
      const order = orderRes.rows[0];
      if (!order) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Spare order not found." });
        return;
      }
      if (order.status !== "REQUESTED") {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Only requested orders can be fulfilled." });
        return;
      }
      if (actor.role !== "super_admin" && actor.role !== "admin") {
        if (!actor.regionId || actor.regionId !== order.to_region_id) {
          await client.query("ROLLBACK");
          res.status(403).json({ error: "Only destination HO can fulfill this order." });
          return;
        }
      }
      const lineRes = await client.query<{ id: string; spare_id: string; spare_name: string; qty: number; unit_price_inr: number }>(
        `SELECT id, spare_id, spare_name, qty::float8 AS qty, unit_price_inr::float8 AS unit_price_inr
         FROM srf_inter_ho_spare_order_lines
         WHERE order_id = $1::uuid`,
        [order.id],
      );
      if (lineRes.rows.length === 0) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Order has no lines." });
        return;
      }
      const invoiceLineById = new Map(invoiceLines.filter((l: { lineId: string }) => !!l.lineId).map((l: { lineId: string; spareId: string; qty: number; unitPriceInr: number }) => [l.lineId, l]));
      const invoiceLineBySpare = new Map(invoiceLines.filter((l: { spareId: string }) => !!l.spareId).map((l: { lineId: string; spareId: string; qty: number; unitPriceInr: number }) => [l.spareId, l]));
      if (invoiceLines.length > 0) {
        const unknown = invoiceLines.filter((l: { lineId: string; spareId: string }) =>
          l.lineId
            ? !lineRes.rows.some((x) => x.id === l.lineId)
            : !lineRes.rows.some((x) => x.spare_id === l.spareId),
        );
        if (unknown.length > 0) {
          await client.query("ROLLBACK");
          res.status(400).json({ error: "Invoice lines contain unknown spare ids." });
          return;
        }
      }
      const effectiveLines = lineRes.rows.map((line) => {
        const override = invoiceLineById.get(line.id) ?? invoiceLineBySpare.get(line.spare_id);
        const qty = Number(override?.qty ?? line.qty ?? 0);
        const unitPriceInr = Number(override?.unitPriceInr ?? line.unit_price_inr ?? 0);
        return {
          id: line.id,
          spare_id: line.spare_id,
          spare_name: line.spare_name,
          qty: Number.isFinite(qty) && qty > 0 ? qty : 0,
          unit_price_inr: Number.isFinite(unitPriceInr) && unitPriceInr >= 0 ? unitPriceInr : 0,
        };
      });
      if (effectiveLines.some((l) => l.qty <= 0)) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Invoice line qty must be greater than 0." });
        return;
      }
      if (effectiveLines.some((l) => l.unit_price_inr <= 0)) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Invoice line rate must be greater than 0." });
        return;
      }
      for (const line of effectiveLines) {
        await client.query(
          `UPDATE srf_inter_ho_spare_order_lines
           SET qty = $3::numeric,
               unit_price_inr = $4::numeric,
               line_total_inr = ($3::numeric * $4::numeric)
           WHERE order_id = $1::uuid
             AND id = $2::uuid`,
          [order.id, line.id, line.qty, line.unit_price_inr],
        );
      }
      const key = `HO:${order.to_region_id}`;
      const shortages: Array<{ spareName: string; available: number; required: number }> = [];
      for (const line of effectiveLines) {
        const stockRes = await client.query<{ quantity: number }>(
          `SELECT quantity::float8 AS quantity
           FROM spare_stock
           WHERE spare_id = $1::uuid AND location_key = $2
           FOR UPDATE`,
          [line.spare_id, key],
        );
        const currentQty = Number(stockRes.rows[0]?.quantity ?? 0);
        if (currentQty < Number(line.qty)) {
          shortages.push({ spareName: line.spare_name, available: currentQty, required: Number(line.qty) });
        }
      }
      if (shortages.length > 0) {
        await client.query("ROLLBACK");
        const msg = shortages
          .map((s) => `${s.spareName} (available ${s.available}, required ${s.required})`)
          .join(", ");
        res.status(400).json({
          error: `Cannot fulfill. Supplier HO stock is insufficient for: ${msg}.`,
          shortages,
        });
        return;
      }
      for (const line of effectiveLines) {
        await client.query(
          `UPDATE spare_stock
           SET quantity = quantity - $3, updated_at = now()
           WHERE spare_id = $1::uuid AND location_key = $2`,
          [line.spare_id, key, line.qty],
        );
        const updated = await client.query<{ quantity: number }>(
          `SELECT quantity::float8 AS quantity
           FROM spare_stock
           WHERE spare_id = $1::uuid AND location_key = $2`,
          [line.spare_id, key],
        );
        await appendStockHistory(client, {
          spareId: line.spare_id,
          eventType: "TRANSFER_OUT",
          locationKey: key,
          locationType: "HO",
          regionId: order.to_region_id,
          quantityChange: -Number(line.qty),
          balanceAfter: Number(updated.rows[0]?.quantity ?? 0),
          referenceType: "MANUAL",
          referenceNumber: order.order_number,
          note: `Online spare order invoiced for SRF ${order.srf_id}. Awaiting outward + inward flow. Invoice ${invoiceRef}.`,
          createdBy: actor.id,
        });
      }
      await client.query(
        `UPDATE srf_inter_ho_spare_orders
         SET status = 'FULFILLED',
             invoice_ref = $2,
             fulfilled_note = $3,
             fulfilled_by = $4,
             fulfilled_by_name = $5,
             fulfilled_at = now()
         WHERE id = $1::uuid`,
        [order.id, invoiceRef, fulfilledNote, actor.id, actor.displayName],
      );
      await client.query(
        `UPDATE srf_jobs
         SET ho_spares_bill_ref = COALESCE(NULLIF($2, ''), ho_spares_bill_ref),
             updated_at = now(),
             modified_by = $3
         WHERE id = $1::uuid`,
        [order.srf_id, invoiceRef, actor.id],
      );
      await appendActionLog(client, order.srf_id, {
        action: "inter_ho_spare_order_fulfilled",
        description: `Online spare order ${order.order_number} invoice created by supplier HO ${order.to_region_id}.`,
        actor,
        referenceDoc: order.order_number,
        details: {
          invoiceRef,
          fulfilledNote,
          lines: effectiveLines.map((l) => ({
            spareId: l.spare_id,
            spareName: l.spare_name,
            qty: l.qty,
            unitPriceInr: l.unit_price_inr,
            lineTotalInr: l.qty * l.unit_price_inr,
          })),
        },
      });
      const srfState = await client.query<{ status: string }>(`SELECT status FROM srf_jobs WHERE id = $1::uuid`, [order.srf_id]);
      await appendStatusHistory(
        client,
        order.srf_id,
        srfState.rows[0]?.status ?? "assigned",
        actor.id,
        `Online spare order ${order.order_number} invoice created. Await outward dispatch + inward receive. Invoice ${invoiceRef}${fulfilledNote ? `: ${fulfilledNote}` : ""}`,
      );
      await client.query("COMMIT");
      res.json({ ok: true });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(e);
      res.status(400).json({ error: "Could not fulfill online spare order." });
    } finally {
      client.release();
    }
  });

  app.post("/api/service/inter-ho-spare-orders/:orderId/dispatch", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || !canManageInterHoSpareOrders(actor)) {
      res.status(403).json({ error: "Only supervisor/admin can mark online spare dispatch." });
      return;
    }
    const orderId = String(req.params.orderId ?? "").trim();
    const note = String(req.body?.note ?? "").trim();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const orderRes = await client.query<{
        id: string;
        order_number: string;
        status: string;
        srf_id: string;
        to_region_id: string;
        dispatched_at: string | null;
      }>(
        `SELECT id, order_number, status, srf_id, to_region_id, dispatched_at
         FROM srf_inter_ho_spare_orders
         WHERE id = $1::uuid
         FOR UPDATE`,
        [orderId],
      );
      const order = orderRes.rows[0];
      if (!order) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Spare order not found." });
        return;
      }
      if (order.status !== "FULFILLED") {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Only fulfilled orders can be dispatched outward." });
        return;
      }
      if (order.dispatched_at) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Outward dispatch already completed." });
        return;
      }
      if (actor.role !== "super_admin" && actor.role !== "admin") {
        if (!actor.regionId || actor.regionId !== order.to_region_id) {
          await client.query("ROLLBACK");
          res.status(403).json({ error: "Only supplier HO can mark outward dispatch." });
          return;
        }
      }
      await client.query(
        `UPDATE srf_inter_ho_spare_orders
         SET dispatch_note = $2,
             dispatched_by = $3,
             dispatched_by_name = $4,
             dispatched_at = now()
         WHERE id = $1::uuid`,
        [order.id, note, actor.id, actor.displayName],
      );
      await appendActionLog(client, order.srf_id, {
        action: "inter_ho_spare_order_dispatched",
        description: `Online spare order ${order.order_number} outward dispatched by supplier HO.`,
        actor,
        referenceDoc: order.order_number,
        details: { note },
      });
      const srfState = await client.query<{ status: string }>(`SELECT status FROM srf_jobs WHERE id = $1::uuid`, [order.srf_id]);
      await appendStatusHistory(
        client,
        order.srf_id,
        srfState.rows[0]?.status ?? "assigned",
        actor.id,
        `Online spare order ${order.order_number} outward dispatched${note ? `: ${note}` : ""}`,
      );
      await client.query("COMMIT");
      res.json({ ok: true });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(e);
      res.status(400).json({ error: "Could not mark outward dispatch." });
    } finally {
      client.release();
    }
  });

  app.post("/api/service/inter-ho-spare-orders/:orderId/inward-receive", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || !canManageInterHoSpareOrders(actor)) {
      res.status(403).json({ error: "Only supervisor/admin can mark online spare inward." });
      return;
    }
    const orderId = String(req.params.orderId ?? "").trim();
    const note = String(req.body?.note ?? "").trim();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const orderRes = await client.query<{
        id: string;
        order_number: string;
        status: string;
        srf_id: string;
        from_region_id: string;
        dispatched_at: string | null;
        inward_received_at: string | null;
      }>(
        `SELECT id, order_number, status, srf_id, from_region_id, dispatched_at, inward_received_at
         FROM srf_inter_ho_spare_orders
         WHERE id = $1::uuid
         FOR UPDATE`,
        [orderId],
      );
      const order = orderRes.rows[0];
      if (!order) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Spare order not found." });
        return;
      }
      if (order.status !== "FULFILLED") {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Only fulfilled orders can be inwarded." });
        return;
      }
      if (!order.dispatched_at) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Complete outward dispatch first." });
        return;
      }
      if (order.inward_received_at) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Inward already completed." });
        return;
      }
      if (actor.role !== "super_admin" && actor.role !== "admin") {
        if (!actor.regionId || actor.regionId !== order.from_region_id) {
          await client.query("ROLLBACK");
          res.status(403).json({ error: "Only requested HO can mark inward receive." });
          return;
        }
      }
      const lineRes = await client.query<{ spare_id: string; spare_name: string; qty: number }>(
        `SELECT spare_id, spare_name, qty::float8 AS qty
         FROM srf_inter_ho_spare_order_lines
         WHERE order_id = $1::uuid`,
        [order.id],
      );
      if (lineRes.rows.length === 0) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Order has no lines." });
        return;
      }
      for (const line of lineRes.rows) {
        const inboundKey = `HO:${order.from_region_id}`;
        await client.query(
          `INSERT INTO spare_stock (spare_id, location_key, location_type, region_id, store_id, quantity)
           VALUES ($1::uuid, $2, 'HO', $3::text, NULL, $4)
           ON CONFLICT (spare_id, location_key)
           DO UPDATE SET quantity = spare_stock.quantity + EXCLUDED.quantity, updated_at = now()`,
          [line.spare_id, inboundKey, order.from_region_id, line.qty],
        );
        const inboundBal = await client.query<{ quantity: number }>(
          `SELECT quantity::float8 AS quantity
           FROM spare_stock
           WHERE spare_id = $1::uuid AND location_key = $2`,
          [line.spare_id, inboundKey],
        );
        await appendStockHistory(client, {
          spareId: line.spare_id,
          eventType: "TRANSFER_IN",
          locationKey: inboundKey,
          locationType: "HO",
          regionId: order.from_region_id,
          quantityChange: Number(line.qty),
          balanceAfter: Number(inboundBal.rows[0]?.quantity ?? 0),
          referenceType: "MANUAL",
          referenceNumber: order.order_number,
          note: `Online spare order inward received for SRF ${order.srf_id}.`,
          createdBy: actor.id,
        });
      }
      await client.query(
        `UPDATE srf_inter_ho_spare_orders
         SET inward_note = $2,
             inward_received_by = $3,
             inward_received_by_name = $4,
             inward_received_at = now()
         WHERE id = $1::uuid`,
        [order.id, note, actor.id, actor.displayName],
      );
      await appendActionLog(client, order.srf_id, {
        action: "inter_ho_spare_order_inward_received",
        description: `Online spare order ${order.order_number} inward received at requesting HO.`,
        actor,
        referenceDoc: order.order_number,
        details: { note },
      });
      const srfState = await client.query<{ status: string }>(`SELECT status FROM srf_jobs WHERE id = $1::uuid`, [order.srf_id]);
      await appendStatusHistory(
        client,
        order.srf_id,
        srfState.rows[0]?.status ?? "assigned",
        actor.id,
        `Online spare order ${order.order_number} inward completed${note ? `: ${note}` : ""}`,
      );
      await client.query("COMMIT");
      res.json({ ok: true });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(e);
      res.status(400).json({ error: "Could not mark inward receive." });
    } finally {
      client.release();
    }
  });

  app.post("/api/service/srf-jobs/draft", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    if (!roleCanCreateDraft(actor)) {
      res.status(403).json({ error: "Only store/HO admins can create SRF draft." });
      return;
    }
    const regionId = String(req.body?.regionId ?? actor.regionId ?? "").trim();
    const storeId = String(req.body?.storeId ?? actor.storeId ?? "").trim();
    const destinationStoreId = String(req.body?.destinationStoreId ?? storeId).trim();
    const customerName = String(req.body?.customerName ?? "").trim();
    const phone = String(req.body?.phone ?? "").trim();
    const customerKind = String(req.body?.customerKind ?? "B2C").toUpperCase() === "B2B" ? "B2B" : "B2C";
    const company = String(req.body?.company ?? "").trim() || null;
    const watchBrand = String(req.body?.watchBrand ?? "").trim();
    const watchModel = String(req.body?.watchModel ?? "").trim();
    const serial = String(req.body?.serial ?? "").trim();
    if (!regionId || !storeId || !destinationStoreId || !customerName || !phone || !watchBrand || !watchModel || !serial) {
      res.status(400).json({ error: "regionId, storeId, destinationStoreId, customerName, phone, watchBrand, watchModel, serial are required." });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows: storeRows } = await client.query<{ name: string }>(
        `SELECT name FROM stores WHERE id = $1::text`,
        [storeId],
      );
      const { rows: destStoreRows } = await client.query<{ id: string }>(
        `SELECT id FROM stores WHERE id = $1::text LIMIT 1`,
        [destinationStoreId],
      );
      if (!destStoreRows[0]) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Destination store not found." });
        return;
      }
      const { prefix, suffix } = await getSeriesPrefixSuffix(client, "srf", "SRF");
      const ref = await nextDocNumber(client, prefix, suffix, srfStoreScopeCode(storeRows[0]?.name, storeId));
      const ins = await client.query<{ id: string }>(
        `INSERT INTO srf_jobs (
           reference, region_id, store_id, customer_name, phone, customer_kind, company, watch_brand, watch_model, serial,
           destination_store_id, status, photo_session_active, created_by, modified_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'photo_pending', true, $12, $12)
         RETURNING id`,
        [ref, regionId, storeId, customerName, phone, customerKind, company, watchBrand, watchModel, serial, destinationStoreId, actor.id],
      );
      const srfId = ins.rows[0]?.id;
      if (!srfId) throw new Error("Could not create SRF draft.");
      await appendStatusHistory(client, srfId, "photo_pending", actor.id, "SRF draft created.");
      await appendActionLog(client, srfId, {
        action: "srf_draft_created",
        description: `SRF draft created for ${customerName} (${watchBrand} ${watchModel}).`,
        actor,
        details: { regionId, storeId, customerKind, watchBrand, watchModel, serial },
        referenceDoc: ref,
      });

      const token = crypto.randomBytes(24).toString("hex");
      await client.query(
        `INSERT INTO srf_photo_sessions (srf_id, token_hash, expires_at, created_by)
         VALUES ($1::uuid, $2, now() + interval '45 minutes', $3)`,
        [srfId, tokenHash(token), actor.id],
      );
      await client.query("COMMIT");
      res.json({
        srfId,
        reference: ref,
        token,
        captureUrl: `/service/srf-capture?t=${encodeURIComponent(token)}`,
      });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(e);
      res.status(400).json({ error: "Could not create SRF draft." });
    } finally {
      client.release();
    }
  });

  app.post("/api/service/srf-jobs/:srfId/photo-session/refresh", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || !roleCanCreateDraft(actor)) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
    const srfId = String(req.params.srfId ?? "").trim();
    if (!srfId) {
      res.status(400).json({ error: "Invalid SRF id." });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<{ id: string; status: string; capture_link_disabled_at: Date | null }>(
        `SELECT id, status, capture_link_disabled_at
         FROM srf_jobs
         WHERE id = $1::uuid
         FOR UPDATE`,
        [srfId],
      );
      const row = rows[0];
      if (!row || row.capture_link_disabled_at || (row.status !== "draft" && row.status !== "photo_pending")) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Capture link can be refreshed only for draft/photo_pending SRF." });
        return;
      }
      await client.query(
        `UPDATE srf_photo_sessions SET revoked_at = now() WHERE srf_id = $1::uuid AND revoked_at IS NULL`,
        [srfId],
      );
      const token = crypto.randomBytes(24).toString("hex");
      await client.query(
        `INSERT INTO srf_photo_sessions (srf_id, token_hash, expires_at, created_by)
         VALUES ($1::uuid, $2, now() + interval '45 minutes', $3)`,
        [srfId, tokenHash(token), actor.id],
      );
      await client.query(
        `UPDATE srf_jobs
         SET photo_session_active = true, modified_by = $2, updated_at = now(), capture_link_disabled_at = NULL
         WHERE id = $1::uuid`,
        [srfId, actor.id],
      );
      await client.query("COMMIT");
      res.json({ token, captureUrl: `/service/srf-capture?t=${encodeURIComponent(token)}` });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(e);
      res.status(400).json({ error: "Could not refresh photo session." });
    } finally {
      client.release();
    }
  });

  app.post("/api/service/srf-jobs/:srfId/finalize", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || !roleCanCreateDraft(actor)) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
    const srfId = String(req.params.srfId ?? "").trim();
    const complaint = String(req.body?.complaint ?? "").trim();
    const estimateTotalInr = Number(req.body?.estimateTotalInr ?? 0);
    const estimatedFinishDateRaw = String(req.body?.estimatedFinishDate ?? "").trim();
    const estimatedFinishDate =
      estimatedFinishDateRaw && /^\d{4}-\d{2}-\d{2}$/.test(estimatedFinishDateRaw)
        ? estimatedFinishDateRaw
        : null;
    const advanceInr = Number(req.body?.advanceInr ?? 0);
    const selectedPartIds = Array.isArray(req.body?.selectedPartIds)
      ? req.body.selectedPartIds.map((x: unknown) => String(x ?? "").trim()).filter(Boolean)
      : [];
    if (!complaint) {
      res.status(400).json({ error: "Complaint is required." });
      return;
    }
    if (!Number.isFinite(estimateTotalInr) || estimateTotalInr < 0) {
      res.status(400).json({ error: "estimateTotalInr must be a valid non-negative number." });
      return;
    }
    if (!Number.isFinite(advanceInr) || advanceInr < 0) {
      res.status(400).json({ error: "advanceInr must be a valid non-negative number." });
      return;
    }
    let advancePaymentMode: string | null = null;
    let advancePaymentDetails: AdvancePaymentDetails = {};
    if (advanceInr > 0) {
      advancePaymentMode = String(req.body?.advancePaymentMode ?? "").trim();
      if (!advancePaymentMode || !(APP_PAYMENT_MODES as readonly string[]).includes(advancePaymentMode)) {
        res.status(400).json({ error: "Valid advance payment mode is required when advance amount is entered." });
        return;
      }
      const rawDet = req.body?.advancePaymentDetails;
      advancePaymentDetails =
        rawDet && typeof rawDet === "object" && !Array.isArray(rawDet) ? (rawDet as AdvancePaymentDetails) : {};
      if (advancePaymentMode === "Cash") {
        const cashSum = sumAdvanceCashDenominations(advancePaymentDetails.cash);
        if (Math.abs(cashSum - advanceInr) > 0.02) {
          res.status(400).json({
            error: `Cash denomination total INR ${cashSum.toFixed(2)} must match advance amount INR ${advanceInr.toFixed(2)}.`,
          });
          return;
        }
      }
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows: locked } = await client.query<{ id: string; status: string; store_id: string }>(
        `SELECT id, status, store_id FROM srf_jobs WHERE id = $1::uuid FOR UPDATE`,
        [srfId],
      );
      if (!locked[0] || (locked[0].status !== "draft" && locked[0].status !== "photo_pending")) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Only draft/photo_pending SRFs can be finalized." });
        return;
      }
      const { rows: photoCountRows } = await client.query<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM srf_job_photos WHERE srf_id = $1::uuid`,
        [srfId],
      );
      if ((photoCountRows[0]?.c ?? 0) <= 0) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Upload at least one photo before finalizing SRF." });
        return;
      }
      await client.query(
        `UPDATE srf_jobs
         SET complaint = $2,
             estimate_total_inr = $3,
             advance_inr = $4,
             selected_part_ids = $5::jsonb,
             estimated_finish_date = $9::date,
             advance_payment_mode = $7,
             advance_payment_details = $8::jsonb,
             status = 'at_store',
             photo_session_active = false,
             capture_link_disabled_at = now(),
             updated_at = now(),
             modified_by = $6
         WHERE id = $1::uuid`,
        [
          srfId,
          complaint,
          estimateTotalInr,
          advanceInr,
          JSON.stringify(selectedPartIds),
          actor.id,
          advancePaymentMode,
          JSON.stringify(advancePaymentDetails),
          estimatedFinishDate,
        ],
      );
      const invNo = await allocateStoreInvoiceNumber(client, locked[0]!.store_id);
      await client.query(`UPDATE srf_jobs SET invoice_number = $2 WHERE id = $1::uuid`, [srfId, invNo]);
      await client.query(
        `UPDATE srf_photo_sessions SET revoked_at = now() WHERE srf_id = $1::uuid AND revoked_at IS NULL`,
        [srfId],
      );
      await appendStatusHistory(client, srfId, "at_store", actor.id, "SRF finalized after OTP.");
      await appendActionLog(client, srfId, {
        action: "srf_finalized",
        description: `SRF finalized with estimate INR ${estimateTotalInr.toFixed(2)} and advance INR ${advanceInr.toFixed(2)}.`,
        amountInr: estimateTotalInr,
        actor,
        details: {
          complaint,
          selectedPartIds,
          advanceInr,
          estimatedFinishDate,
          advancePaymentMode,
          advancePaymentDetails,
        },
      });
      const refRows = await client.query<{ reference: string; customer_name: string; phone: string }>(
        `SELECT reference, customer_name, phone FROM srf_jobs WHERE id = $1::uuid`,
        [srfId],
      );
      const refRow = refRows.rows[0];
      const trackingToken = await getOrCreateTrackingToken(client, refRow?.phone ?? "");
      await client.query(
        `UPDATE customer_tracking_tokens SET last_sent_at = now() WHERE phone_last10 = $1`,
        [phoneLast10(refRow?.phone ?? "")],
      );
      await client.query("COMMIT");
      const trackingUrl = `${resolvePublicAppBaseUrl(req)}/track?t=${encodeURIComponent(trackingToken)}`;
      await sendTrackingLink({
        phone: refRow?.phone ?? "",
        name: refRow?.customer_name ?? "Customer",
        trackingUrl,
        srfReference: refRow?.reference ?? "",
      }).catch(() => {});
      res.json({ ok: true, trackingUrl, invoiceNumber: invNo });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(e);
      res.status(400).json({ error: "Could not finalize SRF." });
    } finally {
      client.release();
    }
  });

  app.post("/api/service/srf-jobs/:srfId/cancel", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || !roleCanCreateDraft(actor)) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
    const srfId = String(req.params.srfId ?? "").trim();
    const reason = String(req.body?.reason ?? "").trim();
    if (!reason) {
      res.status(400).json({ error: "Cancellation reason is required." });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<{ id: string; status: string; region_id: string; store_id: string }>(
        `SELECT id, status, region_id, store_id FROM srf_jobs WHERE id = $1::uuid FOR UPDATE`,
        [srfId],
      );
      const row = rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "SRF not found." });
        return;
      }
      if (row.status !== "draft" && row.status !== "photo_pending") {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Only draft or photo-pending SRFs can be cancelled." });
        return;
      }
      if (actor.role !== "super_admin" && actor.role !== "admin") {
        if (!actor.regionId || actor.regionId !== row.region_id) {
          await client.query("ROLLBACK");
          res.status(403).json({ error: "Region mismatch." });
          return;
        }
        if (STORE_ROLES.has(actor.role) && actor.storeId !== row.store_id) {
          await client.query("ROLLBACK");
          res.status(403).json({ error: "You can cancel only your own store SRF." });
          return;
        }
      }
      await client.query(
        `UPDATE srf_jobs
         SET status = 'cancelled',
             capture_link_disabled_at = now(),
             photo_session_active = false,
             updated_at = now(),
             modified_by = $2
         WHERE id = $1::uuid`,
        [srfId, actor.id],
      );
      await client.query(
        `UPDATE srf_photo_sessions SET revoked_at = now() WHERE srf_id = $1::uuid AND revoked_at IS NULL`,
        [srfId],
      );
      await appendStatusHistory(client, srfId, "cancelled", actor.id, reason);
      await appendActionLog(client, srfId, {
        action: "srf_cancelled",
        description: `SRF cancelled by ${actor.displayName}. Reason: ${reason}`,
        actor,
        details: { reason, fromStatus: row.status },
      });
      await client.query("COMMIT");
      res.json({ ok: true });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(e);
      res.status(400).json({ error: "Could not cancel SRF." });
    } finally {
      client.release();
    }
  });

  app.patch("/api/service/srf-jobs/:srfId/store-draft", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || !roleCanCreateDraft(actor)) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
    const srfId = String(req.params.srfId ?? "").trim();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<{ id: string; status: string; region_id: string; store_id: string }>(
        `SELECT id, status, region_id, store_id FROM srf_jobs WHERE id = $1::uuid FOR UPDATE`,
        [srfId],
      );
      const row = rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "SRF not found." });
        return;
      }
      if (row.status !== "draft" && row.status !== "photo_pending") {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Only draft or photo-pending SRFs can be edited." });
        return;
      }
      if (actor.role !== "super_admin" && actor.role !== "admin") {
        if (!actor.regionId || actor.regionId !== row.region_id) {
          await client.query("ROLLBACK");
          res.status(403).json({ error: "Region mismatch." });
          return;
        }
        if (STORE_ROLES.has(actor.role) && actor.storeId !== row.store_id) {
          await client.query("ROLLBACK");
          res.status(403).json({ error: "You can edit only your own store SRF." });
          return;
        }
      }
      const body = req.body as Record<string, unknown>;
      const sets: string[] = [];
      const vals: unknown[] = [];
      let pi = 1;
      if (typeof body.customerName === "string") {
        sets.push(`customer_name = $${pi++}`);
        vals.push(String(body.customerName).trim());
      }
      if (typeof body.phone === "string") {
        sets.push(`phone = $${pi++}`);
        vals.push(String(body.phone).trim());
      }
      if (typeof body.watchBrand === "string") {
        sets.push(`watch_brand = $${pi++}`);
        vals.push(String(body.watchBrand).trim());
      }
      if (typeof body.watchModel === "string") {
        sets.push(`watch_model = $${pi++}`);
        vals.push(String(body.watchModel).trim());
      }
      if (typeof body.serial === "string") {
        sets.push(`serial = $${pi++}`);
        vals.push(String(body.serial).trim());
      }
      if (sets.length === 0) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "No updatable fields supplied." });
        return;
      }
      sets.push("updated_at = now()");
      sets.push(`modified_by = $${pi++}`);
      vals.push(actor.id);
      vals.push(srfId);
      await client.query(
        `UPDATE srf_jobs SET ${sets.join(", ")} WHERE id = $${pi}::uuid`,
        vals,
      );
      await appendStatusHistory(client, srfId, row.status, actor.id, "Store updated draft details before finalize.");
      await client.query("COMMIT");
      res.json({ ok: true });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(e);
      res.status(400).json({ error: "Could not update SRF draft." });
    } finally {
      client.release();
    }
  });

  app.post("/api/service/dcs", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || !STORE_ROLES.has(actor.role)) {
      res.status(403).json({ error: "Only store roles can create DC." });
      return;
    }
    const ids = Array.isArray(req.body?.srfIds)
      ? req.body.srfIds.map((x: unknown) => String(x ?? "").trim()).filter(Boolean)
      : [];
    if (ids.length === 0) {
      res.status(400).json({ error: "Select at least one SRF." });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const regionId = actor.regionId ?? "";
      const { prefix, suffix } = await getSeriesPrefixSuffix(client, "dc", "DC");
      const dcNumber = await nextDocNumber(client, prefix, suffix, scopeCode(regionId, "RGN"));
      const dcIns = await client.query<{ id: string }>(
        `INSERT INTO delivery_challans (dc_number, region_id, from_store_id, to_location, status, created_by, modified_by)
         VALUES ($1, $2, $3, 'SERVICE_CENTRE', 'CREATED', $4, $4)
         RETURNING id`,
        [dcNumber, regionId, actor.storeId, actor.id],
      );
      const dcId = dcIns.rows[0]?.id;
      if (!dcId) throw new Error("Failed to create DC.");
      let moved = 0;
      for (const srfId of ids) {
        const { rows } = await client.query<{ id: string; status: string; store_id: string }>(
          `SELECT id, status, store_id
           FROM srf_jobs
           WHERE id = $1::uuid
           FOR UPDATE`,
          [srfId],
        );
        const row = rows[0];
        if (!row || row.store_id !== actor.storeId || row.status !== "at_store") continue;
        await client.query(
          `INSERT INTO delivery_challan_lines (dc_id, srf_id, qty, created_by, modified_by)
           VALUES ($1::uuid, $2::uuid, 1, $3, $3)
           ON CONFLICT (dc_id, srf_id) DO NOTHING`,
          [dcId, srfId, actor.id],
        );
        await client.query(
          `UPDATE srf_jobs
           SET status = 'in_transit_sc',
               dc_number = $2,
               dispatched_to_sc_at = now(),
               updated_at = now(),
               modified_by = $3
           WHERE id = $1::uuid`,
          [srfId, dcNumber, actor.id],
        );
        await appendStatusHistory(client, srfId, "in_transit_sc", actor.id, `Dispatched to HO in ${dcNumber}.`);
        await appendActionLog(client, srfId, {
          action: "store_dc_dispatch",
          description: `Watch dispatched to service centre via DC ${dcNumber}.`,
          actor,
          referenceDoc: dcNumber,
        });
        moved += 1;
      }
      if (moved === 0) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Selected rows must be at-store SRFs for your own store." });
        return;
      }
      await client.query("COMMIT");
      res.json({ dcNumber, moved });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(e);
      res.status(400).json({ error: "Could not create DC." });
    } finally {
      client.release();
    }
  });

  app.post("/api/service/dcs/:dcNumber/inward", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || !SC_DC_INWARD_ROLES.has(actor.role)) {
      res.status(403).json({ error: "Only logistics inward roles can inward a store DC." });
      return;
    }
    const dcNumber = String(req.params.dcNumber ?? "").trim();
    if (!dcNumber) {
      res.status(400).json({ error: "dcNumber is required." });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows: dcs } = await client.query<{ id: string; region_id: string; from_store_id: string | null }>(
        `SELECT id, region_id, from_store_id FROM delivery_challans WHERE dc_number = $1 FOR UPDATE`,
        [dcNumber],
      );
      const dc = dcs[0];
      if (!dc) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "DC not found." });
        return;
      }
      if (actor.role !== "super_admin" && actor.role !== "admin" && actor.regionId !== dc.region_id) {
        await client.query("ROLLBACK");
        res.status(403).json({ error: "Region mismatch." });
        return;
      }
      const { rows } = await client.query<{ srf_id: string }>(
        `SELECT srf_id FROM delivery_challan_lines WHERE dc_id = $1::uuid`,
        [dc.id],
      );
      let updated = 0;
      for (const line of rows) {
        const current = await client.query<{
          id: string;
          status: string;
          requires_local_conversion: boolean;
          transfer_target_region_id: string | null;
          transfer_source_region_id: string | null;
          transfer_source_store_id: string | null;
          transfer_source_reference: string | null;
          destination_store_id: string | null;
        }>(
          `SELECT id, status, requires_local_conversion, transfer_target_region_id, transfer_source_region_id,
                  transfer_source_store_id, transfer_source_reference, destination_store_id
           FROM srf_jobs
           WHERE id = $1::uuid
           FOR UPDATE`,
          [line.srf_id],
        );
        const row = current.rows[0];
        if (!row || row.status !== "in_transit_sc") continue;
        const isReturnToSenderHo = !row.requires_local_conversion && !!row.transfer_source_region_id;
        if (isReturnToSenderHo) {
          // Recover the true booking store from the parent SRF (legacy data safety).
          let recoveredDestinationStoreId: string | null = null;
          if (row.transfer_source_reference) {
            const { rows: parentRows } = await client.query<{ destination_store_id: string | null }>(
              `SELECT destination_store_id FROM srf_jobs
               WHERE reference = $1
                 AND id <> $2::uuid
                 AND destination_store_id IS NOT NULL
               ORDER BY created_at ASC
               LIMIT 1`,
              [row.transfer_source_reference, line.srf_id],
            );
            recoveredDestinationStoreId = parentRows[0]?.destination_store_id ?? null;
          }
          // Defensive: explicitly normalize region_id / store_id to the inwarding HO (sender HO).
          // This guarantees the SRF appears in the sender HO outward queue regardless of any
          // upstream state drift (region_id always reflects the DC's destination region;
          // store_id reflects the inwarding HO store so logistics filters line up).
          // destination_store_id prefers the parent-recovered booking store so legacy SRFs
          // (where the original convert-local set destination to NULL or a receiver-HO store)
          // are auto-healed at inward time.
          const updReturn = await client.query(
            `UPDATE srf_jobs
             SET status = 'ready_for_outward',
                 region_id = $3::text,
                 store_id = COALESCE($4::text, store_id),
                 inward_at = now(),
                 ready_for_outward_at = now(),
                 destination_store_id = COALESCE($5::text, destination_store_id, transfer_source_store_id),
                 requires_local_conversion = false,
                 transfer_target_region_id = NULL,
                 transfer_target_store_id = NULL,
                 transfer_source_region_id = NULL,
                 transfer_source_store_id = NULL,
                 updated_at = now(),
                 modified_by = $2
             WHERE id = $1::uuid AND status = 'in_transit_sc'`,
            [line.srf_id, actor.id, dc.region_id, actor.storeId ?? dc.from_store_id ?? null, recoveredDestinationStoreId],
          );
          if ((updReturn.rowCount ?? 0) > 0) {
            await appendStatusHistory(
              client,
              line.srf_id,
              "ready_for_outward",
              actor.id,
              `Inwarded return DC ${dcNumber}. Sender HO can now dispatch to store.`,
            );
            await appendActionLog(client, line.srf_id, {
              action: "sender_ho_inward_return_dc",
              description: `Sender HO inwarded the return DC ${dcNumber} after repair at other HO. Ready to dispatch to store.`,
              actor,
              referenceDoc: dcNumber,
            });
            updated += 1;
          }
        } else {
          const upd = await client.query(
            `UPDATE srf_jobs
             SET status = 'received_at_sc',
                 inward_at = now(),
                 store_id = CASE WHEN requires_local_conversion THEN $3::text ELSE store_id END,
                 updated_at = now(),
                 modified_by = $2
             WHERE id = $1::uuid AND status = 'in_transit_sc'`,
            [line.srf_id, actor.id, dc.from_store_id ?? null],
          );
          if ((upd.rowCount ?? 0) > 0) {
            await appendStatusHistory(client, line.srf_id, "received_at_sc", actor.id, `Inwarded by DC ${dcNumber}.`);
            await appendActionLog(client, line.srf_id, {
              action: "sc_inward_dc",
              description: `Service centre inwarded watch via DC ${dcNumber}.`,
              actor,
              referenceDoc: dcNumber,
            });
            updated += 1;
          }
        }
      }
      await client.query(
        `UPDATE delivery_challans
         SET status = 'INWARDED', updated_at = now(), modified_by = $2
         WHERE id = $1::uuid`,
        [dc.id, actor.id],
      );
      await client.query("COMMIT");
      res.json({ updated });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(e);
      res.status(400).json({ error: "Could not inward DC." });
    } finally {
      client.release();
    }
  });

  app.post("/api/service/srf-jobs/:srfId/assign", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || (actor.role !== "service_centre_supervisor" && actor.role !== "super_admin" && actor.role !== "admin")) {
      res.status(403).json({ error: "Only supervisor/admin can assign technician." });
      return;
    }
    const srfId = String(req.params.srfId ?? "").trim();
    const technicianId = String(req.body?.technicianId ?? "").trim();
    if (!srfId || !technicianId) {
      res.status(400).json({ error: "srfId and technicianId are required." });
      return;
    }
    try {
      const techRes = await pool.query<{ full_name: string; grade: string; is_active: boolean }>(
        `SELECT full_name, grade, is_active
         FROM technician_profiles
         WHERE id = $1::uuid
         LIMIT 1`,
        [technicianId],
      );
      const tech = techRes.rows[0];
      if (!tech || !tech.is_active) {
        res.status(400).json({ error: "Selected technician is invalid or inactive." });
        return;
      }
      const upd = await pool.query(
        `UPDATE srf_jobs
         SET status = 'assigned',
             assigned_technician_id = $2,
             assigned_at = now(),
             updated_at = now(),
             modified_by = $3
         WHERE id = $1::uuid
           AND status = 'received_at_sc'
           AND COALESCE(requires_local_conversion, false) = false`,
        [srfId, technicianId, actor.id],
      );
      if ((upd.rowCount ?? 0) === 0) {
        res.status(400).json({ error: "SRF must be in received_at_sc state for assignment." });
        return;
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await appendStatusHistory(client, srfId, "assigned", actor.id, `Assigned to technician ${tech.full_name} (${tech.grade}).`);
        await appendActionLog(client, srfId, {
          action: "supervisor_assign_technician",
          description: `Supervisor assigned technician ${tech.full_name} (${tech.grade}).`,
          actor,
          details: { technicianId, technicianName: tech.full_name, technicianGrade: tech.grade },
        });
        await client.query("COMMIT");
      } catch {
        await client.query("ROLLBACK").catch(() => {});
      } finally {
        client.release();
      }
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Could not assign technician." });
    }
  });

  app.post("/api/service/srf-jobs/:srfId/supervisor/reestimate", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || !canSupervisorDecide(actor)) {
      res.status(403).json({ error: "Only supervisor/admin can mark re-estimate." });
      return;
    }
    const srfId = String(req.params.srfId ?? "").trim();
    const note = String(req.body?.note ?? "").trim();
    const amountRaw = req.body?.estimateTotalInr;
    const amount = Number(amountRaw);
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: "Valid re-estimate amount is required." });
      return;
    }
    if (!note) {
      res.status(400).json({ error: "Re-estimate remark is required." });
      return;
    }
    try {
      const prior = await pool.query<{ status: string }>(
        `SELECT status FROM srf_jobs WHERE id = $1::uuid`,
        [srfId],
      );
      const wasRejected = prior.rows[0]?.status === "customer_rejected";
      const upd = await pool.query(
        `UPDATE srf_jobs
         SET status = 'reestimate_required',
             reestimate_requested_inr = $4,
             reestimate_requested_note = $3,
             reestimate_requested_at = now(),
             customer_reestimate_response = NULL,
             customer_reestimate_responded_at = NULL,
             updated_at = now(),
             modified_by = $2
         WHERE id = $1::uuid
           AND status IN ('assigned', 'estimate_ok', 'customer_rejected')`,
        [srfId, actor.id, note, amount],
      );
      if ((upd.rowCount ?? 0) === 0) {
        res.status(400).json({ error: "Only assigned/estimate-ok/customer-rejected SRFs can be marked re-estimate." });
        return;
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        if (wasRejected) {
          await recordSupervisorFollowup(client, srfId, {
            followup: "negotiate",
            note,
            actor,
          });
          await appendActionLog(client, srfId, {
            action: "supervisor_negotiate_after_rejection",
            description: `Supervisor negotiated with customer after rejection and is sending a revised estimate of INR ${amount.toFixed(2)}.`,
            amountInr: amount,
            actor,
            details: { remark: note },
          });
        }
        await appendStatusHistory(client, srfId, "reestimate_required", actor.id, `Re-estimate INR ${amount.toFixed(2)}: ${note}`);
        const attempt = await startReestimateAttempt(client, srfId, {
          amountInr: amount,
          remark: note,
          raisedBy: actor,
        });
        await appendActionLog(client, srfId, {
          action: "supervisor_request_reestimate",
          description: `Supervisor raised re-estimate attempt #${attempt.attemptNo} for INR ${amount.toFixed(2)}: ${note}`,
          amountInr: amount,
          actor,
          details: { attemptNo: attempt.attemptNo, remark: note },
        });
        await client.query("COMMIT");
      } catch {
        await client.query("ROLLBACK").catch(() => {});
      } finally {
        client.release();
      }
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Could not mark re-estimate." });
    }
  });

  app.post("/api/service/srf-jobs/:srfId/supervisor/reestimate-approve", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || !canSupervisorDecide(actor)) {
      res.status(403).json({ error: "Only supervisor/admin can approve re-estimate." });
      return;
    }
    res.status(400).json({
      error: "Manual re-estimate approval is disabled. Customer must approve from tracking link to restart repair.",
    });
  });

  app.post("/api/service/srf-jobs/:srfId/supervisor/repair-complete", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || !canSupervisorDecide(actor)) {
      res.status(403).json({ error: "Only supervisor/admin can mark repair complete." });
      return;
    }
    const srfId = String(req.params.srfId ?? "").trim();
    try {
      const upd = await pool.query(
        `UPDATE srf_jobs
         SET status = 'ready_for_outward',
             completed_at_sc = now(),
             ready_for_outward_at = now(),
             estimate_ok_at = COALESCE(estimate_ok_at, now()),
             updated_at = now(),
             modified_by = $2
         WHERE id = $1::uuid
           AND status IN ('assigned', 'estimate_ok')
           AND spares_slip_submitted_at IS NOT NULL`,
        [srfId, actor.id],
      );
      if ((upd.rowCount ?? 0) === 0) {
        res.status(400).json({ error: "Submit used spares slip first, then mark completed." });
        return;
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await appendStatusHistory(client, srfId, "ready_for_outward", actor.id, "Supervisor marked repair completed.");
        await appendActionLog(client, srfId, {
          action: "supervisor_repair_complete",
          description: "Supervisor marked repair complete. Ready for outward.",
          actor,
        });
        await client.query("COMMIT");
      } catch {
        await client.query("ROLLBACK").catch(() => {});
      } finally {
        client.release();
      }
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Could not mark repair complete." });
    }
  });

  app.post("/api/service/srf-jobs/:srfId/supervisor/move-to-odc", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || !canSupervisorDecide(actor)) {
      res.status(403).json({ error: "Only supervisor/admin can move SRF to outward queue." });
      return;
    }
    const srfId = String(req.params.srfId ?? "").trim();
    const note = String(req.body?.note ?? "").trim();
    try {
      const upd = await pool.query(
        `UPDATE srf_jobs
         SET status = 'ready_for_outward',
             completed_at_sc = COALESCE(completed_at_sc, now()),
             ready_for_outward_at = now(),
             updated_at = now(),
             modified_by = $2
         WHERE id = $1::uuid
           AND status = 'customer_rejected'`,
        [srfId, actor.id],
      );
      if ((upd.rowCount ?? 0) === 0) {
        res.status(400).json({
          error: "Only customer-rejected SRFs can be moved to outward queue from this action.",
        });
        return;
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await appendStatusHistory(
          client,
          srfId,
          "ready_for_outward",
          actor.id,
          note ||
            "Supervisor moved SRF to outward queue after customer declined re-estimate over phone. No repair done; customer will receive watch without billing.",
        );
        await recordSupervisorFollowup(client, srfId, {
          followup: "move_to_odc",
          note,
          actor,
        });
        await appendActionLog(client, srfId, {
          action: "supervisor_move_to_odc",
          description:
            note ||
            "Supervisor moved SRF to outward queue (customer declined re-estimate; no repair).",
          actor,
          details: { reason: note },
        });
        await client.query("COMMIT");
      } catch {
        await client.query("ROLLBACK").catch(() => {});
      } finally {
        client.release();
      }
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Could not move SRF to outward queue." });
    }
  });

  app.post("/api/service/srf-jobs/:srfId/supervisor/transfer-other-ho", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || !canSupervisorDecide(actor)) {
      res.status(403).json({ error: "Only supervisor/admin can transfer to other HO." });
      return;
    }
    const srfId = String(req.params.srfId ?? "").trim();
    const targetRegionId = String(req.body?.targetRegionId ?? "").trim();
    const note = String(req.body?.note ?? "").trim();
    if (!targetRegionId) {
      res.status(400).json({ error: "targetRegionId is required." });
      return;
    }
    if (targetRegionId === (actor.regionId ?? "")) {
      res.status(400).json({ error: "Select a different HO region." });
      return;
    }
    try {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const targetStore = await client.query<{ id: string }>(
          `SELECT id FROM stores WHERE region_id = $1::text ORDER BY created_at ASC LIMIT 1`,
          [targetRegionId],
        );
        const targetStoreId = targetStore.rows[0]?.id;
        if (!targetStoreId) {
          await client.query("ROLLBACK");
          res.status(400).json({ error: "No HO destination store configured for target region." });
          return;
        }
        const base = await client.query<{ region_id: string; store_id: string; reference: string; status: string }>(
          `SELECT region_id, store_id, reference, status
           FROM srf_jobs
           WHERE id = $1::uuid
           FOR UPDATE`,
          [srfId],
        );
        const current = base.rows[0];
        if (!current || !["assigned", "estimate_ok"].includes(current.status)) {
          await client.query("ROLLBACK");
          res.status(400).json({ error: "Only assigned/estimate-ok SRFs can be transferred to other HO." });
          return;
        }
        await client.query(
          `UPDATE srf_jobs
           SET status = 'ready_for_outward',
               requires_local_conversion = true,
               transfer_target_region_id = $3::text,
               transfer_target_store_id = $4::text,
               transfer_source_region_id = $5::text,
               transfer_source_store_id = $6::text,
               transfer_source_reference = COALESCE(NULLIF(transfer_source_reference, ''), reference),
               destination_store_id = COALESCE(destination_store_id, $6::text),
               dc_number = NULL,
               outward_dc_number = NULL,
               dispatched_to_sc_at = NULL,
               inward_at = NULL,
               assigned_technician_id = NULL,
               assigned_at = NULL,
               estimate_ok_at = NULL,
               completed_at_sc = NULL,
               ready_for_outward_at = now(),
               dispatched_to_store_at = NULL,
               received_back_at_store_at = NULL,
               updated_at = now(),
               modified_by = $2
           WHERE id = $1::uuid`,
          [srfId, actor.id, targetRegionId, targetStoreId, current.region_id, current.store_id],
        );
        await appendStatusHistory(
          client,
          srfId,
          "ready_for_outward",
          actor.id,
          note || `Queued for transfer to HO ${targetRegionId}. Create Outward DC to dispatch.`,
        );
        await appendActionLog(client, srfId, {
          action: "supervisor_transfer_other_ho",
          description:
            note || `Queued SRF for transfer to HO region ${targetRegionId}.`,
          actor,
          details: {
            targetRegionId,
            targetStoreId,
            sourceRegionId: current.region_id,
            sourceStoreId: current.store_id,
          },
        });
        await client.query("COMMIT");
        res.json({ ok: true, queued: true });
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        console.error(e);
        res.status(400).json({ error: "Could not queue transfer to other HO." });
      } finally {
        client.release();
      }
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Could not queue transfer to other HO." });
    }
  });

  app.post("/api/service/srf-jobs/:srfId/convert-local", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || !canSupervisorDecide(actor)) {
      res.status(403).json({ error: "Only supervisor/admin can convert transferred SRF." });
      return;
    }
    const srfId = String(req.params.srfId ?? "").trim();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const base = await client.query<{
        reference: string;
        region_id: string;
        store_id: string;
        customer_name: string;
        phone: string;
        customer_kind: "B2C" | "B2B";
        company: string | null;
        watch_brand: string;
        watch_model: string;
        serial: string;
        complaint: string;
        estimate_total_inr: number;
        estimated_finish_date: string | null;
        advance_inr: number;
        advance_payment_mode: string | null;
        advance_payment_details: unknown;
        selected_part_ids: unknown;
        status: string;
        dc_number: string | null;
        dispatched_to_sc_at: string | null;
        inward_at: string | null;
        destination_store_id: string | null;
        requires_local_conversion: boolean;
        transfer_source_reference: string | null;
        transfer_source_region_id: string | null;
        transfer_source_store_id: string | null;
        transfer_target_region_id: string | null;
        transfer_target_store_id: string | null;
      }>(
        `SELECT reference, region_id, store_id, customer_name, phone, customer_kind, company,
                watch_brand, watch_model, serial, complaint, estimate_total_inr::float8,
                estimated_finish_date::text,
                advance_inr::float8, advance_payment_mode, advance_payment_details, selected_part_ids,
                status, dc_number, dispatched_to_sc_at, inward_at, destination_store_id, requires_local_conversion,
                transfer_source_reference, transfer_source_region_id, transfer_source_store_id,
                transfer_target_region_id, transfer_target_store_id
         FROM srf_jobs
         WHERE id = $1::uuid
         FOR UPDATE`,
        [srfId],
      );
      const row = base.rows[0];
      if (!row || row.status !== "received_at_sc" || !row.requires_local_conversion) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "SRF is not pending local conversion." });
        return;
      }
      const receiverRegionId = String(actor.regionId ?? "").trim();
      if (!receiverRegionId) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Receiver HO region is not mapped for this login." });
        return;
      }
      const { rows: receiverStoreRows } = await client.query<{ id: string; name: string }>(
        `SELECT id, name FROM stores WHERE region_id = $1::text ORDER BY created_at ASC LIMIT 1`,
        [receiverRegionId],
      );
      const receiverStoreId = receiverStoreRows[0]?.id;
      const receiverStoreName = receiverStoreRows[0]?.name;
      if (!receiverStoreId) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "No HO store configured for receiver region." });
        return;
      }
      const { prefix, suffix } = await getSeriesPrefixSuffix(client, "srf", "SRF");
      const newRef = await nextDocNumber(client, prefix, suffix, srfStoreScopeCode(receiverStoreName, receiverStoreId));
      // Resolve the ORIGINAL sender HO context. After the outward+inward steps the parent SRF's
      // region_id/store_id no longer point to the sender — they hold the receiver region and the
      // sender HO store. The original sender region/store and the original booking store live in
      // transfer_source_region_id / transfer_source_store_id / destination_store_id.
      const senderRegionId = row.transfer_source_region_id ?? row.region_id;
      const senderStoreId = row.transfer_source_store_id ?? row.store_id;
      const originalBookingStoreId = row.destination_store_id ?? senderStoreId;
      const parentReference = row.transfer_source_reference ?? row.reference;
      const ins = await client.query<{ id: string }>(
        `INSERT INTO srf_jobs (
          reference, region_id, store_id, customer_name, phone, customer_kind, company,
          watch_brand, watch_model, serial, complaint, estimate_total_inr, estimated_finish_date, advance_inr, advance_payment_mode, advance_payment_details, selected_part_ids,
          status, dc_number, dispatched_to_sc_at, inward_at, destination_store_id, photo_session_active,
          requires_local_conversion, transfer_target_region_id, transfer_target_store_id,
          transfer_source_region_id, transfer_source_store_id, transfer_source_reference,
          created_by, modified_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12, $13::date, $14, $15, $16::jsonb, $17::jsonb,
          'received_at_sc', $18, $19, $20, $21, false,
          false, $22, $23, $24, $25, $26, $27, $27
        )
        RETURNING id`,
        [
          newRef,
          receiverRegionId,
          receiverStoreId,
          row.customer_name,
          row.phone,
          row.customer_kind,
          row.company,
          row.watch_brand,
          row.watch_model,
          row.serial,
          row.complaint,
          row.estimate_total_inr,
          row.estimated_finish_date,
          row.advance_inr ?? 0,
          row.advance_payment_mode,
          JSON.stringify(row.advance_payment_details ?? {}),
          JSON.stringify(row.selected_part_ids ?? []),
          null,
          null,
          null,
          originalBookingStoreId, // destination_store_id ($21) - original booking store (CHN03)
          senderRegionId, // transfer_target_region_id ($22) - flag: return target = sender HO region
          senderStoreId, // transfer_target_store_id ($23) - flag: return target store
          senderRegionId, // transfer_source_region_id ($24) - original sender HO region
          senderStoreId, // transfer_source_store_id ($25) - original sender HO store (CHN03)
          parentReference, // transfer_source_reference ($26) - keep root parent SRF reference
          actor.id,
        ],
      );
      const newSrfId = ins.rows[0]?.id;
      if (!newSrfId) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Could not create local SRF." });
        return;
      }
      await client.query(
        `UPDATE srf_jobs
         SET status = 'sent_to_other_ho',
             updated_at = now(),
             modified_by = $2
         WHERE id = $1::uuid`,
        [srfId, actor.id],
      );
      await appendStatusHistory(
        client,
        srfId,
        "sent_to_other_ho",
        actor.id,
        `Converted by receiver HO. Local SRF created: ${newRef}. Sender SRF remains for tracking.`,
      );

      // Deep Clone: Copy photos from sender SRF to local SRF
      await client.query(
        `INSERT INTO srf_job_photos (srf_id, photo_kind, file_path, mime, bytes, created_by)
         SELECT $2::uuid, photo_kind, file_path, mime, bytes, created_by
         FROM srf_job_photos
         WHERE srf_id = $1::uuid`,
        [srfId, newSrfId],
      );

      // Deep Clone: Copy history from sender SRF to local SRF
      await client.query(
        `INSERT INTO srf_status_history (srf_id, status, note, changed_by, changed_at)
         SELECT $2::uuid, status, note, changed_by, changed_at
         FROM srf_status_history
         WHERE srf_id = $1::uuid`,
        [srfId, newSrfId],
      );

      await appendStatusHistory(
        client,
        newSrfId,
        "received_at_sc",
        actor.id,
        `Auto-created local SRF ${newRef}. Source HO reference: ${row.transfer_source_reference ?? row.reference}.`,
      );
      await appendActionLog(client, srfId, {
        action: "convert_to_local_close_source",
        description: `Source SRF closed; cloned as local SRF ${newRef}.`,
        actor,
        details: { childSrfId: newSrfId, childReference: newRef },
      });
      await appendActionLog(client, newSrfId, {
        action: "convert_to_local_new_child",
        description: `Local SRF created from source ${row.transfer_source_reference ?? row.reference}.`,
        actor,
        details: { parentSrfId: srfId, parentReference: row.transfer_source_reference ?? row.reference },
      });
      await client.query("COMMIT");
      res.json({ ok: true, reference: newRef, newSrfId });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(e);
      res.status(400).json({ error: "Could not convert transferred SRF." });
    } finally {
      client.release();
    }
  });

  app.post("/api/service/srf-jobs/:srfId/technician/estimate-ok", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || actor.role !== "technician" || !actor.technicianProfileId) {
      res.status(403).json({ error: "Only assigned technician can confirm estimate." });
      return;
    }
    const srfId = String(req.params.srfId ?? "").trim();
    try {
      const upd = await pool.query(
        `UPDATE srf_jobs
         SET status = 'estimate_ok',
             estimate_ok_at = now(),
             updated_at = now(),
             modified_by = $2
         WHERE id = $1::uuid
           AND status = 'assigned'
           AND assigned_technician_id = $3`,
        [srfId, actor.id, actor.technicianProfileId],
      );
      if ((upd.rowCount ?? 0) === 0) {
        res.status(400).json({ error: "Only assigned jobs in assigned state can be updated." });
        return;
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await appendStatusHistory(client, srfId, "estimate_ok", actor.id, "Technician confirmed estimate OK.");
        await appendActionLog(client, srfId, {
          action: "technician_estimate_ok",
          description: `Technician ${actor.displayName} confirmed estimate OK.`,
          actor,
        });
        await client.query("COMMIT");
      } catch {
        await client.query("ROLLBACK").catch(() => {});
      } finally {
        client.release();
      }
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Could not set estimate ok." });
    }
  });

  app.post("/api/service/srf-jobs/:srfId/technician/reestimate", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || actor.role !== "technician" || !actor.technicianProfileId) {
      res.status(403).json({ error: "Only assigned technician can request re-estimate." });
      return;
    }
    const srfId = String(req.params.srfId ?? "").trim();
    const note = String(req.body?.note ?? "").trim();
    try {
      const upd = await pool.query(
        `UPDATE srf_jobs
         SET status = 'reestimate_required',
             reestimate_requested_inr = estimate_total_inr,
             reestimate_requested_note = $4,
             reestimate_requested_at = now(),
             customer_reestimate_response = NULL,
             customer_reestimate_responded_at = NULL,
             updated_at = now(),
             modified_by = $2
         WHERE id = $1::uuid
           AND status = 'assigned'
           AND assigned_technician_id = $3`,
        [srfId, actor.id, actor.technicianProfileId, note || "Technician requested re-estimate."],
      );
      if ((upd.rowCount ?? 0) === 0) {
        res.status(400).json({ error: "Only assigned jobs in assigned state can be marked for re-estimate." });
        return;
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await appendStatusHistory(client, srfId, "reestimate_required", actor.id, note || "Technician requested re-estimate.");
        const baseRow = await client.query<{ amt: number | null }>(
          `SELECT estimate_total_inr::float8 AS amt FROM srf_jobs WHERE id = $1::uuid`,
          [srfId],
        );
        const baseAmount = Number(baseRow.rows[0]?.amt ?? 0);
        const attempt = await startReestimateAttempt(client, srfId, {
          amountInr: baseAmount,
          remark: note || "Technician requested re-estimate.",
          raisedBy: actor,
        });
        await appendActionLog(client, srfId, {
          action: "technician_request_reestimate",
          description: `Technician raised re-estimate attempt #${attempt.attemptNo}: ${note || "(no remark)"}`,
          amountInr: baseAmount,
          actor,
          details: { attemptNo: attempt.attemptNo, remark: note },
        });
        await client.query("COMMIT");
      } catch {
        await client.query("ROLLBACK").catch(() => {});
      } finally {
        client.release();
      }
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Could not set re-estimate required." });
    }
  });

  app.post("/api/service/srf-jobs/:srfId/spares-slip", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || !(actor.role === "technician" || canSupervisorDecide(actor))) {
      res.status(403).json({ error: "Only technician/supervisor can submit used spares slip." });
      return;
    }
    const srfId = String(req.params.srfId ?? "").trim();
    const lines = Array.isArray(req.body?.lines)
      ? req.body.lines
          .map((x: unknown) => ({
            spareId: String((x as { spareId?: unknown })?.spareId ?? "").trim(),
            name: String((x as { name?: unknown })?.name ?? "").trim(),
            qty: Number((x as { qty?: unknown })?.qty ?? 0),
            unitPriceInr: Number((x as { unitPriceInr?: unknown })?.unitPriceInr ?? 0),
            lineTotalInr: Number((x as { lineTotalInr?: unknown })?.lineTotalInr ?? 0),
          }))
          .filter((x: { spareId: string; name: string; qty: number; unitPriceInr: number; lineTotalInr: number }) => x.spareId.length > 0 && x.name.length > 0 && Number.isFinite(x.qty) && x.qty > 0)
      : [];
    if (lines.length === 0) {
      res.status(400).json({ error: "Provide at least one spare line with spareId, name, and qty." });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const params: unknown[] = [srfId, actor.id, JSON.stringify(lines)];
      let where = `id = $1::uuid AND status IN ('assigned', 'estimate_ok')`;
      if (actor.role === "technician") {
        where += " AND assigned_technician_id = $4";
        params.push(actor.technicianProfileId);
      }
      const upd = await client.query<{ region_id: string; reference: string }>(
        `UPDATE srf_jobs
         SET used_spares = $3::jsonb,
             spares_slip_submitted_at = now(),
             spares_slip_submitted_by = $2,
             updated_at = now(),
             modified_by = $2
         WHERE ${where}
         RETURNING region_id, reference`,
        params,
      );
      if ((upd.rowCount ?? 0) === 0) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "SRF must be assigned/estimate-ok and visible to you." });
        return;
      }
      const regionId = upd.rows[0]!.region_id;
      const srfRef = upd.rows[0]!.reference;
      const locationKey = `HO:${regionId}`;
      const usage = new Map<string, { qty: number; name: string }>();
      for (const l of lines) {
        const prev = usage.get(l.spareId) ?? { qty: 0, name: l.name };
        usage.set(l.spareId, { qty: prev.qty + Number(l.qty), name: prev.name || l.name });
      }
      for (const [spareId, entry] of usage.entries()) {
        const stock = await client.query<{ quantity: number }>(
          `SELECT quantity::float8 AS quantity
           FROM spare_stock
           WHERE spare_id = $1::uuid AND location_key = $2
           FOR UPDATE`,
          [spareId, locationKey],
        );
        const available = Number(stock.rows[0]?.quantity ?? 0);
        if (available < entry.qty) {
          await client.query("ROLLBACK");
          res.status(400).json({
            error: `Insufficient HO stock for ${entry.name}. Available ${available}, required ${entry.qty}.`,
          });
          return;
        }
      }
      for (const [spareId, entry] of usage.entries()) {
        await client.query(
          `UPDATE spare_stock
           SET quantity = quantity - $3, updated_at = now()
           WHERE spare_id = $1::uuid AND location_key = $2`,
          [spareId, locationKey, entry.qty],
        );
        const bal = await client.query<{ quantity: number }>(
          `SELECT quantity::float8 AS quantity
           FROM spare_stock
           WHERE spare_id = $1::uuid AND location_key = $2`,
          [spareId, locationKey],
        );
        await appendStockHistory(client, {
          spareId,
          eventType: "TRANSFER_OUT",
          locationKey,
          locationType: "HO",
          regionId,
          quantityChange: -entry.qty,
          balanceAfter: Number(bal.rows[0]?.quantity ?? 0),
          referenceType: "MANUAL",
          referenceNumber: srfRef,
          note: `SRF used spares deducted for ${srfRef}.`,
          createdBy: actor.id,
        });
      }
      await appendStatusHistory(client, srfId, "estimate_ok", actor.id, "Used spares slip submitted.");
      const totalInr = lines.reduce(
        (sum: number, l: { lineTotalInr: number; unitPriceInr: number; qty: number }) =>
          sum + (Number.isFinite(l.lineTotalInr) ? l.lineTotalInr : l.unitPriceInr * l.qty),
        0,
      );
      await appendActionLog(client, srfId, {
        action: "spares_slip_submitted",
        description: `Used spares slip submitted (${lines.length} line${lines.length === 1 ? "" : "s"}, INR ${totalInr.toFixed(2)}).`,
        amountInr: totalInr,
        actor,
        details: { lines },
      });
      await client.query("COMMIT");
      res.json({ ok: true });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(e);
      res.status(400).json({ error: "Could not submit used spares slip." });
    } finally {
      client.release();
    }
  });

  app.post("/api/service/srf-jobs/:srfId/technician/repair-complete", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || actor.role !== "technician" || !actor.technicianProfileId) {
      res.status(403).json({ error: "Only assigned technician can mark repair complete." });
      return;
    }
    const srfId = String(req.params.srfId ?? "").trim();
    try {
      const upd = await pool.query(
        `UPDATE srf_jobs
         SET status = 'ready_for_outward',
             completed_at_sc = now(),
             ready_for_outward_at = now(),
             updated_at = now(),
             modified_by = $2
         WHERE id = $1::uuid
           AND status = 'estimate_ok'
           AND assigned_technician_id = $3
           AND spares_slip_submitted_at IS NOT NULL`,
        [srfId, actor.id, actor.technicianProfileId],
      );
      if ((upd.rowCount ?? 0) === 0) {
        res.status(400).json({ error: "Submit used spares slip first, then mark repair complete." });
        return;
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await appendStatusHistory(client, srfId, "ready_for_outward", actor.id, "Repair completed.");
        await appendActionLog(client, srfId, {
          action: "technician_repair_complete",
          description: `Technician ${actor.displayName} marked repair complete.`,
          actor,
        });
        await client.query("COMMIT");
      } catch {
        await client.query("ROLLBACK").catch(() => {});
      } finally {
        client.release();
      }
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Could not mark repair complete." });
    }
  });

  app.post("/api/service/srf-jobs/:srfId/brand/send", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!canManageBrandDesk(actor)) {
      res.status(403).json({ error: "Only supervisor/admin can send to brand." });
      return;
    }
    const srfId = String(req.params.srfId ?? "").trim();
    const dispatchRef = String(req.body?.dispatchRef ?? "").trim() || null;
    const note = String(req.body?.note ?? "").trim();
    const docPath = String(req.body?.dispatchDocPath ?? "").trim() || null;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const row = await client.query<{ status: string; assigned_technician_id: string | null; region_id: string }>(
        `SELECT status, assigned_technician_id, region_id FROM srf_jobs WHERE id = $1::uuid FOR UPDATE`,
        [srfId],
      );
      const srf = row.rows[0];
      if (!srf) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "SRF not found." });
        return;
      }
      if (!["assigned", "estimate_ok", "reestimate_required"].includes(srf.status)) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "SRF must be assigned/estimate_ok/reestimate_required to send to brand." });
        return;
      }
      const brandOdcNumber = await nextDocNumber(client, "ODC", "", scopeCode(srf.region_id, "BRD"));
      await client.query(
        `UPDATE srf_jobs
         SET status = 'sent_to_brand',
             brand_sent_at = now(),
             brand_dispatch_ref = $2,
             brand_dispatch_note = $3,
             brand_dispatch_doc_path = $4,
             brand_odc_number = $5,
             updated_at = now(),
             modified_by = $6
         WHERE id = $1::uuid`,
        [srfId, dispatchRef, note || null, docPath, brandOdcNumber, actor.id],
      );
      await appendStatusHistory(
        client,
        srfId,
        "sent_to_brand",
        actor.id,
        note || `Sent to brand for external repair via ODC ${brandOdcNumber}.`,
      );
      await appendActionLog(client, srfId, {
        action: "brand_send",
        description: "Watch sent to brand for external repair.",
        actor,
        referenceDoc: brandOdcNumber,
        details: { dispatchRef, dispatchDocPath: docPath, brandOdcNumber, note },
      });
      await client.query("COMMIT");
      res.json({ ok: true, brandOdcNumber });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(e);
      res.status(400).json({ error: "Could not mark SRF as sent to brand." });
    } finally {
      client.release();
    }
  });

  app.post("/api/service/srf-jobs/:srfId/brand/estimate", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!canManageBrandDesk(actor)) {
      res.status(403).json({ error: "Only supervisor/admin can log brand estimate." });
      return;
    }
    const srfId = String(req.params.srfId ?? "").trim();
    const estimateInr = Number(req.body?.estimateInr ?? 0);
    const currency = String(req.body?.currency ?? "INR").trim().toUpperCase() || "INR";
    const note = String(req.body?.note ?? "").trim();
    if (!Number.isFinite(estimateInr) || estimateInr <= 0) {
      res.status(400).json({ error: "Valid brand estimate amount is required." });
      return;
    }
    try {
      const upd = await pool.query(
        `UPDATE srf_jobs
         SET status = 'brand_estimate_pending',
             brand_estimate_inr = $2,
             brand_estimate_currency = $3,
             brand_estimate_received_at = now(),
             brand_estimate_email_meta = $4::jsonb,
             updated_at = now(),
             modified_by = $5
         WHERE id = $1::uuid
           AND status IN ('sent_to_brand', 'brand_estimate_pending')`,
        [srfId, estimateInr, currency, JSON.stringify(toJsonMeta(req.body?.emailMeta)), actor?.id ?? null],
      );
      if ((upd.rowCount ?? 0) === 0) {
        res.status(400).json({ error: "SRF must be in sent_to_brand/brand_estimate_pending state." });
        return;
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await appendStatusHistory(
          client,
          srfId,
          "brand_estimate_pending",
          actor?.id ?? null,
          note || `Brand estimate received: ${currency} ${estimateInr.toFixed(2)}.`,
        );
        await appendActionLog(client, srfId, {
          action: "brand_estimate_received",
          description: `Brand estimate logged (${currency} ${estimateInr.toFixed(2)}).`,
          actor: actor ?? undefined,
          amountInr: currency === "INR" ? estimateInr : null,
          details: { estimateInr, currency, note, emailMeta: toJsonMeta(req.body?.emailMeta) },
        });
        await client.query("COMMIT");
      } catch {
        await client.query("ROLLBACK").catch(() => {});
      } finally {
        client.release();
      }
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Could not log brand estimate." });
    }
  });

  app.post("/api/service/srf-jobs/:srfId/brand/approve", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!canManageBrandDesk(actor)) {
      res.status(403).json({ error: "Only supervisor/admin can approve brand estimate." });
      return;
    }
    const srfId = String(req.params.srfId ?? "").trim();
    const note = String(req.body?.note ?? "").trim();
    try {
      const upd = await pool.query(
        `UPDATE srf_jobs
         SET status = 'brand_approved',
             brand_ho_approval_sent_at = now(),
             brand_ho_approval_email_meta = $2::jsonb,
             updated_at = now(),
             modified_by = $3
         WHERE id = $1::uuid
           AND status = 'brand_estimate_pending'`,
        [srfId, JSON.stringify(toJsonMeta(req.body?.emailMeta)), actor?.id ?? null],
      );
      if ((upd.rowCount ?? 0) === 0) {
        res.status(400).json({ error: "SRF must be in brand_estimate_pending state." });
        return;
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await appendStatusHistory(client, srfId, "brand_approved", actor?.id ?? null, note || "HO approved brand estimate.");
        await appendActionLog(client, srfId, {
          action: "brand_estimate_approved",
          description: "HO approval sent to brand.",
          actor: actor ?? undefined,
          details: { note, emailMeta: toJsonMeta(req.body?.emailMeta) },
        });
        await client.query("COMMIT");
      } catch {
        await client.query("ROLLBACK").catch(() => {});
      } finally {
        client.release();
      }
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Could not approve brand estimate." });
    }
  });

  app.post("/api/service/srf-jobs/:srfId/brand/receive-return", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!canManageBrandDesk(actor)) {
      res.status(403).json({ error: "Only supervisor/admin can mark brand return receipt." });
      return;
    }
    const srfId = String(req.params.srfId ?? "").trim();
    const note = String(req.body?.note ?? "").trim();
    try {
      const upd = await pool.query(
        `UPDATE srf_jobs
         SET status = 'received_from_brand',
             brand_return_received_at = now(),
             brand_inward_ref = COALESCE(brand_inward_ref, brand_odc_number),
             updated_at = now(),
             modified_by = $2
         WHERE id = $1::uuid
           AND status IN ('brand_approved', 'brand_repair_in_progress')`,
        [srfId, actor?.id ?? null],
      );
      if ((upd.rowCount ?? 0) === 0) {
        res.status(400).json({ error: "SRF must be in brand_approved/brand_repair_in_progress state." });
        return;
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const r = await client.query<{ brand_odc_number: string | null }>(
          `SELECT brand_odc_number FROM srf_jobs WHERE id = $1::uuid`,
          [srfId],
        );
        const ref = r.rows[0]?.brand_odc_number ?? null;
        await appendStatusHistory(
          client,
          srfId,
          "received_from_brand",
          actor?.id ?? null,
          note || `Watch received back from brand against DC ${ref ?? "-"}.`,
        );
        await appendActionLog(client, srfId, {
          action: "brand_return_received",
          description: "Watch received at HO from brand.",
          actor: actor ?? undefined,
          referenceDoc: ref,
          details: { note, inwardAgainstDc: ref },
        });
        await client.query("COMMIT");
      } catch {
        await client.query("ROLLBACK").catch(() => {});
      } finally {
        client.release();
      }
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Could not mark brand return receipt." });
    }
  });

  app.post("/api/service/srf-jobs/:srfId/brand/invoice", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!canManageBrandDesk(actor)) {
      res.status(403).json({ error: "Only supervisor/admin can log brand invoice." });
      return;
    }
    const srfId = String(req.params.srfId ?? "").trim();
    const invoiceRef = String(req.body?.invoiceRef ?? "").trim();
    const invoiceAmountInr = Number(req.body?.invoiceAmountInr ?? 0);
    const note = String(req.body?.note ?? "").trim();
    if (!invoiceRef) {
      res.status(400).json({ error: "Brand invoice reference is required." });
      return;
    }
    if (!Number.isFinite(invoiceAmountInr) || invoiceAmountInr <= 0) {
      res.status(400).json({ error: "Valid brand invoice amount is required." });
      return;
    }
    try {
      const upd = await pool.query(
        `UPDATE srf_jobs
         SET status = 'ready_for_outward',
             completed_at_sc = COALESCE(completed_at_sc, now()),
             ready_for_outward_at = COALESCE(ready_for_outward_at, now()),
             estimate_ok_at = COALESCE(estimate_ok_at, now()),
             estimate_total_inr = $3,
             brand_invoice_ref = $2,
             brand_invoice_amount_inr = $3,
             brand_invoice_meta = $4::jsonb,
             updated_at = now(),
             modified_by = $5
         WHERE id = $1::uuid
           AND status = 'received_from_brand'`,
        [srfId, invoiceRef, invoiceAmountInr, JSON.stringify(toJsonMeta(req.body?.invoiceMeta)), actor?.id ?? null],
      );
      if ((upd.rowCount ?? 0) === 0) {
        res.status(400).json({ error: "SRF must be in received_from_brand state." });
        return;
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await appendStatusHistory(client, srfId, "ready_for_outward", actor?.id ?? null, note || `Brand invoice logged (${invoiceRef}).`);
        await appendActionLog(client, srfId, {
          action: "brand_invoice_logged",
          description: `Brand invoice logged: ${invoiceRef} (INR ${invoiceAmountInr.toFixed(2)}).`,
          actor: actor ?? undefined,
          amountInr: invoiceAmountInr,
          referenceDoc: invoiceRef,
          details: { note, invoiceMeta: toJsonMeta(req.body?.invoiceMeta) },
        });
        await client.query("COMMIT");
      } catch {
        await client.query("ROLLBACK").catch(() => {});
      } finally {
        client.release();
      }
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Could not log brand invoice." });
    }
  });

  app.post("/api/service/srf-jobs/:srfId/brand/credit-note", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!canManageBrandDesk(actor)) {
      res.status(403).json({ error: "Only supervisor/admin can log brand credit note." });
      return;
    }
    const srfId = String(req.params.srfId ?? "").trim();
    const couponCode = String(req.body?.couponCode ?? "").trim();
    const valueInr = Number(req.body?.valueInr ?? 0);
    const validUntil = String(req.body?.validUntil ?? "").trim() || null;
    const note = String(req.body?.note ?? "").trim();
    if (!couponCode) {
      res.status(400).json({ error: "Coupon / credit note code is required." });
      return;
    }
    if (!Number.isFinite(valueInr) || valueInr <= 0) {
      res.status(400).json({ error: "Valid coupon value is required." });
      return;
    }
    try {
      const upd = await pool.query(
        `UPDATE srf_jobs
         SET status = 'brand_credit_note_pending',
             brand_coupon_code = $2,
             brand_coupon_value_inr = $3,
             brand_coupon_received_at = now(),
             brand_coupon_valid_until = $4::date,
             updated_at = now(),
             modified_by = $5
         WHERE id = $1::uuid
           AND status IN ('sent_to_brand', 'brand_estimate_pending', 'brand_approved', 'brand_repair_in_progress', 'received_from_brand')`,
        [srfId, couponCode, valueInr, validUntil, actor?.id ?? null],
      );
      if ((upd.rowCount ?? 0) === 0) {
        res.status(400).json({ error: "SRF is not in a valid brand status for coupon entry." });
        return;
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await appendStatusHistory(
          client,
          srfId,
          "brand_credit_note_pending",
          actor?.id ?? null,
          note || `Brand issued coupon ${couponCode} for INR ${valueInr.toFixed(2)}.`,
        );
        await appendActionLog(client, srfId, {
          action: "brand_credit_note_received",
          description: `Brand credit note logged (${couponCode}, INR ${valueInr.toFixed(2)}).`,
          actor: actor ?? undefined,
          amountInr: valueInr,
          referenceDoc: couponCode,
          details: { validUntil, note },
        });
        await client.query("COMMIT");
      } catch {
        await client.query("ROLLBACK").catch(() => {});
      } finally {
        client.release();
      }
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Could not log brand credit note." });
    }
  });

  app.post("/api/service/srf-jobs/:srfId/brand/notify-customer-coupon", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!canManageBrandDesk(actor)) {
      res.status(403).json({ error: "Only supervisor/admin can mark coupon notification." });
      return;
    }
    const srfId = String(req.params.srfId ?? "").trim();
    const channels = toJsonMeta(req.body?.channels);
    const note = String(req.body?.note ?? "").trim();
    try {
      const upd = await pool.query(
        `UPDATE srf_jobs
         SET status = 'brand_credit_note_active',
             customer_coupon_notified_at = now(),
             customer_coupon_notify_channels = $2::jsonb,
             updated_at = now(),
             modified_by = $3
         WHERE id = $1::uuid
           AND status IN ('brand_credit_note_pending', 'brand_credit_note_active')`,
        [srfId, JSON.stringify(channels), actor?.id ?? null],
      );
      if ((upd.rowCount ?? 0) === 0) {
        res.status(400).json({ error: "SRF must be in brand_credit_note_pending/active state." });
        return;
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await appendStatusHistory(
          client,
          srfId,
          "brand_credit_note_active",
          actor?.id ?? null,
          note || "Customer informed about brand coupon / credit note.",
        );
        await appendActionLog(client, srfId, {
          action: "brand_coupon_customer_notified",
          description: "Customer notification recorded for brand coupon.",
          actor: actor ?? undefined,
          details: { channels, note },
        });
        await client.query("COMMIT");
      } catch {
        await client.query("ROLLBACK").catch(() => {});
      } finally {
        client.release();
      }
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Could not mark coupon notification." });
    }
  });

  app.get("/api/service/srf-jobs/:srfId/inter-ho-invoice-prefill", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || !canSupervisorDecide(actor)) {
      res.status(403).json({ error: "Only supervisor/admin can create inter-HO sender invoice." });
      return;
    }
    const srfId = String(req.params.srfId ?? "").trim();
    try {
      const { rows } = await pool.query<{
        id: string;
        reference: string;
        customerName: string;
        watchBrand: string;
        watchModel: string;
        serial: string;
        complaint: string;
        fromRegionId: string;
        fromRegionName: string;
        toRegionId: string;
        toRegionName: string;
        status: string;
        usedSpares: Array<{ name: string; qty: number; unitPriceInr?: number | null }> | null;
      }>(
        `SELECT j.id,
                j.reference,
                j.customer_name AS "customerName",
                j.watch_brand AS "watchBrand",
                j.watch_model AS "watchModel",
                j.serial,
                j.complaint,
                j.region_id AS "fromRegionId",
                rr.name AS "fromRegionName",
                j.transfer_source_region_id AS "toRegionId",
                sr.name AS "toRegionName",
                j.status,
                j.used_spares AS "usedSpares"
         FROM srf_jobs j
         JOIN regions rr ON rr.id = j.region_id
         LEFT JOIN regions sr ON sr.id = j.transfer_source_region_id
         WHERE j.id = $1::uuid`,
        [srfId],
      );
      const row = rows[0];
      if (!row) {
        res.status(404).json({ error: "SRF not found." });
        return;
      }
      if (!row.toRegionId || !row.toRegionName) {
        res.status(400).json({ error: "This SRF is not in inter-HO return billing flow." });
        return;
      }
      if (row.status !== "ready_for_outward") {
        res.status(400).json({ error: "Inter-HO invoice can be created only when SRF is ready for outward." });
        return;
      }
      res.json({
        ...row,
        usedSpares: Array.isArray(row.usedSpares) ? row.usedSpares : [],
      });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Could not load inter-HO invoice prefill." });
    }
  });

  app.post("/api/service/srf-jobs/:srfId/inter-ho-invoice", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || !canSupervisorDecide(actor)) {
      res.status(403).json({ error: "Only supervisor/admin can create inter-HO invoice." });
      return;
    }
    const srfId = String(req.params.srfId ?? "").trim();
    const invoiceRef = String(req.body?.invoiceRef ?? "").trim();
    const note = String(req.body?.note ?? "").trim();
    if (!invoiceRef) {
      res.status(400).json({ error: "invoiceRef is required." });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const lockRes = await client.query<{
        id: string;
        reference: string;
        status: string;
        region_id: string;
        transfer_source_region_id: string | null;
      }>(
        `SELECT id, reference, status, region_id, transfer_source_region_id
         FROM srf_jobs
         WHERE id = $1::uuid
         FOR UPDATE`,
        [srfId],
      );
      const row = lockRes.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "SRF not found." });
        return;
      }
      if (!row.transfer_source_region_id) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "This SRF is not eligible for inter-HO sender invoice." });
        return;
      }
      if (row.status !== "ready_for_outward") {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Invoice can be created only when SRF is ready for outward dispatch." });
        return;
      }
      if (actor.role !== "super_admin" && actor.role !== "admin" && actor.regionId !== row.region_id) {
        await client.query("ROLLBACK");
        res.status(403).json({ error: "Only current repair HO can create this invoice." });
        return;
      }
      await client.query(
        `UPDATE srf_jobs
         SET ho_spares_bill_ref = $2,
             updated_at = now(),
             modified_by = $3
         WHERE id = $1::uuid`,
        [srfId, invoiceRef, actor.id],
      );
      await appendActionLog(client, srfId, {
        action: "inter_ho_sender_invoice_created",
        description: `Repair HO invoice created against sender HO. Invoice ${invoiceRef}.`,
        actor,
        referenceDoc: invoiceRef,
        details: { invoiceRef, note },
      });
      await client.query("COMMIT");
      res.json({ ok: true });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(e);
      res.status(400).json({ error: "Could not create inter-HO invoice." });
    } finally {
      client.release();
    }
  });

  app.post("/api/service/odcs", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || !SC_ODC_OUTWARD_ROLES.has(actor.role)) {
      res.status(403).json({ error: "Only logistics outward roles can create an ODC batch." });
      return;
    }
    const items = Array.isArray(req.body?.items)
      ? req.body.items
          .map((x: unknown) => ({
            srfId: String((x as { srfId?: unknown })?.srfId ?? "").trim(),
            destinationStoreId: String((x as { destinationStoreId?: unknown })?.destinationStoreId ?? "").trim(),
          }))
          .filter((x: { srfId: string; destinationStoreId: string }) => x.srfId && x.destinationStoreId)
      : [];
    const hoInvoiceRef = String(req.body?.hoInvoiceRef ?? "").trim();
    const storeInvoiceRef = String(req.body?.storeInvoiceRef ?? "").trim();
    if (items.length === 0) {
      res.status(400).json({ error: "Select at least one SRF for outward." });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const regionId = actor.regionId ?? "";
      const { prefix, suffix } = await getSeriesPrefixSuffix(client, "odc", "ODC");
      const dcNumber = await nextDocNumber(client, prefix, suffix, scopeCode(regionId, "RGN"));
      const transferRows = await client.query<{
        id: string;
        status: string;
        region_id: string;
        store_id: string;
        ho_spares_bill_ref: string | null;
        destination_store_id: string | null;
        requires_local_conversion: boolean;
        transfer_target_region_id: string | null;
        transfer_target_store_id: string | null;
        transfer_source_region_id: string | null;
        transfer_source_store_id: string | null;
        transfer_source_reference: string | null;
      }>(
        `SELECT id, status, region_id, store_id, ho_spares_bill_ref, destination_store_id, requires_local_conversion,
                transfer_target_region_id, transfer_target_store_id,
                transfer_source_region_id, transfer_source_store_id, transfer_source_reference
         FROM srf_jobs
         WHERE id = ANY($1::uuid[])`,
        [items.map((x: { srfId: string }) => x.srfId)],
      );
      const transferCandidates = transferRows.rows.filter((r) => 
        r.status === "ready_for_outward" && (
          (r.requires_local_conversion && r.transfer_target_region_id) || 
          (!r.requires_local_conversion && r.transfer_source_region_id)
        )
      );
      const normalCandidates = transferRows.rows.filter((r) => 
        !(
          (r.requires_local_conversion && r.transfer_target_region_id) || 
          (!r.requires_local_conversion && r.transfer_source_region_id)
        )
      );
      if (transferCandidates.length > 0 && normalCandidates.length > 0) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Create separate outward batches: normal store dispatch and inter-HO transfer." });
        return;
      }
      const firstTransfer = transferCandidates[0] ?? null;
      const isInterHoBatch = !!firstTransfer;
      const isReturnToSenderBatch = !!firstTransfer && !firstTransfer.requires_local_conversion;
      if (isReturnToSenderBatch && !hoInvoiceRef && transferCandidates.some((r) => !(r.ho_spares_bill_ref ?? "").trim())) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Create repair HO invoice first (or provide invoice ref) before return-to-sender dispatch." });
        return;
      }
      // For RETURN legs, recover the correct sender HO context from the original parent SRF
      // (looked up via transfer_source_reference). This protects against legacy child SRFs
      // that were created with the old convert-local bug where transfer_source_* fields ended
      // up pointing to the receiver HO (or were NULL). The parent SRF always holds the true
      // sender region/store/booking destination in its own transfer_source_* and destination
      // fields, set when "Send to other HO" was first performed.
      const returnParentRecovery: Record<string, { regionId: string | null; storeId: string | null; destinationStoreId: string | null }> = {};
      if (isReturnToSenderBatch) {
        for (const cand of transferCandidates) {
          if (!cand.transfer_source_reference) continue;
          const { rows: parentRows } = await client.query<{
            transfer_source_region_id: string | null;
            transfer_source_store_id: string | null;
            destination_store_id: string | null;
          }>(
            `SELECT transfer_source_region_id, transfer_source_store_id, destination_store_id
             FROM srf_jobs
             WHERE reference = $1
               AND id <> $2::uuid
               AND transfer_source_region_id IS NOT NULL
             ORDER BY created_at ASC
             LIMIT 1`,
            [cand.transfer_source_reference, cand.id],
          );
          const parent = parentRows[0];
          if (parent && parent.transfer_source_region_id) {
            returnParentRecovery[cand.id] = {
              regionId: parent.transfer_source_region_id,
              storeId: parent.transfer_source_store_id,
              destinationStoreId: parent.destination_store_id,
            };
          }
        }
      }
      const firstRecovery = firstTransfer ? returnParentRecovery[firstTransfer.id] : undefined;
      const interHoTargetRegionId = firstTransfer?.requires_local_conversion
        ? firstTransfer.transfer_target_region_id
        : (firstRecovery?.regionId ?? firstTransfer?.transfer_source_region_id);
      const interHoFromStoreId = firstTransfer?.requires_local_conversion
        ? firstTransfer.transfer_target_store_id
        : (firstRecovery?.storeId ?? firstTransfer?.transfer_source_store_id);
      let fromStoreId = actor.storeId;
      if (!fromStoreId) {
        const { rows: regionalStores } = await client.query<{ id: string }>(
          `SELECT id FROM stores WHERE region_id = $1::text ORDER BY created_at ASC LIMIT 1`,
          [regionId],
        );
        fromStoreId = regionalStores[0]?.id ?? "unknown";
      }

      const dcIns = await client.query<{ id: string }>(
        `INSERT INTO delivery_challans (dc_number, region_id, from_store_id, to_location, status, created_by, modified_by)
         VALUES ($1, $2, $3, $4, $5, $6, $6)
         RETURNING id`,
        [
          dcNumber,
          isInterHoBatch ? interHoTargetRegionId : regionId,
          fromStoreId,
          isInterHoBatch ? "SERVICE_CENTRE" : "STORE",
          isInterHoBatch ? "CREATED" : "DISPATCHED",
          actor.id,
        ],
      );
      const dcId = dcIns.rows[0]?.id;
      let moved = 0;
      for (const it of items) {
        const { rows } = await client.query<{
          id: string;
          status: string;
          region_id: string;
          destination_store_id: string | null;
          requires_local_conversion: boolean;
          transfer_target_region_id: string | null;
          transfer_source_region_id: string | null;
          transfer_source_store_id: string | null;
          transfer_source_reference: string | null;
        }>(
          `SELECT id, status, region_id, destination_store_id, requires_local_conversion,
                  transfer_target_region_id, transfer_source_region_id, transfer_source_store_id, transfer_source_reference
           FROM srf_jobs WHERE id = $1::uuid FOR UPDATE`,
          [it.srfId],
        );
        const row = rows[0];
        if (!row || row.status !== "ready_for_outward") continue;
        if (actor.role !== "super_admin" && actor.role !== "admin" && actor.regionId !== row.region_id) continue;
        await client.query(
          `INSERT INTO delivery_challan_lines (dc_id, srf_id, qty, created_by, modified_by)
           VALUES ($1::uuid, $2::uuid, 1, $3, $3)
           ON CONFLICT (dc_id, srf_id) DO NOTHING`,
          [dcId, it.srfId, actor.id],
        );
        // Inter-HO row when:
        //  - source HO dispatching to target HO (requires_local_conversion=true + transfer_target_region_id), OR
        //  - receiver HO returning the converted local SRF to source HO (requires_local_conversion=false + transfer_source_region_id).
        const isInterHoRow =
          (row.requires_local_conversion && !!row.transfer_target_region_id) ||
          (!row.requires_local_conversion && !!row.transfer_source_region_id);
        if (isInterHoRow) {
          const movingToTargetHo = row.requires_local_conversion;
          if (movingToTargetHo) {
            // Source HO dispatches the inter-HO transfer; actor must match current owning region.
            if (row.region_id !== actor.regionId) continue;
          } else {
            // Return leg is dispatched by the current (receiving/repairing) HO region.
            if (row.region_id !== actor.regionId) continue;
            // Strict guard: return transfer can only go back to original source store. Prefer
            // the parent-recovered store so legacy child rows (with NULL/wrong source store)
            // still validate against the real booking store.
            const recoveryForRow = returnParentRecovery[row.id];
            const fixedReturnStoreId =
              recoveryForRow?.destinationStoreId ??
              recoveryForRow?.storeId ??
              row.transfer_source_store_id ??
              row.destination_store_id;
            if (fixedReturnStoreId && it.destinationStoreId !== fixedReturnStoreId) {
              await client.query("ROLLBACK");
              res.status(400).json({ error: "Return transfer destination is fixed to source HO/store." });
              return;
            }
            // Free sender SRF reference from any archived temp rows so it can be restored on the live return row.
            if (row.transfer_source_reference) {
              await client.query(
                `UPDATE srf_jobs
                 SET reference = CONCAT(reference, '-ARCH-', LEFT(id::text, 8)),
                     updated_at = now(),
                     modified_by = $2
                 WHERE reference = $1
                   AND id <> $3::uuid
                   AND (status = 'closed' OR status = 'sent_to_other_ho')`,
                [row.transfer_source_reference, actor.id, it.srfId],
              );
            }
          }
          // Use parent-recovered sender region/store for the return UPDATE so legacy SRFs
          // (with wrong/NULL transfer_source_*) still route back to the original sender HO
          // and original booking store. For target-bound leg, recovery is unused.
          const recoveryForRow = movingToTargetHo ? undefined : returnParentRecovery[row.id];
          const correctedSenderRegionId = recoveryForRow?.regionId ?? row.transfer_source_region_id;
          const correctedSenderStoreId = recoveryForRow?.storeId ?? row.transfer_source_store_id;
          const correctedDestinationStoreId =
            recoveryForRow?.destinationStoreId ?? row.destination_store_id ?? correctedSenderStoreId ?? it.destinationStoreId;
          await client.query(
            `UPDATE srf_jobs
             SET status = 'in_transit_sc',
                 region_id = CASE WHEN $4 THEN transfer_target_region_id ELSE COALESCE($7::text, transfer_source_region_id) END,
                 transfer_source_region_id = CASE WHEN $4 THEN transfer_source_region_id ELSE COALESCE($7::text, transfer_source_region_id) END,
                 transfer_source_store_id = CASE WHEN $4 THEN transfer_source_store_id ELSE COALESCE($8::text, transfer_source_store_id) END,
                 transfer_target_region_id = CASE WHEN $4 THEN transfer_target_region_id ELSE COALESCE($7::text, transfer_target_region_id) END,
                 transfer_target_store_id = CASE WHEN $4 THEN transfer_target_store_id ELSE COALESCE($8::text, transfer_target_store_id) END,
                 reference = CASE WHEN $4 THEN reference ELSE COALESCE(transfer_source_reference, reference) END,
                 ho_spares_bill_ref = CASE WHEN $4 THEN ho_spares_bill_ref ELSE COALESCE(NULLIF($5, ''), ho_spares_bill_ref) END,
                 dc_number = $2,
                 dispatched_to_sc_at = now(),
                 outward_dc_number = NULL,
                 destination_store_id = COALESCE($9::text, destination_store_id, transfer_source_store_id, $6::text),
                 updated_at = now(),
                 modified_by = $3
             WHERE id = $1::uuid`,
            [
              it.srfId,
              dcNumber,
              actor.id,
              movingToTargetHo,
              hoInvoiceRef,
              it.destinationStoreId,
              correctedSenderRegionId,
              correctedSenderStoreId,
              correctedDestinationStoreId,
            ],
          );
          await appendStatusHistory(
            client,
            it.srfId,
            "in_transit_sc",
            actor.id,
            movingToTargetHo
              ? `Transferred to other HO in DC ${dcNumber}.`
              : `Returned to source HO in DC ${dcNumber} (source SRF reference restored).`,
          );
          await appendActionLog(client, it.srfId, {
            action: movingToTargetHo ? "inter_ho_dispatch_to_repair" : "inter_ho_return_to_sender",
            description: movingToTargetHo
              ? `Dispatched to repair HO via inter-HO DC ${dcNumber}.`
              : `Returned to source HO via DC ${dcNumber} after repair (HO invoice ref ${hoInvoiceRef || "-"}).`,
            actor,
            referenceDoc: dcNumber,
            details: { hoInvoiceRef },
          });
        } else {
          // FINAL store-bound outward. For SRFs that came back from an inter-HO repair
          // (transfer_source_reference set), the true booking store lives on the original
          // parent SRF. Override destination with the parent's booking destination so a
          // legacy/buggy destination_store_id can no longer route the watch to the wrong
          // HO/store. The store-invoice region check still uses the actor's region.
          let finalDestinationStoreId = it.destinationStoreId;
          if (row.transfer_source_reference) {
            const { rows: parentRows } = await client.query<{ destination_store_id: string | null }>(
              `SELECT destination_store_id FROM srf_jobs
               WHERE reference = $1
                 AND id <> $2::uuid
                 AND destination_store_id IS NOT NULL
               ORDER BY created_at ASC
               LIMIT 1`,
              [row.transfer_source_reference, it.srfId],
            );
            const parentDest = parentRows[0]?.destination_store_id;
            if (parentDest) {
              finalDestinationStoreId = parentDest;
            }
          }
          await client.query(
            `UPDATE srf_jobs
             SET status = 'dispatched_to_store',
                 destination_store_id = $2::text,
                 outward_dc_number = $3,
                 store_bill_ref = COALESCE(NULLIF($5, ''), store_bill_ref, ho_spares_bill_ref),
                 dispatched_to_store_at = now(),
                 updated_at = now(),
                 modified_by = $4
             WHERE id = $1::uuid`,
            [it.srfId, finalDestinationStoreId, dcNumber, actor.id, storeInvoiceRef],
          );
          await appendStatusHistory(client, it.srfId, "dispatched_to_store", actor.id, `Dispatched in outward DC ${dcNumber}.`);
          await appendActionLog(client, it.srfId, {
            action: "ho_dispatch_to_store",
            description: `Dispatched to store ${finalDestinationStoreId} via ODC ${dcNumber}${storeInvoiceRef ? ` (Store invoice ref ${storeInvoiceRef})` : ""}.`,
            actor,
            referenceDoc: dcNumber,
            details: { destinationStoreId: finalDestinationStoreId, storeInvoiceRef },
          });
        }
        moved += 1;
      }
      if (moved === 0) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "No ready-for-outward SRFs matched." });
        return;
      }
      await client.query("COMMIT");
      res.json({ odcNumber: dcNumber, moved });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(e);
      res.status(400).json({ error: "Could not create outward DC." });
    } finally {
      client.release();
    }
  });

  app.post("/api/service/odcs/:dcNumber/receive", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || !STORE_ROLES.has(actor.role)) {
      res.status(403).json({ error: "Only store roles can receive outward DC." });
      return;
    }
    const dcNumber = String(req.params.dcNumber ?? "").trim();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows: dcs } = await client.query<{ id: string }>(
        `SELECT id FROM delivery_challans WHERE dc_number = $1 FOR UPDATE`,
        [dcNumber],
      );
      const dc = dcs[0];
      if (!dc) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Outward DC not found." });
        return;
      }
      const { rows: lines } = await client.query<{ srf_id: string }>(
        `SELECT srf_id FROM delivery_challan_lines WHERE dc_id = $1::uuid`,
        [dc.id],
      );
      let updated = 0;
      for (const line of lines) {
        const upd = await client.query(
          `UPDATE srf_jobs
           SET status = 'received_at_store',
               received_back_at_store_at = now(),
               updated_at = now(),
               modified_by = $2
           WHERE id = $1::uuid
             AND status = 'dispatched_to_store'
             AND destination_store_id = $3::text`,
          [line.srf_id, actor.id, actor.storeId],
        );
        if ((upd.rowCount ?? 0) > 0) {
          await appendStatusHistory(client, line.srf_id, "received_at_store", actor.id, `Received against ODC ${dcNumber}.`);
          await appendActionLog(client, line.srf_id, {
            action: "store_inward_odc",
            description: `Store inwarded watch via ODC ${dcNumber}.`,
            actor,
            referenceDoc: dcNumber,
          });
          updated += 1;
        }
      }
      await client.query(
        `UPDATE delivery_challans
         SET status = 'RECEIVED', updated_at = now(), modified_by = $2
         WHERE id = $1::uuid`,
        [dc.id, actor.id],
      );
      await client.query("COMMIT");
      res.json({ updated });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(e);
      res.status(400).json({ error: "Could not receive ODC." });
    } finally {
      client.release();
    }
  });

  app.post("/api/service/srf-jobs/:srfId/close", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || !STORE_ROLES.has(actor.role)) {
      res.status(403).json({ error: "Only store roles can close SRF with invoice." });
      return;
    }
    const srfId = String(req.params.srfId ?? "").trim();
    const hoSparesBillRef = String(req.body?.hoSparesBillRef ?? "").trim();
    const storeBillRef = String(req.body?.storeBillRef ?? "").trim();
    const noBillingHandover = Boolean(req.body?.noBillingHandover);
    try {
      const upd = await pool.query(
        `UPDATE srf_jobs
         SET status = 'closed',
             ho_spares_bill_ref = NULLIF($4, ''),
             store_bill_ref = NULLIF($5, ''),
             closed_at = now(),
             updated_at = now(),
             modified_by = $2
         WHERE id = $1::uuid
           AND status = 'received_at_store'
           AND destination_store_id = $3::text
           AND (
             spares_slip_submitted_at IS NOT NULL
             OR ($6 AND customer_reestimate_response = 'rejected')
             OR brand_invoice_amount_inr IS NOT NULL
           )`,
        [srfId, actor.id, actor.storeId, hoSparesBillRef, storeBillRef, noBillingHandover],
      );
      if ((upd.rowCount ?? 0) === 0) {
        res.status(400).json({ error: "Only received SRF with billed repair (spares slip) or rejected re-estimate handover can be closed." });
        return;
      }
      const srfPhone = await pool.query<{ phone: string }>(`SELECT phone FROM srf_jobs WHERE id = $1::uuid`, [srfId]);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await appendStatusHistory(
          client,
          srfId,
          "closed",
          actor.id,
          noBillingHandover
            ? "Closed after customer handover without billing (re-estimate rejected)."
            : "Closed after customer invoice.",
        );
        await appendActionLog(client, srfId, {
          action: noBillingHandover ? "store_no_billing_handover" : "store_close_with_invoice",
          description: noBillingHandover
            ? "Watch handed over to customer without billing (re-estimate rejected)."
            : `Customer invoice raised and SRF closed. HO ref: ${hoSparesBillRef || "-"}; Store ref: ${storeBillRef || "-"}.`,
          actor,
          referenceDoc: storeBillRef || hoSparesBillRef || null,
          details: { hoSparesBillRef, storeBillRef, noBillingHandover },
        });
        await maybeDisableTrackingToken(client, srfPhone.rows[0]?.phone ?? "");
        await client.query("COMMIT");
      } catch {
        await client.query("ROLLBACK").catch(() => {});
      } finally {
        client.release();
      }
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Could not close SRF." });
    }
  });

  app.get("/api/public/srf-track", async (req, res) => {
    const token = String(req.query.t ?? "").trim();
    if (!token) {
      res.status(400).json({ error: "Tracking token is required." });
      return;
    }
    try {
      const tokenRow = await pool.query<{ phone_last10: string; disabled_at: Date | null; is_active: boolean }>(
        `SELECT phone_last10, disabled_at, is_active
         FROM customer_tracking_tokens
         WHERE token_hash = $1
         LIMIT 1`,
        [tokenHash(token)],
      );
      const row = tokenRow.rows[0];
      if (!row) {
        res.status(404).json({ error: "Invalid tracking link." });
        return;
      }
      if (row.disabled_at || row.is_active === false) {
        res.json({ disabled: true, customer: null, jobs: [] });
        return;
      }

      const jobsRes = await pool.query<
        {
          id: string;
          reference: string;
          customerName: string;
          phone: string;
          watchBrand: string;
          watchModel: string;
          serial: string;
          status: string;
          complaint: string;
          estimateTotalInr: number;
          advanceInr: number;
          reestimateRequestedNote: string | null;
          reestimateRequestedInr: number | null;
          customerReestimateResponse: string | null;
          brandCouponCode: string | null;
          brandCouponValueInr: number | null;
          brandCouponReceivedAt: string | null;
          brandCouponValidUntil: string | null;
          customerCouponNotifiedAt: string | null;
          createdAt: string;
          photos: Array<{
            id: string;
            photoKind: string;
            filePath: string;
            mime: string;
            bytes: number;
            createdAt: string;
          }>;
        }
      >(
        `SELECT j.id,
                j.reference,
                j.customer_name AS "customerName",
                j.phone,
                j.watch_brand AS "watchBrand",
                j.watch_model AS "watchModel",
                j.serial,
                j.status,
                j.complaint,
                j.estimate_total_inr::float8 AS "estimateTotalInr",
                j.advance_inr::float8 AS "advanceInr",
                j.reestimate_requested_note AS "reestimateRequestedNote",
                j.reestimate_requested_inr::float8 AS "reestimateRequestedInr",
                j.customer_reestimate_response AS "customerReestimateResponse",
                j.brand_coupon_code AS "brandCouponCode",
                j.brand_coupon_value_inr::float8 AS "brandCouponValueInr",
                j.brand_coupon_received_at AS "brandCouponReceivedAt",
                j.brand_coupon_valid_until AS "brandCouponValidUntil",
                j.customer_coupon_notified_at AS "customerCouponNotifiedAt",
                j.created_at AS "createdAt",
                COALESCE((
                  SELECT json_agg(
                    json_build_object(
                      'id', p.id,
                      'photoKind', p.photo_kind,
                      'filePath', p.file_path,
                      'mime', p.mime,
                      'bytes', p.bytes,
                      'createdAt', p.created_at
                    ) ORDER BY p.created_at DESC
                  )
                  FROM srf_job_photos p
                  WHERE p.srf_id = j.id
                ), '[]'::json) AS photos
         FROM srf_jobs j
         WHERE RIGHT(regexp_replace(j.phone, '\D', '', 'g'), 10) = $1
           AND j.status NOT IN ('closed', 'cancelled')
         ORDER BY j.created_at DESC`,
        [row.phone_last10],
      );

      const currentJob = jobsRes.rows[0] ?? null;
      const ids = currentJob ? [currentJob.id] : [];
      const historyRows =
        ids.length > 0
          ? await pool.query<{ id: string; srf_id: string; status: string; note: string; changed_at: string }>(
              `SELECT id, srf_id, status, note, changed_at
               FROM srf_status_history
               WHERE srf_id = ANY($1::uuid[])
               ORDER BY changed_at DESC`,
              [ids],
            )
          : { rows: [] as Array<{ id: string; srf_id: string; status: string; note: string; changed_at: string }> };

      const historyBySrf = new Map<string, Array<{ id: string; status: string; note: string; changedAt: string }>>();
      for (const h of historyRows.rows) {
        const list = historyBySrf.get(h.srf_id) ?? [];
        list.push({ id: h.id, status: h.status, note: h.note, changedAt: h.changed_at });
        historyBySrf.set(h.srf_id, list);
      }

      const job = currentJob
        ? {
            ...currentJob,
            timeline: historyBySrf.get(currentJob.id) ?? [],
            reestimateHistory: (historyBySrf.get(currentJob.id) ?? [])
              .filter((h) => h.status === "reestimate_required")
              .map((h) => parseReestimateEntry(h.note, h.changedAt))
              .reverse(),
          }
        : null;
      const customer = job
        ? {
            name: job.customerName,
            phone: job.phone,
          }
        : null;

      if (!job) {
        await pool.query(
          `UPDATE customer_tracking_tokens
           SET is_active = false, disabled_at = now()
           WHERE phone_last10 = $1`,
          [row.phone_last10],
        );
        res.json({ disabled: true, customer: null, job: null });
        return;
      }
      res.json({ disabled: false, customer, job });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not load tracking details." });
    }
  });

  app.post("/api/public/srf-track/reestimate-response", async (req, res) => {
    const token = String(req.body?.token ?? "").trim();
    const srfId = String(req.body?.srfId ?? "").trim();
    const accepted = Boolean(req.body?.accepted);
    const note = String(req.body?.note ?? "").trim();
    if (!token || !srfId) {
      res.status(400).json({ error: "token and srfId are required." });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const tokenRes = await client.query<{ phone_last10: string; disabled_at: Date | null; is_active: boolean }>(
        `SELECT phone_last10, disabled_at, is_active
         FROM customer_tracking_tokens
         WHERE token_hash = $1
         FOR UPDATE`,
        [tokenHash(token)],
      );
      const tokenRow = tokenRes.rows[0];
      if (!tokenRow || tokenRow.disabled_at || tokenRow.is_active === false) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "This tracking link is disabled." });
        return;
      }
      const srfRes = await client.query<{
        id: string;
        status: string;
        phone: string;
        reference: string;
        customer_name: string;
        region_id: string;
        reestimate_requested_inr: number | null;
      }>(
        `SELECT id, status, phone, reference, customer_name, region_id, reestimate_requested_inr::float8
         FROM srf_jobs
         WHERE id = $1::uuid
         FOR UPDATE`,
        [srfId],
      );
      const srf = srfRes.rows[0];
      if (!srf || phoneLast10(srf.phone) !== tokenRow.phone_last10) {
        await client.query("ROLLBACK");
        res.status(403).json({ error: "SRF is not linked to this customer." });
        return;
      }
      if (srf.status !== "reestimate_required") {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Re-estimate response is not allowed for this SRF status." });
        return;
      }
      const customerActor = {
        id: null as string | null,
        role: "customer",
        name: srf.customer_name,
      };
      if (accepted) {
        await client.query(
          `UPDATE srf_jobs
           SET status = 'assigned',
               customer_reestimate_response = 'accepted',
               customer_reestimate_responded_at = now(),
               estimate_total_inr = COALESCE($2::numeric, estimate_total_inr),
               updated_at = now()
           WHERE id = $1::uuid`,
          [srfId, srf.reestimate_requested_inr],
        );
        await appendStatusHistory(client, srfId, "assigned", null, note || "Customer accepted re-estimate.");
        await recordReestimateCustomerResponse(client, srfId, { response: "accepted", note });
        await appendActionLog(client, srfId, {
          action: "customer_accept_reestimate",
          description: `Customer accepted the proposed re-estimate.${note ? ` Note: ${note}` : ""}`,
          amountInr: Number(srf.reestimate_requested_inr ?? 0),
          actorOverride: customerActor,
        });
        await sendReestimateDecisionNotification({
          srfReference: srf.reference,
          customerName: srf.customer_name,
          phone: srf.phone,
          decision: "accepted",
          note,
        });
      } else {
        await client.query(
          `UPDATE srf_jobs
           SET status = 'customer_rejected',
               customer_reestimate_response = 'rejected',
               customer_reestimate_responded_at = now(),
               updated_at = now()
           WHERE id = $1::uuid`,
          [srfId],
        );
        await appendStatusHistory(
          client,
          srfId,
          "customer_rejected",
          null,
          note || "Customer rejected re-estimate. Awaiting supervisor follow-up call.",
        );
        await recordReestimateCustomerResponse(client, srfId, { response: "rejected", note });
        await appendActionLog(client, srfId, {
          action: "customer_reject_reestimate",
          description: `Customer rejected the proposed re-estimate.${note ? ` Note: ${note}` : ""}`,
          actorOverride: customerActor,
        });
        await sendReestimateDecisionNotification({
          srfReference: srf.reference,
          customerName: srf.customer_name,
          phone: srf.phone,
          decision: "rejected",
          note,
        });
      }
      await client.query("COMMIT");
      if (!accepted && pushInApp && srf.region_id) {
        const { rows: notifyRows } = await pool.query<{ id: string }>(
          `SELECT id FROM app_users
           WHERE region_id = $1::text
             AND role IN (
               'service_centre_supervisor',
               'ho_manager',
               'admin',
               'admin',
               'super_admin'
             )`,
          [srf.region_id],
        );
        await pushInApp(
          notifyRows.map((r) => r.id),
          {
            title: "Customer rejected re-estimate",
            message: `SRF ${srf.reference}: customer rejected the proposed re-estimate from the tracking link.`,
            category: "service_srf",
          },
        );
      }
      res.json({ ok: true });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(e);
      res.status(400).json({ error: "Could not save re-estimate response." });
    } finally {
      client.release();
    }
  });

  app.get("/api/public/srf-photo/session", async (req, res) => {
    const token = String(req.query.token ?? "").trim();
    if (!token) {
      res.status(400).json({ error: "token is required." });
      return;
    }
    try {
      const { rows } = await pool.query<{
        id: string;
        srf_id: string;
        status: string;
        revoked_at: Date | null;
        expires_at: Date;
        capture_link_disabled_at: Date | null;
        reference: string;
        customer_name: string;
        watch_brand: string;
        watch_model: string;
      }>(
        `SELECT sps.id,
                sps.srf_id,
                sps.expires_at,
                sps.revoked_at,
                j.status,
                j.capture_link_disabled_at,
                j.reference,
                j.customer_name,
                j.watch_brand,
                j.watch_model
         FROM srf_photo_sessions sps
         JOIN srf_jobs j ON j.id = sps.srf_id
         WHERE sps.token_hash = $1
         ORDER BY sps.created_at DESC
         LIMIT 1`,
        [tokenHash(token)],
      );
      const row = rows[0];
      const error = ensurePhotoTokenSession(row);
      if (error) {
        res.status(400).json({ error });
        return;
      }
      const { rows: photoRows } = await pool.query<{
        id: string;
        photoKind: string;
        filePath: string;
        mime: string;
        bytes: number;
        createdAt: string;
      }>(
        `SELECT id,
                photo_kind AS "photoKind",
                file_path AS "filePath",
                mime,
                bytes,
                created_at AS "createdAt"
         FROM srf_job_photos
         WHERE srf_id = $1::uuid
         ORDER BY created_at DESC`,
        [row!.srf_id],
      );
      res.json({
        srfId: row!.srf_id,
        reference: row!.reference,
        customerName: row!.customer_name,
        watch: `${row!.watch_brand} ${row!.watch_model}`,
        photoCount: photoRows.length,
        photos: photoRows,
      });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Invalid photo session token." });
    }
  });

  app.post("/api/public/srf-photo/upload", upload.single("file"), async (req, res) => {
    const token = String(req.body?.token ?? "").trim();
    if (!token) {
      if (req.file?.path) fs.unlink(req.file.path, () => {});
      res.status(400).json({ error: "token is required." });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "Upload image file under field name 'file'." });
      return;
    }
    try {
      const { rows } = await pool.query<{
        id: string;
        srf_id: string;
        status: string;
        revoked_at: Date | null;
        expires_at: Date;
        capture_link_disabled_at: Date | null;
        used_at: Date | null;
      }>(
        `SELECT sps.id, sps.srf_id, sps.expires_at, sps.revoked_at, sps.used_at, j.status, j.capture_link_disabled_at
         FROM srf_photo_sessions sps
         JOIN srf_jobs j ON j.id = sps.srf_id
         WHERE sps.token_hash = $1
         ORDER BY sps.created_at DESC
         LIMIT 1`,
        [tokenHash(token)],
      );
      const row = rows[0];
      const error = ensurePhotoTokenSession(row);
      if (error) {
        fs.unlink(req.file.path, () => {});
        res.status(400).json({ error });
        return;
      }
      const relPath = path.relative(process.cwd(), req.file.path).replace(/\\/g, "/");
      const photoKind = normalizePhotoKind(String(req.body?.photoKind ?? ""));
      await pool.query(
        `INSERT INTO srf_job_photos (srf_id, photo_kind, file_path, mime, bytes, created_by)
         VALUES ($1::uuid, $2, $3, $4, $5, NULL)`,
        [row!.srf_id, photoKind, relPath, req.file.mimetype || "application/octet-stream", req.file.size],
      );
      await pool.query(
        `UPDATE srf_photo_sessions SET used_at = COALESCE(used_at, now()) WHERE id = $1::uuid`,
        [row!.id],
      );
      await pool.query(
        `UPDATE srf_jobs
         SET status = 'draft',
             photo_session_active = true,
             updated_at = now()
         WHERE id = $1::uuid AND status = 'photo_pending'`,
        [row!.srf_id],
      );
      const { rows: countRows } = await pool.query<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM srf_job_photos WHERE srf_id = $1::uuid`,
        [row!.srf_id],
      );
      res.json({ ok: true, photoCount: countRows[0]?.c ?? 1 });
    } catch (e) {
      console.error(e);
      if (req.file?.path) fs.unlink(req.file.path, () => {});
      res.status(500).json({ error: "Could not upload photo." });
    }
  });
}
