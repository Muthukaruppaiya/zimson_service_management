import { panFromGstin } from "../data/serviceSeed";
import type { GstLookupResult } from "./gstLookupClient";
import { gstinStateCode, gstStateDisplayName, stateCodeFromName } from "./gstSupply";
import type { SupplierLocation } from "../types/supplier";

export function suggestedSupplierCodeFromGst(gstin: string, existingCodes: Set<string>): string {
  const pan = panFromGstin(gstin);
  const state = gstinStateCode(gstin) ?? "";
  const candidates = [
    pan ? `SUP${pan}` : "",
    pan && state ? `SUP${pan}${state}` : "",
  ].filter(Boolean);
  for (const code of candidates) {
    if (!existingCodes.has(code.toUpperCase())) return code.toUpperCase();
  }
  return candidates[0]?.toUpperCase() || "";
}

export function locationFromGstLookup(out: GstLookupResult, gstin: string): SupplierLocation {
  const pin = String(out.pincode ?? "").replace(/\D/g, "").slice(0, 6);
  const stateRaw = (out.state ?? "").trim();
  const stateFromGstin = gstStateDisplayName(gstinStateCode(gstin));
  let state = stateRaw;
  if (/^\d{2}$/.test(stateRaw)) {
    state = gstStateDisplayName(stateRaw) || stateRaw;
  } else if (stateRaw && stateCodeFromName(stateRaw)) {
    state = gstStateDisplayName(stateCodeFromName(stateRaw)) || stateRaw;
  } else if (!stateRaw) {
    state = stateFromGstin;
  }
  const city = (out.city ?? "").trim();
  const parts = (out.address ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    doorNo: parts[0] ?? "",
    street: parts.slice(1).join(", "),
    place: city,
    district: city,
    state: state || "Tamil Nadu",
    pinCode: pin,
  };
}

export function taxPersonTypeFromGstin(supplierGstin: string, hoGstin?: string | null): "INTRASTATE_TAXABLE_PERSON" | "INTERSTATE_TAXABLE_PERSON" {
  const supplierState = gstinStateCode(supplierGstin);
  const hoState = gstinStateCode(hoGstin ?? "") ?? "33";
  return supplierState && supplierState === hoState ? "INTRASTATE_TAXABLE_PERSON" : "INTERSTATE_TAXABLE_PERSON";
}
