import type { Express, Request, Response } from "express";
import type { Pool } from "pg";

type CoreSeedPayload = {
  regions: Record<string, unknown>[];
  stores: Record<string, unknown>[];
  users: Record<string, unknown>[];
  userStoreAccess: { user_id: string; store_id: string }[];
};

function requireSeedSecret(req: Request): string | null {
  const fromHeader = String(req.headers["x-seed-sync-secret"] ?? "").trim();
  const fromBody = typeof req.body?.secret === "string" ? req.body.secret.trim() : "";
  const q = req.query?.secret;
  const fromQuery = typeof q === "string" ? q.trim() : Array.isArray(q) ? String(q[0] ?? "").trim() : "";
  const secret = fromHeader || fromBody || fromQuery;
  const expected = String(process.env.SEED_SYNC_SECRET ?? "").trim();
  if (!expected || secret !== expected) return null;
  return secret;
}

/** Columns we round-trip (matches typical migrated schema). */
const REGION_COLS = [
  "id",
  "name",
  "created_at",
  "region_code",
  "address",
  "gst",
  "pan",
  "email",
  "phone",
  "address_json",
] as const;

const STORE_COLS = [
  "id",
  "region_id",
  "name",
  "created_at",
  "invoice_display_name",
  "invoice_tagline",
  "invoice_address",
  "invoice_phone",
  "invoice_email",
  "invoice_gstin",
  "invoice_legal_entity_name",
  "invoice_terms",
  "invoice_number_store_code",
] as const;

const USER_COLS = [
  "id",
  "employee_code",
  "email",
  "password_hash",
  "plain_password",
  "display_name",
  "role",
  "region_id",
  "store_id",
  "technician_profile_id",
  "can_login",
  "module_access_override",
  "is_seed",
  "created_at",
  "updated_at",
] as const;

function pickRow<T extends readonly string[]>(row: Record<string, unknown>, cols: T): unknown[] {
  return cols.map((c) => {
    const v = row[c];
    if (v === undefined) return null;
    return v;
  });
}

export function registerCoreSeedSyncRoutes(
  app: Express,
  pool: Pool,
  opts: { refreshUsersFromDb: () => Promise<void> },
): void {
  /** Read core tables from this server's DB (call from local dev only). */
  app.get("/api/dev/core-seed-export", async (req: Request, res: Response) => {
    if (!requireSeedSecret(req)) {
      res.status(404).json({ error: "Not found." });
      return;
    }
    try {
      const [rRes, sRes, uRes, aRes] = await Promise.all([
        pool.query(`SELECT ${REGION_COLS.join(", ")} FROM regions ORDER BY id`),
        pool.query(`SELECT ${STORE_COLS.join(", ")} FROM stores ORDER BY id`),
        pool.query(`SELECT ${USER_COLS.join(", ")} FROM app_users ORDER BY id`),
        pool.query(`SELECT user_id, store_id FROM user_store_access ORDER BY user_id, store_id`),
      ]);
      const payload: CoreSeedPayload = {
        regions: rRes.rows as Record<string, unknown>[],
        stores: sRes.rows as Record<string, unknown>[],
        users: uRes.rows as Record<string, unknown>[],
        userStoreAccess: aRes.rows as { user_id: string; store_id: string }[],
      };
      res.json(payload);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not export core seed." });
    }
  });

  /** Replace core tables on this server (called from local push or manually). */
  app.post("/api/dev/core-seed-import", async (req: Request, res: Response) => {
    if (!requireSeedSecret(req)) {
      res.status(404).json({ error: "Not found." });
      return;
    }
    const body = req.body as Partial<CoreSeedPayload>;
    if (!Array.isArray(body.regions) || !Array.isArray(body.stores) || !Array.isArray(body.users)) {
      res.status(400).json({ error: "Body must include regions, stores, and users arrays." });
      return;
    }
    const userStoreAccess = Array.isArray(body.userStoreAccess) ? body.userStoreAccess : [];

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("TRUNCATE TABLE app_users, stores, regions RESTART IDENTITY CASCADE");

      for (const row of body.regions) {
        const vals = pickRow(row as Record<string, unknown>, REGION_COLS);
        await client.query(
          `INSERT INTO regions (${REGION_COLS.join(", ")})
           VALUES (${REGION_COLS.map((_, i) => `$${i + 1}`).join(", ")})`,
          vals,
        );
      }
      for (const row of body.stores) {
        const vals = pickRow(row as Record<string, unknown>, STORE_COLS);
        await client.query(
          `INSERT INTO stores (${STORE_COLS.join(", ")})
           VALUES (${STORE_COLS.map((_, i) => `$${i + 1}`).join(", ")})`,
          vals,
        );
      }
      for (const row of body.users) {
        const vals = pickRow(row as Record<string, unknown>, USER_COLS);
        await client.query(
          `INSERT INTO app_users (${USER_COLS.join(", ")})
           VALUES (${USER_COLS.map((_, i) => `$${i + 1}`).join(", ")})`,
          vals,
        );
      }
      for (const link of userStoreAccess) {
        if (!link?.user_id || !link?.store_id) continue;
        await client.query(
          `INSERT INTO user_store_access (user_id, store_id) VALUES ($1, $2) ON CONFLICT (user_id, store_id) DO NOTHING`,
          [link.user_id, link.store_id],
        );
      }

      await client.query("COMMIT");
      await opts.refreshUsersFromDb();
      res.json({
        ok: true,
        counts: {
          regions: body.regions.length,
          stores: body.stores.length,
          users: body.users.length,
          userStoreAccess: userStoreAccess.length,
        },
      });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(e);
      res.status(500).json({ error: "Import failed. Check server logs." });
    } finally {
      client.release();
    }
  });

  /**
   * Local dev: read this DB and POST the payload to a remote API (no browser CORS).
   * Body: { secret, targetBaseUrl } e.g. targetBaseUrl = "http://20.244.46.64:4000"
   */
  app.post("/api/dev/push-core-seed", async (req: Request, res: Response) => {
    if (!requireSeedSecret(req)) {
      res.status(404).json({ error: "Not found." });
      return;
    }
    const targetBaseUrl = String(req.body?.targetBaseUrl ?? "").trim().replace(/\/$/, "");
    if (!targetBaseUrl.startsWith("http://") && !targetBaseUrl.startsWith("https://")) {
      res.status(400).json({ error: "targetBaseUrl must be http(s)://host:port (no trailing slash)." });
      return;
    }
    const secret = String(process.env.SEED_SYNC_SECRET ?? "").trim();

    try {
      const [rRes, sRes, uRes, aRes] = await Promise.all([
        pool.query(`SELECT ${REGION_COLS.join(", ")} FROM regions ORDER BY id`),
        pool.query(`SELECT ${STORE_COLS.join(", ")} FROM stores ORDER BY id`),
        pool.query(`SELECT ${USER_COLS.join(", ")} FROM app_users ORDER BY id`),
        pool.query(`SELECT user_id, store_id FROM user_store_access ORDER BY user_id, store_id`),
      ]);
      const payload: CoreSeedPayload = {
        regions: rRes.rows as Record<string, unknown>[],
        stores: sRes.rows as Record<string, unknown>[],
        users: uRes.rows as Record<string, unknown>[],
        userStoreAccess: aRes.rows as { user_id: string; store_id: string }[],
      };

      const importUrl = `${targetBaseUrl}/api/dev/core-seed-import`;
      const remote = await fetch(importUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Seed-Sync-Secret": secret,
        },
        body: JSON.stringify(payload),
      });
      const text = await remote.text();
      let json: unknown;
      try {
        json = JSON.parse(text) as unknown;
      } catch {
        json = { raw: text };
      }
      if (!remote.ok) {
        res.status(remote.status).json({
          error: "Remote import failed.",
          remoteStatus: remote.status,
          remoteBody: json,
        });
        return;
      }
      res.json({ ok: true, exported: payload, remote: json });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e instanceof Error ? e.message : "Push failed." });
    }
  });
}
