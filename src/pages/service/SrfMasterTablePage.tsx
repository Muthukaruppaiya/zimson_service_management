import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ListPageShell } from "../../components/layout/ListPageShell";
import { FilterField } from "../../components/ui/FilterField";
import { DataPagination } from "../../components/ui/DataPagination";
import { useAuth } from "../../context/AuthContext";
import { useSrfJobs } from "../../context/SrfJobsContext";
import { apiJson } from "../../lib/api";
import { jobVisibleToStoreUser } from "../../lib/srfAccess";
import { publicMediaUrl } from "../../lib/mediaUrl";
import { printEstimateDocument, printFullSrfDocument } from "../../lib/serviceDocuments";
import { ESTIMATE_LABEL_APPROX, formatApproxEstimateCurrency } from "../../lib/formatInr";
import type { SrfJob } from "../../types/srfJob";

const btnIcon =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center border transition disabled:cursor-not-allowed disabled:opacity-50";
const btnIconAction = `${btnIcon} border-rlx-gold/60 bg-white text-rlx-green hover:border-rlx-gold hover:bg-rlx-green-light`;
const modalIconBtn =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center border transition disabled:cursor-not-allowed disabled:opacity-50";
const modalIconPrimary = `${modalIconBtn} border-rlx-gold/50 bg-rlx-gold text-rlx-green-deep hover:bg-rlx-gold-dark`;
const modalIconGhost = `${modalIconBtn} border-white/30 bg-white/10 text-white hover:bg-white/20`;

function IconDetails({ className = "h-[1.125rem] w-[1.125rem]" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
}

function IconPrint({ className = "h-[1.125rem] w-[1.125rem]" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 9V4h12v5M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v6H6v-6z" />
    </svg>
  );
}

function IconEstimate({ className = "h-[1.125rem] w-[1.125rem]" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
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

const statusClass: Record<string, string> = {
  draft: "bg-slate-100 text-slate-800 ring-slate-300/80",
  photo_pending: "bg-amber-100 text-amber-950 ring-amber-300/80",
  at_store: "bg-stone-100 text-stone-800 ring-stone-300/80",
  store_self_pending: "bg-teal-100 text-teal-950 ring-teal-300/80",
  store_self_assigned: "bg-teal-100 text-teal-900 ring-teal-300/80",
  store_self_working: "bg-sky-100 text-sky-950 ring-sky-300/80",
  pending_ho_transit: "bg-amber-100 text-amber-950 ring-amber-300/80",
  in_transit_sc: "bg-blue-100 text-blue-900 ring-blue-300/80",
  awaiting_sc_inward: "bg-sky-100 text-sky-950 ring-sky-300/80",
  received_at_sc: "bg-violet-100 text-violet-950 ring-violet-300/80",
  sent_to_other_ho: "bg-indigo-100 text-indigo-950 ring-indigo-300/80",
  pending_store_transit: "bg-amber-100 text-amber-950 ring-amber-300/80",
  awaiting_store_inward: "bg-sky-100 text-sky-950 ring-sky-300/80",
  assigned: "bg-indigo-100 text-indigo-950 ring-indigo-300/80",
  estimate_ok: "bg-amber-100 text-amber-950 ring-amber-300/80",
  reestimate_required: "bg-rose-100 text-rose-950 ring-rose-300/80",
  sent_to_brand: "bg-violet-100 text-violet-950 ring-violet-300/80",
  brand_outward_pending: "bg-violet-100 text-violet-950 ring-violet-300/80",
  brand_dispatch_pending: "bg-indigo-100 text-indigo-950 ring-indigo-300/80",
  brand_estimate_pending: "bg-violet-100 text-violet-950 ring-violet-300/80",
  brand_estimate_customer_pending: "bg-amber-100 text-amber-950 ring-amber-300/80",
  brand_estimate_customer_accepted: "bg-emerald-100 text-emerald-950 ring-emerald-300/80",
  brand_approved: "bg-indigo-100 text-indigo-950 ring-indigo-300/80",
  brand_repair_in_progress: "bg-indigo-100 text-indigo-950 ring-indigo-300/80",
  received_from_brand: "bg-cyan-100 text-cyan-950 ring-cyan-300/80",
  brand_credit_note_pending: "bg-amber-100 text-amber-950 ring-amber-300/80",
  brand_credit_note_active: "bg-emerald-100 text-emerald-950 ring-emerald-300/80",
  ready_for_outward: "bg-cyan-100 text-cyan-950 ring-cyan-300/80",
  dispatched_to_store: "bg-orange-100 text-orange-950 ring-orange-300/80",
  received_at_store: "bg-emerald-100 text-emerald-950 ring-emerald-300/80",
  closed: "bg-emerald-200 text-emerald-950 ring-emerald-400/70",
  cancelled: "bg-stone-200 text-stone-700 ring-stone-300/80",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  photo_pending: "Photo pending",
  at_store: "At store",
  store_self_pending: "In-store repair — pending assign",
  store_self_assigned: "In-store repair — assigned",
  store_self_working: "In-store repair — in progress",
  pending_ho_transit: "Pending HO transit",
  in_transit_sc: "In transit to HO",
  awaiting_sc_inward: "Awaiting HO inward",
  received_at_sc: "Received at HO",
  sent_to_other_ho: "Sent to other HO",
  pending_store_transit: "Pending store transit",
  awaiting_store_inward: "Store inward pending",
  assigned: "Tech assigned",
  estimate_ok: "Estimate OK",
  reestimate_required: "Re-estimate",
  sent_to_brand: "Sent to brand",
  brand_outward_pending: "Brand outward",
  brand_dispatch_pending: "Brand dispatch",
  brand_estimate_pending: "Brand estimate",
  brand_estimate_customer_pending: "Brand est. customer",
  brand_estimate_customer_accepted: "Brand est. accepted",
  brand_approved: "Brand approved",
  brand_repair_in_progress: "Brand repairing",
  received_from_brand: "From brand",
  brand_credit_note_pending: "Brand CN pending",
  brand_credit_note_active: "Brand CN active",
  ready_for_outward: "Ready for outward",
  dispatched_to_store: "To store",
  received_at_store: "Received at store",
  closed: "Closed",
  cancelled: "Cancelled",
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

function formatTableDate(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }),
    time: d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
  };
}

function photoKindLabel(kind?: string): string {
  if (!kind) return "Watch photo";
  return kind.replace(/_/g, " ");
}

function buildSrfTimeline(job: SrfJob): Array<{ label: string; done: boolean; at?: string | null }> {
  return [
    { label: "SRF created", done: true, at: job.createdAt },
    { label: "Store dispatched (Internal transfer)", done: Boolean(job.dcNumber), at: job.dispatchedToScAt },
    { label: "HO inward", done: Boolean(job.inwardAt), at: job.inwardAt },
    { label: "Technician assigned", done: Boolean(job.assignedAt), at: job.assignedAt },
    { label: "Estimate approved", done: Boolean(job.estimateOkAt), at: job.estimateOkAt },
    { label: "Repair complete", done: Boolean(job.completedAtSc), at: job.completedAtSc },
    { label: "Outward from HO (Internal transfer)", done: Boolean(job.outwardDcNumber), at: job.dispatchedToStoreAt },
    { label: "Received at store", done: Boolean(job.receivedBackAtStoreAt), at: job.receivedBackAtStoreAt },
    { label: "Billed & closed", done: Boolean(job.closedAt), at: job.closedAt },
  ];
}

export function SrfMasterTablePage() {
  const { user } = useAuth();
  const { jobs } = useSrfJobs();
  const [detailJobId, setDetailJobId] = useState<string | null>(null);
  const [masterQuery, setMasterQuery] = useState("");
  const [masterStatus, setMasterStatus] = useState<string>("ALL");
  const [masterFromDate, setMasterFromDate] = useState("");
  const [masterToDate, setMasterToDate] = useState("");
  const [photoLightbox, setPhotoLightbox] = useState<{ src: string; label: string } | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const visibleJobs = useMemo(() => {
    if (!user) return [];
    return jobs.filter((j) => jobVisibleToStoreUser(j, user));
  }, [jobs, user]);

  const statusOptions = useMemo(
    () => Array.from(new Set(visibleJobs.map((j) => j.status))).sort(),
    [visibleJobs],
  );

  const masterRows = useMemo(() => {
    const q = masterQuery.trim().toLowerCase();
    const from = masterFromDate ? new Date(`${masterFromDate}T00:00:00`).getTime() : null;
    const to = masterToDate ? new Date(`${masterToDate}T23:59:59`).getTime() : null;
    return visibleJobs
      .filter((j) => (masterStatus === "ALL" ? true : j.status === masterStatus))
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
          `${j.watchBrand} ${j.watchModel}`.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [visibleJobs, masterQuery, masterStatus, masterFromDate, masterToDate]);

  const totalPages = Math.max(1, Math.ceil(masterRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return masterRows.slice(start, start + pageSize);
  }, [masterRows, currentPage]);

  const detailJob =
    masterRows.find((x) => x.id === detailJobId) ?? visibleJobs.find((x) => x.id === detailJobId) ?? null;

  useEffect(() => {
    setPhotoLightbox(null);
  }, [detailJobId]);

  useEffect(() => {
    if (!photoLightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPhotoLightbox(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photoLightbox]);

  if (!user) return null;

  return (
    <>
      <ListPageShell
        breadcrumb="SRF master"
        eyebrow="Zimson Service · SRF Master"
        title="All SRF Records"
        countLabel={`${masterRows.length} record${masterRows.length === 1 ? "" : "s"} found`}
        hideChrome={Boolean(detailJobId)}
        actions={
          <>
            <Link
              to="/service/srf-register"
              className="no-underline inline-flex w-full items-center justify-center gap-2 bg-rlx-gold px-3.5 py-2 text-[11px] font-semibold tracking-wide text-rlx-green-deep shadow transition hover:bg-rlx-gold-dark sm:w-auto"
            >
              Booking list
            </Link>
            <Link
              to="/service"
              className="no-underline inline-flex w-full items-center justify-center gap-2 border border-white/30 bg-white/10 px-3.5 py-2 text-[11px] font-semibold tracking-wide text-white backdrop-blur-sm transition hover:bg-white/20 sm:w-auto"
            >
              Service home
            </Link>
          </>
        }
        isEmpty={masterRows.length === 0}
        emptyMessage="No SRF records match the current filters."
      >
        <div className="ui-filter-grid mb-4 mt-3">
          <FilterField label="Search" htmlFor="srf-master-search" className="ui-filter-span-2-sm min-w-0">
            <input
              id="srf-master-search"
              value={masterQuery}
              onChange={(e) => {
                setMasterQuery(e.target.value);
                setPage(1);
              }}
              className="ui-field"
              placeholder="SRF ref, customer, phone, watch…"
            />
          </FilterField>
          <FilterField label="Status" htmlFor="srf-master-status" className="min-w-0">
            <select
              id="srf-master-status"
              value={masterStatus}
              onChange={(e) => {
                setMasterStatus(e.target.value);
                setPage(1);
              }}
              className="ui-field"
            >
              <option value="ALL">All status</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="From date" htmlFor="srf-master-from" className="min-w-0">
            <input
              id="srf-master-from"
              type="date"
              value={masterFromDate}
              onChange={(e) => {
                setMasterFromDate(e.target.value);
                setPage(1);
              }}
              className="ui-field"
            />
          </FilterField>
          <FilterField label="To date" htmlFor="srf-master-to" className="min-w-0">
            <input
              id="srf-master-to"
              type="date"
              value={masterToDate}
              onChange={(e) => {
                setMasterToDate(e.target.value);
                setPage(1);
              }}
              className="ui-field"
            />
          </FilterField>
          <div className="flex min-w-0 items-end">
            <button
              type="button"
              onClick={() => {
                setMasterQuery("");
                setMasterStatus("ALL");
                setMasterFromDate("");
                setMasterToDate("");
                setPage(1);
              }}
              className="ui-btn-secondary"
            >
              Reset
            </button>
          </div>
        </div>

        {masterRows.length > 0 ? (
          <>
            <p className="mb-2 text-xs text-rlx-ink-muted md:hidden">Swipe horizontally to see more columns →</p>
            <div className="ui-table-scroll border border-rlx-rule bg-white shadow-sm">
              <table className="ui-table-dense w-full min-w-[64rem] table-fixed text-left text-sm">
                <colgroup>
                  <col className="w-[7.5rem]" />
                  <col className="w-[11.5rem]" />
                  <col className="w-[12rem]" />
                  <col className="w-[11rem]" />
                  <col className="w-[12.5rem]" />
                  <col className="w-[8.5rem]" />
                  <col className="w-[8.5rem]" />
                  <col className="w-[5.5rem]" />
                </colgroup>
                <thead className="sticky top-0 z-10 bg-rlx-green text-[11px] font-semibold uppercase tracking-[0.16em] text-white">
                  <tr className="border-b-2 border-rlx-gold">
                    <th className="whitespace-nowrap px-3 py-3 text-left font-semibold">Created</th>
                    <th className="whitespace-nowrap px-3 py-3 text-left font-semibold">SRF</th>
                    <th className="px-3 py-3 text-left font-semibold">Customer</th>
                    <th className="col-hide-md px-3 py-3 text-left font-semibold">Watch</th>
                    <th className="whitespace-nowrap px-3 py-3 text-left font-semibold">Status</th>
                    <th className="col-hide-lg px-3 py-3 text-left font-semibold">DC</th>
                    <th className="col-hide-lg px-3 py-3 text-left font-semibold">ODC</th>
                    <th className="whitespace-nowrap px-3 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((j, idx) => {
                    const created = formatTableDate(j.createdAt);
                    return (
                      <tr
                        key={j.id}
                        onClick={() => setDetailJobId(j.id)}
                        className={`cursor-pointer border-b border-rlx-rule transition-colors hover:bg-rlx-green-light ${
                          idx % 2 === 1 ? "bg-rlx-bg" : "bg-white"
                        }`}
                      >
                        <td className="align-middle px-3 py-3">
                          <span className="block text-sm font-medium leading-snug text-rlx-ink">{created.date}</span>
                          <span className="block text-xs leading-snug text-rlx-ink-muted">{created.time}</span>
                        </td>
                        <td className="align-middle px-3 py-3">
                          <span className="block truncate font-mono text-sm font-semibold text-rlx-green" title={j.reference}>
                            {j.reference}
                          </span>
                        </td>
                        <td className="align-middle px-3 py-3">
                          <span className="block truncate text-sm font-medium leading-snug text-rlx-ink" title={j.customerName}>
                            {j.customerName}
                          </span>
                          <span className="block truncate text-xs leading-snug text-rlx-ink-muted" title={j.phone}>
                            {j.phone}
                          </span>
                        </td>
                        <td className="col-hide-md align-middle px-3 py-3" title={`${j.watchBrand} ${j.watchModel}`}>
                          <span className="block truncate text-sm leading-snug text-rlx-ink">{j.watchBrand}</span>
                          <span className="block truncate text-xs leading-snug text-rlx-ink-muted">{j.watchModel}</span>
                        </td>
                        <td className="align-middle px-3 py-3">
                          <span
                            className={`flex h-8 w-full items-center rounded px-2.5 text-left text-xs font-semibold leading-none ring-1 ring-inset ${statusClass[j.status] ?? "bg-stone-100 text-stone-800 ring-stone-300/80"}`}
                            title={statusLabel(j.status)}
                          >
                            <span className="truncate">{statusLabel(j.status)}</span>
                          </span>
                        </td>
                        <td className="col-hide-lg align-middle px-3 py-3">
                          <span className="block truncate font-mono text-sm text-rlx-ink-muted" title={j.dcNumber ?? undefined}>
                            {j.dcNumber ?? "—"}
                          </span>
                        </td>
                        <td className="col-hide-lg align-middle px-3 py-3">
                          <span
                            className="block truncate font-mono text-sm text-rlx-ink-muted"
                            title={j.outwardDcNumber ?? undefined}
                          >
                            {j.outwardDcNumber ?? "—"}
                          </span>
                        </td>
                        <td className="align-middle px-3 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end">
                            <button
                              type="button"
                              onClick={() => setDetailJobId(j.id)}
                              className={btnIconAction}
                              title="Details"
                              aria-label="Details"
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
            <DataPagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPrev={() => setPage((p) => Math.max(1, p - 1))}
              onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
            />
          </>
        ) : null}
      </ListPageShell>

      {detailJobId && detailJob ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-rlx-ink/70 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden bg-white shadow-[0_32px_80px_-20px_rgba(0,0,0,0.5)]">
            <div className="sticky top-0 z-20 flex items-center justify-between gap-3 bg-rlx-green px-4 py-2.5 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-semibold uppercase tracking-[0.35em] text-rlx-gold">SRF details</p>
                <h3 className="truncate font-mono text-sm font-semibold text-white sm:text-base">{detailJob.reference}</h3>
                <p className="mt-0.5 truncate text-[11px] text-white/65">
                  {detailJob.customerName} · {detailJob.watchBrand} {detailJob.watchModel}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => printEstimateDocument(detailJob)}
                  className={modalIconPrimary}
                  title="Print estimate"
                  aria-label="Print estimate"
                >
                  <IconEstimate />
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const out = await apiJson<{
                        rows: Array<{
                          id: string;
                          status: string;
                          note: string;
                          changedBy: string | null;
                          changedAt: string;
                        }>;
                      }>(`/api/service/srf-jobs/${encodeURIComponent(detailJob.id)}/status-history`);
                      printFullSrfDocument(
                        detailJob,
                        (out.rows ?? []).map((x) => ({
                          id: x.id,
                          status: x.status,
                          note: x.note,
                          changedAt: x.changedAt,
                        })),
                      );
                    } catch {
                      printFullSrfDocument(detailJob, []);
                    }
                  }}
                  className={modalIconGhost}
                  title="Print document"
                  aria-label="Print document"
                >
                  <IconPrint />
                </button>
                <button
                  type="button"
                  onClick={() => setDetailJobId(null)}
                  className={modalIconGhost}
                  title="Close"
                  aria-label="Close"
                >
                  <IconClose />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${statusClass[detailJob.status] ?? "bg-stone-100 text-stone-800 ring-stone-300/80"}`}
                >
                  {statusLabel(detailJob.status)}
                </span>
              </div>
              <div className="overflow-x-auto border border-rlx-rule">
                <table className="ui-table-dense min-w-full text-left text-sm">
                  <tbody>
                    <tr className="border-b border-rlx-rule bg-white">
                      <th className="w-40 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.12em] text-rlx-ink-muted">
                        Status
                      </th>
                      <td className="px-3 py-2.5 text-rlx-ink">{statusLabel(detailJob.status)}</td>
                    </tr>
                    <tr className="border-b border-rlx-rule bg-rlx-bg">
                      <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.12em] text-rlx-ink-muted">
                        DC number
                      </th>
                      <td className="px-3 py-2.5 font-mono text-rlx-ink">{detailJob.dcNumber ?? "—"}</td>
                    </tr>
                    <tr className="border-b border-rlx-rule bg-white">
                      <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.12em] text-rlx-ink-muted">
                        ODC number
                      </th>
                      <td className="px-3 py-2.5 font-mono text-rlx-ink">{detailJob.outwardDcNumber ?? "—"}</td>
                    </tr>
                    <tr className="border-b border-rlx-rule bg-rlx-bg">
                      <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.12em] text-rlx-ink-muted">
                        {ESTIMATE_LABEL_APPROX}
                      </th>
                      <td className="px-3 py-2.5 font-semibold text-rlx-green">
                        {formatApproxEstimateCurrency(Number(detailJob.estimateTotalInr ?? 0))}
                      </td>
                    </tr>
                    <tr className="bg-white">
                      <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.12em] text-rlx-ink-muted">
                        Store
                      </th>
                      <td className="px-3 py-2.5 text-rlx-ink">{detailJob.storeName ?? detailJob.storeId}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="mt-4 border border-rlx-rule bg-rlx-bg p-3">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-rlx-gold">Step status</h4>
                <div className="space-y-1.5">
                  {buildSrfTimeline(detailJob).map((s) => (
                    <div
                      key={s.label}
                      className="flex items-center justify-between border border-rlx-rule bg-white px-2.5 py-2 text-sm"
                    >
                      <span className={s.done ? "font-medium text-rlx-ink" : "text-rlx-ink-muted"}>{s.label}</span>
                      <span className={s.done ? "text-xs text-emerald-700" : "text-xs text-rlx-ink-muted"}>
                        {s.done ? (s.at ? new Date(s.at).toLocaleString() : "Done") : "Pending"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {detailJob.photos && detailJob.photos.length > 0 ? (
                <div className="mt-4 border border-rlx-rule bg-white p-3">
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-rlx-gold">
                    Watch photos ({detailJob.photos.length})
                  </h4>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {detailJob.photos.map((p) => {
                      const src = publicMediaUrl(p.filePath);
                      const label = photoKindLabel(p.photoKind);
                      const isDocument = p.photoKind === "document";
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() =>
                            isDocument
                              ? window.open(src, "_blank", "noopener,noreferrer")
                              : setPhotoLightbox({ src, label })
                          }
                          className="group overflow-hidden border border-rlx-rule bg-white text-left transition hover:border-rlx-gold hover:shadow-sm"
                          title={isDocument ? "View document" : `Preview ${label}`}
                          aria-label={isDocument ? "View document" : `Preview ${label}`}
                        >
                          <div className="relative aspect-[4/3] bg-stone-100">
                            {isDocument ? (
                              <div className="absolute inset-0 flex flex-col items-center justify-center bg-rose-50 text-rose-800">
                                <span className="text-xl font-black">PDF</span>
                                <span className="mt-1 text-[10px] font-semibold">View document</span>
                              </div>
                            ) : (
                              <img
                                src={src}
                                alt={label}
                                loading="lazy"
                                className="h-full w-full object-cover transition group-hover:scale-[1.03]"
                              />
                            )}
                            <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/25 group-hover:opacity-100">
                              <span className="rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold text-rlx-green">
                                {isDocument ? "Open" : "Preview"}
                              </span>
                            </span>
                          </div>
                          <p className="border-t border-rlx-rule bg-rlx-bg px-1 py-1 text-center text-xs capitalize text-rlx-ink-muted">
                            {label}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {photoLightbox ? (
            <div
              className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-3 backdrop-blur-sm sm:p-6"
              role="dialog"
              aria-modal="true"
              aria-label={`Photo preview: ${photoLightbox.label}`}
              onClick={() => setPhotoLightbox(null)}
            >
              <div
                className="relative flex h-full max-h-[96vh] w-full max-w-5xl flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-3 flex items-center justify-between gap-3 text-white">
                  <p className="rounded-full bg-white/10 px-3 py-1 text-sm font-semibold capitalize">
                    {photoLightbox.label}
                  </p>
                  <button
                    type="button"
                    onClick={() => setPhotoLightbox(null)}
                    title="Close preview"
                    aria-label="Close preview"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
                  >
                    <IconClose />
                  </button>
                </div>
                <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
                  <img
                    src={photoLightbox.src}
                    alt={photoLightbox.label}
                    className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
