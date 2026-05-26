/**
 * Input sanitizers for creation / registration forms.
 * Blocks special characters except @ (and . _ - +) on email fields.
 */

/** Names, addresses, remarks: letters, digits, spaces only. */
export function sanitizeTextInput(value: string, maxLen?: number): string {
  const s = value.replace(/[^a-zA-Z0-9\s]/g, "");
  return maxLen != null ? s.slice(0, maxLen) : s;
}

/** Textarea: same as text but allows line breaks. */
export function sanitizeMultilineTextInput(value: string, maxLen?: number): string {
  const s = value.replace(/[^a-zA-Z0-9\s\n]/g, "");
  return maxLen != null ? s.slice(0, maxLen) : s;
}

/** Codes (employee no, SKU): letters and digits only. */
export function sanitizeAlphanumericInput(value: string, maxLen?: number): string {
  const s = value.replace(/[^a-zA-Z0-9]/g, "");
  return maxLen != null ? s.slice(0, maxLen) : s;
}

/** Email: allow @ and common email characters. */
export function sanitizeEmailInput(value: string, maxLen = 200): string {
  return value.replace(/[^a-zA-Z0-9@._+\-]/g, "").slice(0, maxLen);
}

export function isValidEmail(value: string): boolean {
  const s = value.trim();
  if (!s || s.length > 240) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/** Login username: employee ID (letters/digits) or email (@ . _ - + only). */
export function sanitizeLoginIdInput(value: string, maxLen = 240): string {
  return value.replace(/[^a-zA-Z0-9@._+\-]/g, "").slice(0, maxLen);
}

/** Mobile / PIN: digits only. */
export function sanitizePhoneDigits(value: string, maxLen = 15): string {
  return value.replace(/\D/g, "").slice(0, maxLen);
}

/** GSTIN / PAN: uppercase alphanumeric. */
export function sanitizeGstPanInput(value: string, maxLen?: number): string {
  const s = value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return maxLen != null ? s.slice(0, maxLen) : s;
}

/** Password (creation): letters and digits only. */
export function sanitizePasswordInput(value: string, maxLen = 64): string {
  return value.replace(/[^a-zA-Z0-9]/g, "").slice(0, maxLen);
}

/** Money / qty: digits and one decimal point. */
export function sanitizeDecimalInput(value: string, maxLen = 20): string {
  let s = value.replace(/[^0-9.]/g, "");
  const dot = s.indexOf(".");
  if (dot >= 0) {
    s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "");
  }
  return s.slice(0, maxLen);
}

/** Whole numbers only. */
export function sanitizeIntegerInput(value: string, maxLen = 12): string {
  return value.replace(/\D/g, "").slice(0, maxLen);
}
