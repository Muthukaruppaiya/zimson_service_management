import type { Express, NextFunction, Request, Response } from "express";
import type { Pool } from "pg";
import type { DemoUser } from "../src/types/user";
import {
  refreshMessagingSettingsCache,
  saveMessagingSettings,
  toPublicSettings,
  type MessagingSettingsDb,
} from "./messagingSettingsStore";

type Authed = Request & { userId: string };

function parseBool(raw: unknown): boolean | undefined {
  if (raw === true || raw === "true") return true;
  if (raw === false || raw === "false") return false;
  return undefined;
}

function parseExposeDemoOtp(raw: unknown): boolean | null | undefined {
  if (raw === null || raw === "auto") return null;
  const b = parseBool(raw);
  if (b === undefined) return undefined;
  return b;
}

function bodyToDb(body: Record<string, unknown>): MessagingSettingsDb {
  const portRaw = body.smtpPort;
  const smtpPort =
    portRaw === undefined || portRaw === ""
      ? undefined
      : Math.min(65535, Math.max(1, Math.round(Number(portRaw)) || 587));

  const mode = String(body.whatsappInvoiceMode ?? "").trim().toLowerCase();
  const whatsappInvoiceMode = mode === "media" || mode === "document" ? "media" : mode === "template" ? "template" : undefined;

  return {
    smsEnabled: parseBool(body.smsEnabled),
    smsUrl: String(body.smsUrl ?? "").trim().slice(0, 500) || undefined,
    smsToken: String(body.smsToken ?? "").trim().slice(0, 2000) || undefined,
    smsTemplateId: String(body.smsTemplateId ?? "").trim().slice(0, 80) || undefined,
    smsSender: String(body.smsSender ?? "").trim().slice(0, 16) || undefined,
    smsService: String(body.smsService ?? "").trim().slice(0, 16) || undefined,
    smsOtpMessageTemplate: String(body.smsOtpMessageTemplate ?? "").trim().slice(0, 2000) || undefined,

    emailEnabled: parseBool(body.emailEnabled),
    smtpHost: String(body.smtpHost ?? "").trim().slice(0, 200) || undefined,
    smtpPort,
    smtpUser: String(body.smtpUser ?? "").trim().slice(0, 200) || undefined,
    smtpPassword: String(body.smtpPassword ?? "").replace(/\s+/g, "").slice(0, 500) || undefined,
    smtpFrom: String(body.smtpFrom ?? "").trim().slice(0, 200) || undefined,
    smtpOtpSubject: String(body.smtpOtpSubject ?? "").trim().slice(0, 200) || undefined,
    smtpOtpMessage: String(body.smtpOtpMessage ?? "").trim().slice(0, 4000) || undefined,

    whatsappEnabled: parseBool(body.whatsappEnabled),
    qikchatApiKey: String(body.qikchatApiKey ?? "").trim().slice(0, 2000) || undefined,
    qikchatApiBaseUrl: String(body.qikchatApiBaseUrl ?? "").trim().slice(0, 500) || undefined,
    qikchatTemplateName: String(body.qikchatTemplateName ?? "").trim().slice(0, 120) || undefined,
    qikchatTemplateLanguage: String(body.qikchatTemplateLanguage ?? "").trim().slice(0, 16) || undefined,
    qikchatTrackingTemplateName: String(body.qikchatTrackingTemplateName ?? "").trim().slice(0, 120) || undefined,
    qikchatTrackingTextTemplateName:
      String(body.qikchatTrackingTextTemplateName ?? "").trim().slice(0, 120) || undefined,
    qikchatApprovalTemplateName: String(body.qikchatApprovalTemplateName ?? "").trim().slice(0, 120) || undefined,
    qikchatReadyPickupTemplateName:
      String(body.qikchatReadyPickupTemplateName ?? "").trim().slice(0, 120) || undefined,
    qikchatTrackingTemplateBody: String(body.qikchatTrackingTemplateBody ?? "").trim().slice(0, 2000) || undefined,
    qikchatApprovalTemplateBody: String(body.qikchatApprovalTemplateBody ?? "").trim().slice(0, 2000) || undefined,
    qikchatReadyPickupTemplateBody:
      String(body.qikchatReadyPickupTemplateBody ?? "").trim().slice(0, 2000) || undefined,
    qikchatInvoiceTemplateBody: String(body.qikchatInvoiceTemplateBody ?? "").trim().slice(0, 2000) || undefined,
    whatsappInvoiceMode,
    messagingPublicBaseUrl: String(body.messagingPublicBaseUrl ?? "").trim().slice(0, 500) || undefined,
    whatsappInvoiceDryRun: parseBool(body.whatsappInvoiceDryRun),

    workdriveForInvoice: parseBool(body.workdriveForInvoice),
    workdriveToken: String(body.workdriveToken ?? "").trim().slice(0, 2000) || undefined,
    workdriveUploadUrl: String(body.workdriveUploadUrl ?? "").trim().slice(0, 500) || undefined,
    workdriveHeaderName: String(body.workdriveHeaderName ?? "").trim().slice(0, 80) || undefined,
    workdriveHeaderValue: String(body.workdriveHeaderValue ?? "").trim().slice(0, 500) || undefined,

    exposeDemoOtp: parseExposeDemoOtp(body.exposeDemoOtp),
  };
}

export function registerMessagingSettingsRoutes(
  app: Express,
  pool: Pool,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
  getUserById: (id: string) => DemoUser | null,
): void {
  app.get("/api/settings/messaging", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    if (actor.role !== "super_admin") {
      res.status(403).json({ error: "Only super admin can view messaging settings." });
      return;
    }
    try {
      await refreshMessagingSettingsCache();
      res.json({ settings: toPublicSettings() });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not load messaging settings." });
    }
  });

  app.put("/api/settings/messaging", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    if (actor.role !== "super_admin") {
      res.status(403).json({ error: "Only super admin can update messaging settings." });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const updatedBy = actor.displayName?.trim() || actor.email;

    try {
      const settings = await saveMessagingSettings(bodyToDb(body), updatedBy);
      res.json({ settings });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not save messaging settings." });
    }
  });
}
