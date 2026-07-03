import type { Pool } from "pg";
import type { MastersIndiaEdocConfig } from "./mastersIndiaEdoc/types";
import { isValidGstin } from "./mastersIndiaEdoc/types";
import { isSandboxEdocApi, resolveEdocEwayUserGstin, resolveEdocSellerGstin, SANDBOX_EDOC_TEST_GSTIN } from "./mastersIndiaEdoc/config";

/** Credential + API fields stored per region (or legacy global fallback). */
export type EdocRegionCredentialsDb = {
  enabled?: boolean;
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
};

/** Global operational toggles in `edoc_settings.config`. */
export type EdocGlobalSettingsDb = {
  failOpen?: boolean;
  ewayAutoEnabled?: boolean;
  ewayNominalValueInr?: number;
};

/** @deprecated Legacy single-row config — migrated to per-region credentials. */
export type EdocSettingsDb = EdocRegionCredentialsDb & EdocGlobalSettingsDb;

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

export type RegionEdocSettingsPublic = {
  regionId: string;
  regionName: string;
  regionGstin: string;
  enabled: boolean;
  username: string;
  hasPassword: boolean;
  ewayUsername: string;
  hasEwayPassword: boolean;
  apiBase: string;
  ewayApiBase: string;
  tokenUrl: string;
  einvoicePath: string;
  ewayPath: string;
  sellerGstinOverride: string;
  ewayUserGstin: string;
  configured: boolean;
  sandboxMode: boolean;
  effectiveEwayGstin: string;
  effectiveEinvoiceGstin: string;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type EdocGlobalSettingsPublic = {
  failOpen: boolean;
  ewayAutoEnabled: boolean;
  ewayNominalValueInr: number;
  updatedAt: string;
  updatedBy: string | null;
};

const DEFAULT_API_BASE = "https://sandb-api.mastersindia.co";

let poolRef: Pool | null = null;
let globalDb: EdocGlobalSettingsDb & EdocRegionCredentialsDb = {};
let regionDbById = new Map<string, EdocRegionCredentialsDb>();
let regionMetaById = new Map<string, { updatedAt: string | null; updatedBy: string | null }>();
let resolvedGlobal: MastersIndiaEdocConfig | null = null;
let metaCache = { updatedAt: new Date(0).toISOString(), updatedBy: null as string | null };
let configuredFromDatabase = false;

function trimBase(url: string): string {
  return url.replace(/\/+$/, "");
}

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

function dbHasCredentials(db: EdocRegionCredentialsDb): boolean {
  return Boolean(db.username?.trim() && db.password?.trim());
}

function defaultCredentialDb(): EdocRegionCredentialsDb {
  return {
    enabled: true,
    apiBase: DEFAULT_API_BASE,
    ewayApiBase: DEFAULT_API_BASE,
    tokenUrl: `${DEFAULT_API_BASE}/api/v1/token-auth/`,
    einvoicePath: "/api/v1/einvoice/",
    ewayPath: "/api/v1/ewayBillsGenerate/",
  };
}

function defaultGlobalDb(): EdocGlobalSettingsDb {
  return {
    failOpen: true,
    ewayAutoEnabled: false,
    ewayNominalValueInr: 1000,
  };
}

function splitLegacyConfig(raw: EdocSettingsDb): {
  global: EdocGlobalSettingsDb;
  legacyCreds: EdocRegionCredentialsDb;
} {
  const {
    failOpen,
    ewayAutoEnabled,
    ewayNominalValueInr,
    enabled,
    username,
    password,
    ewayUsername,
    ewayPassword,
    apiBase,
    ewayApiBase,
    tokenUrl,
    einvoicePath,
    ewayPath,
    sellerGstinOverride,
    ewayUserGstin,
  } = raw;
  return {
    global: { failOpen, ewayAutoEnabled, ewayNominalValueInr },
    legacyCreds: {
      enabled,
      username,
      password,
      ewayUsername,
      ewayPassword,
      apiBase,
      ewayApiBase,
      tokenUrl,
      einvoicePath,
      ewayPath,
      sellerGstinOverride,
      ewayUserGstin,
    },
  };
}

function resolveCredentials(
  creds: EdocRegionCredentialsDb,
  global: EdocGlobalSettingsDb,
): { config: MastersIndiaEdocConfig | null; fromDb: boolean } {
  const defaults = defaultCredentialDb();
  const username = str(creds.username);
  const password = str(creds.password);
  if (!username || !password) {
    return { config: null, fromDb: dbHasCredentials(creds) };
  }

  const gDefaults = defaultGlobalDb();
  const apiBase = trimBase(str(creds.apiBase) || defaults.apiBase!);
  const sellerOverride = str(creds.sellerGstinOverride).toUpperCase();
  const ewayGst = str(creds.ewayUserGstin).toUpperCase();

  const config: MastersIndiaEdocConfig = {
    enabled: creds.enabled ?? defaults.enabled ?? true,
    failOpen: global.failOpen ?? gDefaults.failOpen ?? true,
    username,
    password,
    ewayUsername: str(creds.ewayUsername) || username,
    ewayPassword: str(creds.ewayPassword) || password,
    apiBase,
    ewayApiBase: normalizeEwayApiBase(apiBase, str(creds.ewayApiBase) || apiBase),
    tokenUrl: str(creds.tokenUrl) || `${apiBase}/api/v1/token-auth/`,
    einvoicePath: str(creds.einvoicePath) || defaults.einvoicePath!,
    ewayPath: normalizeEwayPath(str(creds.ewayPath) || defaults.ewayPath!),
    sellerGstinOverride: sellerOverride && isValidGstin(sellerOverride) ? sellerOverride : null,
    ewayUserGstin: ewayGst && isValidGstin(ewayGst) ? ewayGst : null,
    ewayNominalValueInr: Math.max(1, Number(global.ewayNominalValueInr ?? gDefaults.ewayNominalValueInr) || 1000),
    ewayAutoEnabled: global.ewayAutoEnabled ?? gDefaults.ewayAutoEnabled ?? false,
  };

  return { config, fromDb: dbHasCredentials(creds) };
}

function credentialsToPublic(
  creds: EdocRegionCredentialsDb,
  global: EdocGlobalSettingsDb,
  regionGstin = "",
): Omit<RegionEdocSettingsPublic, "regionId" | "regionName" | "regionGstin" | "updatedAt" | "updatedBy"> {
  const { config } = resolveCredentials(creds, global);
  const defaults = defaultCredentialDb();
  const apiBase = trimBase(str(creds.apiBase) || defaults.apiBase!);
  const sandboxMode = config ? isSandboxEdocApi(config) : /sandb-api/i.test(apiBase);
  const regionGst = String(regionGstin ?? "").trim().toUpperCase();
  return {
    enabled: creds.enabled ?? defaults.enabled ?? true,
    username: str(creds.username),
    hasPassword: Boolean(str(creds.password)),
    ewayUsername: str(creds.ewayUsername) || str(creds.username),
    hasEwayPassword: Boolean(str(creds.ewayPassword) || str(creds.password)),
    apiBase: config?.apiBase ?? apiBase,
    ewayApiBase: config?.ewayApiBase ?? trimBase(str(creds.ewayApiBase) || apiBase),
    tokenUrl: config?.tokenUrl ?? (str(creds.tokenUrl) || `${apiBase}/api/v1/token-auth/`),
    einvoicePath: config?.einvoicePath ?? (str(creds.einvoicePath) || defaults.einvoicePath!),
    ewayPath: normalizeEwayPath(config?.ewayPath ?? (str(creds.ewayPath) || defaults.ewayPath!)),
    sellerGstinOverride: str(creds.sellerGstinOverride),
    ewayUserGstin: str(creds.ewayUserGstin),
    configured: Boolean(config),
    sandboxMode,
    effectiveEwayGstin: config ? resolveEdocEwayUserGstin(regionGst, config) : sandboxMode ? SANDBOX_EDOC_TEST_GSTIN : "",
    effectiveEinvoiceGstin: config ? resolveEdocSellerGstin(regionGst, regionGst, config) : sandboxMode ? SANDBOX_EDOC_TEST_GSTIN : "",
  };
}

function applyGlobalCache(db: EdocGlobalSettingsDb & EdocRegionCredentialsDb, row?: { updated_at: Date; updated_by: string | null }): void {
  const split = splitLegacyConfig(db);
  globalDb = { ...split.global, ...split.legacyCreds };
  const m = resolveCredentials(split.legacyCreds, split.global);
  resolvedGlobal = m.config;
  configuredFromDatabase = m.fromDb;
  if (row) {
    metaCache = { updatedAt: row.updated_at.toISOString(), updatedBy: row.updated_by };
  }
}

async function loadRegionConfigs(pool: Pool): Promise<void> {
  const { rows } = await pool.query<{
    region_id: string;
    config: EdocRegionCredentialsDb;
    updated_at: Date;
    updated_by: string | null;
  }>(`SELECT region_id, config, updated_at, updated_by FROM region_edoc_settings`);
  const next = new Map<string, EdocRegionCredentialsDb>();
  const meta = new Map<string, { updatedAt: string | null; updatedBy: string | null }>();
  for (const row of rows) {
    const cfg = (row.config && typeof row.config === "object" ? row.config : {}) as EdocRegionCredentialsDb;
    next.set(row.region_id, cfg);
    meta.set(row.region_id, {
      updatedAt: row.updated_at.toISOString(),
      updatedBy: row.updated_by,
    });
  }
  regionDbById = next;
  regionMetaById = meta;
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
    applyGlobalCache({});
  } else {
    applyGlobalCache((row.config ?? {}) as EdocSettingsDb, row);
  }
  await loadRegionConfigs(pool);
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
    applyGlobalCache({});
  } else {
    applyGlobalCache((row.config ?? {}) as EdocSettingsDb, row);
  }
  await loadRegionConfigs(poolRef);
}

export function getResolvedEdocConfig(): MastersIndiaEdocConfig | null {
  if (!resolvedGlobal) {
    const split = splitLegacyConfig(globalDb);
    const m = resolveCredentials(split.legacyCreds, split.global);
    resolvedGlobal = m.config;
    configuredFromDatabase = m.fromDb;
  }
  return resolvedGlobal;
}

export function getResolvedEdocConfigForRegion(regionId: string | null | undefined): MastersIndiaEdocConfig | null {
  const id = String(regionId ?? "").trim();
  const split = splitLegacyConfig(globalDb);
  if (id && regionDbById.has(id)) {
    const regionCreds = regionDbById.get(id) ?? {};
    if (dbHasCredentials(regionCreds)) {
      return resolveCredentials(regionCreds, split.global).config;
    }
  }
  return getResolvedEdocConfig();
}

export function toPublicEdocSettings(): EdocSettingsPublic {
  const cfg = getResolvedEdocConfig();
  const split = splitLegacyConfig(globalDb);
  const creds = split.legacyCreds;
  const defaults = defaultCredentialDb();
  const apiBase = trimBase(str(creds.apiBase) || defaults.apiBase!);
  const sandboxMode = cfg ? isSandboxEdocApi(cfg) : /sandb-api/i.test(apiBase);
  return {
    enabled: cfg?.enabled ?? creds.enabled ?? defaults.enabled ?? true,
    failOpen: cfg?.failOpen ?? split.global.failOpen ?? true,
    apiBase: cfg?.apiBase ?? apiBase,
    ewayApiBase: normalizeEwayApiBase(apiBase, cfg?.ewayApiBase ?? trimBase(str(creds.ewayApiBase) || apiBase)),
    tokenUrl: cfg?.tokenUrl ?? (str(creds.tokenUrl) || `${apiBase}/api/v1/token-auth/`),
    einvoicePath: cfg?.einvoicePath ?? (str(creds.einvoicePath) || defaults.einvoicePath!),
    ewayPath: normalizeEwayPath(cfg?.ewayPath ?? (str(creds.ewayPath) || defaults.ewayPath!)),
    sellerGstinOverride: cfg?.sellerGstinOverride ?? str(creds.sellerGstinOverride),
    ewayUserGstin: cfg?.ewayUserGstin ?? str(creds.ewayUserGstin),
    ewayNominalValueInr: cfg?.ewayNominalValueInr ?? split.global.ewayNominalValueInr ?? 1000,
    ewayAutoEnabled: cfg?.ewayAutoEnabled ?? split.global.ewayAutoEnabled ?? false,
    username: cfg?.username ?? str(creds.username),
    hasPassword: Boolean(cfg?.password || creds.password),
    ewayUsername: cfg?.ewayUsername ?? (str(creds.ewayUsername) || str(creds.username)),
    hasEwayPassword: Boolean(cfg?.ewayPassword || creds.ewayPassword || cfg?.password || creds.password),
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

export function toPublicGlobalEdocSettings(): EdocGlobalSettingsPublic {
  const split = splitLegacyConfig(globalDb);
  return {
    failOpen: split.global.failOpen ?? true,
    ewayAutoEnabled: split.global.ewayAutoEnabled ?? false,
    ewayNominalValueInr: split.global.ewayNominalValueInr ?? 1000,
    updatedAt: metaCache.updatedAt,
    updatedBy: metaCache.updatedBy,
  };
}

export async function listRegionEdocSettingsPublic(): Promise<RegionEdocSettingsPublic[]> {
  if (!poolRef) return [];
  const { rows } = await poolRef.query<{ id: string; name: string; gst: string | null }>(
    `SELECT id, name, gst FROM regions ORDER BY name`,
  );
  const split = splitLegacyConfig(globalDb);
  return rows.map((r) => {
    const creds = regionDbById.get(r.id) ?? {};
    const meta = regionMetaById.get(r.id);
    return {
      regionId: r.id,
      regionName: r.name,
      regionGstin: String(r.gst ?? "").trim(),
      ...credentialsToPublic(creds, split.global, String(r.gst ?? "")),
      updatedAt: meta?.updatedAt ?? null,
      updatedBy: meta?.updatedBy ?? null,
    };
  });
}

export async function saveEdocGlobalSettings(patch: EdocGlobalSettingsDb, updatedBy: string): Promise<EdocGlobalSettingsPublic> {
  if (!poolRef) throw new Error("Database not ready.");
  const split = splitLegacyConfig(globalDb);
  const nextGlobal: EdocGlobalSettingsDb = { ...split.global };
  if (patch.failOpen !== undefined) nextGlobal.failOpen = patch.failOpen;
  if (patch.ewayAutoEnabled !== undefined) nextGlobal.ewayAutoEnabled = patch.ewayAutoEnabled;
  if (patch.ewayNominalValueInr !== undefined) {
    nextGlobal.ewayNominalValueInr = Math.max(1, Math.round(patch.ewayNominalValueInr));
  }
  const stored: EdocSettingsDb = { ...split.legacyCreds, ...nextGlobal };
  await poolRef.query(
    `UPDATE edoc_settings SET config = $1::jsonb, updated_at = now(), updated_by = $2 WHERE id = 1`,
    [JSON.stringify(stored), updatedBy.slice(0, 200)],
  );
  await refreshEdocSettingsCache();
  return toPublicGlobalEdocSettings();
}

/** @deprecated Use saveEdocGlobalSettings + saveRegionEdocSettings */
export async function saveEdocSettings(patch: EdocSettingsDb, updatedBy: string): Promise<EdocSettingsPublic> {
  if (!poolRef) throw new Error("Database not ready.");
  const split = splitLegacyConfig(globalDb);
  const nextCreds: EdocRegionCredentialsDb = { ...split.legacyCreds };
  const nextGlobal: EdocGlobalSettingsDb = { ...split.global };

  if (patch.enabled !== undefined) nextCreds.enabled = patch.enabled;
  if (patch.failOpen !== undefined) nextGlobal.failOpen = patch.failOpen;
  if (patch.username !== undefined) nextCreds.username = patch.username.trim().slice(0, 200);
  if (patch.password !== undefined && patch.password.trim()) nextCreds.password = patch.password.trim().slice(0, 500);
  if (patch.ewayUsername !== undefined) nextCreds.ewayUsername = patch.ewayUsername.trim().slice(0, 200);
  if (patch.ewayPassword !== undefined && patch.ewayPassword.trim()) {
    nextCreds.ewayPassword = patch.ewayPassword.trim().slice(0, 500);
  }
  if (patch.apiBase !== undefined) nextCreds.apiBase = trimBase(patch.apiBase.trim()).slice(0, 500);
  if (patch.ewayApiBase !== undefined) nextCreds.ewayApiBase = trimBase(patch.ewayApiBase.trim()).slice(0, 500);
  if (patch.tokenUrl !== undefined) nextCreds.tokenUrl = patch.tokenUrl.trim().slice(0, 500);
  if (patch.einvoicePath !== undefined) nextCreds.einvoicePath = patch.einvoicePath.trim().slice(0, 120);
  if (patch.ewayPath !== undefined) nextCreds.ewayPath = normalizeEwayPath(patch.ewayPath.trim()).slice(0, 120);
  if (patch.sellerGstinOverride !== undefined) {
    nextCreds.sellerGstinOverride = patch.sellerGstinOverride.trim().toUpperCase().slice(0, 15);
  }
  if (patch.ewayUserGstin !== undefined) {
    nextCreds.ewayUserGstin = patch.ewayUserGstin.trim().toUpperCase().slice(0, 15);
  }
  if (patch.ewayNominalValueInr !== undefined) {
    nextGlobal.ewayNominalValueInr = Math.max(1, Math.round(patch.ewayNominalValueInr));
  }
  if (patch.ewayAutoEnabled !== undefined) nextGlobal.ewayAutoEnabled = patch.ewayAutoEnabled;

  const stored: EdocSettingsDb = { ...nextCreds, ...nextGlobal };
  await poolRef.query(
    `UPDATE edoc_settings SET config = $1::jsonb, updated_at = now(), updated_by = $2 WHERE id = 1`,
    [JSON.stringify(stored), updatedBy.slice(0, 200)],
  );
  await refreshEdocSettingsCache();
  return toPublicEdocSettings();
}

export async function saveRegionEdocSettings(
  regionId: string,
  patch: EdocRegionCredentialsDb,
  updatedBy: string,
): Promise<RegionEdocSettingsPublic> {
  if (!poolRef) throw new Error("Database not ready.");
  const id = String(regionId ?? "").trim();
  if (!id) throw new Error("regionId required");

  const regionCheck = await poolRef.query(`SELECT id, name, gst FROM regions WHERE id = $1::text`, [id]);
  const region = regionCheck.rows[0] as { id: string; name: string; gst: string | null } | undefined;
  if (!region) throw new Error("Region not found.");

  const current = regionDbById.get(id) ?? {};
  const next: EdocRegionCredentialsDb = { ...current };
  if (patch.enabled !== undefined) next.enabled = patch.enabled;
  if (patch.username !== undefined) next.username = patch.username.trim().slice(0, 200);
  if (patch.password !== undefined && patch.password.trim()) next.password = patch.password.trim().slice(0, 500);
  if (patch.ewayUsername !== undefined) next.ewayUsername = patch.ewayUsername.trim().slice(0, 200);
  if (patch.ewayPassword !== undefined && patch.ewayPassword.trim()) {
    next.ewayPassword = patch.ewayPassword.trim().slice(0, 500);
  }
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

  await poolRef.query(
    `INSERT INTO region_edoc_settings (region_id, config, updated_at, updated_by)
     VALUES ($1::text, $2::jsonb, now(), $3)
     ON CONFLICT (region_id) DO UPDATE
       SET config = EXCLUDED.config,
           updated_at = now(),
           updated_by = EXCLUDED.updated_by`,
    [id, JSON.stringify(next), updatedBy.slice(0, 200)],
  );
  await refreshEdocSettingsCache();
  const split = splitLegacyConfig(globalDb);
  const meta = regionMetaById.get(id);
  return {
    regionId: region.id,
    regionName: region.name,
    regionGstin: String(region.gst ?? "").trim(),
    ...credentialsToPublic(next, split.global, String(region.gst ?? "")),
    updatedAt: meta?.updatedAt ?? null,
    updatedBy: meta?.updatedBy ?? null,
  };
}

export function edocAnyRegionConfigured(): boolean {
  const split = splitLegacyConfig(globalDb);
  if (dbHasCredentials(split.legacyCreds)) return true;
  for (const creds of regionDbById.values()) {
    if (dbHasCredentials(creds)) return true;
  }
  return false;
}
