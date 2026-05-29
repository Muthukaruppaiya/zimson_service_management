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
