import { gstStateDisplayName, resolveSellerStateCode } from "./gstSupply";

const STATE_RE =
  /(Tamil Nadu|Karnataka|Kerala|Puducherry|Pondicherry|Andhra Pradesh|Telangana|Maharashtra|Gujarat|Delhi|West Bengal|Rajasthan|Madhya Pradesh|Uttar Pradesh|Haryana|Punjab|Bihar|Odisha|Assam|Goa|Chhattisgarh|Jharkhand|Uttarakhand|Himachal Pradesh)/i;

type RegionLike = {
  id?: string;
  name?: string;
  address?: string;
  addressJson?: { city?: string; district?: string; state?: string } | null;
  stores?: Array<{ id: string }>;
} | null | undefined;

export function parseCityStateFromAddress(text: string): { city: string; state: string } {
  const blob = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!blob) return { city: "", state: "" };
  const m = blob.match(STATE_RE);
  const state = m ? normalizeStateName(m[1]) : "";
  let city = "";
  if (m && typeof m.index === "number") {
    const before = blob.slice(0, m.index).replace(/[,\s]+$/g, "");
    const parts = before
      .split(",")
      .map((s) => s.replace(/\d{6}\b.*$/, "").trim())
      .filter(Boolean);
    city = parts[parts.length - 1] ?? "";
    if (city && /(?:road|rd\.?|street|st\.?|layout|cross|floor|shop)\b/i.test(city) && parts.length > 1) {
      city = parts[parts.length - 2] ?? city;
    }
  }
  return { city: titlePlace(city), state };
}

export function jurisdictionFromRegion(region: RegionLike): { city: string; state: string } {
  const city =
    region?.addressJson?.city?.trim() ||
    region?.addressJson?.district?.trim() ||
    cityFromRegionName(region?.name) ||
    parseCityStateFromAddress(region?.address ?? "").city;
  const state =
    region?.addressJson?.state?.trim() || parseCityStateFromAddress(region?.address ?? "").state;
  return { city: titlePlace(city), state: normalizeStateName(state) };
}

export function mappingJurisdictionFromRegion(region: RegionLike): {
  jurisdictionCity?: string;
  jurisdictionState?: string;
  jurisdictionRegionName?: string;
} {
  const j = jurisdictionFromRegion(region);
  return {
    ...(j.city ? { jurisdictionCity: j.city } : {}),
    ...(j.state ? { jurisdictionState: j.state } : {}),
    ...(region?.name ? { jurisdictionRegionName: region.name } : {}),
  };
}

export function findRegionForInvoice<T extends { id: string; stores?: Array<{ id: string }> }>(
  regions: T[],
  ids: { regionId?: string | null; storeId?: string | null },
): T | undefined {
  const regionId = ids.regionId?.trim();
  if (regionId) {
    const byId = regions.find((r) => r.id === regionId);
    if (byId) return byId;
  }
  const storeId = ids.storeId?.trim();
  if (storeId) {
    const byStore = regions.find((r) => (r.stores ?? []).some((s) => s.id === storeId));
    if (byStore) return byStore;
  }
  return undefined;
}

export function resolveInvoiceJurisdiction(input: {
  city?: string | null;
  state?: string | null;
  addressLines?: string[];
  gstin?: string | null;
  regionName?: string | null;
}): { city: string; state: string } {
  const parsed = parseCityStateFromAddress((input.addressLines ?? []).join(", "));
  const fromName = cityFromRegionName(input.regionName);
  const gstState = gstStateDisplayName(resolveSellerStateCode(input.gstin));
  const city = titlePlace(input.city?.trim() || parsed.city || fromName || "Chennai");
  const state = normalizeStateName(input.state?.trim() || parsed.state || gstState || "Tamil Nadu");
  return { city, state };
}

/** Printed line above Terms and Conditions. */
export function formatInvoiceJurisdictionLine(city: string, state: string): string {
  const place = [city.trim(), state.trim()].filter(Boolean).join(", ");
  return `Subject to company policy, Subject to jurisdiction at ${place || "Chennai, Tamil Nadu"}. E & O.E`;
}

function cityFromRegionName(name?: string | null): string {
  const raw = String(name ?? "").trim();
  if (!raw) return "";
  return raw.replace(/\s*(HO|Head Office|Service Centre|Service Center|Region|Branch)\b.*$/i, "").trim();
}

function normalizeStateName(value: string): string {
  const v = value.trim();
  if (!v) return "";
  if (/pondicherry/i.test(v)) return "Puducherry";
  return v.replace(/\b\w+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function titlePlace(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w+/g, (w) => (w.length <= 3 && w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()));
}
