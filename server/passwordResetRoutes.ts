import crypto from "node:crypto";
import type { Express, Request } from "express";
import type { Pool } from "pg";
import { isEmailConfigured } from "./messaging/config";
import { sendPasswordResetEmail } from "./messaging/passwordResetEmail";
import { resolvePublicAppBaseUrl } from "./publicAppUrl";

const RESET_TTL_MS = 60 * 60 * 1000;
const GENERIC_OK_MESSAGE =
  "If an account exists for that email or employee ID, we sent password reset instructions. Check your inbox and spam folder.";

function hashPassword(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function normalizeEmployeeCode(value: string): string {
  return String(value).trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 24);
}

function normalizeEmail(value: string): string {
  return String(value).trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
  const s = normalizeEmail(value);
  if (!s || s.length > 240) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

type ResetUserRow = {
  id: string;
  email: string;
  display_name: string;
  can_login: boolean;
};

async function findUserForPasswordReset(pool: Pool, loginId: string): Promise<ResetUserRow | null> {
  const raw = String(loginId).trim();
  if (!raw) return null;
  if (raw.includes("@")) {
    const email = normalizeEmail(raw);
    if (!isValidEmail(email)) return null;
    const { rows } = await pool.query<ResetUserRow>(
      `SELECT id, email, display_name, can_login
       FROM app_users
       WHERE LOWER(email) = $1
       LIMIT 1`,
      [email],
    );
    return rows[0] ?? null;
  }
  const emp = normalizeEmployeeCode(raw);
  const { rows } = await pool.query<ResetUserRow>(
    `SELECT id, email, display_name, can_login
     FROM app_users
     WHERE employee_code = $1 OR id = $1
     LIMIT 1`,
    [emp],
  );
  return rows[0] ?? null;
}

export function registerPasswordResetRoutes(
  app: Express,
  pool: Pool | null,
  hooks?: { onPasswordChanged?: () => void | Promise<void> },
): void {
  app.post("/api/auth/forgot-password", async (req, res) => {
    if (!pool) {
      res.status(503).json({ ok: false, message: "Database is not available." });
      return;
    }
    const loginId = String(req.body?.loginId ?? req.body?.email ?? "").trim();
    if (!loginId) {
      res.status(400).json({ ok: false, message: "Enter your employee ID or email address." });
      return;
    }
    if (!isEmailConfigured()) {
      res.status(503).json({
        ok: false,
        message:
          "Password reset email is not configured. Ask your administrator to set SMTP under Settings → SMS, email & WhatsApp.",
      });
      return;
    }

    try {
      const user = await findUserForPasswordReset(pool, loginId);
      if (user && user.can_login && isValidEmail(user.email)) {
        const rawToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = hashToken(rawToken);
        const expiresAt = new Date(Date.now() + RESET_TTL_MS);

        await pool.query(
          `UPDATE password_reset_tokens SET used_at = now()
           WHERE user_id = $1 AND used_at IS NULL`,
          [user.id],
        );
        await pool.query(
          `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
           VALUES ($1, $2, $3)`,
          [user.id, tokenHash, expiresAt.toISOString()],
        );

        const base = resolvePublicAppBaseUrl(req as Request);
        const resetUrl = `${base}/login/reset-password?token=${encodeURIComponent(rawToken)}`;
        await sendPasswordResetEmail(user.email, user.display_name, resetUrl);
      }

      res.json({ ok: true, message: GENERIC_OK_MESSAGE });
    } catch (e) {
      console.error("[forgot-password]", e);
      const msg = e instanceof Error ? e.message : "Could not send reset email.";
      res.status(500).json({ ok: false, message: msg });
    }
  });

  app.get("/api/auth/reset-password/validate", async (req, res) => {
    if (!pool) {
      res.json({ valid: false });
      return;
    }
    const token = String(req.query.token ?? "").trim();
    if (!token) {
      res.json({ valid: false });
      return;
    }
    try {
      const { rows } = await pool.query<{ id: string }>(
        `SELECT id FROM password_reset_tokens
         WHERE token_hash = $1
           AND used_at IS NULL
           AND expires_at > now()
         LIMIT 1`,
        [hashToken(token)],
      );
      res.json({ valid: rows.length > 0 });
    } catch {
      res.json({ valid: false });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    if (!pool) {
      res.status(503).json({ ok: false, message: "Database is not available." });
      return;
    }
    const token = String(req.body?.token ?? "").trim();
    const password = String(req.body?.password ?? "");
    if (!token) {
      res.status(400).json({ ok: false, message: "Reset link is invalid or expired." });
      return;
    }
    if (password.length < 4) {
      res.status(400).json({ ok: false, message: "Password must be at least 4 characters." });
      return;
    }

    const tokenHash = hashToken(token);
    try {
      const { rows } = await pool.query<{ id: string; user_id: string }>(
        `SELECT id, user_id FROM password_reset_tokens
         WHERE token_hash = $1
           AND used_at IS NULL
           AND expires_at > now()
         LIMIT 1`,
        [tokenHash],
      );
      const row = rows[0];
      if (!row) {
        res.status(400).json({ ok: false, message: "Reset link is invalid or has expired. Request a new link." });
        return;
      }

      const pwdHash = hashPassword(password);
      await pool.query(
        `UPDATE app_users
         SET password_hash = $2,
             plain_password = $3,
             updated_at = now()
         WHERE id = $1`,
        [row.user_id, pwdHash, password],
      );
      await pool.query(`UPDATE password_reset_tokens SET used_at = now() WHERE id = $1`, [row.id]);
      await pool.query(`UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [
        row.user_id,
      ]);
      await hooks?.onPasswordChanged?.();

      res.json({ ok: true, message: "Password updated. You can sign in with your new password." });
    } catch (e) {
      console.error("[reset-password]", e);
      res.status(500).json({ ok: false, message: "Could not reset password. Try again." });
    }
  });
}
