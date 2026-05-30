import type { CustomerAddressBlock } from "../types/customer";

/** Read address line 1 (supports legacy doorNo in stored JSON). */
export function addressLine1(b: CustomerAddressBlock): string {
  return String(b.addressLine1 ?? b.doorNo ?? "").trim();
}

/** Read address line 2 (supports legacy street in stored JSON). */
export function addressLine2(b: CustomerAddressBlock): string {
  return String(b.addressLine2 ?? b.street ?? "").trim();
}

export function emptyCustomerAddress(defaultCountryId = "IN"): CustomerAddressBlock {
  return {
    addressLine1: "",
    addressLine2: "",
    city: "",
    district: "",
    state: "",
    countryId: defaultCountryId,
    pincode: "",
  };
}

export function normalizeCustomerAddressFromJson(v: unknown): CustomerAddressBlock | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const line1 = String(o.addressLine1 ?? o.doorNo ?? "").trim();
  const line2 = String(o.addressLine2 ?? o.street ?? "").trim();
  return {
    addressLine1: line1,
    addressLine2: line2,
    city: String(o.city ?? "").trim(),
    district: String(o.district ?? "").trim(),
    state: String(o.state ?? "").trim(),
    countryId: String(o.countryId ?? "").trim(),
    pincode: String(o.pincode ?? "").trim(),
  };
}

export function trimCustomerAddress(b: CustomerAddressBlock): CustomerAddressBlock {
  const line1 = addressLine1(b);
  const line2 = addressLine2(b);
  return {
    addressLine1: line1,
    addressLine2: line2,
    city: String(b.city ?? "").trim(),
    district: String(b.district ?? "").trim(),
    state: String(b.state ?? "").trim(),
    countryId: String(b.countryId ?? "").trim(),
    pincode: String(b.pincode ?? "").trim(),
  };
}

/** Line 1, city, district, state, country, and PIN are required; line 2 is optional. */
export function isCustomerAddressComplete(b: CustomerAddressBlock): boolean {
  const pin = String(b.pincode ?? "").trim();
  if (pin.length < 4 || pin.length > 12) return false;
  return !!(
    addressLine1(b) &&
    String(b.city ?? "").trim() &&
    String(b.district ?? "").trim() &&
    String(b.state ?? "").trim() &&
    String(b.countryId ?? "").trim()
  );
}

/** Payload for API / DB (keeps legacy doorNo/street keys for older readers). */
export function customerAddressToStorageJson(b: CustomerAddressBlock): Record<string, string> {
  const line1 = addressLine1(b);
  const line2 = addressLine2(b);
  return {
    addressLine1: line1,
    addressLine2: line2,
    doorNo: line1,
    street: line2,
    city: String(b.city ?? "").trim(),
    district: String(b.district ?? "").trim(),
    state: String(b.state ?? "").trim(),
    countryId: String(b.countryId ?? "").trim(),
    pincode: String(b.pincode ?? "").trim(),
  };
}

export function formatCustomerAddressLines(b: CustomerAddressBlock | undefined | null): string {
  if (!b) return "";
  return [addressLine1(b), addressLine2(b), b.city, b.district, b.state, b.pincode].filter(Boolean).join(", ");
}

export const MIN_ANNIVERSARY_YEARS_AFTER_DOB = 18;

export function validateCustomerAnniversary(dob: string, anniversary: string): string | null {
  const ann = anniversary.trim();
  if (!ann) return null;
  const birth = dob.trim();
  if (!birth) return "Enter date of birth before anniversary date.";
  const d = new Date(birth);
  const a = new Date(ann);
  if (Number.isNaN(d.getTime()) || Number.isNaN(a.getTime())) return "Invalid date.";
  if (a <= d) return "Anniversary must be after date of birth.";
  const minAnn = new Date(d);
  minAnn.setFullYear(minAnn.getFullYear() + MIN_ANNIVERSARY_YEARS_AFTER_DOB);
  if (a < minAnn) {
    return `Anniversary must be at least ${MIN_ANNIVERSARY_YEARS_AFTER_DOB} years after date of birth.`;
  }
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (a > today) return "Anniversary cannot be in the future.";
  return null;
}
