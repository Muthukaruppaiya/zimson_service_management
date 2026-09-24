import type { ServicePackage, SrfServicePackageSnapshot, WatchServiceKind } from "../types/servicePackage";

export const WATCH_SERVICE_KINDS: { value: WatchServiceKind; label: string }[] = [
  { value: "quartz", label: "Quartz" },
  { value: "mechanical", label: "Mechanical" },
];

export const DEFAULT_PACKAGE_TYPES = ["complete", "partial", "overhaul"] as const;

export const PACKAGE_NAME_MAX = 80;

/** Title: letters, numbers, and spaces only — no special characters. */
export function sanitizePackageNameInput(raw: string): string {
  return String(raw ?? "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .replace(/ {2,}/g, " ")
    .slice(0, PACKAGE_NAME_MAX);
}

export function isValidPackageName(raw: string): boolean {
  const v = String(raw ?? "").trim();
  return v.length > 0 && v.length <= PACKAGE_NAME_MAX && /^[A-Za-z0-9]+(?: [A-Za-z0-9]+)*$/.test(v);
}

export function packageTypesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizePackageTypeKey(String(a ?? ""));
  const right = normalizePackageTypeKey(String(b ?? ""));
  return Boolean(left) && left === right;
}

export function packageTypeLabel(raw: string | null | undefined): string {
  const v = String(raw ?? "").trim();
  if (!v) return "Package";
  return v
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function packageDisplayName(pkg: { name?: string | null; packageType?: string | null }): string {
  const name = String(pkg.name ?? "").trim();
  if (name) return name;
  return packageTypeLabel(pkg.packageType);
}

export function watchServiceKindLabel(raw: string | null | undefined): string {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "quartz") return "Quartz";
  if (v === "mechanical") return "Mechanical";
  return v ? packageTypeLabel(v) : "—";
}

export function normalizePackageTypeKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").slice(0, 80);
}

export function servicePackageInvoiceDescription(pkg: {
  name?: string;
  packageType: string;
  serviceType: string;
  spareNames?: string[];
}): string {
  const title = `${packageDisplayName(pkg)} maintenance Service (${watchServiceKindLabel(pkg.serviceType)})`;
  const names = (pkg.spareNames ?? []).map((n) => n.trim()).filter(Boolean);
  if (names.length === 0) return title;
  return `${title}\nIncludes: ${names.join(", ")}`;
}

export function snapshotFromPackage(pkg: ServicePackage): SrfServicePackageSnapshot {
  return {
    id: pkg.id,
    brand: pkg.brand,
    name: pkg.name,
    serviceType: pkg.serviceType,
    packageType: pkg.packageType,
    priceInr: Number(pkg.priceInr) || 0,
    spareIds: pkg.spares.map((s) => s.spareId),
    spareNames: pkg.spares.map((s) => s.name).filter(Boolean),
  };
}
