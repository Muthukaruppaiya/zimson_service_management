import type { Response } from "express";
import type { Pool } from "pg";
import { createId } from "../src/lib/id";
import type { DemoUser, SessionUser, UserRole } from "../src/types/user";
import { stripPassword } from "./persist";

export const SESSION_COOKIE = "zimson_session";
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const STORE_ROLES = new Set<UserRole>(["store_user", "store_manager", "store_accounts"]);

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_MS,
  };
}

export async function countActiveSessionsForUser(pool: Pool, userId: string): Promise<number> {
  const { rows } = await pool.query<{ c: number }>(
    `SELECT COUNT(*)::int AS c
     FROM auth_sessions
     WHERE user_id = $1
       AND revoked_at IS NULL
       AND expires_at > now()`,
    [userId],
  );
  return rows[0]?.c ?? 0;
}

const LOGIN_ATTEMPT_ALERT_MESSAGE =
  "Someone tried to sign in with your account on another device or browser. If this was not you, sign out and change your password.";

export async function revokeAllSessionsForUser(pool: Pool, userId: string): Promise<number> {
  const { rowCount } = await pool.query(
    `UPDATE auth_sessions
     SET revoked_at = now(),
         login_alert_at = NULL,
         login_alert_message = NULL
     WHERE user_id = $1
       AND revoked_at IS NULL
       AND expires_at > now()`,
    [userId],
  );
  return rowCount ?? 0;
}

export async function revokeSessionById(pool: Pool, sessionId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE auth_sessions
     SET revoked_at = now()
     WHERE id = $1
       AND revoked_at IS NULL
       AND expires_at > now()`,
    [sessionId],
  );
  return (rowCount ?? 0) > 0;
}

export type ActiveSessionRow = {
  sessionId: string;
  userId: string;
  displayName: string;
  email: string;
  employeeCode: string | null;
  role: string;
  createdAt: string;
  expiresAt: string;
  hasLoginAlert: boolean;
};

export async function listActiveSessions(pool: Pool): Promise<ActiveSessionRow[]> {
  const { rows } = await pool.query<{
    session_id: string;
    user_id: string;
    display_name: string;
    email: string;
    employee_code: string | null;
    role: string;
    created_at: Date;
    expires_at: Date;
    has_login_alert: boolean;
  }>(
    `SELECT s.id AS session_id,
            s.user_id,
            u.display_name,
            u.email,
            u.employee_code,
            u.role,
            s.created_at,
            s.expires_at,
            (s.login_alert_at IS NOT NULL) AS has_login_alert
     FROM auth_sessions s
     JOIN app_users u ON u.id = s.user_id
     WHERE s.revoked_at IS NULL
       AND s.expires_at > now()
     ORDER BY s.created_at DESC`,
  );
  return rows.map((r) => ({
    sessionId: r.session_id,
    userId: r.user_id,
    displayName: r.display_name,
    email: r.email,
    employeeCode: r.employee_code,
    role: r.role,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    expiresAt: r.expires_at instanceof Date ? r.expires_at.toISOString() : String(r.expires_at),
    hasLoginAlert: Boolean(r.has_login_alert),
  }));
}

export async function notifyActiveSessionsOfLoginAttempt(pool: Pool, userId: string): Promise<void> {
  await pool.query(
    `UPDATE auth_sessions
     SET login_alert_at = now(),
         login_alert_message = $2
     WHERE user_id = $1
       AND revoked_at IS NULL
       AND expires_at > now()`,
    [userId, LOGIN_ATTEMPT_ALERT_MESSAGE],
  );
}

export async function createAuthSession(pool: Pool, res: Response, userId: string): Promise<void> {
  const sid = createId("sid");
  await pool.query(
    `INSERT INTO auth_sessions (id, user_id, expires_at)
     VALUES ($1, $2, now() + interval '7 day')`,
    [sid, userId],
  );
  res.cookie(SESSION_COOKIE, sid, sessionCookieOptions());
}

export type IssueSessionResult =
  | { ok: true; user: SessionUser }
  | {
      ok: false;
      code: "STORE_SELECTION_REQUIRED";
      message: string;
      stores: { id: string; name: string }[];
      loginId: string;
    };

/** Same store rules as POST /api/auth/login — used after password reset. */
export async function issueSessionForUser(
  pool: Pool,
  res: Response,
  user: DemoUser,
  selectedStoreId: string | null,
): Promise<IssueSessionResult> {
  if (user.canLogin === false) {
    throw new Error("This profile cannot sign in.");
  }

  let refreshed = user;

  if (STORE_ROLES.has(user.role)) {
    const allowedStores = (user.storeIds ?? []).filter(Boolean);
    if (allowedStores.length === 0) {
      throw new Error("No store mapping found for this account.");
    }
    if (!selectedStoreId && allowedStores.length > 1) {
      const { rows: storeRows } = await pool.query<{ id: string; name: string }>(
        `SELECT id, name FROM stores WHERE id = ANY($1::text[]) ORDER BY name`,
        [allowedStores],
      );
      const loginId = String(user.employeeCode ?? user.id).trim();
      return {
        ok: false,
        code: "STORE_SELECTION_REQUIRED",
        message: "Select a store to continue.",
        stores: storeRows,
        loginId,
      };
    }
    const effectiveStoreId = selectedStoreId ?? allowedStores[0]!;
    if (!allowedStores.includes(effectiveStoreId)) {
      throw new Error("Selected store is not assigned for this user.");
    }
    await pool.query(
      `UPDATE app_users SET store_id = $2, updated_at = now() WHERE id = $1`,
      [user.id, effectiveStoreId],
    );
    refreshed = { ...user, storeId: effectiveStoreId };
  }

  await createAuthSession(pool, res, refreshed.id);
  return { ok: true, user: stripPassword(refreshed) };
}
