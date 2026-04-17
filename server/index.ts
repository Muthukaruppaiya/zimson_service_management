import "dotenv/config";
import cors from "cors";
import express from "express";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { registerCatalogRoutes } from "./catalogRoutes";
import { registerInventoryPoSupplierRoutes } from "./inventoryPoSupplierRoutes";
import { runMigrations } from "./db/migrate";
import { createPool } from "./db/pool";
import { SEED_USERS, type SeedRegion } from "../src/data/seed";
import { createId } from "../src/lib/id";
import type { CustomerKind, CustomerRecord } from "../src/types/customer";
import type { DemoUser, SessionUser, UserRole } from "../src/types/user";
import type { SrfJob } from "../src/types/srfJob";
import { readState, stripPassword, writeState, type AppState } from "./persist";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT) || 4000;
const COOKIE = "zimson_session";
const dbPool = createPool();

const sessions = new Map<string, string>();

let queue = Promise.resolve();
function mutate<T>(fn: (s: AppState) => { next: AppState; result: T }): Promise<T> {
  const p = queue.then(() => {
    const s = readState();
    const { next, result } = fn(s);
    writeState(next);
    return result;
  });
  queue = p.then(() => undefined).catch(() => undefined);
  return p;
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function allUsers(state: AppState): DemoUser[] {
  return [...SEED_USERS, ...state.extraUsers];
}

function findUser(state: AppState, id: string): DemoUser | undefined {
  return allUsers(state).find((u) => u.id === id);
}

function normalizeJob(raw: SrfJob): SrfJob {
  return {
    ...raw,
    destinationStoreId: raw.destinationStoreId ?? null,
    outwardDcNumber: raw.outwardDcNumber ?? null,
    readyForOutwardAt: raw.readyForOutwardAt ?? null,
  };
}

function getSessionUserId(req: express.Request): string | null {
  const sid = parseCookies(req.headers.cookie)[COOKIE];
  if (!sid) return null;
  return sessions.get(sid) ?? null;
}

function requireAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  const uid = getSessionUserId(req);
  if (!uid) {
    res.status(401).json({ error: "Not signed in." });
    return;
  }
  (req as express.Request & { userId: string }).userId = uid;
  next();
}

const app = express();
app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json({ limit: "5mb" }));

app.post("/api/auth/login", (req, res) => {
  const email = String(req.body?.email ?? "")
    .trim()
    .toLowerCase();
  const password = String(req.body?.password ?? "");
  const state = readState();
  const found = allUsers(state).find(
    (u) => u.email.toLowerCase() === email && u.password === password,
  );
  if (!found) {
    res.status(401).json({ ok: false, message: "Invalid email or password." });
    return;
  }
  const sid = createId("sid");
  sessions.set(sid, found.id);
  res.cookie(COOKIE, sid, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.json({ ok: true, user: stripPassword(found) });
});

app.post("/api/auth/logout", (req, res) => {
  const sid = parseCookies(req.headers.cookie)[COOKIE];
  if (sid) sessions.delete(sid);
  res.clearCookie(COOKIE, { path: "/" });
  res.json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  const uid = getSessionUserId(req);
  if (!uid) {
    res.json({ user: null });
    return;
  }
  const state = readState();
  const u = findUser(state, uid);
  res.json({ user: u ? stripPassword(u) : null });
});

app.get("/api/users", requireAuth, (req, res) => {
  const uid = (req as express.Request & { userId: string }).userId;
  const state = readState();
  const actor = findUser(state, uid);
  if (!actor) {
    res.status(401).json({ error: "Invalid session." });
    return;
  }
  let list = allUsers(state).map(stripPassword);
  if (actor.role === "regional_admin") {
    list = list.filter((u) => u.regionId === actor.regionId);
  } else if (actor.role !== "super_admin") {
    res.status(403).json({ error: "Forbidden." });
    return;
  }
  res.json({ users: list });
});

app.post("/api/users", requireAuth, async (req, res) => {
  const uid = (req as express.Request & { userId: string }).userId;
  const state = readState();
  const actor = findUser(state, uid);
  if (!actor) {
    res.status(401).json({ error: "Invalid session." });
    return;
  }

  const input = req.body as {
    email: string;
    displayName: string;
    password: string;
    role: "regional_admin" | "store_user";
    regionId: string;
    storeId: string | null;
  };
  const email = input.email.trim().toLowerCase();
  if (!email) {
    res.status(400).json({ ok: false, message: "Email is required." });
    return;
  }
  if (!input.displayName.trim()) {
    res.status(400).json({ ok: false, message: "Display name is required." });
    return;
  }
  if (input.password.length < 4) {
    res.status(400).json({ ok: false, message: "Password must be at least 4 characters." });
    return;
  }
  if (allUsers(state).some((u) => u.email.toLowerCase() === email)) {
    res.status(400).json({ ok: false, message: "An account with this email already exists." });
    return;
  }

  if (actor.role === "super_admin") {
    if (input.role !== "regional_admin" && input.role !== "store_user") {
      res.status(400).json({ ok: false, message: "Invalid role for this action." });
      return;
    }
  } else if (actor.role === "regional_admin") {
    if (input.role !== "store_user") {
      res.status(400).json({ ok: false, message: "Regional admins can only create store users." });
      return;
    }
    if (input.regionId !== actor.regionId) {
      res.status(400).json({ ok: false, message: "You can only add users in your region." });
      return;
    }
  } else {
    res.status(403).json({ ok: false, message: "You do not have permission to create users." });
    return;
  }

  if (input.role === "store_user" && !input.storeId) {
    res.status(400).json({ ok: false, message: "Store is required for store users." });
    return;
  }

  const newUser: DemoUser = {
    id: createId("user"),
    email,
    password: input.password,
    displayName: input.displayName.trim(),
    role: input.role as UserRole,
    regionId: input.regionId,
    storeId: input.role === "store_user" ? input.storeId : null,
    technicianProfileId: null,
    createdAt: new Date().toISOString(),
  };

  await mutate((s) => ({
    next: { ...s, extraUsers: [...s.extraUsers, newUser] },
    result: undefined,
  }));
  res.json({ ok: true });
});

app.get("/api/regions", requireAuth, (_req, res) => {
  if (!dbPool) {
    const state = readState();
    res.json({ regions: state.regions ?? [] });
    return;
  }
  void (async () => {
    try {
      const { rows } = await dbPool.query<{
        region_id: string;
        region_name: string;
        store_id: string | null;
        store_name: string | null;
      }>(
        `SELECT r.id AS region_id, r.name AS region_name, s.id AS store_id, s.name AS store_name
         FROM regions r
         LEFT JOIN stores s ON s.region_id = r.id
         ORDER BY r.name, s.name`,
      );
      const map = new Map<string, SeedRegion>();
      for (const row of rows) {
        if (!map.has(row.region_id)) {
          map.set(row.region_id, { id: row.region_id, name: row.region_name, stores: [] });
        }
        if (row.store_id && row.store_name) {
          map.get(row.region_id)!.stores.push({ id: row.store_id, name: row.store_name });
        }
      }
      res.json({ regions: [...map.values()] });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to load regions." });
    }
  })();
});

app.put("/api/regions", requireAuth, async (req, res) => {
  const body = req.body as { regions?: SeedRegion[] };
  if (!Array.isArray(body.regions)) {
    res.status(400).json({ error: "regions array required" });
    return;
  }
  if (!dbPool) {
    await mutate((s) => ({
      next: { ...s, regions: body.regions as SeedRegion[] },
      result: undefined,
    }));
    res.json({ ok: true });
    return;
  }

  const client = await dbPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM stores");
    await client.query("DELETE FROM regions");
    for (const region of body.regions) {
      await client.query("INSERT INTO regions (id, name) VALUES ($1, $2)", [region.id, region.name]);
      for (const store of region.stores) {
        await client.query(
          "INSERT INTO stores (id, region_id, name) VALUES ($1, $2, $3)",
          [store.id, region.id, store.name],
        );
      }
    }
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(e);
    res.status(500).json({ error: "Could not save regions." });
  } finally {
    client.release();
  }
});

app.post("/api/regions", requireAuth, async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  if (!name) {
    res.status(400).json({ error: "Region name is required." });
    return;
  }
  if (!dbPool) {
    const row: SeedRegion = { id: createId("region"), name, stores: [] };
    await mutate((s) => ({
      next: { ...s, regions: [...(s.regions ?? []), row] },
      result: undefined,
    }));
    res.json({ region: row });
    return;
  }
  try {
    const id = createId("region");
    await dbPool.query("INSERT INTO regions (id, name) VALUES ($1, $2)", [id, name]);
    res.json({ region: { id, name, stores: [] } satisfies SeedRegion });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not create region." });
  }
});

app.post("/api/regions/:regionId/stores", requireAuth, async (req, res) => {
  const regionId = req.params.regionId;
  const name = String(req.body?.name ?? "").trim();
  if (!name) {
    res.status(400).json({ error: "Store name is required." });
    return;
  }
  if (!dbPool) {
    const store = { id: createId("store"), name };
    await mutate((s) => ({
      next: {
        ...s,
        regions: (s.regions ?? []).map((r) =>
          r.id === regionId ? { ...r, stores: [...r.stores, store] } : r,
        ),
      },
      result: undefined,
    }));
    res.json({ store });
    return;
  }
  try {
    const id = createId("store");
    const ins = await dbPool.query(
      "INSERT INTO stores (id, region_id, name) VALUES ($1, $2, $3) RETURNING id, name",
      [id, regionId, name],
    );
    res.json({ store: ins.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not create store." });
  }
});

app.get("/api/inventory/prs", requireAuth, async (req, res) => {
  if (!dbPool) {
    res.status(503).json({ error: "Database is required for PR module." });
    return;
  }
  const uid = (req as express.Request & { userId: string }).userId;
  const state = readState();
  const actor = findUser(state, uid);
  if (!actor) {
    res.status(401).json({ error: "Invalid session." });
    return;
  }
  if (!actor.regionId && actor.role !== "super_admin") {
    res.status(400).json({ error: "User region not configured." });
    return;
  }
  if (actor.role !== "store_user" && actor.role !== "regional_admin" && actor.role !== "super_admin") {
    res.status(403).json({ error: "Forbidden." });
    return;
  }
  try {
    const params: unknown[] = [];
    let where = "";
    if (actor.role === "store_user") {
      params.push(actor.storeId);
      where = "WHERE pr.store_id = $1::text";
    } else if (actor.role === "regional_admin") {
      params.push(actor.regionId);
      where = "WHERE pr.region_id = $1::text";
    }
    const { rows } = await dbPool.query(
      `SELECT pr.id,
              pr.pr_number AS "prNumber",
              pr.region_id AS "regionId",
              pr.store_id AS "storeId",
              pr.status,
              pr.needed_by AS "neededBy",
              pr.notes,
              pr.created_by AS "createdBy",
              pr.created_at AS "createdAt",
              pr.updated_at AS "updatedAt",
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', pri.id,
                    'spareId', pri.spare_id,
                    'qty', pri.qty::float8,
                    'issuedQty', pri.issued_qty::float8,
                    'reason', pri.reason
                  )
                ) FILTER (WHERE pri.id IS NOT NULL),
                '[]'::json
              ) AS items
       FROM purchase_requests pr
       LEFT JOIN purchase_request_items pri ON pri.pr_id = pr.id
       ${where}
       GROUP BY pr.id
       ORDER BY pr.created_at DESC`,
      params,
    );
    res.json({ prs: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load PRs." });
  }
});

app.post("/api/inventory/prs", requireAuth, async (req, res) => {
  if (!dbPool) {
    res.status(503).json({ error: "Database is required for PR module." });
    return;
  }
  const uid = (req as express.Request & { userId: string }).userId;
  const state = readState();
  const actor = findUser(state, uid);
  if (!actor) {
    res.status(401).json({ error: "Invalid session." });
    return;
  }
  if (actor.role !== "store_user" || !actor.regionId || !actor.storeId) {
    res.status(403).json({ error: "Only store users can create PRs." });
    return;
  }

  const body = req.body as {
    status?: "DRAFT" | "SUBMITTED";
    neededBy?: string | null;
    notes?: string;
    items?: Array<{ spareId: string; qty: number; reason?: string }>;
  };
  const status = body.status === "DRAFT" ? "DRAFT" : "SUBMITTED";
  const neededBy = body.neededBy?.trim() || null;
  const notes = String(body.notes ?? "").trim();
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    res.status(400).json({ error: "At least one PR line is required." });
    return;
  }
  if (items.some((i) => !i.spareId || Number.isNaN(Number(i.qty)) || Number(i.qty) <= 0)) {
    res.status(400).json({ error: "Each PR line needs valid spare and qty > 0." });
    return;
  }

  const client = await dbPool.connect();
  try {
    await client.query("BEGIN");
    const prNumber = createId("pr").toUpperCase();
    const ins = await client.query<{ id: string; prNumber: string }>(
      `INSERT INTO purchase_requests (pr_number, region_id, store_id, status, needed_by, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, pr_number AS "prNumber"`,
      [prNumber, actor.regionId, actor.storeId, status, neededBy, notes, actor.id],
    );
    const prId = ins.rows[0]!.id;
    for (const item of items) {
      await client.query(
        `INSERT INTO purchase_request_items (pr_id, spare_id, qty, reason)
         VALUES ($1::uuid, $2::uuid, $3, $4)`,
        [prId, item.spareId, Number(item.qty), String(item.reason ?? "").trim()],
      );
    }
    await client.query("COMMIT");
    res.json({ ok: true, id: prId, prNumber: ins.rows[0]!.prNumber });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(e);
    res.status(400).json({ error: "Could not create PR." });
  } finally {
    client.release();
  }
});

app.patch("/api/inventory/prs/:prId/status", requireAuth, async (req, res) => {
  if (!dbPool) {
    res.status(503).json({ error: "Database is required for PR module." });
    return;
  }
  const uid = (req as express.Request & { userId: string }).userId;
  const state = readState();
  const actor = findUser(state, uid);
  if (!actor) {
    res.status(401).json({ error: "Invalid session." });
    return;
  }
  const prId = req.params.prId;
  const status = String(req.body?.status ?? "").toUpperCase();
  const allowed = new Set(["SUBMITTED", "APPROVED", "REJECTED", "PARTIAL", "FULFILLED"]);
  if (!allowed.has(status)) {
    res.status(400).json({ error: "Invalid status." });
    return;
  }
  try {
    if (actor.role === "store_user") {
      if (status !== "SUBMITTED") {
        res.status(403).json({ error: "Store can only submit PR." });
        return;
      }
      const upd = await dbPool.query(
        `UPDATE purchase_requests
         SET status = 'SUBMITTED', updated_at = now()
         WHERE id = $1::uuid AND store_id = $2::text AND status = 'DRAFT'`,
        [prId, actor.storeId],
      );
      if (upd.rowCount === 0) {
        res.status(400).json({ error: "PR not found or not in draft." });
        return;
      }
      res.json({ ok: true });
      return;
    }
    if (actor.role !== "regional_admin" && actor.role !== "super_admin") {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
    const params: unknown[] = [status, prId];
    let where = "id = $2::uuid";
    if (actor.role === "regional_admin") {
      params.push(actor.regionId);
      where += " AND region_id = $3::text";
    }
    const upd = await dbPool.query(
      `UPDATE purchase_requests
       SET status = $1, updated_at = now()
       WHERE ${where}`,
      params,
    );
    if (upd.rowCount === 0) {
      res.status(404).json({ error: "PR not found." });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: "Could not update PR status." });
  }
});

app.post("/api/inventory/prs/:prId/fulfill", requireAuth, async (req, res) => {
  if (!dbPool) {
    res.status(503).json({ error: "Database is required for PR module." });
    return;
  }
  const uid = (req as express.Request & { userId: string }).userId;
  const state = readState();
  const actor = findUser(state, uid);
  if (!actor) {
    res.status(401).json({ error: "Invalid session." });
    return;
  }
  if (actor.role !== "regional_admin" && actor.role !== "super_admin") {
    res.status(403).json({ error: "Only HO admins can fulfill PR." });
    return;
  }
  const prId = req.params.prId;
  const client = await dbPool.connect();
  try {
    await client.query("BEGIN");
    const prRes = await client.query<{
      id: string;
      region_id: string;
      store_id: string;
      status: string;
    }>(
      `SELECT id, region_id, store_id, status
       FROM purchase_requests
       WHERE id = $1::uuid
       FOR UPDATE`,
      [prId],
    );
    const pr = prRes.rows[0];
    if (!pr) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "PR not found." });
      return;
    }
    if (actor.role === "regional_admin" && actor.regionId !== pr.region_id) {
      await client.query("ROLLBACK");
      res.status(403).json({ error: "You can fulfill only your region PR." });
      return;
    }
    if (pr.status === "REJECTED" || pr.status === "FULFILLED") {
      await client.query("ROLLBACK");
      res.status(400).json({ error: `Cannot fulfill PR in ${pr.status} status.` });
      return;
    }

    const itemsRes = await client.query<{
      id: string;
      spare_id: string;
      qty: number;
      issued_qty: number;
    }>(
      `SELECT id, spare_id, qty::float8, issued_qty::float8
       FROM purchase_request_items
       WHERE pr_id = $1::uuid
       FOR UPDATE`,
      [prId],
    );
    let movedTotal = 0;
    for (const item of itemsRes.rows) {
      const remaining = Math.max(0, item.qty - item.issued_qty);
      if (remaining <= 0) continue;
      const hoStock = await client.query<{ qty: number }>(
        `SELECT quantity::float8 AS qty
         FROM spare_stock
         WHERE spare_id = $1::uuid AND location_key = $2`,
        [item.spare_id, `HO:${pr.region_id}`],
      );
      const available = hoStock.rows[0]?.qty ?? 0;
      const issueQty = Math.min(remaining, Math.max(0, available));
      if (issueQty <= 0) continue;

      await client.query(
        `INSERT INTO spare_stock (spare_id, location_key, location_type, region_id, store_id, quantity)
         VALUES ($1::uuid, $2, 'STORE', $3, $4, $5)
         ON CONFLICT (spare_id, location_key)
         DO UPDATE SET quantity = spare_stock.quantity + EXCLUDED.quantity, updated_at = now()`,
        [item.spare_id, `STORE:${pr.region_id}:${pr.store_id}`, pr.region_id, pr.store_id, issueQty],
      );
      await client.query(
        `UPDATE spare_stock
         SET quantity = GREATEST(quantity - $1, 0), updated_at = now()
         WHERE spare_id = $2::uuid AND location_key = $3`,
        [issueQty, item.spare_id, `HO:${pr.region_id}`],
      );
      await client.query(
        `UPDATE purchase_request_items
         SET issued_qty = issued_qty + $1
         WHERE id = $2::uuid`,
        [issueQty, item.id],
      );
      movedTotal += issueQty;
    }

    if (movedTotal <= 0) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "No stock moved. Check HO availability." });
      return;
    }

    const sum = await client.query<{ req: number; iss: number }>(
      `SELECT COALESCE(SUM(qty), 0)::float8 AS req,
              COALESCE(SUM(issued_qty), 0)::float8 AS iss
       FROM purchase_request_items
       WHERE pr_id = $1::uuid`,
      [prId],
    );
    const req = sum.rows[0]?.req ?? 0;
    const iss = sum.rows[0]?.iss ?? 0;
    const nextStatus = iss >= req ? "FULFILLED" : "PARTIAL";
    await client.query(
      `UPDATE purchase_requests
       SET status = $1, updated_at = now()
       WHERE id = $2::uuid`,
      [nextStatus, prId],
    );
    await client.query("COMMIT");
    res.json({ ok: true, movedQty: movedTotal, status: nextStatus });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(e);
    res.status(400).json({ error: "Could not fulfill PR." });
  } finally {
    client.release();
  }
});

app.get("/api/inventory/stock-price-overview", requireAuth, async (req, res) => {
  if (!dbPool) {
    res.status(503).json({ error: "Database is required." });
    return;
  }
  const uid = (req as express.Request & { userId: string }).userId;
  const state = readState();
  const actor = findUser(state, uid);
  if (!actor) {
    res.status(401).json({ error: "Invalid session." });
    return;
  }
  if (
    actor.role !== "super_admin" &&
    actor.role !== "regional_admin" &&
    actor.role !== "store_user"
  ) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  const qSearch = String(req.query.q ?? "").trim();
  const qRegion = String(req.query.regionId ?? "").trim();

  try {
    const spareParams: unknown[] = [];
    let spareWhere = "WHERE 1=1";
    if (qSearch) {
      spareParams.push(`%${qSearch}%`, `%${qSearch}%`);
      spareWhere += " AND (sku ILIKE $1 OR name ILIKE $2)";
    }
    spareParams.push(500);
    const spareLimitIdx = spareParams.length;
    const { rows: spareRows } = await dbPool.query<{
      id: string;
      sku: string;
      name: string;
      description: string;
      category: string;
      hsn: string | null;
      is_active: boolean;
      created_at: Date;
    }>(
      `SELECT id, sku, name, description, category, hsn, is_active, created_at
       FROM spares
       ${spareWhere}
       ORDER BY sku ASC
       LIMIT $${spareLimitIdx}`,
      spareParams,
    );

    if (spareRows.length === 0) {
      res.json({ rows: [] });
      return;
    }

    const spareIds = spareRows.map((r) => r.id);

    let stockWhere = "spare_id = ANY($1::uuid[])";
    const stockParams: unknown[] = [spareIds];
    if (actor.role === "regional_admin" && actor.regionId) {
      stockParams.push(actor.regionId);
      stockWhere += ` AND region_id = $${stockParams.length}::text`;
    } else if (actor.role === "store_user" && actor.regionId && actor.storeId) {
      stockParams.push(actor.regionId, actor.storeId);
      stockWhere += ` AND (
        (location_type = 'STORE' AND region_id = $${stockParams.length - 1}::text AND store_id = $${stockParams.length}::text)
        OR (location_type = 'HO' AND region_id = $${stockParams.length - 1}::text)
      )`;
    } else if (actor.role === "super_admin" && qRegion) {
      stockParams.push(qRegion);
      stockWhere += ` AND region_id = $${stockParams.length}::text`;
    }

    const { rows: stockRows } = await dbPool.query<{
      id: string;
      spareId: string;
      locationType: string;
      regionId: string;
      storeId: string | null;
      quantity: number;
      updatedAt: Date;
    }>(
      `SELECT id,
              spare_id AS "spareId",
              location_type AS "locationType",
              region_id AS "regionId",
              store_id AS "storeId",
              quantity::float8 AS quantity,
              updated_at AS "updatedAt"
       FROM spare_stock
       WHERE ${stockWhere}
       ORDER BY location_type, region_id, store_id`,
      stockParams,
    );

    let priceWhere = "spare_id = ANY($1::uuid[])";
    const priceParams: unknown[] = [spareIds];
    if (actor.role === "regional_admin" && actor.regionId) {
      priceParams.push(actor.regionId);
      priceWhere += ` AND (region_id = $${priceParams.length}::text OR region_id IS NULL)`;
    } else if (actor.role === "store_user" && actor.regionId) {
      priceParams.push(actor.regionId);
      priceWhere += ` AND (region_id = $${priceParams.length}::text OR region_id IS NULL)`;
    } else if (actor.role === "super_admin" && qRegion) {
      priceParams.push(qRegion);
      priceWhere += ` AND (region_id = $${priceParams.length}::text OR region_id IS NULL)`;
    }

    const { rows: priceRows } = await dbPool.query<{
      id: string;
      spareId: string;
      regionId: string | null;
      brand: string;
      price: number;
      createdAt: Date;
    }>(
      `SELECT id,
              spare_id AS "spareId",
              region_id AS "regionId",
              brand,
              price::float8 AS price,
              created_at AS "createdAt"
       FROM spare_prices
       WHERE ${priceWhere}
       ORDER BY region_id NULLS LAST, brand`,
      priceParams,
    );

    const stockBySpare = new Map<string, typeof stockRows>();
    const priceBySpare = new Map<string, typeof priceRows>();
    for (const s of stockRows) {
      const list = stockBySpare.get(s.spareId) ?? [];
      list.push(s);
      stockBySpare.set(s.spareId, list);
    }
    for (const p of priceRows) {
      const list = priceBySpare.get(p.spareId) ?? [];
      list.push(p);
      priceBySpare.set(p.spareId, list);
    }

    const rows = spareRows.map((r) => {
      const createdAt =
        r.created_at instanceof Date ? r.created_at.toISOString() : new Date(r.created_at).toISOString();
      return {
        spare: {
          id: r.id,
          sku: r.sku,
          name: r.name,
          description: r.description,
          category: r.category,
          hsn: r.hsn,
          isActive: r.is_active,
          createdAt,
        },
        stock: (stockBySpare.get(r.id) ?? []).map((s) => ({
          id: s.id,
          spareId: s.spareId,
          locationType: s.locationType as "HO" | "STORE",
          regionId: s.regionId,
          storeId: s.storeId,
          quantity: s.quantity,
          updatedAt:
            s.updatedAt instanceof Date ? s.updatedAt.toISOString() : new Date(s.updatedAt).toISOString(),
        })),
        prices: (priceBySpare.get(r.id) ?? []).map((p) => ({
          id: p.id,
          spareId: p.spareId,
          regionId: p.regionId,
          brand: p.brand,
          price: p.price,
          createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : new Date(p.createdAt).toISOString(),
        })),
      };
    });

    res.json({ rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load stock & price overview." });
  }
});

app.get("/api/customers", requireAuth, (_req, res) => {
  const state = readState();
  res.json({ customers: [...state.customersExtra] });
});

app.post("/api/customers", requireAuth, async (req, res) => {
  const body = req.body as {
    displayName: string;
    phone: string;
    email: string;
    customerKind: CustomerKind;
    company?: string;
    gst?: string;
    pan?: string;
  };
  const row: CustomerRecord = {
    id: createId("cust"),
    displayName: body.displayName.trim(),
    phone: body.phone.trim(),
    email: body.email.trim(),
    customerKind: body.customerKind,
    company: body.company?.trim() || undefined,
    gst: body.gst?.trim().toUpperCase() || undefined,
    pan: body.pan?.trim().toUpperCase() || undefined,
    createdAt: new Date().toISOString(),
  };
  await mutate((s) => ({
    next: { ...s, customersExtra: [...s.customersExtra, row] },
    result: undefined,
  }));
  res.json({ customer: row });
});

app.get("/api/srf-jobs", requireAuth, (_req, res) => {
  const state = readState();
  const jobs = (state.srfJobs ?? []).map(normalizeJob);
  res.json({ jobs });
});

app.put("/api/srf-jobs", requireAuth, async (req, res) => {
  const body = req.body as { jobs?: SrfJob[] };
  if (!Array.isArray(body.jobs)) {
    res.status(400).json({ error: "jobs array required" });
    return;
  }
  const jobs = body.jobs.map(normalizeJob);
  await mutate((s) => ({
    next: { ...s, srfJobs: jobs },
    result: undefined,
  }));
  res.json({ ok: true });
});

/** Static SPA when dist exists (production). */
if (process.env.NODE_ENV === "production") {
  const dist = join(__dirname, "..", "dist");
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(join(dist, "index.html"));
    });
  }
}

async function main() {
  if (!dbPool) {
    console.error("Missing database configuration: set DATABASE_URL or PGHOST/PGDATABASE/PGUSER/PGPASSWORD.");
    process.exit(1);
  }
  try {
    await runMigrations(dbPool);
  } catch (e) {
    console.error("PostgreSQL migration failed:", e);
    process.exit(1);
  }
  registerCatalogRoutes(app, dbPool, requireAuth, (id) => {
    const s = readState();
    return findUser(s, id) ?? null;
  });
  registerInventoryPoSupplierRoutes(app, dbPool, requireAuth, (id) => findUser(readState(), id));

  app.listen(PORT, () => {
    console.log(`Zimson API listening on http://127.0.0.1:${PORT}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
