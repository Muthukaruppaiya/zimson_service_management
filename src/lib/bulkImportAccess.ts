import type { UserRole } from "../types/user";

export const BULK_IMPORT_ROLES: UserRole[] = ["super_admin", "admin"];

export function canBulkImport(role: UserRole | null | undefined): boolean {
  return role === "super_admin" || role === "admin";
}

export function isBulkImportPath(path: string): boolean {
  return /\/bulk-import(\/|$)/.test(path);
}
