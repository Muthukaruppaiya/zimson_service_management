import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** Safe filenames from disk storage (srf-{timestamp}-{rand}.pdf). */
const SAFE_FILENAME = /^srf-[a-z0-9-]+\.pdf$/i;

export function publicSrfPdfApiPath(filename: string): string {
  const base = path.basename(filename);
  if (!SAFE_FILENAME.test(base)) {
    throw new Error("Invalid SRF PDF filename.");
  }
  return `/api/messaging/public-srf-pdf/${encodeURIComponent(base)}`;
}

export function resolveSrfPdfFilePath(srfPdfDir: string, filenameParam: string): string | null {
  const base = path.basename(filenameParam);
  if (!SAFE_FILENAME.test(base)) return null;
  const filePath = path.join(srfPdfDir, base);
  if (!fs.existsSync(filePath)) return null;
  return filePath;
}

export function makeSrfPdfStorageFilename(): string {
  const rand = cryptoRandomHex(8);
  return `srf-${Date.now()}-${rand}.pdf`;
}

function cryptoRandomHex(bytes: number): string {
  return crypto.randomBytes(bytes).toString("hex");
}
