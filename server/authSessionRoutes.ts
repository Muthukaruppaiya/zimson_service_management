import type { Express, NextFunction, Request, Response } from "express";
import type { Pool } from "pg";
import type { DemoUser } from "../src/types/user";
import {
  listActiveSessions,
  revokeAllSessionsForUser,
  revokeSessionById,
  SESSION_COOKIE,
} from "./authSession";

type AuthSessionRouteDeps = {
  requireAuth: (req: Request, res: Response, next: NextFunction) => void;
  findUser: (userId: string) => DemoUser | undefined;
  getSessionUserId: (req: Request) => Promise<string | null>;
  resolveUserByLogin: (loginId: string, password: string) => DemoUser | null;
  parseCookies: (header?: string) => Record<string, string>;
};

function requireSuperAdmin(deps: AuthSessionRouteDeps) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const uid = await deps.getSessionUserId(req);
    if (!uid) {
      res.status(401).json({ error: "Not signed in." });
      return;
    }
    const actor = deps.findUser(uid);
    if (!actor || actor.role !== "super_admin") {
      res.status(403).json({ error: "Super Admin access only." });
      return;
    }
    (req as Request & { userId: string }).userId = uid;
    next();
  };
}

export function registerAuthSessionRoutes(app: Express, pool: Pool, deps: AuthSessionRouteDeps): void {
  const superAdmin = requireSuperAdmin(deps);

  app.get("/api/auth/admin/sessions", deps.requireAuth, superAdmin, async (_req, res) => {
    try {
      const sessions = await listActiveSessions(pool);
      res.json({ sessions });
    } catch (e) {
      console.error("[auth/admin/sessions]", e);
      res.status(500).json({ error: "Could not load active sessions." });
    }
  });

  app.post("/api/auth/admin/sessions/:sessionId/revoke", deps.requireAuth, superAdmin, async (req, res) => {
    const sessionId = String(req.params.sessionId ?? "").trim();
    if (!sessionId) {
      res.status(400).json({ error: "Session id is required." });
      return;
    }
    try {
      const revoked = await revokeSessionById(pool, sessionId);
      if (!revoked) {
        res.status(404).json({ error: "Session not found or already ended." });
        return;
      }
      res.json({ ok: true, message: "User signed out from that device." });
    } catch (e) {
      console.error("[auth/admin/revoke]", e);
      res.status(500).json({ error: "Could not sign out session." });
    }
  });

  app.post("/api/auth/admin/users/:userId/revoke-all-sessions", deps.requireAuth, superAdmin, async (req, res) => {
    const userId = String(req.params.userId ?? "").trim();
    if (!userId || !deps.findUser(userId)) {
      res.status(404).json({ error: "User not found." });
      return;
    }
    try {
      const revokedCount = await revokeAllSessionsForUser(pool, userId);
      res.json({
        ok: true,
        revokedCount,
        message:
          revokedCount > 0
            ? `Signed out ${revokedCount} active session(s) for this user.`
            : "No active sessions for this user.",
      });
    } catch (e) {
      console.error("[auth/admin/revoke-all]", e);
      res.status(500).json({ error: "Could not sign out all sessions." });
    }
  });

  /** Login page: end every active session for this account (requires password). */
  app.post("/api/auth/sign-out-all-devices", async (req, res) => {
    const loginId = String(req.body?.loginId ?? req.body?.employeeCode ?? "").trim();
    const password = String(req.body?.password ?? "").trim();
    if (!loginId || !password) {
      res.status(400).json({ ok: false, message: "Enter your username and password." });
      return;
    }
    const found = deps.resolveUserByLogin(loginId, password);
    if (!found) {
      res.status(401).json({ ok: false, message: "Invalid username or password." });
      return;
    }
    if (found.canLogin === false) {
      res.status(403).json({ ok: false, message: "This profile cannot sign in." });
      return;
    }
    try {
      const revokedCount = await revokeAllSessionsForUser(pool, found.id);
      const sid = deps.parseCookies(req.headers.cookie)[SESSION_COOKIE];
      if (sid) {
        await revokeSessionById(pool, sid);
      }
      res.clearCookie(SESSION_COOKIE, { path: "/" });
      res.json({
        ok: true,
        revokedCount,
        message:
          revokedCount > 0
            ? "All devices signed out. You can sign in now."
            : "No other active sessions. You can sign in now.",
      });
    } catch (e) {
      console.error("[auth/sign-out-all-devices]", e);
      res.status(500).json({ ok: false, message: "Could not sign out all devices." });
    }
  });
}
