/** File storage: local `uploads/` (dev) or Amazon S3 (production). */

export type StorageCategory = "srf" | "quick-bill" | "invoice-pdf" | "grn";

export function isS3StorageEnabled(): boolean {
  const mode = (process.env.FILES_STORAGE ?? process.env.STORAGE_BACKEND ?? "").trim().toLowerCase();
  if (mode === "local" || mode === "disk") return false;
  if (mode === "s3") return Boolean(process.env.AWS_S3_BUCKET?.trim());
  return Boolean(process.env.AWS_S3_BUCKET?.trim() && process.env.AWS_ACCESS_KEY_ID?.trim());
}

export function s3Bucket(): string {
  return (process.env.AWS_S3_BUCKET ?? "").trim();
}

export function s3Region(): string {
  return (process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "ap-south-2").trim();
}

export function s3KeyPrefix(): string {
  const p = (process.env.AWS_S3_PREFIX ?? "zimson").trim().replace(/^\/+|\/+$/g, "");
  return p || "zimson";
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
