import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ServiceBreadcrumb } from "../../components/service/ServiceBreadcrumb";
import { SrfTraceModal } from "../../components/service/SrfTraceModal";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useSrfJobs } from "../../context/SrfJobsContext";
import { printEstimateDocument, printSrfDocument, srfPrintStoreFromSeed } from "../../lib/serviceDocuments";
import { useRegions } from "../../context/RegionsContext";
import { repairRouteLabel } from "../../lib/srfRepairRoute";
import {
  jobVisibleToServiceCentre,
  jobVisibleToStoreUser,
  shouldShowInSrfBookingRegister,
} from "../../lib/srfAccess";
import type { SrfJobStatus } from "../../types/srfJob";

function canContinueSrfBooking(status: string): boolean {
  return status === "draft" || status === "photo_pending";
}

const statusCls: Record<string, string> = {
  draft: "bg-slate-100 text-slate-800",
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

  return (
    <div>
      <ServiceBreadcrumb current="SRF booking register" />
      <PageHeader
        title="SRF booking register"
        description=""
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              to="/service/srf"
              className="inline-flex rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700"
            >
              New booking
            </Link>
            <Link
              to="/service"
              className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
            >
              Service home
            </Link>
          </div>
        }
      />

      <Card title={`Bookings (${rows.length})`} subtitle="Filter by date, status and search">
        <div className="mb-3 grid gap-2 md:grid-cols-5">
              <input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} className="rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm" placeholder="Search SRF / customer / phone / watch" />
          <select value={status} onChange={(e) => { setStatus(e.target.value as "ALL" | SrfJobStatus); setPage(1); }} className="rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm">
            <option value="ALL">All status</option>
            {Array.from(new Set(visible.map((j) => j.status))).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} className="rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm" />
          <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} className="rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm" />
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setStatus("ALL");
              setFromDate("");
              setToDate("");
              setPage(1);
            }}
            className="rounded-xl border border-zimson-300 px-3 py-2 text-sm font-semibold text-zimson-900 hover:bg-zimson-50"
          >
            Reset
          </button>
        </div>
        <div className="max-h-[70vh] overflow-auto rounded-xl border border-zimson-200/80">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 border-b border-zimson-200 bg-zimson-50/95 text-xs font-semibold uppercase tracking-wide text-stone-600">
              <tr>
                <th className="px-3 py-2">SRF</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Watch</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2 text-right">Estimate</th>
                <th className="px-3 py-2 text-right">Trace</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((j) => (
                <tr key={j.id} onClick={() => setDetailId(j.id)} className="cursor-pointer border-b border-zimson-100 hover:bg-zimson-50/60">
                  <td className="px-3 py-2 font-mono text-xs font-semibold text-zimson-900">{j.reference}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusCls[j.status] ?? "bg-stone-100 text-stone-700"}`}>
                      {j.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-3 py-2">{j.customerName}<span className="block text-xs text-stone-500">{j.phone}</span></td>
                  <td className="px-3 py-2">{j.watchBrand} {j.watchModel}</td>
                  <td className="px-3 py-2 text-xs text-stone-600">{new Date(j.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right font-semibold text-stone-900">
                    {Number(j.estimateTotalInr ?? 0).toLocaleString(undefined, { style: "currency", currency: "INR" })}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex flex-col items-end gap-1.5">
                      {canContinueSrfBooking(j.status) ? (
                        <Link
                          to={`/service/srf?continue=${encodeURIComponent(j.id)}`}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded-lg border border-zimson-500 bg-zimson-50 px-2 py-1 text-xs font-semibold text-zimson-900 shadow-sm hover:bg-zimson-100"
                        >
                          Continue booking
                        </Link>
                      ) : null}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setTraceId(j.id);
                        }}
                        className="rounded-lg border border-zimson-300 bg-white px-2 py-1 text-xs font-semibold text-zimson-900 hover:bg-zimson-50"
                      >
                        View trace
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > 0 ? (
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-stone-600">Showing page {currentPage} of {totalPages}</p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-zimson-300 px-3 py-1.5 text-xs font-semibold text-zimson-900 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg border border-zimson-300 px-3 py-1.5 text-xs font-semibold text-zimson-900 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </Card>

      {detail ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            {/* Header */}
            <div className="flex flex-shrink-0 flex-wrap items-start justify-between gap-3 border-b border-zimson-200 bg-zimson-50/60 px-5 py-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-stone-500">Booking details</p>
                <h3 className="mt-0.5 font-mono text-lg font-bold text-zimson-900">{detail.reference}</h3>
                <p className="mt-0.5 text-sm text-stone-600">{detail.customerName} · {detail.watchBrand} {detail.watchModel}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
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
                      storeInfo: (() => {
                        const store = regions.flatMap((r) => r.stores).find((s) => s.id === detail.storeId);
                        return store ? srfPrintStoreFromSeed(store) : undefined;
                      })(),
                    })
                  }
                  className="rounded-lg border border-zimson-300 bg-zimson-50 px-3 py-1.5 text-xs font-semibold text-zimson-900 hover:bg-zimson-100"
                >
                  Print SRF
                </button>
                <button
                  type="button"
                  onClick={() => printEstimateDocument(detail)}
                  className="rounded-lg border border-zimson-300 bg-zimson-50 px-3 py-1.5 text-xs font-semibold text-zimson-900 hover:bg-zimson-100"
                >
                  Print estimate
                </button>
                {canContinueSrfBooking(detail.status) ? (
                  <Link
                    to={`/service/srf?continue=${encodeURIComponent(detail.id)}`}
                    className="rounded-lg border border-zimson-500 bg-zimson-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-zimson-700"
                  >
                    Continue booking
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={() => setTraceId(detail.id)}
                  className="rounded-lg border border-zimson-300 bg-white px-3 py-1.5 text-xs font-semibold text-zimson-900 hover:bg-zimson-50"
                >
                  Full trace
                </button>
                <button type="button" onClick={() => setDetailId(null)} className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50">
                  Close ✕
                </button>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto p-5">
              {/* Status badge */}
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${statusCls[detail.status] ?? "bg-stone-100 text-stone-700"}`}>
                  {detail.status.replace(/_/g, " ")}
                </span>
                <span className="text-xs text-stone-500">Created {new Date(detail.createdAt).toLocaleString()}</span>
              </div>

              {/* Two-column info grid */}
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Customer */}
                <section className="rounded-xl border border-zimson-200 bg-zimson-50/40 p-3">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-stone-500">Customer</p>
                  <table className="w-full text-sm">
                    <tbody>
                      <tr><td className="py-0.5 pr-3 font-medium text-stone-600 align-top">Name</td><td className="py-0.5 text-stone-900">{detail.customerName}</td></tr>
                      <tr><td className="py-0.5 pr-3 font-medium text-stone-600 align-top">Phone</td><td className="py-0.5 font-mono text-stone-900">{detail.phone}</td></tr>
                      {detail.company ? <tr><td className="py-0.5 pr-3 font-medium text-stone-600 align-top">Company</td><td className="py-0.5 text-stone-900">{detail.company}</td></tr> : null}
                      <tr><td className="py-0.5 pr-3 font-medium text-stone-600 align-top">Type</td><td className="py-0.5 text-stone-900">{detail.customerKind ?? "B2C"}</td></tr>
                    </tbody>
                  </table>
                </section>

                {/* Watch */}
                <section className="rounded-xl border border-zimson-200 bg-zimson-50/40 p-3">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-stone-500">Watch</p>
                  <table className="w-full text-sm">
                    <tbody>
                      <tr><td className="py-0.5 pr-3 font-medium text-stone-600 align-top">Brand</td><td className="py-0.5 text-stone-900">{detail.watchBrand}</td></tr>
                      <tr><td className="py-0.5 pr-3 font-medium text-stone-600 align-top">Model</td><td className="py-0.5 text-stone-900">{detail.watchModel}</td></tr>
                      <tr><td className="py-0.5 pr-3 font-medium text-stone-600 align-top">Serial</td><td className="py-0.5 font-mono text-stone-900">{detail.serial || "—"}</td></tr>
                    </tbody>
                  </table>
                </section>

                {/* Service */}
                <section className="rounded-xl border border-zimson-200 bg-zimson-50/40 p-3">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-stone-500">Service</p>
                  <table className="w-full text-sm">
                    <tbody>
                      <tr><td className="py-0.5 pr-3 font-medium text-stone-600 align-top">Complaint</td><td className="py-0.5 text-stone-900">{detail.complaint || "—"}</td></tr>
                      <tr><td className="py-0.5 pr-3 font-medium text-stone-600 align-top">Estimate</td><td className="py-0.5 font-semibold text-zimson-900">{Number(detail.estimateTotalInr ?? 0).toLocaleString(undefined, { style: "currency", currency: "INR" })}</td></tr>
                      <tr><td className="py-0.5 pr-3 font-medium text-stone-600 align-top">Advance</td><td className="py-0.5 font-semibold text-stone-900">{Number(detail.advanceInr ?? 0) > 0 ? Number(detail.advanceInr).toLocaleString(undefined, { style: "currency", currency: "INR" }) : "—"}</td></tr>
                      {detail.advancePaymentMode && Number(detail.advanceInr ?? 0) > 0 ? <tr><td className="py-0.5 pr-3 font-medium text-stone-600 align-top">Payment mode</td><td className="py-0.5 text-stone-900">{detail.advancePaymentMode}</td></tr> : null}
                      <tr><td className="py-0.5 pr-3 font-medium text-stone-600 align-top">Est. finish</td><td className="py-0.5 text-stone-900">{detail.estimatedFinishDate ?? "—"}</td></tr>
                    </tbody>
                  </table>
                </section>

                {/* Logistics */}
                <section className="rounded-xl border border-zimson-200 bg-zimson-50/40 p-3">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-stone-500">Logistics</p>
                  <table className="w-full text-sm">
                    <tbody>
                      <tr><td className="py-0.5 pr-3 font-medium text-stone-600 align-top">Store</td><td className="py-0.5 text-stone-900">{detail.storeName ?? detail.storeId}</td></tr>
                      <tr><td className="py-0.5 pr-3 font-medium text-stone-600 align-top">Inward DC</td><td className="py-0.5 font-mono text-stone-900">{detail.dcNumber ?? "—"}</td></tr>
                      <tr><td className="py-0.5 pr-3 font-medium text-stone-600 align-top">Outward DC</td><td className="py-0.5 font-mono text-stone-900">{detail.outwardDcNumber ?? "—"}</td></tr>
                      {detail.regionName ? <tr><td className="py-0.5 pr-3 font-medium text-stone-600 align-top">Region</td><td className="py-0.5 text-stone-900">{detail.regionName}</td></tr> : null}
                    </tbody>
                  </table>
                </section>
              </div>

              {/* Photos */}
              {detail.photos && detail.photos.length > 0 ? (
                <section className="mt-4">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-stone-500">Watch photos ({detail.photos.length})</p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {detail.photos.map((p) => (
                      <div key={p.id} className="overflow-hidden rounded-lg border border-zimson-200">
                        <img src={`/${p.filePath}`} alt={p.photoKind ?? "watch"} className="aspect-[4/3] w-full object-cover" />
                        <p className="border-t border-zimson-100 bg-zimson-50/70 px-1.5 py-0.5 text-center text-[10px] capitalize text-stone-600">{p.photoKind ?? "other"}</p>
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

