import { formatIndiaMobileE164, getMessagingConfig, isSmsConfigured } from "./config";
import {
  QIKBERRY_SMS_ENDPOINTS,
  qikberryAuthHeaders,
  type QikberryMessageStatusRow,
  type QikberrySendMessageResponse,
} from "./qikberryApi";

/**
 * Build SMS body from configured DLT template.
 * Supports common OTP placeholders used in provider templates.
 */
export function buildQikberryOtpMessage(template: string, otp: string): string {
  const src = String(template ?? "").trim();
  const replaced = src
    .replace(/\{\{\s*otp\s*\}\}/gi, otp)
    .replace(/\{\{\s*1\s*\}\}/g, otp)
    .replace(/\{#var#\}/gi, otp);

  // If template has no placeholder, keep it untouched to avoid static-part mismatch.
  return replaced || `Dear Customer, Your One Time Password is ${otp}. Please use this code to complete your verification - ZIMSON`;
}

async function fetchMessageStatus(
  bearerToken: string,
  templateId: string,
  messageId: string,
): Promise<QikberryMessageStatusRow | null> {
  const url = `${QIKBERRY_SMS_ENDPOINTS.messageStatus}?message_ids=${encodeURIComponent(messageId)}`;
  const res = await fetch(url, { headers: qikberryAuthHeaders(bearerToken, templateId) });
  const text = await res.text();
  if (!res.ok) return null;
  const json = JSON.parse(text) as { data?: QikberryMessageStatusRow[] };
  return json.data?.[0] ?? null;
}

function smsStatusOk(status: string | undefined): boolean {
  const s = String(status ?? "").toUpperCase();
  return ["DELIVERED", "PROCESSED", "SUCCESS", "SENT"].includes(s);
}

function smsStatusFailed(status: string | undefined): boolean {
  const s = String(status ?? "").toUpperCase();
  return ["FAILED", "REJECTED", "EXPIRED", "DND", "NDNC", "UNDELIVERED", "BLOCKED"].includes(s);
}

async function waitForSmsStatus(
  bearerToken: string,
  templateId: string,
  messageId: string,
): Promise<QikberryMessageStatusRow | null> {
  let last: QikberryMessageStatusRow | null = null;
  for (const delayMs of [0, 2500, 4000, 5000]) {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    last = await fetchMessageStatus(bearerToken, templateId, messageId);
    const status = String(last?.status ?? "").toUpperCase();
    if (!status) continue;
    if (smsStatusOk(status) || smsStatusFailed(status)) return last;
  }
  return last;
}

export async function sendOtpSms(phone10: string, otpCode: string): Promise<void> {
  if (!isSmsConfigured()) {
    throw new Error("SMS not configured. Set Qikberry SMS credentials in Settings → SMS, email & WhatsApp.");
  }
  const cfg = getMessagingConfig().sms;
  const to = formatIndiaMobileE164(phone10);
  const message = buildQikberryOtpMessage(cfg.otpMessageTemplate, otpCode);

  const payload = {
    to,
    sender: cfg.sender,
    service: cfg.service,
    template_id: cfg.templateId,
    message,
  };

  const res = await fetch(cfg.url || QIKBERRY_SMS_ENDPOINTS.sendMessage, {
    method: "POST",
    headers: qikberryAuthHeaders(cfg.bearerToken, cfg.templateId),
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error("[qikberry-sms] POST failed", res.status, text);
    throw new Error(`SMS failed (${res.status}): ${text.slice(0, 280)}`);
  }

  let messageId: string | undefined;
  try {
    const json = JSON.parse(text) as QikberrySendMessageResponse;
    const first = json.data?.[0];
    messageId = first?.message_id;
    console.log("[qikberry-sms]", json.message ?? "ok", "| to=", to, "| message_id=", messageId ?? "—");
    console.log("[qikberry-sms] message:", message);
  } catch {
    console.log("[qikberry-sms] response:", text.slice(0, 400));
  }

  if (messageId) {
    const row = await fetchMessageStatus(cfg.bearerToken, cfg.templateId, messageId);
    if (row?.status) console.log("[qikberry-sms] delivery status:", row.status);
  }
}

export const DEFAULT_SMS_PAYMENT_RECEIPT =
  "Dear Customer, payment of INR {{1}} received for SRF {{2}}. View/download your receipt: {{3}} - ZIMSON";

export function buildPaymentReceiptSms(
  template: string,
  vars: { amount: string; srf: string; link: string; name?: string },
): string {
  const src = String(template ?? "").trim() || DEFAULT_SMS_PAYMENT_RECEIPT;
  const amount = vars.amount;
  const srf = vars.srf;
  const link = vars.link;
  const name = vars.name?.trim() || "Customer";
  return src
    .replace(/\{\{\s*name\s*\}\}/gi, name)
    .replace(/\{\{\s*amount\s*\}\}/gi, amount)
    .replace(/\{\{\s*srf\s*\}\}/gi, srf)
    .replace(/\{\{\s*link\s*\}\}/gi, link)
    .replace(/\{\{\s*1\s*\}\}/g, amount)
    .replace(/\{\{\s*2\s*\}\}/g, srf)
    .replace(/\{\{\s*3\s*\}\}/g, link)
    .replace(/\{\{\s*4\s*\}\}/g, name);
}

async function sendQikberryOtpSms(
  phone10: string,
  otpCode: string,
  logLabel: string,
): Promise<{ messageId?: string; status?: string }> {
  if (!isSmsConfigured()) {
    throw new Error("SMS not configured. Set Qikberry SMS credentials in Settings → SMS, email & WhatsApp.");
  }
  const otp = String(otpCode ?? "").trim();
  if (!/^\d{4,10}$/.test(otp)) {
    throw new Error("SMS OTP code must be 4–10 digits for the DLT OTP template.");
  }
  const cfg = getMessagingConfig().sms;
  const templateId = cfg.templateId;
  if (!templateId) {
    throw new Error("SMS OTP template ID is not set.");
  }
  const to = formatIndiaMobileE164(phone10);
  const message = buildQikberryOtpMessage(cfg.otpMessageTemplate, otp);
  const payload = {
    to,
    sender: cfg.sender,
    service: cfg.service,
    template_id: templateId,
    message,
  };
  const res = await fetch(cfg.url || QIKBERRY_SMS_ENDPOINTS.sendMessage, {
    method: "POST",
    headers: qikberryAuthHeaders(cfg.bearerToken, templateId),
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error("[qikberry-sms]", logLabel, "POST failed", res.status, text);
    throw new Error(`SMS failed (${res.status}): ${text.slice(0, 280)}`);
  }
  let messageId: string | undefined;
  try {
    const json = JSON.parse(text) as QikberrySendMessageResponse;
    messageId = json.data?.[0]?.message_id;
    console.log("[qikberry-sms]", logLabel, "| to=", to, "| otp=", otp, "| message_id=", messageId ?? "—");
    console.log("[qikberry-sms] message:", message);
  } catch {
    console.log("[qikberry-sms]", logLabel, "response:", text.slice(0, 400));
  }
  if (!messageId) {
    throw new Error("SMS gateway did not return a message id.");
  }
  const row = await waitForSmsStatus(cfg.bearerToken, templateId, messageId);
  const status = row?.status;
  console.log("[qikberry-sms]", logLabel, "delivery status:", status ?? "unknown");
  if (smsStatusOk(status)) return { messageId, status };
  if (smsStatusFailed(status)) {
    throw new Error(`SMS was not delivered (${status}).`);
  }
  throw new Error(
    `SMS was accepted but not confirmed by the operator (status ${status || "SUBMITTED"}). ` +
      "The OTP DLT template only delivers a short numeric code, not a URL.",
  );
}

/**
 * Test send: uses the approved OTP DLT template.
 * {{1}} must be a short numeric code — a URL is accepted by the API then dropped by DLT (stays SUBMITTED).
 */
export async function sendPaymentReceiptSms(phone10: string, vars: {
  amount: string;
  srf: string;
  otp: string;
  name?: string;
}): Promise<{ messageId?: string; status?: string }> {
  return sendQikberryOtpSms(phone10, vars.otp, `payment receipt | srf=${vars.srf}`);
}

/** WhatsApp-failed fallback: OTP DLT {{1}} is a 6-digit pin that opens the same tracking page. */
export async function sendTrackingFallbackSms(
  phone10: string,
  vars: { srf: string; otp: string },
): Promise<{ messageId?: string; status?: string }> {
  return sendQikberryOtpSms(phone10, vars.otp, `tracking fallback | srf=${vars.srf}`);
}
