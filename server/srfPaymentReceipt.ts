import crypto from "node:crypto";
import type { Request } from "express";
import type { Pool, PoolClient } from "pg";
import { formatPaymentSummary, type AdvancePaymentDetails } from "../src/lib/paymentModes";
import { inrAmountToWords } from "../src/lib/inrAmountToWords";
import type { SrfPaymentReceiptView } from "../src/types/srfPaymentReceipt";
import { getAppBaseUrl, getEmailActionBaseUrl } from "./publicAppUrl";
import { isEmailConfigured, isSmsConfigured, isWhatsAppConfigured } from "./messaging/config";
import { sendPaymentReceiptSms } from "./messaging/qikberrySms";
import { sendInvoiceWhatsApp, sendTrackingLinkWhatsAppBodyOnly } from "./messaging/qikchatWhatsApp";
import { sendPaymentReceiptEmail } from "./messaging/paymentReceiptEmail";
import { resolveCustomerEmail } from "./messaging/customerContact";
import { renderSrfPaymentReceiptPdf } from "./messaging/srfPaymentReceiptPdf";
import { makeSrfPdfStorageFilename } from "./messaging/srfPdfPublicUrl";
import { resolveWhatsAppSrfDocumentUrl, saveSrfPdfToStorage } from "./messaging/srfPdfDelivery";

type Queryable = Pool | PoolClient;

export type PaymentReceiptNotifyResult = {
  url: string;
  pinUrl: string;
  smsPin: string;
  smsSent: boolean;
  smsReason?: string;
  whatsappSent: boolean;
  whatsappReason?: string;
  emailSent: boolean;
  emailReason?: string;
};

function receiptAppBase(req: Request): string {
  try {
    return getEmailActionBaseUrl(req);
  } catch {
    return getAppBaseUrl(req);
  }
}

export function buildPaymentReceiptPublicUrl(req: Request, token: string): string {
  return `${receiptAppBase(req)}/pay-receipt?t=${encodeURIComponent(token)}`;
}

export function buildPaymentReceiptPinUrl(req: Request, pin: string): string {
  return `${receiptAppBase(req)}/pay-receipt?p=${encodeURIComponent(pin)}`;
}

export async function allocateSmsPin(db: Queryable): Promise<string> {
  for (let i = 0; i < 32; i++) {
    const pin = String(100000 + crypto.randomInt(900000));
    const { rows } = await db.query(`SELECT 1 FROM srf_payments WHERE sms_pin = $1 LIMIT 1`, [pin]);
    if (!rows[0]) return pin;
  }
  throw new Error("Could not allocate SMS pin.");
}

async function ensureSmsPin(db: Queryable, paymentId: string, current: string | null | undefined): Promise<string> {
  const existing = String(current ?? "").trim();
  if (/^\d{6}$/.test(existing)) return existing;
  for (let i = 0; i < 32; i++) {
    const pin = await allocateSmsPin(db);
    try {
      const { rows } = await db.query<{ sms_pin: string }>(
        `UPDATE srf_payments SET sms_pin = $1
          WHERE id = $2::uuid AND (sms_pin IS NULL OR BTRIM(sms_pin) = '')
          RETURNING sms_pin`,
        [pin, paymentId],
      );
      if (rows[0]?.sms_pin) return rows[0].sms_pin;
      const check = await db.query<{ sms_pin: string }>(
        `SELECT sms_pin FROM srf_payments WHERE id = $1::uuid LIMIT 1`,
        [paymentId],
      );
      if (/^\d{6}$/.test(String(check.rows[0]?.sms_pin ?? ""))) return check.rows[0]!.sms_pin;
    } catch {
      /* unique pin collision — retry */
    }
  }
  throw new Error("Could not allocate SMS pin.");
}

const RECEIPT_SELECT = `
  SELECT p.id,
         p.receipt_no AS "receiptNo",
         p.kind,
         p.amount_inr::float8 AS "amountInr",
         p.payment_mode AS "paymentMode",
         p.payment_details AS "paymentDetails",
         p.note,
         p.created_at AS "collectedAt",
         p.collected_by_name AS "collectedByName",
         p.public_token AS "publicToken",
         p.sms_pin AS "smsPin",
         j.reference AS "srfReference",
         j.customer_name AS "customerName",
         j.phone,
         j.watch_brand AS "watchBrand",
         j.watch_model AS "watchModel",
         j.serial,
         j.estimate_total_inr::float8 AS "estimateTotalInr",
         COALESCE(NULLIF(s.invoice_display_name, ''), s.name, '') AS "storeName",
         COALESCE(s.invoice_phone, '') AS "storePhone",
         COALESCE(s.invoice_address, '') AS "storeAddress",
         COALESCE(s.invoice_gstin, '') AS "storeGstin",
         (SELECT COALESCE(SUM(x.amount_inr), 0)::float8 FROM srf_payments x WHERE x.srf_id = p.srf_id) AS "totalPaidInr"
  FROM srf_payments p
  JOIN srf_jobs j ON j.id = p.srf_id
  LEFT JOIN stores s ON s.id = j.store_id
`;

type ReceiptRow = {
  id: string;
  receiptNo: string;
  kind: "booking_advance" | "additional";
  amountInr: number;
  paymentMode: string;
  paymentDetails: AdvancePaymentDetails | null;
  note: string;
  collectedAt: string;
  collectedByName: string | null;
  publicToken: string;
  smsPin: string;
  srfReference: string;
  customerName: string;
  phone: string;
  watchBrand: string;
  watchModel: string;
  serial: string;
  estimateTotalInr: number;
  storeName: string;
  storePhone: string;
  storeAddress: string;
  storeGstin: string;
  totalPaidInr: number;
};

function mapReceipt(row: ReceiptRow): SrfPaymentReceiptView {
  return {
    id: row.id,
    receiptNo: row.receiptNo,
    kind: row.kind,
    amountInr: Number(row.amountInr) || 0,
    amountInWords: inrAmountToWords(Number(row.amountInr) || 0),
    paymentMode: row.paymentMode,
    paymentSummary: formatPaymentSummary(row.paymentMode, row.paymentDetails),
    note: row.note || "",
    collectedAt: row.collectedAt,
    collectedByName: row.collectedByName,
    srfReference: row.srfReference,
    customerName: row.customerName,
    phone: row.phone,
    watchBrand: row.watchBrand,
    watchModel: row.watchModel,
    serial: row.serial,
    storeName: row.storeName,
    storePhone: row.storePhone,
    storeAddress: row.storeAddress,
    storeGstin: row.storeGstin,
    estimateTotalInr: Number(row.estimateTotalInr) || 0,
    totalPaidInr: Number(row.totalPaidInr) || 0,
  };
}

type LoadedReceipt = SrfPaymentReceiptView & { publicToken: string; smsPin: string };

function loadedFromRow(row: ReceiptRow): LoadedReceipt {
  return { ...mapReceipt(row), publicToken: row.publicToken, smsPin: row.smsPin };
}

export async function loadSrfPaymentReceiptByToken(
  db: Queryable,
  token: string,
): Promise<LoadedReceipt | null> {
  const t = token.trim();
  if (!t) return null;
  const { rows } = await db.query<ReceiptRow>(`${RECEIPT_SELECT} WHERE p.public_token = $1 LIMIT 1`, [t]);
  const row = rows[0];
  if (!row) return null;
  return loadedFromRow(row);
}

export async function loadSrfPaymentReceiptByPin(
  db: Queryable,
  pin: string,
): Promise<LoadedReceipt | null> {
  const p = pin.trim();
  if (!/^\d{6}$/.test(p)) return null;
  const { rows } = await db.query<ReceiptRow>(`${RECEIPT_SELECT} WHERE p.sms_pin = $1 LIMIT 1`, [p]);
  const row = rows[0];
  if (!row) return null;
  return loadedFromRow(row);
}

export async function loadPublicSrfPaymentReceipt(
  db: Queryable,
  query: { t?: unknown; p?: unknown },
): Promise<LoadedReceipt | null> {
  const token = String(query.t ?? "").trim();
  const pin = String(query.p ?? "").trim();
  if (token) return loadSrfPaymentReceiptByToken(db, token);
  if (pin) return loadSrfPaymentReceiptByPin(db, pin);
  return null;
}

export async function loadSrfPaymentReceiptById(
  db: Queryable,
  srfId: string,
  paymentId: string,
): Promise<LoadedReceipt | null> {
  const { rows } = await db.query<ReceiptRow>(
    `${RECEIPT_SELECT} WHERE p.srf_id = $1::uuid AND p.id = $2::uuid LIMIT 1`,
    [srfId, paymentId],
  );
  const row = rows[0];
  if (!row) return null;
  return loadedFromRow(row);
}

function amountLabel(amountInr: number): string {
  return `INR ${Number(amountInr || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

async function sendReceiptWhatsApp(
  req: Request,
  receipt: SrfPaymentReceiptView,
  pdfBuffer: Buffer,
  url: string,
): Promise<{ sent: boolean; reason?: string }> {
  if (!isWhatsAppConfigured()) return { sent: false, reason: "WhatsApp is not configured." };
  if (!receipt.phone?.trim()) return { sent: false, reason: "No customer mobile on file." };
  const filename = `Zimson-Receipt-${receipt.receiptNo.replace(/[^\w.-]+/g, "_")}.pdf`;
  try {
    const storageFilename = makeSrfPdfStorageFilename();
    const filePath = await saveSrfPdfToStorage(pdfBuffer, storageFilename);
    const documentUrl = await resolveWhatsAppSrfDocumentUrl(req, filePath, storageFilename, filename);
    await sendInvoiceWhatsApp({
      phone10: receipt.phone,
      customerName: receipt.customerName,
      invoiceNumber: receipt.receiptNo,
      documentUrl,
      documentFilename: filename,
    });
    return { sent: true };
  } catch (e) {
    const reason = e instanceof Error ? e.message : "Could not send receipt WhatsApp.";
    console.warn("[PAYMENT RECEIPT WA] document send failed, trying link-only", reason);
    try {
      await sendTrackingLinkWhatsAppBodyOnly({
        phone10: receipt.phone,
        customerName: receipt.customerName,
        srfNumber: receipt.srfReference,
        trackingUrl: url,
      });
      return { sent: true };
    } catch (fallbackErr) {
      const fallbackReason = fallbackErr instanceof Error ? fallbackErr.message : reason;
      console.error("[PAYMENT RECEIPT WA]", fallbackReason);
      return { sent: false, reason: fallbackReason };
    }
  }
}

export async function notifySrfPaymentReceipt(
  req: Request,
  db: Queryable,
  paymentId: string,
  opts?: { customerEmail?: string | null },
): Promise<PaymentReceiptNotifyResult> {
  const { rows } = await db.query<ReceiptRow>(`${RECEIPT_SELECT} WHERE p.id = $1::uuid LIMIT 1`, [paymentId]);
  const row = rows[0];
  if (!row) {
    return {
      url: "",
      pinUrl: "",
      smsPin: "",
      smsSent: false,
      smsReason: "Payment not found.",
      whatsappSent: false,
      emailSent: false,
    };
  }
  const receipt = mapReceipt(row);
  const smsPin = await ensureSmsPin(db, paymentId, row.smsPin);
  const url = buildPaymentReceiptPublicUrl(req, row.publicToken);
  const pinUrl = buildPaymentReceiptPinUrl(req, smsPin);
  const amt = amountLabel(receipt.amountInr);
  let pdfBuffer: Buffer | null = null;
  try {
    pdfBuffer = await renderSrfPaymentReceiptPdf(receipt);
  } catch (e) {
    console.error("[PAYMENT RECEIPT] PDF render failed", e);
  }

  const out: PaymentReceiptNotifyResult = {
    url,
    pinUrl,
    smsPin,
    smsSent: false,
    whatsappSent: false,
    emailSent: false,
  };

  if (!isSmsConfigured()) {
    out.smsReason = "SMS is not configured.";
  } else if (!row.phone?.trim()) {
    out.smsReason = "No customer mobile on file.";
  } else {
    try {
      await sendPaymentReceiptSms(row.phone, {
        amount: amt.replace(/^INR\s+/, ""),
        srf: row.srfReference,
        otp: smsPin,
        name: row.customerName,
      });
      out.smsSent = true;
    } catch (e) {
      out.smsReason = e instanceof Error ? e.message : "Could not send payment receipt SMS.";
      console.error("[PAYMENT RECEIPT SMS]", out.smsReason);
    }
  }

  if (pdfBuffer) {
    const wa = await sendReceiptWhatsApp(req, receipt, pdfBuffer, url);
    out.whatsappSent = wa.sent;
    out.whatsappReason = wa.reason;
  } else {
    out.whatsappReason = "Could not prepare receipt PDF.";
  }

  const email = await resolveCustomerEmail(db, row.phone, opts?.customerEmail ?? null);
  if (!email) {
    out.emailReason = "No customer email on file.";
  } else if (!isEmailConfigured()) {
    out.emailReason = "Email is not configured.";
  } else if (!pdfBuffer) {
    out.emailReason = "Could not prepare receipt PDF.";
  } else {
    try {
      await sendPaymentReceiptEmail({
        toEmail: email,
        customerName: receipt.customerName,
        srfReference: receipt.srfReference,
        receiptNo: receipt.receiptNo,
        amountLabel: amt,
        receiptUrl: url,
        pdfBuffer,
      });
      out.emailSent = true;
    } catch (e) {
      out.emailReason = e instanceof Error ? e.message : "Could not send payment receipt email.";
      console.error("[PAYMENT RECEIPT EMAIL]", out.emailReason);
    }
  }

  return out;
}

/** @deprecated Use notifySrfPaymentReceipt */
export async function notifySrfPaymentReceiptSms(
  req: Request,
  db: Queryable,
  paymentId: string,
): Promise<{ sent: boolean; reason?: string; url?: string }> {
  const r = await notifySrfPaymentReceipt(req, db, paymentId);
  return { sent: r.smsSent, reason: r.smsReason, url: r.url };
}
