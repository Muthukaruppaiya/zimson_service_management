import type { Pool } from "pg";
import type { RazorpaySettings } from "../src/types/razorpaySettings";

export type RazorpaySettingsDb = {
  enabled?: boolean;
  keyId?: string;
  keySecret?: string;
  webhookSecret?: string;
};

type Meta = { updatedAt: string; updatedBy: string | null };

let poolRef: Pool | null = null;
let dbConfig: RazorpaySettingsDb = {};
let metaCache: Meta = { updatedAt: new Date(0).toISOString(), updatedBy: null };

function envConfig(): RazorpaySettingsDb {
  const keyId = String(process.env.RAZORPAY_KEY_ID ?? "").trim();
  const keySecret = String(process.env.RAZORPAY_KEY_SECRET ?? "").trim();
  const webhookSecret = String(process.env.RAZORPAY_WEBHOOK_SECRET ?? "").trim();
  const enabledEnv = String(process.env.RAZORPAY_ENABLED ?? "").trim().toLowerCase();
  return {
    enabled: enabledEnv === "true" || enabledEnv === "1" ? true : enabledEnv === "false" || enabledEnv === "0" ? false : undefined,
    keyId: keyId || undefined,
    keySecret: keySecret || undefined,
    webhookSecret: webhookSecret || undefined,
  };
}

export type ResolvedRazorpayConfig = {
  enabled: boolean;
  keyId: string;
  keySecret: string;
  webhookSecret: string;
};

export function resolveRazorpayConfig(db: RazorpaySettingsDb = dbConfig): ResolvedRazorpayConfig {
  const env = envConfig();
  const keyId = (db.keyId || env.keyId || "").trim();
  const keySecret = (db.keySecret || env.keySecret || "").trim();
  const webhookSecret = (db.webhookSecret || env.webhookSecret || "").trim();
  const enabled = db.enabled ?? env.enabled ?? Boolean(keyId && keySecret);
  return {
    enabled: Boolean(enabled && keyId && keySecret),
    keyId,
    keySecret,
    webhookSecret,
  };
}

function toPublic(db: RazorpaySettingsDb, meta: Meta): RazorpaySettings {
  const resolved = resolveRazorpayConfig(db);
  const env = envConfig();
  return {
    enabled: db.enabled ?? resolved.enabled,
    keyId: db.keyId || resolved.keyId,
    hasKeySecret: Boolean(db.keySecret || env.keySecret),
    hasWebhookSecret: Boolean(db.webhookSecret || env.webhookSecret),
    configured: resolved.enabled,
    envFallbackActive: !db.keyId && Boolean(env.keyId),
    updatedAt: meta.updatedAt,
    updatedBy: meta.updatedBy,
  };
}

export function getResolvedRazorpayConfig(): ResolvedRazorpayConfig {
  return resolveRazorpayConfig(dbConfig);
}

export function toPublicRazorpaySettings(): RazorpaySettings {
  return toPublic(dbConfig, metaCache);
}

export async function initRazorpaySettings(pool: Pool): Promise<void> {
  poolRef = pool;
  await pool.query(`INSERT INTO razorpay_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
  const { rows } = await pool.query<{ config: RazorpaySettingsDb; updated_at: Date; updated_by: string | null }>(
    `SELECT config, updated_at, updated_by FROM razorpay_settings WHERE id = 1`,
  );
  const row = rows[0];
  if (!row) {
    dbConfig = {};
    return;
  }
  dbConfig = (row.config && typeof row.config === "object" ? row.config : {}) as RazorpaySettingsDb;
  metaCache = {
    updatedAt: row.updated_at?.toISOString?.() ?? new Date().toISOString(),
    updatedBy: row.updated_by,
  };

  const env = envConfig();
  const emptyDb = !dbConfig.keyId && !dbConfig.keySecret;
  if (emptyDb && (env.keyId || env.keySecret)) {
    const imported: RazorpaySettingsDb = {
      enabled: env.enabled ?? true,
      keyId: env.keyId,
      keySecret: env.keySecret,
      webhookSecret: env.webhookSecret,
    };
    await pool.query(
      `UPDATE razorpay_settings SET config = $1::jsonb, updated_at = now(), updated_by = $2 WHERE id = 1`,
      [JSON.stringify(imported), "env-import"],
    );
    dbConfig = imported;
    metaCache = { updatedAt: new Date().toISOString(), updatedBy: "env-import" };
  }
}

export async function saveRazorpaySettings(patch: RazorpaySettingsDb, updatedBy: string): Promise<RazorpaySettings> {
  if (!poolRef) throw new Error("Razorpay settings are not initialised.");
  const next: RazorpaySettingsDb = { ...dbConfig };
  if (patch.enabled !== undefined) next.enabled = patch.enabled;
  if (patch.keyId !== undefined) next.keyId = patch.keyId || undefined;
  if (patch.keySecret) next.keySecret = patch.keySecret;
  if (patch.webhookSecret) next.webhookSecret = patch.webhookSecret;
  await poolRef.query(
    `UPDATE razorpay_settings SET config = $1::jsonb, updated_at = now(), updated_by = $2 WHERE id = 1`,
    [JSON.stringify(next), updatedBy],
  );
  dbConfig = next;
  metaCache = { updatedAt: new Date().toISOString(), updatedBy };
  return toPublic(dbConfig, metaCache);
}
