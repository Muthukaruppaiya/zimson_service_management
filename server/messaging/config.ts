/** Messaging provider settings — loaded from DB (super admin) with .env fallback. */

import {
  getMessagingFlags,
  getResolvedMessagingConfig,
  isEmailChannelEnabled,
  isSmsChannelEnabled,
  isWhatsAppChannelEnabled,
} from "../messagingSettingsStore";
import { envFirst } from "./env";

export type { MessagingConfig } from "./types";
export { envFirst };

export function getMessagingConfig(): MessagingConfig {
  return getResolvedMessagingConfig();
}

export function isSmsConfigured(): boolean {
  if (!isSmsChannelEnabled()) return false;
  const c = getMessagingConfig().sms;
  return Boolean(c.bearerToken && c.templateId && c.sender);
}

export function isEmailConfigured(): boolean {
  if (!isEmailChannelEnabled()) return false;
  const c = getMessagingConfig().email;
  return Boolean(c.host && c.user && c.password);
}

export function isWhatsAppConfigured(): boolean {
  if (!isWhatsAppChannelEnabled()) return false;
  const c = getMessagingConfig().whatsapp;
  return Boolean(c.apiKey && c.templateName);
}

/**
 * Public base URL of this API (HTTPS in production) so WhatsApp can fetch uploaded invoice PDFs.
 * Example: https://api.zimson.in or https://your-server.com:4000
 */
/** Runtime tunnel / .env wins over DB cache (tunnel starts after settings init). */
export function getMessagingPublicBaseUrl(): string {
  const runtime = process.env.MESSAGING_PUBLIC_BASE_URL?.trim();
  if (runtime) return runtime.replace(/\/$/, "");
  return getMessagingFlags().messagingPublicBaseUrl || "";
}

/** Local testing without ngrok: saves PDF and skips Qikchat (no WhatsApp delivered). */
export function isWhatsAppInvoiceDryRun(): boolean {
  return getMessagingFlags().whatsappInvoiceDryRun;
}

/** Work Drive upload token — separate from SMS / Qikchat keys. */
export function getWorkDriveBearerToken(): string {
  return getMessagingFlags().workdriveToken;
}

export function getWorkDriveUploadUrl(): string {
  return getMessagingFlags().workdriveUploadUrl;
}

export function getWorkDriveExtraHeaders(): { name: string; value: string } | null {
  const f = getMessagingFlags();
  if (f.workdriveHeaderName && f.workdriveHeaderValue) {
    return { name: f.workdriveHeaderName, value: f.workdriveHeaderValue };
  }
  return null;
}

function messagingExposeDemoOtpSetting(): boolean | null {
  return getMessagingFlags().exposeDemoOtp;
}

/** Show mobile OTP on screen when SMS is not configured. */
export function shouldExposeMobileOtpInUi(): boolean {
  const setting = messagingExposeDemoOtpSetting();
  if (setting !== null) return setting;
  return !isSmsConfigured();
}

/** Show email OTP on screen when SMTP is not configured (SMS may still send). */
export function shouldExposeEmailOtpInUi(): boolean {
  const setting = messagingExposeDemoOtpSetting();
  if (setting !== null) return setting;
  return !isEmailConfigured();
}

/** Show password-reset link on screen instead of email (same rules as email OTP demo). */
export function shouldExposePasswordResetInUi(): boolean {
  return shouldExposeEmailOtpInUi();
}

/** When true, API returns demoOtp in JSON for UI testing (no real SMS/email). */
export function shouldExposeDemoOtp(): boolean {
  const setting = messagingExposeDemoOtpSetting();
  if (setting !== null) return setting;
  return !isSmsConfigured() && !isEmailConfigured();
}

export function shouldUseWorkDriveForInvoicePdf(): boolean {
  const f = getMessagingFlags();
  if (!f.workdriveForInvoice) return false;
  return Boolean(f.workdriveToken);
}

export function getWhatsAppInvoiceSendModeFromSettings(): "template" | "media" {
  return getMessagingFlags().whatsappInvoiceMode;
}

export function getQikchatApiBaseUrl(): string {
  return getMessagingFlags().qikchatApiBaseUrl;
}

export function getQikchatMessagesUrl(): string {
  return `${getQikchatApiBaseUrl()}/v1/messages`;
}

export function formatIndiaMobileE164(phone10: string): string {
  const digits = phone10.replace(/\D/g, "");
  const p10 = digits.length > 10 ? digits.slice(-10) : digits;
  if (p10.length !== 10) throw new Error("Invalid 10-digit mobile number.");
  return `+91${p10}`;
}

/** Replace {{1}}, {{otp}}, etc. in template strings. */
export function applyTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{{${key}}}`).join(value);
    out = out.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return out;
}
