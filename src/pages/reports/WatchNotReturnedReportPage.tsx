import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { FilterField } from "../../components/ui/FilterField";
import { PageHeader } from "../../components/ui/PageHeader";
import { useRegions } from "../../context/RegionsContext";
import { useSrfJobs } from "../../context/SrfJobsContext";
import type { SrfJob } from "../../types/srfJob";
import { downloadCsv, useServiceReportRows } from "./serviceReportUtils";

const CSV_COLUMNS = [
  "SR No",
  "Customer",
  "Phone",
  "Watch",
  "Serial",
  "Outward DC",
  "Dispatched To Store At",
  "Pending Days",
  "Current Status",
  "Destination Store",
  "Origin Store",
  "Region",
];

const STATUS_LABELS: Record<string, string> = {
  dispatched_to_store: "Dispatched to store",
  awaiting_store_inward: "Store inward pending",
  received_at_store: "Received at store",
  ready_for_outward: "Ready for outward",
  pending_store_transit: "Pending store transit",
  closed: "Closed",
  cancelled: "Cancelled",
};

const btnIcon =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center border border-rlx-gold/60 bg-white text-rlx-green transition hover:border-rlx-gold hover:bg-rlx-green-light";
const modalIconGhost =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center border border-white/30 bg-white/10 text-white transition hover:bg-white/20";

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

function daysSince(iso?: string | null): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24)));
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function watchLabel(job: SrfJob): string {
  return [job.watchBrand, job.watchFamily, job.watchModel].filter(Boolean).join(" ");
}

function dateInputValue(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type TimelineEvent = { at: string; label: string; detail?: string };

function buildTimeline(job: SrfJob): TimelineEvent[] {
  const events: TimelineEvent[] = [
    { at: job.createdAt, label: "SRF created", detail: job.createdBy ? `By ${job.createdBy}` : undefined },
    {
      at: job.dispatchedToScAt ?? "",
      label: "Dispatched to service centre",
      detail: job.dcNumber ? `DC ${job.dcNumber}` : undefined,
    },
    { at: job.inwardAt ?? "", label: "Received at service centre" },
    { at: job.assignedAt ?? "", label: "Technician assigned" },
    { at: job.estimateOkAt ?? "", label: "Estimate approved" },
    { at: job.completedAtSc ?? "", label: "Repair completed at SC" },
    { at: job.readyForOutwardAt ?? "", label: "Ready for outward" },
    {
      at: job.dispatchedToStoreAt ?? "",
      label: "Dispatched to store",
      detail: job.outwardDcNumber ? `ODC ${job.outwardDcNumber}` : undefined,
    },
    { at: job.receivedBackAtStoreAt ?? "", label: "Received at store" },
    { at: job.closedAt ?? "", label: "SRF closed" },
  ];
  return events
    .filter((e) => e.at)
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

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

export function WatchNotReturnedReportPage() {
  const { jobs } = useSrfJobs();
  const { regions } = useRegions();
  const { loading, error, kpis, refreshAll } = useServiceReportRows();

  const [query, setQuery] = useState("");
  const [regionId, setRegionId] = useState("");
  const [destinationStoreId, setDestinationStoreId] = useState("");
  const [minPendingDays, setMinPendingDays] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [detail, setDetail] = useState<SrfJob | null>(null);

  const storeNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of regions) {
      for (const s of r.stores) m.set(s.id, s.name);
    }
    return m;
  }, [regions]);

  function resolveStoreName(storeId: string | null | undefined, fallback?: string | null): string {
    if (storeId && storeNameById.has(storeId)) return storeNameById.get(storeId)!;
    if (fallback) return fallback;
    return storeId || "—";
  }

  const notReturnedJobs = useMemo(
    () =>
      jobs
        .filter(
          (j) =>
            Boolean(j.dispatchedToStoreAt) &&
            !j.receivedBackAtStoreAt &&
            j.status !== "closed" &&
            j.status !== "cancelled",
        )
        .sort((a, b) => daysSince(b.dispatchedToStoreAt) - daysSince(a.dispatchedToStoreAt)),
    [jobs],
  );

  const destinationOptions = useMemo(() => {
    const opts = new Map<string, string>();
    for (const j of notReturnedJobs) {
      const id = j.destinationStoreId || j.storeId;
      if (!id) continue;
      opts.set(id, resolveStoreName(id, j.storeName));
    }
    return Array.from(opts.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    // resolveStoreName depends on storeNameById; eslint may complain - intentional
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notReturnedJobs, storeNameById]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const minDays = Number(minPendingDays);
    const hasMin = Number.isFinite(minDays) && minPendingDays.trim() !== "";

    return notReturnedJobs.filter((j) => {
      if (regionId && j.regionId !== regionId) return false;

      const destId = j.destinationStoreId || j.storeId;
      if (destinationStoreId && destId !== destinationStoreId) return false;

      const pending = daysSince(j.dispatchedToStoreAt);
      if (hasMin && pending < minDays) return false;

      const dispatchedDay = dateInputValue(j.dispatchedToStoreAt);
      if (fromDate && dispatchedDay && dispatchedDay < fromDate) return false;
      if (toDate && dispatchedDay && dispatchedDay > toDate) return false;

      if (q) {
        const dest = resolveStoreName(j.destinationStoreId, j.storeName);
        const hay = `${j.reference} ${j.customerName} ${j.phone} ${watchLabel(j)} ${j.serial} ${j.outwardDcNumber ?? ""} ${dest} ${j.status}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notReturnedJobs, query, regionId, destinationStoreId, minPendingDays, fromDate, toDate, storeNameById]);

  function resetFilters() {
    setQuery("");
    setRegionId("");
    setDestinationStoreId("");
    setMinPendingDays("");
    setFromDate("");
    setToDate("");
  }

  const csvRows = useMemo(
    () =>
      filtered.map((j) => ({
        "SR No": j.reference,
        Customer: j.customerName,
        Phone: j.phone,
        Watch: watchLabel(j),
        Serial: j.serial || "—",
        "Outward DC": j.outwardDcNumber || "—",
        "Dispatched To Store At": formatDateTime(j.dispatchedToStoreAt),
        "Pending Days": daysSince(j.dispatchedToStoreAt),
        "Current Status": statusLabel(j.status),
        "Destination Store": resolveStoreName(j.destinationStoreId, j.storeName),
        "Origin Store": resolveStoreName(j.storeId, j.storeName),
        Region: j.regionName || j.regionId,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, storeNameById],
  );

  const timeline = detail ? buildTimeline(detail) : [];

  return (
    <div className="ui-page-bleed px-3 font-sans text-rlx-ink sm:px-4 md:px-5">
      <PageHeader
        title="Watch not returned report"
        description="Watches dispatched from service centre but still not received at store."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                downloadCsv(`watch_not_returned_${new Date().toISOString().slice(0, 10)}.csv`, CSV_COLUMNS, csvRows)
              }
              className="inline-flex border border-rlx-rule bg-white px-4 py-2.5 text-sm font-semibold text-rlx-green transition hover:border-rlx-green hover:bg-rlx-green-light disabled:opacity-40"
              disabled={filtered.length === 0}
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => void refreshAll()}
              className="inline-flex border border-rlx-rule bg-white px-4 py-2.5 text-sm font-semibold text-rlx-green transition hover:border-rlx-green hover:bg-rlx-green-light"
            >
              Refresh
            </button>
          </div>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="border border-rlx-rule bg-white shadow-sm">
          <div className="border-b-2 border-rlx-gold bg-rlx-green px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white">Open SRFs</p>
          </div>
          <p className="px-3 py-3 text-lg font-semibold text-rlx-green">{kpis.openSrf}</p>
        </div>
        <div className="border border-rlx-rule bg-white shadow-sm">
          <div className="border-b-2 border-rlx-gold bg-rlx-green px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white">Not returned</p>
          </div>
          <p className="px-3 py-3 text-lg font-semibold text-amber-700">{filtered.length}</p>
        </div>
        <div className="border border-rlx-rule bg-white shadow-sm">
          <div className="border-b-2 border-rlx-gold bg-rlx-green px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white">Pending jobs</p>
          </div>
          <p className="px-3 py-3 text-lg font-semibold text-rlx-green">{kpis.pending}</p>
        </div>
        <div className="border border-rlx-rule bg-white shadow-sm">
          <div className="border-b-2 border-rlx-gold bg-rlx-green px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white">Quick bills</p>
          </div>
          <p className="px-3 py-3 text-lg font-semibold text-rlx-ink">{kpis.quickBills}</p>
        </div>
      </div>

      <section className="mb-5 border border-rlx-rule bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rlx-rule bg-rlx-bg px-3 py-2.5 sm:px-4">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-rlx-ink-muted">Filters</h2>
          <button type="button" onClick={resetFilters} className="ui-btn-secondary">
            Reset
          </button>
        </div>
        <div className="ui-filter-grid p-3 sm:p-4">
          <FilterField label="Search" htmlFor="wnr-q" className="ui-filter-span-2-sm min-w-0">
            <input
              id="wnr-q"
              className="ui-field"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="SRF, customer, phone, watch, ODC…"
            />
          </FilterField>
          <FilterField label="Region" htmlFor="wnr-region" className="min-w-0">
            <select
              id="wnr-region"
              className="ui-field"
              value={regionId}
              onChange={(e) => {
                setRegionId(e.target.value);
                setDestinationStoreId("");
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
          <FilterField label="Destination store" htmlFor="wnr-dest" className="min-w-0">
            <select
              id="wnr-dest"
              className="ui-field"
              value={destinationStoreId}
              onChange={(e) => setDestinationStoreId(e.target.value)}
            >
              <option value="">All stores</option>
              {destinationOptions
                .filter((s) => {
                  if (!regionId) return true;
                  const region = regions.find((r) => r.id === regionId);
                  return region?.stores.some((st) => st.id === s.id);
                })
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </FilterField>
          <FilterField label="Min pending days" htmlFor="wnr-days" className="min-w-0">
            <input
              id="wnr-days"
              type="number"
              min={0}
              className="ui-field"
              value={minPendingDays}
              onChange={(e) => setMinPendingDays(e.target.value)}
              placeholder="e.g. 3"
            />
          </FilterField>
          <FilterField label="Dispatched from" htmlFor="wnr-from" className="min-w-0">
            <input
              id="wnr-from"
              type="date"
              className="ui-field"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </FilterField>
          <FilterField label="Dispatched to" htmlFor="wnr-to" className="min-w-0">
            <input
              id="wnr-to"
              type="date"
              className="ui-field"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </FilterField>
        </div>
      </section>

      {error ? (
        <p className="mb-4 border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
      ) : null}

      {loading ? (
        <p className="text-sm text-rlx-ink-muted">Loading report data…</p>
      ) : filtered.length === 0 ? (
        <p className="border border-rlx-rule bg-white px-4 py-8 text-center text-sm text-rlx-ink-muted">
          No watches match the current filters.
        </p>
      ) : (
        <>
          <p className="mb-2 text-xs text-rlx-ink-muted md:hidden">Swipe horizontally to see more columns →</p>
          <div className="ui-table-scroll border border-rlx-rule bg-white shadow-sm">
            <table className="ui-table-dense w-full min-w-[44rem] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-rlx-green text-[11px] font-semibold uppercase tracking-[0.14em] text-white">
                <tr className="border-b-2 border-rlx-gold">
                  <th className="whitespace-nowrap px-3 py-3 text-left font-semibold">SRF</th>
                  <th className="min-w-[10rem] px-3 py-3 text-left font-semibold">Customer</th>
                  <th className="min-w-[10rem] px-3 py-3 text-left font-semibold">Watch</th>
                  <th className="min-w-[9rem] px-3 py-3 text-left font-semibold">Destination</th>
                  <th className="whitespace-nowrap px-3 py-3 text-right font-semibold">Pending</th>
                  <th className="whitespace-nowrap px-3 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((j, idx) => {
                  const pending = daysSince(j.dispatchedToStoreAt);
                  const dest = resolveStoreName(j.destinationStoreId, j.storeName);
                  return (
                    <tr
                      key={j.id}
                      onClick={() => setDetail(j)}
                      className={`cursor-pointer border-b border-rlx-rule transition-colors hover:bg-rlx-green-light ${
                        idx % 2 === 1 ? "bg-rlx-bg" : "bg-white"
                      }`}
                    >
                      <td className="align-middle px-3 py-3">
                        <span className="block whitespace-nowrap font-mono text-sm font-semibold text-rlx-green">
                          {j.reference}
                        </span>
                        <span className="block text-xs text-rlx-ink-muted">{j.outwardDcNumber || "—"}</span>
                      </td>
                      <td className="align-middle px-3 py-3">
                        <span className="block whitespace-normal break-words text-sm font-medium leading-snug text-rlx-ink">
                          {j.customerName}
                        </span>
                        <span className="block text-xs leading-snug text-rlx-ink-muted">{j.phone}</span>
                      </td>
                      <td className="align-middle px-3 py-3">
                        <span className="block whitespace-normal break-words text-sm leading-snug text-rlx-ink">
                          {watchLabel(j)}
                        </span>
                        <span className="block font-mono text-xs leading-snug text-rlx-ink-muted">{j.serial || "—"}</span>
                      </td>
                      <td className="align-middle px-3 py-3">
                        <span className="block whitespace-normal break-words text-sm leading-snug text-rlx-ink">{dest}</span>
                        <span className="block text-xs leading-snug text-rlx-ink-muted">
                          {j.regionName || j.regionId}
                        </span>
                      </td>
                      <td className="align-middle px-3 py-3 text-right">
                        <span
                          className={`inline-flex min-w-[3.5rem] items-center justify-center rounded px-2 py-1 text-xs font-semibold tabular-nums ring-1 ring-inset ${
                            pending >= 7
                              ? "bg-rose-50 text-rose-800 ring-rose-300/70"
                              : pending >= 3
                                ? "bg-amber-50 text-amber-950 ring-amber-300/70"
                                : "bg-sky-50 text-sky-900 ring-sky-300/70"
                          }`}
                        >
                          {pending}d
                        </span>
                      </td>
                      <td className="align-middle px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => setDetail(j)}
                            className={btnIcon}
                            title="Details & history"
                            aria-label="Details and history"
                          >
                            <IconDetails />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-rlx-ink-muted">
            {filtered.length} of {notReturnedJobs.length} record(s)
          </p>
        </>
      )}

      {detail ? (
        <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-rlx-ink/70 p-0 backdrop-blur-sm sm:items-center sm:p-3 md:p-5">
          <div className="flex h-[100dvh] w-full max-w-[96rem] flex-col overflow-hidden bg-white shadow-[0_32px_80px_-20px_rgba(0,0,0,0.5)] sm:h-[min(96dvh,56rem)] sm:max-h-[96dvh]">
            <div className="flex shrink-0 items-center justify-between gap-3 bg-rlx-green px-4 py-3 sm:px-6">
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-semibold uppercase tracking-[0.35em] text-rlx-gold">Watch not returned</p>
                <h3 className="truncate font-mono text-base font-semibold text-white sm:text-lg">{detail.reference}</h3>
                <p className="mt-0.5 truncate text-xs text-white/65 sm:text-sm">
                  {detail.customerName} · {watchLabel(detail)} · {daysSince(detail.dispatchedToStoreAt)}d pending
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Link
                  to={`/service/srf-register?q=${encodeURIComponent(detail.reference)}`}
                  className="inline-flex border border-white/30 bg-white/10 px-3 py-2 text-xs font-semibold text-white no-underline transition hover:bg-white/20"
                >
                  Open SRF
                </Link>
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

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
              <div className="shrink-0 border-b border-rlx-rule p-4 sm:p-5 lg:w-[24rem] lg:overflow-y-auto lg:border-b-0 lg:border-r">
                <div className="overflow-hidden border border-rlx-rule">
                  <table className="w-full text-left">
                    <tbody className="odd:[&>tr]:bg-white even:[&>tr]:bg-rlx-bg">
                      <DetailRow
                        label="SRF"
                        value={<span className="font-mono font-semibold text-rlx-green">{detail.reference}</span>}
                      />
                      <DetailRow label="Status" value={statusLabel(detail.status)} />
                      <DetailRow label="Customer" value={detail.customerName} />
                      <DetailRow label="Phone" value={<span className="font-mono">{detail.phone || "—"}</span>} />
                      <DetailRow label="Watch" value={watchLabel(detail)} />
                      <DetailRow label="Serial" value={<span className="font-mono">{detail.serial || "—"}</span>} />
                      <DetailRow label="Region" value={detail.regionName || detail.regionId || "—"} />
                      <DetailRow label="Origin store" value={resolveStoreName(detail.storeId, detail.storeName)} />
                      <DetailRow
                        label="Destination"
                        value={resolveStoreName(detail.destinationStoreId, detail.storeName)}
                      />
                      <DetailRow
                        label="Outward DC"
                        value={<span className="font-mono">{detail.outwardDcNumber || "—"}</span>}
                      />
                      <DetailRow label="Inbound DC" value={<span className="font-mono">{detail.dcNumber || "—"}</span>} />
                      <DetailRow label="Dispatched" value={formatDateTime(detail.dispatchedToStoreAt)} />
                      <DetailRow
                        label="Pending days"
                        value={
                          <span className="font-semibold text-amber-700">
                            {daysSince(detail.dispatchedToStoreAt)} day(s)
                          </span>
                        }
                      />
                      <DetailRow label="Complaint" value={detail.complaint || "—"} />
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex min-h-0 min-w-0 flex-1 flex-col p-4 sm:p-5">
                <h4 className="mb-3 shrink-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-rlx-ink-muted">
                  Full movement history
                </h4>
                {timeline.length === 0 ? (
                  <p className="border border-rlx-rule bg-rlx-bg px-3 py-6 text-center text-sm text-rlx-ink-muted">
                    No timeline events recorded.
                  </p>
                ) : (
                  <div className="min-h-0 flex-1 overflow-auto border border-rlx-rule">
                    <table className="w-full table-fixed text-left text-sm">
                      <colgroup>
                        <col className="w-[11rem]" />
                        <col className="w-[14rem]" />
                        <col />
                      </colgroup>
                      <thead className="sticky top-0 z-10 bg-rlx-bg text-[11px] font-semibold uppercase tracking-[0.12em] text-rlx-ink-muted">
                        <tr className="border-b border-rlx-rule">
                          <th className="px-3 py-2.5 text-left">When</th>
                          <th className="px-3 py-2.5 text-left">Event</th>
                          <th className="px-3 py-2.5 text-left">Detail</th>
                        </tr>
                      </thead>
                      <tbody>
                        {timeline.map((ev, idx) => (
                          <tr
                            key={`${ev.label}-${ev.at}`}
                            className={`border-b border-rlx-rule ${idx % 2 === 1 ? "bg-rlx-bg" : "bg-white"}`}
                          >
                            <td className="px-3 py-2.5 align-top text-xs leading-snug text-rlx-ink-muted">
                              {formatDateTime(ev.at)}
                            </td>
                            <td className="px-3 py-2.5 align-top text-sm font-medium leading-snug text-rlx-ink">
                              {ev.label}
                            </td>
                            <td className="break-words px-3 py-2.5 align-top text-sm leading-snug text-rlx-ink-muted">
                              {ev.detail || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
