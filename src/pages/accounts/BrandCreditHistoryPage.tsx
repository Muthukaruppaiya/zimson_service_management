import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
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
import { publicMediaUrl } from "../../lib/mediaUrl";

function attachmentUrl(meta: Record<string, unknown> | null | undefined): string | null {
  const path = String(meta?.attachmentPath ?? "").trim();
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return publicMediaUrl(path.startsWith("uploads/") || path.startsWith("api/media/") ? path : `uploads/${path}`);
}

function formatDateOnly(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

type ValidityFilter = "ALL" | "ACTIVE" | "EXPIRED" | "NONE";
type DocumentFilter = "ALL" | "HAS" | "NONE";

const btnIcon =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center border border-rlx-gold/60 bg-white text-rlx-green transition hover:border-rlx-gold hover:bg-rlx-green-light";
const modalIconGhost =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center border border-white/30 bg-white/10 text-white transition hover:bg-white/20";

function IconDetails({ className = "h-[1.125rem] w-[1.125rem]" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
      />
    </svg>
  );
}

function IconDoc({ className = "h-[1.125rem] w-[1.125rem]" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}

function IconClose({ className = "h-[1.125rem] w-[1.125rem]" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <tr className="border-b border-rlx-rule">
      <th className="w-40 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.12em] text-rlx-ink-muted align-top">
        {label}
      </th>
      <td className="px-3 py-2.5 text-sm text-rlx-ink">{value}</td>
    </tr>
  );
}

export function BrandCreditHistoryPage() {
  const { user } = useAuth();
  const { regions } = useRegions();
  const [from, setFrom] = useState(defaultServiceDashboardFromDate());
  const [to, setTo] = useState(localDateInputValue());
  const [regionId, setRegionId] = useState("");
  const [storeName, setStoreName] = useState("");
  const [brand, setBrand] = useState("");
  const [validity, setValidity] = useState<ValidityFilter>("ALL");
  const [documentFilter, setDocumentFilter] = useState<DocumentFilter>("ALL");
  const [query, setQuery] = useState("");
  const [preset, setPreset] = useState<DatePresetKey | "custom">("90d");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<BrandCreditHistoryRow[]>([]);
  const [detail, setDetail] = useState<BrandCreditHistoryRow | null>(null);

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

  function resetFilters() {
    const range = dateRangeForPreset("90d");
    setPreset("90d");
    setFrom(range.from);
    setTo(range.to);
    setRegionId("");
    setStoreName("");
    setBrand("");
    setValidity("ALL");
    setDocumentFilter("ALL");
    setQuery("");
  }

  const storeOptions = useMemo(() => {
    const names = new Set<string>();
    for (const r of regions) {
      for (const s of r.stores) {
        if (!regionId || r.id === regionId) names.add(s.name);
      }
    }
    for (const row of rows) {
      if (row.storeName) names.add(row.storeName);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [regions, rows, regionId]);

  const brandOptions = useMemo(() => {
    const names = new Set<string>();
    for (const row of rows) {
      const b = row.watchBrand?.trim();
      if (b) names.add(b);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const today = startOfTodayMs();
    return rows.filter((r) => {
      if (storeName && (r.storeName ?? "") !== storeName) return false;
      if (brand && (r.watchBrand ?? "") !== brand) return false;

      if (validity !== "ALL") {
        const until = r.brandCouponValidUntil;
        if (validity === "NONE") {
          if (until) return false;
        } else if (!until) {
          return false;
        } else {
          const ts = new Date(until).getTime();
          if (validity === "ACTIVE" && ts < today) return false;
          if (validity === "EXPIRED" && ts >= today) return false;
        }
      }

      if (documentFilter !== "ALL") {
        const hasDoc = Boolean(attachmentUrl(r.brandInvoiceMeta));
        if (documentFilter === "HAS" && !hasDoc) return false;
        if (documentFilter === "NONE" && hasDoc) return false;
      }

      return true;
    });
  }, [rows, storeName, brand, validity, documentFilter]);

  const detailDocUrl = detail ? attachmentUrl(detail.brandInvoiceMeta) : null;

  return (
    <div className="ui-page-bleed px-3 font-sans text-rlx-ink sm:px-4 md:px-5">
      <PageHeader
        title="Brand credit note history"
        description="Approved ZIM vouchers issued when brand could not repair — full audit trail with customer, watch, brand mail ref, and validity."
        actions={
          <div className="flex flex-wrap gap-2">
            {canAccessAnalytics ? (
              <Link
                to="/analytics/service-outcomes"
                className="inline-flex border border-rlx-rule bg-white px-4 py-2.5 text-sm font-semibold text-rlx-green transition hover:border-rlx-green hover:bg-rlx-green-light"
              >
                Service outcomes
              </Link>
            ) : null}
            <Link
              to="/accounts/brand-credit-notes"
              className="inline-flex border border-rlx-rule bg-white px-4 py-2.5 text-sm font-semibold text-rlx-green transition hover:border-rlx-green hover:bg-rlx-green-light"
            >
              Pending approvals
            </Link>
          </div>
        }
      />

      <section className="mb-5 border border-rlx-rule bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rlx-rule bg-rlx-bg px-3 py-2.5 sm:px-4">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-rlx-ink-muted">Filters</h2>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={resetFilters} className="ui-btn-secondary">
              Reset
            </button>
            <button type="button" onClick={() => void load()} className="ui-btn-secondary">
              Refresh
            </button>
          </div>
        </div>

        <div className="space-y-4 p-3 sm:p-4">
          <div className="ui-filter-grid">
            <FilterField label="Search" htmlFor="cn-hist-q" className="ui-filter-span-2-sm min-w-0">
              <input
                id="cn-hist-q"
                className="ui-field"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="SRF, customer, phone, voucher, brand ref…"
              />
            </FilterField>
            <FilterField label="From" htmlFor="cn-hist-from" className="min-w-0">
              <input
                id="cn-hist-from"
                type="date"
                className="ui-field"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPreset("custom");
                }}
              />
            </FilterField>
            <FilterField label="To" htmlFor="cn-hist-to" className="min-w-0">
              <input
                id="cn-hist-to"
                type="date"
                className="ui-field"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setPreset("custom");
                }}
              />
            </FilterField>
            {canPickRegion ? (
              <FilterField label="Region" htmlFor="cn-hist-region" className="min-w-0">
                <select
                  id="cn-hist-region"
                  className="ui-field"
                  value={regionId}
                  onChange={(e) => {
                    setRegionId(e.target.value);
                    setStoreName("");
                  }}
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
            <FilterField label="Store" htmlFor="cn-hist-store" className="min-w-0">
              <select
                id="cn-hist-store"
                className="ui-field"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
              >
                <option value="">All stores</option>
                {storeOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Brand" htmlFor="cn-hist-brand" className="min-w-0">
              <select id="cn-hist-brand" className="ui-field" value={brand} onChange={(e) => setBrand(e.target.value)}>
                <option value="">All brands</option>
                {brandOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Validity" htmlFor="cn-hist-validity" className="min-w-0">
              <select
                id="cn-hist-validity"
                className="ui-field"
                value={validity}
                onChange={(e) => setValidity(e.target.value as ValidityFilter)}
              >
                <option value="ALL">All</option>
                <option value="ACTIVE">Still valid</option>
                <option value="EXPIRED">Expired</option>
                <option value="NONE">No expiry date</option>
              </select>
            </FilterField>
            <FilterField label="Document" htmlFor="cn-hist-doc" className="min-w-0">
              <select
                id="cn-hist-doc"
                className="ui-field"
                value={documentFilter}
                onChange={(e) => setDocumentFilter(e.target.value as DocumentFilter)}
              >
                <option value="ALL">All</option>
                <option value="HAS">Has attachment</option>
                <option value="NONE">No attachment</option>
              </select>
            </FilterField>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-rlx-ink-muted">
              Period
            </span>
            {DATE_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => applyPreset(p.key)}
                className={`px-3 py-2 text-xs font-semibold transition ${
                  preset === p.key
                    ? "bg-rlx-green text-white"
                    : "border border-rlx-rule bg-white text-rlx-green hover:bg-rlx-green-light"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {error ? (
        <p className="mb-4 border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
      ) : null}

      {loading ? (
        <p className="text-sm text-rlx-ink-muted">Loading…</p>
      ) : filteredRows.length === 0 ? (
        <p className="border border-rlx-rule bg-white px-4 py-8 text-center text-sm text-rlx-ink-muted">
          No approved brand credit notes match the current filters.
        </p>
      ) : (
        <>
          <p className="mb-2 text-xs text-rlx-ink-muted md:hidden">Swipe horizontally to see more columns →</p>
          <div className="ui-table-scroll border border-rlx-rule bg-white shadow-sm">
            <table className="ui-table-dense w-full min-w-[56rem] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-rlx-green text-[11px] font-semibold uppercase tracking-[0.14em] text-white">
                <tr className="border-b-2 border-rlx-gold">
                  <th className="whitespace-nowrap px-3 py-3 text-left font-semibold">SRF</th>
                  <th className="min-w-[10rem] px-3 py-3 text-left font-semibold">Customer</th>
                  <th className="min-w-[10rem] px-3 py-3 text-left font-semibold">Watch</th>
                  <th className="min-w-[9rem] px-3 py-3 text-left font-semibold">Store</th>
                  <th className="min-w-[8rem] px-3 py-3 text-left font-semibold">Brand ref</th>
                  <th className="whitespace-nowrap px-3 py-3 text-left font-semibold">Voucher</th>
                  <th className="whitespace-nowrap px-3 py-3 text-right font-semibold">Value</th>
                  <th className="whitespace-nowrap px-3 py-3 text-left font-semibold">Valid till</th>
                  <th className="whitespace-nowrap px-3 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r, idx) => {
                  const docUrl = attachmentUrl(r.brandInvoiceMeta);
                  const watchLabel = `${r.watchBrand} ${r.watchModel}`.trim();
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setDetail(r)}
                      className={`cursor-pointer border-b border-rlx-rule transition-colors hover:bg-rlx-green-light ${
                        idx % 2 === 1 ? "bg-rlx-bg" : "bg-white"
                      }`}
                    >
                      <td className="align-middle px-3 py-3">
                        <span className="block whitespace-nowrap font-mono text-sm font-semibold text-rlx-green">
                          {r.reference}
                        </span>
                      </td>
                      <td className="align-middle px-3 py-3">
                        <span className="block whitespace-normal break-words text-sm font-medium leading-snug text-rlx-ink">
                          {r.customerName}
                        </span>
                        <span className="block text-xs leading-snug text-rlx-ink-muted">{r.phone}</span>
                      </td>
                      <td className="align-middle px-3 py-3">
                        <span className="block whitespace-normal break-words text-sm leading-snug text-rlx-ink">
                          {watchLabel}
                        </span>
                        <span className="block font-mono text-xs leading-snug text-rlx-ink-muted">{r.serial}</span>
                      </td>
                      <td className="align-middle px-3 py-3">
                        <span className="block whitespace-normal break-words text-sm leading-snug text-rlx-ink">
                          {r.storeName ?? "—"}
                        </span>
                        <span className="block text-xs leading-snug text-rlx-ink-muted">{r.regionName ?? "—"}</span>
                      </td>
                      <td className="align-middle px-3 py-3">
                        <span className="block whitespace-normal break-all font-mono text-sm text-rlx-ink">
                          {r.brandInvoiceRef ?? "—"}
                        </span>
                      </td>
                      <td className="align-middle px-3 py-3">
                        <span className="block whitespace-nowrap font-mono text-sm font-semibold tracking-wide text-rlx-ink">
                          {r.brandCouponCode ?? "—"}
                        </span>
                      </td>
                      <td className="align-middle px-3 py-3 whitespace-nowrap text-right text-sm font-semibold tabular-nums text-rlx-green">
                        {formatInr(r.brandCouponValueInr ?? 0)}
                      </td>
                      <td className="align-middle px-3 py-3 whitespace-nowrap text-sm text-rlx-ink">
                        {formatDateOnly(r.brandCouponValidUntil)}
                      </td>
                      <td className="align-middle px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-nowrap items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setDetail(r)}
                            className={btnIcon}
                            title="Details"
                            aria-label="Details"
                          >
                            <IconDetails />
                          </button>
                          {docUrl ? (
                            <a
                              href={docUrl}
                              target="_blank"
                              rel="noreferrer"
                              className={btnIcon}
                              title="View document"
                              aria-label="View document"
                            >
                              <IconDoc />
                            </a>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-rlx-ink-muted">
            {filteredRows.length} of {rows.length} record(s)
          </p>
        </>
      )}

      {detail ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-rlx-ink/70 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden bg-white shadow-[0_32px_80px_-20px_rgba(0,0,0,0.5)]">
            <div className="sticky top-0 z-20 flex items-center justify-between gap-3 bg-rlx-green px-4 py-2.5 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-semibold uppercase tracking-[0.35em] text-rlx-gold">Credit note details</p>
                <h3 className="truncate font-mono text-sm font-semibold text-white sm:text-base">{detail.reference}</h3>
                <p className="mt-0.5 truncate text-[11px] text-white/65">
                  {detail.customerName} · {detail.watchBrand} {detail.watchModel}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {detailDocUrl ? (
                  <a
                    href={detailDocUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={`${modalIconGhost} border-rlx-gold/50 bg-rlx-gold text-rlx-green-deep hover:bg-rlx-gold-dark`}
                    title="View document"
                    aria-label="View document"
                  >
                    <IconDoc />
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={() => setDetail(null)}
                  className={modalIconGhost}
                  title="Close"
                  aria-label="Close"
                >
                  <IconClose />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5">
              <div className="overflow-hidden border border-rlx-rule">
                <table className="w-full text-left">
                  <tbody className="odd:[&>tr]:bg-white even:[&>tr]:bg-rlx-bg">
                    <DetailRow label="SRF" value={<span className="font-mono font-semibold text-rlx-green">{detail.reference}</span>} />
                    <DetailRow label="Customer" value={detail.customerName} />
                    <DetailRow label="Phone" value={<span className="font-mono">{detail.phone || "—"}</span>} />
                    <DetailRow label="Watch" value={`${detail.watchBrand} ${detail.watchModel}`.trim()} />
                    <DetailRow label="Serial" value={<span className="font-mono">{detail.serial || "—"}</span>} />
                    <DetailRow label="Store" value={detail.storeName ?? "—"} />
                    <DetailRow label="Region" value={detail.regionName ?? "—"} />
                    <DetailRow label="Brand ref" value={<span className="font-mono">{detail.brandInvoiceRef ?? "—"}</span>} />
                    <DetailRow
                      label="Voucher"
                      value={<span className="font-mono font-semibold tracking-wide">{detail.brandCouponCode ?? "—"}</span>}
                    />
                    <DetailRow
                      label="Value"
                      value={
                        <span className="font-semibold text-rlx-green">
                          {formatInr(detail.brandCouponValueInr ?? 0)}
                        </span>
                      }
                    />
                    <DetailRow label="Valid till" value={formatDateOnly(detail.brandCouponValidUntil)} />
                    <DetailRow label="Mail logged" value={formatDateTime(detail.brandCouponReceivedAt)} />
                    <DetailRow label="Approved" value={formatDateTime(detail.brandCreditNoteApprovedAt)} />
                    <DetailRow label="Approved by" value={detail.brandCreditNoteApprovedBy ?? "—"} />
                    <DetailRow label="SRF closed" value={formatDateTime(detail.closedAt)} />
                    <DetailRow label="Created" value={formatDateTime(detail.createdAt)} />
                    <DetailRow
                      label="Document"
                      value={
                        detailDocUrl ? (
                          <a
                            href={detailDocUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold text-rlx-green underline"
                          >
                            Open attachment
                          </a>
                        ) : (
                          "—"
                        )
                      }
                    />
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
