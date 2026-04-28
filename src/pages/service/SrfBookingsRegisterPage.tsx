import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ServiceBreadcrumb } from "../../components/service/ServiceBreadcrumb";
import { SrfTraceModal } from "../../components/service/SrfTraceModal";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useSrfJobs } from "../../context/SrfJobsContext";
import { jobVisibleToServiceCentre, jobVisibleToStoreUser } from "../../lib/srfAccess";
import type { SrfJobStatus } from "../../types/srfJob";

const statusCls: Record<string, string> = {
  draft: "bg-slate-100 text-slate-800",
  photo_pending: "bg-amber-50 text-amber-900",
  at_store: "bg-stone-100 text-stone-700",
  in_transit_sc: "bg-blue-100 text-blue-700",
  received_at_sc: "bg-violet-100 text-violet-700",
  assigned: "bg-indigo-100 text-indigo-700",
  estimate_ok: "bg-amber-100 text-amber-700",
  reestimate_required: "bg-rose-100 text-rose-700",
  customer_rejected: "bg-rose-200 text-rose-900",
  ready_for_outward: "bg-cyan-100 text-cyan-700",
  dispatched_to_store: "bg-orange-100 text-orange-700",
  received_at_store: "bg-emerald-100 text-emerald-700",
  closed: "bg-emerald-200 text-emerald-900",
  cancelled: "bg-stone-200 text-stone-600",
};

export function SrfBookingsRegisterPage() {
  const { user } = useAuth();
  const { jobs } = useSrfJobs();
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [status, setStatus] = useState<"ALL" | SrfJobStatus>("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [traceId, setTraceId] = useState<string | null>(null);

  useEffect(() => {
    const q = searchParams.get("q");
    if (q) setQuery(q);
  }, [searchParams]);

  const visible = useMemo(() => {
    if (!user) return [];
    return jobs.filter((j) => jobVisibleToStoreUser(j, user) || jobVisibleToServiceCentre(j, user));
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

  const detail = rows.find((j) => j.id === detailId) ?? visible.find((j) => j.id === detailId) ?? null;

  return (
    <div>
      <ServiceBreadcrumb current="SRF booking register" />
      <PageHeader
        title="SRF booking register"
        description="Booking list is separate from New Booking page."
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
          <input value={query} onChange={(e) => setQuery(e.target.value)} className="rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm" placeholder="Search SRF / customer / phone / watch" />
          <select value={status} onChange={(e) => setStatus(e.target.value as "ALL" | SrfJobStatus)} className="rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm">
            <option value="ALL">All status</option>
            {Array.from(new Set(visible.map((j) => j.status))).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm" />
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm" />
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setStatus("ALL");
              setFromDate("");
              setToDate("");
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
              {rows.map((j) => (
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {detail ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-stone-900">Booking details — {detail.reference}</h3>
                <p className="text-sm text-stone-600">{detail.customerName} · {detail.watchBrand} {detail.watchModel}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTraceId(detail.id)}
                  className="rounded-lg border border-zimson-300 bg-white px-3 py-1.5 text-sm font-semibold text-zimson-900 hover:bg-zimson-50"
                >
                  View full trace
                </button>
                <button type="button" onClick={() => setDetailId(null)} className="rounded-lg border px-3 py-1.5 text-sm">
                  Close
                </button>
              </div>
            </div>
            <div className="overflow-x-auto rounded-xl border border-zimson-200/80">
              <table className="min-w-full text-left text-sm">
                <tbody>
                  <tr className="border-b border-zimson-100"><th className="w-56 bg-zimson-50/70 px-3 py-2">Status</th><td className="px-3 py-2">{detail.status}</td></tr>
                  <tr className="border-b border-zimson-100"><th className="bg-zimson-50/70 px-3 py-2">Phone</th><td className="px-3 py-2">{detail.phone}</td></tr>
                  <tr className="border-b border-zimson-100"><th className="bg-zimson-50/70 px-3 py-2">Complaint</th><td className="px-3 py-2">{detail.complaint}</td></tr>
                  <tr className="border-b border-zimson-100"><th className="bg-zimson-50/70 px-3 py-2">DC</th><td className="px-3 py-2 font-mono">{detail.dcNumber ?? "-"}</td></tr>
                  <tr className="border-b border-zimson-100"><th className="bg-zimson-50/70 px-3 py-2">ODC</th><td className="px-3 py-2 font-mono">{detail.outwardDcNumber ?? "-"}</td></tr>
                  <tr><th className="bg-zimson-50/70 px-3 py-2">Estimate</th><td className="px-3 py-2 font-semibold text-zimson-900">{Number(detail.estimateTotalInr ?? 0).toLocaleString(undefined, { style: "currency", currency: "INR" })}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {traceId ? <SrfTraceModal srfId={traceId} onClose={() => setTraceId(null)} /> : null}
    </div>
  );
}

