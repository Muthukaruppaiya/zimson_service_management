import crypto from "node:crypto";
import type { Express, NextFunction, Request, Response } from "express";
import type { Pool } from "pg";
import type { DemoUser } from "../src/types/user";
import { createId } from "../src/lib/id";
import {
  getResolvedRazorpayConfig,
  saveRazorpaySettings,
  toPublicRazorpaySettings,
  type RazorpaySettingsDb,
} from "./razorpaySettingsStore";

type Authed = Request & { userId: string; rawBody?: Buffer };

const RAZORPAY_API = "https://api.razorpay.com/v1";

function parseBool(raw: unknown): boolean | undefined {
  if (raw === true || raw === "true") return true;
  if (raw === false || raw === "false") return false;
  return undefined;
}

function basicAuth(keyId: string, keySecret: string): string {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

async function razorpayFetch<T>(
  path: string,
  keyId: string,
  keySecret: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${RAZORPAY_API}${path}`, {
    ...init,
    headers: {
      Authorization: basicAuth(keyId, keySecret),
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const msg =
      typeof data === "object" && data !== null && "error" in data
        ? String((data as { error?: { description?: string } }).error?.description ?? "Razorpay request failed.")
        : `Razorpay request failed (${res.status}).`;
    throw new Error(msg);
  }
  return data as T;
}

export async function razorpayWebhookHandler(req: Request, res: Response, pool: Pool): Promise<void> {
  const cfg = getResolvedRazorpayConfig();
  if (!cfg.webhookSecret) {
    res.status(503).json({ error: "Razorpay webhook secret is not configured." });
    return;
  }
  const raw =
    (req as Authed).rawBody ??
    (Buffer.isBuffer(req.body) ? req.body : Buffer.from(typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {})));
  const signature = String(req.headers["x-razorpay-signature"] ?? "");
  const expected = crypto.createHmac("sha256", cfg.webhookSecret).update(raw).digest("hex");
  if (!signature || expected !== signature) {
    res.status(400).json({ error: "Invalid Razorpay webhook signature." });
    return;
  }
  let payload: { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string; status?: string } } } };
  try {
    payload = JSON.parse(raw.toString("utf8")) as typeof payload;
  } catch {
    res.status(400).json({ error: "Invalid webhook JSON." });
    return;
  }
  const event = String(payload.event ?? "");
  const payment = payload.payload?.payment?.entity;
  const orderId = String(payment?.order_id ?? "").trim();
  const paymentId = String(payment?.id ?? "").trim();
  if (event === "payment.captured" && orderId && paymentId) {
    await pool.query(
      `UPDATE razorpay_orders
       SET status = 'paid',
           payment_id = COALESCE(payment_id, $2),
           paid_at = COALESCE(paid_at, now())
       WHERE razorpay_order_id = $1`,
      [orderId, paymentId],
    );
  }
  if (event === "payment.failed" && orderId) {
    await pool.query(
      `UPDATE razorpay_orders SET status = 'failed' WHERE razorpay_order_id = $1 AND status <> 'paid'`,
      [orderId],
    );
  }
  res.json({ ok: true });
}

export function registerRazorpayRoutes(
  app: Express,
  pool: Pool,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
  getUserById: (id: string) => DemoUser | null,
): void {
  app.post("/api/payments/razorpay/webhook", (req, res) => {
    void razorpayWebhookHandler(req, res, pool);
  });
  app.get("/api/payments/razorpay/config", requireAuth, (_req, res) => {
    const cfg = getResolvedRazorpayConfig();
    res.json({ enabled: cfg.enabled, keyId: cfg.enabled ? cfg.keyId : "" });
  });

  app.get("/api/settings/razorpay", requireAuth, (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    if (actor.role !== "super_admin") {
      res.status(403).json({ error: "Only super admin can view Razorpay settings." });
      return;
    }
    res.json({ settings: toPublicRazorpaySettings() });
  });

  app.put("/api/settings/razorpay", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    if (actor.role !== "super_admin") {
      res.status(403).json({ error: "Only super admin can update Razorpay settings." });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const patch: RazorpaySettingsDb = {
      enabled: parseBool(body.enabled),
      keyId: String(body.keyId ?? "").trim().slice(0, 80) || undefined,
      keySecret: String(body.keySecret ?? "").trim().slice(0, 200) || undefined,
      webhookSecret: String(body.webhookSecret ?? "").trim().slice(0, 200) || undefined,
    };
    try {
      const settings = await saveRazorpaySettings(patch, actor.displayName?.trim() || actor.email);
      res.json({ settings });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not save Razorpay settings." });
    }
  });

  app.post("/api/payments/razorpay/order", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    const cfg = getResolvedRazorpayConfig();
    if (!cfg.enabled) {
      res.status(503).json({ error: "Razorpay is not enabled." });
      return;
    }
    const body = req.body as {
      amountInr?: number;
      purpose?: string;
      customerName?: string;
      customerPhone?: string;
      customerEmail?: string;
    };
    const amountInr = Math.round(Number(body.amountInr) * 100) / 100;
    if (!Number.isFinite(amountInr) || amountInr < 1) {
      res.status(400).json({ error: "Amount must be at least ₹1." });
      return;
    }
    const amountPaise = Math.round(amountInr * 100);
    const purpose = String(body.purpose ?? "quick_bill").trim().slice(0, 40) || "quick_bill";
    const localId = createId("rzp");
    try {
      const created = await razorpayFetch<{ id: string; amount: number; currency: string }>(
        "/orders",
        cfg.keyId,
        cfg.keySecret,
        {
          method: "POST",
          body: JSON.stringify({
            amount: amountPaise,
            currency: "INR",
            receipt: localId.slice(0, 40),
            notes: {
              purpose,
              actorId: actor.id,
            },
          }),
        },
      );
      await pool.query(
        `INSERT INTO razorpay_orders (
           id, razorpay_order_id, amount_paise, currency, purpose, status,
           customer_name, customer_phone, customer_email, notes, created_by
         ) VALUES ($1,$2,$3,'INR',$4,'created',$5,$6,$7,$8::jsonb,$9)`,
        [
          localId,
          created.id,
          amountPaise,
          purpose,
          String(body.customerName ?? "").trim().slice(0, 200) || null,
          String(body.customerPhone ?? "").trim().slice(0, 20) || null,
          String(body.customerEmail ?? "").trim().slice(0, 200) || null,
          JSON.stringify({ purpose, actorId: actor.id }),
          actor.id,
        ],
      );
      res.json({
        orderId: created.id,
        amountPaise,
        currency: created.currency || "INR",
        keyId: cfg.keyId,
      });
    } catch (e) {
      console.error(e);
      res.status(502).json({ error: e instanceof Error ? e.message : "Could not create Razorpay order." });
    }
  });

  app.post("/api/payments/razorpay/verify", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    const cfg = getResolvedRazorpayConfig();
    if (!cfg.enabled) {
      res.status(503).json({ error: "Razorpay is not enabled." });
      return;
    }
    const body = req.body as { orderId?: string; paymentId?: string; signature?: string };
    const orderId = String(body.orderId ?? "").trim();
    const paymentId = String(body.paymentId ?? "").trim();
    const signature = String(body.signature ?? "").trim();
    if (!orderId || !paymentId || !signature) {
      res.status(400).json({ error: "orderId, paymentId and signature are required." });
      return;
    }
    const expected = crypto.createHmac("sha256", cfg.keySecret).update(`${orderId}|${paymentId}`).digest("hex");
    if (expected !== signature) {
      res.status(400).json({ error: "Razorpay signature verification failed." });
      return;
    }
    try {
      const upd = await pool.query(
        `UPDATE razorpay_orders
         SET status = 'paid',
             payment_id = $2,
             signature = $3,
             paid_at = now()
         WHERE razorpay_order_id = $1`,
        [orderId, paymentId, signature],
      );
      if ((upd.rowCount ?? 0) === 0) {
        res.status(404).json({ error: "Razorpay order not found." });
        return;
      }
      res.json({ ok: true, orderId, paymentId });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not record Razorpay payment." });
    }
  });
}
