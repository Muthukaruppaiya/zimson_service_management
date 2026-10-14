import crypto from "node:crypto";
import type { Request, Response } from "express";
import type { Pool } from "pg";
import type { DemoUser } from "../src/types/user";
import {
  deliverOtpToTargetsDetailed,
  type OtpDeliveryResult,
  type OtpDeliveryTarget,
} from "./messaging/deliverOtp";
import { generateOtpCode, isValidOtpCode } from "./otp";
import { sessionCookieOptions } from "./authSession";

export const TRUSTED_DEVICE_COOKIE = "zimson_trusted_device";
/** How long a trusted browser may skip login OTP. */
export const TRUSTED_DEVICE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const LOGIN_OTP_MAX_ATTEMPTS = 5;

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function parseCookieHeader(header: string | undefined): Record<string, string> {
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

export function trustedDeviceCookieOptions() {
  return {
    ...sessionCookieOptions(),
    maxAge: TRUSTED_DEVICE_MAX_AGE_MS,
  };
}

/** Login OTP goes to the profile email only (also shown on the login screen). */
export function buildLoginOtpTargets(user: Pick<DemoUser, "email">): OtpDeliveryTarget[] {
  const email = String(user.email ?? "")
    .trim()
    .toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? [{ type: "email", label: email }] : [];
}

export async function isTrustedDevice(
  pool: Pool,
  req: Request,
  userId: string,
): Promise<boolean> {
  const raw = parseCookieHeader(req.headers.cookie)[TRUSTED_DEVICE_COOKIE]?.trim();
  if (!raw) return false;
  const tokenHash = hashToken(raw);
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id
     FROM trusted_devices
     WHERE user_id = $1
       AND token_hash = $2
       AND revoked_at IS NULL
       AND expires_at > now()
     LIMIT 1`,
    [userId, tokenHash],
  );
  if (!rows[0]) return false;
  await pool.query(`UPDATE trusted_devices SET last_used_at = now() WHERE id = $1`, [rows[0].id]);
  return true;
}

export async function createTrustedDevice(
  pool: Pool,
  res: Response,
  userId: string,
): Promise<void> {
  const raw = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(raw);
  await pool.query(
    `INSERT INTO trusted_devices (id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, now() + interval '90 days')`,
    [crypto.randomUUID(), userId, tokenHash],
  );
  res.cookie(TRUSTED_DEVICE_COOKIE, raw, trustedDeviceCookieOptions());
}

export function clearTrustedDeviceCookie(res: Response): void {
  res.clearCookie(TRUSTED_DEVICE_COOKIE, { path: "/" });
}

export async function revokeTrustedDevicesForUser(pool: Pool, userId: string): Promise<void> {
  await pool.query(
    `UPDATE trusted_devices SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId],
  );
}

export type LoginOtpChallengeResult =
  | {
      ok: true;
      challengeToken: string;
      sentTo: OtpDeliveryTarget[];
      delivery: OtpDeliveryResult[];
      shownOnScreen: boolean;
      generatedOtp: string;
      demoOtp?: string;
      message: string;
    }
  | { ok: false; message: string };

export async function createLoginOtpChallenge(
  pool: Pool,
  user: DemoUser,
  selectedStoreId: string | null,
): Promise<LoginOtpChallengeResult> {
  const targets = buildLoginOtpTargets(user);
  const code = generateOtpCode();
  const challengeToken = crypto.randomBytes(24).toString("base64url");
  const tokenHash = hashToken(challengeToken);
  const codeHash = hashToken(code);
  /** Login OTP is emailed and always shown on the login screen as well. */
  const showOtpOnScreen = true;

  await pool.query(
    `DELETE FROM login_otp_challenges
     WHERE user_id = $1
        OR expires_at < now()
        OR used_at IS NOT NULL`,
    [user.id],
  );

  await pool.query(
    `INSERT INTO login_otp_challenges
       (token_hash, user_id, code_hash, selected_store_id, expires_at)
     VALUES ($1, $2, $3, $4, now() + interval '10 minutes')`,
    [tokenHash, user.id, codeHash, selectedStoreId],
  );

  let delivery: OtpDeliveryResult[] = [];
  if (targets.length > 0) {
    // Still allow login when mail/SMS fails — OTP is shown on screen for testing.
    delivery = await deliverOtpToTargetsDetailed(code, targets);
    if (!delivery.some((d) => d.status === "sent")) {
      console.warn("[login-otp] delivery failed on every channel; showing OTP on screen");
    }
  }

  const sentTo = delivery.filter((d) => d.status === "sent").map(({ type, label }) => ({ type, label }));
  return {
    ok: true,
    challengeToken,
    sentTo,
    delivery,
    shownOnScreen: showOtpOnScreen,
    generatedOtp: code,
    demoOtp: showOtpOnScreen ? code : undefined,
    message:
      targets.length === 0
        ? "No email on this profile. Use the OTP shown below."
        : sentTo.length === 0
          ? `Could not send email to ${targets[0]!.label}. Use the OTP shown below.`
          : `OTP sent to ${sentTo[0]!.label}.`,
  };
}

export type ConsumeLoginOtpResult =
  | { ok: true; userId: string; selectedStoreId: string | null }
  | { ok: false; message: string; userId?: string };

export async function consumeLoginOtpChallenge(
  pool: Pool,
  challengeToken: string,
  code: string,
): Promise<ConsumeLoginOtpResult> {
  if (!challengeToken.trim() || !isValidOtpCode(code)) {
    return { ok: false, message: "Enter a valid OTP." };
  }
  const tokenHash = hashToken(challengeToken.trim());
  const { rows } = await pool.query<{
    user_id: string;
    code_hash: string;
    selected_store_id: string | null;
    attempts: number;
    expires_at: Date;
    used_at: Date | null;
  }>(
    `SELECT user_id, code_hash, selected_store_id, attempts, expires_at, used_at
     FROM login_otp_challenges
     WHERE token_hash = $1
     LIMIT 1`,
    [tokenHash],
  );
  const row = rows[0];
  if (!row || row.used_at || row.expires_at.getTime() < Date.now()) {
    return { ok: false, message: "OTP expired. Sign in again to get a new code.", userId: row?.user_id };
  }
  if (row.attempts >= LOGIN_OTP_MAX_ATTEMPTS) {
    await pool.query(`UPDATE login_otp_challenges SET used_at = now() WHERE token_hash = $1`, [tokenHash]);
    return { ok: false, message: "Too many incorrect attempts. Sign in again.", userId: row.user_id };
  }

  const codeHash = hashToken(code.trim());
  if (codeHash !== row.code_hash) {
    await pool.query(
      `UPDATE login_otp_challenges SET attempts = attempts + 1 WHERE token_hash = $1`,
      [tokenHash],
    );
    return { ok: false, message: "Incorrect OTP. Please try again.", userId: row.user_id };
  }

  await pool.query(`UPDATE login_otp_challenges SET used_at = now() WHERE token_hash = $1`, [tokenHash]);
  return {
    ok: true,
    userId: row.user_id,
    selectedStoreId: row.selected_store_id,
  };
}
