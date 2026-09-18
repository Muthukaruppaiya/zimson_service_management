/** Unique catalogue key: part number + brand (same SKU may exist for two brands). */
export function spareSkuBrandKey(sku: string, brand: string | null | undefined): string {
  return `${sku.trim().toUpperCase()}::${String(brand ?? "").trim().toUpperCase()}`;
}

export function pickSpareByScannedSku<T extends { sku: string; altSku?: string | null; brand?: string | null }>(
  rows: T[],
  scannedSku: string,
  preferredBrand?: string | null,
): T | undefined {
  const sku = scannedSku.trim().toUpperCase();
  const hits = rows.filter((s) => {
    if (s.sku.trim().toUpperCase() === sku) return true;
    const alt = String(s.altSku ?? "").trim().toUpperCase();
    return Boolean(alt) && alt === sku;
  });
  if (hits.length <= 1) return hits[0];
  const brand = (preferredBrand ?? "").trim().toLowerCase();
  if (brand) {
    const match = hits.find((s) => (s.brand ?? "").trim().toLowerCase() === brand);
    if (match) return match;
  }
  return hits[0];
}

export function spareCatalogLabel(spare: { name: string; sku: string; brand?: string | null }): string {
  const brand = spare.brand?.trim();
  return brand ? `${spare.name} (${spare.sku} · ${brand})` : `${spare.name} (${spare.sku})`;
}

export function normalizeAltSku(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim().toUpperCase();
  return s || null;
}

export function normalizeAltName(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  return s || null;
}

export function optionalMasterText(raw: string | null | undefined, maxLen = 120): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  return s.slice(0, maxLen);
}
