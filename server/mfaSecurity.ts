import crypto from "node:crypto";
import type { Pool, PoolClient } from "pg";

type Queryable = Pick<Pool | PoolClient, "query">;

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TOTP_PERIOD_SECONDS = 30;
const MFA_CHALLENGE_MINUTES = 5;
const MFA_MAX_ATTEMPTS = 5;

let warnedAboutDevKey = false;

function encryptionKey(): Buffer {
  const configured = process.env.MFA_ENCRYPTION_KEY?.trim();
  if (process.env.NODE_ENV === "production" && (!configured || configured.length < 32)) {
    throw new Error("MFA_ENCRYPTION_KEY must be configured with at least 32 characters in production.");
  }
  if (!configured && !warnedAboutDevKey) {
    warnedAboutDevKey = true;
    console.warn("[mfa] Using development-only encryption key. Set MFA_ENCRYPTION_KEY before enrolling production users.");
  }
  return crypto
    .createHash("sha256")
    .update(configured || "zimson-local-development-mfa-key-do-not-use-in-production")
    .digest();
}

export function validateMfaConfiguration(): void {
  void encryptionKey();
}

function encodeBase32(input: Buffer): string {
  let bits = "";
  for (const byte of input) bits += byte.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, "0");
    out += BASE32_ALPHABET[Number.parseInt(chunk, 2)];
  }
  return out;
}

function decodeBase32(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx < 0) throw new Error("Invalid base32 secret.");
    bits += idx.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function safeEqualText(a: string, b: string): boolean {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function totpAt(secret: string, counter: number): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac("sha1", decodeBase32(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

export function verifyTotp(secret: string, code: string, nowMs = Date.now()): boolean {
  const normalized = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  const counter = Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS);
  return [-1, 0, 1].some((window) => safeEqualText(totpAt(secret, counter + window), normalized));
}

export function generateMfaSecret(): string {
  return encodeBase32(crypto.randomBytes(20));
}

export function encryptMfaSecret(secret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptMfaSecret(value: string): string {
  const [ivRaw, tagRaw, encryptedRaw] = value.split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) throw new Error("Invalid encrypted MFA secret.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function buildOtpAuthUri(secret: string, accountLabel: string): string {
  const issuer = "Zimson Service Management";
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${accountLabel}`)}?secret=${encodeURIComponent(
    secret,
  )}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${TOTP_PERIOD_SECONDS}`;
}

function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function hashRecoveryCode(code: string): string {
  return crypto.createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");
}

export function generateRecoveryCodes(count = 10): { codes: string[]; hashes: string[] } {
  const codes = Array.from({ length: count }, () => {
    let raw = "";
    for (let i = 0; i < 8; i += 1) {
      raw += RECOVERY_ALPHABET[crypto.randomInt(RECOVERY_ALPHABET.length)];
    }
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  });
  return { codes, hashes: codes.map(hashRecoveryCode) };
}

export async function isMfaEnabled(pool: Pool, userId: string): Promise<boolean> {
  const { rows } = await pool.query<{ mfa_enabled: boolean }>(
    `SELECT mfa_enabled FROM app_users WHERE id = $1 LIMIT 1`,
    [userId],
  );
  return Boolean(rows[0]?.mfa_enabled);
}

export async function createMfaLoginChallenge(
  pool: Pool,
  userId: string,
  selectedStoreId: string | null,
): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  await pool.query(`DELETE FROM mfa_login_challenges WHERE expires_at <= now() OR used_at IS NOT NULL`);
  await pool.query(
    `INSERT INTO mfa_login_challenges (token_hash, user_id, selected_store_id, expires_at)
     VALUES ($1, $2, $3, now() + ($4 * interval '1 minute'))`,
    [tokenHash, userId, selectedStoreId, MFA_CHALLENGE_MINUTES],
  );
  return token;
}

export type MfaChallengeResult =
  | { ok: true; userId: string; selectedStoreId: string | null; usedRecoveryCode: boolean }
  | { ok: false; message: string };

export async function consumeMfaLoginChallenge(
  pool: Pool,
  token: string,
  credential: string,
): Promise<MfaChallengeResult> {
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{
      user_id: string;
      selected_store_id: string | null;
      attempts: number;
      mfa_enabled: boolean;
      mfa_secret_encrypted: string | null;
      mfa_recovery_code_hashes: unknown;
    }>(
      `SELECT c.user_id, c.selected_store_id, c.attempts,
              u.mfa_enabled, u.mfa_secret_encrypted, u.mfa_recovery_code_hashes
       FROM mfa_login_challenges c
       JOIN app_users u ON u.id = c.user_id
       WHERE c.token_hash = $1
         AND c.used_at IS NULL
         AND c.expires_at > now()
       FOR UPDATE`,
      [tokenHash],
    );
    const row = rows[0];
    if (!row || !row.mfa_enabled || !row.mfa_secret_encrypted) {
      await client.query("ROLLBACK");
      return { ok: false, message: "MFA challenge expired. Sign in again." };
    }
    if (row.attempts >= MFA_MAX_ATTEMPTS) {
      await client.query(`UPDATE mfa_login_challenges SET used_at = now() WHERE token_hash = $1`, [tokenHash]);
      await client.query("COMMIT");
      return { ok: false, message: "Too many incorrect codes. Sign in again." };
    }

    const secret = decryptMfaSecret(row.mfa_secret_encrypted);
    const normalized = credential.trim();
    let valid = verifyTotp(secret, normalized);
    let usedRecoveryCode = false;
    let recoveryHashes = Array.isArray(row.mfa_recovery_code_hashes)
      ? row.mfa_recovery_code_hashes.filter((v): v is string => typeof v === "string")
      : [];

    if (!valid) {
      const candidateHash = hashRecoveryCode(normalized);
      const recoveryIndex = recoveryHashes.findIndex((hash) => safeEqualText(hash, candidateHash));
      if (recoveryIndex >= 0) {
        valid = true;
        usedRecoveryCode = true;
        recoveryHashes = recoveryHashes.filter((_, index) => index !== recoveryIndex);
      }
    }

    if (!valid) {
      await client.query(
        `UPDATE mfa_login_challenges SET attempts = attempts + 1 WHERE token_hash = $1`,
        [tokenHash],
      );
      await client.query("COMMIT");
      return { ok: false, message: "Invalid authentication or recovery code." };
    }

    if (usedRecoveryCode) {
      await client.query(
        `UPDATE app_users SET mfa_recovery_code_hashes = $2::jsonb, updated_at = now() WHERE id = $1`,
        [row.user_id, JSON.stringify(recoveryHashes)],
      );
    }
    await client.query(`UPDATE mfa_login_challenges SET used_at = now() WHERE token_hash = $1`, [tokenHash]);
    await client.query("COMMIT");
    return {
      ok: true,
      userId: row.user_id,
      selectedStoreId: row.selected_store_id,
      usedRecoveryCode,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function verifyUserMfaCredential(
  db: Queryable,
  userId: string,
  credential: string,
): Promise<boolean> {
  const { rows } = await db.query<{
    mfa_secret_encrypted: string | null;
    mfa_recovery_code_hashes: unknown;
  }>(
    `SELECT mfa_secret_encrypted, mfa_recovery_code_hashes
     FROM app_users WHERE id = $1 AND mfa_enabled = true`,
    [userId],
  );
  const row = rows[0];
  if (!row?.mfa_secret_encrypted) return false;
  if (verifyTotp(decryptMfaSecret(row.mfa_secret_encrypted), credential)) return true;
  const candidateHash = hashRecoveryCode(credential);
  const hashes = Array.isArray(row.mfa_recovery_code_hashes)
    ? row.mfa_recovery_code_hashes.filter((v): v is string => typeof v === "string")
    : [];
  return hashes.some((hash) => safeEqualText(hash, candidateHash));
}
