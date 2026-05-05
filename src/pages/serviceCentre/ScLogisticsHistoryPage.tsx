import { useMemo, useState } from "react";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useRegions } from "../../context/RegionsContext";
import { useSrfJobs } from "../../context/SrfJobsContext";
import { jobVisibleToServiceCentre } from "../../lib/srfAccess";
import type { SrfJob } from "../../types/srfJob";

export function ScLogisticsHistoryPage() {
  const { user } = useAuth();
  const { regions } = useRegions();
  const { jobs } = useSrfJobs();
  const [selectedJob, setSelectedJob] = useState<SrfJob | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "waiting_inward" | "after_inward" | "outward_done">("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const pageSize = 10;

  const storeById = useMemo(() => {
    const m = new Map<string, { regionName: string; storeName: string }>();
    for (const r of regions) {
      for (const s of r.stores) m.set(s.id, { regionName: r.name, storeName: s.name });
    }
    return m;
  }, [regions]);

  const allVisibleJobs = useMemo(() => {
    if (!user) return [];
    return jobs.filter((j) => jobVisibleToServiceCentre(j, user));
  }, [jobs, user]);

  const dcOdcHistoryRows = useMemo(() => {
    return allVisibleJobs
      .filter((j) => !!j.dcNumber || !!j.outwardDcNumber)
      .map((j) => {
        let lifecycle: "waiting_inward" | "after_inward" | "outward_done" = "after_inward";
        if (j.status === "in_transit_sc") lifecycle = "waiting_inward";
        else if (j.outwardDcNumber || j.dispatchedToStoreAt || j.status === "dispatched_to_store") lifecycle = "outward_done";
        return { ...j, lifecycle };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [allVisibleJobs]);

  const filteredRows = useMemo(() => {
    const from = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null;
    const to = toDate ? new Date(`${toDate}T23:59:59`).getTime() : null;
    return dcOdcHistoryRows.filter((j) => {
      if (statusFilter !== "all" && j.lifecycle !== statusFilter) return false;
      const ts = new Date(j.createdAt).getTime();
      if (from != null && ts < from) return false;
      if (to != null && ts > to) return false;
      return true;
    });
  }, [dcOdcHistoryRows, statusFilter, fromDate, toDate]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(historyPage, totalPages);
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage]);

  return (
    <div>
      <PageHeader
        title="DC / ODC history"
        description="Single-page lifecycle view for inward and outward challans."
      />

      <Card title={`DC / ODC history (${filteredRows.length})`}>
        <div className="mb-4 grid gap-2 md:grid-cols-4">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as typeof statusFilter);
              setHistoryPage(1);
            }}
            className="rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm"
          >
            <option value="all">All statuses</option>
            <option value="waiting_inward">Waiting for inward</option>
            <option value="after_inward">After inward</option>
            <option value="outward_done">Outward done</option>
          </select>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setHistoryPage(1);
            }}
            className="rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              setHistoryPage(1);
            }}
            className="rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => {
              setStatusFilter("all");
              setFromDate("");
              setToDate("");
              setHistoryPage(1);
            }}
            className="rounded-xl border border-zimson-300 px-3 py-2 text-sm font-semibold text-zimson-900 hover:bg-zimson-50"
          >
            All / Reset
          </button>
        </div>
        {filteredRows.length === 0 ? (
          <p className="text-sm text-stone-600">No DC/ODC records found.</p>
        ) : (
          <div className="space-y-3">
            <div className="overflow-x-auto rounded-xl border border-zimson-200/80">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-zimson-200 bg-zimson-50/80 text-xs font-semibold uppercase tracking-wide text-stone-600">
                  <tr>
                    <th className="px-3 py-2">Lifecycle status</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">SRF</th>
                    <th className="px-3 py-2">DC</th>
                    <th className="px-3 py-2">ODC</th>
                    <th className="px-3 py-2">Customer</th>
                    <th className="px-3 py-2">Store</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((j) => (
                    <tr
                      key={`history-${j.id}`}
                      onClick={() => setSelectedJob(j)}
                      className="cursor-pointer border-b border-zimson-100 hover:bg-zimson-50/60 last:border-0"
                    >
                      <td className="px-3 py-2">
                        {j.lifecycle === "waiting_inward" ? (
                          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
                            Waiting for inward
                          </span>
                        ) : j.lifecycle === "after_inward" ? (
                          <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-900">
                            After inward
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-900">
                            Outward done
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-stone-600">{new Date(j.createdAt).toLocaleString()}</td>
                      <td className="px-3 py-2 font-mono text-xs font-semibold text-zimson-900">{j.reference}</td>
                      <td className="px-3 py-2 font-mono text-xs text-zimson-900">{j.dcNumber ?? "-"}</td>
                      <td className="px-3 py-2 font-mono text-xs text-zimson-900">{j.outwardDcNumber ?? "-"}</td>
                      <td className="px-3 py-2">{j.customerName}</td>
                      <td className="px-3 py-2 text-xs text-stone-600">{storeById.get(j.storeId)?.storeName ?? j.storeId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-stone-600">
                Showing page {currentPage} of {totalPages}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-zimson-300 px-3 py-1.5 text-xs font-semibold text-zimson-900 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setHistoryPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-lg border border-zimson-300 px-3 py-1.5 text-xs font-semibold text-zimson-900 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </Card>

      {selectedJob ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-stone-900">SRF details - {selectedJob.reference}</h3>
                <p className="text-sm text-stone-600">{new Date(selectedJob.createdAt).toLocaleString()}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedJob(null)}
                className="rounded-lg border px-3 py-1.5 text-sm"
              >
                Close
              </button>
            </div>
            <div className="overflow-x-auto rounded-xl border border-zimson-200/80">
              <table className="min-w-full text-left text-sm">
                <tbody>
                  <tr className="border-b border-zimson-100">
                    <th className="w-56 bg-zimson-50/70 px-3 py-2">Status</th>
                    <td className="px-3 py-2">{selectedJob.status.replace(/_/g, " ")}</td>
                  </tr>
                  <tr className="border-b border-zimson-100">
                    <th className="bg-zimson-50/70 px-3 py-2">Customer</th>
                    <td className="px-3 py-2">{selectedJob.customerName} ({selectedJob.phone})</td>
                  </tr>
                  <tr className="border-b border-zimson-100">
                    <th className="bg-zimson-50/70 px-3 py-2">Watch</th>
                    <td className="px-3 py-2">{selectedJob.watchBrand} {selectedJob.watchModel} · {selectedJob.serial}</td>
                  </tr>
                  <tr className="border-b border-zimson-100">
                    <th className="bg-zimson-50/70 px-3 py-2">DC / ODC</th>
                    <td className="px-3 py-2">DC: {selectedJob.dcNumber ?? "-"} · ODC: {selectedJob.outwardDcNumber ?? "-"}</td>
                  </tr>
                  <tr className="border-b border-zimson-100">
                    <th className="bg-zimson-50/70 px-3 py-2">Region / Store</th>
                    <td className="px-3 py-2">
                      HO: {selectedJob.regionName ?? selectedJob.regionId} · Store: {storeById.get(selectedJob.storeId)?.storeName ?? selectedJob.storeId}
                    </td>
                  </tr>
                  <tr className="border-b border-zimson-100">
                    <th className="bg-zimson-50/70 px-3 py-2">Timeline</th>
                    <td className="px-3 py-2 text-xs text-stone-700">
                      Dispatched to SC: {selectedJob.dispatchedToScAt ? new Date(selectedJob.dispatchedToScAt).toLocaleString() : "-"}<br />
                      SC inward: {selectedJob.inwardAt ? new Date(selectedJob.inwardAt).toLocaleString() : "-"}<br />
                      Dispatched to store: {selectedJob.dispatchedToStoreAt ? new Date(selectedJob.dispatchedToStoreAt).toLocaleString() : "-"}<br />
                      Store inward: {selectedJob.receivedBackAtStoreAt ? new Date(selectedJob.receivedBackAtStoreAt).toLocaleString() : "-"}
                    </td>
                  </tr>
                  <tr>
                    <th className="bg-zimson-50/70 px-3 py-2">Complaint</th>
                    <td className="px-3 py-2">{selectedJob.complaint || "-"}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
