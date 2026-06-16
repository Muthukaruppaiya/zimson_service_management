const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function isValidGstin(gstin: string | null | undefined): boolean {
  const g = String(gstin ?? "")
    .trim()
    .toUpperCase();
  return GSTIN_RE.test(g);
}

export type MastersIndiaEdocConfig = {
  enabled: boolean;
  failOpen: boolean;
  username: string;
  password: string;
  apiBase: string;
  ewayApiBase: string;
  tokenUrl: string;
  einvoicePath: string;
  ewayPath: string;
  /** Sandbox / override seller GSTIN for e-invoice when store GSTIN is not registered on portal. */
  sellerGstinOverride: string | null;
  /** GSTIN registered for e-way on Masters India portal. */
  ewayUserGstin: string | null;
  /** Nominal value for repair / transfer e-way (sandbox). */
  ewayNominalValueInr: number;
  /** When false, e-way is not auto-generated on dispatch (manual / later rules). */
  ewayAutoEnabled: boolean;
};

function envBool(name: string, defaultValue: boolean): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  return defaultValue;
}

function trimBase(url: string): string {
  return url.replace(/\/+$/, "");
}

export function getMastersIndiaEdocConfig(): MastersIndiaEdocConfig | null {
  const username =
    process.env.MASTERS_INDIA_EDOC_USERNAME?.trim() ||
    process.env.MASTERS_INDIA_USERNAME?.trim() ||
    "";
  const password =
    process.env.MASTERS_INDIA_EDOC_PASSWORD?.trim() ||
    process.env.MASTERS_INDIA_PASSWORD?.trim() ||
    "";

  if (!username || !password) return null;

  const apiBase = trimBase(
    process.env.MASTERS_INDIA_EDOC_API_BASE?.trim() || "https://sandb-api.mastersindia.co",
  );
  const ewayApiBase = trimBase(
    process.env.MASTERS_INDIA_EDOC_EWAY_API_BASE?.trim() || "https://sandb-api.edoc.mastersindia.co",
  );

  return {
    enabled: envBool("MASTERS_INDIA_EDOC_ENABLED", true),
    failOpen: envBool("MASTERS_INDIA_EDOC_FAIL_OPEN", true),
    username,
    password,
    apiBase,
    ewayApiBase,
    tokenUrl:
      process.env.MASTERS_INDIA_EDOC_TOKEN_URL?.trim() ||
      `${apiBase}/api/v1/token-auth/`,
    einvoicePath:
      process.env.MASTERS_INDIA_EDOC_EINVOICE_PATH?.trim() || "/api/v1/einvoice/",
    ewayPath: process.env.MASTERS_INDIA_EDOC_EWAY_PATH?.trim() || "/api/v1/ewayBillsGenerate/",
    sellerGstinOverride: (() => {
      const g = process.env.MASTERS_INDIA_EDOC_SELLER_GSTIN?.trim().toUpperCase();
      return g && isValidGstin(g) ? g : null;
    })(),
    ewayUserGstin: (() => {
      const g = process.env.MASTERS_INDIA_EDOC_EWAY_GSTIN?.trim().toUpperCase();
      return g && isValidGstin(g) ? g : null;
    })(),
    ewayNominalValueInr: Math.max(
      1,
      Number(process.env.MASTERS_INDIA_EDOC_EWAY_NOMINAL_INR ?? "1000") || 1000,
    ),
    ewayAutoEnabled: envBool("MASTERS_INDIA_EDOC_EWAY_AUTO", false),
  };
}

/** Pick seller GSTIN: store → tax settings → sandbox override. */
export function resolveEdocSellerGstin(
  storeGstin: string | null | undefined,
  taxSettingsGstin: string | null | undefined,
  cfg: MastersIndiaEdocConfig,
): string {
  const candidates = [
    cfg.sellerGstinOverride,
    String(storeGstin ?? "").trim().toUpperCase(),
    String(taxSettingsGstin ?? "").trim().toUpperCase(),
    "09AAAPG7885R002",
  ];
  for (const g of candidates) {
    if (g && isValidGstin(g)) return g;
  }
  return "09AAAPG7885R002";
}

export function resolveEdocEwayUserGstin(
  consignorGstin: string,
  cfg: MastersIndiaEdocConfig,
): string {
  if (cfg.ewayUserGstin) return cfg.ewayUserGstin;
  if (isValidGstin(consignorGstin)) return consignorGstin.toUpperCase();
  return "05AAABC0181E1ZE";
}
