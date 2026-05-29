import type { Express, NextFunction, Request, Response } from "express";
import crypto from "node:crypto";
import { deleteStoredFile, persistUploadedFile } from "./storage/fileStorage";
import { createMemoryUpload } from "./storage/multerMemory";
import type { Pool, PoolClient } from "pg";
import type { DemoUser } from "../src/types/user";
import {
  validateQuickBillAttachmentFile,
  WATCH_ATTACHMENT_MAX_BYTES,
} from "../src/lib/watchAttachmentUpload";

type Authed = Request & { userId: string };

const qbCaptureUpload = createMemoryUpload(WATCH_ATTACHMENT_MAX_BYTES);

function tokenHash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function actorCanAccessSession(
  actor: DemoUser,
  sessionRegionId: string,
  sessionStoreId: string,
): boolean {
  if (actor.role === "super_admin" || actor.role === "admin") return true;
  if (
    actor.role === "ho_manager" ||
    actor.role === "ho_accounts" ||
    actor.role === "ho_purchase" ||
    actor.role === "service_centre_clerk" ||
    actor.role === "service_centre_supervisor" ||
    actor.role === "technician"
  ) {
    return Boolean(actor.regionId && actor.regionId === sessionRegionId);
  }
  if (actor.role === "store_user" || actor.role === "store_manager" || actor.role === "store_accounts") {
    return Boolean(
      actor.regionId &&
        actor.storeId &&
        actor.regionId === sessionRegionId &&
        actor.storeId === sessionStoreId,
    );
  }
  return false;
}

function ensureCaptureSessionActive(row: {
  expires_at: Date;
  revoked_at: Date | null;
  used_at: Date | null;
  quick_bill_id: string | null;
} | undefined): string | null {
  if (!row) return "Invalid upload link.";
  if (row.revoked_at) return "This upload link has been revoked.";
  if (row.used_at || row.quick_bill_id) return "This upload link has already been used.";
  if (new Date(row.expires_at).getTime() < Date.now()) return "This upload link has expired.";
  return null;
}

async function unlinkQuickBillFile(filePath: string | null | undefined): Promise<void> {
  await deleteStoredFile(filePath);
}

type SessionRow = {
  id: string;
  region_id: string;
  store_id: string;
  customer_label: string;
  watch_label: string;
  watch_document_path: string | null;
  watch_image_path: string | null;
  expires_at: Date;
  revoked_at: Date | null;
  used_at: Date | null;
  quick_bill_id: string | null;
};

function mapSessionPublic(row: SessionRow) {
  return {
    sessionId: row.id,
    customerName: row.customer_label || "Customer",
    watch: row.watch_label || "Watch",
    documentPath: row.watch_document_path,
    imagePath: row.watch_image_path,
  };
}

export function registerQuickBillCaptureRoutes(
  app: Express,
  pool: Pool,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
  getUserById: (id: string) => DemoUser | null,
): void {
  app.get("/api/public/quick-bill-capture/session", async (req, res) => {
    const token = String(req.query.token ?? "").trim();
    if (!token) {
      res.status(400).json({ error: "token is required." });
      return;
    }
    try {
      const { rows } = await pool.query<SessionRow>(
        `SELECT id, region_id, store_id, customer_label, watch_label,
                watch_document_path, watch_image_path,
                expires_at, revoked_at, used_at, quick_bill_id
         FROM quick_bill_capture_sessions
         WHERE token_hash = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [tokenHash(token)],
      );
      const row = rows[0];
      const error = ensureCaptureSessionActive(row);
      if (error) {
        res.status(400).json({ error });
        return;
      }
      res.json(mapSessionPublic(row!));
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Invalid upload link." });
    }
  });

  app.post(
    "/api/public/quick-bill-capture/upload",
    qbCaptureUpload.single("file"),
    async (req, res) => {
      const token = String(req.body?.token ?? "").trim();
      const kindRaw = String(req.body?.kind ?? "").trim();
      if (!token) {
        res.status(400).json({ error: "token is required." });
        return;
      }
      if (kindRaw !== "doc" && kindRaw !== "img") {
        res.status(400).json({ error: "kind must be doc or img." });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: "file field is required." });
        return;
      }
      const validationError = validateQuickBillAttachmentFile(req.file, kindRaw);
      if (validationError) {
        res.status(400).json({ error: validationError });
        return;
      }
      try {
        const { rows } = await pool.query<SessionRow>(
          `SELECT id, region_id, store_id, customer_label, watch_label,
                  watch_document_path, watch_image_path,
                  expires_at, revoked_at, used_at, quick_bill_id
           FROM quick_bill_capture_sessions
           WHERE token_hash = $1
           ORDER BY created_at DESC
           LIMIT 1`,
          [tokenHash(token)],
        );
        const row = rows[0];
        const error = ensureCaptureSessionActive(row);
        if (error) {
          res.status(400).json({ error });
          return;
        }
        const storagePath = await persistUploadedFile({
          category: "quick-bill",
          buffer: req.file.buffer,
          originalName: req.file.originalname || (kindRaw === "doc" ? "document.pdf" : "image.jpg"),
          mime: req.file.mimetype || "application/octet-stream",
          fallbackExt: kindRaw === "doc" ? ".pdf" : ".jpg",
        });
        const urlPath = `/${storagePath}`;
        const col = kindRaw === "doc" ? "watch_document_path" : "watch_image_path";
        const oldPath = kindRaw === "doc" ? row!.watch_document_path : row!.watch_image_path;
        await pool.query(
          `UPDATE quick_bill_capture_sessions SET ${col} = $2 WHERE id = $1::uuid`,
          [row!.id, urlPath],
        );
        await unlinkQuickBillFile(oldPath);
        const { rows: updated } = await pool.query<SessionRow>(
          `SELECT id, region_id, store_id, customer_label, watch_label,
                  watch_document_path, watch_image_path,
                  expires_at, revoked_at, used_at, quick_bill_id
           FROM quick_bill_capture_sessions WHERE id = $1::uuid`,
          [row!.id],
        );
        res.json({ ok: true, url: urlPath, ...mapSessionPublic(updated[0]!) });
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Could not upload file." });
      }
    },
  );

  app.delete("/api/public/quick-bill-capture/attachment", async (req, res) => {
    const token = String(req.query.token ?? "").trim();
    const kindRaw = String(req.query.kind ?? "").trim();
    if (!token || (kindRaw !== "doc" && kindRaw !== "img")) {
      res.status(400).json({ error: "token and kind (doc|img) are required." });
      return;
    }
    try {
      const { rows } = await pool.query<SessionRow>(
        `SELECT id, region_id, store_id, customer_label, watch_label,
                watch_document_path, watch_image_path,
                expires_at, revoked_at, used_at, quick_bill_id
         FROM quick_bill_capture_sessions
         WHERE token_hash = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [tokenHash(token)],
      );
      const row = rows[0];
      const error = ensureCaptureSessionActive(row);
      if (error) {
        res.status(400).json({ error });
        return;
      }
      const oldPath = kindRaw === "doc" ? row!.watch_document_path : row!.watch_image_path;
      const col = kindRaw === "doc" ? "watch_document_path" : "watch_image_path";
      await pool.query(`UPDATE quick_bill_capture_sessions SET ${col} = NULL WHERE id = $1::uuid`, [
        row!.id,
      ]);
      await unlinkQuickBillFile(oldPath);
      const { rows: updated } = await pool.query<SessionRow>(
        `SELECT id, region_id, store_id, customer_label, watch_label,
                watch_document_path, watch_image_path,
                expires_at, revoked_at, used_at, quick_bill_id
         FROM quick_bill_capture_sessions WHERE id = $1::uuid`,
        [row!.id],
      );
      res.json({ ok: true, ...mapSessionPublic(updated[0]!) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not remove file." });
    }
  });

  app.post("/api/service/quick-bill/capture-session", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    const regionId = String(req.body?.regionId ?? actor.regionId ?? "").trim();
    const storeId = String(req.body?.storeId ?? actor.storeId ?? "").trim();
    if (!regionId || !storeId) {
      res.status(400).json({ error: "regionId and storeId are required." });
      return;
    }
    if (!actorCanAccessSession(actor, regionId, storeId)) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
    const customerLabel = String(req.body?.customerName ?? "").trim();
    const watchBrand = String(req.body?.watchBrand ?? "").trim();
    const watchModel = String(req.body?.watchModel ?? "").trim();
    const watchLabel = [watchBrand, watchModel].filter(Boolean).join(" · ") || "Watch";
    try {
      const token = crypto.randomBytes(24).toString("hex");
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO quick_bill_capture_sessions (
           token_hash, region_id, store_id, created_by, customer_label, watch_label, expires_at
         ) VALUES ($1, $2, $3, $4, $5, $6, now() + interval '45 minutes')
         RETURNING id::text AS id`,
        [tokenHash(token), regionId, storeId, actor.id, customerLabel, watchLabel],
      );
      const sessionId = rows[0]?.id;
      if (!sessionId) throw new Error("Could not create capture session.");
      res.json({
        sessionId,
        token,
        captureUrl: `/service/quick-bill-capture?t=${encodeURIComponent(token)}`,
      });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Could not create upload link." });
    }
  });

  app.get("/api/service/quick-bill/capture-session/:sessionId", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    const sessionId = String(req.params.sessionId ?? "").trim();
    try {
      const { rows } = await pool.query<SessionRow>(
        `SELECT id, region_id, store_id, customer_label, watch_label,
                watch_document_path, watch_image_path,
                expires_at, revoked_at, used_at, quick_bill_id
         FROM quick_bill_capture_sessions WHERE id = $1::uuid`,
        [sessionId],
      );
      const row = rows[0];
      if (!row) {
        res.status(404).json({ error: "Session not found." });
        return;
      }
      if (!actorCanAccessSession(actor, row.region_id, row.store_id)) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
      res.json(mapSessionPublic(row));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not load capture session." });
    }
  });

  app.post(
    "/api/service/quick-bill/capture-session/:sessionId/refresh",
    requireAuth,
    async (req, res) => {
      const actor = getUserById((req as Authed).userId);
      if (!actor) {
        res.status(401).json({ error: "Invalid session." });
        return;
      }
      const sessionId = String(req.params.sessionId ?? "").trim();
      try {
        const { rows } = await pool.query<SessionRow>(
          `SELECT id, region_id, store_id, customer_label, watch_label,
                  watch_document_path, watch_image_path,
                  expires_at, revoked_at, used_at, quick_bill_id
           FROM quick_bill_capture_sessions WHERE id = $1::uuid`,
          [sessionId],
        );
        const row = rows[0];
        if (!row) {
          res.status(404).json({ error: "Session not found." });
          return;
        }
        if (!actorCanAccessSession(actor, row.region_id, row.store_id)) {
          res.status(403).json({ error: "Forbidden." });
          return;
        }
        if (row.used_at || row.quick_bill_id) {
          res.status(400).json({ error: "Cannot refresh link after bill is saved." });
          return;
        }
        await pool.query(
          `UPDATE quick_bill_capture_sessions SET revoked_at = now() WHERE id = $1::uuid AND revoked_at IS NULL`,
          [sessionId],
        );
        const token = crypto.randomBytes(24).toString("hex");
        const { rows: ins } = await pool.query<{ id: string }>(
          `INSERT INTO quick_bill_capture_sessions (
             token_hash, region_id, store_id, created_by, customer_label, watch_label,
             watch_document_path, watch_image_path, expires_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now() + interval '45 minutes')
           RETURNING id::text AS id`,
          [
            tokenHash(token),
            row.region_id,
            row.store_id,
            actor.id,
            row.customer_label,
            row.watch_label,
            row.watch_document_path,
            row.watch_image_path,
          ],
        );
        const newId = ins[0]?.id;
        res.json({
          sessionId: newId,
          token,
          captureUrl: `/service/quick-bill-capture?t=${encodeURIComponent(token)}`,
          documentPath: row.watch_document_path,
          imagePath: row.watch_image_path,
        });
      } catch (e) {
        console.error(e);
        res.status(400).json({ error: "Could not refresh upload link." });
      }
    },
  );

  app.delete(
    "/api/service/quick-bill/capture-session/:sessionId/attachment",
    requireAuth,
    async (req, res) => {
      const actor = getUserById((req as Authed).userId);
      if (!actor) {
        res.status(401).json({ error: "Invalid session." });
        return;
      }
      const sessionId = String(req.params.sessionId ?? "").trim();
      const kindRaw = String(req.query.kind ?? "").trim();
      if (kindRaw !== "doc" && kindRaw !== "img") {
        res.status(400).json({ error: "kind must be doc or img." });
        return;
      }
      try {
        const { rows } = await pool.query<SessionRow>(
          `SELECT id, region_id, store_id, customer_label, watch_label,
                  watch_document_path, watch_image_path,
                  expires_at, revoked_at, used_at, quick_bill_id
           FROM quick_bill_capture_sessions WHERE id = $1::uuid`,
          [sessionId],
        );
        const row = rows[0];
        if (!row) {
          res.status(404).json({ error: "Session not found." });
          return;
        }
        if (!actorCanAccessSession(actor, row.region_id, row.store_id)) {
          res.status(403).json({ error: "Forbidden." });
          return;
        }
        const oldPath = kindRaw === "doc" ? row.watch_document_path : row.watch_image_path;
        const col = kindRaw === "doc" ? "watch_document_path" : "watch_image_path";
        await pool.query(`UPDATE quick_bill_capture_sessions SET ${col} = NULL WHERE id = $1::uuid`, [
          sessionId,
        ]);
        await unlinkQuickBillFile(oldPath);
        const { rows: updated } = await pool.query<SessionRow>(
          `SELECT id, region_id, store_id, customer_label, watch_label,
                  watch_document_path, watch_image_path,
                  expires_at, revoked_at, used_at, quick_bill_id
           FROM quick_bill_capture_sessions WHERE id = $1::uuid`,
          [sessionId],
        );
        res.json(mapSessionPublic(updated[0]!));
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Could not remove attachment." });
      }
    },
  );
}

/** Mark capture session used and link to saved quick bill. */
export async function finalizeQuickBillCaptureSession(
  pool: Pool | PoolClient,
  sessionId: string,
  quickBillId: string,
): Promise<void> {
  await pool.query(
    `UPDATE quick_bill_capture_sessions
     SET used_at = COALESCE(used_at, now()), quick_bill_id = $2::uuid
     WHERE id = $1::uuid`,
    [sessionId, quickBillId],
  );
}
