import { phoneLast10 } from "./customerLookup";

const STORAGE_KEY = "zimson_pending_register_phone";

export function setPendingRegisterPhone(phone: string): void {
  const p10 = phoneLast10(phone);
  if (p10.length === 10) sessionStorage.setItem(STORAGE_KEY, p10);
}

export function clearPendingRegisterPhone(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function isPhonePendingRegistration(phone: string): boolean {
  try {
    const pending = sessionStorage.getItem(STORAGE_KEY);
    if (!pending) return false;
    return phoneLast10(phone) === phoneLast10(pending);
  } catch {
    return false;
  }
}
