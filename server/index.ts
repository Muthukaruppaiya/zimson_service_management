import "dotenv/config";
import cors from "cors";
import express from "express";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { registerCatalogRoutes } from "./catalogRoutes";
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
  const state = readState();
  res.json({ regions: state.regions ?? [] });
});

app.put("/api/regions", requireAuth, async (req, res) => {
  const body = req.body as { regions?: SeedRegion[] };
  if (!Array.isArray(body.regions)) {
    res.status(400).json({ error: "regions array required" });
    return;
  }
  await mutate((s) => ({
    next: { ...s, regions: body.regions as SeedRegion[] },
    result: undefined,
  }));
  res.json({ ok: true });
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
  registerCatalogRoutes(app, dbPool, requireAuth);

  app.listen(PORT, () => {
    console.log(`Zimson API listening on http://127.0.0.1:${PORT}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
