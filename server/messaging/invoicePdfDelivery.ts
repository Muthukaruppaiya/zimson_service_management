import fs from "node:fs";
import type { Request } from "express";
import { getMessagingPublicBaseUrl } from "./config";
import { publicInvoicePdfApiPath, verifyPublicInvoicePdfUrl } from "./invoicePdfPublicUrl";
import { uploadInvoicePdfToWorkDrive, shouldUseWorkDriveForInvoicePdf } from "./qikberryWorkDrive";
import { ensureDevPublicTunnel, verifyTunnelBaseUrl } from "../devPublicTunnel";
import { isS3StorageEnabled } from "../storage/config";
import { s3PresignedGetUrl, s3PutObject } from "../storage/s3Client";

function getPublicBaseFromRequest(req: Request): string | null {
  const proto = req.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const host = req.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (proto === "https" && host) return `https://${host}`;
  return null;
}

function buildPublicInvoicePdfUrl(publicBase: string, filename: string): string {
  return `${publicBase.replace(/\/$/, "")}${publicInvoicePdfApiPath(filename)}`;
}

async function tryPresignedS3InvoiceUrl(filePath: string, filename: string): Promise<string | null> {
  if (!isS3StorageEnabled()) return null;
  const buf = fs.readFileSync(filePath);
  const key = `invoice-pdf/${filename}`;
  await s3PutObject(key, buf, "application/pdf");
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
  if (tunneled) bases.push(tunneled.replace(/\/$/, ""));
  const fromReq = getPublicBaseFromRequest(req);
  if (fromReq) bases.push(fromReq.replace(/\/$/, ""));
  const configured = getMessagingPublicBaseUrl();
  if (configured) bases.push(configured.replace(/\/$/, ""));

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

async function tryMediaApiInvoiceUrl(
  req: Request,
  filename: string,
  filePath: string,
): Promise<string | null> {
  if (!isS3StorageEnabled()) return null;
  const buf = fs.readFileSync(filePath);
  const key = `invoice-pdf/${filename}`;
  await s3PutObject(key, buf, "application/pdf");

  const bases: string[] = [];
  const configured = getMessagingPublicBaseUrl();
  if (configured) bases.push(configured.replace(/\/$/, ""));
  const fromReq = getPublicBaseFromRequest(req);
  if (fromReq) bases.push(fromReq.replace(/\/$/, ""));

  const seen = new Set<string>();
  for (const base of bases) {
    if (!base || seen.has(base)) continue;
    seen.add(base);
    const url = `${base}/api/media/${encodeURIComponent(key)}`;
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
  filePath: string,
  filename: string,
  documentFilename: string,
): Promise<string> {
  const s3Url = await tryPresignedS3InvoiceUrl(filePath, filename);
  if (s3Url) return s3Url;

  const port = Number(process.env.PORT) || 4000;
  const apiUrl = await tryPublicApiInvoiceUrl(req, filename, port);
  if (apiUrl) return apiUrl;

  const mediaUrl = await tryMediaApiInvoiceUrl(req, filename, filePath);
  if (mediaUrl) return mediaUrl;

  if (shouldUseWorkDriveForInvoicePdf()) {
    try {
      const wd = await uploadInvoicePdfToWorkDrive(filePath, documentFilename);
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
