import type { AnalyticsViewKey } from "./analyticsTopics";
import type { ChartSlice } from "./analyticsApi";

export type DrillLevel = "overview" | "region" | "store" | "dimension";

export type DrillCrumb = {
  level: DrillLevel;
  label: string;
  regionId?: string;
  storeName?: string;
  dimension?: string;
};

export type DrillSelection = {
  source: string;
  slice: ChartSlice;
  suggestedView?: AnalyticsViewKey;
};

export function emptyDrillPath(): DrillCrumb[] {
  return [{ level: "overview", label: "Overview" }];
}

export function regionCrumb(label: string, regionId: string): DrillCrumb {
  return { level: "region", label, regionId };
}

export function storeCrumb(label: string, storeName: string): DrillCrumb {
  return { level: "store", label, storeName };
}

export function dimensionCrumb(label: string, dimension: string): DrillCrumb {
  return { level: "dimension", label, dimension };
}

export function findRegionIdByName(regions: { id: string; name: string }[], name: string): string | undefined {
  const n = name.trim().toLowerCase();
  return regions.find((r) => r.name.trim().toLowerCase() === n)?.id;
}

export function filterSlicesByPrefix(rows: ChartSlice[], prefix: string): ChartSlice[] {
  const p = prefix.trim().toLowerCase();
  if (!p) return rows;
  return rows.filter((r) => r.name.toLowerCase().includes(p));
}

export function sliceSharePct(slice: ChartSlice, total: number): number {
  if (total <= 0) return 0;
  return Math.round((slice.value / total) * 1000) / 10;
}
