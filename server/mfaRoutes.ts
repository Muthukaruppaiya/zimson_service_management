import type { Express, NextFunction, Request, Response } from "express";
import type { Pool } from "pg";
import QRCode from "qrcode";
import type { DemoUser } from "../src/types/user";
import {
  buildOtpAuthUri,
  decryptMfaSecret,
  encryptMfaSecret,
  generateMfaSecret,
  generateRecoveryCodes,
  verifyTotp,
  verifyUserMfaCredential,
} from "./mfaSecurity";

type RequireAuth = (req: Request, res: Response, next: NextFunction) => void;

export function registerMfaRoutes(
  app: Express,
  pool: Pool,
  requireAuth: RequireAuth,
  getSessionUserId: (req: Request) => Promise<string | null>,
  getUserById: (id: string) => DemoUser | undefined,
  hashPassword: (value: string) => string,
): void {
  app.get("/api/auth/mfa/status", requireAuth, async (req, res) => {
    const userId = await getSessionUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }
    const { rows } = await pool.query<{
      mfa_enabled: boolean;
      mfa_enabled_at: Date | string | null;
      recovery_count: number;
    }>(
      `SELECT mfa_enabled, mfa_enabled_at,
              jsonb_array_length(COALESCE(mfa_recovery_code_hashes, '[]'::jsonb))::int AS recovery_count
       FROM app_users WHERE id = $1`,
      [userId],
    );
    const row = rows[0];
    res.json({
      enabled: Boolean(row?.mfa_enabled),
      enabledAt: row?.mfa_enabled_at
        ? row.mfa_enabled_at instanceof Date
          ? row.mfa_enabled_at.toISOString()
          : String(row.mfa_enabled_at)
        : null,
      recoveryCodesRemaining: row?.recovery_count ?? 0,
    });
  });

  app.post("/api/auth/mfa/setup", requireAuth, async (req, res) => {
    const userId = await getSessionUserId(req);
    const user = userId ? getUserById(userId) : undefined;
    const password = String(req.body?.password ?? "");
    if (!user || user.password !== hashPassword(password)) {
      res.status(401).json({ error: "Current password is incorrect." });
      return;
    }
    const secret = generateMfaSecret();
    const encrypted = encryptMfaSecret(secret);
    await pool.query(
      `UPDATE app_users
       SET mfa_pending_secret_encrypted = $2, updated_at = now()
       WHERE id = $1`,
      [user.id, encrypted],
    );
    const accountLabel = user.email || user.employeeCode || user.id;
    const otpAuthUri = buildOtpAuthUri(secret, accountLabel);
    const qrDataUrl = await QRCode.toDataURL(otpAuthUri, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 280,
    });
    res.json({ secret, otpAuthUri, qrDataUrl });
  });

  app.post("/api/auth/mfa/confirm", requireAuth, async (req, res) => {
    const userId = await getSessionUserId(req);
    const code = String(req.body?.code ?? "").trim();
    if (!userId) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }
    const { rows } = await pool.query<{ mfa_pending_secret_encrypted: string | null }>(
      `SELECT mfa_pending_secret_encrypted FROM app_users WHERE id = $1`,
      [userId],
    );
    const pendingEncrypted = rows[0]?.mfa_pending_secret_encrypted;
    if (!pendingEncrypted) {
      res.status(400).json({ error: "Start MFA setup again." });
      return;
    }
    let secret: string;
    try {
      secret = decryptMfaSecret(pendingEncrypted);
    } catch {
      res.status(400).json({ error: "MFA setup expired or encryption key changed. Start again." });
      return;
    }
    if (!verifyTotp(secret, code)) {
      res.status(400).json({ error: "Invalid authenticator code. Check your device time and try again." });
      return;
    }
    const recovery = generateRecoveryCodes();
    await pool.query(
      `UPDATE app_users
       SET mfa_enabled = true,
           mfa_secret_encrypted = mfa_pending_secret_encrypted,
           mfa_pending_secret_encrypted = NULL,
           mfa_recovery_code_hashes = $2::jsonb,
           mfa_enabled_at = now(),
           updated_at = now()
       WHERE id = $1`,
      [userId, JSON.stringify(recovery.hashes)],
    );
    res.json({ ok: true, recoveryCodes: recovery.codes });
  });

  app.post("/api/auth/mfa/recovery-codes", requireAuth, async (req, res) => {
    const userId = await getSessionUserId(req);
    const code = String(req.body?.code ?? "").trim();
    if (!userId || !(await verifyUserMfaCredential(pool, userId, code))) {
      res.status(401).json({ error: "Valid authenticator code is required." });
      return;
    }
    const recovery = generateRecoveryCodes();
    await pool.query(
      `UPDATE app_users SET mfa_recovery_code_hashes = $2::jsonb, updated_at = now() WHERE id = $1`,
      [userId, JSON.stringify(recovery.hashes)],
    );
    res.json({ ok: true, recoveryCodes: recovery.codes });
  });

  /** Super Admin lockout recovery — user lost both authenticator device and recovery codes. */
  app.get("/api/auth/admin/mfa-users", requireAuth, async (req, res) => {
    const actorId = await getSessionUserId(req);
    const actor = actorId ? getUserById(actorId) : undefined;
    if (!actor || actor.role !== "super_admin") {
      res.status(403).json({ error: "Super Admin access only." });
      return;
    }
    const { rows } = await pool.query<{
      id: string;
      display_name: string;
      email: string;
      employee_code: string | null;
      role: string;
      mfa_enabled_at: Date | string | null;
      recovery_count: number;
    }>(
      `SELECT id, display_name, email, employee_code, role, mfa_enabled_at,
              jsonb_array_length(COALESCE(mfa_recovery_code_hashes, '[]'::jsonb))::int AS recovery_count
       FROM app_users
       WHERE mfa_enabled = true
       ORDER BY display_name`,
    );
    res.json({
      users: rows.map((r) => ({
        id: r.id,
        displayName: r.display_name,
        email: r.email,
        employeeCode: r.employee_code,
        role: r.role,
        enabledAt: r.mfa_enabled_at
          ? r.mfa_enabled_at instanceof Date
            ? r.mfa_enabled_at.toISOString()
            : String(r.mfa_enabled_at)
          : null,
        recoveryCodesRemaining: r.recovery_count,
      })),
    });
  });

  app.post("/api/auth/admin/users/:userId/mfa-reset", requireAuth, async (req, res) => {
    const actorId = await getSessionUserId(req);
    const actor = actorId ? getUserById(actorId) : undefined;
    if (!actor || actor.role !== "super_admin") {
      res.status(403).json({ error: "Super Admin access only." });
      return;
    }
    const password = String(req.body?.password ?? "");
    if (actor.password !== hashPassword(password)) {
      res.status(401).json({ error: "Your current password is required to reset another user's MFA." });
      return;
    }
    const targetId = String(req.params.userId ?? "").trim();
    const target = getUserById(targetId);
    if (!target) {
      res.status(404).json({ error: "User not found." });
      return;
    }
    await pool.query(
      `UPDATE app_users
       SET mfa_enabled = false,
           mfa_secret_encrypted = NULL,
           mfa_pending_secret_encrypted = NULL,
           mfa_recovery_code_hashes = '[]'::jsonb,
           mfa_enabled_at = NULL,
           updated_at = now()
       WHERE id = $1`,
      [targetId],
    );
    await pool.query(`DELETE FROM mfa_login_challenges WHERE user_id = $1`, [targetId]);
    await pool.query(
      `UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
      [targetId],
    );
    console.warn(`[mfa] Super Admin ${actor.id} reset MFA for user ${targetId}.`);
    res.json({
      ok: true,
      message: `MFA reset for ${target.displayName}. They can sign in with their password and must re-enrol.`,
    });
  });

  app.post("/api/auth/mfa/disable", requireAuth, async (req, res) => {
    const userId = await getSessionUserId(req);
    const user = userId ? getUserById(userId) : undefined;
    const password = String(req.body?.password ?? "");
    const code = String(req.body?.code ?? "").trim();
    if (!user || user.password !== hashPassword(password)) {
      res.status(401).json({ error: "Current password is incorrect." });
      return;
    }
    if (!(await verifyUserMfaCredential(pool, user.id, code))) {
      res.status(401).json({ error: "Valid authenticator or recovery code is required." });
      return;
    }
    await pool.query(
      `UPDATE app_users
       SET mfa_enabled = false,
           mfa_secret_encrypted = NULL,
           mfa_pending_secret_encrypted = NULL,
           mfa_recovery_code_hashes = '[]'::jsonb,
           mfa_enabled_at = NULL,
           updated_at = now()
       WHERE id = $1`,
      [user.id],
    );
    await pool.query(`DELETE FROM mfa_login_challenges WHERE user_id = $1`, [user.id]);
    res.json({ ok: true });
  });
}
