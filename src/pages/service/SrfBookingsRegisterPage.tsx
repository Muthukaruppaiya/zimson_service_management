import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ServiceBreadcrumb } from "../../components/service/ServiceBreadcrumb";
import { SrfTraceModal } from "../../components/service/SrfTraceModal";
import { FilterField } from "../../components/ui/FilterField";
import { useAuth } from "../../context/AuthContext";
import { useSrfJobs } from "../../context/SrfJobsContext";
import { printEstimateDocument, printSrfDocument, srfPrintStoreFromSeed } from "../../lib/serviceDocuments";
import { useRegions } from "../../context/RegionsContext";
import { repairRouteLabel } from "../../lib/srfRepairRoute";
import { ESTIMATE_LABEL_APPROX, formatApproxEstimateCurrency } from "../../lib/formatInr";
import {
  ResendSrfTrackingWhatsAppButton,
} from "../../components/service/ResendSrfTrackingWhatsAppButton";
import { uiPageTitleOnDarkClass } from "../../lib/pageTypography";
import { ResendSrfApprovalWhatsAppButton } from "../../components/service/ResendSrfApprovalWhatsAppButton";
import { canResendSrfTrackingWhatsApp, srfTrackingWhatsAppResultMessage } from "../../lib/resendSrfTrackingWhatsApp";
import { canResendSrfApprovalWhatsApp } from "../../lib/srfApprovalWhatsApp";
import {
  jobVisibleToServiceCentre,
  jobVisibleToStoreUser,
  shouldShowInSrfBookingRegister,
} from "../../lib/srfAccess";
import { publicMediaUrl } from "../../lib/mediaUrl";
import type { SrfJob, SrfJobStatus } from "../../types/srfJob";

function canContinueSrfBooking(status: string): boolean {
  return status === "draft" || status === "photo_pending";
}

const btnIcon =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center border transition disabled:cursor-not-allowed disabled:opacity-50";

const btnIconAction = `${btnIcon} border-rlx-gold/60 bg-white text-rlx-green hover:border-rlx-gold hover:bg-rlx-green-light`;
const btnIconMuted = `${btnIcon} border-rlx-rule bg-rlx-bg text-rlx-ink-muted hover:border-rlx-ink-muted/30 hover:bg-white`;
const btnIconWa = `${btnIcon} border-emerald-400/70 bg-emerald-50 text-emerald-800 hover:bg-emerald-100`;
const btnIconDelete = `${btnIcon} border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100`;

const modalIconBtn =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center border transition disabled:cursor-not-allowed disabled:opacity-50";
const modalIconPrimary = `${modalIconBtn} border-rlx-gold/50 bg-rlx-gold text-rlx-green-deep hover:bg-rlx-gold-dark`;
const modalIconGhost = `${modalIconBtn} border-white/30 bg-white/10 text-white hover:bg-white/20`;
const modalIconWa = `${modalIconBtn} border-emerald-300/70 bg-emerald-600 text-white hover:bg-emerald-700`;
const modalIconDanger = `${modalIconBtn} border-rose-300/70 bg-rose-600 text-white hover:bg-rose-700`;

function IconDetails({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
}

function IconContinue({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function IconDelete({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3m-7 0h8" />
    </svg>
  );
}

function IconTrace({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  );
}

function IconWhatsApp({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function IconPrint({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 9V4h12v5M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v6H6v-6z" />
    </svg>
  );
}

function IconEstimate({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function IconClose({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function photoKindLabel(kind?: string): string {
  if (!kind) return "Watch photo";
  return kind.replace(/_/g, " ");
}

const statusCls: Record<string, string> = {
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
  assigned: "bg-indigo-100 text-indigo-950 ring-indigo-300/80",
  estimate_ok: "bg-amber-100 text-amber-950 ring-amber-300/80",
  reestimate_required: "bg-rose-100 text-rose-950 ring-rose-300/80",
  customer_rejected: "bg-rose-200 text-rose-950 ring-rose-400/70",
  inter_ho_reestimate_pending_sender: "bg-indigo-100 text-indigo-950 ring-indigo-300/80",
  inter_ho_reestimate_customer_accepted: "bg-emerald-100 text-emerald-950 ring-emerald-300/80",
  inter_ho_brand_estimate_pending_sender: "bg-indigo-100 text-indigo-950 ring-indigo-300/80",
  inter_ho_brand_estimate_customer_accepted: "bg-emerald-100 text-emerald-950 ring-emerald-300/80",
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
  pending_store_transit: "bg-amber-100 text-amber-950 ring-amber-300/80",
  dispatched_to_store: "bg-orange-100 text-orange-950 ring-orange-300/80",
  awaiting_store_inward: "bg-sky-100 text-sky-950 ring-sky-300/80",
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
  assigned: "Tech assigned",
  estimate_ok: "Estimate OK",
  reestimate_required: "Re-estimate",
  customer_rejected: "Customer rejected",
  inter_ho_reestimate_pending_sender: "Inter-HO re-est.",
  inter_ho_reestimate_customer_accepted: "Inter-HO accepted",
  inter_ho_brand_estimate_pending_sender: "Inter-HO brand est.",
  inter_ho_brand_estimate_customer_accepted: "Inter-HO brand OK",
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
  pending_store_transit: "Pending store transit",
  dispatched_to_store: "To store",
  awaiting_store_inward: "Store inward pending",
  received_at_store: "Received at store",
  closed: "Closed",
  cancelled: "Cancelled",
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

function isDeletableDraftSrf(status: string): boolean {
  return status === "draft";
}

function formatTableDate(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }),
    time: d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
  };
}

export function SrfBookingsRegisterPage() {
  const { user } = useAuth();
  const { jobs, cancelDraftSrf } = useSrfJobs();
  const { regions } = useRegions();
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [status, setStatus] = useState<"ALL" | SrfJobStatus>("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [traceId, setTraceId] = useState<string | null>(null);
  const [whatsappNote, setWhatsappNote] = useState<string | null>(null);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [photoLightbox, setPhotoLightbox] = useState<{ src: string; label: string } | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    const q = searchParams.get("q");
    if (q) setQuery(q);
  }, [searchParams]);

  const visible = useMemo(() => {
    if (!user) return [];
    const scope = jobs.filter((j) => jobVisibleToStoreUser(j, user) || jobVisibleToServiceCentre(j, user));
    return scope.filter(
      (j) => shouldShowInSrfBookingRegister(j, scope) && j.status !== "cancelled",
    );
  }, [jobs, user]);

  const statusOptions = useMemo(
    () => Array.from(new Set(visible.map((j) => j.status))).sort(),
    [visible],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const from = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null;
    const to = toDate ? new Date(`${toDate}T23:59:59`).getTime() : null;
    return visible
      .filter((j) => (status === "ALL" ? true : j.status === status))
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
  }, [visible, query, status, fromDate, toDate]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, currentPage]);

  const detail = rows.find((j) => j.id === detailId) ?? visible.find((j) => j.id === detailId) ?? null;

  useEffect(() => {
    setWhatsappNote(null);
    setPhotoLightbox(null);
  }, [detailId]);

  useEffect(() => {
    if (!photoLightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPhotoLightbox(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photoLightbox]);

  function printStoreForJob(j: SrfJob) {
    const store = regions.flatMap((r) => r.stores).find((s) => s.id === j.storeId);
    return store ? srfPrintStoreFromSeed(store) : undefined;
  }

  async function handleDeleteDraft(job: SrfJob) {
    if (!isDeletableDraftSrf(job.status)) return;
    const ok = window.confirm(
      `Delete draft ${job.reference}?\n\nThis booking will be removed from the register.`,
    );
    if (!ok) return;
    setDeleteError(null);
    setDeleteBusyId(job.id);
    try {
      await cancelDraftSrf(job.id, "Deleted from booking register");
      if (detailId === job.id) setDetailId(null);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Could not delete draft SRF.");
    } finally {
      setDeleteBusyId(null);
    }
  }

  return (
    <div className="ui-page-bleed relative font-sans text-rlx-ink">
      <div className={`min-h-0 bg-rlx-bg ${detail ? "print:hidden" : ""}`}>
        <ServiceBreadcrumb current="SRF booking register" />

        <div className="bg-rlx-green px-4 py-5 md:px-6 md:py-6">
          <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.4em] text-rlx-gold">
            Zimson Service · SRF Register
          </p>
          <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <h1 className={uiPageTitleOnDarkClass}>
                SRF Booking Register
              </h1>
            </div>
            <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
              <Link
                to="/service/srf"
                className="no-underline inline-flex w-full items-center justify-center gap-2 bg-rlx-gold px-3.5 py-2 text-[11px] font-semibold tracking-wide text-rlx-green-deep shadow transition hover:bg-rlx-gold-dark sm:w-auto"
              >
                + New booking
              </Link>
              <Link
                to="/service"
                className="no-underline inline-flex w-full items-center justify-center gap-2 border border-white/30 bg-white/10 px-3.5 py-2 text-[11px] font-semibold tracking-wide text-white backdrop-blur-sm transition hover:bg-white/20 sm:w-auto"
              >
                Service home
              </Link>
            </div>
          </div>
        </div>

        <div className="px-4 py-4 md:px-6 md:py-5">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.28em] text-rlx-ink-muted">
              {rows.length} booking{rows.length === 1 ? "" : "s"} found
            </h2>
          </div>

          <div className="ui-filter-grid mb-4 mt-3">
            <FilterField label="Search" htmlFor="srf-reg-search" className="ui-filter-span-2-sm min-w-0">
              <input
                id="srf-reg-search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                className="ui-field"
                placeholder="SRF ref, customer, phone, watch…"
              />
            </FilterField>
            <FilterField label="Status" htmlFor="srf-reg-status" className="min-w-0">
              <select
                id="srf-reg-status"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as "ALL" | SrfJobStatus);
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
            <FilterField label="From date" htmlFor="srf-reg-from" className="min-w-0">
              <input
                id="srf-reg-from"
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setPage(1);
                }}
                className="ui-field"
              />
            </FilterField>
            <FilterField label="To date" htmlFor="srf-reg-to" className="min-w-0">
              <input
                id="srf-reg-to"
                type="date"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setPage(1);
                }}
                className="ui-field"
              />
            </FilterField>
            <div className="flex min-w-0 items-end">
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setStatus("ALL");
                  setFromDate("");
                  setToDate("");
                  setPage(1);
                }}
                className="ui-btn-secondary"
              >
                Reset
              </button>
            </div>
          </div>

          {deleteError ? (
            <div className="mb-3 border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">{deleteError}</div>
          ) : null}

          {rows.length === 0 ? (
            <div className="border border-rlx-rule bg-white px-5 py-8 text-center">
              <p className="text-xs text-rlx-ink-muted">No bookings match the current filters.</p>
            </div>
          ) : (
            <>
              <p className="mb-2 text-[10px] text-rlx-ink-muted md:hidden">
                Swipe horizontally to see more columns →
              </p>
              <div className="ui-table-scroll border border-rlx-rule bg-white shadow-sm">
                <table className="ui-table-dense w-full min-w-[62rem] table-fixed text-left text-sm">
                  <colgroup>
                    <col className="w-[7.5rem]" />
                    <col className="w-[11.5rem]" />
                    <col className="w-[12.5rem]" />
                    <col className="w-[12rem]" />
                    <col className="w-[11rem]" />
                    <col className="w-[10rem]" />
                    <col className="w-[7rem]" />
                    <col className="w-[9.5rem]" />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-rlx-green text-[11px] font-semibold uppercase tracking-[0.16em] text-white">
                    <tr className="border-b-2 border-rlx-gold">
                      <th className="whitespace-nowrap px-3 py-3 text-left font-semibold">Created</th>
                      <th className="whitespace-nowrap px-3 py-3 text-left font-semibold">SRF</th>
                      <th className="whitespace-nowrap px-3 py-3 text-left font-semibold">Status</th>
                      <th className="px-3 py-3 text-left font-semibold">Customer</th>
                      <th className="col-hide-md px-3 py-3 text-left font-semibold">Watch</th>
                      <th className="col-hide-lg px-3 py-3 text-left font-semibold">Store</th>
                      <th className="whitespace-nowrap px-3 py-3 text-right font-semibold">{ESTIMATE_LABEL_APPROX}</th>
                      <th className="whitespace-nowrap px-3 py-3 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.map((j, idx) => {
                      const created = formatTableDate(j.createdAt);
                      return (
                      <tr
                        key={j.id}
                        onClick={() => setDetailId(j.id)}
                        className={`cursor-pointer border-b border-rlx-rule transition-colors duration-150 hover:bg-rlx-green-light ${
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
                          <span
                            className={`flex h-8 w-full items-center rounded px-2.5 text-left text-xs font-semibold leading-none ring-1 ring-inset ${statusCls[j.status] ?? "bg-stone-100 text-stone-800 ring-stone-300/80"}`}
                            title={statusLabel(j.status)}
                          >
                            <span className="truncate">{statusLabel(j.status)}</span>
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
                        <td
                          className="col-hide-md align-middle px-3 py-3"
                          title={`${j.watchBrand} ${j.watchModel}`}
                        >
                          <span className="block truncate text-sm leading-snug text-rlx-ink">{j.watchBrand}</span>
                          <span className="block truncate text-xs leading-snug text-rlx-ink-muted">{j.watchModel}</span>
                        </td>
                        <td
                          className="col-hide-lg align-middle px-3 py-3"
                          title={j.storeName ?? j.storeId}
                        >
                          <span className="block truncate text-sm leading-snug text-rlx-ink-muted">
                            {j.storeName ?? j.storeId}
                          </span>
                        </td>
                        <td className="align-middle px-3 py-3 text-right">
                          <span className="block whitespace-nowrap text-sm font-semibold tabular-nums text-rlx-green">
                            {formatApproxEstimateCurrency(Number(j.estimateTotalInr ?? 0), {
                              maximumFractionDigits: 0,
                            })}
                          </span>
                        </td>
                        <td className="align-middle px-3 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex flex-nowrap items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDetailId(j.id);
                              }}
                              className={btnIconAction}
                              title="Details"
                              aria-label="Details"
                            >
                              <IconDetails />
                            </button>
                            {canContinueSrfBooking(j.status) ? (
                              <Link
                                to={`/service/srf?continue=${encodeURIComponent(j.id)}`}
                                onClick={(e) => e.stopPropagation()}
                                className={`${btnIconAction} no-underline`}
                                title="Continue booking"
                                aria-label="Continue booking"
                              >
                                <IconContinue />
                              </Link>
                            ) : null}
                            {isDeletableDraftSrf(j.status) ? (
                              <button
                                type="button"
                                disabled={deleteBusyId === j.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleDeleteDraft(j);
                                }}
                                className={btnIconDelete}
                                title="Delete draft"
                                aria-label="Delete draft"
                              >
                                {deleteBusyId === j.id ? (
                                  <span className="text-[10px] font-bold">…</span>
                                ) : (
                                  <IconDelete />
                                )}
                              </button>
                            ) : null}
                            {canResendSrfApprovalWhatsApp(j.status, j.customerReestimateResponse) ? (
                              <span onClick={(e) => e.stopPropagation()} role="presentation">
                                <ResendSrfApprovalWhatsAppButton
                                  srfId={j.id}
                                  phone={j.phone}
                                  label="Resend approval"
                                  busyLabel="…"
                                  title="Resend approval WhatsApp"
                                  className={btnIconWa}
                                >
                                  <IconWhatsApp />
                                </ResendSrfApprovalWhatsAppButton>
                              </span>
                            ) : canResendSrfTrackingWhatsApp(j.status) ? (
                              <span onClick={(e) => e.stopPropagation()} role="presentation">
                                <ResendSrfTrackingWhatsAppButton
                                  srfId={j.id}
                                  phone={j.phone}
                                  label="Resend WhatsApp"
                                  busyLabel="…"
                                  title="Resend tracking WhatsApp"
                                  className={btnIconWa}
                                >
                                  <IconWhatsApp />
                                </ResendSrfTrackingWhatsAppButton>
                              </span>
                            ) : null}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setTraceId(j.id);
                              }}
                              className={btnIconMuted}
                              title="Trace"
                              aria-label="Trace"
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

              <div className="mt-4 flex flex-col gap-2 border-t border-rlx-rule pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-rlx-ink-muted">
                  Page <span className="font-semibold text-rlx-ink">{currentPage}</span> of{" "}
                  <span className="font-semibold text-rlx-ink">{totalPages}</span>
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="border border-rlx-rule bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-rlx-ink transition hover:border-rlx-green hover:text-rlx-green disabled:opacity-35"
                  >
                    ← Prev
                  </button>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="border border-rlx-rule bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-rlx-ink transition hover:border-rlx-green hover:text-rlx-green disabled:opacity-35"
                  >
                    Next →
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {detail ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-rlx-ink/70 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden bg-white shadow-[0_32px_80px_-20px_rgba(0,0,0,0.5)]">
            <div className="sticky top-0 z-20 flex items-center justify-between gap-3 bg-rlx-green px-4 py-2.5 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-semibold uppercase tracking-[0.35em] text-rlx-gold">Booking details</p>
                <h3 className="truncate font-mono text-sm font-semibold text-white sm:text-base">{detail.reference}</h3>
                <p className="mt-0.5 truncate text-[11px] text-white/65">
                  {detail.customerName} · {detail.watchBrand} {detail.watchModel}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    printSrfDocument({
                      reference: detail.reference,
                      customerName: detail.customerName,
                      phone: detail.phone,
                      company: detail.company,
                      watchBrand: detail.watchBrand,
                      watchFamily: detail.watchFamily,
                      watchModel: detail.watchModel,
                      serial: detail.serial,
                      complaint: detail.complaint || "-",
                      estimateTotalInr: Number(detail.estimateTotalInr ?? 0),
                      estimatedFinishDate: detail.estimatedFinishDate ?? null,
                      advanceInr: Number(detail.advanceInr ?? 0),
                      advancePaymentMode: detail.advancePaymentMode,
                      advancePaymentDetails: detail.advancePaymentDetails ?? null,
                      bookingDate: detail.createdAt,
                      repairRoute: detail.repairRoute,
                      natureOfRepair: detail.repairRoute ? repairRouteLabel(detail.repairRoute) : undefined,
                      modelNumber: detail.serial,
                      storeInfo: printStoreForJob(detail),
                    })
                  }
                  className={modalIconPrimary}
                  title="Print SRF"
                  aria-label="Print SRF"
                >
                  <IconPrint />
                </button>
                <button
                  type="button"
                  onClick={() => printEstimateDocument(detail)}
                  className={modalIconGhost}
                  title="Print estimate"
                  aria-label="Print estimate"
                >
                  <IconEstimate />
                </button>
                {canResendSrfApprovalWhatsApp(detail.status, detail.customerReestimateResponse) ? (
                  <ResendSrfApprovalWhatsAppButton
                    srfId={detail.id}
                    phone={detail.phone}
                    label="Resend approval"
                    busyLabel="…"
                    title="Resend approval WhatsApp"
                    className={modalIconWa}
                  >
                    <IconWhatsApp />
                  </ResendSrfApprovalWhatsAppButton>
                ) : canResendSrfTrackingWhatsApp(detail.status) ? (
                  <ResendSrfTrackingWhatsAppButton
                    srfId={detail.id}
                    phone={detail.phone}
                    label="Resend WhatsApp"
                    busyLabel="…"
                    title="Resend tracking WhatsApp"
                    className={modalIconWa}
                    onResult={(r) => setWhatsappNote(srfTrackingWhatsAppResultMessage(r))}
                  >
                    <IconWhatsApp />
                  </ResendSrfTrackingWhatsAppButton>
                ) : null}
                {canContinueSrfBooking(detail.status) ? (
                  <Link
                    to={`/service/srf?continue=${encodeURIComponent(detail.id)}`}
                    className={`${modalIconGhost} no-underline`}
                    title="Continue booking"
                    aria-label="Continue booking"
                  >
                    <IconContinue />
                  </Link>
                ) : null}
                {isDeletableDraftSrf(detail.status) ? (
                  <button
                    type="button"
                    disabled={deleteBusyId === detail.id}
                    onClick={() => void handleDeleteDraft(detail)}
                    className={modalIconDanger}
                    title="Delete draft"
                    aria-label="Delete draft"
                  >
                    {deleteBusyId === detail.id ? (
                      <span className="text-[10px] font-bold">…</span>
                    ) : (
                      <IconDelete />
                    )}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setTraceId(detail.id)}
                  className={modalIconGhost}
                  title="Full trace"
                  aria-label="Full trace"
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

            <div className="flex-1 overflow-y-auto p-4 sm:p-5">
              {whatsappNote ? (
                <div className="mb-3 border-l-4 border-emerald-500 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                  {whatsappNote}
                </div>
              ) : null}

              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-md px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${statusCls[detail.status] ?? "bg-stone-100 text-stone-800 ring-stone-300/80"}`}
                >
                  {statusLabel(detail.status)}
                </span>
                <span className="text-[10px] text-rlx-ink-muted">
                  Created {new Date(detail.createdAt).toLocaleString()}
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <section className="border border-rlx-rule bg-rlx-bg p-2.5">
                  <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-rlx-gold">Customer</p>
                  <table className="w-full text-xs">
                    <tbody>
                      <tr>
                        <td className="py-0.5 pr-2 font-medium text-rlx-ink-muted align-top">Name</td>
                        <td className="py-0.5 text-rlx-ink">{detail.customerName}</td>
                      </tr>
                      <tr>
                        <td className="py-0.5 pr-2 font-medium text-rlx-ink-muted align-top">Phone</td>
                        <td className="py-0.5 font-mono text-rlx-ink">{detail.phone}</td>
                      </tr>
                      {detail.company ? (
                        <tr>
                          <td className="py-0.5 pr-2 font-medium text-rlx-ink-muted align-top">Company</td>
                          <td className="py-0.5 text-rlx-ink">{detail.company}</td>
                        </tr>
                      ) : null}
                      <tr>
                        <td className="py-0.5 pr-2 font-medium text-rlx-ink-muted align-top">Type</td>
                        <td className="py-0.5 text-rlx-ink">{detail.customerKind ?? "B2C"}</td>
                      </tr>
                    </tbody>
                  </table>
                </section>

                <section className="border border-rlx-rule bg-rlx-bg p-2.5">
                  <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-rlx-gold">Watch</p>
                  <table className="w-full text-xs">
                    <tbody>
                      <tr>
                        <td className="py-0.5 pr-2 font-medium text-rlx-ink-muted align-top">Brand</td>
                        <td className="py-0.5 text-rlx-ink">{detail.watchBrand}</td>
                      </tr>
                      <tr>
                        <td className="py-0.5 pr-2 font-medium text-rlx-ink-muted align-top">Model</td>
                        <td className="py-0.5 text-rlx-ink">{detail.watchModel}</td>
                      </tr>
                      <tr>
                        <td className="py-0.5 pr-2 font-medium text-rlx-ink-muted align-top">Serial</td>
                        <td className="py-0.5 font-mono text-rlx-ink">{detail.serial || "—"}</td>
                      </tr>
                    </tbody>
                  </table>
                </section>

                <section className="border border-rlx-rule bg-rlx-bg p-2.5">
                  <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-rlx-gold">Service</p>
                  <table className="w-full text-xs">
                    <tbody>
                      <tr>
                        <td className="py-0.5 pr-2 font-medium text-rlx-ink-muted align-top">Complaint</td>
                        <td className="py-0.5 text-rlx-ink">{detail.complaint || "—"}</td>
                      </tr>
                      <tr>
                        <td className="py-0.5 pr-2 font-medium text-rlx-ink-muted align-top">{ESTIMATE_LABEL_APPROX}</td>
                        <td className="py-0.5 font-semibold text-rlx-green">
                          {formatApproxEstimateCurrency(Number(detail.estimateTotalInr ?? 0))}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-0.5 pr-2 font-medium text-rlx-ink-muted align-top">Advance</td>
                        <td className="py-0.5 text-rlx-ink">
                          {Number(detail.advanceInr ?? 0) > 0
                            ? Number(detail.advanceInr).toLocaleString(undefined, {
                                style: "currency",
                                currency: "INR",
                              })
                            : "—"}
                        </td>
                      </tr>
                      {detail.advancePaymentMode && Number(detail.advanceInr ?? 0) > 0 ? (
                        <tr>
                          <td className="py-0.5 pr-2 font-medium text-rlx-ink-muted align-top">Payment</td>
                          <td className="py-0.5 text-rlx-ink">{detail.advancePaymentMode}</td>
                        </tr>
                      ) : null}
                      <tr>
                        <td className="py-0.5 pr-2 font-medium text-rlx-ink-muted align-top">Est. finish</td>
                        <td className="py-0.5 text-rlx-ink">{detail.estimatedFinishDate ?? "—"}</td>
                      </tr>
                    </tbody>
                  </table>
                </section>

                <section className="border border-rlx-rule bg-rlx-bg p-2.5">
                  <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-rlx-gold">Logistics</p>
                  <table className="w-full text-xs">
                    <tbody>
                      <tr>
                        <td className="py-0.5 pr-2 font-medium text-rlx-ink-muted align-top">Store</td>
                        <td className="py-0.5 text-rlx-ink">{detail.storeName ?? detail.storeId}</td>
                      </tr>
                      <tr>
                        <td className="py-0.5 pr-2 font-medium text-rlx-ink-muted align-top">Inward DC</td>
                        <td className="py-0.5 font-mono text-rlx-ink">{detail.dcNumber ?? "—"}</td>
                      </tr>
                      <tr>
                        <td className="py-0.5 pr-2 font-medium text-rlx-ink-muted align-top">Outward DC</td>
                        <td className="py-0.5 font-mono text-rlx-ink">{detail.outwardDcNumber ?? "—"}</td>
                      </tr>
                      {detail.regionName ? (
                        <tr>
                          <td className="py-0.5 pr-2 font-medium text-rlx-ink-muted align-top">Region</td>
                          <td className="py-0.5 text-rlx-ink">{detail.regionName}</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </section>
              </div>

              {detail.photos && detail.photos.length > 0 ? (
                <section className="mt-3">
                  <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-rlx-gold">
                    Watch photos ({detail.photos.length})
                  </p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                    {detail.photos.map((p) => {
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
                              <>
                                <img
                                  src={src}
                                  alt={label}
                                  loading="lazy"
                                  className="h-full w-full object-cover transition group-hover:scale-[1.03]"
                                  onError={(e) => {
                                    const el = e.currentTarget;
                                    el.style.display = "none";
                                    const fallback = el.nextElementSibling;
                                    if (fallback instanceof HTMLElement) fallback.hidden = false;
                                  }}
                                />
                                <div
                                  hidden
                                  className="absolute inset-0 flex items-center justify-center bg-stone-100 px-2 text-center text-[10px] text-stone-500"
                                >
                                  Preview unavailable
                                </div>
                              </>
                            )}
                            <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/25 group-hover:opacity-100">
                              <span className="rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold text-rlx-green">
                                {isDocument ? "Open" : "Preview"}
                              </span>
                            </span>
                          </div>
                          <p className="border-t border-rlx-rule bg-white px-1 py-1 text-center text-[10px] capitalize text-rlx-ink-muted">
                            {label}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </section>
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
                    <IconClose className="h-4 w-4" />
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

      {traceId ? <SrfTraceModal srfId={traceId} onClose={() => setTraceId(null)} /> : null}
    </div>
  );
}
