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
  let url = documentUrl.trim();
  if (url.startsWith("/")) {
    const base = getMessagingPublicBaseUrl();
    if (!base) {
      throw new Error(
        "Public PDF base URL is not set. Configure it in Settings → SMS, email & WhatsApp, or enable MESSAGING_AUTO_TUNNEL=true in .env for local dev.",
      );
    }
    url = `${base.replace(/\/$/, "")}${url}`;
  }

  if (!/^https:\/\//i.test(url)) {
    throw new Error(
      "Invoice PDF must be a direct public HTTPS link (https://.../*.pdf). Qikchat fetches the file from this URL — localhost will not work.",
    );
  }
  return url;
}

async function postQikchatMessage(apiKey: string, body: Record<string, unknown>): Promise<string | undefined> {
  const res = await fetch(getQikchatMessagesUrl(), {
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
