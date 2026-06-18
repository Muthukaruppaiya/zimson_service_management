/** 64-char hex IRN returned by IRP. */
const IRN_RE = /^[0-9a-f]{64}$/i;

function decodeJwtPayloadPart(part: string): Record<string, unknown> | null {
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = atob(padded);
    const parsed = JSON.parse(json) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Pull IRN from SignedQRCode JWT or plain IRN string. */
export function irnFromSignedQrPayload(signedPayload: string | null | undefined): string | null {
  const raw = String(signedPayload ?? "").trim();
  if (!raw) return null;
  if (IRN_RE.test(raw)) return raw.toUpperCase();

  const parts = raw.split(".");
  if (parts.length >= 2) {
    for (const segment of parts.slice(0, 2)) {
      const payload = decodeJwtPayloadPart(segment);
      if (!payload) continue;
      for (const key of ["Irn", "irn", "IRN"]) {
        const v = payload[key];
        if (typeof v === "string" && IRN_RE.test(v.trim())) return v.trim().toUpperCase();
      }
      const data = payload.data;
      if (data && typeof data === "object") {
        const d = data as Record<string, unknown>;
        for (const key of ["Irn", "irn"]) {
          const v = d[key];
          if (typeof v === "string" && IRN_RE.test(v.trim())) return v.trim().toUpperCase();
        }
      }
    }
  }

  const irnMatch = raw.match(/\b([0-9a-f]{64})\b/i);
  return irnMatch?.[1]?.toUpperCase() ?? null;
}

/**
 * QR text: IRN only so generic scanners show the invoice reference number.
 * Falls back to signed payload when IRN cannot be resolved.
 */
export function einvoiceQrEncodeText(
  signedPayload: string | null | undefined,
  irnHint?: string | null,
): string | null {
  const fromHint = String(irnHint ?? "").trim();
  if (IRN_RE.test(fromHint)) return fromHint.toUpperCase();

  const fromSigned = irnFromSignedQrPayload(signedPayload);
  if (fromSigned) return fromSigned;

  const raw = String(signedPayload ?? "").trim();
  return raw || null;
}

export const EINVOICE_QR_RENDER_SIZE = 180;

export const EINVOICE_QR_OPTIONS = {
  width: EINVOICE_QR_RENDER_SIZE,
  margin: 2,
  errorCorrectionLevel: "H" as const,
};
