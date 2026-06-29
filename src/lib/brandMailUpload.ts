import { ApiError } from "./api";
import { validateSrfDocumentFile, SRF_DOCUMENT_ACCEPT } from "./srfCustomerPhotoUpload";

export type BrandMailAttachmentRef = {
  attachmentPath: string;
  fileName: string;
  mime: string;
  bytes: number;
};

export { SRF_DOCUMENT_ACCEPT };

export function validateBrandMailFile(file: File): string | null {
  return validateSrfDocumentFile(file);
}

export async function uploadBrandMailAttachment(srfId: string, file: File): Promise<BrandMailAttachmentRef> {
  const err = validateBrandMailFile(file);
  if (err) throw new Error(err);

  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`/api/service/srf-jobs/${encodeURIComponent(srfId)}/brand/upload-attachment`, {
    method: "POST",
    credentials: "include",
    body: fd,
  });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const msg =
      typeof data === "object" && data !== null && "error" in data
        ? String((data as { error: string }).error)
        : res.statusText;
    throw new ApiError(msg || "Upload failed", res.status, data);
  }
  return data as BrandMailAttachmentRef;
}

export function brandMailMetaFromAttachment(att: BrandMailAttachmentRef | null | undefined) {
  if (!att) return undefined;
  return {
    attachmentPath: att.attachmentPath,
    fileName: att.fileName,
    mime: att.mime,
    bytes: att.bytes,
  };
}
