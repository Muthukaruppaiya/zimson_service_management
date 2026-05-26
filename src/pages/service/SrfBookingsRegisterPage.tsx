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
import {
  ResendSrfTrackingWhatsAppButton,
  srfTrackingWhatsAppResultMessage,
} from "../../components/service/ResendSrfTrackingWhatsAppButton";
import { canResendSrfTrackingWhatsApp } from "../../lib/resendSrfTrackingWhatsApp";
import {
  jobVisibleToServiceCentre,
  jobVisibleToStoreUser,
  shouldShowInSrfBookingRegister,
} from "../../lib/srfAccess";
import type { SrfJob, SrfJobStatus } from "../../types/srfJob";

function canContinueSrfBooking(status: string): boolean {
  return status === "draft" || status === "photo_pending";
}

const btnAction =
  "inline-flex items-center justify-center gap-1 border border-rlx-gold/60 bg-white px-2 py-1 " +
  "text-[10px] font-semibold tracking-wide text-rlx-green transition hover:border-rlx-gold hover:bg-rlx-green-light";

const btnActionMuted =
  "inline-flex items-center justify-center gap-1 border border-rlx-rule bg-rlx-bg px-2 py-1 " +
  "text-[10px] font-semibold text-rlx-ink-muted transition hover:border-rlx-ink-muted/30 hover:bg-white";

const btnActionWa =
  "inline-flex items-center justify-center gap-1 border border-emerald-400/70 bg-emerald-50 px-2 py-1 " +
  "text-[10px] font-semibold text-emerald-900 transition hover:bg-emerald-100 disabled:opacity-50";

const statusCls: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  photo_pending: "bg-amber-50 text-amber-900",
  at_store: "bg-stone-100 text-stone-700",
  store_self_pending: "bg-teal-50 text-teal-900",
  store_self_assigned: "bg-teal-100 text-teal-800",
  store_self_working: "bg-sky-100 text-sky-900",
  in_transit_sc: "bg-blue-100 text-blue-700",
  received_at_sc: "bg-violet-100 text-violet-700",
  sent_to_other_ho: "bg-indigo-100 text-indigo-700",
  assigned: "bg-indigo-100 text-indigo-700",
  estimate_ok: "bg-amber-100 text-amber-700",
  reestimate_required: "bg-rose-100 text-rose-700",
  customer_rejected: "bg-rose-200 text-rose-900",
  sent_to_brand: "bg-violet-100 text-violet-700",
  brand_estimate_pending: "bg-violet-100 text-violet-700",
  brand_approved: "bg-indigo-100 text-indigo-700",
  brand_repair_in_progress: "bg-indigo-100 text-indigo-700",
  received_from_brand: "bg-cyan-100 text-cyan-700",
  brand_credit_note_pending: "bg-amber-100 text-amber-700",
  brand_credit_note_active: "bg-emerald-100 text-emerald-700",
  ready_for_outward: "bg-cyan-100 text-cyan-700",
  dispatched_to_store: "bg-orange-100 text-orange-700",
  received_at_store: "bg-emerald-100 text-emerald-700",
  closed: "bg-emerald-200 text-emerald-900",
  cancelled: "bg-stone-200 text-stone-600",
};

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

export function SrfBookingsRegisterPage() {
  const { user } = useAuth();
  const { jobs } = useSrfJobs();
  const { regions } = useRegions();
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [status, setStatus] = useState<"ALL" | SrfJobStatus>("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [traceId, setTraceId] = useState<string | null>(null);
  const [whatsappNote, setWhatsappNote] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    const q = searchParams.get("q");
    if (q) setQuery(q);
  }, [searchParams]);

  const visible = useMemo(() => {
    if (!user) return [];
    const scope = jobs.filter((j) => jobVisibleToStoreUser(j, user) || jobVisibleToServiceCentre(j, user));
    return scope.filter((j) => shouldShowInSrfBookingRegister(j, scope));
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
  }, [detailId]);

  function printStoreForJob(j: SrfJob) {
    const store = regions.flatMap((r) => r.stores).find((s) => s.id === j.storeId);
    return store ? srfPrintStoreFromSeed(store) : undefined;
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
              <h1 className="font-display text-xl font-light leading-tight tracking-wide text-white md:text-2xl">
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
                <table className="ui-table-dense w-full min-w-[44rem] text-left">
                  <thead className="sticky top-0 z-10 bg-rlx-green text-[9px] font-semibold uppercase tracking-[0.2em] text-white">
                    <tr>
                      <th className="whitespace-nowrap font-medium">Created</th>
                      <th className="whitespace-nowrap font-medium">SRF</th>
                      <th className="whitespace-nowrap font-medium">Status</th>
                      <th className="font-medium">Customer</th>
                      <th className="col-hide-md font-medium">Watch</th>
                      <th className="col-hide-lg font-medium">Store</th>
                      <th className="whitespace-nowrap text-right font-medium">Estimate</th>
                      <th className="whitespace-nowrap font-medium">Actions</th>
                    </tr>
                    <tr aria-hidden>
                      <td colSpan={8} className="h-[2px] bg-rlx-gold p-0" />
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.map((j, idx) => (
                      <tr
                        key={j.id}
                        onClick={() => setDetailId(j.id)}
                        className={`cursor-pointer border-b border-rlx-rule transition-colors duration-150 hover:bg-rlx-green-light ${
                          idx % 2 === 1 ? "bg-rlx-bg" : "bg-white"
                        }`}
                      >
                        <td className="whitespace-nowrap text-rlx-ink-muted">
                          {new Date(j.createdAt).toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap font-mono text-[11px] font-semibold text-rlx-green">
                          {j.reference}
                        </td>
                        <td className="whitespace-nowrap">
                          <span
                            className={`inline-block rounded-full px-1.5 py-0.5 text-[9px] font-semibold capitalize ${statusCls[j.status] ?? "bg-stone-100 text-stone-700"}`}
                          >
                            {statusLabel(j.status)}
                          </span>
                        </td>
                        <td className="max-w-[9rem]">
                          <span className="block truncate font-medium text-rlx-ink" title={j.customerName}>
                            {j.customerName}
                          </span>
                          <span className="block truncate text-[10px] text-rlx-ink-muted">{j.phone}</span>
                        </td>
                        <td
                          className="col-hide-md max-w-[10rem] truncate text-rlx-ink-muted"
                          title={`${j.watchBrand} ${j.watchModel}`}
                        >
                          {j.watchBrand} {j.watchModel}
                        </td>
                        <td
                          className="col-hide-lg max-w-[8rem] truncate text-rlx-ink-muted"
                          title={j.storeName ?? j.storeId}
                        >
                          {j.storeName ?? j.storeId}
                        </td>
                        <td className="whitespace-nowrap text-right text-[11px] font-semibold tabular-nums text-rlx-green">
                          {Number(j.estimateTotalInr ?? 0).toLocaleString(undefined, {
                            style: "currency",
                            currency: "INR",
                          })}
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDetailId(j.id);
                              }}
                              className={btnAction}
                            >
                              Details
                            </button>
                            {canContinueSrfBooking(j.status) ? (
                              <Link
                                to={`/service/srf?continue=${encodeURIComponent(j.id)}`}
                                onClick={(e) => e.stopPropagation()}
                                className={`${btnAction} no-underline`}
                              >
                                Continue
                              </Link>
                            ) : null}
                            {canResendSrfTrackingWhatsApp(j.status) ? (
                              <span onClick={(e) => e.stopPropagation()} role="presentation">
                                <ResendSrfTrackingWhatsAppButton
                                  srfId={j.id}
                                  phone={j.phone}
                                  label="Resend WA"
                                  busyLabel="…"
                                  className={btnActionWa}
                                />
                              </span>
                            ) : null}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setTraceId(j.id);
                              }}
                              className={btnActionMuted}
                            >
                              Trace
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-col gap-2 border-t border-rlx-rule pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[11px] text-rlx-ink-muted">
                  Page <span className="font-semibold text-rlx-ink">{currentPage}</span> of{" "}
                  <span className="font-semibold text-rlx-ink">{totalPages}</span>
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="border border-rlx-rule bg-white px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-rlx-ink transition hover:border-rlx-green hover:text-rlx-green disabled:opacity-35"
                  >
                    ← Prev
                  </button>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="border border-rlx-rule bg-white px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-rlx-ink transition hover:border-rlx-green hover:text-rlx-green disabled:opacity-35"
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
            <div className="sticky top-0 z-20 flex flex-col gap-2 bg-rlx-green px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="min-w-0">
                <p className="text-[9px] font-semibold uppercase tracking-[0.45em] text-rlx-gold">Booking details</p>
                <h3 className="truncate font-mono text-base font-semibold text-white sm:text-lg">{detail.reference}</h3>
                <p className="mt-0.5 truncate text-[11px] text-white/65">
                  {detail.customerName} · {detail.watchBrand} {detail.watchModel}
                </p>
              </div>
              <div className="flex flex-wrap items-stretch gap-1.5 sm:items-center">
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
                  className="flex-1 bg-rlx-gold px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-rlx-green-deep transition hover:bg-rlx-gold-dark sm:flex-none"
                >
                  Print SRF
                </button>
                <button
                  type="button"
                  onClick={() => printEstimateDocument(detail)}
                  className="flex-1 border border-white/30 bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-white transition hover:bg-white/20 sm:flex-none"
                >
                  Print estimate
                </button>
                {canResendSrfTrackingWhatsApp(detail.status) ? (
                  <ResendSrfTrackingWhatsAppButton
                    srfId={detail.id}
                    phone={detail.phone}
                    label="Resend WA"
                    busyLabel="…"
                    className="flex-1 border border-emerald-300/80 bg-emerald-600 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-white transition hover:bg-emerald-700 disabled:opacity-50 sm:flex-none"
                    onResult={(r) => setWhatsappNote(srfTrackingWhatsAppResultMessage(r))}
                  />
                ) : null}
                {canContinueSrfBooking(detail.status) ? (
                  <Link
                    to={`/service/srf?continue=${encodeURIComponent(detail.id)}`}
                    className="no-underline flex-1 border border-white/40 bg-white/15 px-3 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-white transition hover:bg-white/25 sm:flex-none"
                  >
                    Continue
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={() => setTraceId(detail.id)}
                  className="flex-1 border border-white/30 bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-white transition hover:bg-white/20 sm:flex-none"
                >
                  Full trace
                </button>
                <button
                  type="button"
                  onClick={() => setDetailId(null)}
                  className="w-full border border-white/20 px-3 py-1.5 text-[10px] font-semibold text-white/80 transition hover:bg-white/10 sm:w-auto"
                >
                  ✕ Close
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
                  className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${statusCls[detail.status] ?? "bg-stone-100 text-stone-700"}`}
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
                        <td className="py-0.5 pr-2 font-medium text-rlx-ink-muted align-top">Estimate</td>
                        <td className="py-0.5 font-semibold text-rlx-green">
                          {Number(detail.estimateTotalInr ?? 0).toLocaleString(undefined, {
                            style: "currency",
                            currency: "INR",
                          })}
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
                  <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                    {detail.photos.map((p) => (
                      <div key={p.id} className="overflow-hidden border border-rlx-rule">
                        <img
                          src={`/${p.filePath}`}
                          alt={p.photoKind ?? "watch"}
                          className="aspect-[4/3] w-full object-cover"
                        />
                        <p className="border-t border-rlx-rule bg-white px-1 py-0.5 text-center text-[9px] capitalize text-rlx-ink-muted">
                          {p.photoKind ?? "other"}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {traceId ? <SrfTraceModal srfId={traceId} onClose={() => setTraceId(null)} /> : null}
    </div>
  );
}
