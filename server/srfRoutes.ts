import type { Express, NextFunction, Request, Response } from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import type { Pool, PoolClient } from "pg";
import type { DemoUser, UserRole } from "../src/types/user";
import { sendReestimateDecisionNotification, sendTrackingLink } from "./notificationService";

type Authed = Request & { userId: string };

export type InAppNotifier = (
  userIds: string[],
  payload: { title: string; message: string; category: string },
) => Promise<void>;

const STORE_ROLES = new Set<UserRole>([
  "store_user",
  "store_purchase_user",
  "store_manager",
  "store_accounts",
]);
const HO_SC_ROLES = new Set<UserRole>([
  "super_admin",
  "regional_admin",
  "ho_admin",
  "ho_manager",
  "ho_user",
  "service_centre_clerk",
  "service_centre_supervisor",
  "service_centre_inward",
  "service_centre_outward",
  "technician",
]);

const SC_DC_INWARD_ROLES = new Set<UserRole>([
  "super_admin",
  "regional_admin",
  "ho_admin",
  "ho_manager",
  "service_centre_clerk",
  "service_centre_inward",
]);

const SC_ODC_OUTWARD_ROLES = new Set<UserRole>([
  "super_admin",
  "regional_admin",
  "ho_admin",
  "ho_manager",
  "service_centre_clerk",
  "service_centre_outward",
]);

function canSupervisorDecide(actor: DemoUser | null): boolean {
  return !!actor && (actor.role === "service_centre_supervisor" || actor.role === "super_admin" || actor.role === "ho_admin");
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
  return STORE_ROLES.has(actor.role) || actor.role === "super_admin" || actor.role === "ho_admin";
}

function roleCanView(actor: DemoUser): boolean {
  return roleCanCreateDraft(actor) || HO_SC_ROLES.has(actor.role);
}

function visibleWhere(actor: DemoUser, idxStart = 1): { sql: string; params: unknown[]; nextIdx: number } {
  let i = idxStart;
  if (actor.role === "super_admin" || actor.role === "ho_admin") {
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

function scopeCode(code: string, fallback: string): string {
  return (code || fallback)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 3)
    .padEnd(3, "X");
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

function appBaseUrlFromRequest(req: Request): string {
  const protoHeader = String(req.headers["x-forwarded-proto"] ?? "").trim();
  const hostHeader = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "").trim();
  if (protoHeader && hostHeader) {
    return `${protoHeader.split(",")[0].trim()}://${hostHeader.split(",")[0].trim()}`.replace(/\/+$/, "");
  }
  if (hostHeader) {
    return `${req.protocol}://${hostHeader.split(",")[0].trim()}`.replace(/\/+$/, "");
  }
  return "http://127.0.0.1:5173";
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
      if (regionQ && (actor.role === "super_admin" || actor.role === "ho_admin")) {
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
      const baseUrl = appBaseUrlFromRequest(req);
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
        `SELECT id, status, note, changed_by AS "changedBy", changed_at AS "changedAt"
         FROM srf_status_history
         WHERE srf_id = $1::uuid
         ORDER BY changed_at DESC`,
        [req.params.srfId],
      );
      res.json({ rows });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Could not load status history." });
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
    const customerName = String(req.body?.customerName ?? "").trim();
    const phone = String(req.body?.phone ?? "").trim();
    const customerKind = String(req.body?.customerKind ?? "B2C").toUpperCase() === "B2B" ? "B2B" : "B2C";
    const company = String(req.body?.company ?? "").trim() || null;
    const watchBrand = String(req.body?.watchBrand ?? "").trim();
    const watchModel = String(req.body?.watchModel ?? "").trim();
    const serial = String(req.body?.serial ?? "").trim();
    if (!regionId || !storeId || !customerName || !phone || !watchBrand || !watchModel || !serial) {
      res.status(400).json({ error: "regionId, storeId, customerName, phone, watchBrand, watchModel, serial are required." });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows: storeRows } = await client.query<{ name: string }>(
        `SELECT name FROM stores WHERE id = $1::text`,
        [storeId],
      );
      const { prefix, suffix } = await getSeriesPrefixSuffix(client, "srf", "SRF");
      const ref = await nextDocNumber(client, prefix, suffix, scopeCode(storeRows[0]?.name ?? storeId, "STR"));
      const ins = await client.query<{ id: string }>(
        `INSERT INTO srf_jobs (
           reference, region_id, store_id, customer_name, phone, customer_kind, company, watch_brand, watch_model, serial,
           status, photo_session_active, created_by, modified_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'photo_pending', true, $11, $11)
         RETURNING id`,
        [ref, regionId, storeId, customerName, phone, customerKind, company, watchBrand, watchModel, serial, actor.id],
      );
      const srfId = ins.rows[0]?.id;
      if (!srfId) throw new Error("Could not create SRF draft.");
      await appendStatusHistory(client, srfId, "photo_pending", actor.id, "SRF draft created.");

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
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows: locked } = await client.query<{ id: string; status: string }>(
        `SELECT id, status FROM srf_jobs WHERE id = $1::uuid FOR UPDATE`,
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
             selected_part_ids = $4::jsonb,
             status = 'at_store',
             photo_session_active = false,
             capture_link_disabled_at = now(),
             updated_at = now(),
             modified_by = $5
         WHERE id = $1::uuid`,
        [srfId, complaint, estimateTotalInr, JSON.stringify(selectedPartIds), actor.id],
      );
      await client.query(
        `UPDATE srf_photo_sessions SET revoked_at = now() WHERE srf_id = $1::uuid AND revoked_at IS NULL`,
        [srfId],
      );
      await appendStatusHistory(client, srfId, "at_store", actor.id, "SRF finalized after OTP.");
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
      const trackingUrl = `${appBaseUrlFromRequest(req)}/track?t=${encodeURIComponent(trackingToken)}`;
      await sendTrackingLink({
        phone: refRow?.phone ?? "",
        name: refRow?.customer_name ?? "Customer",
        trackingUrl,
        srfReference: refRow?.reference ?? "",
      }).catch(() => {});
      res.json({ ok: true, trackingUrl });
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
      if (actor.role !== "super_admin" && actor.role !== "ho_admin") {
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
      if (actor.role !== "super_admin" && actor.role !== "ho_admin") {
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
      if (actor.role !== "super_admin" && actor.role !== "ho_admin" && actor.regionId !== dc.region_id) {
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
          transfer_source_store_id: string | null;
        }>(
          `SELECT id, status, requires_local_conversion, transfer_target_region_id, transfer_source_store_id
           FROM srf_jobs
           WHERE id = $1::uuid
           FOR UPDATE`,
          [line.srf_id],
        );
        const row = current.rows[0];
        if (!row || row.status !== "in_transit_sc") continue;
        const isReturnToSenderHo = !row.requires_local_conversion && !!row.transfer_target_region_id;
        if (isReturnToSenderHo) {
          const updReturn = await client.query(
            `UPDATE srf_jobs
             SET status = 'ready_for_outward',
                 inward_at = now(),
                 ready_for_outward_at = now(),
                 destination_store_id = COALESCE(destination_store_id, transfer_source_store_id),
                 requires_local_conversion = false,
                 transfer_target_region_id = NULL,
                 transfer_target_store_id = NULL,
                 transfer_source_region_id = NULL,
                 transfer_source_store_id = NULL,
                 updated_at = now(),
                 modified_by = $2
             WHERE id = $1::uuid AND status = 'in_transit_sc'`,
            [line.srf_id, actor.id],
          );
          if ((updReturn.rowCount ?? 0) > 0) {
            await appendStatusHistory(
              client,
              line.srf_id,
              "ready_for_outward",
              actor.id,
              `Inwarded return DC ${dcNumber}. Sender HO can now dispatch to store.`,
            );
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
    if (!actor || (actor.role !== "service_centre_supervisor" && actor.role !== "super_admin" && actor.role !== "ho_admin")) {
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
        await appendStatusHistory(client, srfId, "assigned", actor.id, `Assigned to technician ${technicianId}.`);
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
        await appendStatusHistory(client, srfId, "reestimate_required", actor.id, `Re-estimate INR ${amount.toFixed(2)}: ${note}`);
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
                watch_brand, watch_model, serial, complaint, estimate_total_inr::float8, selected_part_ids,
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
      const { rows: storeRows } = await client.query<{ name: string }>(
        `SELECT name FROM stores WHERE id = $1::text`,
        [row.store_id],
      );
      const { prefix, suffix } = await getSeriesPrefixSuffix(client, "srf", "SRF");
      const newRef = await nextDocNumber(client, prefix, suffix, scopeCode(storeRows[0]?.name ?? row.store_id, "STR"));
      const ins = await client.query<{ id: string }>(
        `INSERT INTO srf_jobs (
          reference, region_id, store_id, customer_name, phone, customer_kind, company,
          watch_brand, watch_model, serial, complaint, estimate_total_inr, selected_part_ids,
          status, dc_number, dispatched_to_sc_at, inward_at, destination_store_id, photo_session_active,
          requires_local_conversion, transfer_target_region_id, transfer_target_store_id,
          transfer_source_region_id, transfer_source_store_id, transfer_source_reference,
          created_by, modified_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12, $13::jsonb,
          'received_at_sc', $14, $15, $16, $17, false,
          false, $18, $19, $20, $21, $22, $23, $23
        )
        RETURNING id`,
        [
          newRef,
          row.region_id,
          row.store_id,
          row.customer_name,
          row.phone,
          row.customer_kind,
          row.company,
          row.watch_brand,
          row.watch_model,
          row.serial,
          row.complaint,
          row.estimate_total_inr,
          JSON.stringify(row.selected_part_ids ?? []),
          row.dc_number,
          row.dispatched_to_sc_at,
          row.inward_at,
          row.transfer_source_store_id ?? row.destination_store_id ?? row.store_id,
          row.transfer_target_region_id,
          row.transfer_target_store_id,
          row.transfer_source_region_id,
          row.transfer_source_store_id,
          row.transfer_source_reference ?? row.reference,
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
         SET status = 'closed',
             reference = CONCAT(reference, '-TMP-', LEFT(id::text, 8)),
             closed_at = now(),
             destination_store_id = NULL,
             dc_number = NULL,
             outward_dc_number = NULL,
             ready_for_outward_at = NULL,
             dispatched_to_store_at = NULL,
             received_back_at_store_at = NULL,
             updated_at = now(),
             modified_by = $2
         WHERE id = $1::uuid`,
        [srfId, actor.id],
      );
      await appendStatusHistory(
        client,
        srfId,
        "closed",
        actor.id,
        `Temporary source SRF closed after local conversion. New local SRF: ${newRef}.`,
      );
      await appendStatusHistory(
        client,
        newSrfId,
        "received_at_sc",
        actor.id,
        `Auto-created local SRF ${newRef}. Source HO reference: ${row.transfer_source_reference ?? row.reference}.`,
      );
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
            name: String((x as { name?: unknown })?.name ?? "").trim(),
            qty: Number((x as { qty?: unknown })?.qty ?? 0),
            unitPriceInr: Number((x as { unitPriceInr?: unknown })?.unitPriceInr ?? 0),
            lineTotalInr: Number((x as { lineTotalInr?: unknown })?.lineTotalInr ?? 0),
          }))
          .filter((x: { name: string; qty: number; unitPriceInr: number; lineTotalInr: number }) => x.name.length > 0 && Number.isFinite(x.qty) && x.qty > 0)
      : [];
    if (lines.length === 0) {
      res.status(400).json({ error: "Provide at least one spare line with name and qty." });
      return;
    }
    try {
      const params: unknown[] = [srfId, actor.id, JSON.stringify(lines)];
      let where = `id = $1::uuid AND status IN ('assigned', 'estimate_ok')`;
      if (actor.role === "technician") {
        where += " AND assigned_technician_id = $4";
        params.push(actor.technicianProfileId);
      }
      const upd = await pool.query(
        `UPDATE srf_jobs
         SET used_spares = $3::jsonb,
             spares_slip_submitted_at = now(),
             spares_slip_submitted_by = $2,
             updated_at = now(),
             modified_by = $2
         WHERE ${where}`,
        params,
      );
      if ((upd.rowCount ?? 0) === 0) {
        res.status(400).json({ error: "SRF must be assigned/estimate-ok and visible to you." });
        return;
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await appendStatusHistory(client, srfId, "estimate_ok", actor.id, "Used spares slip submitted.");
        await client.query("COMMIT");
      } catch {
        await client.query("ROLLBACK").catch(() => {});
      } finally {
        client.release();
      }
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Could not submit used spares slip." });
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
        requires_local_conversion: boolean;
        transfer_target_region_id: string | null;
        transfer_target_store_id: string | null;
        transfer_source_region_id: string | null;
        transfer_source_store_id: string | null;
        transfer_source_reference: string | null;
      }>(
        `SELECT id, status, region_id, store_id, requires_local_conversion,
                transfer_target_region_id, transfer_target_store_id,
                transfer_source_region_id, transfer_source_store_id, transfer_source_reference
         FROM srf_jobs
         WHERE id = ANY($1::uuid[])`,
        [items.map((x: { srfId: string }) => x.srfId)],
      );
      const transferCandidates = transferRows.rows.filter((r) => r.status === "ready_for_outward" && r.transfer_target_region_id);
      const normalCandidates = transferRows.rows.filter((r) => !r.transfer_target_region_id);
      if (transferCandidates.length > 0 && normalCandidates.length > 0) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Create separate outward batches: normal store dispatch and inter-HO transfer." });
        return;
      }
      const firstTransfer = transferCandidates[0] ?? null;
      const isInterHoBatch = !!firstTransfer;
      const isReturnToSenderBatch = !!firstTransfer && !firstTransfer.requires_local_conversion;
      if (isReturnToSenderBatch && !hoInvoiceRef) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Repair HO invoice ref is required for return-to-sender dispatch." });
        return;
      }
      const interHoTargetRegionId = firstTransfer?.requires_local_conversion
        ? firstTransfer.transfer_target_region_id
        : firstTransfer?.transfer_source_region_id;
      const interHoFromStoreId = firstTransfer?.requires_local_conversion
        ? firstTransfer.transfer_target_store_id
        : firstTransfer?.transfer_source_store_id;
      const dcIns = await client.query<{ id: string }>(
        `INSERT INTO delivery_challans (dc_number, region_id, from_store_id, to_location, status, created_by, modified_by)
         VALUES ($1, $2, $3, $4, $5, $6, $6)
         RETURNING id`,
        [
          dcNumber,
          isInterHoBatch ? interHoTargetRegionId : regionId,
          (isInterHoBatch ? interHoFromStoreId : items[0]?.destinationStoreId ?? actor.storeId ?? "unknown") as string,
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
          requires_local_conversion: boolean;
          transfer_target_region_id: string | null;
          transfer_source_region_id: string | null;
          transfer_source_store_id: string | null;
          transfer_source_reference: string | null;
        }>(
          `SELECT id, status, region_id, requires_local_conversion,
                  transfer_target_region_id, transfer_source_region_id, transfer_source_store_id, transfer_source_reference
           FROM srf_jobs WHERE id = $1::uuid FOR UPDATE`,
          [it.srfId],
        );
        const row = rows[0];
        if (!row || row.status !== "ready_for_outward") continue;
        if (actor.role !== "super_admin" && actor.role !== "ho_admin" && actor.regionId !== row.region_id) continue;
        await client.query(
          `INSERT INTO delivery_challan_lines (dc_id, srf_id, qty, created_by, modified_by)
           VALUES ($1::uuid, $2::uuid, 1, $3, $3)
           ON CONFLICT (dc_id, srf_id) DO NOTHING`,
          [dcId, it.srfId, actor.id],
        );
        if (row.transfer_target_region_id) {
          const movingToTargetHo = row.requires_local_conversion;
          if (movingToTargetHo) {
            // Source HO dispatches the inter-HO transfer; actor must match current owning region.
            if (row.region_id !== actor.regionId) continue;
          } else {
            // Return leg is dispatched by the current (receiving/repairing) HO region.
            if (row.region_id !== actor.regionId) continue;
            // Strict guard: return transfer can only go back to original source store.
            if (it.destinationStoreId !== row.transfer_source_store_id) {
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
                   AND status = 'closed'`,
                [row.transfer_source_reference, actor.id, it.srfId],
              );
            }
          }
          await client.query(
            `UPDATE srf_jobs
             SET status = 'in_transit_sc',
                 region_id = CASE WHEN $4 THEN transfer_target_region_id ELSE transfer_source_region_id END,
                 reference = CASE WHEN $4 THEN reference ELSE COALESCE(transfer_source_reference, reference) END,
                 ho_spares_bill_ref = CASE WHEN $4 THEN ho_spares_bill_ref ELSE COALESCE(NULLIF($5, ''), ho_spares_bill_ref) END,
                 dc_number = $2,
                 dispatched_to_sc_at = now(),
                 outward_dc_number = NULL,
                 destination_store_id = COALESCE(destination_store_id, transfer_source_store_id),
                 updated_at = now(),
                 modified_by = $3
             WHERE id = $1::uuid`,
            [it.srfId, dcNumber, actor.id, movingToTargetHo, hoInvoiceRef],
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
        } else {
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
            [it.srfId, it.destinationStoreId, dcNumber, actor.id, storeInvoiceRef],
          );
          await appendStatusHistory(client, it.srfId, "dispatched_to_store", actor.id, `Dispatched in outward DC ${dcNumber}.`);
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
           AND spares_slip_submitted_at IS NOT NULL`,
        [srfId, actor.id, actor.storeId, hoSparesBillRef, storeBillRef],
      );
      if ((upd.rowCount ?? 0) === 0) {
        res.status(400).json({ error: "Only received SRF with submitted spares slip at your store can be closed." });
        return;
      }
      const srfPhone = await pool.query<{ phone: string }>(`SELECT phone FROM srf_jobs WHERE id = $1::uuid`, [srfId]);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await appendStatusHistory(client, srfId, "closed", actor.id, "Closed after customer invoice.");
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
          reestimateRequestedNote: string | null;
          reestimateRequestedInr: number | null;
          customerReestimateResponse: string | null;
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
                j.reestimate_requested_note AS "reestimateRequestedNote",
                j.reestimate_requested_inr::float8 AS "reestimateRequestedInr",
                j.customer_reestimate_response AS "customerReestimateResponse",
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
        await appendStatusHistory(client, srfId, "customer_rejected", null, note || "Customer rejected re-estimate.");
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
               'ho_admin',
               'regional_admin',
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
