import type { AnalyticsViewKey } from "./analyticsTopics";

export type AnalyticsFiltersQuery = {
  from: string;
  to: string;
  regionId?: string;
  view: AnalyticsViewKey;
};

export type ChartSlice = { name: string; value: number };

export type AnalyticsDashboardData = {
  filters: AnalyticsFiltersQuery;
  kpis: {
    totalSalesInr: number;
    srfSalesInr: number;
    quickBillSalesInr: number;
    purchaseInr: number;
    srfOpened: number;
    srfClosed: number;
    srfActive: number;
    quickBillCount: number;
    b2bSalesInr: number;
    b2cSalesInr: number;
    srfInvoiceCount: number;
  };
  derived: {
    avgSrfTicketInr: number;
    avgQuickBillInr: number;
    srfCloseRatePct: number;
    b2bSharePct: number;
    grossMarginInr: number;
    grossMarginPct: number;
  };
  compare: {
    label: string;
    totalSalesInr: number;
    srfSalesInr: number;
    quickBillSalesInr: number;
    purchaseInr: number;
    srfOpened: number;
    srfClosed: number;
  };
  salesTrend: ChartSlice[];
  salesByMonth: ChartSlice[];
  purchaseByMonth: ChartSlice[];
  srfStatusBreakdown: ChartSlice[];
  srfPipelineBuckets: ChartSlice[];
  srfOpenedByMonth: ChartSlice[];
  srfClosedByMonth: ChartSlice[];
  salesByStore: ChartSlice[];
  salesByRegion: ChartSlice[];
  b2bVsB2c: ChartSlice[];
  srfVsQuickBill: ChartSlice[];
  paymentModes: ChartSlice[];
  purchaseByVendor: ChartSlice[];
  purchaseByHsn: ChartSlice[];
  quickBillTrend: ChartSlice[];
  srfSalesTrend: ChartSlice[];
  b2bB2cByChannel: ChartSlice[];
  srfByBrand: ChartSlice[];
  quickBillByBrand: ChartSlice[];
  storeDetail: { name: string; srfInr: number; quickBillInr: number; totalInr: number }[];
};

function qs(filters: AnalyticsFiltersQuery): string {
  const p = new URLSearchParams({ from: filters.from, to: filters.to, view: filters.view });
  if (filters.regionId) p.set("regionId", filters.regionId);
  return p.toString();
}

export function defaultAnalyticsFromDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return d.toISOString().slice(0, 10);
}

export function localDateInputValue(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatInr(n: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

export function formatCount(n: number): string {
  return new Intl.NumberFormat("en-IN").format(n);
}

export function formatPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return roundPct(((current - previous) / previous) * 100);
}

function roundPct(n: number): number {
  return Math.round(n * 10) / 10;
}

export async function fetchAnalyticsDashboard(filters: AnalyticsFiltersQuery): Promise<AnalyticsDashboardData> {
  const res = await fetch(`/api/analytics/dashboard?${qs(filters)}`, { credentials: "include" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<AnalyticsDashboardData>;
}
