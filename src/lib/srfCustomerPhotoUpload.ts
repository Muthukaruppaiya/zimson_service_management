import { SRF_CUSTOMER_PHOTO_MAX_BYTES, srfCustomerPhotoMaxSizeLabel } from "./srfPhotoLimits";

export const SRF_WATCH_PHOTO_ACCEPT =
  "image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".heif", ".bmp"]);

function fileExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

function tooLargeMessage(file: File): string {
  const mb = (file.size / (1024 * 1024)).toFixed(1);
  return `File is too large (${mb} MB). Maximum size is ${srfCustomerPhotoMaxSizeLabel()}.`;
}

/** Watch / document capture slots — images only (no PDF, Word, etc.). */
export function validateSrfCustomerPhotoFile(file: File): string | null {
  if (file.size > SRF_CUSTOMER_PHOTO_MAX_BYTES) return tooLargeMessage(file);
  const ext = fileExt(file.name);
  const mime = (file.type || "").toLowerCase();
  if (mime.startsWith("image/") || IMAGE_EXTENSIONS.has(ext)) {
    if (mime === "image/svg+xml" || ext === ".svg") {
      return "SVG images are not allowed. Use JPEG, PNG, GIF, or WebP.";
    }
    return null;
  }
  return "Only image files (JPEG, PNG, GIF, WebP, etc.) are allowed.";
}

export function validateSrfCustomerPhotoUpload(
  file: { size: number; mimetype?: string; originalname?: string },
): string | null {
  if (file.size > SRF_CUSTOMER_PHOTO_MAX_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return `File is too large (${mb} MB). Maximum size is ${srfCustomerPhotoMaxSizeLabel()}.`;
  }
  const ext = fileExt(file.originalname || "");
  const mime = (file.mimetype || "").toLowerCase();
  if (mime.startsWith("image/") || IMAGE_EXTENSIONS.has(ext)) {
    if (mime === "image/svg+xml" || ext === ".svg") {
      return "SVG images are not allowed. Use JPEG, PNG, GIF, or WebP.";
    }
    return null;
  }
  return "Only image files (JPEG, PNG, GIF, WebP, etc.) are allowed.";
}
