import type { CustomerRecord } from "../types/customer";

export function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function phoneLast10(phone: string): string {
  const d = normalizePhoneDigits(phone);
  return d.slice(-10);
}

/** Loose name match: same first token, substring, or either contains the other. */
export function nameLooseMatch(inputName: string, recordName: string): boolean {
  const a = inputName.trim().toLowerCase().replace(/\s+/g, " ");
  const b = recordName.trim().toLowerCase().replace(/\s+/g, " ");
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const fa = a.split(" ")[0] ?? "";
  const fb = b.split(" ")[0] ?? "";
  return fa.length > 1 && fb.length > 1 && fa === fb;
}

export type LookupResult =
  | { status: "found"; customer: CustomerRecord }
  | { status: "new" }
  | { status: "phone_exists"; customer: CustomerRecord };

/**
 * Match by last 10 digits of phone + loose name match.
 * If phone exists but name does not match, return phone_exists so UI can offer "use this profile".
 */
export function lookupCustomer(
  customers: CustomerRecord[],
  name: string,
  phone: string,
): LookupResult {
  const tail = phoneLast10(phone);
  if (tail.length !== 10) return { status: "new" };

  const samePhone = customers.filter((c) => phoneLast10(c.phone) === tail);
  if (samePhone.length === 0) return { status: "new" };

  const byName = samePhone.find((c) => nameLooseMatch(name, c.displayName));
  if (byName) return { status: "found", customer: byName };

  return { status: "phone_exists", customer: samePhone[0]! };
}
