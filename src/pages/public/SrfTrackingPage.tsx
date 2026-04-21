import { useEffect, useMemo, useState } from "react";
import { apiJson } from "../../lib/api";

type TrackHistory = { id: string; status: string; note: string; changedAt: string };
type TrackJob = {
  id: string;
  reference: string;
  customerName: string;
  phone: string;
  watchBrand: string;
  watchModel: string;
  serial: string;
  status: string;
  complaint: string;
  estimateTotalInr: number;
  reestimateRequestedNote: string | null;
  customerReestimateResponse: "accepted" | "rejected" | null;
  photos?: Array<{ id: string; photoKind?: string; filePath: string }>;
  timeline: TrackHistory[];
};

const statusClass: Record<string, string> = {
  draft: "bg-amber-100 text-amber-800",
  photo_pending: "bg-amber-100 text-amber-800",
  at_store: "bg-blue-100 text-blue-800",
  in_transit_sc: "bg-violet-100 text-violet-800",
  received_at_sc: "bg-violet-100 text-violet-800",
  assigned: "bg-indigo-100 text-indigo-800",
  estimate_ok: "bg-cyan-100 text-cyan-800",
  reestimate_required: "bg-rose-100 text-rose-800",
  customer_rejected: "bg-red-100 text-red-800",
  ready_for_outward: "bg-lime-100 text-lime-800",
  dispatched_to_store: "bg-orange-100 text-orange-800",
  received_at_store: "bg-emerald-100 text-emerald-800",
  closed: "bg-stone-200 text-stone-800",
};

export function SrfTrackingPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const token = params.get("t")?.trim() ?? "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [disabled, setDisabled] = useState(false);
  const [customer, setCustomer] = useState<{ name: string; phone: string } | null>(null);
  const [jobs, setJobs] = useState<TrackJob[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    if (!token) {
      setError("Invalid tracking URL.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const out = await apiJson<{ disabled: boolean; customer: { name: string; phone: string } | null; jobs: TrackJob[] }>(
        `/api/public/srf-track?t=${encodeURIComponent(token)}`,
      );
      setDisabled(Boolean(out.disabled));
      setCustomer(out.customer ?? null);
      setJobs(out.jobs ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load tracking details.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function respond(jobId: string, accepted: boolean) {
    setBusyId(jobId);
    setError(null);
    try {
      await apiJson("/api/public/srf-track/reestimate-response", {
        method: "POST",
        json: { token, srfId: jobId, accepted },
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit response.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen bg-zimson-50/40 px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-2xl border border-zimson-200 bg-white p-5 shadow-sm">
          <h1 className="text-2xl font-bold text-zimson-900">Watch Service Tracking</h1>
          <p className="mt-1 text-sm text-stone-600">Track SRF progress and respond to re-estimate requests.</p>
          {customer ? <p className="mt-2 text-sm text-stone-700">{customer.name} · {customer.phone}</p> : null}
        </div>

        {loading ? <div className="mt-6 text-sm text-stone-600">Loading tracking details...</div> : null}
        {error ? <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {!loading && disabled ? (
          <div className="mt-6 rounded-xl border border-zimson-300 bg-zimson-100 px-4 py-4 text-sm font-semibold text-zimson-900">
            Service complete - this tracking link has been deactivated.
          </div>
        ) : null}

        {!loading && !disabled ? (
          <div className="mt-6 space-y-4">
            {jobs.map((job) => (
              <div key={job.id} className="rounded-2xl border border-zimson-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-sm font-semibold text-zimson-900">{job.reference}</p>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass[job.status] ?? "bg-stone-100 text-stone-700"}`}>
                    {job.status.replace(/_/g, " ")}
                  </span>
                </div>
                <p className="mt-2 text-sm text-stone-700">{job.watchBrand} {job.watchModel} · {job.serial}</p>
                <p className="mt-1 text-sm text-stone-700">Estimate: INR {Number(job.estimateTotalInr ?? 0).toFixed(2)}</p>
                <p className="mt-1 text-sm text-stone-600">Complaint: {job.complaint || "-"}</p>
                {job.photos && job.photos.length > 0 ? (
                  <div className="mt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Watch photos</p>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {job.photos.map((p) => (
                        <div key={p.id} className="rounded-lg border border-zimson-200 p-1.5">
                          <img src={`/${p.filePath}`} alt={p.photoKind ?? "watch photo"} className="h-20 w-full rounded object-cover" />
                          <p className="mt-1 text-[10px] capitalize text-stone-600">{p.photoKind ?? "other"}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {job.status === "reestimate_required" && !job.customerReestimateResponse ? (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <p className="text-xs font-semibold text-amber-800">Re-estimate approval required</p>
                    <p className="mt-1 text-sm text-stone-700">{job.reestimateRequestedNote || "Supervisor requested your approval."}</p>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        disabled={busyId === job.id}
                        onClick={() => void respond(job.id, true)}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        disabled={busyId === job.id}
                        onClick={() => void respond(job.id, false)}
                        className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Status Timeline</p>
                  <ul className="mt-2 space-y-2">
                    {(job.timeline ?? []).map((h) => (
                      <li key={h.id} className="rounded-lg border border-zimson-100 bg-zimson-50/30 px-3 py-2 text-xs text-stone-700">
                        <span className="font-mono">{new Date(h.changedAt).toLocaleString()}</span> ·{" "}
                        <span className="font-semibold">{h.status.replace(/_/g, " ")}</span>
                        {h.note ? ` - ${h.note}` : ""}
                      </li>
                    ))}
                    {(job.timeline ?? []).length === 0 ? <li className="text-xs text-stone-500">No timeline updates yet.</li> : null}
                  </ul>
                </div>
              </div>
            ))}
            {jobs.length === 0 ? <p className="text-sm text-stone-600">No active SRFs found for this link.</p> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
