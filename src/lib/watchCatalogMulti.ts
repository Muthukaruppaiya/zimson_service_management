/** Stored in DB / invoices when multiple catalog values are selected. */
export const WATCH_CATALOG_MULTI_DELIMITER = " | ";

export function parseWatchCatalogMultiValue(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return [
    ...new Set(
      raw
        .split(/\s*\|\s*/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}

export function formatWatchCatalogMultiValue(values: string[]): string {
  return [
    ...new Set(
      values
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  ].join(WATCH_CATALOG_MULTI_DELIMITER);
}
