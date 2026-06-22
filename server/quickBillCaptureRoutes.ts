import type { Express, NextFunction, Request, Response } from "express";
import crypto from "node:crypto";
import { deleteStoredFile, persistUploadedFile } from "./storage/fileStorage";
import { publicMediaUrl } from "./storage/mediaUrl";
import { categoryForSrfPhoto } from "./storage/config";
import { createMemoryUpload } from "./storage/multerMemory";
import type { Pool, PoolClient } from "pg";
import type { DemoUser } from "../src/types/user";
import {
  normalizeSrfPhotoKind,
  SRF_DOCUMENT_PHOTO_KIND,
  SRF_WATCH_PHOTO_KINDS,
  type SrfPhotoKindStored,
} from "../src/lib/srfPhotoSlots";
import {
  validateQuickBillCaptureUpload,
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
  const raw = String(filePath ?? "").trim();
  if (!raw) return;
  await deleteStoredFile(raw.startsWith("/") ? raw.slice(1) : raw);
}

function stripLeadingSlash(path: string): string {
  const p = path.replace(/\\/g, "/").trim();
  return p.startsWith("/") ? p.slice(1) : p;
}

function mediaPublicPath(storagePath: string): string {
  return publicMediaUrl(storagePath);
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

type PhotoRow = {
  id: string;
  photoKind: string;
  filePath: string;
  mime: string;
  bytes: number;
};

function readUploadPhotoKind(req: Request): string {
  const fromBody = String(req.body?.photoKind ?? req.body?.kind ?? "").trim();
  if (fromBody) return fromBody;
  const header = String(req.headers["x-qb-photo-kind"] ?? req.headers["x-srf-photo-kind"] ?? "").trim();
  if (header) return header;
  return "";
}

function normalizeUploadKind(raw: string): SrfPhotoKindStored | null {
  const v = raw.trim().toLowerCase();
  if (v === "doc") return SRF_DOCUMENT_PHOTO_KIND;
  if (v === "img") return "front";
  return normalizeSrfPhotoKind(raw);
}

async function loadSessionPhotos(pool: Pool | PoolClient, sessionId: string): Promise<PhotoRow[]> {
  const { rows } = await pool.query<PhotoRow>(
    `SELECT id::text AS id,
            photo_kind AS "photoKind",
            file_path AS "filePath",
            mime,
            bytes
     FROM quick_bill_capture_photos
     WHERE session_id = $1::uuid
     ORDER BY photo_kind`,
    [sessionId],
  );
  return rows.map((r) => ({
    ...r,
    filePath: mediaPublicPath(r.filePath),
  }));
}

function deriveLegacyPaths(photos: PhotoRow[]): {
  documentPath: string | null;
  imagePath: string | null;
} {
  const byKind = new Map<string, PhotoRow>();
  for (const p of photos) {
    const k = normalizeSrfPhotoKind(p.photoKind);
    if (k) byKind.set(k, p);
  }
  const documentPath = byKind.get(SRF_DOCUMENT_PHOTO_KIND)?.filePath ?? null;
  const imagePath =
    byKind.get("front")?.filePath ??
    SRF_WATCH_PHOTO_KINDS.map((k) => byKind.get(k)?.filePath).find(Boolean) ??
    null;
  return { documentPath, imagePath };
}

async function syncLegacySessionColumns(
  pool: Pool | PoolClient,
  sessionId: string,
  photos: PhotoRow[],
): Promise<void> {
  const { documentPath, imagePath } = deriveLegacyPaths(photos);
  await pool.query(
    `UPDATE quick_bill_capture_sessions
     SET watch_document_path = $2, watch_image_path = $3
     WHERE id = $1::uuid`,
    [sessionId, documentPath, imagePath],
  );
}

async function migrateLegacySessionFiles(pool: Pool | PoolClient, row: SessionRow): Promise<void> {
  const existing = await loadSessionPhotos(pool, row.id);
  const kinds = new Set(
    existing.map((p) => normalizeSrfPhotoKind(p.photoKind)).filter(Boolean) as string[],
  );
  let changed = false;

  if (row.watch_document_path && !kinds.has(SRF_DOCUMENT_PHOTO_KIND)) {
    const fp = stripLeadingSlash(row.watch_document_path);
    await pool.query(
      `INSERT INTO quick_bill_capture_photos (session_id, photo_kind, file_path, mime, bytes)
       VALUES ($1::uuid, $2, $3, $4, 1)
       ON CONFLICT (session_id, photo_kind) DO NOTHING`,
      [row.id, SRF_DOCUMENT_PHOTO_KIND, fp, "application/octet-stream"],
    );
    changed = true;
  }
  const hasWatch = SRF_WATCH_PHOTO_KINDS.some((k) => kinds.has(k));
  if (row.watch_image_path && !hasWatch) {
    const fp = stripLeadingSlash(row.watch_image_path);
    await pool.query(
      `INSERT INTO quick_bill_capture_photos (session_id, photo_kind, file_path, mime, bytes)
       VALUES ($1::uuid, 'front', $2, $3, 1)
       ON CONFLICT (session_id, photo_kind) DO NOTHING`,
      [row.id, fp, "image/jpeg"],
    );
    changed = true;
  }
  if (changed) {
    const photos = await loadSessionPhotos(pool, row.id);
    await syncLegacySessionColumns(pool, row.id, photos);
  }
}

async function copySessionPhotos(
  pool: Pool | PoolClient,
  fromSessionId: string,
  toSessionId: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO quick_bill_capture_photos (session_id, photo_kind, file_path, mime, bytes)
     SELECT $2::uuid, photo_kind, file_path, mime, bytes
     FROM quick_bill_capture_photos
     WHERE session_id = $1::uuid
     ON CONFLICT (session_id, photo_kind) DO NOTHING`,
    [fromSessionId, toSessionId],
  );
}

async function buildSessionResponse(pool: Pool | PoolClient, row: SessionRow) {
  await migrateLegacySessionFiles(pool, row);
  const photos = await loadSessionPhotos(pool, row.id);
  const watchCount = photos.filter((p) => normalizeSrfPhotoKind(p.photoKind) !== SRF_DOCUMENT_PHOTO_KIND)
    .length;
  const { documentPath, imagePath } = deriveLegacyPaths(photos);
  return {
    sessionId: row.id,
    customerName: row.customer_label || "Customer",
    watch: row.watch_label || "Watch",
    documentPath,
    imagePath,
    photoCount: photos.length,
    watchPhotoCount: watchCount,
    photos,
  };
}

function mapSessionPublic(row: SessionRow, photos: PhotoRow[]) {
  const { documentPath, imagePath } = deriveLegacyPaths(photos);
  const watchCount = photos.filter((p) => normalizeSrfPhotoKind(p.photoKind) !== SRF_DOCUMENT_PHOTO_KIND)
    .length;
  return {
    sessionId: row.id,
    customerName: row.customer_label || "Customer",
    watch: row.watch_label || "Watch",
    documentPath,
    imagePath,
    photoCount: photos.length,
    watchPhotoCount: watchCount,
    photos,
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
      res.json(await buildSessionResponse(pool, row!));
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Invalid upload link." });
    }
  });

  async function handlePublicUpload(req: Request, res: Response) {
    const token = String(req.body?.token ?? "").trim();
    if (!token) {
      res.status(400).json({ error: "token is required." });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "file field is required." });
      return;
    }
    const photoKind = normalizeUploadKind(readUploadPhotoKind(req));
    if (!photoKind) {
      res.status(400).json({
        error: "Photo category is required (front, back, strap, serial, damage, other, or document).",
      });
      return;
    }
    const validationError = validateQuickBillCaptureUpload(
      req.file,
      photoKind === SRF_DOCUMENT_PHOTO_KIND ? "document" : "watch",
    );
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
      await migrateLegacySessionFiles(pool, row!);

      if (photoKind !== SRF_DOCUMENT_PHOTO_KIND) {
        const { rows: kindRows } = await pool.query<{ photo_kind: string }>(
          `SELECT photo_kind FROM quick_bill_capture_photos
           WHERE session_id = $1::uuid AND photo_kind <> 'document'`,
          [row!.id],
        );
        const kinds = new Set(kindRows.map((r) => r.photo_kind));
        if (!kinds.has(photoKind) && kinds.size >= 6) {
          res.status(400).json({
            error: "Maximum 6 watch photos allowed. Each type can be used once.",
          });
          return;
        }
      }

      const { rows: prior } = await pool.query<{ file_path: string }>(
        `SELECT file_path FROM quick_bill_capture_photos
         WHERE session_id = $1::uuid AND photo_kind = $2`,
        [row!.id, photoKind],
      );
      const oldStored = prior[0]?.file_path;

      const storagePath = await persistUploadedFile({
        category: categoryForSrfPhoto(photoKind),
        buffer: req.file.buffer,
        originalName:
          req.file.originalname ||
          (photoKind === SRF_DOCUMENT_PHOTO_KIND ? "document.pdf" : "photo.jpg"),
        mime: req.file.mimetype || "application/octet-stream",
        fallbackExt: photoKind === SRF_DOCUMENT_PHOTO_KIND ? ".pdf" : ".jpg",
      });

      await pool.query(
        `INSERT INTO quick_bill_capture_photos (session_id, photo_kind, file_path, mime, bytes)
         VALUES ($1::uuid, $2, $3, $4, $5)
         ON CONFLICT (session_id, photo_kind)
         DO UPDATE SET file_path = EXCLUDED.file_path, mime = EXCLUDED.mime, bytes = EXCLUDED.bytes, created_at = now()`,
        [row!.id, photoKind, storagePath, req.file.mimetype || "application/octet-stream", req.file.size],
      );
      if (oldStored && oldStored !== storagePath) {
        await unlinkQuickBillFile(oldStored);
      }

      const photos = await loadSessionPhotos(pool, row!.id);
      await syncLegacySessionColumns(pool, row!.id, photos);
      res.json({ ok: true, ...mapSessionPublic(row!, photos) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not upload file." });
    }
  }

  app.post(
    "/api/public/quick-bill-capture/upload",
    qbCaptureUpload.single("file"),
    handlePublicUpload,
  );

  app.delete("/api/public/quick-bill-capture/photo/:photoId", async (req, res) => {
    const token = String(req.query.token ?? "").trim();
    const photoId = String(req.params.photoId ?? "").trim();
    if (!token || !photoId) {
      res.status(400).json({ error: "token and photo id are required." });
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
      const { rows: deleted } = await pool.query<{ filePath: string }>(
        `DELETE FROM quick_bill_capture_photos
         WHERE id = $1::uuid AND session_id = $2::uuid
         RETURNING file_path AS "filePath"`,
        [photoId, row!.id],
      );
      if (deleted[0]?.filePath) await unlinkQuickBillFile(deleted[0].filePath);
      const photos = await loadSessionPhotos(pool, row!.id);
      await syncLegacySessionColumns(pool, row!.id, photos);
      res.json({ ok: true, ...mapSessionPublic(row!, photos) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not remove photo." });
    }
  });

  app.delete("/api/public/quick-bill-capture/attachment", async (req, res) => {
    const token = String(req.query.token ?? "").trim();
    const kindRaw = String(req.query.kind ?? "").trim();
    if (!token || !kindRaw) {
      res.status(400).json({ error: "token and kind are required." });
      return;
    }
    const photoKind = normalizeUploadKind(kindRaw);
    if (!photoKind) {
      res.status(400).json({ error: "Invalid kind." });
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
      const { rows: deleted } = await pool.query<{ filePath: string }>(
        `DELETE FROM quick_bill_capture_photos
         WHERE session_id = $1::uuid AND photo_kind = $2
         RETURNING file_path AS "filePath"`,
        [row!.id, photoKind],
      );
      for (const d of deleted) await unlinkQuickBillFile(d.filePath);
      const photos = await loadSessionPhotos(pool, row!.id);
      await syncLegacySessionColumns(pool, row!.id, photos);
      res.json({ ok: true, ...mapSessionPublic(row!, photos) });
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
      res.json(await buildSessionResponse(pool, row));
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
        await migrateLegacySessionFiles(pool, row);
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
        if (!newId) throw new Error("Could not create session.");
        await copySessionPhotos(pool, row.id, newId);
        const { rows: newRow } = await pool.query<SessionRow>(
          `SELECT id, region_id, store_id, customer_label, watch_label,
                  watch_document_path, watch_image_path,
                  expires_at, revoked_at, used_at, quick_bill_id
           FROM quick_bill_capture_sessions WHERE id = $1::uuid`,
          [newId],
        );
        const payload = await buildSessionResponse(pool, newRow[0]!);
        res.json({
          sessionId: newId,
          token,
          captureUrl: `/service/quick-bill-capture?t=${encodeURIComponent(token)}`,
          ...payload,
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
      const photoKind = normalizeUploadKind(kindRaw);
      if (!photoKind) {
        res.status(400).json({ error: "kind is required (doc, img, or photo category)." });
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
        const { rows: deleted } = await pool.query<{ filePath: string }>(
          `DELETE FROM quick_bill_capture_photos
           WHERE session_id = $1::uuid AND photo_kind = $2
           RETURNING file_path AS "filePath"`,
          [sessionId, photoKind],
        );
        for (const d of deleted) await unlinkQuickBillFile(d.filePath);
        const photos = await loadSessionPhotos(pool, sessionId);
        await syncLegacySessionColumns(pool, sessionId, photos);
        res.json(await buildSessionResponse(pool, row));
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Could not remove attachment." });
      }
    },
  );
}

/** Mark capture session used, link bill, and copy document / primary image onto the bill if missing. */
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
  const { rows } = await pool.query<SessionRow>(
    `SELECT id, region_id, store_id, customer_label, watch_label,
            watch_document_path, watch_image_path,
            expires_at, revoked_at, used_at, quick_bill_id
     FROM quick_bill_capture_sessions WHERE id = $1::uuid`,
    [sessionId],
  );
  const row = rows[0];
  if (!row) return;
  await migrateLegacySessionFiles(pool, row);
  const photos = await loadSessionPhotos(pool, sessionId);
  const { documentPath, imagePath } = deriveLegacyPaths(photos);
  if (documentPath || imagePath) {
    await pool.query(
      `UPDATE quick_bills
       SET watch_document_path = COALESCE(NULLIF(TRIM(watch_document_path), ''), $2),
           watch_image_path = COALESCE(NULLIF(TRIM(watch_image_path), ''), $3)
       WHERE id = $1::uuid`,
      [quickBillId, documentPath, imagePath],
    );
  }
}
