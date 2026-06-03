/**
 * GSTIN → company / trade name lookup.
 *
 * Providers (first match wins):
 * 1) Masters India — MASTERS_INDIA_USERNAME, PASSWORD, CLIENT_ID, CLIENT_SECRET.
 * 2) Sandbox.co.in — GST_LOOKUP_SANDBOX_API_KEY + GST_LOOKUP_SANDBOX_API_SECRET.
 * 3) Custom HTTP — GST_LOOKUP_HTTP_URL with `{gstin}` + GST_LOOKUP_API_KEY (Bearer).
 * 4) Explorium — GST_LOOKUP_EXPLORIUM_API_KEY.
 * 5) Stub — demo names when nothing is configured.
 *
 * @see https://docs.mastersindia.co/gst-verification-api/search-gstin
 * @see https://developer.sandbox.co.in/guides/get-started/quickstart
 */

export type GstLookupNames = {
  tradeName?: string;
  legalName?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
};

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

function stubNames(gstin: string): GstLookupNames {
  const panPart = gstin.slice(2, 12);
  return {
    tradeName: `Registered entity (${panPart})`,
    legalName: `Legal name for GSTIN …${gstin.slice(-4)}`,
  };
}

let sandboxTokenCache: { token: string; expMs: number } | null = null;
let mastersIndiaTokenCache: { token: string; expMs: number } | null = null;

function mastersIndiaTokenUrl(): string {
  return (
    process.env.MASTERS_INDIA_TOKEN_URL?.trim() ||
    "https://commonapi.mastersindia.co/oauth/access_token"
  );
}

function mastersIndiaSearchBase(): string {
  return (
    process.env.MASTERS_INDIA_API_BASE_URL?.trim().replace(/\/+$/, "") ||
    "https://commonapi.mastersindia.co"
  );
}

function mastersIndiaConfigured(): {
  username: string;
  password: string;
  clientId: string;
  clientSecret: string;
} | null {
  const username = process.env.MASTERS_INDIA_USERNAME?.trim();
  const password = process.env.MASTERS_INDIA_PASSWORD?.trim();
  const clientId = process.env.MASTERS_INDIA_CLIENT_ID?.trim();
  const clientSecret = process.env.MASTERS_INDIA_CLIENT_SECRET?.trim();
  if (username && password && clientId && clientSecret) {
    return { username, password, clientId, clientSecret };
  }
  return null;
}

async function getMastersIndiaAccessToken(creds: {
  username: string;
  password: string;
  clientId: string;
  clientSecret: string;
}): Promise<string> {
  const now = Date.now();
  if (mastersIndiaTokenCache && mastersIndiaTokenCache.expMs > now + 120_000) {
    return mastersIndiaTokenCache.token;
  }
  const res = await fetch(mastersIndiaTokenUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      username: creds.username,
      password: creds.password,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      grant_type: "password",
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    message?: string;
  };
  if (!res.ok || !json.access_token) {
    const msg = json.message ?? json.error ?? res.statusText ?? "Masters India token request failed";
    throw new Error(msg);
  }
  const expiresIn = typeof json.expires_in === "number" && json.expires_in > 60 ? json.expires_in : 21_600;
  mastersIndiaTokenCache = {
    token: String(json.access_token),
    expMs: now + expiresIn * 1000,
  };
  return mastersIndiaTokenCache.token;
}

type MastersAddr = {
  bno?: string;
  bnm?: string;
  flno?: string;
  st?: string;
  loc?: string;
  dst?: string;
  city?: string;
  stcd?: string;
  pncd?: string;
};

function formatMastersIndiaAddress(pradr: unknown): Pick<GstLookupNames, "address" | "city" | "state" | "pincode"> {
  if (!pradr || typeof pradr !== "object") return {};
  const addr = (pradr as { addr?: MastersAddr }).addr;
  if (!addr || typeof addr !== "object") return {};
  const parts = [addr.bno, addr.bnm, addr.flno, addr.st, addr.loc]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean);
  const city = (typeof addr.city === "string" && addr.city.trim()) || (typeof addr.dst === "string" ? addr.dst.trim() : "");
  const state = typeof addr.stcd === "string" ? addr.stcd.trim() : "";
  const pincode = typeof addr.pncd === "string" ? addr.pncd.trim() : "";
  return {
    address: parts.length ? parts.join(", ") : undefined,
    city: city || undefined,
    state: state || undefined,
    pincode: pincode || undefined,
  };
}

function extractMastersIndiaNames(json: unknown): GstLookupNames {
  const root = json as {
    error?: boolean | string;
    message?: string;
    data?: {
      lgnm?: string;
      tradeNam?: string;
      pradr?: unknown;
    };
  };
  if (root.error === true || (typeof root.error === "string" && root.error)) {
    throw new Error(typeof root.error === "string" ? root.error : root.message ?? "Masters India GST lookup failed.");
  }
  const d = root.data;
  if (!d || typeof d !== "object") {
    throw new Error(root.message ?? "Masters India GST lookup: no data for this GSTIN.");
  }
  const legalName = typeof d.lgnm === "string" ? d.lgnm.trim() : "";
  const tradeRaw = typeof d.tradeNam === "string" ? d.tradeNam.trim() : "";
  const tradeName = tradeRaw || legalName || undefined;
  return {
    legalName: legalName || undefined,
    tradeName,
    ...formatMastersIndiaAddress(d.pradr),
  };
}

async function lookupViaMastersIndia(
  gstin: string,
  creds: { username: string; password: string; clientId: string; clientSecret: string },
): Promise<GstLookupNames> {
  const base = mastersIndiaSearchBase();
  const token = await getMastersIndiaAccessToken(creds);
  const url = `${base}/commonapis/searchgstin?gstin=${encodeURIComponent(gstin)}`;

  const doSearch = async (accessToken: string) => {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        client_id: creds.clientId,
        Accept: "application/json",
      },
    });
    const json: unknown = await res.json().catch(() => ({}));
    return { res, json };
  };

  let { res, json } = await doSearch(token);
  if (res.status === 401) {
    mastersIndiaTokenCache = null;
    const fresh = await getMastersIndiaAccessToken(creds);
    ({ res, json } = await doSearch(fresh));
  }

  if (!res.ok) {
    const err = json as { message?: string; error?: string };
    throw new Error(err.message ?? err.error ?? `Masters India GST search failed (${res.status}).`);
  }

  return extractMastersIndiaNames(json);
}

function sandboxBaseUrl(): string {
  const override = process.env.GST_LOOKUP_SANDBOX_BASE_URL?.trim();
  if (override) return override.replace(/\/+$/, "");
  return process.env.GST_LOOKUP_SANDBOX_TEST === "true"
    ? "https://test-api.sandbox.co.in"
    : "https://api.sandbox.co.in";
}

async function sandboxAuthenticate(apiKey: string, apiSecret: string): Promise<string> {
  const base = sandboxBaseUrl();
  const res = await fetch(`${base}/authenticate`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "x-api-secret": apiSecret,
      "x-api-version": "1.0.0",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  const json = (await res.json()) as {
    code?: number;
    data?: { access_token?: string };
    message?: string;
  };
  if (!res.ok || json.code !== 200 || !json.data?.access_token) {
    const msg = json.message ?? res.statusText ?? "Sandbox authenticate failed";
    throw new Error(msg);
  }
  return String(json.data.access_token);
}

async function getSandboxAccessToken(apiKey: string, apiSecret: string): Promise<string> {
  const now = Date.now();
  if (sandboxTokenCache && sandboxTokenCache.expMs > now + 120_000) {
    return sandboxTokenCache.token;
  }
  const token = await sandboxAuthenticate(apiKey, apiSecret);
  sandboxTokenCache = { token, expMs: now + 23 * 60 * 60 * 1000 };
  return token;
}

function extractSandboxNames(json: unknown): GstLookupNames {
  const root = json as {
    code?: number;
    data?: { data?: { lgnm?: string; tradeNam?: string }; error?: { message?: string } };
    message?: string;
  };
  if (root.code !== 200) {
    const msg =
      root.data?.error?.message ?? root.message ?? (root.code != null ? `GST lookup code ${root.code}` : "GST lookup failed");
    throw new Error(msg);
  }
  const d = root.data?.data;
  if (!d || typeof d !== "object") {
    throw new Error("Unexpected Sandbox GST response shape.");
  }
  const legalName = typeof d.lgnm === "string" ? d.lgnm.trim() : "";
  const tradeRaw = typeof d.tradeNam === "string" ? d.tradeNam.trim() : "";
  const tradeName = tradeRaw || legalName || undefined;
  return {
    legalName: legalName || undefined,
    tradeName,
  };
}

async function lookupViaSandbox(gstin: string, apiKey: string, apiSecret: string): Promise<GstLookupNames> {
  const base = sandboxBaseUrl();
  const token = await getSandboxAccessToken(apiKey, apiSecret);

  const doSearch = async (authToken: string) => {
    const res = await fetch(`${base}/gst/compliance/public/gstin/search`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        authorization: authToken,
        "x-api-version": "1.0",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ gstin }),
    });
    const json: unknown = await res.json().catch(() => ({}));
    return { res, json };
  };

  let { res, json } = await doSearch(token);
  if (res.status === 401) {
    sandboxTokenCache = null;
    const fresh = await getSandboxAccessToken(apiKey, apiSecret);
    ({ res, json } = await doSearch(fresh));
  }

  if (!res.ok) {
    const err = json as { message?: string };
    throw new Error(err.message ?? `Sandbox GST search failed (${res.status}).`);
  }

  return extractSandboxNames(json);
}

function mapGenericBody(json: unknown): GstLookupNames {
  if (json && typeof json === "object") {
    const o = json as Record<string, unknown>;
    if (typeof o.tradeName === "string" || typeof o.legalName === "string") {
      return {
        tradeName: typeof o.tradeName === "string" ? o.tradeName.trim() || undefined : undefined,
        legalName: typeof o.legalName === "string" ? o.legalName.trim() || undefined : undefined,
      };
    }
    const lgnm = o.lgnm;
    const tradeNam = o.tradeNam;
    if (typeof lgnm === "string" || typeof tradeNam === "string") {
      const legalName = typeof lgnm === "string" ? lgnm.trim() : "";
      const tr = typeof tradeNam === "string" ? tradeNam.trim() : "";
      return { legalName: legalName || undefined, tradeName: (tr || legalName) || undefined };
    }
    const nested = o.data;
    if (nested && typeof nested === "object") {
      return mapGenericBody(nested);
    }
  }
  throw new Error("GST HTTP lookup: expected JSON with tradeName/legalName or lgnm/tradeNam.");
}

async function lookupViaHttpUrl(gstin: string, urlTemplate: string, apiKey: string): Promise<GstLookupNames> {
  const url = urlTemplate.replaceAll("{gstin}", encodeURIComponent(gstin));
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });
  const json: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json as { error?: string; message?: string })?.message ?? (json as { error?: string })?.error;
    throw new Error(msg ?? `GST HTTP lookup failed (${res.status}).`);
  }
  return mapGenericBody(json);
}

function exploriumBaseUrl(): string {
  return process.env.GST_LOOKUP_EXPLORIUM_BASE_URL?.trim().replace(/\/+$/, "") || "https://api.explorium.ai";
}

function exploriumHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    "content-type": "application/json",
    api_key: apiKey,
  };
}

/** Match Businesses → Firmographics; GSTIN is sent as the match "name" (Explorium has no GSTIN registry field). */
async function lookupViaExplorium(gstin: string, apiKey: string): Promise<GstLookupNames> {
  const base = exploriumBaseUrl();

  const matchRes = await fetch(`${base}/v1/businesses/match`, {
    method: "POST",
    headers: exploriumHeaders(apiKey),
    body: JSON.stringify({
      businesses_to_match: [{ name: gstin }],
    }),
  });
  const matchJson: unknown = await matchRes.json().catch(() => ({}));
  if (!matchRes.ok) {
    const err = matchJson as { detail?: { msg?: string }[]; message?: string };
    const detail =
      Array.isArray(err.detail) && err.detail[0] && typeof err.detail[0].msg === "string" ? err.detail[0].msg : null;
    throw new Error(
      err.message ?? detail ?? `Explorium match failed (${matchRes.status}). Check GST_LOOKUP_EXPLORIUM_API_KEY.`,
    );
  }

  type MatchRow = { business_id?: string | null; error?: string; error_type?: string };
  const mb = (matchJson as { matched_businesses?: MatchRow[] })?.matched_businesses;
  const first = Array.isArray(mb) && mb.length > 0 ? mb[0] : null;
  if (first?.error) {
    throw new Error(first.error);
  }
  const bid =
    first && typeof first.business_id === "string" && /^[a-f0-9]{32}$/i.test(first.business_id)
      ? first.business_id.toLowerCase()
      : null;

  if (!bid) {
    throw new Error(
      "Explorium found no business for this GSTIN string. Explorium matches by company name/domain, not the Indian GST portal. For official GSTIN names set GST_LOOKUP_SANDBOX_API_KEY + GST_LOOKUP_SANDBOX_API_SECRET, or point GST_LOOKUP_HTTP_URL to a service that resolves GSTIN.",
    );
  }

  const firmRes = await fetch(`${base}/v1/businesses/firmographics/enrich`, {
    method: "POST",
    headers: exploriumHeaders(apiKey),
    body: JSON.stringify({ business_id: bid }),
  });
  const firmJson: unknown = await firmRes.json().catch(() => ({}));
  if (!firmRes.ok) {
    const err = firmJson as { detail?: { msg?: string }[]; message?: string };
    const detail =
      Array.isArray(err.detail) && err.detail[0] && typeof err.detail[0].msg === "string" ? err.detail[0].msg : null;
    throw new Error(err.message ?? detail ?? `Explorium firmographics failed (${firmRes.status}).`);
  }

  const data = (firmJson as { data?: { name?: string } | Array<{ name?: string }> })?.data;
  const row = Array.isArray(data) ? data[0] : data;
  const name =
    row && typeof row === "object" && typeof (row as { name?: string }).name === "string"
      ? (row as { name: string }).name.trim()
      : "";
  if (!name) {
    throw new Error("Explorium firmographics response had no company name.");
  }
  return { legalName: name, tradeName: name };
}

export async function lookupGstCompany(gstinRaw: string): Promise<GstLookupNames> {
  const gstin = gstinRaw.trim().toUpperCase();
  if (!GSTIN_RE.test(gstin)) {
    throw new Error("INVALID_GSTIN");
  }

  const mastersCreds = mastersIndiaConfigured();
  if (mastersCreds) {
    return lookupViaMastersIndia(gstin, mastersCreds);
  }

  const sbKey = process.env.GST_LOOKUP_SANDBOX_API_KEY?.trim();
  const sbSecret = process.env.GST_LOOKUP_SANDBOX_API_SECRET?.trim();
  if (sbKey && sbSecret) {
    return lookupViaSandbox(gstin, sbKey, sbSecret);
  }

  const httpUrl = process.env.GST_LOOKUP_HTTP_URL?.trim();
  const httpKey = process.env.GST_LOOKUP_API_KEY?.trim();
  if (httpUrl && httpUrl.includes("{gstin}") && httpKey) {
    return lookupViaHttpUrl(gstin, httpUrl, httpKey);
  }

  const exploriumKey = process.env.GST_LOOKUP_EXPLORIUM_API_KEY?.trim();
  if (exploriumKey) {
    return lookupViaExplorium(gstin, exploriumKey);
  }

  return stubNames(gstin);
}
