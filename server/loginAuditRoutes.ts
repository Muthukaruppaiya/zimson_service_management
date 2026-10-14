import type { Express, NextFunction, Request, Response } from "express";
import type { Pool } from "pg";
import type { DemoUser } from "../src/types/user";
import type { OtpDeliveryResult } from "./messaging/deliverOtp";

type Authed = Request & { userId: string };

export type LoginAuditEventType =
  | "PASSWORD_FAILED"
  | "LOGIN_BLOCKED"
  | "ALREADY_LOGGED_IN"
  | "OTP_SENT"
  | "OTP_VERIFIED"
  | "OTP_FAILED"
  | "LOGIN_SUCCESS"
  | "LOGOUT";

export type LoginAuditInput = {
  eventType: LoginAuditEventType;
  loginId?: string | null;
  user?: Pick<DemoUser, "id" | "displayName" | "role" | "regionId" | "storeId" | "employeeCode"> | null;
  storeId?: string | null;
  otpTargets?: OtpDeliveryResult[] | null;
  otpCode?: string | null;
  otpShownOnScreen?: boolean;
  trustedDevice?: boolean;
  message?: string | null;
  req?: Request;
};

function clientIp(req: Request | undefined): string | null {
  if (!req) return null;
  const fwd = String(req.headers["x-forwarded-for"] ?? "")
    .split(",")[0]
    ?.trim();
  return (fwd || req.socket?.remoteAddress || "").slice(0, 64) || null;
}

/** Best-effort audit write; login must never fail because of it. */
export async function recordLoginEvent(pool: Pool | null, input: LoginAuditInput): Promise<void> {
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO login_audit_events
         (event_type, login_id, user_id, user_name, employee_code, role, region_id, store_id,
          otp_targets, otp_shown_on_screen, trusted_device, message, ip_address, user_agent, otp_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14, $15)`,
      [
        input.eventType,
        input.loginId?.slice(0, 200) ?? null,
        input.user?.id ?? null,
        input.user?.displayName ?? null,
        input.user?.employeeCode ?? null,
        input.user?.role ?? null,
        input.user?.regionId ?? null,
        input.storeId ?? input.user?.storeId ?? null,
        input.otpTargets ? JSON.stringify(input.otpTargets) : null,
        input.otpShownOnScreen ?? null,
        input.trustedDevice ?? null,
        input.message?.slice(0, 500) ?? null,
        clientIp(input.req),
        String(input.req?.headers["user-agent"] ?? "").slice(0, 400) || null,
        input.otpCode?.slice(0, 12) ?? null,
      ],
    );
  } catch (e) {
    console.warn("[login-audit] write failed:", e instanceof Error ? e.message : e);
  }
}

type AuditRow = {
  id: string;
  created_at: Date;
  event_type: string;
  login_id: string | null;
  user_id: string | null;
  user_name: string | null;
  employee_code: string | null;
  role: string | null;
  region_id: string | null;
  region_name: string | null;
  store_id: string | null;
  store_name: string | null;
  otp_targets: OtpDeliveryResult[] | null;
  otp_code: string | null;
  otp_shown_on_screen: boolean | null;
  trusted_device: boolean | null;
  message: string | null;
  ip_address: string | null;
  user_agent: string | null;
};

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function registerLoginAuditRoutes(
  app: Express,
  pool: Pool,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
  getUserById: (id: string) => DemoUser | null,
): void {
  app.get("/api/reports/login-audit", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    if (actor.role !== "super_admin" && actor.role !== "admin") {
      res.status(403).json({ error: "Only Admin or Super Admin can view the login report." });
      return;
    }

    const from = String(req.query.from ?? "").trim();
    const to = String(req.query.to ?? "").trim();
    const where: string[] = [];
    const params: unknown[] = [];
    if (DAY_RE.test(from)) {
      params.push(from);
      where.push(`(e.created_at AT TIME ZONE 'Asia/Kolkata')::date >= $${params.length}::date`);
    }
    if (DAY_RE.test(to)) {
      params.push(to);
      where.push(`(e.created_at AT TIME ZONE 'Asia/Kolkata')::date <= $${params.length}::date`);
    }
    if (actor.role === "admin") {
      if (!actor.regionId) {
        res.json({ events: [] });
        return;
      }
      params.push(actor.regionId);
      where.push(`e.region_id = $${params.length} AND COALESCE(e.role, '') <> 'super_admin'`);
    }

    try {
      const { rows } = await pool.query<AuditRow>(
        `SELECT e.id, e.created_at, e.event_type, e.login_id, e.user_id, e.user_name, e.employee_code,
                e.role, e.region_id, r.name AS region_name, e.store_id, s.name AS store_name,
                e.otp_targets, e.otp_code, e.otp_shown_on_screen, e.trusted_device, e.message, e.ip_address, e.user_agent
         FROM login_audit_events e
         LEFT JOIN regions r ON r.id = e.region_id
         LEFT JOIN stores s ON s.id = e.store_id
         ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
         ORDER BY e.created_at DESC
         LIMIT 5000`,
        params,
      );
      res.json({
        events: rows.map((r) => ({
          id: r.id,
          createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
          eventType: r.event_type,
          loginId: r.login_id,
          userId: r.user_id,
          userName: r.user_name,
          employeeCode: r.employee_code,
          role: r.role,
          regionId: r.region_id,
          regionName: r.region_name,
          storeId: r.store_id,
          storeName: r.store_name,
          otpTargets: Array.isArray(r.otp_targets) ? r.otp_targets : [],
          otpCode: r.otp_code,
          otpShownOnScreen: r.otp_shown_on_screen,
          trustedDevice: r.trusted_device,
          message: r.message,
          ipAddress: r.ip_address,
          userAgent: r.user_agent,
        })),
      });
    } catch (e) {
      console.error("[reports/login-audit]", e);
      res.status(500).json({ error: "Could not load login report." });
    }
  });
}
