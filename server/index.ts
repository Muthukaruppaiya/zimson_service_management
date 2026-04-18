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
import { appendStockHistory } from "./db/stockHistory";
import { SEED_USERS, type SeedRegion } from "../src/data/seed";
import { createId } from "../src/lib/id";
import type { CustomerKind, CustomerRecord } from "../src/types/customer";
import type { AppNotification } from "../src/types/notification";
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

async function pushNotifications(
  userIds: string[],
  payload: Pick<AppNotification, "title" | "message" | "category">,
): Promise<void> {
  if (userIds.length === 0) return;
  const uniq = Array.from(new Set(userIds));
  const now = new Date().toISOString();
  await mutate((s) => {
    const added: AppNotification[] = uniq.map((uid) => ({
      id: createId("ntf"),
      userId: uid,
      title: payload.title,
      message: payload.message,
      category: payload.category,
      isRead: false,
      createdAt: now,
    }));
    const maxKeep = 1000;
    const nextNotifications = [...added, ...s.notifications].slice(0, maxKeep);
    return { next: { ...s, notifications: nextNotifications }, result: undefined };
  });
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

function makeAlphaNumCode(input: string, fallback: string): string {
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (cleaned.slice(0, 3) || fallback).padEnd(3, "X");
}

async function nextDocNumber(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<{ last_value: number }> }> },
  prefix: "PR" | "PO" | "GRN",
  scopeCode: string,
): Promise<string> {
  const yy = String(new Date().getFullYear()).slice(-2);
  const seq = await client.query(
    `INSERT INTO number_sequences (prefix, scope_code, year_2, last_value)
     VALUES ($1, $2, $3, 1001)
     ON CONFLICT (prefix, scope_code, year_2)
     DO UPDATE SET last_value = number_sequences.last_value + 1
     RETURNING last_value`,
    [prefix, scopeCode, yy],
  );
  const num = String(seq.rows[0]!.last_value).padStart(4, "0");
  return `${prefix}${yy}${scopeCode}${num}`;
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
      where = "WHERE pr.region_id = $1::text AND pr.status <> 'DRAFT'";
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
                    'receivedQty', pri.received_qty::float8,
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
    const storeRes = await client.query<{ name: string }>("SELECT name FROM stores WHERE id = $1::text", [actor.storeId]);
    const storeName = storeRes.rows[0]?.name ?? actor.storeId;
    const storeCode = makeAlphaNumCode(storeName, "STR");
    const prNumber = await nextDocNumber(client, "PR", storeCode);
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
    const current = await dbPool.query<{ status: string; region_id: string }>(
      "SELECT status, region_id FROM purchase_requests WHERE id = $1::uuid",
      [prId],
    );
    const cur = current.rows[0];
    if (!cur) {
      res.status(404).json({ error: "PR not found." });
      return;
    }
    if (actor.role === "regional_admin" && actor.regionId !== cur.region_id) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
    if (cur.status !== "SUBMITTED") {
      res.status(400).json({ error: `Manual status change is not allowed from ${cur.status}.` });
      return;
    }
    if (status !== "APPROVED" && status !== "REJECTED") {
      res.status(400).json({ error: "Only APPROVED or REJECTED is allowed from SUBMITTED." });
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
  const requested = Array.isArray(req.body?.items)
    ? (req.body.items as Array<{ itemId: string; qty: number }>)
        .map((x) => ({ itemId: String(x.itemId ?? "").trim(), qty: Number(x.qty) }))
        .filter((x) => x.itemId && !Number.isNaN(x.qty) && x.qty > 0)
    : [];
  const requestedByItem = new Map<string, number>();
  for (const r of requested) {
    requestedByItem.set(r.itemId, r.qty);
  }
  const client = await dbPool.connect();
  try {
    await client.query("BEGIN");
    const prRes = await client.query<{
      id: string;
      region_id: string;
      store_id: string;
      status: string;
      pr_number: string;
    }>(
      `SELECT id, region_id, store_id, status, pr_number
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
      if (requestedByItem.size > 0 && !requestedByItem.has(item.id)) continue;
      const hoStock = await client.query<{ qty: number }>(
        `SELECT quantity::float8 AS qty
         FROM spare_stock
         WHERE spare_id = $1::uuid AND location_key = $2`,
        [item.spare_id, `HO:${pr.region_id}`],
      );
      const available = hoStock.rows[0]?.qty ?? 0;
      const wanted = requestedByItem.get(item.id) ?? remaining;
      if (wanted > remaining) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Requested quantity exceeds PR pending for one or more lines." });
        return;
      }
      if (wanted > available) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Requested quantity exceeds HO available stock for one or more lines." });
        return;
      }
      const issueQty = Math.min(wanted, Math.max(0, available));
      if (issueQty <= 0) continue;

      // HO transfer only: store inward will be posted in a separate step.
      await client.query(
        `UPDATE spare_stock
         SET quantity = GREATEST(quantity - $1, 0), updated_at = now()
         WHERE spare_id = $2::uuid AND location_key = $3`,
        [issueQty, item.spare_id, `HO:${pr.region_id}`],
      );
      const hoAfter = await client.query<{ qty: number }>(
        `SELECT quantity::float8 AS qty
         FROM spare_stock
         WHERE spare_id = $1::uuid AND location_key = $2`,
        [item.spare_id, `HO:${pr.region_id}`],
      );
      await client.query(
        `UPDATE purchase_request_items
         SET issued_qty = issued_qty + $1
         WHERE id = $2::uuid`,
        [issueQty, item.id],
      );
      await appendStockHistory(client, {
        spareId: item.spare_id,
        eventType: "TRANSFER_OUT",
        locationKey: `HO:${pr.region_id}`,
        locationType: "HO",
        regionId: pr.region_id,
        quantityChange: -issueQty,
        balanceAfter: hoAfter.rows[0]?.qty ?? null,
        referenceType: "PR",
        referenceNumber: pr.pr_number,
        note: `Stock issued from HO to store ${pr.store_id}.`,
        createdBy: actor.id,
      });
      movedTotal += issueQty;
    }

    if (movedTotal <= 0) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "No stock moved. Check HO availability." });
      return;
    }

    const sum = await client.query<{ req: number; iss: number; rec: number }>(
      `SELECT COALESCE(SUM(qty), 0)::float8 AS req,
              COALESCE(SUM(issued_qty), 0)::float8 AS iss,
              COALESCE(SUM(received_qty), 0)::float8 AS rec
       FROM purchase_request_items
       WHERE pr_id = $1::uuid`,
      [prId],
    );
    const req = sum.rows[0]?.req ?? 0;
    const iss = sum.rows[0]?.iss ?? 0;
    const rec = sum.rows[0]?.rec ?? 0;
    let nextStatus: "APPROVED" | "PARTIAL" | "FULFILLED" = "APPROVED";
    if (rec >= req && req > 0) nextStatus = "FULFILLED";
    else if (iss > 0 || rec > 0) nextStatus = "PARTIAL";
    await client.query(
      `UPDATE purchase_requests
       SET status = $1, updated_at = now()
       WHERE id = $2::uuid`,
      [nextStatus, prId],
    );
    await client.query("COMMIT");
    const current = readState();
    const recipients = allUsers(current)
      .filter((u) => u.role === "store_user" && u.regionId === pr.region_id && u.storeId === pr.store_id)
      .map((u) => u.id);
    await pushNotifications(recipients, {
      title: `PR ${pr.pr_number} stock sent`,
      message: `Stock against PR ${pr.pr_number} has been sent from HO to your store. Please inward and verify quantity.`,
      category: "inventory_pr",
    });
    res.json({ ok: true, movedQty: movedTotal, status: nextStatus });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(e);
    res.status(400).json({ error: "Could not fulfill PR." });
  } finally {
    client.release();
  }
});

app.get("/api/notifications", requireAuth, (req, res) => {
  const uid = (req as express.Request & { userId: string }).userId;
  const s = readState();
  const list = s.notifications
    .filter((n) => n.userId === uid)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 30);
  res.json({ notifications: list });
});

app.post("/api/notifications/read-all", requireAuth, async (req, res) => {
  const uid = (req as express.Request & { userId: string }).userId;
  await mutate((s) => ({
    next: {
      ...s,
      notifications: s.notifications.map((n) => (n.userId === uid ? { ...n, isRead: true } : n)),
    },
    result: undefined,
  }));
  res.json({ ok: true });
});

app.post("/api/notifications/service-dispatch", requireAuth, async (req, res) => {
  const uid = (req as express.Request & { userId: string }).userId;
  const s = readState();
  const actor = findUser(s, uid);
  if (!actor || actor.role !== "store_user" || !actor.regionId || !actor.storeId) {
    res.status(403).json({ error: "Only store users can send this notification." });
    return;
  }
  const dcNumber = String(req.body?.dcNumber ?? "").trim();
  const count = Number(req.body?.count ?? 0);
  if (!dcNumber || Number.isNaN(count) || count <= 0) {
    res.status(400).json({ error: "dcNumber and count are required." });
    return;
  }
  const recipients = allUsers(s)
    .filter(
      (u) =>
        u.regionId === actor.regionId &&
        (u.role === "regional_admin" || u.role === "service_centre_clerk" || u.role === "service_centre_supervisor"),
    )
    .map((u) => u.id);
  await pushNotifications(recipients, {
    title: `Store DC ${dcNumber} sent to HO`,
    message: `${count} watch(es) dispatched from store ${actor.storeId} to HO. Please process inward at service centre.`,
    category: "service_dc",
  });
  res.json({ ok: true });
});

app.post("/api/inventory/prs/:prId/inward", requireAuth, async (req, res) => {
  if (!dbPool) {
    res.status(503).json({ error: "Database is required for PR module." });
    return;
  }
  const uid = (req as express.Request & { userId: string }).userId;
  const state = readState();
  const actor = findUser(state, uid);
  if (!actor || actor.role !== "store_user" || !actor.storeId || !actor.regionId) {
    res.status(403).json({ error: "Only store user can inward PR transfer." });
    return;
  }
  const prId = req.params.prId;
  const requested = Array.isArray(req.body?.items)
    ? (req.body.items as Array<{ itemId: string; qty: number }>)
        .map((x) => ({ itemId: String(x.itemId ?? "").trim(), qty: Number(x.qty) }))
        .filter((x) => x.itemId && !Number.isNaN(x.qty) && x.qty > 0)
    : [];
  if (requested.length === 0) {
    res.status(400).json({ error: "At least one inward line quantity is required." });
    return;
  }
  const requestedByItem = new Map<string, number>();
  for (const r of requested) requestedByItem.set(r.itemId, r.qty);

  const client = await dbPool.connect();
  try {
    await client.query("BEGIN");
    const prRes = await client.query<{ id: string; region_id: string; store_id: string; status: string; pr_number: string }>(
      `SELECT id, region_id, store_id, status, pr_number
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
    if (pr.region_id !== actor.regionId || pr.store_id !== actor.storeId) {
      await client.query("ROLLBACK");
      res.status(403).json({ error: "You can inward only your store PR." });
      return;
    }
    if (pr.status === "REJECTED" || pr.status === "DRAFT") {
      await client.query("ROLLBACK");
      res.status(400).json({ error: `Cannot inward PR in ${pr.status} status.` });
      return;
    }

    const itemsRes = await client.query<{
      id: string;
      spare_id: string;
      issued_qty: number;
      received_qty: number;
      qty: number;
    }>(
      `SELECT id, spare_id, issued_qty::float8, received_qty::float8, qty::float8
       FROM purchase_request_items
       WHERE pr_id = $1::uuid
       FOR UPDATE`,
      [prId],
    );
    let movedTotal = 0;
    for (const item of itemsRes.rows) {
      const reqQty = requestedByItem.get(item.id);
      if (!reqQty) continue;
      const pendingReceipt = Math.max(0, item.issued_qty - item.received_qty);
      if (reqQty > pendingReceipt) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Inward quantity exceeds transferred pending quantity." });
        return;
      }
      await client.query(
        `INSERT INTO spare_stock (spare_id, location_key, location_type, region_id, store_id, quantity)
         VALUES ($1::uuid, $2, 'STORE', $3, $4, $5)
         ON CONFLICT (spare_id, location_key)
         DO UPDATE SET quantity = spare_stock.quantity + EXCLUDED.quantity, updated_at = now()`,
        [item.spare_id, `STORE:${pr.region_id}:${pr.store_id}`, pr.region_id, pr.store_id, reqQty],
      );
      const storeAfter = await client.query<{ qty: number }>(
        `SELECT quantity::float8 AS qty
         FROM spare_stock
         WHERE spare_id = $1::uuid AND location_key = $2`,
        [item.spare_id, `STORE:${pr.region_id}:${pr.store_id}`],
      );
      await client.query(
        `UPDATE purchase_request_items
         SET received_qty = received_qty + $1
         WHERE id = $2::uuid`,
        [reqQty, item.id],
      );
      await appendStockHistory(client, {
        spareId: item.spare_id,
        eventType: "TRANSFER_IN",
        locationKey: `STORE:${pr.region_id}:${pr.store_id}`,
        locationType: "STORE",
        regionId: pr.region_id,
        storeId: pr.store_id,
        quantityChange: reqQty,
        balanceAfter: storeAfter.rows[0]?.qty ?? null,
        referenceType: "PR",
        referenceNumber: pr.pr_number,
        note: "Store inward posted against PR transfer.",
        createdBy: actor.id,
      });
      movedTotal += reqQty;
    }
    if (movedTotal <= 0) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "No inward moved." });
      return;
    }

    const sum = await client.query<{ req: number; rec: number; iss: number }>(
      `SELECT COALESCE(SUM(qty), 0)::float8 AS req,
              COALESCE(SUM(received_qty), 0)::float8 AS rec,
              COALESCE(SUM(issued_qty), 0)::float8 AS iss
       FROM purchase_request_items
       WHERE pr_id = $1::uuid`,
      [prId],
    );
    const req = sum.rows[0]?.req ?? 0;
    const rec = sum.rows[0]?.rec ?? 0;
    const iss = sum.rows[0]?.iss ?? 0;
    let nextStatus: "APPROVED" | "PARTIAL" | "FULFILLED" = "APPROVED";
    if (rec >= req && req > 0) nextStatus = "FULFILLED";
    else if (iss > 0 || rec > 0) nextStatus = "PARTIAL";
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
    res.status(400).json({ error: "Could not inward PR transfer." });
  } finally {
    client.release();
  }
});

app.post("/api/inventory/allocations/suggest", requireAuth, async (req, res) => {
  if (!dbPool) {
    res.status(503).json({ error: "Database is required." });
    return;
  }
  const uid = (req as express.Request & { userId: string }).userId;
  const state = readState();
  const actor = findUser(state, uid);
  if (!actor || (actor.role !== "super_admin" && actor.role !== "regional_admin")) {
    res.status(403).json({ error: "Only HO admins can generate allocations." });
    return;
  }
  const regionId = String(req.body?.regionId ?? actor.regionId ?? "").trim();
  if (!regionId) {
    res.status(400).json({ error: "regionId is required." });
    return;
  }
  if (actor.role === "regional_admin" && actor.regionId !== regionId) {
    res.status(403).json({ error: "Region mismatch." });
    return;
  }
  try {
    const pendingRes = await dbPool.query<{
      prId: string;
      prNumber: string;
      prItemId: string;
      spareId: string;
      spareSku: string;
      spareName: string;
      storeId: string;
      neededBy: string | null;
      createdAt: Date;
      pendingQty: number;
      hoAvailable: number;
    }>(
      `SELECT pr.id AS "prId",
              pr.pr_number AS "prNumber",
              pri.id AS "prItemId",
              pri.spare_id AS "spareId",
              s.sku AS "spareSku",
              s.name AS "spareName",
              pr.store_id AS "storeId",
              pr.needed_by AS "neededBy",
              pr.created_at AS "createdAt",
              GREATEST(pri.qty - pri.issued_qty, 0)::float8 AS "pendingQty",
              COALESCE((
                SELECT quantity::float8
                FROM spare_stock st
                WHERE st.spare_id = pri.spare_id AND st.location_key = $1
              ), 0) AS "hoAvailable"
       FROM purchase_request_items pri
       JOIN purchase_requests pr ON pr.id = pri.pr_id
       JOIN spares s ON s.id = pri.spare_id
       WHERE pr.region_id = $2::text
         AND pr.status IN ('APPROVED', 'PARTIAL', 'SUBMITTED')
       ORDER BY COALESCE(pr.needed_by, DATE '9999-12-31') ASC, pr.created_at ASC`,
      [`HO:${regionId}`, regionId],
    );
    const groups = new Map<string, typeof pendingRes.rows>();
    for (const row of pendingRes.rows) {
      if (row.pendingQty <= 0) continue;
      const list = groups.get(row.spareId) ?? [];
      list.push(row);
      groups.set(row.spareId, list);
    }
    const suggestions: Array<{
      prId: string;
      prNumber: string;
      prItemId: string;
      spareId: string;
      spareSku: string;
      spareName: string;
      storeId: string;
      pendingQty: number;
      suggestedQty: number;
      hoAvailableAtStart: number;
    }> = [];
    for (const [, rows] of groups) {
      const availableStart = rows[0]?.hoAvailable ?? 0;
      let available = availableStart;
      for (const row of rows) {
        const suggested = Math.max(0, Math.min(row.pendingQty, available));
        if (suggested > 0) {
          available -= suggested;
        }
        suggestions.push({
          prId: row.prId,
          prNumber: row.prNumber,
          prItemId: row.prItemId,
          spareId: row.spareId,
          spareSku: row.spareSku,
          spareName: row.spareName,
          storeId: row.storeId,
          pendingQty: row.pendingQty,
          suggestedQty: suggested,
          hoAvailableAtStart: availableStart,
        });
      }
    }
    res.json({ suggestions });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not generate allocation suggestions." });
  }
});

app.post("/api/inventory/allocations/confirm", requireAuth, async (req, res) => {
  if (!dbPool) {
    res.status(503).json({ error: "Database is required." });
    return;
  }
  const uid = (req as express.Request & { userId: string }).userId;
  const state = readState();
  const actor = findUser(state, uid);
  if (!actor || (actor.role !== "super_admin" && actor.role !== "regional_admin")) {
    res.status(403).json({ error: "Only HO admins can confirm allocations." });
    return;
  }
  const regionId = String(req.body?.regionId ?? actor.regionId ?? "").trim();
  const rows = Array.isArray(req.body?.rows)
    ? (req.body.rows as Array<{ prItemId: string; finalQty: number; suggestedQty?: number }>)
    : [];
  const notes = String(req.body?.notes ?? "").trim();
  if (!regionId || rows.length === 0) {
    res.status(400).json({ error: "regionId and rows are required." });
    return;
  }
  if (actor.role === "regional_admin" && actor.regionId !== regionId) {
    res.status(403).json({ error: "Region mismatch." });
    return;
  }
  const client = await dbPool.connect();
  try {
    await client.query("BEGIN");
    const batchNumber = `ALC${String(new Date().getFullYear()).slice(-2)}${createId("alc").slice(-8).toUpperCase()}`;
    const batchIns = await client.query<{ id: string }>(
      `INSERT INTO stock_allocation_batches (batch_number, region_id, status, notes, created_by)
       VALUES ($1, $2, 'DRAFT', $3, $4)
       RETURNING id`,
      [batchNumber, regionId, notes, actor.id],
    );
    const batchId = batchIns.rows[0]!.id;
    let moved = 0;
    const touchedPrIds = new Set<string>();
    const touchedStoreIds = new Set<string>();
    const touchedPrNumbers = new Set<string>();
    for (const input of rows) {
      const finalQty = Number(input.finalQty);
      if (Number.isNaN(finalQty) || finalQty <= 0) continue;
      const prItemRes = await client.query<{
        id: string;
        pr_id: string;
        spare_id: string;
        qty: number;
        issued_qty: number;
        pr_number: string;
        store_id: string;
        region_id: string;
      }>(
        `SELECT pri.id, pri.pr_id, pri.spare_id, pri.qty::float8, pri.issued_qty::float8,
                pr.pr_number, pr.store_id, pr.region_id
         FROM purchase_request_items pri
         JOIN purchase_requests pr ON pr.id = pri.pr_id
         WHERE pri.id = $1::uuid
         FOR UPDATE`,
        [input.prItemId],
      );
      const prItem = prItemRes.rows[0];
      if (!prItem || prItem.region_id !== regionId) continue;
      const pending = Math.max(0, prItem.qty - prItem.issued_qty);
      if (finalQty > pending) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Final qty exceeds pending qty." });
        return;
      }
      const hoStockRes = await client.query<{ qty: number }>(
        `SELECT quantity::float8 AS qty
         FROM spare_stock
         WHERE spare_id = $1::uuid AND location_key = $2
         FOR UPDATE`,
        [prItem.spare_id, `HO:${regionId}`],
      );
      const available = hoStockRes.rows[0]?.qty ?? 0;
      if (finalQty > available) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Final qty exceeds HO available stock." });
        return;
      }
      await client.query(
        `INSERT INTO stock_allocation_batch_items (batch_id, pr_id, pr_item_id, spare_id, suggested_qty, final_qty)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6)`,
        [batchId, prItem.pr_id, prItem.id, prItem.spare_id, Number(input.suggestedQty ?? 0), finalQty],
      );
      touchedPrIds.add(prItem.pr_id);
      touchedStoreIds.add(prItem.store_id);
      touchedPrNumbers.add(prItem.pr_number);
      await client.query(
        `UPDATE spare_stock
         SET quantity = quantity - $1, updated_at = now()
         WHERE spare_id = $2::uuid AND location_key = $3`,
        [finalQty, prItem.spare_id, `HO:${regionId}`],
      );
      await client.query(
        `UPDATE purchase_request_items
         SET issued_qty = issued_qty + $1
         WHERE id = $2::uuid`,
        [finalQty, prItem.id],
      );
      const hoAfter = await client.query<{ qty: number }>(
        `SELECT quantity::float8 AS qty
         FROM spare_stock
         WHERE spare_id = $1::uuid AND location_key = $2`,
        [prItem.spare_id, `HO:${regionId}`],
      );
      await appendStockHistory(client, {
        spareId: prItem.spare_id,
        eventType: "TRANSFER_OUT",
        locationKey: `HO:${regionId}`,
        locationType: "HO",
        regionId,
        quantityChange: -finalQty,
        balanceAfter: hoAfter.rows[0]?.qty ?? null,
        referenceType: "PR",
        referenceNumber: prItem.pr_number,
        note: `Auto allocation batch ${batchNumber} issued to store ${prItem.store_id}.`,
        createdBy: actor.id,
      });
      moved += finalQty;
    }
    for (const prId of touchedPrIds) {
      const sum = await client.query<{ req: number; iss: number; rec: number }>(
        `SELECT COALESCE(SUM(qty), 0)::float8 AS req,
                COALESCE(SUM(issued_qty), 0)::float8 AS iss,
                COALESCE(SUM(received_qty), 0)::float8 AS rec
         FROM purchase_request_items
         WHERE pr_id = $1::uuid`,
        [prId],
      );
      const req = sum.rows[0]?.req ?? 0;
      const iss = sum.rows[0]?.iss ?? 0;
      const rec = sum.rows[0]?.rec ?? 0;
      let nextStatus: "APPROVED" | "PARTIAL" | "FULFILLED" = "APPROVED";
      if (rec >= req && req > 0) nextStatus = "FULFILLED";
      else if (iss > 0 || rec > 0) nextStatus = "PARTIAL";
      await client.query(
        `UPDATE purchase_requests
         SET status = $1, updated_at = now()
         WHERE id = $2::uuid`,
        [nextStatus, prId],
      );
    }

    if (moved <= 0) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "No quantity allocated." });
      return;
    }
    await client.query(
      `UPDATE stock_allocation_batches
       SET status = 'CONFIRMED', confirmed_at = now()
       WHERE id = $1::uuid`,
      [batchId],
    );
    await client.query("COMMIT");
    const current = readState();
    const recipients = allUsers(current)
      .filter((u) => u.role === "store_user" && u.regionId === regionId && u.storeId && touchedStoreIds.has(u.storeId))
      .map((u) => u.id);
    await pushNotifications(recipients, {
      title: `Allocation ${batchNumber} issued`,
      message: `HO issued stock for PR(s): ${Array.from(touchedPrNumbers).slice(0, 5).join(", ")}. Please inward at store.`,
      category: "inventory_pr",
    });
    res.json({ ok: true, batchId, batchNumber, movedQty: moved });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(e);
    res.status(400).json({ error: "Could not confirm allocation." });
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
      mrp_inr: number | null;
      is_active: boolean;
      created_at: Date;
    }>(
      `SELECT id, sku, name, description, category, hsn, mrp_inr, is_active, created_at
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
          mrpInr: r.mrp_inr == null ? null : Number(r.mrp_inr),
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
