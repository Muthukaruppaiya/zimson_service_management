import { clearEdocTokenCache, getEdocAccessToken } from "./auth";
import { buildEwayPayload, nominalEwayTotals } from "./buildPayload";
import type { MastersIndiaEdocConfig } from "./config";
import {
  isSandboxEdocApi,
  resolveEdocEwayUserGstin,
  resolveEdocSellerGstin,
  SANDBOX_EDOC_TEST_GSTIN,
} from "./config";
import { defaultPincodeForState, formatDocumentDate, gstinStateCode } from "./gstState";
import type { EdocParty, EdocResult } from "./types";

const EINVOICE_RETRY_ATTEMPTS = 5;
const EINVOICE_RETRY_DELAY_MS = 15_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isTransientEinvoiceError(message: string | null | undefined): boolean {
  const m = String(message ?? "").toLowerCase();
  return (
    /504|gateway time-out|expecting value:\s*line 1 column 1/i.test(m) ||
    /empty response|sandbox irp is not responding/i.test(m)
  );
}

function isTransientEdocError(message: string): boolean {
  return isTransientEinvoiceError(message);
}

/** Single user-facing e-invoice error (no duplicated hints). */
export function formatEinvoiceUserError(raw: string, cfg: MastersIndiaEdocConfig): string {
  const m = raw.trim();
  if (!m) return "E-invoice request failed.";
  const sandbox = isSandboxEdocApi(cfg);
  const testGstin = SANDBOX_EDOC_TEST_GSTIN;

  if (/504|gateway time-out/i.test(m)) {
    return sandbox
      ? `Masters India sandbox timed out (504). E-invoice uses test GSTIN ${testGstin} — retried automatically; use Retry e-invoice if this persists.`
      : "Masters India API timed out (504). Retry in a few minutes.";
  }
  if (/gstin does not exist|not mapped with logged-in user/i.test(m)) {
    return `GSTIN is not linked to Masters India login ${cfg.username}. Open https://edoc.mastersindia.co → add business GSTIN 33AAACZ0566D1ZN → register IRP username/password → set API URL to https://router.mastersindia.co in Settings → E-invoice & e-way.`;
  }
  if (/expecting value:\s*line 1 column 1/i.test(m)) {
    return sandbox
      ? `Masters India sandbox IRP is not responding (NIC empty reply). E-invoice uses test GSTIN ${testGstin}. The app will auto-retry every 90 seconds — or use Retry e-invoice.`
      : "Masters India IRP returned an empty response. Retry shortly.";
  }
  if (/500:.*einvoice username or password is missing/i.test(m)) {
    return sandbox
      ? `IRP credentials are not set for the GSTIN sent. Sandbox e-invoice always uses ${testGstin} (not your region GSTIN).`
      : "IRP username/password not registered for seller GSTIN on Masters India portal (E-invoice login section).";
  }
  return m;
}

function finalizeEinvoiceResult(cfg: MastersIndiaEdocConfig, result: EdocResult): EdocResult {
  if (result.ok) return result;
  if (!result.error) return result;
  const pending = isTransientEinvoiceError(result.error);
  return {
    ...result,
    pending,
    error: formatEinvoiceUserError(result.error, cfg),
  };
}

/** Sync GSTIN master from GST common portal before IRN generate (Masters India recommendation). */
export async function syncGstinFromCp(cfg: MastersIndiaEdocConfig, gstin: string): Promise<void> {
  const g = String(gstin ?? "").trim().toUpperCase();
  if (!g) return;
  try {
    const token = await getEdocAccessToken(cfg);
    const base = cfg.apiBase.replace(/\/+$/, "");
    const q = new URLSearchParams({ user_gstin: g, gstin: g });
    const res = await fetch(`${base}/api/v1/sync-gstin/?${q}`, {
      headers: { Accept: "application/json", Authorization: `JWT ${token}` },
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn("[edoc] sync-gstin HTTP", res.status, text.slice(0, 200));
    }
  } catch (e) {
    console.warn("[edoc] sync-gstin failed:", e instanceof Error ? e.message : e);
  }
}

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
    const text = await res.text();
    let json: unknown = {};
    if (text.trim()) {
      try {
        json = JSON.parse(text) as unknown;
      } catch {
        const isTimeout = res.status === 504 || /<title>504/i.test(text);
        const hint = isTimeout
          ? `Masters India API timeout (${res.status})`
          : text.trim().slice(0, 300) || `e-doc API returned non-JSON (${res.status})`;
        console.warn("[edoc] Non-JSON response:", res.status, text.slice(0, 400));
        throw new Error(hint);
      }
    }
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
    console.warn("[edoc/eway] HTTP", res.status, JSON.stringify(json).slice(0, 1200));
    throw new Error(err);
  }
  return json;
}

function ewayNicCredentialHint(message: string): string {
  const m = message.toLowerCase();
  if (/expecting value:\s*line 1 column 1/i.test(m)) {
    return " Register NIC e-way API credentials for this GSTIN on the Masters India portal (E-way section — separate from e-invoice IRP login).";
  }
  if (/username and\/or password may be blank|not set|valid credentials/i.test(m)) {
    return " Add NIC e-way API username/password for this GSTIN on the Masters India portal (E-way section).";
  }
  return "";
}

function extractErrorMessage(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  if (typeof o.errorMessage === "string" && o.errorMessage.trim()) return o.errorMessage.trim();
  if (typeof o.message === "string" && o.message.trim()) return o.message.trim();
  if (typeof o.error === "string" && o.error.trim()) return o.error.trim();
  const results = o.results;
  if (results && typeof results === "object") {
    const r = results as Record<string, unknown>;
    const msg = r.message;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
    if (msg && typeof msg === "object") {
      const m = msg as Record<string, unknown>;
      if (typeof m.error === "string") return m.error;
      if (Array.isArray(m.errors)) return m.errors.map(String).join("; ");
    }
  }
  return null;
}

async function postEdocEinvoice(
  cfg: MastersIndiaEdocConfig,
  payload: Record<string, unknown>,
): Promise<unknown> {
  let lastErr = "E-invoice request failed";
  for (let attempt = 1; attempt <= EINVOICE_RETRY_ATTEMPTS; attempt++) {
    try {
      return await postEdoc(cfg, cfg.apiBase, cfg.einvoicePath, payload);
    } catch (e) {
      lastErr = e instanceof Error ? e.message : lastErr;
      if (!isTransientEdocError(lastErr) || attempt === EINVOICE_RETRY_ATTEMPTS) throw e;
      console.warn(`[edoc/einvoice] transient error (attempt ${attempt}/${EINVOICE_RETRY_ATTEMPTS}), retrying…`);
      await sleep(EINVOICE_RETRY_DELAY_MS);
    }
  }
  throw new Error(lastErr);
}

async function fetchIrnByDocument(
  cfg: MastersIndiaEdocConfig,
  userGstin: string,
  documentNumber: string,
  documentDate: string,
): Promise<EdocResult | null> {
  if (!userGstin || !documentNumber || !documentDate) return null;
  for (let attempt = 1; attempt <= EINVOICE_RETRY_ATTEMPTS; attempt++) {
    try {
      const token = await getEdocAccessToken(cfg);
      const base = cfg.apiBase.replace(/\/+$/, "");
      const q = new URLSearchParams({
        user_gstin: userGstin,
        document_type: "INV",
        document_number: documentNumber,
        document_date: documentDate,
      });
      const res = await fetch(`${base}/api/v1/get-einvoice-bydoc/?${q}`, {
        headers: { Accept: "application/json", Authorization: `JWT ${token}` },
      });
      const text = await res.text();
      if (!text.trim()) {
        if (attempt < EINVOICE_RETRY_ATTEMPTS) {
          await sleep(EINVOICE_RETRY_DELAY_MS);
          continue;
        }
        return null;
      }
      if (res.status === 504 || /<title>504/i.test(text)) {
        if (attempt < EINVOICE_RETRY_ATTEMPTS) {
          await sleep(EINVOICE_RETRY_DELAY_MS);
          continue;
        }
        return null;
      }
      let json: unknown;
      try {
        json = JSON.parse(text) as unknown;
      } catch {
        if (attempt < EINVOICE_RETRY_ATTEMPTS && isTransientEdocError(text)) {
          await sleep(EINVOICE_RETRY_DELAY_MS);
          continue;
        }
        return null;
      }
      const parsed = parseEinvoiceResponse(json);
      return parsed.ok && parsed.irn ? parsed : null;
    } catch {
      if (attempt < EINVOICE_RETRY_ATTEMPTS) {
        await sleep(EINVOICE_RETRY_DELAY_MS);
        continue;
      }
      return null;
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
      nic_code?: string;
      message?:
        | string
        | {
            ewayBillNo?: number | string;
            ewayBillDate?: string;
            validUpto?: string;
            url?: string;
            error?: boolean | string;
          };
    };
  };

  const results = root.results;
  const rawMsg = results?.message;
  if (typeof rawMsg === "string" && rawMsg.trim()) {
    const msg = rawMsg.trim();
    return {
      ok: false,
      error: msg + ewayNicCredentialHint(msg),
      rawStatus: results?.status ?? null,
      requestId: results?.requestId ?? null,
    };
  }

  const msg = rawMsg && typeof rawMsg === "object" ? rawMsg : null;
  if (!msg) {
    return { ok: false, error: "Unexpected e-way response", rawStatus: results?.status ?? null };
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
  const userGstin = String(payload.user_gstin ?? "");
  const doc = payload.document_details as { document_number?: string; document_date?: string } | undefined;
  const docNo = String(doc?.document_number ?? "").trim();
  const docDate = String(doc?.document_date ?? "").trim();

  const tryRecover = () => fetchIrnByDocument(cfg, userGstin, docNo, docDate);

  try {
    await syncGstinFromCp(cfg, userGstin);

    const existing = await tryRecover();
    if (existing) return existing;

    const json = await postEdocEinvoice(cfg, payload);
    const result = parseEinvoiceResponse(json);
    if (result.ok || result.irn) return result;

    console.warn("[edoc/einvoice] IRP response:", JSON.stringify(json).slice(0, 2400));

    const recovered = await tryRecover();
    if (recovered) return recovered;
    return finalizeEinvoiceResult(cfg, result);
  } catch (e) {
    const recovered = await tryRecover();
    if (recovered) return recovered;
    const msg = e instanceof Error ? e.message : "E-invoice request failed";
    return finalizeEinvoiceResult(cfg, { ok: false, error: msg });
  }
}

export async function generateEwayBill(
  cfg: MastersIndiaEdocConfig,
  payload: Record<string, unknown>,
): Promise<EdocResult> {
  try {
    const ewayCfg: MastersIndiaEdocConfig = {
      ...cfg,
      username: cfg.ewayUsername || cfg.username,
      password: cfg.ewayPassword || cfg.password,
    };
    const json = await postEdoc(ewayCfg, cfg.ewayApiBase, cfg.ewayPath, payload);
    return parseEwayResponse(json);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "E-way request failed";
    const hint =
      /fetch failed|ENOTFOUND|ECONNREFUSED/i.test(msg)
        ? " Check Settings → E-invoice & e-way: E-way API base must be https://sandb-api.mastersindia.co (not sandb-api.edoc.mastersindia.co)."
        : "";
    return { ok: false, error: `${msg}${hint}` };
  }
}

export async function testEwayConnection(cfg: MastersIndiaEdocConfig): Promise<{ ok: boolean; error?: string }> {
  const userGstin = resolveEdocEwayUserGstin("", cfg);
  const stateCode = gstinStateCode(userGstin);
  const pincode = defaultPincodeForState(stateCode);
  const consignor: EdocParty = {
    gstin: userGstin,
    legalName: "Zimson Test Consignor",
    address1: "Address line 1",
    pincode,
    stateCode,
    location: "Chennai",
  };
  const consignee: EdocParty = {
    gstin: userGstin,
    legalName: "Zimson Test Consignee",
    address1: "Address line 1",
    pincode: stateCode === "33" ? 641018 : pincode,
    stateCode,
    location: stateCode === "33" ? "Coimbatore" : "Chennai",
  };
  const docNo = `EWTEST${Date.now().toString().slice(-8)}`;
  const payload = buildEwayPayload({
    userGstin,
    documentNumber: docNo,
    documentDate: new Date(),
    documentType: "Delivery Challan",
    consignor,
    consignee,
    ...nominalEwayTotals(1000, false),
    itemDescription: "E-way connectivity test",
    hsnSac: "9113",
    qty: 1,
    transportationDistanceKm: "10",
    vehicleNumber: "KA01AB1234",
    transportationMode: "Road",
    subSupplyDescription: "API test",
  });
  const result = await generateEwayBill(cfg, payload);
  if (result.ok) return { ok: true };
  return { ok: false, error: result.error ?? "E-way test failed" };
}

export async function testEdocConnection(cfg: MastersIndiaEdocConfig): Promise<{ ok: boolean; error?: string }> {
  try {
    await getEdocAccessToken(cfg);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Token failed" };
  }
}

/** Ping sandbox/production IRP via get-einvoice-bydoc (no bill created). */
export async function testEinvoiceConnection(cfg: MastersIndiaEdocConfig): Promise<{ ok: boolean; error?: string }> {
  const sellerGstin = resolveEdocSellerGstin("", "", cfg);
  if (!sellerGstin) {
    return { ok: false, error: "Seller GSTIN not resolved for e-invoice." };
  }
  try {
    const token = await getEdocAccessToken(cfg);
    const base = cfg.apiBase.replace(/\/+$/, "");
    const q = new URLSearchParams({
      user_gstin: sellerGstin,
      document_type: "INV",
      document_number: "IRPHEALTHCHECK",
      document_date: formatDocumentDate(new Date()),
    });
    const res = await fetch(`${base}/api/v1/get-einvoice-bydoc/?${q}`, {
      headers: { Accept: "application/json", Authorization: `JWT ${token}` },
    });
    const text = await res.text();
    if (res.status === 504 || /<title>504/i.test(text)) {
      return {
        ok: false,
        error: formatEinvoiceUserError(`Masters India API timeout (${res.status})`, cfg),
      };
    }
    if (!text.trim()) {
      return { ok: false, error: formatEinvoiceUserError("Expecting value: line 1 column 1 (char 0)", cfg) };
    }
    try {
      JSON.parse(text);
    } catch {
      return { ok: false, error: formatEinvoiceUserError(text.slice(0, 200), cfg) };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "E-invoice IRP check failed";
    return { ok: false, error: formatEinvoiceUserError(msg, cfg) };
  }
}
