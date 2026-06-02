/** Shared login identifier rules (email or employee display name — not employee code). */

export function normalizeLoginEmail(value: string): string {
  return String(value).trim().toLowerCase();
}

export function normalizeLoginDisplayName(value: string): string {
  return String(value).trim().toLowerCase().replace(/\s+/g, " ");
}

export function isLoginEmailIdentifier(value: string): boolean {
  return String(value).trim().includes("@");
}

export function userMatchesLoginId(
  user: { email: string; displayName: string },
  loginId: string,
): boolean {
  const raw = String(loginId).trim();
  if (!raw) return false;
  if (isLoginEmailIdentifier(raw)) {
    return normalizeLoginEmail(user.email) === normalizeLoginEmail(raw);
  }
  return normalizeLoginDisplayName(user.displayName) === normalizeLoginDisplayName(raw);
}
