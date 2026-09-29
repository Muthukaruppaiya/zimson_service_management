import type { SeedRegion, SeedStore } from "../data/seed";
import type { SparePart } from "../types/spare";
import type { Supplier } from "../types/supplier";

/**
 * Master data used by print builders to fill addresses, GSTIN and part details
 * when a caller only knows the id. Fed by RegionsProvider / SparesProvider and
 * pages that load suppliers.
 */
let regions: SeedRegion[] = [];
const sparesById = new Map<string, SparePart>();
const suppliersById = new Map<string, Supplier>();

export function setPrintRegions(list: SeedRegion[]): void {
  regions = list;
}

export function setPrintSpares(list: SparePart[]): void {
  sparesById.clear();
  for (const s of list) sparesById.set(s.id, s);
}

export function setPrintSuppliers(list: Supplier[]): void {
  for (const s of list) suppliersById.set(s.id, s);
}

export function printRegion(id?: string | null): SeedRegion | null {
  const rid = String(id ?? "").trim();
  if (rid) {
    const hit = regions.find((r) => r.id === rid);
    if (hit) return hit;
  }
  return regions.length === 1 ? regions[0]! : null;
}

export function printStore(id?: string | null): { store: SeedStore; region: SeedRegion } | null {
  const sid = String(id ?? "").trim();
  if (!sid) return null;
  for (const region of regions) {
    const store = region.stores.find((s) => s.id === sid);
    if (store) return { store, region };
  }
  return null;
}

export function printSpare(id?: string | null): SparePart | null {
  const sid = String(id ?? "").trim();
  return sid ? sparesById.get(sid) ?? null : null;
}

export function printSupplier(id?: string | null): Supplier | null {
  const sid = String(id ?? "").trim();
  return sid ? suppliersById.get(sid) ?? null : null;
}
