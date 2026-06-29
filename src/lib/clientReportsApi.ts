export type ReportFiltersQuery = {
  from: string;
  to: string;
  regionId?: string;
  storeId?: string;
};

export type ChartSlice = { name: string; value: number };

export type RevenueReportData = {
  filters: { from: string; to: string };
  srfLines: Record<string, unknown>[];
  quickBillLines: Record<string, unknown>[];
  totals: { srfAmount: number; quickBillAmount: number; srfRows: number; quickBillRows: number };
  charts: {
    srfVsQuickBill: ChartSlice[];
    byStore: ChartSlice[];
    byPayment: ChartSlice[];
    bySrType: ChartSlice[];
    byBrand: ChartSlice[];
  };
};

export type TabularReportData = {
  filters: { from: string; to: string };
  rows: Record<string, unknown>[];
  totals: Record<string, number>;
  charts: Record<string, ChartSlice[]>;
};

function qs(filters: ReportFiltersQuery): string {
  const p = new URLSearchParams({ from: filters.from, to: filters.to });
  if (filters.regionId) p.set("regionId", filters.regionId);
  if (filters.storeId) p.set("storeId", filters.storeId);
  return p.toString();
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function fetchRevenueReportData(filters: ReportFiltersQuery): Promise<RevenueReportData> {
  return fetchJson(`/api/accounts/reports/revenue/data?${qs(filters)}`);
}

export function fetchSummarySaleReportData(filters: ReportFiltersQuery): Promise<TabularReportData> {
  return fetchJson(`/api/accounts/reports/summary-sale/data?${qs(filters)}`);
}

export function fetchHsnPurchaseReportData(filters: ReportFiltersQuery): Promise<TabularReportData> {
  return fetchJson(`/api/accounts/reports/hsn-purchase/data?${qs(filters)}`);
}

export function fetchSrReturnedReportData(filters: ReportFiltersQuery): Promise<TabularReportData> {
  return fetchJson(`/api/accounts/reports/sr-returned/data?${qs(filters)}`);
}

export async function downloadReportExcel(
  reportId: "revenue" | "summary-sale" | "hsn-purchase" | "sr-returned",
  filters: ReportFiltersQuery,
  filenamePrefix: string,
): Promise<Blob> {
  const res = await fetch(`/api/accounts/reports/${reportId}?${qs(filters)}`, { credentials: "include" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Download failed (${res.status})`);
  }
  return new Blob([await res.arrayBuffer()], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function localDateInputValue(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function defaultReportFromDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 365);
  return localDateInputValue(d);
}

export function formatInr(n: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}
