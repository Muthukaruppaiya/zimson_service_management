import { getResolvedEdocConfig } from "../edocSettingsStore";
import type { MastersIndiaEdocConfig } from "./types";
import { isValidGstin } from "./types";

export type { MastersIndiaEdocConfig } from "./types";
export { isValidGstin } from "./types";

export function getMastersIndiaEdocConfig(): MastersIndiaEdocConfig | null {
  return getResolvedEdocConfig();
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
