import { isLocalOrPrivateAppHost } from "../publicAppUrl";

/** Public API/site host for WhatsApp PDF links — always HTTPS on real domains. */
export function normalizeMessagingPublicBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return "";

  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const u = new URL(withProto);

  if (isLocalOrPrivateAppHost(u.hostname)) {
    return `${u.protocol}//${u.host}`;
  }

  if (u.protocol === "http:") {
    u.protocol = "https:";
  }
  if (u.hostname.endsWith("zimsonwatchcare.com") && u.protocol !== "https:") {
    u.protocol = "https:";
  }

  return `${u.protocol}//${u.host}`;
}

/**
 * Full document URL for Qikchat (HTTPS, public host). Relative paths use MESSAGING_PUBLIC_BASE_URL.
 */
export function resolvePublicHttpsDocumentUrl(documentUrl: string, publicBase?: string): string {
  let url = documentUrl.trim();
  if (!url) {
    throw new Error("Invoice document URL is missing.");
  }

  if (url.startsWith("/")) {
    const base = (publicBase ?? "").trim();
    if (!base) {
      throw new Error(
        "Public PDF base URL is not set. On the server set MESSAGING_PUBLIC_BASE_URL=https://zimsonwatchcare.com " +
          "(same host as the site, with Nginx proxying /api to Node).",
      );
    }
    url = `${normalizeMessagingPublicBaseUrl(base)}${url}`;
  } else if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  const u = new URL(url);

  if (isLocalOrPrivateAppHost(u.hostname)) {
    throw new Error(
      "WhatsApp cannot download PDFs from localhost or a private IP. On the server use HTTPS " +
        "(MESSAGING_PUBLIC_BASE_URL=https://zimsonwatchcare.com with /api on Node, or FILES_STORAGE=s3). " +
        "On a dev PC use MESSAGING_AUTO_TUNNEL=true or WHATSAPP_INVOICE_DRY_RUN=true.",
    );
  }

  if (u.protocol === "http:") {
    u.protocol = "https:";
  }

  return u.href;
}
