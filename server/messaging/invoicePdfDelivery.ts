import type { Request } from "express";
import { getMessagingPublicBaseUrl } from "./config";
import { normalizeMessagingPublicBaseUrl } from "./publicHttpsUrl";
import { publicInvoicePdfApiPath, verifyPublicInvoicePdfUrl } from "./invoicePdfPublicUrl";
import { uploadInvoicePdfToWorkDrive, shouldUseWorkDriveForInvoicePdf } from "./qikberryWorkDrive";
import { ensureDevPublicTunnel, verifyTunnelBaseUrl } from "../devPublicTunnel";
import { categoryForInvoicePdf, isS3StorageEnabled, keyFromStoragePath } from "../storage/config";
import { persistUploadedFile, readStorageFileBytes } from "../storage/fileStorage";
import { s3PresignedGetUrl } from "../storage/s3Client";

function getPublicBaseFromRequest(req: Request): string | null {
  const proto = req.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const host = req.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (proto === "https" && host) return `https://${host}`;
  return null;
}

function buildPublicInvoicePdfUrl(publicBase: string, filename: string): string {
  return `${normalizeMessagingPublicBaseUrl(publicBase)}${publicInvoicePdfApiPath(filename)}`;
}

/** Saves invoice PDF under bucket folder `Invoices/` (WhatsApp / email delivery). */
export async function saveInvoicePdfToStorage(pdfBuffer: Buffer, filename: string): Promise<string> {
  return persistUploadedFile({
    category: categoryForInvoicePdf(),
    buffer: pdfBuffer,
    originalName: filename,
    mime: "application/pdf",
    fallbackExt: ".pdf",
    fixedFilename: filename,
  });
}

async function tryPresignedS3FromStoragePath(storagePath: string): Promise<string | null> {
  if (!isS3StorageEnabled()) return null;
  const key = keyFromStoragePath(storagePath);
  if (!key) return null;
  const url = await s3PresignedGetUrl(key, 60 * 60 * 24 * 7);
  await verifyPublicInvoicePdfUrl(url);
  console.log("[messaging/whatsapp/invoice] using S3 presigned PDF URL");
  return url;
}

function isLocalDevApi(): boolean {
  return process.env.NODE_ENV !== "production";
}

async function tryPublicApiInvoiceUrl(
  req: Request,
  filename: string,
  port: number,
): Promise<string | null> {
  const bases: string[] = [];
  const tunneled = await ensureDevPublicTunnel(port);
  if (tunneled) bases.push(normalizeMessagingPublicBaseUrl(tunneled));
  const fromReq = getPublicBaseFromRequest(req);
  if (fromReq) bases.push(normalizeMessagingPublicBaseUrl(fromReq));
  const configured = getMessagingPublicBaseUrl();
  if (configured) bases.push(configured);

  const seen = new Set<string>();
  for (const base of bases) {
    if (!base || seen.has(base)) continue;
    seen.add(base);
    if (!(await verifyTunnelBaseUrl(base))) continue;
    const url = buildPublicInvoicePdfUrl(base, filename);
    try {
      await verifyPublicInvoicePdfUrl(url);
      console.log("[messaging/whatsapp/invoice] verified public API PDF URL:", url);
      return url;
    } catch (e) {
      console.warn("[messaging/whatsapp/invoice] public PDF URL rejected:", url, e);
    }
  }
  return null;
}

async function tryMediaApiInvoiceUrl(req: Request, storagePath: string): Promise<string | null> {
  if (!isS3StorageEnabled()) return null;
  const key = keyFromStoragePath(storagePath);
  if (!key) return null;

  const bases: string[] = [];
  const configured = getMessagingPublicBaseUrl();
  if (configured) bases.push(configured);
  const fromReq = getPublicBaseFromRequest(req);
  if (fromReq) bases.push(normalizeMessagingPublicBaseUrl(fromReq));

  const seen = new Set<string>();
  for (const base of bases) {
    if (!base || seen.has(base)) continue;
    seen.add(base);
    const url = `${base}/api/media/${key.split("/").map(encodeURIComponent).join("/")}`;
    try {
      await verifyPublicInvoicePdfUrl(url);
      console.log("[messaging/whatsapp/invoice] verified media API PDF URL:", url);
      return url;
    } catch (e) {
      console.warn("[messaging/whatsapp/invoice] media PDF URL rejected:", url, e);
    }
  }
  return null;
}

/** Resolves a Qikchat-safe HTTPS link to a real PDF (S3 presigned, public API, media API, or Work Drive). */
export async function resolveWhatsAppInvoiceDocumentUrl(
  req: Request,
  storagePath: string,
  filename: string,
  documentFilename: string,
): Promise<string> {
  const s3Url = await tryPresignedS3FromStoragePath(storagePath);
  if (s3Url) return s3Url;

  const port = Number(process.env.PORT) || 4000;
  const apiUrl = await tryPublicApiInvoiceUrl(req, filename, port);
  if (apiUrl) return apiUrl;

  const mediaUrl = await tryMediaApiInvoiceUrl(req, storagePath);
  if (mediaUrl) return mediaUrl;

  if (shouldUseWorkDriveForInvoicePdf()) {
    try {
      const buf = await readStorageFileBytes(storagePath);
      const abs = await writeTempLocalForWorkDrive(buf, filename);
      const wd = await uploadInvoicePdfToWorkDrive(abs, documentFilename);
      await verifyPublicInvoicePdfUrl(wd);
      return wd;
    } catch (e) {
      console.warn("[messaging/whatsapp/invoice] Work Drive failed:", e);
    }
  }

  const localHint = isLocalDevApi()
    ? " Local dev: keep the API server running on port " +
      port +
      ", set MESSAGING_AUTO_TUNNEL=true (cloudflared), or WHATSAPP_INVOICE_DRY_RUN=true to test without WhatsApp. " +
      "Do not point MESSAGING_PUBLIC_BASE_URL at https://zimsonwatchcare.com unless that host proxies /api to this Node app."
    : " On production set FILES_STORAGE=s3 (recommended), or deploy /api/messaging/public-invoice-pdf/ with Nginx proxying /api to Node (not the Vite SPA).";

  throw new Error(`Could not publish invoice PDF for WhatsApp.${localHint}`);
}

async function writeTempLocalForWorkDrive(buf: Buffer, filename: string): Promise<string> {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const dir = path.join(process.cwd(), "uploads", "temp");
  fs.mkdirSync(dir, { recursive: true });
  const abs = path.join(dir, filename);
  fs.writeFileSync(abs, buf);
  return abs;
}
