import { getResolvedEdocConfig } from "../edocSettingsStore";
import type { EdocParty, MastersIndiaEdocConfig } from "./types";
import { isValidGstin, SANDBOX_EDOC_TEST_GSTIN } from "./types";
import { defaultPincodeForState, gstinStateCode, stateNameFromCode } from "./gstState";

export type { MastersIndiaEdocConfig } from "./types";
export { isValidGstin, SANDBOX_EDOC_TEST_GSTIN } from "./types";

export function getMastersIndiaEdocConfig(): MastersIndiaEdocConfig | null {
  return getResolvedEdocConfig();
}

export const PRODUCTION_EDOC_API_BASE = "https://router.mastersindia.co";

export function isSandboxEdocApi(cfg: MastersIndiaEdocConfig): boolean {
  return /sandb-api/i.test(cfg.apiBase) || /sandb-api/i.test(cfg.ewayApiBase);
}

export function isProductionEdocApi(cfg: MastersIndiaEdocConfig): boolean {
  return !isSandboxEdocApi(cfg);
}

/**
 * Seller GSTIN for e-invoice (IRP).
 * Sandbox: always MI test GSTIN 09… — IRP credentials on sandb-api are registered for that GSTIN only.
 * Production: store / region → tax settings → override.
 */
export function resolveEdocSellerGstin(
  storeGstin: string | null | undefined,
  taxSettingsGstin: string | null | undefined,
  cfg: MastersIndiaEdocConfig,
): string {
  if (isSandboxEdocApi(cfg)) {
    return SANDBOX_EDOC_TEST_GSTIN;
  }
  const candidates = [
    String(storeGstin ?? "").trim().toUpperCase(),
    String(taxSettingsGstin ?? "").trim().toUpperCase(),
    String(cfg.sellerGstinOverride ?? "").trim().toUpperCase(),
  ];
  for (const g of candidates) {
    if (g && isValidGstin(g)) return g;
  }
  return "";
}

/** Sandbox e-invoice: IRP expects test GSTIN 09… with matching UP pincode/place. */
export function alignSandboxEdocSellerParty(
  party: EdocParty,
  cfg: MastersIndiaEdocConfig,
): EdocParty {
  if (!isSandboxEdocApi(cfg)) return party;
  return {
    ...party,
    gstin: SANDBOX_EDOC_TEST_GSTIN,
    stateCode: "09",
    pincode: 201301,
    location: "Noida",
  };
}

/** Sandbox e-way: use configured / region GSTIN. If missing, use the known sandbox e-way GSTIN. */
export function alignSandboxEdocEwayParties(
  consignor: EdocParty,
  consignee: EdocParty,
  cfg: MastersIndiaEdocConfig,
): { consignor: EdocParty; consignee: EdocParty } {
  if (!isSandboxEdocApi(cfg)) return { consignor, consignee };
  const userGstin = resolveEdocEwayUserGstin(consignor.gstin, cfg);
  // NIC sandbox expects userGstin === gstin_of_consignor for outward e-way.
  const normalizedConsignor: EdocParty = {
    ...consignor,
    gstin: userGstin,
    stateCode: gstinStateCode(userGstin),
    pincode: defaultPincodeForState(gstinStateCode(userGstin)),
    location: stateNameFromCode(gstinStateCode(userGstin)),
  };
  return { consignor: normalizedConsignor, consignee };
}

export function resolveEdocEwayUserGstin(
  consignorGstin: string,
  cfg: MastersIndiaEdocConfig,
): string {
  // Sandbox NIC e-way credentials are mapped to a specific test GSTIN.
  // Force that GSTIN so e-way works even if invoice/seller GSTIN differs.
  if (isSandboxEdocApi(cfg)) return "05AAABC0181E1ZE";
  const configured = String(cfg.ewayUserGstin ?? "").trim().toUpperCase();
  if (configured && isValidGstin(configured)) return configured;
  const fromParty = String(consignorGstin ?? "").trim().toUpperCase();
  if (isValidGstin(fromParty)) return fromParty;
  const sellerOverride = String(cfg.sellerGstinOverride ?? "").trim().toUpperCase();
  if (sellerOverride && isValidGstin(sellerOverride)) return sellerOverride;
  return "05AAABC0181E1ZE";
}
