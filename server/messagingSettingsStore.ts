import type { Pool } from "pg";
import type { MessagingConfig } from "./messaging/types";
import { envFirst } from "./messaging/env";

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
  "Your one time password - OTP is {{otp}} to sign in to your Zimson account. Valid for 20 minutes. Do not share this code.\n\n— Team Zimson";

let poolRef: Pool | null = null;
let dbConfig: MessagingSettingsDb = {};
let resolved: MessagingConfig | null = null;
let flagsCache: MessagingFlags | null = null;
let metaCache: { updatedAt: string; updatedBy: string | null } = {
  updatedAt: new Date(0).toISOString(),
  updatedBy: null,
};
let configuredFromDatabase = false;
let envFallbackActive = false;

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

function envHasAnyCredential(): boolean {
  return Boolean(
    envFirst("QIKBERRY_SMS_TOKEN", "qikberry.sms.token") ||
      envFirst("QIKBERRY_SMS_TEMPLATE_ID") ||
      envFirst("SMTP_USER", "SPRING_MAIL_USERNAME") ||
      envFirst("SMTP_PASSWORD", "SPRING_MAIL_PASSWORD") ||
      envFirst("QIKCHAT_API_KEY", "QIKCHAT_WHATSAPP_API_KEY"),
  );
}

function configFromEnv(): MessagingSettingsDb {
  const rawSms = envFirst("QIKBERRY_SMS_TOKEN", "qikberry.sms.token").replace(/^bearer\s+/i, "");
  const rawWd = envFirst("QIKBERRY_WORKDRIVE_TOKEN", "qikberry.workdrive.token").replace(/^bearer\s+/i, "");
  let expose: boolean | null = null;
  if (process.env.MESSAGING_EXPOSE_DEMO_OTP === "true") expose = true;
  if (process.env.MESSAGING_EXPOSE_DEMO_OTP === "false") expose = false;

  return {
    smsEnabled: true,
    smsUrl: envFirst("QIKBERRY_SMS_URL", "qikberry.sms.url") || "https://rest.qikberry.ai/v1/sms/messages",
    smsToken: rawSms,
    smsTemplateId: envFirst("QIKBERRY_SMS_TEMPLATE_ID", "qikberry.sms.template-id", "qikberry.sms.templateId"),
    smsSender: envFirst("QIKBERRY_SMS_SENDER", "qikberry.sms.sender") || "ZIMSON",
    smsService: envFirst("QIKBERRY_SMS_SERVICE", "qikberry.sms.service") || "SI",
    smsOtpMessageTemplate: envFirst("QIKBERRY_SMS_OTP_MESSAGE", "qikberry.sms.otp-message") || DEFAULT_SMS_OTP_MESSAGE,

    emailEnabled: true,
    smtpHost: envFirst("SMTP_HOST", "SPRING_MAIL_HOST", "spring.mail.host") || "smtp.gmail.com",
    smtpPort: Number(envFirst("SMTP_PORT", "SPRING_MAIL_PORT", "spring.mail.port") || "587"),
    smtpUser: envFirst("SMTP_USER", "SPRING_MAIL_USERNAME", "spring.mail.username"),
    smtpPassword: envFirst("SMTP_PASSWORD", "SPRING_MAIL_PASSWORD", "spring.mail.password").replace(/\s+/g, ""),
    smtpFrom:
      envFirst("SMTP_FROM", "SPRING_MAIL_FROM") ||
      envFirst("SMTP_USER", "SPRING_MAIL_USERNAME", "spring.mail.username") ||
      "Zimson Service <promotion@zimson.in>",
    smtpOtpSubject: envFirst("SMTP_OTP_SUBJECT") || DEFAULT_EMAIL_OTP_SUBJECT,
    smtpOtpMessage: envFirst("SMTP_OTP_MESSAGE") || DEFAULT_EMAIL_OTP_TEXT,

    whatsappEnabled: true,
    qikchatApiKey: envFirst("QIKCHAT_API_KEY", "QIKCHAT_WHATSAPP_API_KEY", "qikchat.api.key"),
    qikchatApiBaseUrl: envFirst("QIKCHAT_API_BASE_URL", "qikchat.api.base-url") || "https://api.qikchat.in",
    qikchatTemplateName: envFirst("QIKCHAT_WHATSAPP_TEMPLATE_NAME", "qikchat.whatsapp.template-name") || "invoice",
    qikchatTemplateLanguage:
      envFirst("QIKCHAT_WHATSAPP_TEMPLATE_LANGUAGE", "qikchat.whatsapp.template-language") || "en",
    whatsappInvoiceMode: envFirst("WHATSAPP_INVOICE_MODE") || "template",
    messagingPublicBaseUrl: envFirst("MESSAGING_PUBLIC_BASE_URL", "PUBLIC_API_URL", "API_PUBLIC_URL"),
    whatsappInvoiceDryRun: process.env.WHATSAPP_INVOICE_DRY_RUN === "true",

    workdriveForInvoice: process.env.QIKBERRY_WORKDRIVE_FOR_INVOICE === "true",
    workdriveToken: rawWd,
    workdriveUploadUrl:
      envFirst("QIKBERRY_WORKDRIVE_UPLOAD_URL") || "https://wkdrive.qikberry.io/api/v1/upload",
    workdriveHeaderName: envFirst("QIKBERRY_WORKDRIVE_HEADER_NAME"),
    workdriveHeaderValue: envFirst("QIKBERRY_WORKDRIVE_HEADER_VALUE"),
    exposeDemoOtp: expose,
  };
}

function pickDbOrEnv(dbVal: string | undefined, envKeys: string[], fallback = ""): { value: string; fromDb: boolean } {
  const d = str(dbVal);
  if (d) return { value: d, fromDb: true };
  const e = envFirst(...envKeys);
  if (e) return { value: e, fromDb: false };
  return { value: fallback, fromDb: false };
}

function resolveMerged(db: MessagingSettingsDb): {
  config: MessagingConfig;
  flags: MessagingFlags;
  fromDb: boolean;
  envFallback: boolean;
} {
  let fromDb = false;
  let envFallback = false;

  const track = (r: { value: string; fromDb: boolean }) => {
    if (r.fromDb) fromDb = true;
    else if (r.value && !r.fromDb) envFallback = true;
    return r.value;
  };

  const rawSms = track(pickDbOrEnv(db.smsToken, ["QIKBERRY_SMS_TOKEN", "qikberry.sms.token"]));
  const bearerToken = rawSms ? `Bearer ${rawSms.replace(/^bearer\s+/i, "")}` : "";

  const smtpPassword = track(
    pickDbOrEnv(db.smtpPassword, ["SMTP_PASSWORD", "SPRING_MAIL_PASSWORD", "spring.mail.password"]),
  ).replace(/\s+/g, "");

  const apiKey = track(pickDbOrEnv(db.qikchatApiKey, ["QIKCHAT_API_KEY", "QIKCHAT_WHATSAPP_API_KEY", "qikchat.api.key"]));

  const rawWd = track(pickDbOrEnv(db.workdriveToken, ["QIKBERRY_WORKDRIVE_TOKEN", "qikberry.workdrive.token"]));
  const workdriveToken = rawWd ? `Bearer ${rawWd.replace(/^bearer\s+/i, "")}` : "";

  const invoiceModeRaw = track(
    pickDbOrEnv(db.whatsappInvoiceMode, ["WHATSAPP_INVOICE_MODE"], "template"),
  ).toLowerCase();
  const whatsappInvoiceMode: "template" | "media" =
    invoiceModeRaw === "media" || invoiceModeRaw === "document" ? "media" : "template";

  const publicBasePick = pickDbOrEnv(db.messagingPublicBaseUrl, [
    "MESSAGING_PUBLIC_BASE_URL",
    "PUBLIC_API_URL",
    "API_PUBLIC_URL",
  ]);
  const prodAppPick =
    process.env.NODE_ENV === "production"
      ? pickDbOrEnv(undefined, ["APP_BASE_URL", "PUBLIC_APP_URL"])
      : { value: "", fromDb: false };
  const publicBase = (
    process.env.MESSAGING_PUBLIC_BASE_URL?.trim() ||
    track(publicBasePick) ||
    track(prodAppPick)
  ).replace(/\/$/, "");

  let dryRun = db.whatsappInvoiceDryRun;
  if (dryRun === undefined) dryRun = process.env.WHATSAPP_INVOICE_DRY_RUN === "true";

  let workdriveFor = db.workdriveForInvoice;
  if (workdriveFor === undefined) {
    if (process.env.QIKBERRY_WORKDRIVE_FOR_INVOICE === "true") workdriveFor = Boolean(workdriveToken);
    else if (process.env.QIKBERRY_WORKDRIVE_FOR_INVOICE === "false") workdriveFor = false;
    else workdriveFor = false;
  }

  let expose: boolean | null = db.exposeDemoOtp ?? null;
  if (expose === undefined || expose === null) {
    if (process.env.MESSAGING_EXPOSE_DEMO_OTP === "true") expose = true;
    else if (process.env.MESSAGING_EXPOSE_DEMO_OTP === "false") expose = false;
    else expose = null;
  }

  const config: MessagingConfig = {
    whatsapp: {
      apiKey,
      templateName:
        track(pickDbOrEnv(db.qikchatTemplateName, ["QIKCHAT_WHATSAPP_TEMPLATE_NAME"], "invoice")) || "invoice",
      templateLanguage:
        track(pickDbOrEnv(db.qikchatTemplateLanguage, ["QIKCHAT_WHATSAPP_TEMPLATE_LANGUAGE"], "en")) || "en",
    },
    sms: {
      url:
        track(
          pickDbOrEnv(db.smsUrl, ["QIKBERRY_SMS_URL"], "https://rest.qikberry.ai/v1/sms/messages"),
        ) || "https://rest.qikberry.ai/v1/sms/messages",
      bearerToken,
      templateId: track(
        pickDbOrEnv(db.smsTemplateId, ["QIKBERRY_SMS_TEMPLATE_ID", "qikberry.sms.template-id", "qikberry.sms.templateId"]),
      ),
      sender: track(pickDbOrEnv(db.smsSender, ["QIKBERRY_SMS_SENDER"], "ZIMSON")) || "ZIMSON",
      service: track(pickDbOrEnv(db.smsService, ["QIKBERRY_SMS_SERVICE"], "SI")) || "SI",
      otpMessageTemplate:
        track(pickDbOrEnv(db.smsOtpMessageTemplate, ["QIKBERRY_SMS_OTP_MESSAGE"], DEFAULT_SMS_OTP_MESSAGE)) ||
        DEFAULT_SMS_OTP_MESSAGE,
    },
    email: {
      host: track(pickDbOrEnv(db.smtpHost, ["SMTP_HOST", "SPRING_MAIL_HOST"], "smtp.gmail.com")) || "smtp.gmail.com",
      port: db.smtpPort ?? Number(envFirst("SMTP_PORT", "SPRING_MAIL_PORT") || "587"),
      user: track(pickDbOrEnv(db.smtpUser, ["SMTP_USER", "SPRING_MAIL_USERNAME"])),
      password: smtpPassword,
      from:
        track(pickDbOrEnv(db.smtpFrom, ["SMTP_FROM", "SPRING_MAIL_FROM"])) ||
        track(pickDbOrEnv(db.smtpUser, ["SMTP_USER", "SPRING_MAIL_USERNAME"])) ||
        "Zimson Service <promotion@zimson.in>",
      otpSubject: track(pickDbOrEnv(db.smtpOtpSubject, ["SMTP_OTP_SUBJECT"], DEFAULT_EMAIL_OTP_SUBJECT)),
      otpTextTemplate: track(pickDbOrEnv(db.smtpOtpMessage, ["SMTP_OTP_MESSAGE"], DEFAULT_EMAIL_OTP_TEXT)),
    },
  };

  const flags: MessagingFlags = {
    whatsappInvoiceMode,
    messagingPublicBaseUrl: publicBase,
    whatsappInvoiceDryRun: Boolean(dryRun),
    workdriveForInvoice: Boolean(workdriveFor),
    workdriveUploadUrl:
      track(
        pickDbOrEnv(db.workdriveUploadUrl, ["QIKBERRY_WORKDRIVE_UPLOAD_URL"], "https://wkdrive.qikberry.io/api/v1/upload"),
      ) || "https://wkdrive.qikberry.io/api/v1/upload",
    workdriveHeaderName: track(pickDbOrEnv(db.workdriveHeaderName, ["QIKBERRY_WORKDRIVE_HEADER_NAME"])),
    workdriveHeaderValue: track(pickDbOrEnv(db.workdriveHeaderValue, ["QIKBERRY_WORKDRIVE_HEADER_VALUE"])),
    workdriveToken,
    exposeDemoOtp: expose,
    qikchatApiBaseUrl:
      (track(pickDbOrEnv(db.qikchatApiBaseUrl, ["QIKCHAT_API_BASE_URL"], "https://api.qikchat.in")) || "https://api.qikchat.in").replace(
        /\/$/,
        "",
      ),
  };

  return { config, flags, fromDb, envFallback };
}

function applyCache(db: MessagingSettingsDb, row?: MessagingRow): void {
  dbConfig = db;
  const m = resolveMerged(db);
  resolved = m.config;
  flagsCache = m.flags;
  configuredFromDatabase = m.fromDb;
  envFallbackActive = m.envFallback;
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
  let row = rows[0];
  if (!row) {
    applyCache({});
    return;
  }

  const cfg = (row.config && typeof row.config === "object" ? row.config : {}) as MessagingSettingsDb;
  if (!dbHasAnyCredential(cfg) && envHasAnyCredential()) {
    const seeded = { ...configFromEnv(), ...cfg };
    await pool.query(
      `UPDATE messaging_settings SET config = $1::jsonb, updated_at = now(), updated_by = 'env-import' WHERE id = 1`,
      [JSON.stringify(seeded)],
    );
    const again = await pool.query<{ config: MessagingSettingsDb; updated_at: Date; updated_by: string | null }>(
      `SELECT config, updated_at, updated_by FROM messaging_settings WHERE id = 1`,
    );
    row = again.rows[0]!;
    applyCache((row.config ?? {}) as MessagingSettingsDb, row);
    console.log("[messaging-settings] Imported credentials from .env into database (one-time).");
    return;
  }

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
    const m = resolveMerged({});
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
    envFallbackActive,
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
  return toPublicSettings();
}
