import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ServiceBreadcrumb } from "../../components/service/ServiceBreadcrumb";
import { SrfTraceModal } from "../../components/service/SrfTraceModal";
import { FilterField } from "../../components/ui/FilterField";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useSrfJobs } from "../../context/SrfJobsContext";
import { jobVisibleToServiceCentre, jobVisibleToStoreUser } from "../../lib/srfAccess";
import type { SrfJob, SrfJobStatus } from "../../types/srfJob";

const btnIcon =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center border border-rlx-gold/60 bg-white text-rlx-green transition hover:border-rlx-gold hover:bg-rlx-green-light";
const modalIconGhost =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center border border-white/30 bg-white/10 text-white transition hover:bg-white/20";

function asCurrency(value: number): string {
  return value.toLocaleString(undefined, { style: "currency", currency: "INR" });
}

function sparesAmount(job: SrfJob): number {
  const lines = job.usedSpares ?? [];
  if (lines.length > 0) {
    return lines.reduce((sum, l) => {
      const lineTotal = Number(l.lineTotalInr ?? NaN);
      if (Number.isFinite(lineTotal)) return sum + lineTotal;
      const unit = Number(l.unitPriceInr ?? 0);
      const qty = Number(l.qty ?? 0);
      return sum + unit * qty;
    }, 0);
  }
  if (Number.isFinite(Number(job.brandInvoiceAmountInr ?? NaN))) return Number(job.brandInvoiceAmountInr);
  return 0;
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

function formatDateOnly(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

const statusPill: Record<string, string> = {
  draft: "bg-slate-50 text-slate-800 ring-slate-300/70",
  photo_pending: "bg-amber-50 text-amber-950 ring-amber-300/70",
  at_store: "bg-stone-100 text-stone-800 ring-stone-300/70",
  store_self_pending: "bg-stone-100 text-stone-800 ring-stone-300/70",
  in_transit_sc: "bg-sky-50 text-sky-900 ring-sky-300/70",
  received_at_sc: "bg-violet-50 text-violet-900 ring-violet-300/70",
  sent_to_other_ho: "bg-indigo-50 text-indigo-900 ring-indigo-300/70",
  assigned: "bg-indigo-50 text-indigo-900 ring-indigo-300/70",
  estimate_ok: "bg-amber-50 text-amber-950 ring-amber-300/70",
  reestimate_required: "bg-rose-50 text-rose-800 ring-rose-300/70",
  ready_for_outward: "bg-cyan-50 text-cyan-900 ring-cyan-300/70",
  dispatched_to_store: "bg-orange-50 text-orange-950 ring-orange-300/70",
  received_at_store: "bg-emerald-50 text-emerald-900 ring-emerald-300/70",
  closed: "bg-emerald-100 text-emerald-950 ring-emerald-400/70",
  cancelled: "bg-stone-200 text-stone-700 ring-stone-400/70",
};

const statusOptions: Array<{ value: "ALL" | SrfJobStatus; label: string }> = [
  { value: "ALL", label: "All status" },
  { value: "photo_pending", label: "Photo pending" },
  { value: "at_store", label: "Store waiting dispatch" },
  { value: "store_self_pending", label: "In-store repair — pending assign" },
  { value: "sent_to_other_ho", label: "Sent to other HO" },
  { value: "received_at_sc", label: "HO received" },
  { value: "assigned", label: "Assigned to technician" },
  { value: "estimate_ok", label: "Estimate ok" },
  { value: "reestimate_required", label: "Re-estimate pending" },
  { value: "ready_for_outward", label: "Ready for outward" },
  { value: "dispatched_to_store", label: "Store inward pending" },
  { value: "received_at_store", label: "Waiting customer handover" },
  { value: "closed", label: "Closed" },
  { value: "cancelled", label: "Cancelled" },
];

function statusLabel(status: string): string {
  const hit = statusOptions.find((o) => o.value === status);
  return hit?.label ?? status.replace(/_/g, " ");
}

function laneOf(job: SrfJob): "HO" | "STORE" {
  const s = job.status;
  if (
    s === "received_at_sc" ||
    s === "sent_to_other_ho" ||
    s === "assigned" ||
    s === "estimate_ok" ||
    s === "reestimate_required" ||
    s === "sent_to_brand" ||
    s === "brand_estimate_pending" ||
    s === "brand_estimate_customer_pending" ||
    s === "brand_estimate_customer_accepted" ||
    s === "brand_approved" ||
    s === "brand_repair_in_progress" ||
    s === "received_from_brand" ||
    s === "brand_credit_note_pending" ||
    s === "brand_credit_note_active" ||
    s === "ready_for_outward" ||
    s === "in_transit_sc" ||
    s === "awaiting_sc_inward"
  ) {
    return "HO";
  }
  return "STORE";
}

function timelineLabel(job: SrfJob): string {
  if (job.status === "at_store") return "Store waiting to dispatch for repair";
  if (job.status === "sent_to_other_ho") return "Sent to other HO for repair";
  if (job.status === "received_at_sc" || job.status === "assigned" || job.status === "estimate_ok") {
    return "Repair in progress at HO";
  }
  if (
    job.status === "sent_to_brand" ||
    job.status === "brand_estimate_pending" ||
    job.status === "brand_estimate_customer_pending" ||
    job.status === "brand_estimate_customer_accepted" ||
    job.status === "brand_approved" ||
    job.status === "brand_repair_in_progress"
  ) {
    return "With brand service centre";
  }
  if (job.status === "received_from_brand") return "Returned from brand, in HO processing";
  if (job.status === "brand_credit_note_pending" || job.status === "brand_credit_note_active") {
    return "Brand issued coupon / credit note";
  }
  if (job.status === "ready_for_outward") return "Repaired, waiting dispatch";
  if (job.status === "dispatched_to_store") return "Dispatched from HO, waiting store inward";
  if (job.status === "received_at_store") return "Waiting customer handover";
  if (job.status === "closed") return "Delivered to customer";
  if (job.status === "cancelled") return "Cancelled";
  if (job.status === "photo_pending") return "Photo pending";
  return job.status.replace(/_/g, " ");
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
    { at: job.brandSentAt ?? "", label: "Sent to brand" },
    { at: job.completedAtSc ?? "", label: "Repair completed at SC" },
    { at: job.readyForOutwardAt ?? "", label: "Ready for outward" },
    {
      at: job.dispatchedToStoreAt ?? "",
      label: "Dispatched to store",
      detail: job.outwardDcNumber ? `ODC ${job.outwardDcNumber}` : undefined,
    },
    { at: job.receivedBackAtStoreAt ?? "", label: "Received at store" },
    { at: job.closedAt ?? "", label: "SRF closed / delivered" },
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

function IconTrace({ className = "h-[1.125rem] w-[1.125rem]" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
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
      <th className="w-44 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.12em] text-rlx-ink-muted align-top">
        {label}
      </th>
      <td className="px-3 py-2.5 text-sm text-rlx-ink">{value}</td>
    </tr>
  );
}

export function WatchInventoryPage() {
  const { user } = useAuth();
  const { jobs } = useSrfJobs();
  const [searchParams] = useSearchParams();
  const [laneFilter, setLaneFilter] = useState<"ALL" | "HO" | "STORE">("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | SrfJobStatus>("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [traceId, setTraceId] = useState<string | null>(null);

  useEffect(() => {
    const q = searchParams.get("q");
    if (q) setQuery(q);
  }, [searchParams]);

  const isAdminAllData = user?.role === "super_admin" || user?.role === "admin";
  const roleLane: "HO" | "STORE" = (() => {
    if (
      user?.role === "store_user" ||
      user?.role === "store_manager" ||
      user?.role === "store_accounts"
    ) {
      return "STORE";
    }
    return "HO";
  })();
  const effectiveLane = isAdminAllData ? laneFilter : roleLane;

  const visibleJobs = useMemo(() => {
    if (!user) return [];
    return jobs.filter((j) => jobVisibleToStoreUser(j, user) || jobVisibleToServiceCentre(j, user));
  }, [jobs, user]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const from = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null;
    const to = toDate ? new Date(`${toDate}T23:59:59`).getTime() : null;
    return visibleJobs
      .filter((j) => (effectiveLane === "ALL" ? true : laneOf(j) === effectiveLane))
      .filter((j) => (statusFilter === "ALL" ? true : j.status === statusFilter))
      .filter((j) => {
        const ts = new Date(j.createdAt).getTime();
        if (from != null && ts < from) return false;
        if (to != null && ts > to) return false;
        return true;
      })
      .filter((j) => {
        if (!q) return true;
        return (
          j.reference.toLowerCase().includes(q) ||
          j.customerName.toLowerCase().includes(q) ||
          j.phone.toLowerCase().includes(q) ||
          `${j.watchBrand} ${j.watchModel}`.toLowerCase().includes(q) ||
          (j.serial ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [visibleJobs, effectiveLane, statusFilter, fromDate, toDate, query]);

  const totalOpen = visibleJobs.filter((j) => j.status !== "closed" && j.status !== "cancelled").length;
  const openHo = useMemo(
    () =>
      visibleJobs.filter(
        (j) => j.status !== "closed" && j.status !== "cancelled" && laneOf(j) === "HO",
      ).length,
    [visibleJobs],
  );
  const openStore = useMemo(
    () =>
      visibleJobs.filter(
        (j) => j.status !== "closed" && j.status !== "cancelled" && laneOf(j) === "STORE",
      ).length,
    [visibleJobs],
  );

  const detail =
    filteredRows.find((j) => j.id === detailId) ?? visibleJobs.find((j) => j.id === detailId) ?? null;
  const timeline = detail ? buildTimeline(detail) : [];

  function resetFilters() {
    setLaneFilter("ALL");
    setStatusFilter("ALL");
    setFromDate("");
    setToDate("");
    setQuery("");
  }

  return (
    <div className="ui-page-bleed px-3 font-sans text-rlx-ink sm:px-4 md:px-5">
      <ServiceBreadcrumb current="Watch inventory" />
      <PageHeader
        title="Watch inventory (HO + Store)"
        description="Open watches across store and HO lanes — click a row for full details and history."
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="border border-rlx-rule bg-white shadow-sm">
          <div className="border-b-2 border-rlx-gold bg-rlx-green px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white">Open watches</p>
          </div>
          <p className="px-3 py-3 text-lg font-semibold text-rlx-green">{totalOpen}</p>
        </div>
        <div className="border border-rlx-rule bg-white shadow-sm">
          <div className="border-b-2 border-rlx-gold bg-rlx-green px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white">At HO</p>
          </div>
          <p className="px-3 py-3 text-lg font-semibold text-rlx-ink">{openHo}</p>
        </div>
        <div className="border border-rlx-rule bg-white shadow-sm">
          <div className="border-b-2 border-rlx-gold bg-rlx-green px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white">At store</p>
          </div>
          <p className="px-3 py-3 text-lg font-semibold text-rlx-ink">{openStore}</p>
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
          <FilterField label="Search" htmlFor="wi-q" className="ui-filter-span-2-sm min-w-0">
            <input
              id="wi-q"
              className="ui-field"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="SRF, customer, phone, watch, serial…"
            />
          </FilterField>
          <FilterField label="Lane" htmlFor="wi-lane" className="min-w-0">
            <select
              id="wi-lane"
              disabled={!isAdminAllData}
              value={laneFilter}
              onChange={(e) => setLaneFilter(e.target.value as "ALL" | "HO" | "STORE")}
              className="ui-field"
            >
              <option value="ALL">All</option>
              <option value="HO">HO</option>
              <option value="STORE">Store</option>
            </select>
          </FilterField>
          <FilterField label="Status" htmlFor="wi-status" className="min-w-0">
            <select
              id="wi-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "ALL" | SrfJobStatus)}
              className="ui-field"
            >
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="From date" htmlFor="wi-from" className="min-w-0">
            <input
              id="wi-from"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="ui-field"
            />
          </FilterField>
          <FilterField label="To date" htmlFor="wi-to" className="min-w-0">
            <input
              id="wi-to"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="ui-field"
            />
          </FilterField>
        </div>
      </section>

      {filteredRows.length === 0 ? (
        <p className="border border-rlx-rule bg-white px-4 py-8 text-center text-sm text-rlx-ink-muted">
          No watches match the current filters.
        </p>
      ) : (
        <>
          <p className="mb-2 text-xs text-rlx-ink-muted md:hidden">Swipe horizontally to see more columns →</p>
          <div className="ui-table-scroll border border-rlx-rule bg-white shadow-sm">
            <table className="ui-table-dense w-full min-w-[48rem] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-rlx-green text-[11px] font-semibold uppercase tracking-[0.14em] text-white">
                <tr className="border-b-2 border-rlx-gold">
                  <th className="whitespace-nowrap px-3 py-3 text-left font-semibold">SRF</th>
                  <th className="whitespace-nowrap px-3 py-3 text-left font-semibold">Lane</th>
                  <th className="min-w-[10rem] px-3 py-3 text-left font-semibold">Customer</th>
                  <th className="min-w-[10rem] px-3 py-3 text-left font-semibold">Watch</th>
                  <th className="min-w-[10rem] px-3 py-3 text-left font-semibold">Stage</th>
                  <th className="whitespace-nowrap px-3 py-3 text-left font-semibold">Date</th>
                  <th className="whitespace-nowrap px-3 py-3 text-right font-semibold">Amount</th>
                  <th className="whitespace-nowrap px-3 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((j, idx) => {
                  const lane = laneOf(j);
                  return (
                    <tr
                      key={j.id}
                      onClick={() => setDetailId(j.id)}
                      className={`cursor-pointer border-b border-rlx-rule transition-colors hover:bg-rlx-green-light ${
                        idx % 2 === 1 ? "bg-rlx-bg" : "bg-white"
                      }`}
                    >
                      <td className="align-middle px-3 py-3">
                        <span className="block whitespace-nowrap font-mono text-sm font-semibold text-rlx-green">
                          {j.reference}
                        </span>
                        <span
                          className={`mt-1 inline-flex rounded px-2 py-0.5 text-[10px] font-semibold capitalize ring-1 ring-inset ${statusPill[j.status] ?? "bg-stone-100 text-stone-700 ring-stone-300/70"}`}
                        >
                          {statusLabel(j.status)}
                        </span>
                      </td>
                      <td className="align-middle px-3 py-3">
                        <span
                          className={`inline-flex min-w-[4.25rem] items-center justify-center rounded px-2 py-1 text-xs font-semibold ring-1 ring-inset ${
                            lane === "HO"
                              ? "bg-sky-50 text-sky-900 ring-sky-300/70"
                              : "bg-amber-50 text-amber-950 ring-amber-300/70"
                          }`}
                        >
                          {lane}
                        </span>
                      </td>
                      <td className="align-middle px-3 py-3">
                        <span className="block break-words text-sm font-medium leading-snug text-rlx-ink">
                          {j.customerName}
                        </span>
                        <span className="block text-xs leading-snug text-rlx-ink-muted">{j.phone}</span>
                      </td>
                      <td className="align-middle px-3 py-3">
                        <span className="block break-words text-sm leading-snug text-rlx-ink">
                          {j.watchBrand} {j.watchModel}
                        </span>
                        {j.serial ? (
                          <span className="block font-mono text-xs text-rlx-ink-muted">{j.serial}</span>
                        ) : null}
                      </td>
                      <td className="align-middle px-3 py-3">
                        <span className="block break-words text-xs leading-snug text-rlx-ink">{timelineLabel(j)}</span>
                      </td>
                      <td className="align-middle whitespace-nowrap px-3 py-3 text-xs text-rlx-ink-muted">
                        {formatDateOnly(j.createdAt)}
                      </td>
                      <td className="align-middle whitespace-nowrap px-3 py-3 text-right text-sm font-semibold tabular-nums text-rlx-green">
                        {asCurrency(sparesAmount(j))}
                      </td>
                      <td className="align-middle px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-nowrap items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setDetailId(j.id)}
                            className={btnIcon}
                            title="Details"
                            aria-label="Details"
                          >
                            <IconDetails />
                          </button>
                          <button
                            type="button"
                            onClick={() => setTraceId(j.id)}
                            className={btnIcon}
                            title="View trace"
                            aria-label="View trace"
                          >
                            <IconTrace />
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
            {filteredRows.length} of {visibleJobs.length} watch(es)
          </p>
        </>
      )}

      {detail ? (
        <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-rlx-ink/70 p-0 backdrop-blur-sm sm:items-center sm:p-3 md:p-5">
          <div className="flex h-[100dvh] w-full max-w-[96rem] flex-col overflow-hidden bg-white shadow-[0_32px_80px_-20px_rgba(0,0,0,0.5)] sm:h-[min(96dvh,56rem)] sm:max-h-[96dvh]">
            <div className="flex shrink-0 items-center justify-between gap-3 bg-rlx-green px-4 py-3 sm:px-6">
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-semibold uppercase tracking-[0.35em] text-rlx-gold">Watch inventory</p>
                <h3 className="truncate font-mono text-base font-semibold text-white sm:text-lg">{detail.reference}</h3>
                <p className="mt-0.5 truncate text-xs text-white/65 sm:text-sm">
                  {detail.customerName} · {detail.watchBrand} {detail.watchModel} · {laneOf(detail)}
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
                  onClick={() => setTraceId(detail.id)}
                  className={`${modalIconGhost} border-rlx-gold/50 bg-rlx-gold text-rlx-green-deep hover:bg-rlx-gold-dark`}
                  title="View full trace"
                  aria-label="View full trace"
                >
                  <IconTrace />
                </button>
                <button
                  type="button"
                  onClick={() => setDetailId(null)}
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
                      <DetailRow label="Lane" value={laneOf(detail)} />
                      <DetailRow label="Status" value={statusLabel(detail.status)} />
                      <DetailRow label="Stage" value={timelineLabel(detail)} />
                      <DetailRow label="Customer" value={detail.customerName} />
                      <DetailRow label="Phone" value={<span className="font-mono">{detail.phone || "—"}</span>} />
                      <DetailRow label="Watch" value={`${detail.watchBrand} ${detail.watchModel}`.trim()} />
                      <DetailRow label="Serial" value={<span className="font-mono">{detail.serial || "—"}</span>} />
                      <DetailRow label="Region" value={detail.regionName || detail.regionId || "—"} />
                      <DetailRow label="Store" value={detail.storeName || detail.storeId || "—"} />
                      <DetailRow label="Amount" value={asCurrency(sparesAmount(detail))} />
                      <DetailRow label="Inbound DC" value={<span className="font-mono">{detail.dcNumber ?? "—"}</span>} />
                      <DetailRow
                        label="Outward DC"
                        value={<span className="font-mono">{detail.outwardDcNumber ?? "—"}</span>}
                      />
                      <DetailRow label="HO bill ref" value={detail.hoSparesBillRef ?? "—"} />
                      <DetailRow label="Store bill ref" value={detail.storeBillRef ?? "—"} />
                      <DetailRow label="Created" value={formatDateTime(detail.createdAt)} />
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
                            <td className="px-3 py-2.5 align-top text-xs text-rlx-ink-muted">{formatDateTime(ev.at)}</td>
                            <td className="px-3 py-2.5 align-top text-sm font-medium">{ev.label}</td>
                            <td className="break-words px-3 py-2.5 align-top text-sm text-rlx-ink-muted">
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

      {traceId ? <SrfTraceModal srfId={traceId} onClose={() => setTraceId(null)} /> : null}
    </div>
  );
}
