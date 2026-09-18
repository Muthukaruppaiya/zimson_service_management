import type { ServicePackage, SrfServicePackageSnapshot, WatchServiceKind } from "../types/servicePackage";

export const WATCH_SERVICE_KINDS: { value: WatchServiceKind; label: string }[] = [
  { value: "quartz", label: "Quartz" },
  { value: "mechanical", label: "Mechanical" },
];

export const DEFAULT_PACKAGE_TYPES = ["complete", "partial", "overhaul"] as const;

export function packageTypeLabel(raw: string | null | undefined): string {
  const v = String(raw ?? "").trim();
  if (!v) return "Package";
  return v
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function watchServiceKindLabel(raw: string | null | undefined): string {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "quartz") return "Quartz";
  if (v === "mechanical") return "Mechanical";
  return v ? packageTypeLabel(v) : "—";
}

export function normalizePackageTypeKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").slice(0, 40);
}

export function servicePackageInvoiceDescription(pkg: {
  packageType: string;
  serviceType: string;
  spareNames?: string[];
}): string {
  const title = `${packageTypeLabel(pkg.packageType)} maintenance Service (${watchServiceKindLabel(pkg.serviceType)})`;
  const names = (pkg.spareNames ?? []).map((n) => n.trim()).filter(Boolean);
  if (names.length === 0) return title;
  return `${title}\nIncludes: ${names.join(", ")}`;
}

export function snapshotFromPackage(pkg: ServicePackage): SrfServicePackageSnapshot {
  return {
    id: pkg.id,
    brand: pkg.brand,
    serviceType: pkg.serviceType,
    packageType: pkg.packageType,
    priceInr: Number(pkg.priceInr) || 0,
    spareIds: pkg.spares.map((s) => s.spareId),
    spareNames: pkg.spares.map((s) => s.name).filter(Boolean),
  };
}
