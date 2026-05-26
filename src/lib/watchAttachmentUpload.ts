/** Quick Bill watch document / image attachments — keep in sync with `server/quickBillRoutes.ts` multer limits. */
export const WATCH_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;

export const WATCH_DOCUMENT_ACCEPT =
  ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const WATCH_IMAGE_ACCEPT =
  "image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif";

const DOC_EXTENSIONS = new Set([".pdf", ".doc", ".docx"]);
const DOC_MIMES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".heif", ".bmp"]);

function fileExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

function tooLargeMessage(file: File): string {
  const mb = (file.size / (1024 * 1024)).toFixed(1);
  return `File is too large (${mb} MB). Maximum size is ${watchAttachmentMaxSizeLabel()}.`;
}

export function watchAttachmentMaxSizeLabel(): string {
  return "5 MB";
}

export function validateQuickBillDocumentFile(file: File): string | null {
  if (file.size > WATCH_ATTACHMENT_MAX_BYTES) return tooLargeMessage(file);
  const ext = fileExt(file.name);
  const mime = (file.type || "").toLowerCase();
  if (DOC_EXTENSIONS.has(ext) || DOC_MIMES.has(mime)) return null;
  return "Only PDF or Word documents (.pdf, .doc, .docx) are allowed.";
}

export function validateQuickBillImageFile(file: File): string | null {
  if (file.size > WATCH_ATTACHMENT_MAX_BYTES) return tooLargeMessage(file);
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

/** Server-side check using multer file metadata. */
export function validateQuickBillAttachmentFile(
  file: { size: number; mimetype?: string; originalname?: string },
  kind: "doc" | "img",
): string | null {
  if (file.size > WATCH_ATTACHMENT_MAX_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return `File is too large (${mb} MB). Maximum size is ${watchAttachmentMaxSizeLabel()}.`;
  }
  const ext = fileExt(file.originalname || "");
  const mime = (file.mimetype || "").toLowerCase();
  if (kind === "doc") {
    if (DOC_EXTENSIONS.has(ext) || DOC_MIMES.has(mime)) return null;
    return "Only PDF or Word documents (.pdf, .doc, .docx) are allowed.";
  }
  if (mime.startsWith("image/") || IMAGE_EXTENSIONS.has(ext)) {
    if (mime === "image/svg+xml" || ext === ".svg") {
      return "SVG images are not allowed. Use JPEG, PNG, GIF, or WebP.";
    }
    return null;
  }
  return "Only image files (JPEG, PNG, GIF, WebP, etc.) are allowed.";
}

export function watchAttachmentDisplayName(pathOrLabel: string): string {
  const raw = pathOrLabel.trim();
  if (!raw) return "";
  const segment = raw.split(/[/\\]/).pop() ?? raw;
  return segment.replace(/^\(demo, not saved\)\s*/i, "");
}
