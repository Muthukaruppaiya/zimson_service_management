import type { Pool } from "pg";
import type {
  PinelabsConnectionMode,
  PinelabsEnvironment,
  PinelabsStoreSettings,
} from "../src/types/pinelabsSettings";
import { defaultInvoiceCodeFromStoreName } from "./storeInvoiceNumber";

export const PINELABS_UAT_BASE = "https://www.plutuscloudserviceuat.in:8201";
export const PINELABS_PROD_BASE = "https://www.plutuscloudservice.in:8201";

export type PinelabsStoreSettingsDb = {
  enabled: boolean;
  environment: PinelabsEnvironment;
  merchantId: string;
  securityToken: string;
  pineLabsStoreId: string;
  clientId: string;
  imei: string;
  merchantStorePosCode: string;
};

export type ResolvedPinelabsConfig = PinelabsStoreSettingsDb & {
  connectionMode: PinelabsConnectionMode | null;
  configured: boolean;
  apiBase: string;
};

type StoreRow = {
  store_id: string;
  store_name: string;
  region_id: string;
  region_name: string;
  invoice_number_store_code: string | null;
  enabled: boolean | null;
  environment: string | null;
  merchant_id: string | null;
  security_token: string | null;
  pl_store_id: string | null;
  client_id: string | null;
  imei: string | null;
  merchant_store_pos_code: string | null;
  updated_at: Date | null;
  updated_by: string | null;
};

let poolRef: Pool | null = null;

export function normalizePinelabsEnvironment(raw: unknown): PinelabsEnvironment {
  return String(raw ?? "").trim().toLowerCase() === "production" ? "production" : "uat";
}

export function pinelabsApiBase(environment: PinelabsEnvironment): string {
  return environment === "production" ? PINELABS_PROD_BASE : PINELABS_UAT_BASE;
}

export function storeCodeFromMaster(invoiceNumberStoreCode: string | null | undefined, storeName: string): string {
  const raw = String(invoiceNumberStoreCode ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return (raw || defaultInvoiceCodeFromStoreName(storeName)).slice(0, 16);
}

/** Older builds auto-filled the POS code from the store code; treat that placeholder as "not entered". */
function legacyDerivedPosCode(storeCode: string): string {
  const code = storeCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
  if (!code) return "";
  return `${code.slice(0, 5).padEnd(5, "0")}000`;
}

export function pinelabsConnectionMode(db: PinelabsStoreSettingsDb): PinelabsConnectionMode | null {
  if (db.merchantStorePosCode.trim() && db.imei.trim()) return "pos_imei";
  if (db.pineLabsStoreId.trim() && db.clientId.trim()) return "store_client";
  return null;
}

function emptyDb(): PinelabsStoreSettingsDb {
  return {
    enabled: false,
    environment: "uat",
    merchantId: "",
    securityToken: "",
    pineLabsStoreId: "",
    clientId: "",
    imei: "",
    merchantStorePosCode: "",
  };
}

function isConfigured(db: PinelabsStoreSettingsDb): boolean {
  return Boolean(db.enabled && db.merchantId.trim() && db.securityToken.trim() && pinelabsConnectionMode(db));
}

function rowToDb(row: StoreRow): PinelabsStoreSettingsDb {
  if (row.enabled == null) return emptyDb();
  const storeCode = storeCodeFromMaster(row.invoice_number_store_code, row.store_name);
  const posRaw = String(row.merchant_store_pos_code ?? "").trim();
  return {
    enabled: Boolean(row.enabled),
    environment: normalizePinelabsEnvironment(row.environment),
    merchantId: String(row.merchant_id ?? "").trim(),
    securityToken: String(row.security_token ?? "").trim(),
    pineLabsStoreId: String(row.pl_store_id ?? "").trim(),
    clientId: String(row.client_id ?? "").trim(),
    imei: String(row.imei ?? "").trim(),
    merchantStorePosCode: posRaw && posRaw === legacyDerivedPosCode(storeCode) ? "" : posRaw,
  };
}

function toPublic(row: StoreRow): PinelabsStoreSettings {
  const db = rowToDb(row);
  return {
    storeId: row.store_id,
    storeName: row.store_name,
    regionId: row.region_id,
    regionName: row.region_name,
    enabled: db.enabled,
    environment: db.environment,
    merchantId: db.merchantId,
    hasSecurityToken: Boolean(db.securityToken),
    pineLabsStoreId: db.pineLabsStoreId,
    clientId: db.clientId,
    imei: db.imei,
    storeCode: storeCodeFromMaster(row.invoice_number_store_code, row.store_name),
    merchantStorePosCode: db.merchantStorePosCode,
    connectionMode: pinelabsConnectionMode(db),
    configured: isConfigured(db),
    updatedAt: row.updated_at?.toISOString?.() ?? null,
    updatedBy: row.updated_by,
  };
}

const STORE_LIST_SQL = `
  SELECT
    s.id AS store_id,
    s.name AS store_name,
    r.id AS region_id,
    r.name AS region_name,
    s.invoice_number_store_code,
    p.enabled,
    p.environment,
    p.merchant_id,
    p.security_token,
    p.pl_store_id,
    p.client_id,
    p.imei,
    p.merchant_store_pos_code,
    p.updated_at,
    p.updated_by
  FROM stores s
  JOIN regions r ON r.id = s.region_id
  LEFT JOIN pinelabs_store_settings p ON p.store_id = s.id
`;

export async function initPinelabsSettings(pool: Pool): Promise<void> {
  poolRef = pool;
}

export async function listPinelabsStoreSettings(): Promise<PinelabsStoreSettings[]> {
  if (!poolRef) throw new Error("Pine Labs settings are not initialised.");
  const { rows } = await poolRef.query<StoreRow>(`${STORE_LIST_SQL} ORDER BY r.name, s.name`);
  return rows.map(toPublic);
}

export async function getPinelabsStoreSettings(storeId: string): Promise<PinelabsStoreSettings | null> {
  if (!poolRef) throw new Error("Pine Labs settings are not initialised.");
  const { rows } = await poolRef.query<StoreRow>(`${STORE_LIST_SQL} WHERE s.id = $1`, [storeId]);
  const row = rows[0];
  return row ? toPublic(row) : null;
}

export async function getResolvedPinelabsForStore(storeId: string): Promise<ResolvedPinelabsConfig | null> {
  if (!poolRef) throw new Error("Pine Labs settings are not initialised.");
  const { rows } = await poolRef.query<StoreRow>(`${STORE_LIST_SQL} WHERE s.id = $1`, [storeId]);
  const row = rows[0];
  if (!row) return null;
  const db = rowToDb(row);
  return {
    ...db,
    connectionMode: pinelabsConnectionMode(db),
    configured: isConfigured(db),
    apiBase: pinelabsApiBase(db.environment),
  };
}

export class PinelabsSettingsConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PinelabsSettingsConflictError";
  }
}

export async function savePinelabsStoreSettings(
  storeId: string,
  patch: Partial<PinelabsStoreSettingsDb>,
  updatedBy: string,
): Promise<PinelabsStoreSettings> {
  if (!poolRef) throw new Error("Pine Labs settings are not initialised.");

  const existing = await getResolvedPinelabsForStore(storeId);
  if (!existing) throw new Error("Store not found.");

  const pick = (key: Exclude<keyof PinelabsStoreSettingsDb, "enabled" | "environment" | "securityToken">) =>
    patch[key] !== undefined ? String(patch[key]).trim() : existing[key];

  const next: PinelabsStoreSettingsDb = {
    enabled: patch.enabled ?? existing.enabled,
    environment: patch.environment ?? existing.environment,
    merchantId: pick("merchantId"),
    securityToken: patch.securityToken?.trim() ? patch.securityToken.trim() : existing.securityToken,
    pineLabsStoreId: pick("pineLabsStoreId"),
    clientId: pick("clientId"),
    imei: pick("imei"),
    merchantStorePosCode: pick("merchantStorePosCode"),
  };

  if (next.enabled) {
    if (!next.merchantId) throw new PinelabsSettingsConflictError("Merchant ID is required.");
    if (!next.securityToken) throw new PinelabsSettingsConflictError("Security token is required.");
    if (!pinelabsConnectionMode(next)) {
      throw new PinelabsSettingsConflictError(
        "Enter Merchant store POS code + IMEI, or Pine Labs Store ID + Client ID.",
      );
    }
  }

  try {
    await poolRef.query(
      `INSERT INTO pinelabs_store_settings (
         store_id, enabled, environment, merchant_id, security_token,
         pl_store_id, client_id, imei, merchant_store_pos_code, updated_at, updated_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), $10)
       ON CONFLICT (store_id) DO UPDATE SET
         enabled = EXCLUDED.enabled,
         environment = EXCLUDED.environment,
         merchant_id = EXCLUDED.merchant_id,
         security_token = EXCLUDED.security_token,
         pl_store_id = EXCLUDED.pl_store_id,
         client_id = EXCLUDED.client_id,
         imei = EXCLUDED.imei,
         merchant_store_pos_code = EXCLUDED.merchant_store_pos_code,
         updated_at = now(),
         updated_by = EXCLUDED.updated_by`,
      [
        storeId,
        next.enabled,
        next.environment,
        next.merchantId,
        next.securityToken,
        next.pineLabsStoreId,
        next.clientId,
        next.imei,
        next.merchantStorePosCode,
        updatedBy,
      ],
    );
  } catch (e) {
    const code = e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "";
    if (code === "23505") {
      throw new PinelabsSettingsConflictError("This Client ID or IMEI is already assigned to another store.");
    }
    throw e;
  }

  const saved = await getPinelabsStoreSettings(storeId);
  if (!saved) throw new Error("Could not reload Pine Labs settings.");
  return saved;
}
