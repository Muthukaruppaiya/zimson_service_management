import crypto from "node:crypto";
import type { Express, NextFunction, Request, Response } from "express";
import type { Pool } from "pg";
import type { DemoUser } from "../src/types/user";
import type { PinelabsPosMode, PinelabsTxn, PinelabsTxnStatus } from "../src/types/pinelabsPayment";
import { getResolvedPinelabsForStore, type ResolvedPinelabsConfig } from "./pinelabsSettingsStore";

type Authed = Request & { userId: string };

const API_PATH = "/API/CloudBasedIntegration/V1";

/** Plutus AllowedPaymentMode codes: 1 = Card, 10 = UPI Sale, 11 = UPI Bharat QR. */
const ALLOWED_MODE: Record<PinelabsPosMode, string> = {
  card: "1",
  upi: "10|11",
};

/** Plutus status codes that mean the bill is still open on the terminal. */
const PENDING_RESPONSE_CODES = new Set([1001]);

const AUTO_CANCEL_MINUTES = 5;

type TxnRow = {
  id: string;
  store_id: string | null;
  transaction_number: string;
  ptrid: string | null;
  amount_paise: string;
  status: PinelabsTxnStatus;
  response_message: string | null;
  payment_mode: string | null;
  rrn: string | null;
  approval_code: string | null;
  card_last4: string | null;
  created_at: Date;
  environment: string;
};

function toPublic(row: TxnRow): PinelabsTxn {
  return {
    id: row.id,
    storeId: row.store_id,
    transactionNumber: row.transaction_number,
    ptrid: row.ptrid != null ? Number(row.ptrid) : null,
    amountInr: Number(row.amount_paise) / 100,
    status: row.status,
    responseMessage: row.response_message,
    paymentMode: row.payment_mode,
    rrn: row.rrn,
    approvalCode: row.approval_code,
    cardLast4: row.card_last4,
    createdAt: row.created_at.toISOString(),
  };
}

function numericOrString(v: string): number | string {
  return /^\d+$/.test(v) ? Number(v) : v;
}

function resolveStoreId(actor: DemoUser, requested: unknown): string | null {
  const want = String(requested ?? "").trim();
  const isAdmin = actor.role === "super_admin" || actor.role === "admin";
  if (want) {
    if (isAdmin) return want;
    if (actor.storeId === want || (actor.storeIds ?? []).includes(want)) return want;
    if (actor.role.startsWith("ho_") || actor.role.startsWith("service_centre")) return want;
    return null;
  }
  return actor.storeId ?? null;
}

async function plutusPost(cfg: ResolvedPinelabsConfig, endpoint: string, body: Record<string, unknown>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(`${cfg.apiBase}${API_PATH}/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      throw new Error(`Pine Labs returned an invalid response (HTTP ${res.status}).`);
    }
    if (!res.ok) {
      throw new Error(String(data.ResponseMessage ?? `Pine Labs request failed (HTTP ${res.status}).`));
    }
    return data;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new Error("Pine Labs did not respond in time.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function authFields(cfg: ResolvedPinelabsConfig) {
  return {
    MerchantID: numericOrString(cfg.merchantId),
    SecurityToken: cfg.securityToken,
    StoreId: numericOrString(cfg.pineLabsStoreId),
    ClientId: numericOrString(cfg.clientId),
  };
}

function txnDataMap(data: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(data)) return out;
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const tag = String((item as { Tag?: unknown }).Tag ?? "").trim();
    if (!tag) continue;
    out[tag.toLowerCase()] = String((item as { Value?: unknown }).Value ?? "").trim();
  }
  return out;
}

function newTransactionNumber(): string {
  return `ZW${Date.now()}${crypto.randomInt(100, 999)}`;
}

export function registerPinelabsRoutes(
  app: Express,
  pool: Pool,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
  getUserById: (id: string) => DemoUser | null,
): void {
  app.get("/api/payments/pinelabs/config", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    const storeId = resolveStoreId(actor, req.query.storeId);
    if (!storeId) {
      res.json({ enabled: false, storeId: null, environment: null });
      return;
    }
    try {
      const cfg = await getResolvedPinelabsForStore(storeId);
      res.json({
        enabled: Boolean(cfg?.configured),
        storeId,
        environment: cfg?.configured ? cfg.environment : null,
      });
    } catch (e) {
      console.error(e);
      res.json({ enabled: false, storeId, environment: null });
    }
  });

  app.post("/api/payments/pinelabs/upload", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    const storeId = resolveStoreId(actor, req.body?.storeId);
    if (!storeId) {
      res.status(400).json({ error: "Select the store whose Pine Labs machine should take this payment." });
      return;
    }
    const mode: PinelabsPosMode = req.body?.mode === "upi" ? "upi" : "card";
    const amountInr = Math.round(Number(req.body?.amountInr) * 100) / 100;
    if (!Number.isFinite(amountInr) || amountInr < 1) {
      res.status(400).json({ error: "Amount must be at least ₹1." });
      return;
    }
    const purpose = String(req.body?.purpose ?? "").trim().slice(0, 40);
    const cfg = await getResolvedPinelabsForStore(storeId).catch(() => null);
    if (!cfg?.configured) {
      res.status(400).json({ error: "Pine Labs POS is not configured for this store (Settings → Pine Labs POS)." });
      return;
    }
    const amountPaise = Math.round(amountInr * 100);
    const transactionNumber = newTransactionNumber();
    const allowedMode = ALLOWED_MODE[mode];
    try {
      const data = await plutusPost(cfg, "UploadBilledTransaction", {
        TransactionNumber: transactionNumber,
        SequenceNumber: 1,
        AllowedPaymentMode: allowedMode,
        Amount: amountPaise,
        UserID: (actor.employeeCode || actor.id).slice(0, 20),
        ...authFields(cfg),
        AutoCancelDurationInMinutes: AUTO_CANCEL_MINUTES,
        TotalInvoiceAmount: amountPaise,
      });
      const code = Number(data.ResponseCode ?? -1);
      const message = String(data.ResponseMessage ?? "").trim();
      const ptrid = Number(data.PlutusTransactionReferenceID ?? 0);
      const ok = code === 0 && ptrid > 0;
      const { rows } = await pool.query<TxnRow>(
        `INSERT INTO pinelabs_transactions (
           store_id, transaction_number, ptrid, amount_paise, allowed_payment_mode, purpose, environment,
           status, response_code, response_message, created_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          storeId,
          transactionNumber,
          ok ? ptrid : null,
          amountPaise,
          allowedMode,
          purpose,
          cfg.environment,
          ok ? "UPLOADED" : "FAILED",
          code,
          message || null,
          actor.id,
        ],
      );
      if (!ok) {
        res.status(400).json({ error: message || "Pine Labs rejected the transaction.", txn: toPublic(rows[0]!) });
        return;
      }
      res.json({ txn: toPublic(rows[0]!) });
    } catch (e) {
      console.error("[pinelabs] upload failed", e);
      res.status(502).json({ error: e instanceof Error ? e.message : "Could not reach Pine Labs." });
    }
  });

  async function loadTxn(id: string): Promise<TxnRow | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const { rows } = await pool.query<TxnRow>(`SELECT * FROM pinelabs_transactions WHERE id = $1::uuid`, [id]);
    return rows[0] ?? null;
  }

  app.get("/api/payments/pinelabs/:id/status", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    const row = await loadTxn(String(req.params.id ?? "").trim());
    if (!row) {
      res.status(404).json({ error: "Transaction not found." });
      return;
    }
    if (row.status !== "UPLOADED" || !row.ptrid || !row.store_id) {
      res.json({ txn: toPublic(row) });
      return;
    }
    const cfg = await getResolvedPinelabsForStore(row.store_id).catch(() => null);
    if (!cfg?.configured) {
      res.status(400).json({ error: "Pine Labs POS is no longer configured for this store." });
      return;
    }
    try {
      const data = await plutusPost(cfg, "GetCloudBasedTxnStatus", {
        ...authFields(cfg),
        UserID: (actor.employeeCode || actor.id).slice(0, 20),
        PlutusTransactionReferenceID: Number(row.ptrid),
        TransactionNumber: row.transaction_number,
      });
      const code = Number(data.ResponseCode ?? -1);
      const message = String(data.ResponseMessage ?? "").trim();
      const pending = PENDING_RESPONSE_CODES.has(code) || /UPLOADED|PENDING|INITIATED/i.test(message);
      if (pending) {
        res.json({ txn: { ...toPublic(row), responseMessage: message || row.response_message } });
        return;
      }
      const tx = txnDataMap(data.TransactionData);
      const approved = code === 0 && /APPROVED/i.test(message || "APPROVED");
      const cardNo = tx["card number"] ?? "";
      const { rows } = await pool.query<TxnRow>(
        `UPDATE pinelabs_transactions
         SET status = $2, response_code = $3, response_message = $4,
             payment_mode = $5, rrn = $6, approval_code = $7, card_last4 = $8, tid = $9,
             transaction_data = $10::jsonb, updated_at = now()
         WHERE id = $1::uuid AND status = 'UPLOADED'
         RETURNING *`,
        [
          row.id,
          approved ? "APPROVED" : "FAILED",
          code,
          message || null,
          tx.paymentmode || null,
          tx.rrn || null,
          tx.approvalcode || null,
          cardNo ? cardNo.replace(/\D/g, "").slice(-4) || null : null,
          tx.tid || null,
          JSON.stringify(data.TransactionData ?? null),
        ],
      );
      res.json({ txn: toPublic(rows[0] ?? row) });
    } catch (e) {
      console.error("[pinelabs] status failed", e);
      res.status(502).json({ error: e instanceof Error ? e.message : "Could not reach Pine Labs." });
    }
  });

  app.post("/api/payments/pinelabs/:id/cancel", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    const row = await loadTxn(String(req.params.id ?? "").trim());
    if (!row) {
      res.status(404).json({ error: "Transaction not found." });
      return;
    }
    if (row.status !== "UPLOADED" || !row.ptrid || !row.store_id) {
      res.json({ txn: toPublic(row) });
      return;
    }
    const cfg = await getResolvedPinelabsForStore(row.store_id).catch(() => null);
    if (!cfg?.configured) {
      res.status(400).json({ error: "Pine Labs POS is no longer configured for this store." });
      return;
    }
    try {
      const data = await plutusPost(cfg, "CancelTransactionForced", {
        ...authFields(cfg),
        PlutusTransactionReferenceID: Number(row.ptrid),
        Amount: Number(row.amount_paise),
        TakeToHomeScreen: true,
        ConfirmationRequired: true,
      });
      const code = Number(data.ResponseCode ?? -1);
      const message = String(data.ResponseMessage ?? "").trim();
      if (code !== 0) {
        res.status(400).json({ error: message || "Pine Labs could not cancel this transaction." });
        return;
      }
      const { rows } = await pool.query<TxnRow>(
        `UPDATE pinelabs_transactions
         SET status = 'CANCELLED', response_code = $2, response_message = $3, updated_at = now()
         WHERE id = $1::uuid AND status = 'UPLOADED'
         RETURNING *`,
        [row.id, code, message || "CANCELLED"],
      );
      res.json({ txn: toPublic(rows[0] ?? row) });
    } catch (e) {
      console.error("[pinelabs] cancel failed", e);
      res.status(502).json({ error: e instanceof Error ? e.message : "Could not reach Pine Labs." });
    }
  });
}
