export type ServiceOutcomeKey = "same_ho" | "other_ho" | "online_store" | "send_to_brand" | "cannot_repair";

export type AccountsServiceDashboardFilters = {
  from: string;
  to: string;
  regionId?: string;
};

export type ServiceOutcomeStat = {
  key: ServiceOutcomeKey;
  label: string;
  closedCount: number;
  activeCount: number;
};

export type AccountsServiceDashboardData = {
  filters: AccountsServiceDashboardFilters;
  pendingCreditNotes: number;
  outcomeStats: ServiceOutcomeStat[];
  outcomeClosedChart: { name: string; value: number }[];
};

export type BrandCreditHistoryRow = {
  id: string;
  reference: string;
  customerName: string;
  phone: string;
  watchBrand: string;
  watchModel: string;
  serial: string;
  regionName: string | null;
  storeName: string | null;
  brandInvoiceRef: string | null;
  brandInvoiceMeta: Record<string, unknown> | null;
  brandCouponCode: string | null;
  brandCouponValueInr: number | null;
  brandCouponValidUntil: string | null;
  brandCouponReceivedAt: string | null;
  brandCreditNoteApprovedAt: string | null;
  brandCreditNoteApprovedBy: string | null;
  closedAt: string | null;
  createdAt: string;
};

function qs(filters: AccountsServiceDashboardFilters, extra?: Record<string, string>): string {
  const p = new URLSearchParams({ from: filters.from, to: filters.to });
  if (filters.regionId) p.set("regionId", filters.regionId);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v) p.set(k, v);
    }
  }
  return p.toString();
}

export function defaultServiceDashboardFromDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return d.toISOString().slice(0, 10);
}

export async function fetchAccountsServiceDashboard(
  filters: AccountsServiceDashboardFilters,
): Promise<AccountsServiceDashboardData> {
  const res = await fetch(`/api/accounts/service-dashboard?${qs(filters)}`, { credentials: "include" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<AccountsServiceDashboardData>;
}

export async function fetchBrandCreditHistory(
  filters: AccountsServiceDashboardFilters,
  search?: string,
): Promise<{ filters: AccountsServiceDashboardFilters; rows: BrandCreditHistoryRow[] }> {
  const res = await fetch(
    `/api/accounts/brand-credit-history?${qs(filters, search?.trim() ? { q: search.trim() } : undefined)}`,
    { credentials: "include" },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<{ filters: AccountsServiceDashboardFilters; rows: BrandCreditHistoryRow[] }>;
}
