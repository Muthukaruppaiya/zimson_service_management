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
