import type { Express, Request, Response } from "express";
import crypto from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { DemoUser, UserRole } from "../src/types/user";
import { deliverOtpToTargets, otpStartResponsePayload, type OtpDeliveryTarget } from "./messaging/deliverOtp";
import { generateOtpCode } from "./otp";

type Authed = Request & { userId: string };
type RequireAuth = (req: Request, res: Response, next: () => void) => void;

const STORE_ROLES = new Set<UserRole>(["store_user", "store_manager", "store_accounts"]);
const SC_LOGISTICS_ROLES = new Set<UserRole>([
  "super_admin",
  "admin",
  "ho_manager",
  "service_centre_clerk",
]);

const OTP_TTL_MS = 10 * 60 * 1000;

type HandoffKind = "store_to_ho_send" | "ho_receive_from_db" | "ho_to_store_send" | "store_receive_from_db";

type HandoffOtpSession = {
  code: string;
  expiresAt: number;
  kind: HandoffKind;
  deliveryBoyUserId: string;
  dcNumbers: string[];
  actorId: string;
};

const handoffOtpSessions = new Map<string, HandoffOtpSession>();

function phoneLast10(v: string): string {
  const digits = String(v ?? "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

async function appendStatusHistory(
  client: PoolClient,
  srfId: string,
  status: string,
  actorId: string | null,
  note: string,
): Promise<void> {
  await client.query(
    `INSERT INTO srf_status_history (srf_id, status, note, changed_by)
     VALUES ($1::uuid, $2::text, $3::text, $4::text)`,
    [srfId, status, note, actorId],
  );
}

async function appendActionLog(
  client: PoolClient,
  srfId: string,
  action: string,
  description: string,
  actor: DemoUser,
  referenceDoc?: string,
): Promise<void> {
  await client.query(
    `INSERT INTO srf_action_log
       (srf_id, action, description, details, amount_inr, reference_doc, actor_id, actor_role, actor_name)
     VALUES ($1::uuid, $2, $3, NULL, NULL, $4, $5, $6, $7)`,
    [srfId, action, description, referenceDoc ?? null, actor.id, actor.role, actor.displayName],
  );
}

export function registerDeliveryHandoffRoutes(
  app: Express,
  pool: Pool,
  requireAuth: RequireAuth,
  getUserById: (id: string) => DemoUser | null | undefined,
): void {
  /** Directory of delivery boys in the actor's region (or all for super_admin). */
  app.get("/api/service/delivery-boys", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    const canList =
      STORE_ROLES.has(actor.role) ||
      SC_LOGISTICS_ROLES.has(actor.role) ||
      actor.role === "super_admin" ||
      actor.role === "admin";
    if (!canList) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
    try {
      const params: unknown[] = [];
      let where = `WHERE role = 'delivery_boy' AND COALESCE(can_login, false) = COALESCE(can_login, false)`;
      // Include both login-disabled and login-enabled delivery boys
      where = `WHERE role = 'delivery_boy'`;
      if (actor.role !== "super_admin" && actor.role !== "admin") {
        if (!actor.regionId) {
          res.json({ rows: [] });
          return;
        }
        params.push(actor.regionId);
        where += ` AND region_id = $${params.length}`;
      }
      const { rows } = await pool.query<{
        id: string;
        display_name: string;
        email: string;
        phone: string | null;
        region_id: string | null;
      }>(
        `SELECT id, display_name, email, phone, region_id
         FROM app_users
         ${where}
         ORDER BY display_name ASC`,
        params,
      );
      res.json({
        rows: rows.map((r) => ({
          id: r.id,
          displayName: r.display_name,
          email: r.email,
          phone: r.phone,
          regionId: r.region_id,
        })),
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not load delivery boys." });
    }
  });

  /** Pending TDs for handoff queues. */
  app.get("/api/service/delivery-handoff/pending", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    const queue = String(req.query.queue ?? "").trim() as
      | "store_send"
      | "ho_receive"
      | "ho_send"
      | "store_receive";
    try {
      if (queue === "store_send") {
        if (!STORE_ROLES.has(actor.role) || !actor.storeId) {
          res.status(403).json({ error: "Store login required." });
          return;
        }
        const { rows } = await pool.query(
          `SELECT dc.id, dc.dc_number AS "dcNumber", dc.status, dc.created_at AS "createdAt",
                  COUNT(l.srf_id)::int AS "watchCount",
                  COALESCE(json_agg(json_build_object(
                    'id', j.id, 'reference', j.reference, 'customerName', j.customer_name,
                    'watchBrand', j.watch_brand, 'watchModel', j.watch_model, 'status', j.status
                  ) ORDER BY j.reference) FILTER (WHERE j.id IS NOT NULL), '[]'::json) AS watches
           FROM delivery_challans dc
           JOIN delivery_challan_lines l ON l.dc_id = dc.id
           JOIN srf_jobs j ON j.id = l.srf_id
           WHERE dc.from_store_id = $1
             AND dc.to_location = 'SERVICE_CENTRE'
             AND dc.status = 'CREATED'
             AND j.status = 'pending_ho_transit'
           GROUP BY dc.id
           ORDER BY dc.created_at ASC`,
          [actor.storeId],
        );
        res.json({ rows });
        return;
      }

      if (queue === "ho_receive") {
        if (!SC_LOGISTICS_ROLES.has(actor.role)) {
          res.status(403).json({ error: "Front desk / HO logistics required." });
          return;
        }
        const params: unknown[] = [];
        let regionFilter = "";
        if (actor.role !== "super_admin" && actor.role !== "admin") {
          if (!actor.regionId) {
            res.json({ rows: [] });
            return;
          }
          params.push(actor.regionId);
          regionFilter = `AND dc.region_id = $${params.length}`;
        }
        const { rows } = await pool.query(
          `SELECT dc.id, dc.dc_number AS "dcNumber", dc.status, dc.handed_to_delivery_at AS "handedToDeliveryAt",
                  dc.delivery_boy_user_id AS "deliveryBoyUserId",
                  u.display_name AS "deliveryBoyName",
                  COUNT(l.srf_id)::int AS "watchCount",
                  COALESCE(json_agg(json_build_object(
                    'id', j.id, 'reference', j.reference, 'customerName', j.customer_name,
                    'watchBrand', j.watch_brand, 'watchModel', j.watch_model, 'status', j.status
                  ) ORDER BY j.reference) FILTER (WHERE j.id IS NOT NULL), '[]'::json) AS watches
           FROM delivery_challans dc
           JOIN delivery_challan_lines l ON l.dc_id = dc.id
           JOIN srf_jobs j ON j.id = l.srf_id
           LEFT JOIN app_users u ON u.id = dc.delivery_boy_user_id
           WHERE dc.to_location = 'SERVICE_CENTRE'
             AND dc.status = 'IN_TRANSIT'
             AND j.status = 'in_transit_sc'
             ${regionFilter}
           GROUP BY dc.id, u.display_name
           ORDER BY dc.handed_to_delivery_at ASC NULLS LAST`,
          params,
        );
        res.json({ rows });
        return;
      }

      if (queue === "ho_send") {
        if (!SC_LOGISTICS_ROLES.has(actor.role)) {
          res.status(403).json({ error: "Front desk / HO logistics required." });
          return;
        }
        const params: unknown[] = [];
        let regionFilter = "";
        if (actor.role !== "super_admin" && actor.role !== "admin") {
          if (!actor.regionId) {
            res.json({ rows: [] });
            return;
          }
          params.push(actor.regionId);
          regionFilter = `AND dc.region_id = $${params.length}`;
        }
        const { rows } = await pool.query(
          `SELECT dc.id, dc.dc_number AS "dcNumber", dc.status, dc.created_at AS "createdAt",
                  COUNT(l.srf_id)::int AS "watchCount",
                  COALESCE(json_agg(json_build_object(
                    'id', j.id, 'reference', j.reference, 'customerName', j.customer_name,
                    'watchBrand', j.watch_brand, 'watchModel', j.watch_model, 'status', j.status,
                    'destinationStoreId', j.destination_store_id
                  ) ORDER BY j.reference) FILTER (WHERE j.id IS NOT NULL), '[]'::json) AS watches
           FROM delivery_challans dc
           JOIN delivery_challan_lines l ON l.dc_id = dc.id
           JOIN srf_jobs j ON j.id = l.srf_id
           WHERE dc.to_location = 'STORE'
             AND dc.status IN ('CREATED', 'DISPATCHED')
             AND j.status = 'pending_store_transit'
             ${regionFilter}
           GROUP BY dc.id
           ORDER BY dc.created_at ASC`,
          params,
        );
        res.json({ rows });
        return;
      }

      if (queue === "store_receive") {
        if (!STORE_ROLES.has(actor.role) || !actor.storeId) {
          res.status(403).json({ error: "Store login required." });
          return;
        }
        const { rows } = await pool.query(
          `SELECT dc.id, dc.dc_number AS "dcNumber", dc.status, dc.handed_to_delivery_at AS "handedToDeliveryAt",
                  dc.delivery_boy_user_id AS "deliveryBoyUserId",
                  u.display_name AS "deliveryBoyName",
                  COUNT(l.srf_id)::int AS "watchCount",
                  COALESCE(json_agg(json_build_object(
                    'id', j.id, 'reference', j.reference, 'customerName', j.customer_name,
                    'watchBrand', j.watch_brand, 'watchModel', j.watch_model, 'status', j.status
                  ) ORDER BY j.reference) FILTER (WHERE j.id IS NOT NULL), '[]'::json) AS watches
           FROM delivery_challans dc
           JOIN delivery_challan_lines l ON l.dc_id = dc.id
           JOIN srf_jobs j ON j.id = l.srf_id
           LEFT JOIN app_users u ON u.id = dc.delivery_boy_user_id
           WHERE dc.to_location = 'STORE'
             AND dc.status = 'IN_TRANSIT'
             AND j.status = 'dispatched_to_store'
             AND j.destination_store_id = $1
           GROUP BY dc.id, u.display_name
           ORDER BY dc.handed_to_delivery_at ASC NULLS LAST`,
          [actor.storeId],
        );
        res.json({ rows });
        return;
      }

      res.status(400).json({ error: "queue must be store_send, ho_receive, ho_send, or store_receive." });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not load pending handoffs." });
    }
  });

  /** Completed and active delivery-boy carrying history, scoped to the actor's store/region. */
  app.get("/api/service/delivery-handoff/history", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    if (!STORE_ROLES.has(actor.role) && !SC_LOGISTICS_ROLES.has(actor.role)) {
      res.status(403).json({ error: "Store or HO logistics role required." });
      return;
    }

    try {
      const params: unknown[] = [];
      let scope = "";
      if (STORE_ROLES.has(actor.role)) {
        if (!actor.storeId) {
          res.json({ rows: [] });
          return;
        }
        params.push(actor.storeId);
        scope = `AND EXISTS (
          SELECT 1
          FROM delivery_challan_lines scoped_l
          JOIN srf_jobs scoped_j ON scoped_j.id = scoped_l.srf_id
          WHERE scoped_l.dc_id = dc.id
            AND (scoped_j.store_id = $1 OR scoped_j.destination_store_id = $1)
        )`;
      } else if (actor.role !== "super_admin" && actor.role !== "admin") {
        if (!actor.regionId) {
          res.json({ rows: [] });
          return;
        }
        params.push(actor.regionId);
        scope = `AND dc.region_id = $1`;
      }

      const { rows } = await pool.query(
        `SELECT dc.id,
                dc.dc_number AS "dcNumber",
                dc.to_location AS "toLocation",
                dc.status,
                dc.created_at AS "createdAt",
                dc.handed_to_delivery_at AS "handedToDeliveryAt",
                dc.delivery_received_at AS "deliveryReceivedAt",
                dc.delivery_trip_number AS "deliveryTripNumber",
                dc.delivery_boy_user_id AS "deliveryBoyUserId",
                u.display_name AS "deliveryBoyName",
                u.phone AS "deliveryBoyPhone",
                COUNT(l.srf_id)::int AS "watchCount",
                COALESCE(json_agg(json_build_object(
                  'id', j.id,
                  'reference', j.reference,
                  'customerName', j.customer_name,
                  'watchBrand', j.watch_brand,
                  'watchModel', j.watch_model,
                  'status', j.status,
                  'originStoreId', j.store_id,
                  'destinationStoreId', j.destination_store_id
                ) ORDER BY j.reference) FILTER (WHERE j.id IS NOT NULL), '[]'::json) AS watches
         FROM delivery_challans dc
         JOIN delivery_challan_lines l ON l.dc_id = dc.id
         JOIN srf_jobs j ON j.id = l.srf_id
         JOIN app_users u ON u.id = dc.delivery_boy_user_id
         WHERE dc.delivery_boy_user_id IS NOT NULL
           ${scope}
         GROUP BY dc.id, u.display_name, u.phone
         ORDER BY COALESCE(dc.handed_to_delivery_at, dc.created_at) DESC`,
        params,
      );
      res.json({ rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not load delivery-boy history." });
    }
  });

  app.post("/api/service/delivery-handoff/otp/start", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    const kind = String(req.body?.kind ?? "").trim() as HandoffKind;
    const deliveryBoyUserId = String(req.body?.deliveryBoyUserId ?? "").trim();
    const dcNumbers = Array.isArray(req.body?.dcNumbers)
      ? req.body.dcNumbers.map((x: unknown) => String(x ?? "").trim()).filter(Boolean)
      : [];
    if (!deliveryBoyUserId || dcNumbers.length === 0) {
      res.status(400).json({ error: "Select delivery boy and at least one transfer document." });
      return;
    }
    const allowedKinds: HandoffKind[] = [
      "store_to_ho_send",
      "ho_receive_from_db",
      "ho_to_store_send",
      "store_receive_from_db",
    ];
    if (!allowedKinds.includes(kind)) {
      res.status(400).json({ error: "Invalid handoff kind." });
      return;
    }
    if (
      (kind === "store_to_ho_send" || kind === "store_receive_from_db") &&
      !STORE_ROLES.has(actor.role)
    ) {
      res.status(403).json({ error: "Store role required." });
      return;
    }
    if (
      (kind === "ho_receive_from_db" || kind === "ho_to_store_send") &&
      !SC_LOGISTICS_ROLES.has(actor.role)
    ) {
      res.status(403).json({ error: "Front desk / HO logistics required." });
      return;
    }

    try {
      const { rows: boys } = await pool.query<{
        id: string;
        email: string;
        phone: string | null;
        display_name: string;
        region_id: string | null;
      }>(
        `SELECT id, email, phone, display_name, region_id
         FROM app_users
         WHERE id = $1 AND role = 'delivery_boy'
         LIMIT 1`,
        [deliveryBoyUserId],
      );
      const boy = boys[0];
      if (!boy) {
        res.status(404).json({ error: "Delivery boy not found." });
        return;
      }
      if (
        actor.role !== "super_admin" &&
        actor.role !== "admin" &&
        actor.regionId &&
        boy.region_id &&
        boy.region_id !== actor.regionId
      ) {
        res.status(403).json({ error: "Delivery boy is not in your region." });
        return;
      }

      const p10 = phoneLast10(boy.phone ?? "");
      const email = String(boy.email ?? "").trim().toLowerCase();
      const targets: OtpDeliveryTarget[] = [];
      if (p10.length === 10) targets.push({ type: "mobile", label: p10 });
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) targets.push({ type: "email", label: email });
      if (targets.length === 0) {
        res.status(400).json({
          error: "Delivery boy needs a valid 10-digit mobile and/or email for OTP.",
        });
        return;
      }

      // Validate TDs match expected queue state
      const { rows: dcs } = await pool.query<{
        dc_number: string;
        status: string;
        to_location: string;
        from_store_id: string | null;
        delivery_boy_user_id: string | null;
        region_id: string;
      }>(
        `SELECT dc_number, status, to_location, from_store_id, delivery_boy_user_id, region_id
         FROM delivery_challans
         WHERE dc_number = ANY($1::text[])`,
        [dcNumbers],
      );
      if (dcs.length !== dcNumbers.length) {
        res.status(400).json({ error: "One or more transfer documents were not found." });
        return;
      }
      for (const dc of dcs) {
        if (kind === "store_to_ho_send") {
          if (dc.to_location !== "SERVICE_CENTRE" || dc.status !== "CREATED") {
            res.status(400).json({ error: `TD ${dc.dc_number} is not pending send to centralized service centre.` });
            return;
          }
          if (dc.from_store_id !== actor.storeId) {
            res.status(403).json({ error: `TD ${dc.dc_number} is not from your store.` });
            return;
          }
        } else if (kind === "ho_receive_from_db") {
          if (dc.to_location !== "SERVICE_CENTRE" || dc.status !== "IN_TRANSIT") {
            res.status(400).json({ error: `TD ${dc.dc_number} is not in transit to HO.` });
            return;
          }
          if (dc.delivery_boy_user_id !== deliveryBoyUserId) {
            res.status(400).json({ error: `TD ${dc.dc_number} was not handed to this delivery boy.` });
            return;
          }
        } else if (kind === "ho_to_store_send") {
          if (dc.to_location !== "STORE" || !["CREATED", "DISPATCHED"].includes(dc.status)) {
            res.status(400).json({ error: `TD ${dc.dc_number} is not pending send to store.` });
            return;
          }
        } else if (kind === "store_receive_from_db") {
          if (dc.to_location !== "STORE" || dc.status !== "IN_TRANSIT") {
            res.status(400).json({ error: `TD ${dc.dc_number} is not in transit to store.` });
            return;
          }
          if (dc.delivery_boy_user_id !== deliveryBoyUserId) {
            res.status(400).json({ error: `TD ${dc.dc_number} was not handed to this delivery boy.` });
            return;
          }
        }
      }

      const code = generateOtpCode();
      const sessionId = crypto.randomUUID();
      handoffOtpSessions.set(sessionId, {
        code,
        expiresAt: Date.now() + OTP_TTL_MS,
        kind,
        deliveryBoyUserId,
        dcNumbers,
        actorId: actor.id,
      });
      await deliverOtpToTargets(code, targets);
      res.json({
        ...otpStartResponsePayload(sessionId, code, targets),
        deliveryBoyName: boy.display_name,
      });
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "Could not send OTP.";
      res.status(502).json({ error: msg });
    }
  });

  app.post("/api/service/delivery-handoff/otp/confirm", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    const sessionId = String(req.body?.sessionId ?? "").trim();
    const otp = String(req.body?.otp ?? "").trim();
    if (!sessionId || !otp) {
      res.status(400).json({ error: "Session and OTP are required." });
      return;
    }
    const sess = handoffOtpSessions.get(sessionId);
    if (!sess || sess.expiresAt < Date.now()) {
      handoffOtpSessions.delete(sessionId);
      res.status(400).json({ error: "OTP session expired. Request a new code." });
      return;
    }
    if (sess.actorId !== actor.id) {
      res.status(403).json({ error: "OTP session belongs to another user." });
      return;
    }
    if (otp !== sess.code) {
      res.status(400).json({ error: "Incorrect OTP." });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      let updatedDocs = 0;
      let updatedWatches = 0;
      let deliveryTripNumber: string | null = null;
      if (sess.kind === "store_to_ho_send" || sess.kind === "ho_to_store_send") {
        const { rows: tripRows } = await client.query<{ trip_number: string }>(
          `SELECT 'DBT' || to_char(now(), 'YYMMDD') ||
                  lpad(nextval('delivery_trip_number_seq')::text, 6, '0') AS trip_number`,
        );
        deliveryTripNumber = tripRows[0]?.trip_number ?? null;
      }

      for (const dcNumber of sess.dcNumbers) {
        const { rows: dcs } = await client.query<{ id: string; status: string; to_location: string }>(
          `SELECT id, status, to_location FROM delivery_challans WHERE dc_number = $1 FOR UPDATE`,
          [dcNumber],
        );
        const dc = dcs[0];
        if (!dc) continue;

        const { rows: lines } = await client.query<{ srf_id: string }>(
          `SELECT srf_id FROM delivery_challan_lines WHERE dc_id = $1::uuid`,
          [dc.id],
        );

        if (sess.kind === "store_to_ho_send") {
          await client.query(
            `UPDATE delivery_challans
             SET status = 'IN_TRANSIT',
                 delivery_boy_user_id = $2,
                 handed_to_delivery_at = now(),
                 modified_by = $3,
                 delivery_trip_number = COALESCE(delivery_trip_number, $4)
             WHERE id = $1::uuid AND status = 'CREATED'`,
            [dc.id, sess.deliveryBoyUserId, actor.id, deliveryTripNumber],
          );
          for (const line of lines) {
            const upd = await client.query(
              `UPDATE srf_jobs
               SET status = 'in_transit_sc', updated_at = now(), modified_by = $2
               WHERE id = $1::uuid AND status = 'pending_ho_transit'`,
              [line.srf_id, actor.id],
            );
            if ((upd.rowCount ?? 0) > 0) {
              await appendStatusHistory(
                client,
                line.srf_id,
                "in_transit_sc",
                actor.id,
                `Handed to delivery boy for HO — transfer ${dcNumber}.`,
              );
              await appendActionLog(
                client,
                line.srf_id,
                "delivery_handoff_store_send",
                `Handed to delivery boy (OTP) for HO via ${dcNumber}.`,
                actor,
                dcNumber,
              );
              updatedWatches += 1;
            }
          }
          updatedDocs += 1;
        } else if (sess.kind === "ho_receive_from_db") {
          await client.query(
            `UPDATE delivery_challans
             SET status = 'AWAITING_INWARD',
                 delivery_received_at = now(),
                 modified_by = $2
             WHERE id = $1::uuid AND status = 'IN_TRANSIT' AND delivery_boy_user_id = $3`,
            [dc.id, actor.id, sess.deliveryBoyUserId],
          );
          for (const line of lines) {
            const upd = await client.query(
              `UPDATE srf_jobs
               SET status = 'awaiting_sc_inward', updated_at = now(), modified_by = $2
               WHERE id = $1::uuid AND status = 'in_transit_sc'`,
              [line.srf_id, actor.id],
            );
            if ((upd.rowCount ?? 0) > 0) {
              await appendStatusHistory(
                client,
                line.srf_id,
                "awaiting_sc_inward",
                actor.id,
                `Received from delivery boy at HO — waiting for inward (${dcNumber}).`,
              );
              await appendActionLog(
                client,
                line.srf_id,
                "delivery_handoff_ho_receive",
                `Front desk received from delivery boy (OTP). Waiting for inward — ${dcNumber}.`,
                actor,
                dcNumber,
              );
              updatedWatches += 1;
            }
          }
          updatedDocs += 1;
        } else if (sess.kind === "ho_to_store_send") {
          await client.query(
            `UPDATE delivery_challans
             SET status = 'IN_TRANSIT',
                 delivery_boy_user_id = $2,
                 handed_to_delivery_at = now(),
                 modified_by = $3,
                 delivery_trip_number = COALESCE(delivery_trip_number, $4)
             WHERE id = $1::uuid AND status IN ('CREATED', 'DISPATCHED')`,
            [dc.id, sess.deliveryBoyUserId, actor.id, deliveryTripNumber],
          );
          for (const line of lines) {
            const upd = await client.query(
              `UPDATE srf_jobs
               SET status = 'dispatched_to_store',
                   dispatched_to_store_at = COALESCE(dispatched_to_store_at, now()),
                   updated_at = now(),
                   modified_by = $2
               WHERE id = $1::uuid AND status = 'pending_store_transit'`,
              [line.srf_id, actor.id],
            );
            if ((upd.rowCount ?? 0) > 0) {
              await appendStatusHistory(
                client,
                line.srf_id,
                "dispatched_to_store",
                actor.id,
                `Handed to delivery boy for store — transfer ${dcNumber}.`,
              );
              await appendActionLog(
                client,
                line.srf_id,
                "delivery_handoff_ho_send",
                `Handed to delivery boy (OTP) for store via ${dcNumber}.`,
                actor,
                dcNumber,
              );
              updatedWatches += 1;
            }
          }
          updatedDocs += 1;
        } else if (sess.kind === "store_receive_from_db") {
          await client.query(
            `UPDATE delivery_challans
             SET status = 'AWAITING_INWARD',
                 delivery_received_at = now(),
                 modified_by = $2
             WHERE id = $1::uuid AND status = 'IN_TRANSIT' AND delivery_boy_user_id = $3`,
            [dc.id, actor.id, sess.deliveryBoyUserId],
          );
          for (const line of lines) {
            const upd = await client.query(
              `UPDATE srf_jobs
               SET status = 'awaiting_store_inward', updated_at = now(), modified_by = $2
               WHERE id = $1::uuid AND status = 'dispatched_to_store'
                 AND destination_store_id = $3`,
              [line.srf_id, actor.id, actor.storeId],
            );
            if ((upd.rowCount ?? 0) > 0) {
              await appendStatusHistory(
                client,
                line.srf_id,
                "awaiting_store_inward",
                actor.id,
                `Received from delivery boy at store — waiting for inward (${dcNumber}).`,
              );
              await appendActionLog(
                client,
                line.srf_id,
                "delivery_handoff_store_receive",
                `Store received from delivery boy (OTP). Waiting for inward — ${dcNumber}.`,
                actor,
                dcNumber,
              );
              updatedWatches += 1;
            }
          }
          updatedDocs += 1;
        }
      }

      await client.query("COMMIT");
      handoffOtpSessions.delete(sessionId);
      res.json({ ok: true, updatedDocs, updatedWatches, deliveryTripNumber });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(e);
      res.status(500).json({ error: "Could not confirm delivery handoff." });
    } finally {
      client.release();
    }
  });
}
