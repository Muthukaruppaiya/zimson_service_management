import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FilterField } from "../../components/ui/FilterField";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useRegions } from "../../context/RegionsContext";
import { formatInr, localDateInputValue } from "../../lib/analyticsApi";
import { DATE_PRESETS, dateRangeForPreset, type DatePresetKey } from "../../lib/analyticsDatePresets";
import {
  defaultServiceDashboardFromDate,
  fetchBrandCreditHistory,
  type BrandCreditHistoryRow,
} from "../../lib/accountsServiceDashboardApi";

function attachmentUrl(meta: Record<string, unknown> | null | undefined): string | null {
  const path = String(meta?.attachmentPath ?? "").trim();
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return path.startsWith("/") ? path : `/uploads/${path}`;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function formatDateOnly(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

export function BrandCreditHistoryPage() {
  const { user } = useAuth();
  const { regions } = useRegions();
  const [from, setFrom] = useState(defaultServiceDashboardFromDate());
  const [to, setTo] = useState(localDateInputValue());
  const [regionId, setRegionId] = useState("");
  const [query, setQuery] = useState("");
  const [preset, setPreset] = useState<DatePresetKey>("90d");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<BrandCreditHistoryRow[]>([]);

  const canPickRegion = user?.role === "super_admin" || user?.role === "admin";
  const canAccessAnalytics = user?.role === "super_admin" || user?.role === "admin" || user?.role === "ho_manager";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const out = await fetchBrandCreditHistory({ from, to, regionId: regionId || undefined }, query);
      setRows(out.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load history.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [from, to, regionId, query]);

  useEffect(() => {
    void load();
  }, [load]);

  function applyPreset(key: DatePresetKey) {
    setPreset(key);
    const range = dateRangeForPreset(key);
    setFrom(range.from);
    setTo(range.to);
  }

  return (
    <div>
      <PageHeader
        title="Brand credit note history"
        description="Approved ZIM vouchers issued when brand could not repair — full audit trail with customer, watch, brand mail ref, and validity."
        actions={
          <div className="flex flex-wrap gap-2">
            {canAccessAnalytics ? (
              <Link
                to="/analytics/service-outcomes"
                className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
              >
                Service outcomes
              </Link>
            ) : null}
            <Link
              to="/accounts/brand-credit-notes"
              className="inline-flex rounded-xl border border-amber-400 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-950 shadow-sm transition hover:bg-amber-100"
            >
              Pending approvals
            </Link>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <FilterField label="From" htmlFor="cn-hist-from">
          <input
            id="cn-hist-from"
            type="date"
            className="w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPreset("90d");
            }}
          />
        </FilterField>
        <FilterField label="To" htmlFor="cn-hist-to">
          <input
            id="cn-hist-to"
            type="date"
            className="w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPreset("90d");
            }}
          />
        </FilterField>
        {canPickRegion ? (
          <FilterField label="Region" htmlFor="cn-hist-region">
            <select
              id="cn-hist-region"
              className="w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
              value={regionId}
              onChange={(e) => setRegionId(e.target.value)}
            >
              <option value="">All regions</option>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </FilterField>
        ) : null}
        <FilterField label="Search" htmlFor="cn-hist-q" className="min-w-[12rem] flex-1">
          <input
            id="cn-hist-q"
            className="w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="SRF, customer, phone, voucher, brand ref…"
          />
        </FilterField>
        <div className="flex flex-wrap gap-1.5 pb-0.5">
          {DATE_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => applyPreset(p.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                preset === p.key
                  ? "bg-zimson-800 text-white"
                  : "border border-zimson-200 bg-white text-zimson-800 hover:bg-zimson-50"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
      ) : null}

      {loading ? (
        <p className="text-sm text-stone-600">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-stone-600">No approved brand credit notes in this period.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zimson-200 bg-white shadow-sm">
          <table className="min-w-[1100px] w-full text-sm">
            <thead>
              <tr className="border-b border-zimson-200 bg-zimson-900 text-left text-xs uppercase tracking-wide text-white">
                <th className="px-3 py-2.5">SRF</th>
                <th className="px-3 py-2.5">Customer</th>
                <th className="px-3 py-2.5">Watch</th>
                <th className="px-3 py-2.5">Region / store</th>
                <th className="px-3 py-2.5">Brand mail ref</th>
                <th className="px-3 py-2.5">Voucher (ZIM)</th>
                <th className="px-3 py-2.5">Value</th>
                <th className="px-3 py-2.5">Valid until</th>
                <th className="px-3 py-2.5">Logged from mail</th>
                <th className="px-3 py-2.5">Approved</th>
                <th className="px-3 py-2.5">SRF closed</th>
                <th className="px-3 py-2.5">Doc</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const docUrl = attachmentUrl(r.brandInvoiceMeta);
                return (
                  <tr key={r.id} className="border-b border-zimson-100 align-top hover:bg-zimson-50/40">
                    <td className="px-3 py-2.5 font-mono text-xs font-bold text-zimson-900">{r.reference}</td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-stone-900">{r.customerName}</p>
                      <p className="text-xs text-stone-500">{r.phone}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <p>
                        {r.watchBrand} {r.watchModel}
                      </p>
                      <p className="font-mono text-xs text-stone-500">{r.serial}</p>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-stone-700">
                      <p>{r.regionName ?? "—"}</p>
                      <p className="text-stone-500">{r.storeName ?? "—"}</p>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs">{r.brandInvoiceRef ?? "—"}</td>
                    <td className="px-3 py-2.5 font-mono text-xs font-semibold tracking-wider">
                      {r.brandCouponCode ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-emerald-800">
                      {formatInr(r.brandCouponValueInr ?? 0)}
                    </td>
                    <td className="px-3 py-2.5 text-xs">{formatDateOnly(r.brandCouponValidUntil)}</td>
                    <td className="px-3 py-2.5 text-xs text-stone-600">
                      {formatDateTime(r.brandCouponReceivedAt)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-stone-600">
                      {formatDateTime(r.brandCreditNoteApprovedAt)}
                      {r.brandCreditNoteApprovedBy ? (
                        <span className="mt-0.5 block text-[10px] text-stone-400">by {r.brandCreditNoteApprovedBy}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-stone-600">{formatDateTime(r.closedAt)}</td>
                    <td className="px-3 py-2.5">
                      {docUrl ? (
                        <a
                          href={docUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-semibold text-violet-800 underline"
                        >
                          View
                        </a>
                      ) : (
                        <span className="text-xs text-stone-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="border-t border-zimson-100 px-3 py-2 text-xs text-stone-500">{rows.length} record(s)</p>
        </div>
      )}
    </div>
  );
}
