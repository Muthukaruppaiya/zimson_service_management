import type { Pool } from "pg";
import type { MastersIndiaEdocConfig } from "./mastersIndiaEdoc/types";
import { isValidGstin } from "./mastersIndiaEdoc/types";
import { isSandboxEdocApi, resolveEdocEwayUserGstin, resolveEdocSellerGstin, SANDBOX_EDOC_TEST_GSTIN } from "./mastersIndiaEdoc/config";

/** Stored in `edoc_settings.config` (JSONB). Super-admin only API. */
export type EdocSettingsDb = {
  enabled?: boolean;
  failOpen?: boolean;
  username?: string;
  password?: string;
  ewayUsername?: string;
  ewayPassword?: string;
  apiBase?: string;
  ewayApiBase?: string;
  tokenUrl?: string;
  einvoicePath?: string;
  ewayPath?: string;
  sellerGstinOverride?: string;
  ewayUserGstin?: string;
  ewayNominalValueInr?: number;
  ewayAutoEnabled?: boolean;
};

export type EdocSettingsPublic = {
  enabled: boolean;
  failOpen: boolean;
  apiBase: string;
  ewayApiBase: string;
  tokenUrl: string;
  einvoicePath: string;
  ewayPath: string;
  sellerGstinOverride: string;
  ewayUserGstin: string;
  ewayNominalValueInr: number;
  ewayAutoEnabled: boolean;
  username: string;
  hasPassword: boolean;
  ewayUsername: string;
  hasEwayPassword: boolean;
  configured: boolean;
  configuredFromDatabase: boolean;
  envFallbackActive: boolean;
  sandboxMode: boolean;
  effectiveEwayGstin: string;
  effectiveEinvoiceGstin: string;
  updatedAt: string;
  updatedBy: string | null;
};

const DEFAULT_API_BASE = "https://sandb-api.mastersindia.co";

let poolRef: Pool | null = null;
let dbConfig: EdocSettingsDb = {};
let resolved: MastersIndiaEdocConfig | null = null;
let metaCache = { updatedAt: new Date(0).toISOString(), updatedBy: null as string | null };
let configuredFromDatabase = false;

function trimBase(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Legacy/wrong host from old docs — DNS does not resolve; use main API base. */
function normalizeEwayApiBase(apiBase: string, ewayApiBase: string): string {
  const api = trimBase(apiBase);
  const eway = trimBase(ewayApiBase || api);
  try {
    const host = new URL(eway).hostname.toLowerCase();
    if (host === "sandb-api.edoc.mastersindia.co" || host.endsWith(".edoc.mastersindia.co")) {
      return api;
    }
  } catch {
    return api;
  }
  return eway;
}

/** Common typo: ewayBillGenerate → ewayBillsGenerate (MI returns 401 Invalid Product). */
export function normalizeEwayPath(path: string): string {
  const trimmed = str(path) || "/api/v1/ewayBillsGenerate/";
  const lower = trimmed.toLowerCase().replace(/\/+$/, "");
  if (lower.includes("ewaybillgenerate") && !lower.includes("ewaybillsgenerate")) {
    return "/api/v1/ewayBillsGenerate/";
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function dbHasCredentials(db: EdocSettingsDb): boolean {
  return Boolean(db.username?.trim() && db.password?.trim());
}

function defaultEdocDb(): EdocSettingsDb {
  return {
    enabled: true,
    failOpen: true,
    apiBase: DEFAULT_API_BASE,
    ewayApiBase: DEFAULT_API_BASE,
    tokenUrl: `${DEFAULT_API_BASE}/api/v1/token-auth/`,
    einvoicePath: "/api/v1/einvoice/",
    ewayPath: "/api/v1/ewayBillsGenerate/",
    ewayNominalValueInr: 1000,
    ewayAutoEnabled: false,
  };
}

function resolveMerged(db: EdocSettingsDb): {
  config: MastersIndiaEdocConfig | null;
  fromDb: boolean;
} {
  const defaults = defaultEdocDb();
  const username = str(db.username);
  const password = str(db.password);
  if (!username || !password) {
    return { config: null, fromDb: dbHasCredentials(db) };
  }

  const envApiBase = process.env.EDOC_API_BASE?.trim();
  const apiBase = trimBase(envApiBase || str(db.apiBase) || defaults.apiBase!);
  const sellerOverride = str(db.sellerGstinOverride).toUpperCase();
  const ewayGst = str(db.ewayUserGstin).toUpperCase();

  const config: MastersIndiaEdocConfig = {
    enabled: db.enabled ?? defaults.enabled ?? true,
    failOpen: db.failOpen ?? defaults.failOpen ?? true,
    username,
    password,
    ewayUsername: str(db.ewayUsername) || username,
    ewayPassword: str(db.ewayPassword) || password,
    apiBase,
    ewayApiBase: normalizeEwayApiBase(apiBase, str(db.ewayApiBase) || apiBase),
    tokenUrl: str(db.tokenUrl) || `${apiBase}/api/v1/token-auth/`,
    einvoicePath: str(db.einvoicePath) || defaults.einvoicePath!,
    ewayPath: normalizeEwayPath(str(db.ewayPath) || defaults.ewayPath!),
    sellerGstinOverride: sellerOverride && isValidGstin(sellerOverride) ? sellerOverride : null,
    ewayUserGstin: ewayGst && isValidGstin(ewayGst) ? ewayGst : null,
    ewayNominalValueInr: Math.max(1, Number(db.ewayNominalValueInr ?? defaults.ewayNominalValueInr) || 1000),
    ewayAutoEnabled: db.ewayAutoEnabled ?? defaults.ewayAutoEnabled ?? false,
  };

  return { config, fromDb: dbHasCredentials(db) };
}

function applyCache(db: EdocSettingsDb, row?: { updated_at: Date; updated_by: string | null }): void {
  dbConfig = db;
  const m = resolveMerged(db);
  resolved = m.config;
  configuredFromDatabase = m.fromDb;
  if (row) {
    metaCache = { updatedAt: row.updated_at.toISOString(), updatedBy: row.updated_by };
  }
}

export async function initEdocSettings(pool: Pool): Promise<void> {
  poolRef = pool;
  await pool.query(`INSERT INTO edoc_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);

  const { rows } = await pool.query<{
    config: EdocSettingsDb;
    updated_at: Date;
    updated_by: string | null;
  }>(`SELECT config, updated_at, updated_by FROM edoc_settings WHERE id = 1`);
  const row = rows[0];
  if (!row) {
    applyCache({});
    return;
  }

  const cfg = (row.config && typeof row.config === "object" ? row.config : {}) as EdocSettingsDb;
  applyCache(cfg, row);
}

export async function refreshEdocSettingsCache(): Promise<void> {
  if (!poolRef) return;
  const { rows } = await poolRef.query<{
    config: EdocSettingsDb;
    updated_at: Date;
    updated_by: string | null;
  }>(`SELECT config, updated_at, updated_by FROM edoc_settings WHERE id = 1`);
  const row = rows[0];
  if (!row) {
    applyCache({});
    return;
  }
  applyCache((row.config ?? {}) as EdocSettingsDb, row);
}

export function getResolvedEdocConfig(): MastersIndiaEdocConfig | null {
  if (!resolved) {
    const m = resolveMerged(dbConfig);
    resolved = m.config;
    configuredFromDatabase = m.fromDb;
  }
  return resolved;
}

export function toPublicEdocSettings(): EdocSettingsPublic {
  const cfg = getResolvedEdocConfig();
  const db = dbConfig;
  const defaults = defaultEdocDb();
  const apiBase = trimBase(str(db.apiBase) || defaults.apiBase!);
  const sandboxMode = cfg ? isSandboxEdocApi(cfg) : /sandb-api/i.test(apiBase);
  return {
    enabled: cfg?.enabled ?? db.enabled ?? defaults.enabled ?? true,
    failOpen: cfg?.failOpen ?? db.failOpen ?? defaults.failOpen ?? true,
    apiBase: cfg?.apiBase ?? apiBase,
    ewayApiBase: normalizeEwayApiBase(apiBase, cfg?.ewayApiBase ?? trimBase(str(db.ewayApiBase) || apiBase)),
    tokenUrl: cfg?.tokenUrl ?? (str(db.tokenUrl) || `${apiBase}/api/v1/token-auth/`),
    einvoicePath: cfg?.einvoicePath ?? (str(db.einvoicePath) || defaults.einvoicePath!),
    ewayPath: normalizeEwayPath(cfg?.ewayPath ?? (str(db.ewayPath) || defaults.ewayPath!)),
    sellerGstinOverride: cfg?.sellerGstinOverride ?? str(db.sellerGstinOverride),
    ewayUserGstin: cfg?.ewayUserGstin ?? str(db.ewayUserGstin),
    ewayNominalValueInr: cfg?.ewayNominalValueInr ?? db.ewayNominalValueInr ?? defaults.ewayNominalValueInr ?? 1000,
    ewayAutoEnabled: cfg?.ewayAutoEnabled ?? db.ewayAutoEnabled ?? defaults.ewayAutoEnabled ?? false,
    username: cfg?.username ?? str(db.username),
    hasPassword: Boolean(cfg?.password || db.password),
    ewayUsername: cfg?.ewayUsername ?? (str(db.ewayUsername) || (cfg?.username ?? str(db.username))),
    hasEwayPassword: Boolean(cfg?.ewayPassword || db.ewayPassword || cfg?.password || db.password),
    configured: Boolean(cfg),
    configuredFromDatabase,
    envFallbackActive: false,
    sandboxMode,
    effectiveEwayGstin: cfg ? resolveEdocEwayUserGstin("", cfg) : sandboxMode ? SANDBOX_EDOC_TEST_GSTIN : "",
    effectiveEinvoiceGstin: cfg ? resolveEdocSellerGstin("", "", cfg) : sandboxMode ? SANDBOX_EDOC_TEST_GSTIN : "",
    updatedAt: metaCache.updatedAt,
    updatedBy: metaCache.updatedBy,
  };
}

export async function saveEdocSettings(patch: EdocSettingsDb, updatedBy: string): Promise<EdocSettingsPublic> {
  if (!poolRef) throw new Error("Database not ready.");
  const current = (dbConfig ?? {}) as EdocSettingsDb;
  const next: EdocSettingsDb = { ...current };

  if (patch.enabled !== undefined) next.enabled = patch.enabled;
  if (patch.failOpen !== undefined) next.failOpen = patch.failOpen;
  if (patch.username !== undefined) next.username = patch.username.trim().slice(0, 200);
  if (patch.password !== undefined && patch.password.trim()) next.password = patch.password.trim().slice(0, 500);
  if (patch.ewayUsername !== undefined) next.ewayUsername = patch.ewayUsername.trim().slice(0, 200);
  if (patch.ewayPassword !== undefined && patch.ewayPassword.trim()) next.ewayPassword = patch.ewayPassword.trim().slice(0, 500);
  if (patch.apiBase !== undefined) next.apiBase = trimBase(patch.apiBase.trim()).slice(0, 500);
  if (patch.ewayApiBase !== undefined) next.ewayApiBase = trimBase(patch.ewayApiBase.trim()).slice(0, 500);
  if (patch.tokenUrl !== undefined) next.tokenUrl = patch.tokenUrl.trim().slice(0, 500);
  if (patch.einvoicePath !== undefined) next.einvoicePath = patch.einvoicePath.trim().slice(0, 120);
  if (patch.ewayPath !== undefined) next.ewayPath = normalizeEwayPath(patch.ewayPath.trim()).slice(0, 120);
  if (patch.sellerGstinOverride !== undefined) {
    next.sellerGstinOverride = patch.sellerGstinOverride.trim().toUpperCase().slice(0, 15);
  }
  if (patch.ewayUserGstin !== undefined) {
    next.ewayUserGstin = patch.ewayUserGstin.trim().toUpperCase().slice(0, 15);
  }
  if (patch.ewayNominalValueInr !== undefined) {
    next.ewayNominalValueInr = Math.max(1, Math.round(patch.ewayNominalValueInr));
  }
  if (patch.ewayAutoEnabled !== undefined) next.ewayAutoEnabled = patch.ewayAutoEnabled;

  await poolRef.query(
    `UPDATE edoc_settings SET config = $1::jsonb, updated_at = now(), updated_by = $2 WHERE id = 1`,
    [JSON.stringify(next), updatedBy.slice(0, 200)],
  );
  await refreshEdocSettingsCache();
  return toPublicEdocSettings();
}
