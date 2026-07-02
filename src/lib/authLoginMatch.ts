/** Shared login identifier rules (email or username — not employee code). */

export function normalizeLoginEmail(value: string): string {
  return String(value).trim().toLowerCase();
}

export function normalizeLoginUsername(value: string): string {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** @deprecated Use normalizeLoginUsername */
export function normalizeLoginDisplayName(value: string): string {
  return normalizeLoginUsername(value);
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
  return normalizeLoginUsername(user.displayName) === normalizeLoginUsername(raw);
}
