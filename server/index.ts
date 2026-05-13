import "dotenv/config";
import cors from "cors";
import express from "express";
import type { Pool } from "pg";
import crypto from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { registerCatalogRoutes } from "./catalogRoutes";
import { registerGeoRoutes } from "./geoRoutes";
import { registerInventoryPoSupplierRoutes } from "./inventoryPoSupplierRoutes";
import { registerQuickBillRoutes } from "./quickBillRoutes";
import { registerTaxSettingsRoutes } from "./taxSettingsRoutes";
import { registerInventoryBulkImportRoutes } from "./inventoryBulkImportRoutes";
import { registerSrfRoutes } from "./srfRoutes";
import { registerTechnicianRoutes } from "./technicianRoutes";
import { runMigrations } from "./db/migrate";
import { createPool } from "./db/pool";
import { appendStockHistory } from "./db/stockHistory";
import { SEED_USERS, type SeedRegion, type SeedStore } from "../src/data/seed";
import { createId } from "../src/lib/id";
import type { CustomerKind, CustomerRecord } from "../src/types/customer";
import type { AppNotification } from "../src/types/notification";
import type { DemoUser, ModuleKey, SessionUser, UserRole } from "../src/types/user";
import { readState, stripPassword, writeState, type AppState } from "./persist";
import { lookupGstCompany } from "./gstLookup";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT) || 4000;
const COOKIE = "zimson_session";
const dbPool = createPool();

type CustomerRegOtpSession = {
  phoneLast10: string;
  mobileCode: string;
  mobileVerified: boolean;
  emailNorm: string | null;
  emailCode: string | null;
  emailVerified: boolean;
  expiresAt: number;
};

const customerRegisterOtpSessions = new Map<string, CustomerRegOtpSession>();
const CUSTOMER_OTP_TTL_MS = 20 * 60 * 1000;

const CUSTOMERS_SELECT_FIELDS = `
  id,
  customer_code AS "customerCode",
  display_name AS "displayName",
  salutation,
  first_name AS "firstName",
  last_name AS "lastName",
  phone,
  otp_phone AS "otpPhone",
  alternate_phone AS "alternatePhone",
  telephone,
  email,
  dob::text AS "dob",
  anniversary_date::text AS "anniversaryDate",
  address,
  city,
  billing_address AS "billingAddress",
  shipping_address AS "shippingAddress",
  customer_kind AS "customerKind",
  company,
  gst,
  pan,
  tax_preference AS "taxPreference",
  b2b_trade_display_name AS "b2bTradeDisplayName",
  remark_attention AS "remarkAttention",
  reference_name AS "referenceName",
  representative_name AS "representativeName",
  additional_addresses AS "additionalAddresses",
  phone_verified_at AS "phoneVerifiedAt",
  email_verified_at AS "emailVerifiedAt",
  customer_data_source AS "customerDataSource",
  created_at AS "createdAt"
`;

function normalizeCustomerAddressJson(v: unknown): CustomerRecord["billingAddress"] {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  return {
    doorNo: String(o.doorNo ?? ""),
    street: String(o.street ?? ""),
    city: String(o.city ?? ""),
    district: String(o.district ?? ""),
    state: String(o.state ?? ""),
    countryId: String(o.countryId ?? ""),
    pincode: String(o.pincode ?? ""),
  };
}

function rowToCustomer(r: Record<string, unknown>): CustomerRecord {
  const iso = (v: unknown) =>
    v instanceof Date ? v.toISOString() : v ? new Date(String(v)).toISOString() : null;
  const billing = normalizeCustomerAddressJson(r.billingAddress);
  const shipping = normalizeCustomerAddressJson(r.shippingAddress);
  const addRaw = r.additionalAddresses;
  let additionalAddresses: CustomerRecord["additionalAddresses"];
  if (Array.isArray(addRaw)) {
    additionalAddresses = addRaw
      .map((x) => normalizeCustomerAddressJson(x))
      .filter((x): x is NonNullable<typeof x> => !!x);
  } else if (typeof addRaw === "string") {
    try {
      const p = JSON.parse(addRaw) as unknown;
      additionalAddresses = Array.isArray(p)
        ? p.map((x) => normalizeCustomerAddressJson(x)).filter((x): x is NonNullable<typeof x> => !!x)
        : undefined;
    } catch {
      additionalAddresses = undefined;
    }
  } else {
    additionalAddresses = undefined;
  }
  return {
    id: String(r.id),
    customerCode: r.customerCode != null ? String(r.customerCode) : null,
    displayName: String(r.displayName ?? ""),
    salutation: r.salutation != null ? String(r.salutation) : undefined,
    firstName: r.firstName != null ? String(r.firstName) : undefined,
    lastName: r.lastName != null ? String(r.lastName) : undefined,
    phone: String(r.phone ?? ""),
    otpPhone: r.otpPhone != null ? String(r.otpPhone) : null,
    alternatePhone: r.alternatePhone != null ? String(r.alternatePhone) : undefined,
    telephone: r.telephone != null ? String(r.telephone) : null,
    email: String(r.email ?? ""),
    dob: r.dob != null ? String(r.dob) : null,
    anniversaryDate: r.anniversaryDate != null ? String(r.anniversaryDate) : null,
    address: r.address != null ? String(r.address) : undefined,
    city: r.city != null ? String(r.city) : undefined,
    billingAddress: billing && typeof billing === "object" ? billing : undefined,
    shippingAddress: shipping && typeof shipping === "object" ? shipping : undefined,
    additionalAddresses,
    customerKind: (r.customerKind as CustomerKind) ?? "B2C",
    company: r.company != null ? String(r.company) : undefined,
    gst: r.gst != null ? String(r.gst) : undefined,
    pan: r.pan != null ? String(r.pan) : undefined,
    taxPreference: (r.taxPreference as CustomerRecord["taxPreference"]) ?? null,
    b2bTradeDisplayName: r.b2bTradeDisplayName != null ? String(r.b2bTradeDisplayName) : null,
    remarkAttention: r.remarkAttention != null ? String(r.remarkAttention) : null,
    referenceName: r.referenceName != null ? String(r.referenceName) : null,
    representativeName: r.representativeName != null ? String(r.representativeName) : null,
    phoneVerifiedAt: iso(r.phoneVerifiedAt),
    emailVerifiedAt: iso(r.emailVerifiedAt),
    customerDataSource: (r.customerDataSource as CustomerRecord["customerDataSource"]) ?? "registered",
    createdAt: iso(r.createdAt) ?? new Date().toISOString(),
  };
}

type DbUserRow = {
  id: string;
  employee_code: string | null;
  email: string;
  password_hash: string;
  display_name: string;
  role: UserRole;
  region_id: string | null;
  store_id: string | null;
  technician_profile_id: string | null;
  can_login: boolean;
  module_access_override: ModuleKey[] | null;
  is_seed: boolean;
  created_at: Date | string;
  store_ids: string[] | null;
};
let userDirectory: DemoUser[] = [];

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

function hashPassword(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeEmployeeCode(value: string): string {
  return String(value).trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 24);
}

const MODULE_KEY_ALLOWLIST: ModuleKey[] = [
  "dashboard",
  "service",
  "regions",
  "users",
  "service_centre",
  "inventory",
  "settings",
];

/** Normalizes jsonb / JSON string / array from Postgres into validated module keys. */
function normalizeModuleAccessOverride(raw: unknown): ModuleKey[] | null {
  let arr: unknown[] | null = null;
  if (raw == null) return null;
  if (Array.isArray(raw)) arr = raw;
  else if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw) as unknown;
      if (Array.isArray(p)) arr = p;
    } catch {
      return null;
    }
  }
  if (!arr) return null;
  const out = arr.filter(
    (m): m is ModuleKey => typeof m === "string" && MODULE_KEY_ALLOWLIST.includes(m as ModuleKey),
  );
  return out.length ? out : null;
}

function mapDbUser(row: DbUserRow): DemoUser {
  return {
    id: row.id,
    employeeCode: row.employee_code ?? undefined,
    email: row.email,
    password: row.password_hash,
    displayName: row.display_name,
    role: row.role,
    regionId: row.region_id,
    storeId: row.store_id,
    storeIds: Array.isArray(row.store_ids) ? row.store_ids : row.store_id ? [row.store_id] : [],
    technicianProfileId: row.technician_profile_id,
    canLogin: row.can_login,
    moduleAccessOverride: normalizeModuleAccessOverride(row.module_access_override as unknown),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
    isSeed: row.is_seed,
  };
}

function allUsers(): DemoUser[] {
  return userDirectory;
}

async function refreshUsersFromDb(): Promise<void> {
  const { rows } = await dbPool.query<DbUserRow>(
    `SELECT u.id, u.email, u.password_hash, u.display_name, u.role, u.region_id, u.store_id, u.technician_profile_id,
            u.employee_code, u.can_login, u.module_access_override, u.is_seed, u.created_at,
            COALESCE((
              SELECT array_agg(usa.store_id ORDER BY usa.store_id)
              FROM user_store_access usa
              WHERE usa.user_id = u.id
            ), ARRAY[]::text[]) AS store_ids
     FROM app_users u
     ORDER BY u.created_at`,
  );
  userDirectory = rows.map(mapDbUser);
}

function findUser(id: string): DemoUser | undefined {
  return userDirectory.find((u) => u.id === id);
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

async function getSessionUserId(req: express.Request): Promise<string | null> {
  const sid = parseCookies(req.headers.cookie)[COOKIE];
  if (!sid) return null;
  const { rows } = await dbPool.query<{ user_id: string }>(
    `SELECT user_id
     FROM auth_sessions
     WHERE id = $1
       AND revoked_at IS NULL
       AND expires_at > now()
     LIMIT 1`,
    [sid],
  );
  return rows[0]?.user_id ?? null;
}

function makeAlphaNumCode(input: string, fallback: string): string {
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (cleaned.slice(0, 3) || fallback).padEnd(3, "X");
}

async function nextDocNumber(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<{ last_value: number }> }> },
  prefix: string,
  suffix: string,
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
  return `${prefix}${yy}${scopeCode}${num}${suffix}`;
}

async function nextCustomerCode(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<{ last_value: number }> }> },
): Promise<string> {
  const yy = String(new Date().getFullYear()).slice(-2);
  const seq = await client.query<{ last_value: number }>(
    `INSERT INTO number_sequences (prefix, scope_code, year_2, last_value)
     VALUES ('CUST', 'GLOBAL', $1, 1001)
     ON CONFLICT (prefix, scope_code, year_2)
     DO UPDATE SET last_value = number_sequences.last_value + 1
     RETURNING last_value`,
    [yy],
  );
  const num = String(seq.rows[0]!.last_value).padStart(5, "0");
  return `CUST${yy}${num}`;
}

async function getSeriesPrefixSuffix(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
  doc: "pr",
): Promise<{ prefix: string; suffix: string }> {
  const prefixColumn = doc === "pr" ? "pr_prefix" : "pr_prefix";
  const suffixColumn = doc === "pr" ? "pr_suffix" : "pr_suffix";
  const { rows } = await client.query(
    `SELECT ${prefixColumn} AS prefix, ${suffixColumn} AS suffix FROM service_tax_settings WHERE id = 1`,
  );
  return {
    prefix: String(rows[0]?.prefix ?? "PR").trim() || "PR",
    suffix: String(rows[0]?.suffix ?? "").trim(),
  };
}

const STORE_ROLES = new Set<UserRole>([
  "store_user",
  "store_user",
  "store_manager",
  "store_accounts",
]);

const PR_CREATOR_ROLES = new Set<UserRole>(["store_user", "store_manager"]);
// Can view the HO inbox (all PRs)
const HO_VIEWER_ROLES = new Set<UserRole>(["super_admin", "admin", "ho_manager", "ho_purchase"]);
// Can approve/reject/fulfil PRs — ho_purchase can VIEW only, not approve
const HO_APPROVER_ROLES = new Set<UserRole>(["super_admin", "admin", "ho_manager"]);

function moduleKeys(input: unknown): ModuleKey[] | null {
  return normalizeModuleAccessOverride(input);
}

async function getPrFlowLabel(
  pool: Pool,
  code: string,
): Promise<string> {
  const { rows } = await pool.query<{ label: string }>(
    `SELECT label FROM workflow_status_definitions WHERE entity = 'pr_flow' AND code = $1 AND is_active = true LIMIT 1`,
    [code],
  );
  return rows[0]?.label ?? code;
}

async function appendPrStatusHistory(
  poolOrClient: { query: (sql: string, values?: unknown[]) => Promise<unknown> },
  params: { prId: string; statusCode: string; statusLabel: string; changedBy?: string | null; note?: string },
): Promise<void> {
  await poolOrClient.query(
    `INSERT INTO purchase_request_status_history (pr_id, status_code, status_label, changed_by, note)
     VALUES ($1::uuid, $2, $3, $4, $5)`,
    [params.prId, params.statusCode, params.statusLabel, params.changedBy ?? null, params.note ?? ""],
  );
}

function derivePrInternalStatus(req: number, issued: number, received: number): { code: string; fallbackLabel: string } {
  if (received >= req && req > 0) return { code: "STORE_INWARD_COMPLETED", fallbackLabel: "Store inward completed" };
  if (issued > 0 || received > 0) return { code: "TRANSFER_TO_STORE", fallbackLabel: "Transfer to store" };
  return { code: "PR_APPROVED_HO", fallbackLabel: "PR approved by HO" };
}

function requireAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  void getSessionUserId(req)
    .then((uid) => {
      if (!uid) {
        res.status(401).json({ error: "Not signed in." });
        return;
      }
      (req as express.Request & { userId: string }).userId = uid;
      next();
    })
    .catch(() => {
      res.status(401).json({ error: "Not signed in." });
    });
}

const app = express();
app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json({ limit: "5mb" }));
app.use("/uploads", express.static(join(process.cwd(), "uploads")));

async function ensureSeedUsers(): Promise<void> {
  for (const user of SEED_USERS) {
    const employeeCode = normalizeEmployeeCode(String(user.employeeCode ?? "")) || normalizeEmployeeCode(user.id);
    await dbPool.query(
      `INSERT INTO app_users (
         id, employee_code, email, password_hash, plain_password, display_name, role, region_id, store_id, technician_profile_id,
         can_login, module_access_override, is_seed
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, true)
       ON CONFLICT (id) DO UPDATE
       SET employee_code = EXCLUDED.employee_code,
           email = EXCLUDED.email,
           password_hash = EXCLUDED.password_hash,
           plain_password = EXCLUDED.plain_password,
           display_name = EXCLUDED.display_name,
           role = EXCLUDED.role,
           region_id = EXCLUDED.region_id,
           store_id = EXCLUDED.store_id,
           technician_profile_id = EXCLUDED.technician_profile_id,
           can_login = EXCLUDED.can_login,
           module_access_override = EXCLUDED.module_access_override,
           is_seed = true,
           updated_at = now()`,
      [
        user.id,
        employeeCode,
        user.email.toLowerCase(),
        hashPassword(user.password),
        user.password,
        user.displayName,
        user.role,
        user.regionId,
        user.storeId,
        user.technicianProfileId,
        user.canLogin !== false,
        JSON.stringify(user.moduleAccessOverride ?? null),
      ],
    );
    if (user.storeId) {
      await dbPool.query(
        `INSERT INTO user_store_access (user_id, store_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id, store_id) DO NOTHING`,
        [user.id, user.storeId],
      );
    }
  }
}

app.post("/api/auth/login", async (req, res) => {
  const employeeCode = normalizeEmployeeCode(String(req.body?.employeeCode ?? ""));
  const password = String(req.body?.password ?? "");
  const selectedStoreId = String(req.body?.storeId ?? "").trim() || null;
  const users = await allUsers();
  const found = users.find(
    (u) => normalizeEmployeeCode(String(u.employeeCode ?? u.id)) === employeeCode && u.password === hashPassword(password),
  );
  if (!found) {
    res.status(401).json({ ok: false, message: "Invalid employee number or password." });
    return;
  }
  if (found.canLogin === false) {
    res.status(403).json({ ok: false, message: "This profile is directory-only and cannot sign in." });
    return;
  }
  if (STORE_ROLES.has(found.role)) {
    const allowedStores = (found.storeIds ?? []).filter(Boolean);
    if (allowedStores.length === 0) {
      res.status(403).json({ ok: false, message: "No store mapping found for this account." });
      return;
    }
    if (!selectedStoreId && allowedStores.length > 1) {
      const { rows: storeRows } = await dbPool.query<{ id: string; name: string }>(
        `SELECT id, name FROM stores WHERE id = ANY($1::text[]) ORDER BY name`,
        [allowedStores],
      );
      res.status(400).json({
        ok: false,
        code: "STORE_SELECTION_REQUIRED",
        message: "Select a store to continue login.",
        stores: storeRows,
      });
      return;
    }
    const effectiveStoreId = selectedStoreId ?? allowedStores[0]!;
    if (!allowedStores.includes(effectiveStoreId)) {
      res.status(400).json({ ok: false, message: "Selected store is not assigned for this user." });
      return;
    }
    await dbPool.query(
      `UPDATE app_users
       SET store_id = $2,
           updated_at = now()
       WHERE id = $1`,
      [found.id, effectiveStoreId],
    );
    await refreshUsersFromDb();
  }
  const refreshed = allUsers().find((u) => u.id === found.id) ?? found;
  const sid = createId("sid");
  await dbPool.query(
    `INSERT INTO auth_sessions (id, user_id, expires_at)
     VALUES ($1, $2, now() + interval '7 day')`,
    [sid, found.id],
  );
  res.cookie(COOKIE, sid, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.json({ ok: true, user: stripPassword(refreshed) });
});

app.post("/api/auth/logout", (req, res) => {
  const sid = parseCookies(req.headers.cookie)[COOKIE];
  if (sid) {
    void dbPool.query(`UPDATE auth_sessions SET revoked_at = now() WHERE id = $1`, [sid]);
  }
  res.clearCookie(COOKIE, { path: "/" });
  res.json({ ok: true });
});

app.get("/api/auth/me", async (req, res) => {
  const uid = await getSessionUserId(req);
  if (!uid) {
    res.json({ user: null });
    return;
  }
  const u = await findUser(uid);
  res.json({ user: u ? stripPassword(u) : null });
});

app.get("/api/auth/demo-logins", (_req, res) => {
  const users = allUsers()
    .filter((u) => u.isSeed)
    .map((u) => ({ email: u.email, password: "••••", role: u.role, name: u.displayName }));
  res.json({ users });
});

// Public demo endpoint — exposes all user credentials for the login page demo table (wireframe only)
app.get("/api/demo-users", async (_req, res) => {
  if (!dbPool) {
    res.json({ users: [] });
    return;
  }
  try {
    const { rows } = await dbPool.query<{
      employee_code: string | null;
      plain_password: string | null;
      display_name: string;
      role: string;
      can_login: boolean;
    }>(
      `SELECT employee_code, plain_password, display_name, role, can_login
       FROM app_users
       ORDER BY created_at ASC`,
    );
    res.json({
      users: rows.map((r) => ({
        employeeCode: String(r.employee_code ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 24),
        password: r.plain_password ?? (r.role === "super_admin" ? "super123" : "123456"),
        displayName: r.display_name,
        role: r.role,
        canLogin: r.can_login,
      })),
    });
  } catch {
    res.json({ users: [] });
  }
});

app.get("/api/users", requireAuth, async (req, res) => {
  const uid = (req as express.Request & { userId: string }).userId;
  const actor = await findUser(uid);
  if (!actor) {
    res.status(401).json({ error: "Invalid session." });
    return;
  }
  let list = (await allUsers()).map(stripPassword);
  if (actor.role === "admin") {
    list = list.filter((u) => u.regionId === actor.regionId);
  } else if (actor.role === "admin" && actor.regionId) {
    list = list.filter((u) => u.regionId === actor.regionId);
  } else if (actor.role !== "super_admin" && actor.role !== "admin") {
    res.status(403).json({ error: "Forbidden." });
    return;
  }
  res.json({ users: list });
});

app.post("/api/users", requireAuth, async (req, res) => {
  const uid = (req as express.Request & { userId: string }).userId;
  const actor = await findUser(uid);
  if (!actor) {
    res.status(401).json({ error: "Invalid session." });
    return;
  }

  const input = req.body as {
    employeeCode?: string;
    email?: string;
    displayName: string;
    password?: string;
    role: UserRole;
    regionId: string;
    storeId: string | null;
    storeIds?: string[] | null;
    canLogin?: boolean;
    moduleAccessOverride?: string[] | null;
  };
  const canLogin = input.canLogin !== false;
  const employeeCode = normalizeEmployeeCode(String(input.employeeCode ?? ""));
  const email = String(input.email ?? "").trim().toLowerCase();
  if (!input.displayName.trim()) {
    res.status(400).json({ ok: false, message: "Display name is required." });
    return;
  }
  if (canLogin) {
    if (!employeeCode) {
      res.status(400).json({ ok: false, message: "Employee number is required for login-enabled users." });
      return;
    }
    if (String(input.password ?? "").length < 4) {
      res.status(400).json({ ok: false, message: "Password must be at least 4 characters." });
      return;
    }
  }
  if (employeeCode && (await allUsers()).some((u) => normalizeEmployeeCode(String(u.employeeCode ?? u.id)) === employeeCode)) {
    res.status(400).json({ ok: false, message: "An account with this employee number already exists." });
    return;
  }
  if (email && (await allUsers()).some((u) => u.email.toLowerCase() === email)) {
    res.status(400).json({ ok: false, message: "An account with this email already exists." });
    return;
  }

  if (actor.role !== "super_admin" && actor.role !== "admin") {
    res.status(403).json({ ok: false, message: "Only Super Admin or Admin can create users." });
    return;
  }
  if (actor.role === "admin" && (input.role === "super_admin" || input.role === "admin")) {
    res.status(403).json({ ok: false, message: "Admin cannot assign Super Admin or Admin roles." });
    return;
  }

  if (actor.role === "admin") {
    if (!actor.regionId) {
      res.status(403).json({ ok: false, message: "Your Admin account has no region assigned; user creation is disabled." });
      return;
    }
    if (input.regionId !== actor.regionId) {
      res.status(400).json({ ok: false, message: "HO Admin may only create users in the same HO region as their account." });
      return;
    }
  }

  const requestedStoreIds = Array.isArray(input.storeIds)
    ? input.storeIds.map((s) => String(s ?? "").trim()).filter(Boolean)
    : input.storeId
      ? [String(input.storeId).trim()]
      : [];
  if (STORE_ROLES.has(input.role) && requestedStoreIds.length === 0) {
    res.status(400).json({ ok: false, message: "At least one store is required for store roles." });
    return;
  }
  if (STORE_ROLES.has(input.role) && requestedStoreIds.length > 0) {
    const { rows: storeRows } = await dbPool.query<{ id: string }>(
      `SELECT id
       FROM stores
       WHERE id = ANY($1::text[])
         AND region_id = $2`,
      [requestedStoreIds, input.regionId],
    );
    if (storeRows.length !== requestedStoreIds.length) {
      res.status(400).json({ ok: false, message: "One or more selected stores do not belong to the chosen region." });
      return;
    }
  }
  const overrideModules = moduleKeys(input.moduleAccessOverride);

  const plainPwd = String(input.password ?? "").trim() || "123456";
  const newUser: DemoUser = {
    id: createId("user"),
    employeeCode: employeeCode || normalizeEmployeeCode(createId("emp")),
    email: email || `${createId("user")}@directory.local`,
    password: hashPassword(plainPwd),
    displayName: input.displayName.trim(),
    role: input.role as UserRole,
    regionId: input.regionId,
    storeId: STORE_ROLES.has(input.role) ? requestedStoreIds[0] ?? null : null,
    storeIds: STORE_ROLES.has(input.role) ? requestedStoreIds : [],
    technicianProfileId: null,
    canLogin,
    moduleAccessOverride: overrideModules,
    createdAt: new Date().toISOString(),
  };

  await dbPool.query(
    `INSERT INTO app_users (
       id, employee_code, email, password_hash, plain_password, display_name, role, region_id, store_id, technician_profile_id,
       can_login, module_access_override, is_seed
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, false)`,
    [
      newUser.id,
      newUser.employeeCode ?? null,
      newUser.email,
      newUser.password,
      plainPwd,
      newUser.displayName,
      newUser.role,
      newUser.regionId,
      newUser.storeId,
      newUser.technicianProfileId,
      newUser.canLogin !== false,
      JSON.stringify(newUser.moduleAccessOverride ?? null),
    ],
  );
  if (STORE_ROLES.has(newUser.role) && (newUser.storeIds?.length ?? 0) > 0) {
    for (const sid of newUser.storeIds ?? []) {
      await dbPool.query(
        `INSERT INTO user_store_access (user_id, store_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id, store_id) DO NOTHING`,
        [newUser.id, sid],
      );
    }
  }
  await refreshUsersFromDb();
  res.json({ ok: true });
});

app.patch("/api/users/:userId", requireAuth, async (req, res) => {
  const uid = (req as express.Request & { userId: string }).userId;
  const actor = await findUser(uid);
  if (!actor) { res.status(401).json({ error: "Invalid session." }); return; }
  if (actor.role !== "super_admin" && actor.role !== "admin") {
    res.status(403).json({ error: "Only Super Admin or Admin can update users." }); return;
  }
  if (!dbPool) { res.status(503).json({ error: "Database required." }); return; }

  const targetId = String(req.params.userId ?? "").trim();
  const body = req.body as Record<string, unknown>;

  try {
    const { rows: existing } = await dbPool.query<{ region_id: string | null; is_seed: boolean }>(
      `SELECT region_id, is_seed FROM app_users WHERE id = $1::text`,
      [targetId],
    );
    if (!existing.length) { res.status(404).json({ error: "User not found." }); return; }
    const target = existing[0]!;

    if (actor.role === "admin" && target.region_id !== actor.regionId) {
      res.status(403).json({ error: "You can only edit users in your own region." }); return;
    }

    const sets: string[] = [];
    const params: unknown[] = [targetId];

    const push = (col: string, val: unknown) => { params.push(val); sets.push(`${col} = $${params.length}`); };

    if ("displayName" in body) push("display_name", String(body.displayName ?? "").trim());
    if ("email" in body) push("email", String(body.email ?? "").trim().toLowerCase());
    if ("employeeCode" in body) push("employee_code", String(body.employeeCode ?? "").trim().toUpperCase() || null);
    if ("canLogin" in body) push("can_login", Boolean(body.canLogin));
    if ("regionId" in body) push("region_id", String(body.regionId ?? "").trim() || null);
    if ("storeId" in body) push("store_id", String(body.storeId ?? "").trim() || null);
    if ("role" in body) {
      const newRole = String(body.role ?? "") as UserRole;
      if (actor.role === "admin" && (newRole === "super_admin" || newRole === "admin")) {
        res.status(403).json({ error: "Admin cannot assign Super Admin or Admin roles." }); return;
      }
      push("role", newRole);
    }
    if ("moduleAccessOverride" in body) {
      push("module_access_override", body.moduleAccessOverride != null ? JSON.stringify(body.moduleAccessOverride) : null);
    }
    if ("password" in body && String(body.password ?? "").trim().length >= 4) {
      const newPlain = String(body.password).trim();
      push("password_hash", hashPassword(newPlain));
      push("plain_password", newPlain);
    }

    if (sets.length > 0) {
      await dbPool.query(`UPDATE app_users SET ${sets.join(", ")}, updated_at = now() WHERE id = $1::text`, params);
    }

    if ("storeIds" in body && Array.isArray(body.storeIds)) {
      await dbPool.query(`DELETE FROM user_store_access WHERE user_id = $1::text`, [targetId]);
      for (const sid of body.storeIds as string[]) {
        await dbPool.query(
          `INSERT INTO user_store_access (user_id, store_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [targetId, sid],
        );
      }
    }

    await refreshUsersFromDb();
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not update user." });
  }
});

app.get("/api/settings/workflow-statuses", requireAuth, async (req, res) => {
  if (!dbPool) {
    res.status(503).json({ error: "Database is required." });
    return;
  }
  const uid = (req as express.Request & { userId: string }).userId;
  const actor = findUser(uid);
  if (!actor) {
    res.status(401).json({ error: "Invalid session." });
    return;
  }
  if (actor.role !== "super_admin" && actor.role !== "admin") {
    res.status(403).json({ error: "Forbidden." });
    return;
  }
  const entity = String(req.query.entity ?? "pr_flow").trim() || "pr_flow";
  try {
    const { rows } = await dbPool.query(
      `SELECT id, entity, code, label, sort_order AS "sortOrder", is_active AS "isActive", updated_at AS "updatedAt"
       FROM workflow_status_definitions
       WHERE entity = $1
       ORDER BY sort_order, label`,
      [entity],
    );
    res.json({ rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load workflow statuses." });
  }
});

app.post("/api/settings/workflow-statuses", requireAuth, async (req, res) => {
  if (!dbPool) {
    res.status(503).json({ error: "Database is required." });
    return;
  }
  const uid = (req as express.Request & { userId: string }).userId;
  const actor = findUser(uid);
  if (!actor || (actor.role !== "super_admin" && actor.role !== "admin")) {
    res.status(403).json({ error: "Only admin can create statuses." });
    return;
  }
  const entity = String(req.body?.entity ?? "pr_flow").trim() || "pr_flow";
  const code = String(req.body?.code ?? "").trim().toUpperCase();
  const label = String(req.body?.label ?? "").trim();
  const sortOrder = Number.isFinite(Number(req.body?.sortOrder)) ? Number(req.body.sortOrder) : 0;
  if (!code || !label) {
    res.status(400).json({ error: "code and label are required." });
    return;
  }
  try {
    const { rows } = await dbPool.query(
      `INSERT INTO workflow_status_definitions (entity, code, label, sort_order)
       VALUES ($1, $2, $3, $4)
       RETURNING id, entity, code, label, sort_order AS "sortOrder", is_active AS "isActive", updated_at AS "updatedAt"`,
      [entity, code, label, sortOrder],
    );
    res.json({ row: rows[0] });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: "Could not create workflow status (maybe duplicate code)." });
  }
});

app.patch("/api/settings/workflow-statuses/:id", requireAuth, async (req, res) => {
  if (!dbPool) {
    res.status(503).json({ error: "Database is required." });
    return;
  }
  const uid = (req as express.Request & { userId: string }).userId;
  const actor = findUser(uid);
  if (!actor || (actor.role !== "super_admin" && actor.role !== "admin")) {
    res.status(403).json({ error: "Only admin can update statuses." });
    return;
  }
  const id = req.params.id;
  const label = req.body?.label !== undefined ? String(req.body.label ?? "").trim() : undefined;
  const sortOrder = req.body?.sortOrder !== undefined ? Number(req.body.sortOrder) : undefined;
  const isActive = req.body?.isActive !== undefined ? Boolean(req.body.isActive) : undefined;
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (label !== undefined) {
    if (!label) {
      res.status(400).json({ error: "label cannot be empty." });
      return;
    }
    sets.push(`label = $${i++}`);
    values.push(label);
  }
  if (sortOrder !== undefined && Number.isFinite(sortOrder)) {
    sets.push(`sort_order = $${i++}`);
    values.push(sortOrder);
  }
  if (isActive !== undefined) {
    sets.push(`is_active = $${i++}`);
    values.push(isActive);
  }
  if (sets.length === 0) {
    res.status(400).json({ error: "No fields to update." });
    return;
  }
  sets.push("updated_at = now()");
  values.push(id);
  try {
    const { rows } = await dbPool.query(
      `UPDATE workflow_status_definitions
       SET ${sets.join(", ")}
       WHERE id = $${i}::uuid
       RETURNING id, entity, code, label, sort_order AS "sortOrder", is_active AS "isActive", updated_at AS "updatedAt"`,
      values,
    );
    if (rows.length === 0) {
      res.status(404).json({ error: "Status not found." });
      return;
    }
    res.json({ row: rows[0] });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: "Could not update status." });
  }
});

app.delete("/api/settings/workflow-statuses/:id", requireAuth, async (req, res) => {
  if (!dbPool) {
    res.status(503).json({ error: "Database is required." });
    return;
  }
  const uid = (req as express.Request & { userId: string }).userId;
  const actor = findUser(uid);
  if (!actor || (actor.role !== "super_admin" && actor.role !== "admin")) {
    res.status(403).json({ error: "Only admin can delete statuses." });
    return;
  }
  try {
    const del = await dbPool.query("DELETE FROM workflow_status_definitions WHERE id = $1::uuid", [req.params.id]);
    if (del.rowCount === 0) {
      res.status(404).json({ error: "Status not found." });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: "Could not delete status." });
  }
});

function parseStoreInvoiceFieldsFromBody(body: Record<string, unknown>) {
  const rawCode = String(body.invoiceNumberStoreCode ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 16);
  return {
    invoiceDisplayName: String(body.invoiceDisplayName ?? "").trim().slice(0, 280),
    invoiceTagline: String(body.invoiceTagline ?? "").trim().slice(0, 160),
    invoiceAddress: String(body.invoiceAddress ?? "").trim().slice(0, 4000),
    invoicePhone: String(body.invoicePhone ?? "").trim().slice(0, 120),
    invoiceEmail: String(body.invoiceEmail ?? "").trim().slice(0, 200),
    invoiceGstin: String(body.invoiceGstin ?? "").trim().slice(0, 24),
    invoiceLegalEntityName: String(body.invoiceLegalEntityName ?? "").trim().slice(0, 280),
    invoiceTerms: String(body.invoiceTerms ?? "").trim().slice(0, 12000),
    invoiceNumberStoreCode: rawCode,
  };
}

app.get("/api/regions", requireAuth, (_req, res) => {
  if (!dbPool) {
    const state = readState();
    res.json({ regions: state.regions ?? [] });
    return;
  }
  void (async () => {
    try {
      const { rows } = await dbPool.query<{
        region_id: string; region_name: string;
        region_code: string; region_address: string;
        region_address_json: unknown;
        region_gst: string; region_pan: string;
        region_email: string; region_phone: string;
        store_id: string | null; store_name: string | null;
        invoice_display_name: string | null; invoice_tagline: string | null;
        invoice_address: string | null; invoice_phone: string | null;
        invoice_email: string | null; invoice_gstin: string | null;
        invoice_legal_entity_name: string | null; invoice_terms: string | null;
        invoice_number_store_code: string | null;
      }>(
        `SELECT r.id AS region_id, r.name AS region_name,
                COALESCE(r.region_code,'') AS region_code,
                COALESCE(r.address,'') AS region_address,
                r.address_json AS region_address_json,
                COALESCE(r.gst,'') AS region_gst,
                COALESCE(r.pan,'') AS region_pan,
                COALESCE(r.email,'') AS region_email,
                COALESCE(r.phone,'') AS region_phone,
                s.id AS store_id, s.name AS store_name,
                s.invoice_display_name, s.invoice_tagline, s.invoice_address,
                s.invoice_phone, s.invoice_email, s.invoice_gstin,
                s.invoice_legal_entity_name, s.invoice_terms,
                s.invoice_number_store_code
         FROM regions r
         LEFT JOIN stores s ON s.region_id = r.id
         ORDER BY r.name, s.name`,
      );
      const { rows: whRows } = await dbPool.query<{
        id: string; region_id: string; name: string;
        address: string; phone: string; email: string;
      }>(
        `SELECT id, region_id, name,
                COALESCE(address,'') AS address,
                COALESCE(phone,'') AS phone,
                COALESCE(email,'') AS email
         FROM warehouses ORDER BY name`,
      );
      const map = new Map<string, SeedRegion>();
      for (const row of rows) {
        if (!map.has(row.region_id)) {
          map.set(row.region_id, {
            id: row.region_id, name: row.region_name,
            regionCode: row.region_code || undefined,
            address: row.region_address || undefined,
            addressJson: row.region_address_json ?? undefined,
            gst: row.region_gst || undefined,
            pan: row.region_pan || undefined,
            email: row.region_email || undefined,
            phone: row.region_phone || undefined,
            stores: [], warehouses: [],
          });
        }
        if (row.store_id && row.store_name) {
          map.get(row.region_id)!.stores.push({
            id: row.store_id, name: row.store_name,
            invoiceDisplayName: String(row.invoice_display_name ?? "").trim() || undefined,
            invoiceTagline: String(row.invoice_tagline ?? "").trim() || undefined,
            invoiceAddress: String(row.invoice_address ?? "").trim() || undefined,
            invoicePhone: String(row.invoice_phone ?? "").trim() || undefined,
            invoiceEmail: String(row.invoice_email ?? "").trim() || undefined,
            invoiceGstin: String(row.invoice_gstin ?? "").trim() || undefined,
            invoiceLegalEntityName: String(row.invoice_legal_entity_name ?? "").trim() || undefined,
            invoiceTerms: String(row.invoice_terms ?? "").trim() || undefined,
            invoiceNumberStoreCode: String(row.invoice_number_store_code ?? "").trim() || undefined,
          });
        }
      }
      for (const wh of whRows) {
        const reg = map.get(wh.region_id);
        if (reg) {
          reg.warehouses.push({
            id: wh.id, name: wh.name,
            address: wh.address || undefined,
            phone: wh.phone || undefined,
            email: wh.email || undefined,
          });
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
  const uid = (req as express.Request & { userId: string }).userId;
  const actor = findUser(uid);
  if (!actor) {
    res.status(401).json({ error: "Invalid session." });
    return;
  }
  if (actor.role !== "super_admin" && actor.role !== "admin") {
    res.status(403).json({ error: "Only super/regional admins can manage regions." });
    return;
  }
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
        const inv = parseStoreInvoiceFieldsFromBody(store as unknown as Record<string, unknown>);
        await client.query(
          `INSERT INTO stores (id, region_id, name, invoice_display_name, invoice_tagline, invoice_address, invoice_phone, invoice_email, invoice_gstin, invoice_legal_entity_name, invoice_terms, invoice_number_store_code)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            store.id,
            region.id,
            store.name,
            inv.invoiceDisplayName,
            inv.invoiceTagline,
            inv.invoiceAddress,
            inv.invoicePhone,
            inv.invoiceEmail,
            inv.invoiceGstin,
            inv.invoiceLegalEntityName,
            inv.invoiceTerms,
            inv.invoiceNumberStoreCode,
          ],
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
  const uid = (req as express.Request & { userId: string }).userId;
  const actor = findUser(uid);
  if (!actor) {
    res.status(401).json({ error: "Invalid session." });
    return;
  }
  if (actor.role !== "super_admin" && actor.role !== "admin") {
    res.status(403).json({ error: "Only super/regional admins can manage regions." });
    return;
  }
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
    const regionCode = String(req.body?.regionCode ?? "").trim().toUpperCase();
    const address = String(req.body?.address ?? "").trim();
    const addressJson = req.body?.addressJson ?? null;
    const gst = String(req.body?.gst ?? "").trim().toUpperCase();
    const pan = String(req.body?.pan ?? "").trim().toUpperCase();
    const email = String(req.body?.email ?? "").trim();
    const phone = String(req.body?.phone ?? "").trim();
    await dbPool.query(
      `INSERT INTO regions (id, name, region_code, address, address_json, gst, pan, email, phone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, name, regionCode, address, addressJson ? JSON.stringify(addressJson) : null, gst, pan, email, phone],
    );
    res.json({
      region: {
        id, name,
        regionCode: regionCode || undefined,
        address: address || undefined,
        addressJson: addressJson ?? undefined,
        gst: gst || undefined,
        pan: pan || undefined,
        email: email || undefined,
        phone: phone || undefined,
        stores: [], warehouses: [],
      } satisfies SeedRegion,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not create region." });
  }
});

app.patch("/api/regions/:regionId", requireAuth, async (req, res) => {
  const uid = (req as express.Request & { userId: string }).userId;
  const actor = findUser(uid);
  if (!actor) { res.status(401).json({ error: "Invalid session." }); return; }
  if (actor.role !== "super_admin" && actor.role !== "admin") {
    res.status(403).json({ error: "Only super/regional admins can update regions." }); return;
  }
  const regionId = String(req.params.regionId ?? "").trim();
  if (actor.role === "admin" && actor.regionId !== regionId) {
    res.status(403).json({ error: "You can only update your own region." }); return;
  }
  if (!dbPool) { res.status(503).json({ error: "Database required." }); return; }
  try {
    const body = req.body as Record<string, unknown>;
    const name = "name" in body ? String(body.name ?? "").trim() : null;
    if (name !== null && !name) { res.status(400).json({ error: "Region name cannot be empty." }); return; }
    const addressJsonVal = "addressJson" in body
      ? (body.addressJson != null ? JSON.stringify(body.addressJson) : null)
      : undefined;
    await dbPool.query(
      `UPDATE regions SET
         name = COALESCE($2, name),
         region_code = COALESCE($3, region_code),
         address = COALESCE($4, address),
         address_json = CASE WHEN $5::text IS NOT NULL THEN $5::jsonb ELSE address_json END,
         gst = COALESCE($6, gst),
         pan = COALESCE($7, pan),
         email = COALESCE($8, email),
         phone = COALESCE($9, phone)
       WHERE id = $1::text`,
      [
        regionId,
        name,
        "regionCode" in body ? String(body.regionCode ?? "").trim().toUpperCase() : null,
        "address" in body ? String(body.address ?? "").trim() : null,
        addressJsonVal ?? null,
        "gst" in body ? String(body.gst ?? "").trim().toUpperCase() : null,
        "pan" in body ? String(body.pan ?? "").trim().toUpperCase() : null,
        "email" in body ? String(body.email ?? "").trim() : null,
        "phone" in body ? String(body.phone ?? "").trim() : null,
      ],
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not update region." });
  }
});

app.post("/api/regions/:regionId/stores", requireAuth, async (req, res) => {
  const uid = (req as express.Request & { userId: string }).userId;
  const actor = findUser(uid);
  if (!actor) {
    res.status(401).json({ error: "Invalid session." });
    return;
  }
  if (actor.role !== "super_admin" && actor.role !== "admin") {
    res.status(403).json({ error: "Only super/regional admins can manage regions." });
    return;
  }
  const regionId = req.params.regionId;
  if (actor.role === "admin" && actor.regionId !== regionId) {
    res.status(403).json({ error: "You can only add stores in your own region." });
    return;
  }
  const name = String(req.body?.name ?? "").trim();
  if (!name) {
    res.status(400).json({ error: "Store name is required." });
    return;
  }
  const inv = parseStoreInvoiceFieldsFromBody(req.body as Record<string, unknown>);
  if (!dbPool) {
    const store: SeedStore = { id: createId("store"), name, ...inv };
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
    const ins = await dbPool.query<{
      id: string;
      name: string;
      invoice_display_name: string | null;
      invoice_tagline: string | null;
      invoice_address: string | null;
      invoice_phone: string | null;
      invoice_email: string | null;
      invoice_gstin: string | null;
      invoice_legal_entity_name: string | null;
      invoice_terms: string | null;
      invoice_number_store_code: string | null;
    }>(
      `INSERT INTO stores (id, region_id, name, invoice_display_name, invoice_tagline, invoice_address, invoice_phone, invoice_email, invoice_gstin, invoice_legal_entity_name, invoice_terms, invoice_number_store_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, name, invoice_display_name, invoice_tagline, invoice_address, invoice_phone, invoice_email, invoice_gstin, invoice_legal_entity_name, invoice_terms, invoice_number_store_code`,
      [
        id,
        regionId,
        name,
        inv.invoiceDisplayName,
        inv.invoiceTagline,
        inv.invoiceAddress,
        inv.invoicePhone,
        inv.invoiceEmail,
        inv.invoiceGstin,
        inv.invoiceLegalEntityName,
        inv.invoiceTerms,
        inv.invoiceNumberStoreCode,
      ],
    );
    const r = ins.rows[0]!;
    const store: SeedStore = {
      id: r.id,
      name: r.name,
      invoiceDisplayName: String(r.invoice_display_name ?? "").trim() || undefined,
      invoiceTagline: String(r.invoice_tagline ?? "").trim() || undefined,
      invoiceAddress: String(r.invoice_address ?? "").trim() || undefined,
      invoicePhone: String(r.invoice_phone ?? "").trim() || undefined,
      invoiceEmail: String(r.invoice_email ?? "").trim() || undefined,
      invoiceGstin: String(r.invoice_gstin ?? "").trim() || undefined,
      invoiceLegalEntityName: String(r.invoice_legal_entity_name ?? "").trim() || undefined,
      invoiceTerms: String(r.invoice_terms ?? "").trim() || undefined,
      invoiceNumberStoreCode: String(r.invoice_number_store_code ?? "").trim() || undefined,
    };
    res.json({ store });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not create store." });
  }
});

app.patch("/api/stores/:storeId", requireAuth, async (req, res) => {
  const uid = (req as express.Request & { userId: string }).userId;
  const actor = findUser(uid);
  if (!actor) {
    res.status(401).json({ error: "Invalid session." });
    return;
  }
  if (actor.role !== "super_admin" && actor.role !== "admin") {
    res.status(403).json({ error: "Only super/regional admins can update store invoice details." });
    return;
  }
  const storeId = String(req.params.storeId ?? "").trim();
  if (!storeId) {
    res.status(400).json({ error: "Store id required." });
    return;
  }
  if (!dbPool) {
    const inv = parseStoreInvoiceFieldsFromBody(req.body as Record<string, unknown>);
    await mutate((s) => {
      const regions = (s.regions ?? []).map((r) => ({
        ...r,
        stores: r.stores.map((st) =>
          st.id === storeId
            ? {
                ...st,
                ...(String(req.body?.name ?? "").trim() ? { name: String(req.body.name).trim().slice(0, 160) } : {}),
                ...inv,
              }
            : st,
        ),
      }));
      return { next: { ...s, regions }, result: undefined };
    });
    const state = readState();
    const flat = (state.regions ?? []).flatMap((r) => r.stores);
    const st = flat.find((x) => x.id === storeId);
    res.json({ store: st ?? { id: storeId, name: "" } });
    return;
  }
  try {
    const r0 = await dbPool.query<{ region_id: string }>(`SELECT region_id FROM stores WHERE id = $1::text`, [storeId]);
    if (r0.rows.length === 0) {
      res.status(404).json({ error: "Store not found." });
      return;
    }
    const storeRegionId = r0.rows[0]!.region_id;
    if (actor.role === "admin" && actor.regionId !== storeRegionId) {
      res.status(403).json({ error: "You can only update stores in your own region." });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const inv = parseStoreInvoiceFieldsFromBody(body);
    const nextName = "name" in body ? String(body.name ?? "").trim().slice(0, 160) : null;
    if (nextName !== null && !nextName) {
      res.status(400).json({ error: "Store name cannot be empty." });
      return;
    }
    const ins = await dbPool.query<{
      id: string;
      name: string;
      invoice_display_name: string | null;
      invoice_tagline: string | null;
      invoice_address: string | null;
      invoice_phone: string | null;
      invoice_email: string | null;
      invoice_gstin: string | null;
      invoice_legal_entity_name: string | null;
      invoice_terms: string | null;
      invoice_number_store_code: string | null;
    }>(
      `UPDATE stores SET
         name = COALESCE($2, name),
         invoice_display_name = $3,
         invoice_tagline = $4,
         invoice_address = $5,
         invoice_phone = $6,
         invoice_email = $7,
         invoice_gstin = $8,
         invoice_legal_entity_name = $9,
         invoice_terms = $10,
         invoice_number_store_code = $11
       WHERE id = $1::text
       RETURNING id, name, invoice_display_name, invoice_tagline, invoice_address, invoice_phone, invoice_email, invoice_gstin, invoice_legal_entity_name, invoice_terms, invoice_number_store_code`,
      [
        storeId,
        nextName,
        inv.invoiceDisplayName,
        inv.invoiceTagline,
        inv.invoiceAddress,
        inv.invoicePhone,
        inv.invoiceEmail,
        inv.invoiceGstin,
        inv.invoiceLegalEntityName,
        inv.invoiceTerms,
        inv.invoiceNumberStoreCode,
      ],
    );
    if (ins.rows.length === 0) {
      res.status(404).json({ error: "Store not found." });
      return;
    }
    const r = ins.rows[0]!;
    const store: SeedStore = {
      id: r.id,
      name: r.name,
      invoiceDisplayName: String(r.invoice_display_name ?? "").trim() || undefined,
      invoiceTagline: String(r.invoice_tagline ?? "").trim() || undefined,
      invoiceAddress: String(r.invoice_address ?? "").trim() || undefined,
      invoicePhone: String(r.invoice_phone ?? "").trim() || undefined,
      invoiceEmail: String(r.invoice_email ?? "").trim() || undefined,
      invoiceGstin: String(r.invoice_gstin ?? "").trim() || undefined,
      invoiceLegalEntityName: String(r.invoice_legal_entity_name ?? "").trim() || undefined,
      invoiceTerms: String(r.invoice_terms ?? "").trim() || undefined,
      invoiceNumberStoreCode: String(r.invoice_number_store_code ?? "").trim() || undefined,
    };
    res.json({ store });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not update store." });
  }
});

app.post("/api/regions/:regionId/warehouses", requireAuth, async (req, res) => {
  const uid = (req as express.Request & { userId: string }).userId;
  const actor = findUser(uid);
  if (!actor) { res.status(401).json({ error: "Invalid session." }); return; }
  if (actor.role !== "super_admin" && actor.role !== "admin") {
    res.status(403).json({ error: "Only super/regional admins can add warehouses." }); return;
  }
  const regionId = String(req.params.regionId ?? "").trim();
  if (actor.role === "admin" && actor.regionId !== regionId) {
    res.status(403).json({ error: "You can only add warehouses in your own region." }); return;
  }
  const name = String(req.body?.name ?? "").trim();
  if (!name) { res.status(400).json({ error: "Warehouse name is required." }); return; }
  if (!dbPool) { res.status(503).json({ error: "Database required." }); return; }
  try {
    const id = createId("wh");
    const address = String(req.body?.address ?? "").trim();
    const phone = String(req.body?.phone ?? "").trim();
    const email = String(req.body?.email ?? "").trim();
    await dbPool.query(
      `INSERT INTO warehouses (id, region_id, name, address, phone, email)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, regionId, name, address, phone, email],
    );
    res.json({
      warehouse: {
        id, name,
        address: address || undefined,
        phone: phone || undefined,
        email: email || undefined,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not create warehouse." });
  }
});

app.patch("/api/warehouses/:warehouseId", requireAuth, async (req, res) => {
  const uid = (req as express.Request & { userId: string }).userId;
  const actor = findUser(uid);
  if (!actor) { res.status(401).json({ error: "Invalid session." }); return; }
  if (actor.role !== "super_admin" && actor.role !== "admin") {
    res.status(403).json({ error: "Only super/regional admins can update warehouses." }); return;
  }
  const warehouseId = String(req.params.warehouseId ?? "").trim();
  if (!dbPool) { res.status(503).json({ error: "Database required." }); return; }
  try {
    const body = req.body as Record<string, unknown>;
    const name = "name" in body ? String(body.name ?? "").trim() : null;
    if (name !== null && !name) { res.status(400).json({ error: "Warehouse name cannot be empty." }); return; }
    const result = await dbPool.query(
      `UPDATE warehouses SET
         name = COALESCE($2, name),
         address = COALESCE($3, address),
         phone = COALESCE($4, phone),
         email = COALESCE($5, email)
       WHERE id = $1::text
       RETURNING id, name, address, phone, email`,
      [
        warehouseId,
        name,
        "address" in body ? String(body.address ?? "").trim() : null,
        "phone" in body ? String(body.phone ?? "").trim() : null,
        "email" in body ? String(body.email ?? "").trim() : null,
      ],
    );
    if (result.rowCount === 0) { res.status(404).json({ error: "Warehouse not found." }); return; }
    const r = result.rows[0] as Record<string, unknown>;
    res.json({ warehouse: { id: r.id, name: r.name, address: r.address || undefined, phone: r.phone || undefined, email: r.email || undefined } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not update warehouse." });
  }
});

app.get("/api/inventory/prs", requireAuth, async (req, res) => {
  if (!dbPool) {
    res.status(503).json({ error: "Database is required for PR module." });
    return;
  }
  const uid = (req as express.Request & { userId: string }).userId;
  const actor = await findUser(uid);
  if (!actor) {
    res.status(401).json({ error: "Invalid session." });
    return;
  }
  if (!actor.regionId && actor.role !== "super_admin" && actor.role !== "admin") {
    res.status(400).json({ error: "User region not configured." });
    return;
  }
  if (!STORE_ROLES.has(actor.role) && !HO_VIEWER_ROLES.has(actor.role)) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }
  try {
    const params: unknown[] = [];
    let where = "";
    if (STORE_ROLES.has(actor.role)) {
      params.push(actor.storeId);
      where = "WHERE pr.store_id = $1::text";
    } else if (actor.role === "admin" || actor.role === "ho_manager" || actor.role === "ho_purchase") {
      params.push(actor.regionId);
      where = "WHERE pr.region_id = $1::text AND pr.status <> 'DRAFT'";
    }
    const { rows } = await dbPool.query(
      `SELECT pr.id,
              pr.pr_number AS "prNumber",
              pr.region_id AS "regionId",
              r.name AS "regionName",
              pr.store_id AS "storeId",
              st.name AS "storeName",
              pr.status,
              pr.internal_status_code AS "internalStatusCode",
              pr.internal_status_label AS "internalStatusLabel",
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
       JOIN regions r ON r.id = pr.region_id
       JOIN stores st ON st.id = pr.store_id
       LEFT JOIN purchase_request_items pri ON pri.pr_id = pr.id
       ${where}
       GROUP BY pr.id, r.name, st.name
       ORDER BY pr.created_at DESC`,
      params,
    );
    res.json({ prs: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load PRs." });
  }
});

app.get("/api/inventory/prs/:prId/ho-stock", requireAuth, async (req, res) => {
  if (!dbPool) {
    res.status(503).json({ error: "Database is required for PR module." });
    return;
  }
  const uid = (req as express.Request & { userId: string }).userId;
  const actor = findUser(uid);
  if (!actor) {
    res.status(401).json({ error: "Invalid session." });
    return;
  }
  if (!HO_VIEWER_ROLES.has(actor.role)) {
    res.status(403).json({ error: "Only HO roles can view HO stock for fulfill." });
    return;
  }
  const prId = String(req.params.prId ?? "").trim();
  try {
    const prRes = await dbPool.query<{ region_id: string }>(
      `SELECT region_id FROM purchase_requests WHERE id = $1::uuid`,
      [prId],
    );
    const pr = prRes.rows[0];
    if (!pr) {
      res.status(404).json({ error: "PR not found." });
      return;
    }
    if ((actor.role === "admin" || actor.role === "ho_manager" || actor.role === "ho_purchase") && actor.regionId !== pr.region_id) {
      res.status(403).json({ error: "Region mismatch." });
      return;
    }
    const { rows } = await dbPool.query<{
      itemId: string;
      spareId: string;
      hoAvailable: number;
    }>(
      `SELECT pri.id AS "itemId",
              pri.spare_id AS "spareId",
              COALESCE(st.quantity::float8, 0) AS "hoAvailable"
       FROM purchase_request_items pri
       LEFT JOIN spare_stock st
         ON st.spare_id = pri.spare_id
        AND st.location_key = $2
       WHERE pri.pr_id = $1::uuid`,
      [prId, `HO:${pr.region_id}`],
    );
    res.json({ rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load HO stock for PR." });
  }
});

app.post("/api/inventory/prs", requireAuth, async (req, res) => {
  if (!dbPool) {
    res.status(503).json({ error: "Database is required for PR module." });
    return;
  }
  const uid = (req as express.Request & { userId: string }).userId;
  const actor = await findUser(uid);
  if (!actor) {
    res.status(401).json({ error: "Invalid session." });
    return;
  }
  if (!PR_CREATOR_ROLES.has(actor.role) || !actor.regionId || !actor.storeId) {
    res.status(403).json({ error: "Only store users and store managers can create PRs." });
    return;
  }

  const body = req.body as {
    neededBy?: string | null;
    notes?: string;
    items?: Array<{ spareId: string; qty: number; reason?: string }>;
  };
  // All PRs go directly to HO — no store-level approval step
  const status = "SUBMITTED";
  const neededBy = body.neededBy?.trim() || null;
  const notes = String(body.notes ?? "").trim();
  if (neededBy) {
    const m = neededBy.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) {
      res.status(400).json({ error: "Invalid needed-by date." });
      return;
    }
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const picked = new Date(y, mo - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    picked.setHours(0, 0, 0, 0);
    if (picked.getTime() < today.getTime()) {
      res.status(400).json({ error: "Needed-by date cannot be in the past." });
      return;
    }
  }
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
    const { prefix, suffix } = await getSeriesPrefixSuffix(client, "pr");
    const prNumber = await nextDocNumber(client, prefix, suffix, storeCode);
    const createdLabel = await getPrFlowLabel(dbPool, "PR_CREATED");
    const ins = await client.query<{ id: string; prNumber: string }>(
      `INSERT INTO purchase_requests (pr_number, region_id, store_id, status, internal_status_code, internal_status_label, needed_by, notes, created_by, modified_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
       RETURNING id, pr_number AS "prNumber"`,
      [prNumber, actor.regionId, actor.storeId, status, "PR_CREATED", createdLabel, neededBy, notes, actor.id],
    );
    const prId = ins.rows[0]!.id;
    for (const item of items) {
      await client.query(
        `INSERT INTO purchase_request_items (pr_id, spare_id, qty, reason, created_by, modified_by)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $5)`,
        [prId, item.spareId, Number(item.qty), String(item.reason ?? "").trim(), actor.id],
      );
    }
    await appendPrStatusHistory(client, {
      prId,
      statusCode: "PR_CREATED",
      statusLabel: createdLabel,
      changedBy: actor.id,
      note: "PR created at store.",
    });
    await client.query("COMMIT");

    // Notify HO managers & admins in the same region
    const hoManagerIds = allUsers()
      .filter(
        (u) =>
          (u.role === "ho_manager" || u.role === "admin" || u.role === "super_admin") &&
          (u.regionId === actor.regionId || u.role === "super_admin"),
      )
      .map((u) => u.id);
    await pushNotifications(hoManagerIds, {
      title: "New Purchase Request — Awaiting Approval",
      message: `PR ${prNumber} raised by ${actor.displayName ?? "Store"} (${storeName}) is waiting for your approval.`,
      category: "inventory_pr",
    });

    res.json({ ok: true, id: prId, prNumber: ins.rows[0]!.prNumber, status });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(e);
    res.status(400).json({ error: "Could not create PR." });
  } finally {
    client.release();
  }
});

// Store users can send a reminder notification to HO manager for a pending PR
app.post("/api/inventory/prs/:prId/remind", requireAuth, async (req, res) => {
  if (!dbPool) { res.status(503).json({ error: "DB required." }); return; }
  const uid = (req as express.Request & { userId: string }).userId;
  const actor = await findUser(uid);
  if (!actor) { res.status(401).json({ error: "Invalid session." }); return; }
  if (!STORE_ROLES.has(actor.role)) {
    res.status(403).json({ error: "Only store users can send reminders." });
    return;
  }
  const prId = String(req.params.prId ?? "").trim();
  const pr = await dbPool.query<{ pr_number: string; status: string; region_id: string; store_id: string }>(
    "SELECT pr_number, status, region_id, store_id FROM purchase_requests WHERE id = $1::uuid",
    [prId],
  );
  const row = pr.rows[0];
  if (!row) { res.status(404).json({ error: "PR not found." }); return; }
  if (row.status !== "SUBMITTED") {
    res.status(400).json({ error: "Reminder can only be sent for PRs awaiting approval." });
    return;
  }
  const storeRes = await dbPool.query<{ name: string }>("SELECT name FROM stores WHERE id = $1::text", [row.store_id]);
  const storeName = storeRes.rows[0]?.name ?? row.store_id;
  const hoManagerIds = allUsers()
    .filter(
      (u) =>
        (u.role === "ho_manager" || u.role === "admin" || u.role === "super_admin") &&
        (u.regionId === row.region_id || u.role === "super_admin"),
    )
    .map((u) => u.id);
  await pushNotifications(hoManagerIds, {
    title: `Reminder — PR ${row.pr_number} Awaiting Approval`,
    message: `Reminder from ${actor.displayName ?? "Store"} (${storeName}): PR ${row.pr_number} is still waiting for your approval.`,
    category: "inventory_pr",
  });
  res.json({ ok: true });
});

app.patch("/api/inventory/prs/:prId/status", requireAuth, async (req, res) => {
  if (!dbPool) {
    res.status(503).json({ error: "Database is required for PR module." });
    return;
  }
  const uid = (req as express.Request & { userId: string }).userId;
  const actor = await findUser(uid);
  if (!actor) {
    res.status(401).json({ error: "Invalid session." });
    return;
  }
  const prId = String(req.params.prId ?? "").trim();
  const status = String(req.body?.status ?? "").toUpperCase();
  const allowed = new Set(["APPROVED", "REJECTED"]);
  if (!allowed.has(status)) {
    res.status(400).json({ error: "Invalid status." });
    return;
  }
  try {
    if (!HO_APPROVER_ROLES.has(actor.role)) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
    const current = await dbPool.query<{ status: string; region_id: string; internal_status_code: string }>(
      "SELECT status, region_id, internal_status_code FROM purchase_requests WHERE id = $1::uuid",
      [prId],
    );
    const cur = current.rows[0];
    if (!cur) {
      res.status(404).json({ error: "PR not found." });
      return;
    }
    if ((actor.role === "admin" || actor.role === "ho_manager") && actor.regionId !== cur.region_id) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
    if (cur.status !== "SUBMITTED") {
      res.status(400).json({ error: `HO approval allowed only after store sends PR to HO.` });
      return;
    }
    const nextCode = status === "APPROVED" ? "PR_APPROVED_HO" : "PR_REJECTED_HO";
    const nextLabel = await getPrFlowLabel(dbPool, nextCode);
    const upd = await dbPool.query(
      `UPDATE purchase_requests
       SET status = $1,
           internal_status_code = $2,
           internal_status_label = $3,
           updated_at = now(),
           modified_by = $5
       WHERE id = $4::uuid`,
      [status, nextCode, nextLabel, prId, actor.id],
    );
    if (upd.rowCount === 0) {
      res.status(404).json({ error: "PR not found." });
      return;
    }
    await appendPrStatusHistory(dbPool, {
      prId,
      statusCode: nextCode,
      statusLabel: nextLabel,
      changedBy: actor.id,
      note: status === "APPROVED" ? "PR approved by HO." : "PR rejected by HO.",
    });

    // Notify store users/managers of the outcome
    const prDetails = await dbPool.query<{ store_id: string; pr_number: string }>(
      "SELECT store_id, pr_number FROM purchase_requests WHERE id = $1::uuid",
      [prId],
    );
    if (prDetails.rows[0]) {
      const { store_id, pr_number } = prDetails.rows[0];
      const storeUserIds = allUsers()
        .filter((u) => STORE_ROLES.has(u.role) && u.storeId === store_id)
        .map((u) => u.id);
      if (status === "APPROVED") {
        await pushNotifications(storeUserIds, {
          title: `PR ${pr_number} Approved`,
          message: `Your purchase request ${pr_number} has been approved by HO and is now waiting for PO conversion.`,
          category: "inventory_pr",
        });
      } else {
        await pushNotifications(storeUserIds, {
          title: `PR ${pr_number} Rejected`,
          message: `Your purchase request ${pr_number} has been rejected by HO. Please review and raise a new PR if needed.`,
          category: "inventory_pr",
        });
      }
    }

    res.json({ ok: true, status, internalStatusCode: nextCode, internalStatusLabel: nextLabel });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: "Could not update PR status." });
  }
});

app.post("/api/inventory/prs/:prId/store-approve", requireAuth, async (req, res) => {
  if (!dbPool) {
    res.status(503).json({ error: "Database is required for PR module." });
    return;
  }
  const uid = (req as express.Request & { userId: string }).userId;
  const actor = findUser(uid);
  if (!actor || actor.role !== "store_manager" || !actor.storeId) {
    res.status(403).json({ error: "Only Store Manager can approve and send PR to HO." });
    return;
  }
  const prId = String(req.params.prId ?? "").trim();
  const client = await dbPool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query<{ status: string; store_id: string }>(
      `SELECT status, store_id FROM purchase_requests WHERE id = $1::uuid FOR UPDATE`,
      [prId],
    );
    const row = current.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "PR not found." });
      return;
    }
    if (row.store_id !== actor.storeId) {
      await client.query("ROLLBACK");
      res.status(403).json({ error: "You can approve only your store PRs." });
      return;
    }
    if (row.status !== "DRAFT") {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "Only draft PR can be approved and sent to HO." });
      return;
    }
    const approvedLabel = await getPrFlowLabel(dbPool, "PR_APPROVED_STORE");
    const sentLabel = await getPrFlowLabel(dbPool, "PR_SENT_TO_HO");
    await client.query(
      `UPDATE purchase_requests
       SET status = 'SUBMITTED',
           internal_status_code = 'PR_SENT_TO_HO',
           internal_status_label = $2,
           updated_at = now(),
           modified_by = $3
       WHERE id = $1::uuid`,
      [prId, sentLabel, actor.id],
    );
    await appendPrStatusHistory(client, {
      prId,
      statusCode: "PR_APPROVED_STORE",
      statusLabel: approvedLabel,
      changedBy: actor.id,
      note: "PR approved by store manager.",
    });
    await appendPrStatusHistory(client, {
      prId,
      statusCode: "PR_SENT_TO_HO",
      statusLabel: sentLabel,
      changedBy: actor.id,
      note: "PR sent to HO.",
    });
    await client.query("COMMIT");
    res.json({ ok: true, status: "SUBMITTED", internalStatusCode: "PR_SENT_TO_HO", internalStatusLabel: sentLabel });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(e);
    res.status(400).json({ error: "Could not approve/send PR to HO." });
  } finally {
    client.release();
  }
});

app.post("/api/inventory/prs/:prId/fulfill", requireAuth, async (req, res) => {
  if (!dbPool) {
    res.status(503).json({ error: "Database is required for PR module." });
    return;
  }
  const uid = (req as express.Request & { userId: string }).userId;
  const actor = await findUser(uid);
  if (!actor) {
    res.status(401).json({ error: "Invalid session." });
    return;
  }
  const canFulfillPr =
    HO_APPROVER_ROLES.has(actor.role) || actor.role === "ho_purchase";
  if (!canFulfillPr) {
    res.status(403).json({ error: "Only HO Manager or HO Purchase can fulfill PR." });
    return;
  }
  const prId = String(req.params.prId ?? "").trim();
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
    if ((actor.role === "admin" || actor.role === "ho_manager" || actor.role === "ho_purchase") && actor.regionId !== pr.region_id) {
      await client.query("ROLLBACK");
      res.status(403).json({ error: "You can fulfill only your region PR." });
      return;
    }
    const fulfillableStatuses = ["APPROVED", "GOODS_AT_HO", "PARTIAL"];
    if (!fulfillableStatuses.includes(pr.status)) {
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
    // FULFILLED = all items transferred to store; PARTIAL = some; GOODS_AT_HO = goods at HO not yet transferred
    let nextStatus: "GOODS_AT_HO" | "PARTIAL" | "FULFILLED" = "GOODS_AT_HO";
    if (iss >= req && req > 0) nextStatus = "FULFILLED";
    else if (iss > 0) nextStatus = "PARTIAL";
    const internal = derivePrInternalStatus(req, iss, rec);
    const internalLabel = await getPrFlowLabel(dbPool, internal.code);
    await client.query(
      `UPDATE purchase_requests
       SET status = $1,
           internal_status_code = $2,
           internal_status_label = $3,
           updated_at = now(),
           modified_by = $5
       WHERE id = $4::uuid`,
      [nextStatus, internal.code, internalLabel, prId, actor.id],
    );
    await appendPrStatusHistory(client, {
      prId,
      statusCode: internal.code,
      statusLabel: internalLabel || internal.fallbackLabel,
      changedBy: actor.id,
      note: "HO transfer processed.",
    });
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
    res.json({ ok: true, movedQty: movedTotal, status: nextStatus, internalStatusCode: internal.code, internalStatusLabel: internalLabel });
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
  const actor = await findUser(uid);
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
  const recipients = (await allUsers())
    .filter(
      (u) =>
        u.regionId === actor.regionId &&
        (u.role === "admin" || u.role === "service_centre_clerk" || u.role === "service_centre_supervisor"),
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
  const actor = await findUser(uid);
  if (!actor || !STORE_ROLES.has(actor.role) || !actor.storeId || !actor.regionId) {
    res.status(403).json({ error: "Only store roles can inward PR transfer." });
    return;
  }
  const prId = String(req.params.prId ?? "").trim();
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
        const auditRecipients = allUsers()
          .filter(
            (u) =>
              u.regionId === pr.region_id &&
              (u.role === "ho_manager" ||
                u.role === "admin" ||
                u.role === "admin" ||
                u.role === "super_admin"),
          )
          .map((u) => u.id);
        await pushNotifications(auditRecipients, {
          title: "PR inward audit alert",
          message: `${actor.displayName} attempted to inward ${reqQty} units on PR ${pr.pr_number} but only ${pendingReceipt} pending from HO for this line.`,
          category: "inventory_pr",
        });
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
    const internal = derivePrInternalStatus(req, iss, rec);
    const internalLabel = await getPrFlowLabel(dbPool, internal.code);
    await client.query(
      `UPDATE purchase_requests
       SET status = $1,
           internal_status_code = $2,
           internal_status_label = $3,
           updated_at = now(),
           modified_by = $5
       WHERE id = $4::uuid`,
      [nextStatus, internal.code, internalLabel, prId, actor.id],
    );
    await appendPrStatusHistory(client, {
      prId,
      statusCode: internal.code,
      statusLabel: internalLabel || internal.fallbackLabel,
      changedBy: actor.id,
      note: "Store inward completed.",
    });
    await client.query("COMMIT");
    res.json({ ok: true, movedQty: movedTotal, status: nextStatus, internalStatusCode: internal.code, internalStatusLabel: internalLabel });
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
  const actor = await findUser(uid);
  if (!actor || (actor.role !== "super_admin" && actor.role !== "admin")) {
    res.status(403).json({ error: "Only admins can generate allocations." });
    return;
  }
  const regionId = String(req.body?.regionId ?? actor.regionId ?? "").trim();
  if (!regionId) {
    res.status(400).json({ error: "regionId is required." });
    return;
  }
  if (actor.role === "admin" && actor.regionId !== regionId) {
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
  const actor = await findUser(uid);
  if (!actor || (actor.role !== "super_admin" && actor.role !== "admin")) {
    res.status(403).json({ error: "Only admins can confirm allocations." });
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
  if (actor.role === "admin" && actor.regionId !== regionId) {
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
      const internal = derivePrInternalStatus(req, iss, rec);
      const internalLabel = await getPrFlowLabel(dbPool, internal.code);
      await client.query(
        `UPDATE purchase_requests
         SET status = $1,
             internal_status_code = $2,
             internal_status_label = $3,
             updated_at = now(),
             modified_by = $5
         WHERE id = $4::uuid`,
        [nextStatus, internal.code, internalLabel, prId, actor.id],
      );
      await appendPrStatusHistory(client, {
        prId,
        statusCode: internal.code,
        statusLabel: internalLabel || internal.fallbackLabel,
        changedBy: actor.id,
        note: `Auto allocation batch ${batchNumber} transfer.`,
      });
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
  const actor = await findUser(uid);
  if (!actor) {
    res.status(401).json({ error: "Invalid session." });
    return;
  }
  if (
    actor.role !== "super_admin" &&
    actor.role !== "admin" &&
    actor.role !== "admin" &&
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
      cost_price_inr: number | null;
      selling_price_inr: number | null;
      is_active: boolean;
      created_at: Date;
    }>(
      `SELECT id, sku, name, description, category, hsn, mrp_inr, cost_price_inr, selling_price_inr, is_active, created_at
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
    if (actor.role === "admin" && actor.regionId) {
      stockParams.push(actor.regionId);
      stockWhere += ` AND region_id = $${stockParams.length}::text`;
    } else if (actor.role === "store_user" && actor.regionId && actor.storeId) {
      stockParams.push(actor.regionId, actor.storeId);
      stockWhere += ` AND (
        (location_type = 'STORE' AND region_id = $${stockParams.length - 1}::text AND store_id = $${stockParams.length}::text)
        OR (location_type = 'HO' AND region_id = $${stockParams.length - 1}::text)
      )`;
    } else if ((actor.role === "super_admin" || actor.role === "admin") && qRegion) {
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
    if (actor.role === "admin" && actor.regionId) {
      priceParams.push(actor.regionId);
      priceWhere += ` AND (region_id = $${priceParams.length}::text OR region_id IS NULL)`;
    } else if (actor.role === "store_user" && actor.regionId) {
      priceParams.push(actor.regionId);
      priceWhere += ` AND (region_id = $${priceParams.length}::text OR region_id IS NULL)`;
    } else if ((actor.role === "super_admin" || actor.role === "admin") && qRegion) {
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
          costPriceInr: r.cost_price_inr == null ? null : Number(r.cost_price_inr),
          sellingPriceInr:
            r.selling_price_inr == null
              ? r.mrp_inr == null
                ? null
                : Number(r.mrp_inr)
              : Number(r.selling_price_inr),
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

function phoneLast10(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

app.get("/api/countries", (_req, res) => {
  if (!dbPool) {
    res.status(503).json({ error: "Database is required." });
    return;
  }
  void (async () => {
    try {
      const { rows } = await dbPool.query<{ id: string; name: string; sortOrder: number }>(
        `SELECT id, name, sort_order AS "sortOrder" FROM countries ORDER BY sort_order ASC, name ASC`,
      );
      res.json({ countries: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not load countries." });
    }
  })();
});

/**
 * GSTIN → legal / trade name. Uses Sandbox.co.in when key+secret are set, or a custom GET URL + API key;
 * otherwise returns stub demo names (see server/gstLookup.ts).
 */
app.post("/api/gst/lookup", async (req, res) => {
  const gst = String((req.body as { gst?: string })?.gst ?? "")
    .trim()
    .toUpperCase();
  if (!GSTIN_RE.test(gst)) {
    res.status(400).json({ error: "Enter a valid 15-character GSTIN to fetch company name." });
    return;
  }
  try {
    const out = await lookupGstCompany(gst);
    res.json(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "GST lookup failed.";
    console.error("[gst/lookup]", msg);
    res.status(502).json({ error: msg });
  }
});

/** Step 1: start mobile OTP only (email is collected after mobile is verified). */
app.post("/api/customers/register-otp/start-mobile", (req, res) => {
  const primaryPhone = String((req.body as { primaryPhone?: string })?.primaryPhone ?? "").trim();
  const otpPhone = String((req.body as { otpPhone?: string })?.otpPhone ?? "").trim();
  const primaryP10 = phoneLast10(primaryPhone);
  if (primaryP10.length !== 10) {
    res.status(400).json({ error: "Primary mobile must be 10 digits." });
    return;
  }
  const target = otpPhone || primaryPhone;
  const p10 = phoneLast10(target);
  if (p10.length !== 10) {
    res.status(400).json({ error: "Enter a valid 10-digit mobile for OTP (or fill OTP mobile)." });
    return;
  }
  const mobileCode = String(Math.floor(100000 + Math.random() * 900000));
  const sessionId = crypto.randomUUID();
  customerRegisterOtpSessions.set(sessionId, {
    phoneLast10: p10,
    mobileCode,
    mobileVerified: false,
    emailNorm: null,
    emailCode: null,
    emailVerified: false,
    expiresAt: Date.now() + CUSTOMER_OTP_TTL_MS,
  });
  res.json({ sessionId, demoMobileOtp: mobileCode });
});

app.post("/api/customers/register-otp/confirm-mobile", (req, res) => {
  const sessionId = String((req.body as { sessionId?: string })?.sessionId ?? "").trim();
  const otp = String((req.body as { otp?: string })?.otp ?? "").trim();
  if (!sessionId || !otp) {
    res.status(400).json({ error: "Session and mobile OTP are required." });
    return;
  }
  const sess = customerRegisterOtpSessions.get(sessionId);
  if (!sess || sess.expiresAt < Date.now()) {
    res.status(400).json({ error: "OTP session expired. Request a new mobile code." });
    return;
  }
  if (otp !== sess.mobileCode) {
    res.status(400).json({ error: "Incorrect mobile OTP." });
    return;
  }
  sess.mobileVerified = true;
  res.json({ ok: true });
});

app.post("/api/customers/register-otp/start-email", (req, res) => {
  const sessionId = String((req.body as { sessionId?: string })?.sessionId ?? "").trim();
  const email = String((req.body as { email?: string })?.email ?? "")
    .trim()
    .toLowerCase();
  if (!sessionId) {
    res.status(400).json({ error: "Session is required." });
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "Enter a valid email." });
    return;
  }
  const sess = customerRegisterOtpSessions.get(sessionId);
  if (!sess || sess.expiresAt < Date.now()) {
    res.status(400).json({ error: "OTP session expired. Start again from mobile verification." });
    return;
  }
  if (!sess.mobileVerified) {
    res.status(400).json({ error: "Verify mobile OTP before requesting email OTP." });
    return;
  }
  const emailCode = String(Math.floor(100000 + Math.random() * 900000));
  sess.emailNorm = email;
  sess.emailCode = emailCode;
  sess.emailVerified = false;
  res.json({ demoEmailOtp: emailCode });
});

app.post("/api/customers/register-otp/confirm-email", (req, res) => {
  const sessionId = String((req.body as { sessionId?: string })?.sessionId ?? "").trim();
  const otp = String((req.body as { otp?: string })?.otp ?? "").trim();
  if (!sessionId || !otp) {
    res.status(400).json({ error: "Session and email OTP are required." });
    return;
  }
  const sess = customerRegisterOtpSessions.get(sessionId);
  if (!sess || sess.expiresAt < Date.now()) {
    res.status(400).json({ error: "OTP session expired. Request a new email code." });
    return;
  }
  if (!sess.mobileVerified || !sess.emailCode || !sess.emailNorm) {
    res.status(400).json({ error: "Complete mobile verification and request email OTP first." });
    return;
  }
  if (otp !== sess.emailCode) {
    res.status(400).json({ error: "Incorrect email OTP." });
    return;
  }
  sess.emailVerified = true;
  res.json({ ok: true });
});

app.get("/api/customers", (req, res) => {
  if (!dbPool) {
    res.status(503).json({ error: "Database is required." });
    return;
  }
  const id = String(req.query.id ?? "").trim();
  const phone = String(req.query.phone ?? "").trim();
  (async () => {
    try {
      if (id) {
        const { rows } = await dbPool.query(
          `SELECT ${CUSTOMERS_SELECT_FIELDS}
           FROM customers
           WHERE is_active = true AND id = $1::text
           LIMIT 1`,
          [id],
        );
        const row = rows[0];
        const customer: CustomerRecord | null = row ? rowToCustomer(row as Record<string, unknown>) : null;
        res.json({ customer });
        return;
      }
      if (!phone) {
        const { rows } = await dbPool.query(
          `SELECT ${CUSTOMERS_SELECT_FIELDS}
           FROM customers
           WHERE is_active = true
           ORDER BY created_at DESC`,
        );
        const customers: CustomerRecord[] = rows.map((r) => rowToCustomer(r as Record<string, unknown>));
        res.json({ customers });
        return;
      }
      const p10 = phoneLast10(phone);
      const { rows } = await dbPool.query(
        `SELECT ${CUSTOMERS_SELECT_FIELDS}
         FROM customers
         WHERE is_active = true AND phone_last10 = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [p10],
      );
      const row = rows[0];
      const customer: CustomerRecord | null = row ? rowToCustomer(row as Record<string, unknown>) : null;
      res.json({ customer });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not load customers." });
    }
  })();
});

app.post("/api/customers", async (req, res) => {
  if (!dbPool) {
    res.status(503).json({ error: "Database is required." });
    return;
  }
  const uid = await getSessionUserId(req);
  const actor = uid ? findUser(uid) : null;

  type AddrIn = {
    doorNo?: string;
    street?: string;
    city?: string;
    district?: string;
    state?: string;
    countryId?: string;
    pincode?: string;
  };
  const body = req.body as {
    sessionId?: string;
    mobileOtp?: string;
    emailOtp?: string;
    customerKind?: CustomerKind;
    salutation?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    otpPhone?: string;
    alternatePhone?: string;
    telephone?: string;
    email?: string;
    dob?: string | null;
    anniversaryDate?: string | null;
    billingAddress?: AddrIn;
    shippingAddress?: AddrIn;
    sameShippingAsBilling?: boolean;
    b2bTradeDisplayName?: string;
    taxPreference?: "with_tax" | "without_tax_exhibited";
    company?: string;
    gst?: string;
    pan?: string;
    remarkAttention?: string;
    referenceName?: string;
    representativeName?: string;
    additionalAddresses?: AddrIn[];
  };

  function addrOk(a: AddrIn | undefined): boolean {
    if (!a) return false;
    const pin = String(a.pincode ?? "").trim();
    if (pin.length < 4 || pin.length > 12) return false;
    return (
      !!(a.doorNo ?? "").trim() &&
      !!(a.street ?? "").trim() &&
      !!(a.city ?? "").trim() &&
      !!(a.district ?? "").trim() &&
      !!(a.state ?? "").trim() &&
      !!(a.countryId ?? "").trim()
    );
  }

  function normalizeAddrJson(a: AddrIn): Record<string, string> {
    return {
      doorNo: String(a.doorNo ?? "").trim(),
      street: String(a.street ?? "").trim(),
      city: String(a.city ?? "").trim(),
      district: String(a.district ?? "").trim(),
      state: String(a.state ?? "").trim(),
      countryId: String(a.countryId ?? "").trim(),
      pincode: String(a.pincode ?? "").trim(),
    };
  }

  const sessionId = String(body.sessionId ?? "").trim();
  const mobileOtp = String(body.mobileOtp ?? "").trim();
  const emailOtp = String(body.emailOtp ?? "").trim();
  const customerKind = body.customerKind === "B2B" ? "B2B" : "B2C";
  const salutation = String(body.salutation ?? "").trim();
  const firstName = String(body.firstName ?? "").trim();
  const lastName = String(body.lastName ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const p10Primary = phoneLast10(phone);
  const otpPhoneRaw = String(body.otpPhone ?? "").trim();
  const otpDigits = otpPhoneRaw.replace(/\D/g, "");
  const otpPhoneStored =
    otpDigits.length >= 10 && phoneLast10(otpDigits) !== p10Primary ? otpDigits.slice(-10) : null;
  const alternatePhone = body.alternatePhone?.trim() || null;
  const telephone = body.telephone?.trim() || null;
  const email = String(body.email ?? "").trim().toLowerCase();
  const dob = String(body.dob ?? "").trim() || null;
  const anniversaryDate = String(body.anniversaryDate ?? "").trim() || null;
  const billingAddress = body.billingAddress ?? {};
  const sameShip = !!body.sameShippingAsBilling;
  const shippingAddress = sameShip ? { ...billingAddress } : body.shippingAddress ?? {};
  const b2bTradeDisplayName = String(body.b2bTradeDisplayName ?? "").trim();
  const taxPreference =
    customerKind === "B2B"
      ? body.taxPreference === "without_tax_exhibited"
        ? "without_tax_exhibited"
        : "with_tax"
      : null;
  const company = body.company?.trim() || null;
  const gst = body.gst?.trim().toUpperCase() || null;
  const pan = body.pan?.trim().toUpperCase() || null;
  const remarkAttention = body.remarkAttention?.trim() || null;
  const referenceName = body.referenceName?.trim() || null;
  const representativeName = body.representativeName?.trim() || null;

  if (!sessionId || !mobileOtp || !emailOtp) {
    res.status(400).json({ error: "Complete mobile and email OTP verification first." });
    return;
  }
  const sess = customerRegisterOtpSessions.get(sessionId);
  if (!sess || sess.expiresAt < Date.now()) {
    res.status(400).json({ error: "OTP session expired. Request new codes." });
    return;
  }
  if (p10Primary.length !== 10) {
    res.status(400).json({ error: "Valid 10-digit primary mobile is required." });
    return;
  }
  if (!sess.mobileVerified || !sess.emailVerified || !sess.emailNorm || sess.emailCode == null) {
    res.status(400).json({ error: "Complete mobile verification first, then email verification, before saving." });
    return;
  }
  if (sess.phoneLast10 !== phoneLast10(otpPhoneRaw || phone)) {
    res.status(400).json({ error: "Mobile for OTP does not match verification session." });
    return;
  }
  if (sess.emailNorm !== email) {
    res.status(400).json({ error: "Email does not match verification session." });
    return;
  }
  if (mobileOtp !== sess.mobileCode || emailOtp !== sess.emailCode) {
    res.status(400).json({ error: "Incorrect mobile or email OTP." });
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "Valid email is required." });
    return;
  }
  if (customerKind === "B2C") {
    if (!firstName || !lastName) {
      res.status(400).json({ error: "First name and last name are required for B2C." });
      return;
    }
  } else {
    if (!b2bTradeDisplayName) {
      res.status(400).json({ error: "Display name is required for B2B." });
      return;
    }
    if (!company?.trim()) {
      res.status(400).json({ error: "Company name is required for B2B." });
      return;
    }
    if (!gst || !GSTIN_RE.test(gst)) {
      res.status(400).json({ error: "Valid 15-character GSTIN is required for B2B." });
      return;
    }
    if (!pan || !/^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(pan)) {
      res.status(400).json({ error: "Valid PAN is required for B2B." });
      return;
    }
  }
  if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(pan)) {
    res.status(400).json({ error: "Invalid PAN format." });
    return;
  }
  const additionalList: AddrIn[] = Array.isArray(body.additionalAddresses) ? body.additionalAddresses : [];
  for (let i = 0; i < additionalList.length; i++) {
    if (!addrOk(additionalList[i])) {
      res.status(400).json({ error: `Additional address #${i + 1} is incomplete (all fields including PIN).` });
      return;
    }
  }
  const additionalJson = JSON.stringify(additionalList.map((a) => normalizeAddrJson(a)));

  if (!addrOk(billingAddress)) {
    res.status(400).json({ error: "Complete all billing address fields (including country)." });
    return;
  }
  if (!sameShip && !addrOk(shippingAddress)) {
    res.status(400).json({ error: "Complete shipping address or tick same as billing." });
    return;
  }

  const displayName =
    customerKind === "B2B"
      ? b2bTradeDisplayName
      : [salutation, firstName, lastName].filter(Boolean).join(" ").trim();

  const billJson = JSON.stringify(normalizeAddrJson(billingAddress));
  const shipJson = JSON.stringify(normalizeAddrJson(shippingAddress));

  const addressLegacy = [
    `Billing: ${billingAddress.doorNo}, ${billingAddress.street}`,
    `${billingAddress.city}, ${billingAddress.district}, ${billingAddress.state}`,
  ].join("\n");
  const cityLegacy = `${billingAddress.city}, ${billingAddress.district}`.slice(0, 120);

  const id = createId("cust");
  const client = await dbPool.connect();
  try {
    await client.query("BEGIN");
    const customerCode = await nextCustomerCode(client);
    await client.query(
      `INSERT INTO customers (
         id, customer_code, display_name, salutation, first_name, last_name,
         phone, phone_last10, alternate_phone, otp_phone, telephone, email,
         dob, anniversary_date,
         address, city,
         customer_kind, company, gst, pan,
         billing_address, shipping_address,
         tax_preference, b2b_trade_display_name,
         remark_attention, reference_name, representative_name,
         additional_addresses,
         phone_verified_at, email_verified_at, customer_data_source,
         created_by, modified_by
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11, $12,
         $13::date, $14::date,
         $15, $16,
         $17, $18, $19, $20,
         $21::jsonb, $22::jsonb,
         $23, $24,
         $25, $26, $27,
         $28::jsonb,
         now(), now(), 'registered',
         $29, $29
       )`,
      [
        id,
        customerCode,
        displayName,
        salutation || null,
        firstName || null,
        lastName || null,
        phone,
        p10Primary,
        alternatePhone,
        otpPhoneStored,
        telephone,
        email,
        dob,
        anniversaryDate,
        addressLegacy,
        cityLegacy,
        customerKind,
        company,
        gst,
        pan,
        billJson,
        shipJson,
        taxPreference,
        customerKind === "B2B" ? b2bTradeDisplayName : null,
        remarkAttention,
        referenceName,
        representativeName,
        additionalJson,
        actor?.id ?? null,
      ],
    );
    const { rows } = await client.query(
      `SELECT ${CUSTOMERS_SELECT_FIELDS} FROM customers WHERE id = $1`,
      [id],
    );
    await client.query("COMMIT");
    customerRegisterOtpSessions.delete(sessionId);
    const customer = rowToCustomer(rows[0] as Record<string, unknown>);
    res.json({ customer });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    const err = e as { code?: string };
    if (err.code === "23505") {
      res.status(400).json({ error: "Customer with this phone already exists." });
      return;
    }
    console.error(e);
    res.status(500).json({ error: "Could not create customer." });
  } finally {
    client.release();
  }
});

app.put("/api/customers/:id", async (req, res) => {
  if (!dbPool) {
    res.status(503).json({ error: "Database is required." });
    return;
  }
  const uid = await getSessionUserId(req);
  const actor = uid ? findUser(uid) : null;
  const id = String(req.params.id ?? "").trim();
  const body = req.body as {
    displayName: string;
    phone: string;
    alternatePhone?: string;
    email: string;
    address?: string;
    city?: string;
    customerKind: CustomerKind;
    company?: string;
    gst?: string;
    pan?: string;
  };
  const displayName = String(body.displayName ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const alternatePhone = String(body.alternatePhone ?? "").trim() || null;
  const email = String(body.email ?? "").trim();
  const address = String(body.address ?? "").trim() || null;
  const city = String(body.city ?? "").trim() || null;
  const customerKind = body.customerKind;
  const company = String(body.company ?? "").trim() || null;
  const gst = String(body.gst ?? "").trim().toUpperCase() || null;
  const pan = String(body.pan ?? "").trim().toUpperCase() || null;
  if (!id) {
    res.status(400).json({ error: "Customer id is required." });
    return;
  }
  if (!displayName || !phone) {
    res.status(400).json({ error: "displayName and phone are required." });
    return;
  }
  const p10 = phoneLast10(phone);
  if (p10.length !== 10) {
    res.status(400).json({ error: "Valid 10-digit mobile number is required." });
    return;
  }
  try {
    const upd = await dbPool.query(
      `UPDATE customers
       SET display_name = $2,
           phone = $3,
           phone_last10 = $4,
           alternate_phone = $5,
           email = $6,
           address = $7,
           city = $8,
           customer_kind = $9,
           company = $10,
           gst = $11,
           pan = $12,
           modified_by = $13,
           updated_at = now()
       WHERE id = $1`,
      [id, displayName, phone, p10, alternatePhone, email, address, city, customerKind, company, gst, pan, actor?.id ?? null],
    );
    if ((upd.rowCount ?? 0) === 0) {
      res.status(404).json({ error: "Customer not found." });
      return;
    }
    const { rows } = await dbPool.query(
      `SELECT ${CUSTOMERS_SELECT_FIELDS} FROM customers WHERE id = $1`,
      [id],
    );
    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: "Customer not found." });
      return;
    }
    const customer = rowToCustomer(row as Record<string, unknown>);
    res.json({ customer });
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "23505") {
      res.status(400).json({ error: "Customer with this phone already exists." });
      return;
    }
    console.error(e);
    res.status(500).json({ error: "Could not update customer." });
  }
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
    await ensureSeedUsers();
    // Sync password_hash for any user whose plain_password was defaulted to '123456'
    await dbPool.query(
      `UPDATE app_users
       SET password_hash = $1
       WHERE plain_password = '123456'
         AND password_hash <> $1`,
      [hashPassword("123456")],
    );
    await refreshUsersFromDb();
  } catch (e) {
    console.error("PostgreSQL migration failed:", e);
    process.exit(1);
  }
  registerGeoRoutes(app, dbPool);
  registerCatalogRoutes(app, dbPool, requireAuth, (id) => {
    return findUser(id) ?? null;
  });
  registerInventoryPoSupplierRoutes(app, dbPool, requireAuth, (id) => findUser(id), allUsers, pushNotifications);
  registerQuickBillRoutes(app, dbPool, requireAuth, (id) => findUser(id) ?? null);
  registerTaxSettingsRoutes(app, dbPool, requireAuth, (id) => findUser(id) ?? null);
  registerInventoryBulkImportRoutes(app, dbPool, requireAuth, (id) => findUser(id) ?? null);
  registerSrfRoutes(app, dbPool, requireAuth, (id) => findUser(id) ?? null, pushNotifications);
  registerTechnicianRoutes(app, dbPool, requireAuth, (id) => findUser(id) ?? null);

  app.listen(PORT, () => {
    console.log(`Zimson API listening on http://127.0.0.1:${PORT}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
