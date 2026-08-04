/** Shared login identifier rules (email, username from display name, or employee code). */

export function normalizeLoginEmail(value: string): string {
  return String(value).trim().toLowerCase();
}

export function normalizeLoginUsername(value: string): string {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function normalizeLoginEmployeeCode(value: string): string {
  return String(value).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** @deprecated Use normalizeLoginUsername */
export function normalizeLoginDisplayName(value: string): string {
  return normalizeLoginUsername(value);
}

export function isLoginEmailIdentifier(value: string): boolean {
  return String(value).trim().includes("@");
}

export function userMatchesLoginId(
  user: { email: string; displayName: string; employeeCode?: string | null },
  loginId: string,
): boolean {
  const raw = String(loginId).trim();
  if (!raw) return false;
  if (isLoginEmailIdentifier(raw)) {
    return normalizeLoginEmail(user.email) === normalizeLoginEmail(raw);
  }
  const loginUser = normalizeLoginUsername(raw);
  if (loginUser && normalizeLoginUsername(user.displayName) === loginUser) return true;
  const emp = normalizeLoginEmployeeCode(user.employeeCode ?? "");
  if (emp && normalizeLoginEmployeeCode(raw) === emp) return true;
  return false;
}
