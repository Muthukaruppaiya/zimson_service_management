import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ListPageShell } from "../../components/layout/ListPageShell";
import { FilterField } from "../../components/ui/FilterField";
import { DataPagination } from "../../components/ui/DataPagination";
import { useAuth } from "../../context/AuthContext";
import { useSrfJobs } from "../../context/SrfJobsContext";
import { apiJson } from "../../lib/api";
import { jobVisibleToStoreUser } from "../../lib/srfAccess";
import { btnTableAction, statusPillBase } from "../../lib/listPageStyles";
import { printEstimateDocument, printFullSrfDocument } from "../../lib/serviceDocuments";
import type { SrfJob } from "../../types/srfJob";

const statusClass: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  photo_pending: "bg-amber-50 text-amber-900",
  at_store: "bg-stone-100 text-stone-700",
  in_transit_sc: "bg-blue-100 text-blue-700",
  received_at_sc: "bg-violet-100 text-violet-700",
  assigned: "bg-indigo-100 text-indigo-700",
  estimate_ok: "bg-amber-100 text-amber-700",
  reestimate_required: "bg-rose-100 text-rose-700",
  sent_to_brand: "bg-violet-100 text-violet-700",
  brand_outward_pending: "bg-violet-100 text-violet-700",
  brand_dispatch_pending: "bg-indigo-100 text-indigo-700",
  brand_estimate_pending: "bg-violet-100 text-violet-700",
  brand_estimate_customer_pending: "bg-amber-100 text-amber-800",
  brand_estimate_customer_accepted: "bg-emerald-100 text-emerald-800",
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

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
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
            <p className="mb-2 text-[10px] text-rlx-ink-muted md:hidden">Swipe horizontally to see more columns →</p>
            <div className="ui-table-scroll border border-rlx-rule bg-white shadow-sm">
              <table className="ui-table-dense w-full min-w-[52rem] text-left">
                <thead className="sticky top-0 z-10 bg-rlx-green text-[9px] font-semibold uppercase tracking-[0.2em] text-white">
                  <tr>
                    <th className="whitespace-nowrap font-medium">Created</th>
                    <th className="whitespace-nowrap font-medium">SRF</th>
                    <th className="font-medium">Customer</th>
                    <th className="col-hide-md font-medium">Watch</th>
                    <th className="whitespace-nowrap font-medium">Status</th>
                    <th className="col-hide-lg font-medium">DC</th>
                    <th className="col-hide-lg font-medium">ODC</th>
                    <th className="font-medium">Actions</th>
                  </tr>
                  <tr aria-hidden>
                    <td colSpan={8} className="h-[2px] bg-rlx-gold p-0" />
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((j, idx) => (
                    <tr
                      key={j.id}
                      onClick={() => setDetailJobId(j.id)}
                      className={`cursor-pointer border-b border-rlx-rule transition-colors hover:bg-rlx-green-light ${
                        idx % 2 === 1 ? "bg-rlx-bg" : "bg-white"
                      }`}
                    >
                      <td className="whitespace-nowrap text-rlx-ink-muted">
                        {new Date(j.createdAt).toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap font-mono text-[11px] font-semibold text-rlx-green">
                        {j.reference}
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
                      <td className="whitespace-nowrap">
                        <span className={`${statusPillBase} ${statusClass[j.status] ?? "bg-stone-100 text-stone-700"}`}>
                          {statusLabel(j.status)}
                        </span>
                      </td>
                      <td className="col-hide-lg whitespace-nowrap font-mono text-[10px] text-rlx-ink-muted">
                        {j.dcNumber ?? "—"}
                      </td>
                      <td className="col-hide-lg whitespace-nowrap font-mono text-[10px] text-rlx-ink-muted">
                        {j.outwardDcNumber ?? "—"}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <button type="button" onClick={() => setDetailJobId(j.id)} className={btnTableAction}>
                          Details
                        </button>
                      </td>
                    </tr>
                  ))}
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
            <div className="sticky top-0 z-20 flex flex-col gap-2 bg-rlx-green px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="min-w-0">
                <p className="text-[9px] font-semibold uppercase tracking-[0.45em] text-rlx-gold">SRF details</p>
                <h3 className="truncate font-mono text-base font-semibold text-white">{detailJob.reference}</h3>
                <p className="mt-0.5 truncate text-[11px] text-white/65">
                  {detailJob.customerName} · {detailJob.watchBrand} {detailJob.watchModel}
                </p>
              </div>
              <div className="flex flex-wrap items-stretch gap-1.5 sm:items-center">
                <button
                  type="button"
                  onClick={() => printEstimateDocument(detailJob)}
                  className="flex-1 bg-rlx-gold px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-rlx-green-deep transition hover:bg-rlx-gold-dark sm:flex-none"
                >
                  Print estimate
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
                  className="flex-1 border border-white/30 bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-white transition hover:bg-white/20 sm:flex-none"
                >
                  Print document
                </button>
                <button
                  type="button"
                  onClick={() => setDetailJobId(null)}
                  className="w-full border border-white/20 px-3 py-1.5 text-[10px] font-semibold text-white/80 transition hover:bg-white/10 sm:w-auto"
                >
                  ✕ Close
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5">
              <div className="overflow-x-auto border border-rlx-rule">
                <table className="ui-table-dense min-w-full text-left">
                  <tbody>
                    <tr className="border-b border-rlx-rule bg-white">
                      <th className="w-40 px-3 py-2 text-left text-[9px] font-semibold uppercase tracking-[0.15em] text-rlx-ink-muted">
                        Status
                      </th>
                      <td className="px-3 py-2 text-rlx-ink">{statusLabel(detailJob.status)}</td>
                    </tr>
                    <tr className="border-b border-rlx-rule bg-rlx-bg">
                      <th className="px-3 py-2 text-left text-[9px] font-semibold uppercase tracking-[0.15em] text-rlx-ink-muted">
                        DC number
                      </th>
                      <td className="px-3 py-2 font-mono text-rlx-ink">{detailJob.dcNumber ?? "—"}</td>
                    </tr>
                    <tr className="border-b border-rlx-rule bg-white">
                      <th className="px-3 py-2 text-left text-[9px] font-semibold uppercase tracking-[0.15em] text-rlx-ink-muted">
                        ODC number
                      </th>
                      <td className="px-3 py-2 font-mono text-rlx-ink">{detailJob.outwardDcNumber ?? "—"}</td>
                    </tr>
                    <tr className="border-b border-rlx-rule bg-rlx-bg">
                      <th className="px-3 py-2 text-left text-[9px] font-semibold uppercase tracking-[0.15em] text-rlx-ink-muted">
                        Estimate
                      </th>
                      <td className="px-3 py-2 font-semibold text-rlx-green">
                        {Number(detailJob.estimateTotalInr ?? 0).toLocaleString(undefined, {
                          style: "currency",
                          currency: "INR",
                        })}
                      </td>
                    </tr>
                    <tr className="bg-white">
                      <th className="px-3 py-2 text-left text-[9px] font-semibold uppercase tracking-[0.15em] text-rlx-ink-muted">
                        Store
                      </th>
                      <td className="px-3 py-2 text-rlx-ink">{detailJob.storeName ?? detailJob.storeId}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="mt-4 border border-rlx-rule bg-rlx-bg p-3">
                <h4 className="mb-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-rlx-gold">Step status</h4>
                <div className="space-y-1.5">
                  {buildSrfTimeline(detailJob).map((s) => (
                    <div
                      key={s.label}
                      className="flex items-center justify-between border border-rlx-rule bg-white px-2.5 py-1.5 text-xs"
                    >
                      <span className={s.done ? "font-medium text-rlx-ink" : "text-rlx-ink-muted"}>{s.label}</span>
                      <span className={s.done ? "text-[10px] text-emerald-700" : "text-[10px] text-rlx-ink-muted"}>
                        {s.done ? (s.at ? new Date(s.at).toLocaleString() : "Done") : "Pending"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {detailJob.photos && detailJob.photos.length > 0 ? (
                <div className="mt-4 border border-rlx-rule bg-white p-3">
                  <h4 className="mb-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-rlx-gold">
                    Watch photos ({detailJob.photos.length})
                  </h4>
                  <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
                    {detailJob.photos.map((p) => (
                      <div key={p.id} className="overflow-hidden border border-rlx-rule">
                        <img
                          src={`/${p.filePath}`}
                          alt={p.photoKind ?? "watch"}
                          className="aspect-[4/3] w-full object-cover"
                        />
                        <p className="border-t border-rlx-rule bg-rlx-bg px-1 py-0.5 text-center text-[9px] capitalize text-rlx-ink-muted">
                          {p.photoKind ?? "other"}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
