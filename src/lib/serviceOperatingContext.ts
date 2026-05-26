import type { SeedRegion } from "../data/seed";

/** Head-office roles that bill or book SRF on behalf of a store. */
export function isHoServiceOperator(role: string | undefined): boolean {
  return role === "admin" || role === "super_admin";
}

export function resolveOperatingRegionId(
  role: string | undefined,
  userRegionId: string | null | undefined,
  selectedRegionId: string,
): string {
  if (role === "super_admin") return selectedRegionId.trim();
  return String(userRegionId ?? "").trim();
}

export function storesForRegion(regions: SeedRegion[], regionId: string) {
  if (!regionId) return [];
  return regions.find((r) => r.id === regionId)?.stores ?? [];
}

export function pickDefaultStoreId(
  regions: SeedRegion[],
  regionId: string,
  preferStoreId?: string | null,
): string {
  const preferred = String(preferStoreId ?? "").trim();
  if (preferred) return preferred;
  return storesForRegion(regions, regionId)[0]?.id ?? "";
}

/** Login store when present; otherwise HO-selected operating store. */
export function resolveOperatingStoreId(
  role: string | undefined,
  userStoreId: string | null | undefined,
  userStoreIds: string[] | undefined,
  selectedStoreId: string,
): string {
  const fromLogin =
    String(userStoreId ?? "").trim() ||
    (Array.isArray(userStoreIds) && userStoreIds.length > 0 ? String(userStoreIds[0]).trim() : "");
  if (fromLogin) return fromLogin;
  if (isHoServiceOperator(role)) return selectedStoreId.trim();
  return "";
}

export function hoNeedsOperatingStorePicker(
  role: string | undefined,
  userStoreId: string | null | undefined,
  userStoreIds: string[] | undefined,
): boolean {
  if (!isHoServiceOperator(role)) return false;
  const fromLogin =
    String(userStoreId ?? "").trim() ||
    (Array.isArray(userStoreIds) && userStoreIds.length > 0 ? String(userStoreIds[0]).trim() : "");
  return !fromLogin;
}
