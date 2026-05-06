import { useMemo, useState } from "react";
import { ServiceBreadcrumb } from "../../components/service/ServiceBreadcrumb";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useSrfJobs } from "../../context/SrfJobsContext";
import { apiJson } from "../../lib/api";
import { jobVisibleToStoreUser } from "../../lib/srfAccess";
import { printEstimateDocument, printFullSrfDocument } from "../../lib/serviceDocuments";
import type { SrfJob } from "../../types/srfJob";

const rowClass = "border-b border-zimson-100 last:border-0";
const statusClass: Record<string, string> = {
  draft: "bg-slate-100 text-slate-800",
  photo_pending: "bg-amber-50 text-amber-900",
  at_store: "bg-stone-100 text-stone-700",
  in_transit_sc: "bg-blue-100 text-blue-700",
  received_at_sc: "bg-violet-100 text-violet-700",
  assigned: "bg-indigo-100 text-indigo-700",
  estimate_ok: "bg-amber-100 text-amber-700",
  reestimate_required: "bg-rose-100 text-rose-700",
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
  cancelled: "bg-stone-200 text-stone-600 line-through decoration-stone-500",
};

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
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const visibleJobs = useMemo(() => {
    if (!user) return [];
    return jobs.filter((j) => jobVisibleToStoreUser(j, user));
  }, [jobs, user]);

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

  if (!user) return null;

  return (
    <div>
      <ServiceBreadcrumb current="SRF master table" />
      <PageHeader
        title="SRF master table (all data)"
        description="Track complete SRF lifecycle with internal transfer refs and status."
      />

      <Card title="All SRF records" subtitle="Filter by status/date and open details for full timeline">
        <div className="mb-3 grid gap-2 md:grid-cols-5">
          <input
            value={masterQuery}
            onChange={(e) => { setMasterQuery(e.target.value); setPage(1); }}
            className="rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm"
            placeholder="Search SRF / customer / phone / watch"
          />
          <select
            value={masterStatus}
            onChange={(e) => { setMasterStatus(e.target.value); setPage(1); }}
            className="rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm"
          >
            <option value="ALL">All status</option>
            {Array.from(new Set(visibleJobs.map((j) => j.status))).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <input
            type="date"
            value={masterFromDate}
            onChange={(e) => { setMasterFromDate(e.target.value); setPage(1); }}
            className="rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={masterToDate}
            onChange={(e) => { setMasterToDate(e.target.value); setPage(1); }}
            className="rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => {
              setMasterQuery("");
              setMasterStatus("ALL");
              setMasterFromDate("");
              setMasterToDate("");
              setPage(1);
            }}
            className="rounded-xl border border-zimson-300 px-3 py-2 text-sm font-semibold text-zimson-900 hover:bg-zimson-50"
          >
            Reset
          </button>
        </div>
        <div className="overflow-x-auto rounded-xl border border-zimson-200/80">
          <table className="w-full min-w-[1080px] text-left text-sm">
            <thead>
              <tr className="border-b border-zimson-200 bg-zimson-50/80 text-xs uppercase tracking-wide text-stone-600">
                <th className="px-3 py-2">SRF</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Watch</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">DC</th>
                <th className="px-3 py-2">ODC</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((j) => (
                <tr key={j.id} className={`${rowClass} cursor-pointer hover:bg-zimson-50/70`} onClick={() => setDetailJobId(j.id)}>
                  <td className="px-3 py-2 font-mono text-xs font-semibold text-zimson-900">{j.reference}</td>
                  <td className="px-3 py-2">{j.customerName}</td>
                  <td className="px-3 py-2">{j.watchBrand} {j.watchModel}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass[j.status] ?? "bg-stone-100 text-stone-700"}`}>
                      {j.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{j.dcNumber ?? "-"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{j.outwardDcNumber ?? "-"}</td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => setDetailJobId(j.id)}
                      className="rounded-lg border border-zimson-300 bg-white px-2 py-1 text-xs font-semibold text-zimson-900 hover:bg-zimson-50"
                    >
                      Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {masterRows.length > 0 ? (
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

      {detailJobId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white p-6 shadow-xl">
            {(() => {
              const j = masterRows.find((x) => x.id === detailJobId) ?? visibleJobs.find((x) => x.id === detailJobId);
              if (!j) return <p className="text-sm text-stone-600">SRF details not found.</p>;
              const timeline = buildSrfTimeline(j);
              return (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-stone-900">SRF details — {j.reference}</h3>
                      <p className="text-sm text-stone-600">{j.customerName} · {j.watchBrand} {j.watchModel}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => printEstimateDocument(j)}
                        className="rounded-xl border border-zimson-300 bg-zimson-50 px-3 py-1.5 text-sm font-semibold text-zimson-900"
                      >
                        Print estimate
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const out = await apiJson<{ rows: Array<{ id: string; status: string; note: string; changedBy: string | null; changedAt: string }> }>(
                              `/api/service/srf-jobs/${encodeURIComponent(j.id)}/status-history`,
                            );
                            printFullSrfDocument(
                              j,
                              (out.rows ?? []).map((x) => ({
                                id: x.id,
                                status: x.status,
                                note: x.note,
                                changedAt: x.changedAt,
                              })),
                            );
                          } catch {
                            printFullSrfDocument(j, []);
                          }
                        }}
                        className="rounded-xl border border-zimson-300 bg-zimson-50 px-3 py-1.5 text-sm font-semibold text-zimson-900"
                      >
                        Print document
                      </button>
                      <button type="button" onClick={() => setDetailJobId(null)} className="rounded-xl border border-stone-300 px-3 py-1.5 text-sm">
                        Close
                      </button>
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-zimson-200/80">
                    <table className="min-w-full text-left text-sm">
                      <tbody>
                        <tr className="border-b border-zimson-100"><th className="w-52 bg-zimson-50/70 px-3 py-2">Status</th><td className="px-3 py-2">{j.status}</td></tr>
                        <tr className="border-b border-zimson-100"><th className="bg-zimson-50/70 px-3 py-2">DC number</th><td className="px-3 py-2 font-mono">{j.dcNumber ?? "-"}</td></tr>
                        <tr className="border-b border-zimson-100"><th className="bg-zimson-50/70 px-3 py-2">ODC number</th><td className="px-3 py-2 font-mono">{j.outwardDcNumber ?? "-"}</td></tr>
                        <tr className="border-b border-zimson-100"><th className="bg-zimson-50/70 px-3 py-2">Estimate</th><td className="px-3 py-2">INR {Number(j.estimateTotalInr ?? 0).toFixed(2)}</td></tr>
                        <tr><th className="bg-zimson-50/70 px-3 py-2">Store</th><td className="px-3 py-2">{j.storeName ?? j.storeId}</td></tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="rounded-xl border border-zimson-200/80 p-4">
                    <h4 className="mb-2 text-sm font-semibold text-stone-900">Step status</h4>
                    <div className="space-y-2">
                      {timeline.map((s) => (
                        <div key={s.label} className="flex items-center justify-between rounded-lg border border-zimson-100 px-3 py-2 text-sm">
                          <span className={s.done ? "font-medium text-stone-900" : "text-stone-500"}>{s.label}</span>
                          <span className={s.done ? "text-emerald-700" : "text-stone-400"}>
                            {s.done ? (s.at ? new Date(s.at).toLocaleString() : "Done") : "Pending"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {j.photos && j.photos.length > 0 ? (
                    <div className="rounded-xl border border-zimson-200/80 p-4">
                      <h4 className="mb-2 text-sm font-semibold text-stone-900">Uploaded watch photos</h4>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {j.photos.map((p) => (
                          <div key={p.id} className="rounded-lg border border-zimson-200 p-1.5">
                            <img src={`/${p.filePath}`} alt={p.photoKind ?? "watch photo"} className="h-24 w-full rounded object-cover" />
                            <p className="mt-1 text-[11px] capitalize text-stone-600">{p.photoKind ?? "other"}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })()}
          </div>
        </div>
      ) : null}
    </div>
  );
}
