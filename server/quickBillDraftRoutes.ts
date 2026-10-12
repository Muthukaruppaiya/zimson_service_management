import type { Express, NextFunction, Request, Response } from "express";
import type { Pool, PoolClient } from "pg";
import type { DemoUser } from "../src/types/user";
import { SRF_DOCUMENT_PHOTO_KIND } from "../src/lib/srfPhotoSlots";
import { actorCanAccessSession } from "./quickBillCaptureRoutes";

type Authed = Request & { userId: string };

type DraftRow = {
  id: string;
  regionId: string;
  storeId: string;
  createdBy: string | null;
  status: string;
  customerName: string;
  phone: string;
  watchLabel: string;
  captureSessionId: string | null;
  watchPhotoCount: number;
  createdAt: string;
  updatedAt: string;
  payload?: unknown;
};

const DRAFT_SELECT = `
  SELECT d.id::text AS id,
         d.region_id AS "regionId",
         d.store_id AS "storeId",
         d.created_by AS "createdBy",
         d.status,
         d.customer_name AS "customerName",
         d.phone,
         d.watch_label AS "watchLabel",
         d.capture_session_id::text AS "captureSessionId",
         COALESCE((
           SELECT COUNT(*)::int FROM quick_bill_capture_photos p
           WHERE p.session_id = d.capture_session_id AND p.photo_kind <> $1
         ), 0) AS "watchPhotoCount",
         d.created_at AS "createdAt",
         d.updated_at AS "updatedAt"`;

function readDraftBody(req: Request) {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const captureSessionId = String(b.captureSessionId ?? "").trim();
  const payload = b.payload && typeof b.payload === "object" ? b.payload : {};
  return {
    customerName: String(b.customerName ?? "").trim().slice(0, 200),
    phone: String(b.phone ?? "").trim().slice(0, 40),
    watchLabel: String(b.watchLabel ?? "").trim().slice(0, 300),
    captureSessionId: /^[0-9a-f-]{36}$/i.test(captureSessionId) ? captureSessionId : null,
    payload,
  };
}

async function loadDraft(pool: Pool, id: string): Promise<DraftRow | undefined> {
  const { rows } = await pool.query<DraftRow>(
    `${DRAFT_SELECT}, d.payload
     FROM quick_bill_drafts d WHERE d.id = $2::uuid`,
    [SRF_DOCUMENT_PHOTO_KIND, id],
  );
  return rows[0];
}

/** Mark an open draft as billed once its quick bill is saved (runs inside the bill transaction). */
export async function markQuickBillDraftBilled(
  client: Pool | PoolClient,
  draftId: string,
  quickBillId: string,
): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(draftId)) return;
  await client.query(
    `UPDATE quick_bill_drafts
     SET status = 'billed', quick_bill_id = $2::uuid, updated_at = now()
     WHERE id = $1::uuid AND status = 'open'`,
    [draftId, quickBillId],
  );
}

export function registerQuickBillDraftRoutes(
  app: Express,
  pool: Pool,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
  getUserById: (id: string) => DemoUser | null,
): void {
  app.get("/api/service/quick-bill-drafts", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    const storeFilter = String(req.query.storeId ?? "").trim();
    try {
      const { rows } = await pool.query<DraftRow>(
        `${DRAFT_SELECT}
         FROM quick_bill_drafts d
         WHERE d.status = 'open' AND ($2 = '' OR d.store_id = $2)
         ORDER BY d.updated_at DESC
         LIMIT 200`,
        [SRF_DOCUMENT_PHOTO_KIND, storeFilter],
      );
      res.json({ drafts: rows.filter((r) => actorCanAccessSession(actor, r.regionId, r.storeId)) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not load drafts." });
    }
  });

  app.get("/api/service/quick-bill-drafts/:id", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    try {
      const draft = await loadDraft(pool, String(req.params.id ?? "").trim());
      if (!draft) {
        res.status(404).json({ error: "Draft not found." });
        return;
      }
      if (!actorCanAccessSession(actor, draft.regionId, draft.storeId)) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
      res.json({ draft });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not load draft." });
    }
  });

  app.post("/api/service/quick-bill-drafts", requireAuth, async (req, res) => {
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
    const body = readDraftBody(req);
    try {
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO quick_bill_drafts (
           region_id, store_id, created_by, updated_by, customer_name, phone, watch_label,
           capture_session_id, payload
         ) VALUES ($1, $2, $3, $3, $4, $5, $6, $7::uuid, $8::jsonb)
         RETURNING id::text AS id`,
        [
          regionId,
          storeId,
          actor.id,
          body.customerName,
          body.phone,
          body.watchLabel,
          body.captureSessionId,
          JSON.stringify(body.payload),
        ],
      );
      const draft = await loadDraft(pool, rows[0]!.id);
      res.json({ draft });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Could not save draft." });
    }
  });

  app.put("/api/service/quick-bill-drafts/:id", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    const id = String(req.params.id ?? "").trim();
    try {
      const existing = await loadDraft(pool, id);
      if (!existing) {
        res.status(404).json({ error: "Draft not found." });
        return;
      }
      if (!actorCanAccessSession(actor, existing.regionId, existing.storeId)) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
      if (existing.status !== "open") {
        res.status(400).json({ error: "This draft has already been billed or cancelled." });
        return;
      }
      const body = readDraftBody(req);
      await pool.query(
        `UPDATE quick_bill_drafts
         SET customer_name = $2, phone = $3, watch_label = $4,
             capture_session_id = $5::uuid, payload = $6::jsonb,
             updated_by = $7, updated_at = now()
         WHERE id = $1::uuid`,
        [
          id,
          body.customerName,
          body.phone,
          body.watchLabel,
          body.captureSessionId,
          JSON.stringify(body.payload),
          actor.id,
        ],
      );
      res.json({ draft: await loadDraft(pool, id) });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Could not update draft." });
    }
  });

  app.patch("/api/service/quick-bill-drafts/:id/capture-session", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    const id = String(req.params.id ?? "").trim();
    const { captureSessionId } = readDraftBody(req);
    const payloadPatch =
      req.body?.captureSession && typeof req.body.captureSession === "object"
        ? { captureSession: req.body.captureSession }
        : {};
    try {
      const existing = await loadDraft(pool, id);
      if (!existing) {
        res.status(404).json({ error: "Draft not found." });
        return;
      }
      if (!actorCanAccessSession(actor, existing.regionId, existing.storeId)) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
      await pool.query(
        `UPDATE quick_bill_drafts
         SET capture_session_id = $2::uuid, payload = payload || $3::jsonb,
             updated_by = $4, updated_at = now()
         WHERE id = $1::uuid AND status = 'open'`,
        [id, captureSessionId, JSON.stringify(payloadPatch), actor.id],
      );
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Could not update draft." });
    }
  });

  app.delete("/api/service/quick-bill-drafts/:id", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    const id = String(req.params.id ?? "").trim();
    try {
      const existing = await loadDraft(pool, id);
      if (!existing) {
        res.status(404).json({ error: "Draft not found." });
        return;
      }
      if (!actorCanAccessSession(actor, existing.regionId, existing.storeId)) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
      await pool.query(
        `UPDATE quick_bill_drafts
         SET status = 'cancelled', updated_by = $2, updated_at = now()
         WHERE id = $1::uuid AND status = 'open'`,
        [id, actor.id],
      );
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not delete draft." });
    }
  });
}
