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
  reestimateRequestedInr?: number | null;
  customerReestimateResponse: "accepted" | "rejected" | null;
  customerReestimateRespondedAt?: string | null;
  brandCouponCode?: string | null;
  brandCouponValueInr?: number | null;
  brandCouponReceivedAt?: string | null;
  brandCouponValidUntil?: string | null;
  customerCouponNotifiedAt?: string | null;
  reestimateHistory?: Array<{ amountInr: number | null; note: string; requestedAt: string }>;
  photos?: Array<{ id: string; photoKind?: string; filePath: string }>;
  timeline: TrackHistory[];
};

const statusClass: Record<string, string> = {
  draft: "bg-amber-100 text-amber-800",
  photo_pending: "bg-amber-100 text-amber-800",
  at_store: "bg-blue-100 text-blue-800",
  in_transit_sc: "bg-violet-100 text-violet-800",
  received_at_sc: "bg-violet-100 text-violet-800",
  sent_to_other_ho: "bg-indigo-100 text-indigo-800",
  assigned: "bg-indigo-100 text-indigo-800",
  estimate_ok: "bg-cyan-100 text-cyan-800",
  reestimate_required: "bg-rose-100 text-rose-800",
  customer_rejected: "bg-red-100 text-red-800",
  sent_to_brand: "bg-violet-100 text-violet-800",
  brand_estimate_pending: "bg-violet-100 text-violet-800",
  brand_approved: "bg-indigo-100 text-indigo-800",
  brand_repair_in_progress: "bg-indigo-100 text-indigo-800",
  received_from_brand: "bg-cyan-100 text-cyan-800",
  brand_credit_note_pending: "bg-amber-100 text-amber-800",
  brand_credit_note_active: "bg-emerald-100 text-emerald-800",
  ready_for_outward: "bg-lime-100 text-lime-800",
  dispatched_to_store: "bg-orange-100 text-orange-800",
  received_at_store: "bg-emerald-100 text-emerald-800",
  closed: "bg-stone-200 text-stone-800",
};

function customerStatusLabel(status: string, hasPendingReestimate: boolean): string {
  if (hasPendingReestimate) return "Approval required";
  if (status === "draft" || status === "photo_pending" || status === "at_store") return "Booking confirmed";
  if (status === "in_transit_sc" || status === "received_at_sc") return "In service movement";
  if (status === "sent_to_other_ho") return "Sent to other HO for repair";
  if (status === "assigned" || status === "estimate_ok" || status === "reestimate_required") return "Under repair";
  if (status === "sent_to_brand" || status === "brand_estimate_pending" || status === "brand_approved" || status === "brand_repair_in_progress") return "With brand service";
  if (status === "received_from_brand") return "Returned from brand";
  if (status === "brand_credit_note_pending" || status === "brand_credit_note_active") return "Brand credit note issued";
  if (status === "customer_rejected") return "Awaiting confirmation";
  if (status === "ready_for_outward" || status === "dispatched_to_store") return "Ready for return";
  if (status === "received_at_store") return "Ready for delivery";
  if (status === "closed") return "Delivered";
  return "In progress";
}

const flow = [
  { id: "booked", label: "Service booked" },
  { id: "sent", label: "Watch moved for repair" },
  { id: "repair", label: "Repair in progress" },
  { id: "ready", label: "Ready for delivery" },
] as const;

function flowIndex(status: string): number {
  if (status === "draft" || status === "photo_pending" || status === "at_store") return 0;
  if (status === "in_transit_sc" || status === "received_at_sc" || status === "sent_to_other_ho") return 1;
  if (
    status === "assigned" ||
    status === "estimate_ok" ||
    status === "reestimate_required" ||
    status === "customer_rejected" ||
    status === "sent_to_brand" ||
    status === "brand_estimate_pending" ||
    status === "brand_approved" ||
    status === "brand_repair_in_progress" ||
    status === "received_from_brand" ||
    status === "brand_credit_note_pending" ||
    status === "brand_credit_note_active"
  ) {
    return 2;
  }
  return 3;
}

function buildCouponMessage(job: TrackJob): string {
  const coupon = job.brandCouponCode ?? "-";
  const value = Number(job.brandCouponValueInr ?? 0).toFixed(2);
  const validity = job.brandCouponValidUntil ? ` Valid till ${new Date(job.brandCouponValidUntil).toLocaleDateString()}.` : "";
  return `Dear customer, SRF ${job.reference}: Brand could not repair your watch. Coupon code ${coupon} of INR ${value} has been issued. You can redeem it at any Zimson store.${validity}`;
}

export function SrfTrackingPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const token = params.get("t")?.trim() ?? "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [disabled, setDisabled] = useState(false);
  const [customer, setCustomer] = useState<{ name: string; phone: string } | null>(null);
  const [job, setJob] = useState<TrackJob | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  async function load() {
    if (!token) {
      setError("Invalid tracking URL.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const out = await apiJson<{ disabled: boolean; customer: { name: string; phone: string } | null; job: TrackJob | null }>(
        `/api/public/srf-track?t=${encodeURIComponent(token)}`,
      );
      setDisabled(Boolean(out.disabled));
      setCustomer(out.customer ?? null);
      setJob(out.job ?? null);
      setDetailsOpen(false);
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
          {customer ? <p className="mt-2 text-sm font-semibold text-stone-800">{customer.name}</p> : null}
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
            {job ? (
              <div className="rounded-2xl border border-zimson-200 bg-white p-4 shadow-sm sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setDetailsOpen((v) => !v)}
                    className="font-mono text-sm font-semibold text-zimson-900 underline decoration-zimson-300 underline-offset-2"
                  >
                    {job.reference}
                  </button>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass[job.status] ?? "bg-stone-100 text-stone-700"}`}>
                    {customerStatusLabel(job.status, job.status === "reestimate_required" && !job.customerReestimateResponse)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-stone-500">
                  Click SRF number to {detailsOpen ? "hide" : "view"} details
                </p>

                {detailsOpen ? (
                <>
                <div className="mt-4 rounded-2xl border border-zimson-100 bg-zimson-50/40 p-4">
                  <div className="flex items-center gap-2">
                    {flow.map((s, idx) => {
                      const done = idx <= flowIndex(job.status);
                      return (
                        <div key={s.id} className="flex flex-1 items-center gap-2">
                          <div className={`h-7 w-7 shrink-0 rounded-full border text-center text-xs leading-7 font-bold ${done ? "border-zimson-600 bg-zimson-600 text-white" : "border-zimson-300 bg-white text-zimson-500"}`}>
                            {done ? "✓" : idx + 1}
                          </div>
                          <div className="min-w-0 text-[11px] font-medium text-stone-700">{s.label}</div>
                          {idx < flow.length - 1 ? (
                            <div className={`hidden h-1 flex-1 rounded sm:block ${idx < flowIndex(job.status) ? "bg-zimson-600" : "bg-zimson-200"}`} />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <p className="mt-4 text-sm text-stone-700">{job.watchBrand} {job.watchModel} · {job.serial}</p>
                <p className="mt-1 text-sm text-stone-700">Original estimate: INR {Number(job.estimateTotalInr ?? 0).toFixed(2)}</p>
                <p className="mt-1 text-sm text-stone-600">Complaint: {job.complaint || "-"}</p>

                {(job.reestimateHistory ?? []).length > 0 ? (
                  <div className="mt-4 rounded-xl border border-zimson-200 bg-zimson-50/40 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-stone-600">Re-estimate updates</p>
                    <ul className="mt-2 space-y-2">
                      {(job.reestimateHistory ?? []).map((x, idx) => (
                        <li key={`${x.requestedAt}-${idx}`} className="rounded-lg border border-zimson-100 bg-white px-3 py-2 text-xs text-stone-700">
                          <p className="font-semibold">Estimate {idx + 1}: INR {Number(x.amountInr ?? 0).toFixed(2)}</p>
                          <p className="mt-0.5">{x.note || "-"}</p>
                          <p className="mt-0.5 text-[11px] text-stone-500">{new Date(x.requestedAt).toLocaleString()}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

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
                    <p className="text-xs font-semibold text-amber-800">Approval required</p>
                    <p className="mt-1 text-sm text-stone-700">Please review latest re-estimate and submit your decision.</p>
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
                {(job.status === "brand_credit_note_pending" || job.status === "brand_credit_note_active") && job.brandCouponCode ? (
                  <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    <p className="text-xs font-semibold text-emerald-800">Brand coupon / credit note</p>
                    <p className="mt-1 text-sm text-stone-700">
                      Coupon code <strong>{job.brandCouponCode}</strong>
                      {job.brandCouponValueInr ? ` · INR ${Number(job.brandCouponValueInr).toFixed(2)}` : ""}
                      {job.brandCouponValidUntil ? ` · valid till ${new Date(job.brandCouponValidUntil).toLocaleDateString()}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-stone-600">This coupon can be redeemed at any Zimson store.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void navigator.clipboard.writeText(buildCouponMessage(job))}
                        className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900"
                      >
                        Copy SMS text
                      </button>
                      <a
                        href={`https://wa.me/?text=${encodeURIComponent(buildCouponMessage(job))}`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900"
                      >
                        Open WhatsApp message
                      </a>
                    </div>
                  </div>
                ) : null}
                </>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-stone-600">No active SRF found for this link.</p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
