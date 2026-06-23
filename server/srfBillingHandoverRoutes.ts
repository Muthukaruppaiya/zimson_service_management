import type { Express, NextFunction, Request, Response } from "express";
import crypto from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { DemoUser } from "../src/types/user";
import { deleteStoredFile, persistUploadedFile } from "./storage/fileStorage";
import { publicMediaUrl } from "./storage/mediaUrl";
import { categoryForSrfPhoto } from "./storage/config";
import { createMemoryUpload } from "./storage/multerMemory";
import { validateQuickBillCaptureUpload } from "../src/lib/watchAttachmentUpload";

type Authed = Request & { userId: string };

const handoverUpload = createMemoryUpload(8 * 1024 * 1024);

const STORE_ROLES = new Set<DemoUser["role"]>([
  "store_user",
  "store_manager",
  "store_accounts",
]);

function tokenHash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function stripLeadingSlash(path: string): string {
  const p = path.replace(/\\/g, "/").trim();
  return p.startsWith("/") ? p.slice(1) : p;
}

function mediaPublicPath(storagePath: string): string {
  return publicMediaUrl(storagePath);
}

type HandoverSessionRow = {
  id: string;
  srf_id: string;
  photo_path: string | null;
  photo_mime: string | null;
  expires_at: Date;
  revoked_at: Date | null;
  finalized_at: Date | null;
  reference?: string;
  customer_name?: string;
  watch_brand?: string;
  watch_model?: string;
  status?: string;
  store_id?: string;
  destination_store_id?: string | null;
  region_id?: string;
};

function ensureHandoverSessionActive(row: HandoverSessionRow | undefined): string | null {
  if (!row) return "Invalid upload link.";
  if (row.revoked_at) return "This upload link has been revoked.";
  if (row.finalized_at) return "This upload link has already been used.";
  if (new Date(row.expires_at).getTime() < Date.now()) return "This upload link has expired.";
  return null;
}

function actorCanAccessSrf(actor: DemoUser, row: HandoverSessionRow): boolean {
  if (actor.role === "super_admin" || actor.role === "admin") return true;
  if (!STORE_ROLES.has(actor.role)) return false;
  const storeId = String(row.destination_store_id ?? row.store_id ?? "").trim();
  return Boolean(
    actor.regionId === row.region_id &&
      actor.storeId &&
      storeId &&
      actor.storeId === storeId,
  );
}

async function loadSessionForSrf(
  pool: Pool | PoolClient,
  srfId: string,
): Promise<HandoverSessionRow | null> {
  const { rows } = await pool.query<HandoverSessionRow>(
    `SELECT s.id,
            s.srf_id,
            s.photo_path,
            s.photo_mime,
            s.expires_at,
            s.revoked_at,
            s.finalized_at,
            j.reference,
            j.customer_name,
            j.watch_brand,
            j.watch_model,
            j.status,
            j.store_id,
            j.destination_store_id,
            j.region_id
     FROM srf_billing_handover_sessions s
     JOIN srf_jobs j ON j.id = s.srf_id
     WHERE s.srf_id = $1::uuid
       AND s.revoked_at IS NULL
       AND s.finalized_at IS NULL
       AND s.expires_at > now()
     ORDER BY s.created_at DESC
     LIMIT 1`,
    [srfId],
  );
  return rows[0] ?? null;
}

function mapSessionResponse(row: HandoverSessionRow, token?: string) {
  return {
    sessionId: row.id,
    srfId: row.srf_id,
    reference: row.reference ?? "",
    customerName: row.customer_name ?? "Customer",
    watch: [row.watch_brand, row.watch_model].filter(Boolean).join(" ") || "Watch",
    photoPath: row.photo_path ? mediaPublicPath(row.photo_path) : null,
    photoMime: row.photo_mime,
    expiresAt: row.expires_at,
    ...(token ? { token, captureUrl: `/service/srf-handover-capture?t=${encodeURIComponent(token)}` } : {}),
  };
}

async function unlinkPhoto(filePath: string | null | undefined): Promise<void> {
  const raw = String(filePath ?? "").trim();
  if (!raw) return;
  await deleteStoredFile(stripLeadingSlash(raw));
}

export async function finalizeSrfBillingHandoverSession(
  client: PoolClient,
  sessionId: string,
  srfId: string,
): Promise<string | null> {
  const sid = String(sessionId ?? "").trim();
  if (!sid) return null;
  const { rows } = await client.query<{
    id: string;
    srf_id: string;
    photo_path: string | null;
    finalized_at: Date | null;
  }>(
    `SELECT id, srf_id, photo_path, finalized_at
     FROM srf_billing_handover_sessions
     WHERE id = $1::uuid AND srf_id = $2::uuid
     FOR UPDATE`,
    [sid, srfId],
  );
  const row = rows[0];
  if (!row || row.finalized_at) return null;
  const photoPath = String(row.photo_path ?? "").trim() || null;
  await client.query(
    `UPDATE srf_billing_handover_sessions SET finalized_at = now() WHERE id = $1::uuid`,
    [row.id],
  );
  if (photoPath) {
    await client.query(`UPDATE srf_jobs SET handover_photo_path = $2 WHERE id = $1::uuid`, [
      srfId,
      photoPath,
    ]);
  }
  return photoPath;
}

export function registerSrfBillingHandoverRoutes(
  app: Express,
  pool: Pool,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
  getUserById: (id: string) => DemoUser | null,
): void {
  app.get("/api/public/srf-billing-handover/session", async (req, res) => {
    const token = String(req.query.token ?? "").trim();
    if (!token) {
      res.status(400).json({ error: "token is required." });
      return;
    }
    try {
      const { rows } = await pool.query<HandoverSessionRow>(
        `SELECT s.id, s.srf_id, s.photo_path, s.photo_mime, s.expires_at, s.revoked_at, s.finalized_at,
                j.reference, j.customer_name, j.watch_brand, j.watch_model, j.status,
                j.store_id, j.destination_store_id, j.region_id
         FROM srf_billing_handover_sessions s
         JOIN srf_jobs j ON j.id = s.srf_id
         WHERE s.token_hash = $1
         ORDER BY s.created_at DESC
         LIMIT 1`,
        [tokenHash(token)],
      );
      const row = rows[0];
      const error = ensureHandoverSessionActive(row);
      if (error) {
        res.status(400).json({ error });
        return;
      }
      if (row!.status !== "received_at_store") {
        res.status(400).json({ error: "This SRF is not ready for billing handover photo." });
        return;
      }
      res.json(mapSessionResponse(row!));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not load handover session." });
    }
  });

  app.post(
    "/api/public/srf-billing-handover/upload",
    handoverUpload.single("file"),
    async (req, res) => {
      const token = String(req.body?.token ?? req.query?.token ?? "").trim();
      if (!token) {
        res.status(400).json({ error: "token is required." });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: "Upload image file under field name 'file'." });
        return;
      }
      const validationError = validateQuickBillCaptureUpload(req.file, "watch");
      if (validationError) {
        res.status(400).json({ error: validationError });
        return;
      }
      try {
        const { rows } = await pool.query<HandoverSessionRow>(
          `SELECT s.id, s.srf_id, s.photo_path, s.photo_mime, s.expires_at, s.revoked_at, s.finalized_at,
                  j.reference, j.customer_name, j.watch_brand, j.watch_model, j.status,
                  j.store_id, j.destination_store_id, j.region_id
           FROM srf_billing_handover_sessions s
           JOIN srf_jobs j ON j.id = s.srf_id
           WHERE s.token_hash = $1
           ORDER BY s.created_at DESC
           LIMIT 1`,
          [tokenHash(token)],
        );
        const row = rows[0];
        const error = ensureHandoverSessionActive(row);
        if (error) {
          res.status(400).json({ error });
          return;
        }
        if (row!.status !== "received_at_store") {
          res.status(400).json({ error: "This SRF is not ready for billing handover photo." });
          return;
        }

        const oldStored = row!.photo_path;
        const storagePath = await persistUploadedFile({
          category: categoryForSrfPhoto("front"),
          buffer: req.file.buffer,
          originalName: req.file.originalname || "handover.jpg",
          mime: req.file.mimetype || "image/jpeg",
          fallbackExt: ".jpg",
        });

        await pool.query(
          `UPDATE srf_billing_handover_sessions
           SET photo_path = $2, photo_mime = $3
           WHERE id = $1::uuid`,
          [row!.id, storagePath, req.file.mimetype || "image/jpeg"],
        );
        if (oldStored && oldStored !== storagePath) {
          await unlinkPhoto(oldStored);
        }

        const updated = { ...row!, photo_path: storagePath, photo_mime: req.file.mimetype || "image/jpeg" };
        res.json({ ok: true, ...mapSessionResponse(updated) });
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Could not upload handover photo." });
      }
    },
  );

  app.post("/api/service/srf-jobs/:srfId/billing-handover-session", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || (!STORE_ROLES.has(actor.role) && actor.role !== "super_admin" && actor.role !== "admin")) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
    const srfId = String(req.params.srfId ?? "").trim();
    try {
      const { rows: jobRows } = await pool.query<{
        id: string;
        status: string;
        store_id: string;
        destination_store_id: string | null;
        region_id: string;
      }>(
        `SELECT id, status, store_id, destination_store_id, region_id
         FROM srf_jobs WHERE id = $1::uuid`,
        [srfId],
      );
      const job = jobRows[0];
      if (!job || job.status !== "received_at_store") {
        res.status(400).json({ error: "SRF must be received at store for handover photo." });
        return;
      }
      const sessionProbe: HandoverSessionRow = {
        id: "",
        srf_id: srfId,
        photo_path: null,
        photo_mime: null,
        expires_at: new Date(),
        revoked_at: null,
        finalized_at: null,
        store_id: job.store_id,
        destination_store_id: job.destination_store_id,
        region_id: job.region_id,
      };
      if (!actorCanAccessSrf(actor, sessionProbe)) {
        res.status(403).json({ error: "Cannot create handover link for this SRF." });
        return;
      }

      const existing = await loadSessionForSrf(pool, srfId);
      const carryPhotoPath = existing?.photo_path ?? null;
      const carryPhotoMime = existing?.photo_mime ?? null;

      await pool.query(
        `UPDATE srf_billing_handover_sessions SET revoked_at = now()
         WHERE srf_id = $1::uuid AND revoked_at IS NULL AND finalized_at IS NULL`,
        [srfId],
      );
      const token = crypto.randomBytes(24).toString("hex");
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO srf_billing_handover_sessions (
           srf_id, token_hash, photo_path, photo_mime, expires_at, created_by
         ) VALUES ($1::uuid, $2, $3, $4, now() + interval '45 minutes', $5)
         RETURNING id::text AS id`,
        [srfId, tokenHash(token), carryPhotoPath, carryPhotoMime, actor.id],
      );
      const sessionId = rows[0]?.id;
      if (!sessionId) throw new Error("Could not create handover session.");
      const loaded = await loadSessionForSrf(pool, srfId);
      if (!loaded) throw new Error("Could not load handover session.");
      res.json(mapSessionResponse(loaded, token));
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Could not create handover upload link." });
    }
  });

  app.get("/api/service/srf-jobs/:srfId/billing-handover-session", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    const srfId = String(req.params.srfId ?? "").trim();
    try {
      const row = await loadSessionForSrf(pool, srfId);
      if (!row) {
        res.json({ session: null });
        return;
      }
      if (!actorCanAccessSrf(actor, row)) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
      res.json({ session: mapSessionResponse(row) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not load handover session." });
    }
  });

  app.get("/api/service/srf-jobs/billing-handover-session/:sessionId", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    const sessionId = String(req.params.sessionId ?? "").trim();
    try {
      const { rows } = await pool.query<HandoverSessionRow>(
        `SELECT s.id, s.srf_id, s.photo_path, s.photo_mime, s.expires_at, s.revoked_at, s.finalized_at,
                j.reference, j.customer_name, j.watch_brand, j.watch_model, j.status,
                j.store_id, j.destination_store_id, j.region_id
         FROM srf_billing_handover_sessions s
         JOIN srf_jobs j ON j.id = s.srf_id
         WHERE s.id = $1::uuid`,
        [sessionId],
      );
      const row = rows[0];
      if (!row) {
        res.status(404).json({ error: "Session not found." });
        return;
      }
      if (!actorCanAccessSrf(actor, row)) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
      res.json(mapSessionResponse(row));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not load handover session." });
    }
  });

  app.post(
    "/api/service/srf-jobs/billing-handover-session/:sessionId/refresh",
    requireAuth,
    async (req, res) => {
      const actor = getUserById((req as Authed).userId);
      if (!actor) {
        res.status(401).json({ error: "Invalid session." });
        return;
      }
      const sessionId = String(req.params.sessionId ?? "").trim();
      try {
        const { rows } = await pool.query<HandoverSessionRow>(
          `SELECT s.id, s.srf_id, s.photo_path, s.photo_mime, s.expires_at, s.revoked_at, s.finalized_at,
                  j.reference, j.customer_name, j.watch_brand, j.watch_model, j.status,
                  j.store_id, j.destination_store_id, j.region_id
           FROM srf_billing_handover_sessions s
           JOIN srf_jobs j ON j.id = s.srf_id
           WHERE s.id = $1::uuid`,
          [sessionId],
        );
        const row = rows[0];
        if (!row) {
          res.status(404).json({ error: "Session not found." });
          return;
        }
        if (!actorCanAccessSrf(actor, row)) {
          res.status(403).json({ error: "Forbidden." });
          return;
        }
        if (row.finalized_at) {
          res.status(400).json({ error: "Cannot refresh link after SRF is closed." });
          return;
        }

        await pool.query(
          `UPDATE srf_billing_handover_sessions SET revoked_at = now() WHERE id = $1::uuid`,
          [sessionId],
        );
        const token = crypto.randomBytes(24).toString("hex");
        const { rows: ins } = await pool.query<{ id: string }>(
          `INSERT INTO srf_billing_handover_sessions (
             srf_id, token_hash, photo_path, photo_mime, expires_at, created_by
           ) VALUES ($1::uuid, $2, $3, $4, now() + interval '45 minutes', $5)
           RETURNING id::text AS id`,
          [row.srf_id, tokenHash(token), row.photo_path, row.photo_mime, actor.id],
        );
        const newId = ins[0]?.id;
        if (!newId) throw new Error("Could not refresh session.");
        const { rows: fresh } = await pool.query<HandoverSessionRow>(
          `SELECT s.id, s.srf_id, s.photo_path, s.photo_mime, s.expires_at, s.revoked_at, s.finalized_at,
                  j.reference, j.customer_name, j.watch_brand, j.watch_model, j.status,
                  j.store_id, j.destination_store_id, j.region_id
           FROM srf_billing_handover_sessions s
           JOIN srf_jobs j ON j.id = s.srf_id
           WHERE s.id = $1::uuid`,
          [newId],
        );
        res.json(mapSessionResponse(fresh[0]!, token));
      } catch (e) {
        console.error(e);
        res.status(400).json({ error: "Could not refresh handover link." });
      }
    },
  );

  app.delete(
    "/api/service/srf-jobs/billing-handover-session/:sessionId/photo",
    requireAuth,
    async (req, res) => {
      const actor = getUserById((req as Authed).userId);
      if (!actor) {
        res.status(401).json({ error: "Invalid session." });
        return;
      }
      const sessionId = String(req.params.sessionId ?? "").trim();
      try {
        const { rows } = await pool.query<HandoverSessionRow>(
          `SELECT s.id, s.srf_id, s.photo_path, s.photo_mime, s.expires_at, s.revoked_at, s.finalized_at,
                  j.reference, j.customer_name, j.watch_brand, j.watch_model, j.status,
                  j.store_id, j.destination_store_id, j.region_id
           FROM srf_billing_handover_sessions s
           JOIN srf_jobs j ON j.id = s.srf_id
           WHERE s.id = $1::uuid`,
          [sessionId],
        );
        const row = rows[0];
        if (!row) {
          res.status(404).json({ error: "Session not found." });
          return;
        }
        if (!actorCanAccessSrf(actor, row)) {
          res.status(403).json({ error: "Forbidden." });
          return;
        }
        if (row.finalized_at) {
          res.status(400).json({ error: "Cannot remove photo after SRF is closed." });
          return;
        }
        await unlinkPhoto(row.photo_path);
        await pool.query(
          `UPDATE srf_billing_handover_sessions SET photo_path = NULL, photo_mime = NULL WHERE id = $1::uuid`,
          [sessionId],
        );
        res.json({ ok: true, ...mapSessionResponse({ ...row, photo_path: null, photo_mime: null }) });
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Could not remove handover photo." });
      }
    },
  );
}
