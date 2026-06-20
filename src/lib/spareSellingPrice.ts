import type { SparePriceLine } from "../types/spare";

/** Cache key for spare unit price lookups that depend on watch brand. */
export function sparePriceCacheKey(spareId: string, watchBrand: string): string {
  return `${spareId}::${watchBrand.trim().toLowerCase()}`;
}

export function spareMasterSellingPrice(
  spare: { sellingPriceInr?: number | null; mrpInr?: number | null } | undefined,
): number {
  const price = Number(spare?.sellingPriceInr ?? spare?.mrpInr ?? 0);
  return Number.isFinite(price) && price > 0 ? price : 0;
}

export function matchSpareBrandPrice(prices: SparePriceLine[], watchBrand: string): number | null {
  const brandNorm = watchBrand.trim().toLowerCase();
  if (!brandNorm) return null;
  const matched = prices.find((p) => p.brand.trim().toLowerCase() === brandNorm);
  if (!matched) return null;
  const price = Number(matched.price);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

/** Brand/region catalogue price wins; optional master selling price fallback. */
export function resolveSparePriceFromLines(
  prices: SparePriceLine[],
  watchBrand: string,
  masterFallback = 0,
): number {
  const brandPrice = matchSpareBrandPrice(prices, watchBrand);
  if (brandPrice != null && brandPrice > 0) return brandPrice;
  return masterFallback > 0 ? masterFallback : 0;
}
