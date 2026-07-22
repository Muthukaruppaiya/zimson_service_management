import type { Pool } from "pg";
import type { MessagingConfig } from "./messaging/types";
import { resetSmtpTransporter } from "./messaging/smtpTransport";
import { normalizeMessagingPublicBaseUrl } from "./messaging/publicHttpsUrl";

/** Stored in `messaging_settings.config` (JSONB). Secrets are plain text in DB — super-admin only API. */
export type MessagingSettingsDb = {
  smsEnabled?: boolean;
  smsUrl?: string;
  smsToken?: string;
  smsTemplateId?: string;
  smsSender?: string;
  smsService?: string;
  smsOtpMessageTemplate?: string;

  emailEnabled?: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
  smtpFrom?: string;
  smtpOtpSubject?: string;
  smtpOtpMessage?: string;

  whatsappEnabled?: boolean;
  qikchatApiKey?: string;
  qikchatApiBaseUrl?: string;
  qikchatTemplateName?: string;
  qikchatTemplateLanguage?: string;
  qikchatTrackingTemplateName?: string;
  qikchatTrackingTextTemplateName?: string;
  qikchatApprovalTemplateName?: string;
  qikchatReadyPickupTemplateName?: string;
  qikchatTrackingTemplateBody?: string;
  qikchatApprovalTemplateBody?: string;
  qikchatReadyPickupTemplateBody?: string;
  qikchatInvoiceTemplateBody?: string;
  whatsappInvoiceMode?: string;
  messagingPublicBaseUrl?: string;
  whatsappInvoiceDryRun?: boolean;

  workdriveForInvoice?: boolean;
  workdriveToken?: string;
  workdriveUploadUrl?: string;
  workdriveHeaderName?: string;
  workdriveHeaderValue?: string;

  /** null = auto (show OTP on screen when channel not configured). */
  exposeDemoOtp?: boolean | null;
};

export type MessagingSettingsPublic = {
  smsEnabled: boolean;
  smsUrl: string;
  smsTemplateId: string;
  smsSender: string;
  smsService: string;
  smsOtpMessageTemplate: string;
  hasSmsToken: boolean;
  smsConfigured: boolean;

  emailEnabled: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpFrom: string;
  smtpOtpSubject: string;
  smtpOtpMessage: string;
  hasSmtpPassword: boolean;
  emailConfigured: boolean;

  whatsappEnabled: boolean;
  qikchatApiBaseUrl: string;
  qikchatTemplateName: string;
  qikchatTemplateLanguage: string;
  qikchatTrackingTemplateName: string;
  qikchatTrackingTextTemplateName: string;
  qikchatApprovalTemplateName: string;
  qikchatReadyPickupTemplateName: string;
  qikchatTrackingTemplateBody: string;
  qikchatApprovalTemplateBody: string;
  qikchatReadyPickupTemplateBody: string;
  qikchatInvoiceTemplateBody: string;
  whatsappInvoiceMode: "template" | "media";
  messagingPublicBaseUrl: string;
  whatsappInvoiceDryRun: boolean;
  hasQikchatApiKey: boolean;
  whatsappConfigured: boolean;

  workdriveForInvoice: boolean;
  workdriveUploadUrl: string;
  workdriveHeaderName: string;
  hasWorkdriveToken: boolean;

  exposeDemoOtp: boolean | null;

  configuredFromDatabase: boolean;
  envFallbackActive: boolean;
  updatedAt: string;
  updatedBy: string | null;
};

type MessagingRow = {
  config: MessagingSettingsDb;
  updated_at: Date;
  updated_by: string | null;
};

const DEFAULT_SMS_OTP_MESSAGE =
  "Dear Customer, Your One Time Password is {{1}}. Please use this code to complete your verification - ZIMSON";
const DEFAULT_EMAIL_OTP_SUBJECT = "Your Zimson verification code";
const DEFAULT_EMAIL_OTP_TEXT =
  "Your verification code for Zimson Service Management is {{otp}}.\n\nThis code is valid for 20 minutes. Enter it on the screen where you requested verification.\n\nDo not share this code with anyone.\n\n— Zimson Watch Care";
const DEFAULT_WHATSAPP_TRACKING_BODY =
  "Hi {{1}}, your service request {{2}} has been registered. Track: {{3}}";
const DEFAULT_WHATSAPP_APPROVAL_BODY =
  "Hi {{1}}, your service request {{2}} needs your approval for a site visit by our technician. Reason: {{3}}. Please review and respond here: {{4}} Thank you for choosing Zimson.";
const DEFAULT_WHATSAPP_READY_PICKUP_BODY =
  "Hi {{1}}, your watch for service request {{2}} is ready for collection at {{3}}. Please visit the store with your SRF acknowledgement to collect your watch. Track status: {{4}}. Thank you for choosing Zimson Watch Care.";
const DEFAULT_WHATSAPP_INVOICE_BODY = "Hello {{1}}, please find your invoice {{2}} from Zimson Watch Care.";

let poolRef: Pool | null = null;
let dbConfig: MessagingSettingsDb = {};
let resolved: MessagingConfig | null = null;
let flagsCache: MessagingFlags | null = null;
let metaCache: { updatedAt: string; updatedBy: string | null } = {
  updatedAt: new Date(0).toISOString(),
  updatedBy: null,
};
let configuredFromDatabase = false;

export type MessagingFlags = {
  whatsappInvoiceMode: "template" | "media";
  messagingPublicBaseUrl: string;
  whatsappInvoiceDryRun: boolean;
  workdriveForInvoice: boolean;
  workdriveUploadUrl: string;
  workdriveHeaderName: string;
  workdriveHeaderValue: string;
  workdriveToken: string;
  exposeDemoOtp: boolean | null;
  qikchatApiBaseUrl: string;
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function pickStr(dbVal: string | undefined, fallback: string): string {
  const d = str(dbVal);
  return d || fallback;
}

function dbHasAnyCredential(c: MessagingSettingsDb): boolean {
  return Boolean(
    str(c.smsToken) ||
      str(c.smsTemplateId) ||
      str(c.smtpUser) ||
      str(c.smtpPassword) ||
      str(c.qikchatApiKey) ||
      str(c.workdriveToken),
  );
}

function resolveMerged(db: MessagingSettingsDb): {
  config: MessagingConfig;
  flags: MessagingFlags;
  fromDb: boolean;
} {
  const fromDb = dbHasAnyCredential(db);

  const rawSms = str(db.smsToken);
  const bearerToken = rawSms ? `Bearer ${rawSms.replace(/^bearer\s+/i, "")}` : "";
  const smtpPassword = str(db.smtpPassword).replace(/\s+/g, "");
  const apiKey = str(db.qikchatApiKey);
  const rawWd = str(db.workdriveToken);
  const workdriveToken = rawWd ? `Bearer ${rawWd.replace(/^bearer\s+/i, "")}` : "";

  const invoiceModeRaw = pickStr(db.whatsappInvoiceMode, "template").toLowerCase();
  const whatsappInvoiceMode: "template" | "media" =
    invoiceModeRaw === "media" || invoiceModeRaw === "document" ? "media" : "template";

  const publicBaseRaw = str(db.messagingPublicBaseUrl);
  const publicBase = publicBaseRaw ? normalizeMessagingPublicBaseUrl(publicBaseRaw) : "";

  const trackingTemplateName = pickStr(db.qikchatTrackingTemplateName, "customer_link");
  const trackingTextTemplateName =
    pickStr(db.qikchatTrackingTextTemplateName, "") || trackingTemplateName;

  const config: MessagingConfig = {
    whatsapp: {
      apiKey,
      templateName: pickStr(db.qikchatTemplateName, "invoice"),
      templateLanguage: pickStr(db.qikchatTemplateLanguage, "en"),
      trackingTemplateName,
      trackingTextTemplateName,
      approvalTemplateName: pickStr(db.qikchatApprovalTemplateName, "site_visit_approval"),
      readyPickupTemplateName: pickStr(db.qikchatReadyPickupTemplateName, "watch_ready_for_pickup"),
      trackingTemplateBody: pickStr(db.qikchatTrackingTemplateBody, DEFAULT_WHATSAPP_TRACKING_BODY),
      approvalTemplateBody: pickStr(db.qikchatApprovalTemplateBody, DEFAULT_WHATSAPP_APPROVAL_BODY),
      readyPickupTemplateBody: pickStr(
        db.qikchatReadyPickupTemplateBody,
        DEFAULT_WHATSAPP_READY_PICKUP_BODY,
      ),
      invoiceTemplateBody: pickStr(db.qikchatInvoiceTemplateBody, DEFAULT_WHATSAPP_INVOICE_BODY),
    },
    sms: {
      url: pickStr(db.smsUrl, "https://rest.qikberry.ai/v1/sms/messages"),
      bearerToken,
      templateId: str(db.smsTemplateId),
      sender: pickStr(db.smsSender, "ZIMSON"),
      service: pickStr(db.smsService, "SI"),
      otpMessageTemplate: pickStr(db.smsOtpMessageTemplate, DEFAULT_SMS_OTP_MESSAGE),
    },
    email: {
      host: pickStr(db.smtpHost, "smtp.gmail.com"),
      port: db.smtpPort ?? 587,
      user: str(db.smtpUser),
      password: smtpPassword,
      from:
        pickStr(db.smtpFrom, "") ||
        str(db.smtpUser) ||
        "Zimson Watch Care <noreply@zimsonwatchcare.com>",
      otpSubject: pickStr(db.smtpOtpSubject, DEFAULT_EMAIL_OTP_SUBJECT),
      otpTextTemplate: pickStr(db.smtpOtpMessage, DEFAULT_EMAIL_OTP_TEXT),
    },
  };

  const flags: MessagingFlags = {
    whatsappInvoiceMode,
    messagingPublicBaseUrl: publicBase,
    whatsappInvoiceDryRun: db.whatsappInvoiceDryRun ?? false,
    workdriveForInvoice: db.workdriveForInvoice ?? false,
    workdriveUploadUrl: pickStr(db.workdriveUploadUrl, "https://wkdrive.qikberry.io/api/v1/upload"),
    workdriveHeaderName: str(db.workdriveHeaderName),
    workdriveHeaderValue: str(db.workdriveHeaderValue),
    workdriveToken,
    exposeDemoOtp: db.exposeDemoOtp ?? null,
    qikchatApiBaseUrl: pickStr(db.qikchatApiBaseUrl, "https://api.qikchat.in").replace(/\/$/, ""),
  };

  return { config, flags, fromDb };
}

function applyCache(db: MessagingSettingsDb, row?: MessagingRow): void {
  dbConfig = db;
  const m = resolveMerged(db);
  resolved = m.config;
  flagsCache = m.flags;
  configuredFromDatabase = m.fromDb;
  if (row) {
    metaCache = {
      updatedAt: row.updated_at.toISOString(),
      updatedBy: row.updated_by,
    };
  }
}

export async function initMessagingSettings(pool: Pool): Promise<void> {
  poolRef = pool;
  await pool.query(`INSERT INTO messaging_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);

  const { rows } = await pool.query<{ config: MessagingSettingsDb; updated_at: Date; updated_by: string | null }>(
    `SELECT config, updated_at, updated_by FROM messaging_settings WHERE id = 1`,
  );
  const row = rows[0];
  if (!row) {
    applyCache({});
    return;
  }

  const cfg = (row.config && typeof row.config === "object" ? row.config : {}) as MessagingSettingsDb;
  applyCache(cfg, row);
}

export async function refreshMessagingSettingsCache(): Promise<void> {
  if (!poolRef) return;
  const { rows } = await poolRef.query<{ config: MessagingSettingsDb; updated_at: Date; updated_by: string | null }>(
    `SELECT config, updated_at, updated_by FROM messaging_settings WHERE id = 1`,
  );
  const row = rows[0];
  if (!row) {
    applyCache({});
    return;
  }
  applyCache((row.config ?? {}) as MessagingSettingsDb, row);
}

export function getResolvedMessagingConfig(): MessagingConfig {
  if (!resolved) {
    const m = resolveMerged(dbConfig);
    resolved = m.config;
    flagsCache = m.flags;
  }
  return resolved;
}

export function getMessagingFlags(): MessagingFlags {
  if (!flagsCache) {
    const m = resolveMerged(dbConfig);
    flagsCache = m.flags;
  }
  return flagsCache;
}

/** Dev tunnel override — updates in-memory public base URL only (not .env). */
export function patchMessagingPublicBaseUrl(url: string): void {
  const clean = url.trim() ? normalizeMessagingPublicBaseUrl(url) : "";
  if (flagsCache) {
    flagsCache = { ...flagsCache, messagingPublicBaseUrl: clean };
  }
}

export function getDbConfigSnapshot(): MessagingSettingsDb {
  return { ...dbConfig };
}

function channelEnabled(dbFlag: boolean | undefined, defaultOn: boolean): boolean {
  if (dbFlag === false) return false;
  if (dbFlag === true) return true;
  return defaultOn;
}

export function isSmsChannelEnabled(): boolean {
  return channelEnabled(dbConfig.smsEnabled, true);
}

export function isEmailChannelEnabled(): boolean {
  return channelEnabled(dbConfig.emailEnabled, true);
}

export function isWhatsAppChannelEnabled(): boolean {
  return channelEnabled(dbConfig.whatsappEnabled, true);
}

export function toPublicSettings(): MessagingSettingsPublic {
  const c = getResolvedMessagingConfig();
  const f = getMessagingFlags();
  return {
    smsEnabled: isSmsChannelEnabled(),
    smsUrl: c.sms.url,
    smsTemplateId: c.sms.templateId,
    smsSender: c.sms.sender,
    smsService: c.sms.service,
    smsOtpMessageTemplate: c.sms.otpMessageTemplate,
    hasSmsToken: Boolean(c.sms.bearerToken),
    smsConfigured: isSmsChannelEnabled() && Boolean(c.sms.bearerToken && c.sms.templateId && c.sms.sender),

    emailEnabled: isEmailChannelEnabled(),
    smtpHost: c.email.host,
    smtpPort: c.email.port,
    smtpUser: c.email.user,
    smtpFrom: c.email.from,
    smtpOtpSubject: c.email.otpSubject,
    smtpOtpMessage: c.email.otpTextTemplate,
    hasSmtpPassword: Boolean(c.email.password),
    emailConfigured: isEmailChannelEnabled() && Boolean(c.email.host && c.email.user && c.email.password),

    whatsappEnabled: isWhatsAppChannelEnabled(),
    qikchatApiBaseUrl: f.qikchatApiBaseUrl,
    qikchatTemplateName: c.whatsapp.templateName,
    qikchatTemplateLanguage: c.whatsapp.templateLanguage,
    qikchatTrackingTemplateName: c.whatsapp.trackingTemplateName,
    qikchatTrackingTextTemplateName: c.whatsapp.trackingTextTemplateName,
    qikchatApprovalTemplateName: c.whatsapp.approvalTemplateName,
    qikchatReadyPickupTemplateName: c.whatsapp.readyPickupTemplateName,
    qikchatTrackingTemplateBody: c.whatsapp.trackingTemplateBody,
    qikchatApprovalTemplateBody: c.whatsapp.approvalTemplateBody,
    qikchatReadyPickupTemplateBody: c.whatsapp.readyPickupTemplateBody,
    qikchatInvoiceTemplateBody: c.whatsapp.invoiceTemplateBody,
    whatsappInvoiceMode: f.whatsappInvoiceMode,
    messagingPublicBaseUrl: f.messagingPublicBaseUrl,
    whatsappInvoiceDryRun: f.whatsappInvoiceDryRun,
    hasQikchatApiKey: Boolean(c.whatsapp.apiKey),
    whatsappConfigured: isWhatsAppChannelEnabled() && Boolean(c.whatsapp.apiKey && c.whatsapp.templateName),

    workdriveForInvoice: f.workdriveForInvoice,
    workdriveUploadUrl: f.workdriveUploadUrl,
    workdriveHeaderName: f.workdriveHeaderName,
    hasWorkdriveToken: Boolean(f.workdriveToken),

    exposeDemoOtp: f.exposeDemoOtp,

    configuredFromDatabase,
    envFallbackActive: false,
    updatedAt: metaCache.updatedAt,
    updatedBy: metaCache.updatedBy,
  };
}

export async function saveMessagingSettings(
  incoming: MessagingSettingsDb,
  updatedBy: string,
): Promise<MessagingSettingsPublic> {
  if (!poolRef) throw new Error("Messaging settings store not initialized.");

  const cur = { ...dbConfig };
  const next: MessagingSettingsDb = { ...cur, ...incoming };

  if (!str(incoming.smsToken) && str(cur.smsToken)) next.smsToken = cur.smsToken;
  if (!str(incoming.smtpPassword) && str(cur.smtpPassword)) next.smtpPassword = cur.smtpPassword;
  if (!str(incoming.qikchatApiKey) && str(cur.qikchatApiKey)) next.qikchatApiKey = cur.qikchatApiKey;
  if (!str(incoming.workdriveToken) && str(cur.workdriveToken)) next.workdriveToken = cur.workdriveToken;

  if (str(incoming.smsToken)) next.smsToken = incoming.smsToken!.replace(/^bearer\s+/i, "").trim();
  if (str(incoming.smtpPassword)) next.smtpPassword = incoming.smtpPassword!.replace(/\s+/g, "");
  if (str(incoming.workdriveToken)) {
    next.workdriveToken = incoming.workdriveToken!.replace(/^bearer\s+/i, "").trim();
  }

  const { rows } = await poolRef.query<{ config: MessagingSettingsDb; updated_at: Date; updated_by: string | null }>(
    `UPDATE messaging_settings SET config = $1::jsonb, updated_at = now(), updated_by = $2 WHERE id = 1
     RETURNING config, updated_at, updated_by`,
    [JSON.stringify(next), updatedBy.slice(0, 200)],
  );
  const row = rows[0];
  if (!row) throw new Error("Messaging settings row missing.");
  applyCache((row.config ?? {}) as MessagingSettingsDb, row);
  resetSmtpTransporter();
  return toPublicSettings();
}
