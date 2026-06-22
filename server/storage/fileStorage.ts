import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  isS3StorageEnabled,
  keyFromStoragePath,
  localPathFromStorage,
  storagePathForKey,
  type StorageCategory,
} from "./config";
import { s3DeleteObject, s3PutObject, s3GetObjectBuffer } from "./s3Client";

const UPLOAD_ROOT = path.join(process.cwd(), "uploads");

export function buildStoredFilename(originalName: string, fallbackExt = ".bin"): string {
  const ext = path.extname(originalName || "").slice(0, 12) || fallbackExt;
  return `${Date.now()}-${crypto.randomUUID()}${ext}`;
}

export async function persistUploadedFile(input: {
  category: StorageCategory;
  buffer: Buffer;
  originalName: string;
  mime: string;
  fallbackExt?: string;
  /** When set, use this filename instead of a generated one (must be safe). */
  fixedFilename?: string;
}): Promise<string> {
  const filename =
    input.fixedFilename?.trim() || buildStoredFilename(input.originalName, input.fallbackExt ?? ".bin");
  const relativeKey = `${input.category}/${filename}`;

  if (isS3StorageEnabled()) {
    await s3PutObject(relativeKey, input.buffer, input.mime);
    return storagePathForKey(input.category, filename);
  }

  const dir = path.join(UPLOAD_ROOT, input.category);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, filename), input.buffer);
  return `uploads/${relativeKey}`.replace(/\\/g, "/");
}

/** Read file bytes from api/media/… storage path or legacy absolute/local path. */
export async function readStorageFileBytes(filePath: string): Promise<Buffer> {
  const fp = String(filePath ?? "").replace(/\\/g, "/").trim();
  const fromStore = fp.startsWith("api/media/") || fp.startsWith("/api/media/");
  if (fromStore) {
    const buf = await readStoredFileBuffer(fp.replace(/^\//, ""));
    if (!buf?.length) throw new Error("File not found in storage.");
    return buf;
  }
  const abs = path.isAbsolute(fp) ? fp : absoluteLocalPath(fp) ?? path.join(process.cwd(), fp);
  return fs.readFile(abs);
}

export async function deleteStoredFile(storagePath: string | null | undefined): Promise<void> {
  const fp = String(storagePath ?? "").replace(/\\/g, "/").trim();
  if (!fp || fp.startsWith("(demo")) return;

  const s3Key = keyFromStoragePath(fp);
  if (s3Key) {
    await s3DeleteObject(s3Key).catch(() => {});
    return;
  }

  const localRel = localPathFromStorage(fp) ?? (fp.startsWith("uploads/") ? fp : null);
  if (!localRel) return;
  const abs = path.isAbsolute(fp) ? fp : path.join(process.cwd(), localRel);
  await fs.unlink(abs).catch(() => {});
}

export function absoluteLocalPath(storagePath: string): string | null {
  const fp = storagePath.replace(/\\/g, "/").trim();
  const localRel = localPathFromStorage(fp) ?? (fp.startsWith("uploads/") ? fp.replace(/^\//, "") : null);
  if (!localRel) return null;
  return path.isAbsolute(fp) ? fp : path.join(process.cwd(), localRel);
}

/** Read bytes from local uploads/ path or S3 api/media/ path. */
export async function readStoredFileBuffer(storagePath: string): Promise<Buffer | null> {
  const fp = String(storagePath ?? "").replace(/\\/g, "/").trim();
  if (!fp) return null;

  const s3Key = keyFromStoragePath(fp);
  if (s3Key && isS3StorageEnabled()) {
    try {
      return await s3GetObjectBuffer(s3Key);
    } catch {
      return null;
    }
  }

  const abs = absoluteLocalPath(fp);
  if (!abs) return null;
  try {
    return await fs.readFile(abs);
  } catch {
    return null;
  }
}
