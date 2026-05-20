import fs from "node:fs";
import {
  getWorkDriveBearerToken,
  getWorkDriveExtraHeaders,
  getWorkDriveUploadUrl,
  shouldUseWorkDriveForInvoicePdf,
} from "./config";

function extractPublicUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const o = payload as Record<string, unknown>;
  const candidates = [
    o.url,
    o.publicUrl,
    o.public_url,
    o.fileUrl,
    o.file_url,
    o.link,
    (o.data as Record<string, unknown> | undefined)?.url,
    (o.data as Record<string, unknown> | undefined)?.publicUrl,
    (o.data as Record<string, unknown> | undefined)?.public_url,
    (o.data as Record<string, unknown> | undefined)?.file_url,
    (o.file as Record<string, unknown> | undefined)?.url,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && /^https:\/\//i.test(c.trim())) {
      return c.trim();
    }
  }
  return null;
}

function workDriveUploadHeaders(): Record<string, string> {
  const bearer = getWorkDriveBearerToken();
  if (!bearer) {
    throw new Error(
      "Work Drive token is not set. Configure it under Settings → SMS, email & WhatsApp, or set a public PDF base URL.",
    );
  }

  const headers: Record<string, string> = {
    Authorization: bearer,
  };

  const extra = getWorkDriveExtraHeaders();
  if (extra) {
    headers[extra.name] = extra.value;
  }

  return headers;
}

/** Upload invoice PDF to Qikberry Work Drive — returns a public HTTPS URL for WhatsApp. */
export async function uploadInvoicePdfToWorkDrive(
  filePath: string,
  filename: string,
): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: "application/pdf" }), filename);

  const res = await fetch(getWorkDriveUploadUrl(), {
    method: "POST",
    headers: workDriveUploadHeaders(),
    body: form,
  });

  const text = await res.text();
  if (!res.ok) {
    console.error("[qikberry-workdrive] upload failed", res.status, text);
    if (res.status === 401) {
      throw new Error(
        "Work Drive rejected the token (401). Use the Work Drive upload token from Qikberry (not the SMS or WhatsApp key), or configure a public HTTPS PDF base URL.",
      );
    }
    throw new Error(`Work Drive upload failed (${res.status}): ${text.slice(0, 280)}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    if (/^https:\/\//i.test(text.trim())) return text.trim();
    throw new Error("Work Drive upload succeeded but no public URL was returned.");
  }

  const url = extractPublicUrl(json);
  if (!url) {
    console.error("[qikberry-workdrive] unexpected response:", text.slice(0, 500));
    throw new Error("Work Drive upload succeeded but no public HTTPS URL was found in the response.");
  }

  console.log("[qikberry-workdrive] public URL:", url);
  return url;
}

export { shouldUseWorkDriveForInvoicePdf };
