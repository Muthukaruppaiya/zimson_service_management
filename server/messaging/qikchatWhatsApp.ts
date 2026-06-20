/**
 * Qikchat WhatsApp — https://qikchat.gitbook.io/apidocs
 * - Template + document header: template messages API
 * - Standalone PDF: media messages API (document type + HTTPS link)
 */

import {
  formatIndiaMobileE164,
  getMessagingConfig,
  getMessagingPublicBaseUrl,
  getQikchatMessagesUrl,
  getWhatsAppInvoiceSendModeFromSettings,
  isWhatsAppConfigured,
} from "./config";
import { qikchatApiHeaders, type QikchatSendMessageResponse } from "./qikchatApi";
import { verifyPublicInvoicePdfUrl } from "./invoicePdfPublicUrl";
import { resolvePublicHttpsDocumentUrl as resolveHttpsDocUrl } from "./publicHttpsUrl";

export type SendInvoiceWhatsAppInput = {
  phone10: string;
  customerName: string;
  invoiceNumber: string;
  /** Public HTTPS URL, or app path e.g. /uploads/invoice-pdf/file.pdf */
  documentUrl: string;
  documentFilename?: string;
};

export type WhatsAppInvoiceSendMode = "template" | "media";

export function getWhatsAppInvoiceSendMode(): WhatsAppInvoiceSendMode {
  return getWhatsAppInvoiceSendModeFromSettings();
}

function sanitizeFilename(name: string): string {
  const base = name.replace(/[^\w.\-]+/g, "_").slice(0, 120);
  return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
}

/** Qikchat downloads the file from this URL — must be public HTTPS (see Media Messages API). */
export function resolvePublicHttpsDocumentUrl(documentUrl: string): string {
  return resolveHttpsDocUrl(documentUrl, getMessagingPublicBaseUrl());
}

async function postQikchatMessage(apiKey: string, body: Record<string, unknown>): Promise<string | undefined> {
  const url = getQikchatMessagesUrl();
  console.log("[qikchat] POST", url);
  const res = await fetch(url, {
    method: "POST",
    headers: qikchatApiHeaders(apiKey),
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error("[qikchat] POST failed", res.status, text);
    throw new Error(`WhatsApp send failed (${res.status}): ${text.slice(0, 320)}`);
  }

  let messageId: string | undefined;
  try {
    const json = JSON.parse(text) as QikchatSendMessageResponse;
    messageId = json.data?.[0]?.id;
    console.log("[qikchat]", json.message ?? "queued", "| id=", messageId ?? "—");
  } catch {
    console.log("[qikchat] response:", text.slice(0, 400));
  }
  return messageId;
}

/**
 * Media Messages API — POST /v1/messages, type "document".
 * https://qikchat.gitbook.io/apidocs/reference/api-reference/media-messages
 *
 * Only works within 24h after the customer last messaged you; otherwise use template mode.
 */
export async function sendQikchatDocumentMessage(input: {
  phone10: string;
  documentUrl: string;
  filename: string;
  caption?: string;
}): Promise<string | undefined> {
  if (!isWhatsAppConfigured()) {
    throw new Error("WhatsApp not configured. Set Qikchat API key in Settings → SMS, email & WhatsApp.");
  }
  const cfg = getMessagingConfig().whatsapp;
  const to = formatIndiaMobileE164(input.phone10);
  const link = resolvePublicHttpsDocumentUrl(input.documentUrl);
  await verifyPublicInvoicePdfUrl(link);

  const payload = {
    to_contact: to,
    type: "document",
    document: {
      link,
      filename: input.filename,
      ...(input.caption?.trim() ? { caption: input.caption.trim().slice(0, 1024) } : {}),
    },
  };

  console.log("[qikchat] media document | to=", to, "| link=", link);
  return postQikchatMessage(cfg.apiKey, payload);
}

/**
 * Template message with document header — for business-initiated invoice (approved `invoice` template).
 */
export async function sendInvoiceWhatsAppTemplate(input: SendInvoiceWhatsAppInput): Promise<string | undefined> {
  if (!isWhatsAppConfigured()) {
    throw new Error("WhatsApp not configured. Set Qikchat API key and invoice template name in Settings → SMS, email & WhatsApp.");
  }

  const cfg = getMessagingConfig().whatsapp;
  const to = formatIndiaMobileE164(input.phone10);
  const customerName = input.customerName.trim() || "Customer";
  const invoiceNumber = input.invoiceNumber.trim();
  if (!invoiceNumber) throw new Error("Invoice number is required.");

  const documentUrl = resolvePublicHttpsDocumentUrl(input.documentUrl);
  await verifyPublicInvoicePdfUrl(documentUrl);
  const filename = sanitizeFilename(input.documentFilename ?? `Zimson-Invoice-${invoiceNumber}`);

  const payload = {
    to_contact: to,
    type: "template",
    template: {
      name: cfg.templateName,
      language: cfg.templateLanguage,
      components: [
        {
          type: "header",
          parameters: [
            {
              type: "document",
              document: { link: documentUrl, filename },
            },
          ],
        },
        {
          type: "body",
          parameters: [
            { type: "text", text: customerName },
            { type: "text", text: invoiceNumber },
          ],
        },
      ],
    },
  };

  console.log("[qikchat] template", cfg.templateName, "| to=", to, "| doc=", documentUrl);
  return postQikchatMessage(cfg.apiKey, payload);
}

/** Sends invoice using WHATSAPP_INVOICE_MODE (template = default for new customers). */
export async function sendInvoiceWhatsApp(input: SendInvoiceWhatsAppInput): Promise<string | undefined> {
  const mode = getWhatsAppInvoiceSendMode();
  const filename = sanitizeFilename(input.documentFilename ?? `Zimson-Invoice-${input.invoiceNumber}`);

  if (mode === "media") {
    const caption = `Hello ${input.customerName.trim() || "Customer"}, invoice ${input.invoiceNumber.trim()} from Zimson.`;
    return sendQikchatDocumentMessage({
      phone10: input.phone10,
      documentUrl: input.documentUrl,
      filename,
      caption,
    });
  }

  return sendInvoiceWhatsAppTemplate(input);
}

export type SendTrackingLinkWhatsAppInput = {
  phone10: string;
  customerName: string;
  srfNumber: string;
  trackingUrl: string;
  documentUrl: string;
  documentFilename?: string;
};

/**
 * Template message with document header — `customer_link` (SRF booking + tracking).
 * Body: Hi {{1}}, your service request {{2}} has been registered… Track: {{3}}
 */
export async function sendTrackingLinkWhatsAppTemplate(
  input: SendTrackingLinkWhatsAppInput,
): Promise<string | undefined> {
  if (!isWhatsAppConfigured()) {
    throw new Error("WhatsApp not configured. Set Qikchat API key in Settings → SMS, email & WhatsApp.");
  }

  const cfg = getMessagingConfig().whatsapp;
  const to = formatIndiaMobileE164(input.phone10);
  const customerName = input.customerName.trim() || "Customer";
  const srfNumber = input.srfNumber.trim();
  const trackingUrl = input.trackingUrl.trim();
  if (!srfNumber || !trackingUrl) throw new Error("SRF number and tracking URL are required.");

  const templateName = cfg.trackingTemplateName;
  const language = cfg.templateLanguage?.trim() || "en";

  const documentUrl = resolvePublicHttpsDocumentUrl(input.documentUrl);
  await verifyPublicInvoicePdfUrl(documentUrl);
  const filename = sanitizeFilename(input.documentFilename ?? `Zimson-SRF-${srfNumber}`);

  const payload = {
    to_contact: to,
    type: "template",
    template: {
      name: templateName,
      language,
      components: [
        {
          type: "header",
          parameters: [
            {
              type: "document",
              document: { link: documentUrl, filename },
            },
          ],
        },
        {
          type: "body",
          parameters: [
            { type: "text", text: customerName },
            { type: "text", text: srfNumber },
            { type: "text", text: trackingUrl },
          ],
        },
      ],
    },
  };

  console.log("[qikchat] template", templateName, "| to=", to, "| srf doc=", documentUrl);
  return postQikchatMessage(cfg.apiKey, payload);
}

export type SendTrackingLinkBodyOnlyInput = {
  phone10: string;
  customerName: string;
  srfNumber: string;
  trackingUrl: string;
};

/**
 * Tracking link without document header — use when PDF publish fails.
 * Template must be approved without a header (Settings → tracking text-only template name).
 */
export async function sendTrackingLinkWhatsAppBodyOnly(
  input: SendTrackingLinkBodyOnlyInput,
): Promise<string | undefined> {
  if (!isWhatsAppConfigured()) {
    throw new Error("WhatsApp not configured. Set Qikchat API key in Settings → SMS, email & WhatsApp.");
  }

  const cfg = getMessagingConfig().whatsapp;
  const to = formatIndiaMobileE164(input.phone10);
  const customerName = input.customerName.trim() || "Customer";
  const srfNumber = input.srfNumber.trim();
  const trackingUrl = input.trackingUrl.trim();
  if (!srfNumber || !trackingUrl) throw new Error("SRF number and tracking URL are required.");

  const templateName = cfg.trackingTextTemplateName;
  const language = cfg.templateLanguage?.trim() || "en";

  const payload = {
    to_contact: to,
    type: "template",
    template: {
      name: templateName,
      language,
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: customerName },
            { type: "text", text: srfNumber },
            { type: "text", text: trackingUrl },
          ],
        },
      ],
    },
  };

  console.log("[qikchat] template (body only)", templateName, "| to=", to, "| srf=", srfNumber);
  return postQikchatMessage(cfg.apiKey, payload);
}

export type SendSiteVisitApprovalWhatsAppInput = {
  phone10: string;
  customerName: string;
  srfNumber: string;
  approvalReason: string;
  trackingUrl: string;
};

/**
 * Text-only template — `site_visit_approval` (customer must approve re-estimate / site visit via tracking link).
 * Body: Hi {{1}}, your service request {{2}} needs your approval for a site visit by our technician.
 * Reason: {{3}}. Please review and respond here: {{4}} Thank you for choosing Zimson.
 */
export async function sendSiteVisitApprovalWhatsAppTemplate(
  input: SendSiteVisitApprovalWhatsAppInput,
): Promise<string | undefined> {
  if (!isWhatsAppConfigured()) {
    throw new Error("WhatsApp not configured. Set Qikchat API key in Settings → SMS, email & WhatsApp.");
  }

  const cfg = getMessagingConfig().whatsapp;
  const to = formatIndiaMobileE164(input.phone10);
  const customerName = input.customerName.trim() || "Customer";
  const srfNumber = input.srfNumber.trim();
  const approvalReason = input.approvalReason.trim().slice(0, 500) || "Approval required for next service step.";
  const trackingUrl = input.trackingUrl.trim();
  if (!srfNumber || !trackingUrl) throw new Error("SRF number and tracking URL are required.");

  const templateName = cfg.approvalTemplateName;
  const language = cfg.templateLanguage?.trim() || "en";

  const payload = {
    to_contact: to,
    type: "template",
    template: {
      name: templateName,
      language,
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: customerName },
            { type: "text", text: srfNumber },
            { type: "text", text: approvalReason },
            { type: "text", text: trackingUrl },
          ],
        },
      ],
    },
  };

  console.log("[qikchat] template", templateName, "| to=", to, "| approval srf=", srfNumber);
  return postQikchatMessage(cfg.apiKey, payload);
}
