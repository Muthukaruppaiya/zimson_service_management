/** File storage: local `uploads/` (dev) or Amazon S3 (production). */

/**
 * Top-level folders in bucket `zimson-dev-files` (also used under local `uploads/`).
 * Must match S3 keys exactly (case-sensitive).
 */
export const STORAGE_CATEGORIES = [
  "srf",
  "quick-bill",
  "customer-documents",
  "service-photos",
  "reports",
  "Invoices",
  "temp",
] as const;

/** Production bucket (ap-south-2) — override with AWS_S3_BUCKET in .env */
export const DEFAULT_S3_BUCKET = "zimson-dev-files";

export type StorageCategory = (typeof STORAGE_CATEGORIES)[number];

export function isS3StorageEnabled(): boolean {
  const mode = (process.env.FILES_STORAGE ?? process.env.STORAGE_BACKEND ?? "").trim().toLowerCase();
  if (mode === "local" || mode === "disk") return false;
  if (mode === "s3") return Boolean(process.env.AWS_S3_BUCKET?.trim());
  return Boolean(process.env.AWS_S3_BUCKET?.trim() && process.env.AWS_ACCESS_KEY_ID?.trim());
}

export function s3Bucket(): string {
  const explicit = (process.env.AWS_S3_BUCKET ?? "").trim();
  if (explicit) return explicit;
  if (process.env.NODE_ENV === "production") return DEFAULT_S3_BUCKET;
  return "";
}

export function s3Region(): string {
  return (process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "ap-south-2").trim();
}

/** Optional extra prefix inside the bucket. Leave empty when folders are at bucket root. */
export function s3KeyPrefix(): string {
  return (process.env.AWS_S3_PREFIX ?? "").trim().replace(/^\/+|\/+$/g, "");
}

export function mediaUrlPrefix(): string {
  return "api/media";
}

/** Browser path prefix stored in DB for S3 objects (served via GET /api/media/...). */
export function storagePathForKey(category: StorageCategory, filename: string): string {
  return `${mediaUrlPrefix()}/${category}/${filename}`;
}

export function keyFromStoragePath(storagePath: string): string | null {
  const norm = storagePath.replace(/\\/g, "/").replace(/^\//, "");
  const prefix = `${mediaUrlPrefix()}/`;
  if (!norm.startsWith(prefix)) return null;
  return norm.slice(prefix.length);
}

export function localPathFromStorage(storagePath: string): string | null {
  const norm = storagePath.replace(/\\/g, "/").replace(/^\//, "");
  if (!norm.startsWith("uploads/")) return null;
  return norm;
}

/** SRF / capture: customer PDF → customer-documents; watch photos → service-photos. */
export function categoryForSrfPhoto(photoKind: string): StorageCategory {
  return photoKind === "document" ? "customer-documents" : "service-photos";
}

/** Quick Bill staff attachment: doc → customer-documents; image → quick-bill. */
export function categoryForQuickBillAttachment(kind: "doc" | "img"): StorageCategory {
  return kind === "doc" ? "customer-documents" : "quick-bill";
}

/** WhatsApp / email invoice PDF staging → bucket folder Invoices/ */
export function categoryForInvoicePdf(): StorageCategory {
  return "Invoices";
}
