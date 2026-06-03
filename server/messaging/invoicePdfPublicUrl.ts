import fs from "node:fs";
import path from "node:path";

/** Safe filenames from multer disk storage (inv-{timestamp}-{rand}.pdf). */
const SAFE_FILENAME = /^inv-[a-z0-9-]+\.pdf$/i;

export function publicInvoicePdfApiPath(filename: string): string {
  const base = path.basename(filename);
  if (!SAFE_FILENAME.test(base)) {
    throw new Error("Invalid invoice PDF filename.");
  }
  return `/api/messaging/public-invoice-pdf/${encodeURIComponent(base)}`;
}

export function resolveInvoicePdfFilePath(invoicePdfDir: string, filenameParam: string): string | null {
  const base = path.basename(filenameParam);
  if (!SAFE_FILENAME.test(base)) return null;
  const filePath = path.join(invoicePdfDir, base);
  if (!fs.existsSync(filePath)) return null;
  return filePath;
}

/**
 * Qikchat/WhatsApp download the document from this URL. If it returns HTML (SPA / wrong host),
 * customers get a tiny .pdf.html file instead of a real invoice.
 */
export async function verifyPublicInvoicePdfUrl(documentUrl: string): Promise<void> {
  const url = documentUrl.trim();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Range: "bytes=0-2047",
        Accept: "application/pdf",
      },
      redirect: "follow",
      signal: ctrl.signal,
    });
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    const buf = Buffer.from(await res.arrayBuffer());
    const isPdf = buf.length >= 4 && buf.subarray(0, 4).toString("ascii") === "%PDF";
    if (isPdf) return;

    const head = buf.subarray(0, 120).toString("utf8").replace(/\s+/g, " ");
    const looksHtml =
      ct.includes("text/html") ||
      head.includes("<!DOCTYPE") ||
      head.includes("<html") ||
      head.includes("<!doctype");

    const hint = looksHtml
      ? " That URL returned your website HTML page, not the PDF. Set Public PDF base URL to the same host that proxies /api to Node (e.g. https://zimsonwatchcare.com — invoice links use /api/messaging/public-invoice-pdf/). Do not use the Vite dev port (5173)."
      : ` Content-Type was "${ct || "unknown"}" and the file does not start with %PDF.`;

    throw new Error(`WhatsApp invoice link is not a downloadable PDF.${hint}`);
  } catch (e) {
    if (e instanceof Error && e.message.includes("WhatsApp invoice link")) throw e;
    throw new Error(
      `Could not verify invoice PDF URL (${url}). Check MESSAGING_PUBLIC_BASE_URL and that Nginx proxies /api to the Node server.`,
    );
  } finally {
    clearTimeout(timer);
  }
}
