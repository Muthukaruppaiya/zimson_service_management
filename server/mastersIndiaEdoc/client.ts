import { clearEdocTokenCache, getEdocAccessToken } from "./auth";
import type { MastersIndiaEdocConfig } from "./config";
import type { EdocResult } from "./types";

async function postEdoc(
  cfg: MastersIndiaEdocConfig,
  baseUrl: string,
  path: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const url = `${baseUrl.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  const token = await getEdocAccessToken(cfg);

  const doPost = async (jwt: string) => {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `JWT ${jwt}`,
      },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    return { res, json };
  };

  let { res, json } = await doPost(token);
  if (res.status === 401) {
    clearEdocTokenCache();
    const fresh = await getEdocAccessToken(cfg);
    ({ res, json } = await doPost(fresh));
  }

  if (!res.ok) {
    const err = extractErrorMessage(json) ?? res.statusText ?? `e-doc API failed (${res.status})`;
    throw new Error(err);
  }
  return json;
}

function extractErrorMessage(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  if (typeof o.errorMessage === "string" && o.errorMessage.trim()) return o.errorMessage.trim();
  if (typeof o.message === "string" && o.message.trim()) return o.message.trim();
  const results = o.results;
  if (results && typeof results === "object") {
    const r = results as Record<string, unknown>;
    const msg = r.message;
    if (msg && typeof msg === "object") {
      const m = msg as Record<string, unknown>;
      if (typeof m.error === "string") return m.error;
      if (Array.isArray(m.errors)) return m.errors.map(String).join("; ");
    }
  }
  return null;
}

function parseEinvoiceResponse(json: unknown): EdocResult {
  const root = json as {
    results?: {
      status?: string;
      code?: number;
      requestId?: string;
      errorMessage?: string;
      InfoDtls?: string;
      message?:
        | string
        | {
            Irn?: string;
            AckNo?: number | string;
            AckDt?: string;
            SignedQRCode?: string;
            EinvoicePdf?: string;
            SignedInvoice?: string;
            error?: boolean | string;
            Status?: string;
          };
    };
    errorMessage?: string;
  };

  const results = root.results;
  const resultsError =
    typeof results?.errorMessage === "string" ? results.errorMessage.trim() : "";
  const rootError = typeof root.errorMessage === "string" ? root.errorMessage.trim() : "";
  const combinedError = resultsError || rootError;

  if (!results) {
    return {
      ok: false,
      error: combinedError || "Unexpected e-invoice response (no results object)",
    };
  }

  const rawMsg = results.message;
  const failedStatus = String(results.status ?? "").toLowerCase() === "failed";

  // Masters India error responses use message: "" and errorMessage: "2150: …"
  if (typeof rawMsg === "string") {
    const dupIrn = tryParseDuplicateIrnFromInfo(results.InfoDtls, combinedError || rawMsg);
    if (dupIrn) return dupIrn;
    return {
      ok: false,
      error: combinedError || rawMsg.trim() || "E-invoice rejected by IRP",
      rawStatus: results.status ?? null,
      requestId: results.requestId ?? null,
    };
  }

  if (!rawMsg || typeof rawMsg !== "object") {
    const dupIrn = tryParseDuplicateIrnFromInfo(results.InfoDtls, combinedError);
    if (dupIrn) return dupIrn;
    return {
      ok: false,
      error: combinedError || "Unexpected e-invoice response",
      rawStatus: results.status ?? null,
      requestId: results.requestId ?? null,
    };
  }

  const msg = rawMsg;
  if (msg.error === true || (typeof msg.error === "string" && msg.error)) {
    return {
      ok: false,
      error: typeof msg.error === "string" ? msg.error : combinedError || "E-invoice rejected",
      rawStatus: results.status ?? null,
      requestId: results.requestId ?? null,
    };
  }

  const irn = typeof msg.Irn === "string" ? msg.Irn : null;
  if (!irn) {
    if (failedStatus || combinedError) {
      const dupIrn = tryParseDuplicateIrnFromInfo(results.InfoDtls, combinedError);
      if (dupIrn) return dupIrn;
      return {
        ok: false,
        error: combinedError || "E-invoice response had no IRN",
        rawStatus: results.status ?? null,
        requestId: results.requestId ?? null,
      };
    }
    return {
      ok: false,
      error: combinedError || "E-invoice response had no IRN",
      rawStatus: results.status ?? null,
      requestId: results.requestId ?? null,
    };
  }

  return {
    ok: true,
    irn,
    ackNo: msg.AckNo != null ? String(msg.AckNo) : null,
    ackDate: msg.AckDt ?? null,
    qrUrl: typeof msg.SignedQRCode === "string" ? msg.SignedQRCode : null,
    pdfUrl: typeof msg.EinvoicePdf === "string" ? msg.EinvoicePdf : null,
    requestId: results.requestId ?? null,
    rawStatus: msg.Status ?? results.status ?? null,
  };
}

/** IRP duplicate invoice — InfoDtls may contain the existing IRN (treat as success for re-print). */
function tryParseDuplicateIrnFromInfo(infoDtls: string | undefined, errorHint: string): EdocResult | null {
  const hint = errorHint.toLowerCase();
  if (!hint.includes("dupl") && !hint.includes("2150")) return null;
  const raw = String(infoDtls ?? "").trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const desc = (row as { Desc?: { Irn?: string; AckNo?: string | number; AckDt?: string } }).Desc;
      const irn = desc?.Irn?.trim();
      if (irn) {
        return {
          ok: true,
          irn,
          ackNo: desc.AckNo != null ? String(desc.AckNo) : null,
          ackDate: desc.AckDt ?? null,
          rawStatus: "DUPLICATE_IRN",
          skipReason: "IRN already registered for this invoice (duplicate).",
        };
      }
    }
  } catch {
    /* ignore malformed InfoDtls */
  }
  return null;
}

function parseEwayResponse(json: unknown): EdocResult {
  const root = json as {
    results?: {
      status?: string;
      code?: number;
      requestId?: string;
      message?: {
        ewayBillNo?: number | string;
        ewayBillDate?: string;
        validUpto?: string;
        url?: string;
        error?: boolean | string;
      };
    };
  };

  const msg = root.results?.message;
  if (!msg) {
    return { ok: false, error: "Unexpected e-way response", rawStatus: root.results?.status ?? null };
  }
  if (msg.error === true || (typeof msg.error === "string" && msg.error)) {
    return {
      ok: false,
      error: typeof msg.error === "string" ? msg.error : "E-way rejected",
      rawStatus: root.results?.status ?? null,
    };
  }

  const ewayBillNo = msg.ewayBillNo != null ? String(msg.ewayBillNo) : null;
  if (!ewayBillNo) {
    return { ok: false, error: "E-way response had no bill number", rawStatus: root.results?.status ?? null };
  }

  return {
    ok: true,
    ewayBillNo,
    ewayValidUpto: msg.validUpto ?? null,
    ackDate: msg.ewayBillDate ?? null,
    pdfUrl: msg.url ?? null,
    requestId: root.results?.requestId ?? null,
    rawStatus: root.results?.status ?? null,
  };
}

export async function generateEinvoice(
  cfg: MastersIndiaEdocConfig,
  payload: Record<string, unknown>,
): Promise<EdocResult> {
  try {
    const json = await postEdoc(cfg, cfg.apiBase, cfg.einvoicePath, payload);
    const result = parseEinvoiceResponse(json);
    if (!result.ok && !result.irn) {
      console.warn(
        "[edoc/einvoice] IRP response:",
        JSON.stringify(json).slice(0, 2400),
      );
    }
    return result;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "E-invoice request failed" };
  }
}

export async function generateEwayBill(
  cfg: MastersIndiaEdocConfig,
  payload: Record<string, unknown>,
): Promise<EdocResult> {
  try {
    const json = await postEdoc(cfg, cfg.ewayApiBase, cfg.ewayPath, payload);
    return parseEwayResponse(json);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "E-way request failed" };
  }
}

export async function testEdocConnection(cfg: MastersIndiaEdocConfig): Promise<{ ok: boolean; error?: string }> {
  try {
    await getEdocAccessToken(cfg);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Token failed" };
  }
}
