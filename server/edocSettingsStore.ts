import type { Pool } from "pg";
import type { MastersIndiaEdocConfig } from "./mastersIndiaEdoc/types";
import { isValidGstin } from "./mastersIndiaEdoc/types";

/** Stored in `edoc_settings.config` (JSONB). Super-admin only API. */
export type EdocSettingsDb = {
  enabled?: boolean;
  failOpen?: boolean;
  username?: string;
  password?: string;
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
  configured: boolean;
  configuredFromDatabase: boolean;
  envFallbackActive: boolean;
  updatedAt: string;
  updatedBy: string | null;
};

let poolRef: Pool | null = null;
let dbConfig: EdocSettingsDb = {};
let resolved: MastersIndiaEdocConfig | null = null;
let metaCache = { updatedAt: new Date(0).toISOString(), updatedBy: null as string | null };
let configuredFromDatabase = false;
let envFallbackActive = false;

function envBool(name: string, defaultValue: boolean): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  return defaultValue;
}

function trimBase(url: string): string {
  return url.replace(/\/+$/, "");
}

function envFirst(...keys: string[]): string {
  for (const k of keys) {
    const v = process.env[k]?.trim();
    if (v) return v;
  }
  return "";
}

function configFromEnv(): EdocSettingsDb {
  return {
    enabled: envBool("MASTERS_INDIA_EDOC_ENABLED", true),
    failOpen: envBool("MASTERS_INDIA_EDOC_FAIL_OPEN", true),
    username: envFirst("MASTERS_INDIA_EDOC_USERNAME", "MASTERS_INDIA_USERNAME"),
    password: envFirst("MASTERS_INDIA_EDOC_PASSWORD", "MASTERS_INDIA_PASSWORD"),
    apiBase: trimBase(envFirst("MASTERS_INDIA_EDOC_API_BASE") || "https://sandb-api.mastersindia.co"),
    ewayApiBase: trimBase(
      envFirst("MASTERS_INDIA_EDOC_EWAY_API_BASE") || "https://sandb-api.edoc.mastersindia.co",
    ),
    tokenUrl:
      envFirst("MASTERS_INDIA_EDOC_TOKEN_URL") ||
      `${trimBase(envFirst("MASTERS_INDIA_EDOC_API_BASE") || "https://sandb-api.mastersindia.co")}/api/v1/token-auth/`,
    einvoicePath: envFirst("MASTERS_INDIA_EDOC_EINVOICE_PATH") || "/api/v1/einvoice/",
    ewayPath: envFirst("MASTERS_INDIA_EDOC_EWAY_PATH") || "/api/v1/ewayBillsGenerate/",
    sellerGstinOverride: envFirst("MASTERS_INDIA_EDOC_SELLER_GSTIN").toUpperCase() || undefined,
    ewayUserGstin: envFirst("MASTERS_INDIA_EDOC_EWAY_GSTIN").toUpperCase() || undefined,
    ewayNominalValueInr: Math.max(
      1,
      Number(envFirst("MASTERS_INDIA_EDOC_EWAY_NOMINAL_INR") || "1000") || 1000,
    ),
    ewayAutoEnabled: envBool("MASTERS_INDIA_EDOC_EWAY_AUTO", false),
  };
}

function dbHasCredentials(db: EdocSettingsDb): boolean {
  return Boolean(db.username?.trim() && db.password?.trim());
}

function pick<T>(dbVal: T | undefined, envVal: T, fallback: T): T {
  if (dbVal !== undefined && dbVal !== null && dbVal !== "") return dbVal as T;
  if (envVal !== undefined && envVal !== null && envVal !== "") return envVal;
  return fallback;
}

function resolveMerged(db: EdocSettingsDb): {
  config: MastersIndiaEdocConfig | null;
  fromDb: boolean;
  envFallback: boolean;
} {
  const env = configFromEnv();
  const username = pick(db.username, env.username, "");
  const password = pick(db.password, env.password, "");
  if (!username || !password) {
    return { config: null, fromDb: dbHasCredentials(db), envFallback: !dbHasCredentials(db) && Boolean(env.username) };
  }

  const apiBase = trimBase(pick(db.apiBase, env.apiBase, "https://sandb-api.mastersindia.co"));
  const enabled = db.enabled ?? env.enabled ?? true;
  const failOpen = db.failOpen ?? env.failOpen ?? true;
  const sellerOverride = pick(db.sellerGstinOverride, env.sellerGstinOverride ?? "", "");
  const ewayGst = pick(db.ewayUserGstin, env.ewayUserGstin ?? "", "");

  const config: MastersIndiaEdocConfig = {
    enabled,
    failOpen,
    username,
    password,
    apiBase,
    ewayApiBase: trimBase(pick(db.ewayApiBase, env.ewayApiBase, "https://sandb-api.edoc.mastersindia.co")),
    tokenUrl: pick(db.tokenUrl, env.tokenUrl, `${apiBase}/api/v1/token-auth/`),
    einvoicePath: pick(db.einvoicePath, env.einvoicePath, "/api/v1/einvoice/"),
    ewayPath: pick(db.ewayPath, env.ewayPath, "/api/v1/ewayBillsGenerate/"),
    sellerGstinOverride: sellerOverride && isValidGstin(sellerOverride) ? sellerOverride : null,
    ewayUserGstin: ewayGst && isValidGstin(ewayGst) ? ewayGst : null,
    ewayNominalValueInr: Math.max(
      1,
      Number(pick(db.ewayNominalValueInr, env.ewayNominalValueInr, 1000)) || 1000,
    ),
    ewayAutoEnabled: db.ewayAutoEnabled ?? env.ewayAutoEnabled ?? false,
  };

  const fromDb = dbHasCredentials(db);
  const envFallback = !fromDb && Boolean(env.username && env.password);
  return { config, fromDb, envFallback };
}

function applyCache(db: EdocSettingsDb, row?: { updated_at: Date; updated_by: string | null }): void {
  dbConfig = db;
  const m = resolveMerged(db);
  resolved = m.config;
  configuredFromDatabase = m.fromDb;
  envFallbackActive = m.envFallback;
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
  let row = rows[0];
  if (!row) {
    applyCache({});
    return;
  }

  let cfg = (row.config && typeof row.config === "object" ? row.config : {}) as EdocSettingsDb;
  if (!dbHasCredentials(cfg) && dbHasCredentials(configFromEnv())) {
    cfg = { ...configFromEnv(), ...cfg };
    await pool.query(`UPDATE edoc_settings SET config = $1::jsonb, updated_at = now(), updated_by = $2 WHERE id = 1`, [
      JSON.stringify(cfg),
      "env-import",
    ]);
    const again = await pool.query<{ config: EdocSettingsDb; updated_at: Date; updated_by: string | null }>(
      `SELECT config, updated_at, updated_by FROM edoc_settings WHERE id = 1`,
    );
    row = again.rows[0]!;
    cfg = (row.config ?? {}) as EdocSettingsDb;
    console.log("[edoc-settings] Imported Masters India credentials from .env into database (one-time).");
  }

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
    envFallbackActive = m.envFallback;
  }
  return resolved;
}

export function toPublicEdocSettings(): EdocSettingsPublic {
  const cfg = getResolvedEdocConfig();
  const db = dbConfig;
  const env = configFromEnv();
  return {
    enabled: cfg?.enabled ?? db.enabled ?? env.enabled ?? true,
    failOpen: cfg?.failOpen ?? db.failOpen ?? env.failOpen ?? true,
    apiBase: cfg?.apiBase ?? trimBase(db.apiBase ?? env.apiBase ?? ""),
    ewayApiBase: cfg?.ewayApiBase ?? trimBase(db.ewayApiBase ?? env.ewayApiBase ?? ""),
    tokenUrl: cfg?.tokenUrl ?? db.tokenUrl ?? env.tokenUrl ?? "",
    einvoicePath: cfg?.einvoicePath ?? db.einvoicePath ?? env.einvoicePath ?? "/api/v1/einvoice/",
    ewayPath: cfg?.ewayPath ?? db.ewayPath ?? env.ewayPath ?? "/api/v1/ewayBillsGenerate/",
    sellerGstinOverride: cfg?.sellerGstinOverride ?? db.sellerGstinOverride ?? env.sellerGstinOverride ?? "",
    ewayUserGstin: cfg?.ewayUserGstin ?? db.ewayUserGstin ?? env.ewayUserGstin ?? "",
    ewayNominalValueInr: cfg?.ewayNominalValueInr ?? db.ewayNominalValueInr ?? env.ewayNominalValueInr ?? 1000,
    ewayAutoEnabled: cfg?.ewayAutoEnabled ?? db.ewayAutoEnabled ?? env.ewayAutoEnabled ?? false,
    username: cfg?.username ?? db.username ?? env.username ?? "",
    hasPassword: Boolean(cfg?.password || db.password),
    configured: Boolean(cfg),
    configuredFromDatabase,
    envFallbackActive,
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
  if (patch.apiBase !== undefined) next.apiBase = trimBase(patch.apiBase.trim()).slice(0, 500);
  if (patch.ewayApiBase !== undefined) next.ewayApiBase = trimBase(patch.ewayApiBase.trim()).slice(0, 500);
  if (patch.tokenUrl !== undefined) next.tokenUrl = patch.tokenUrl.trim().slice(0, 500);
  if (patch.einvoicePath !== undefined) next.einvoicePath = patch.einvoicePath.trim().slice(0, 120);
  if (patch.ewayPath !== undefined) next.ewayPath = patch.ewayPath.trim().slice(0, 120);
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
