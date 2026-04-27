import { useMemo, useState } from "react";
import { ServiceBreadcrumb } from "../../components/service/ServiceBreadcrumb";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useSrfJobs } from "../../context/SrfJobsContext";
import { jobVisibleToServiceCentre, jobVisibleToStoreUser } from "../../lib/srfAccess";
import type { SrfJob, SrfJobStatus } from "../../types/srfJob";

function asCurrency(value: number): string {
  return value.toLocaleString(undefined, { style: "currency", currency: "INR" });
}

const statusPill: Record<string, string> = {
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

const statusOptions: Array<{ value: "ALL" | SrfJobStatus; label: string }> = [
  { value: "ALL", label: "All status" },
  { value: "at_store", label: "Store waiting dispatch" },
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

function laneOf(job: SrfJob): "HO" | "STORE" {
  const s = job.status;
  if (
    s === "received_at_sc" ||
    s === "assigned" ||
    s === "estimate_ok" ||
    s === "reestimate_required" ||
    s === "ready_for_outward" ||
    s === "in_transit_sc"
  ) {
    return "HO";
  }
  return "STORE";
}

function timelineLabel(job: SrfJob): string {
  if (job.status === "at_store") return "Store waiting to dispatch for repair";
  if (job.status === "received_at_sc" || job.status === "assigned" || job.status === "estimate_ok") return "Repair in progress at HO";
  if (job.status === "ready_for_outward") return "Repaired, waiting dispatch";
  if (job.status === "dispatched_to_store") return "Dispatched from HO, waiting store inward";
  if (job.status === "received_at_store") return "Waiting customer handover";
  if (job.status === "closed") return "Delivered to customer";
  if (job.status === "cancelled") return "Cancelled";
  return job.status.replace(/_/g, " ");
}

export function WatchInventoryPage() {
  const { user } = useAuth();
  const { jobs } = useSrfJobs();
  const [laneFilter, setLaneFilter] = useState<"ALL" | "HO" | "STORE">("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | SrfJobStatus>("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [query, setQuery] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);

  const isAdminAllData =
    user?.role === "super_admin" || user?.role === "ho_admin" || user?.role === "regional_admin";
  const roleLane: "HO" | "STORE" = (() => {
    if (
      user?.role === "store_user" ||
      user?.role === "store_purchase_user" ||
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
          `${j.watchBrand} ${j.watchModel}`.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [visibleJobs, effectiveLane, statusFilter, fromDate, toDate, query]);

  const totalOpen = visibleJobs.filter((j) => j.status !== "closed" && j.status !== "cancelled").length;
  const detail = filteredRows.find((j) => j.id === detailId) ?? visibleJobs.find((j) => j.id === detailId) ?? null;

  return (
    <div>
      <ServiceBreadcrumb current="Watch inventory" />
      <PageHeader
        title="Watch inventory (HO + Store)"
        description="Listed register with status, filters, and click-to-open full SRF movement details."
      />

      <Card title={`Open watch count: ${totalOpen}`} subtitle="Closed / cancelled are excluded" className="mb-6">
        <div className="grid gap-3 md:grid-cols-6">
          <label className="text-xs font-semibold uppercase tracking-wide text-stone-600">
            Search
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm text-stone-900 outline-none focus:ring-2 focus:ring-zimson-400/40"
              placeholder="SRF / customer / phone / watch"
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-stone-600">
            Lane
            <select
              disabled={!isAdminAllData}
              value={laneFilter}
              onChange={(e) => setLaneFilter(e.target.value as "ALL" | "HO" | "STORE")}
              className="mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm text-stone-900 outline-none focus:ring-2 focus:ring-zimson-400/40"
            >
              <option value="ALL">All</option>
              <option value="HO">HO</option>
              <option value="STORE">Store</option>
            </select>
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-stone-600">
            Status
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "ALL" | SrfJobStatus)}
              className="mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm text-stone-900 outline-none focus:ring-2 focus:ring-zimson-400/40"
            >
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-stone-600">
            From date
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm text-stone-900 outline-none focus:ring-2 focus:ring-zimson-400/40"
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-stone-600">
            To date
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm text-stone-900 outline-none focus:ring-2 focus:ring-zimson-400/40"
            />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => {
                setLaneFilter("ALL");
                setStatusFilter("ALL");
                setFromDate("");
                setToDate("");
                setQuery("");
              }}
              className="w-full rounded-xl border border-zimson-300 px-3 py-2 text-sm font-semibold text-zimson-900 hover:bg-zimson-50"
            >
              Reset filters
            </button>
          </div>
        </div>
      </Card>

      <Card title={`Watch inventory list (${filteredRows.length})`} subtitle="Click any row to open complete details">
        {filteredRows.length === 0 ? (
          <p className="text-sm text-stone-600">No records match current filters.</p>
        ) : (
          <div className="max-h-[70vh] overflow-auto rounded-xl border border-zimson-200/80">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 border-b border-zimson-200 bg-zimson-50/95 text-xs font-semibold uppercase tracking-wide text-stone-600">
                <tr>
                  <th className="px-3 py-2">SRF</th>
                  <th className="px-3 py-2">Lane</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Watch</th>
                  <th className="px-3 py-2">Current stage</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2 text-right">Estimate</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((j) => (
                  <tr
                    key={j.id}
                    onClick={() => setDetailId(j.id)}
                    className="cursor-pointer border-b border-zimson-100 hover:bg-zimson-50/70"
                  >
                    <td className="px-3 py-2 font-mono text-xs font-semibold text-zimson-900">{j.reference}</td>
                    <td className="px-3 py-2">{laneOf(j)}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusPill[j.status] ?? "bg-stone-100 text-stone-700"}`}>
                        {j.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {j.customerName}
                      <span className="block text-xs text-stone-500">{j.phone}</span>
                    </td>
                    <td className="px-3 py-2">{j.watchBrand} {j.watchModel}</td>
                    <td className="px-3 py-2 text-xs text-stone-700">{timelineLabel(j)}</td>
                    <td className="px-3 py-2 text-xs text-stone-600">{new Date(j.createdAt).toLocaleDateString()}</td>
                    <td className="px-3 py-2 text-right font-semibold text-stone-900">{asCurrency(Number(j.estimateTotalInr ?? 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {detail ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-stone-900">SRF details — {detail.reference}</h3>
                <p className="text-sm text-stone-600">{detail.customerName} · {detail.watchBrand} {detail.watchModel}</p>
              </div>
              <button
                type="button"
                onClick={() => setDetailId(null)}
                className="rounded-xl border border-stone-300 px-3 py-1.5 text-sm font-semibold text-stone-700"
              >
                Close
              </button>
            </div>
            <div className="overflow-x-auto rounded-xl border border-zimson-200/80">
              <table className="min-w-full text-left text-sm">
                <tbody>
                  <tr className="border-b border-zimson-100"><th className="w-56 bg-zimson-50/70 px-3 py-2">Lane</th><td className="px-3 py-2">{laneOf(detail)}</td></tr>
                  <tr className="border-b border-zimson-100"><th className="bg-zimson-50/70 px-3 py-2">Status</th><td className="px-3 py-2">{detail.status}</td></tr>
                  <tr className="border-b border-zimson-100"><th className="bg-zimson-50/70 px-3 py-2">Stage</th><td className="px-3 py-2">{timelineLabel(detail)}</td></tr>
                  <tr className="border-b border-zimson-100"><th className="bg-zimson-50/70 px-3 py-2">Customer phone</th><td className="px-3 py-2">{detail.phone}</td></tr>
                  <tr className="border-b border-zimson-100"><th className="bg-zimson-50/70 px-3 py-2">Estimate</th><td className="px-3 py-2">{asCurrency(Number(detail.estimateTotalInr ?? 0))}</td></tr>
                  <tr className="border-b border-zimson-100"><th className="bg-zimson-50/70 px-3 py-2">Created</th><td className="px-3 py-2">{new Date(detail.createdAt).toLocaleString()}</td></tr>
                  <tr className="border-b border-zimson-100"><th className="bg-zimson-50/70 px-3 py-2">DC number</th><td className="px-3 py-2 font-mono">{detail.dcNumber ?? "-"}</td></tr>
                  <tr className="border-b border-zimson-100"><th className="bg-zimson-50/70 px-3 py-2">Outward ODC</th><td className="px-3 py-2 font-mono">{detail.outwardDcNumber ?? "-"}</td></tr>
                  <tr className="border-b border-zimson-100"><th className="bg-zimson-50/70 px-3 py-2">HO invoice ref</th><td className="px-3 py-2">{detail.hoSparesBillRef ?? "-"}</td></tr>
                  <tr><th className="bg-zimson-50/70 px-3 py-2">Store invoice ref</th><td className="px-3 py-2">{detail.storeBillRef ?? "-"}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

