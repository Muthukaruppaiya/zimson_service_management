import { useEffect, useMemo, useState } from "react";
import { apiJson } from "../../lib/api";
import { formatInr } from "../../lib/formatInr";

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

const flow = [
  { id: "booked", label: "Service booked", short: "Booked" },
  { id: "sent", label: "Watch moved for repair", short: "In transit" },
  { id: "repair", label: "Repair in progress", short: "Repair" },
  { id: "ready", label: "Ready for delivery", short: "Delivery" },
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

function customerStatusLabel(status: string, hasPendingReestimate: boolean): string {
  if (hasPendingReestimate) return "Approval required";
  if (status === "draft" || status === "photo_pending" || status === "at_store") return "Booking confirmed";
  if (status === "in_transit_sc" || status === "received_at_sc") return "In service movement";
  if (status === "sent_to_other_ho") return "Sent for specialist repair";
  if (status === "assigned" || status === "estimate_ok" || status === "reestimate_required") return "Under repair";
  if (status === "sent_to_brand" || status === "brand_estimate_pending" || status === "brand_approved" || status === "brand_repair_in_progress") return "With brand service";
  if (status === "received_from_brand") return "Returned from brand";
  if (status === "brand_credit_note_pending" || status === "brand_credit_note_active") return "Brand credit issued";
  if (status === "customer_rejected") return "Awaiting confirmation";
  if (status === "ready_for_outward" || status === "dispatched_to_store") return "Ready for return";
  if (status === "received_at_store") return "Ready for pickup";
  if (status === "closed") return "Delivered";
  return "In progress";
}

function buildCouponMessage(job: TrackJob): string {
  const coupon = job.brandCouponCode ?? "-";
  const validity = job.brandCouponValidUntil ? ` Valid till ${new Date(job.brandCouponValidUntil).toLocaleDateString()}.` : "";
  return `Dear customer, SRF ${job.reference}: Brand could not repair your watch. Coupon code ${coupon} of ${formatInr(Number(job.brandCouponValueInr ?? 0))} has been issued. You can redeem it at any Zimson store.${validity}`;
}

function TrackProgress({ activeIndex }: { activeIndex: number }) {
  return (
    <>
      {/* Mobile: vertical timeline */}
      <ol className="mt-6 space-y-0 sm:hidden">
        {flow.map((step, idx) => {
          const done = idx <= activeIndex;
          const current = idx === activeIndex && activeIndex < flow.length - 1;
          const upcoming = idx > activeIndex;
          return (
            <li key={step.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    done
                      ? "bg-rlx-gold text-rlx-green-deep shadow-md"
                      : current
                        ? "border-2 border-rlx-gold bg-rlx-green text-white ring-4 ring-rlx-gold/25"
                        : "border border-rlx-rule bg-white text-rlx-ink-muted"
                  }`}
                >
                  {done ? "✓" : idx + 1}
                </div>
                {idx < flow.length - 1 ? (
                  <div className={`my-1 w-0.5 flex-1 min-h-6 ${done ? "bg-rlx-gold" : "bg-rlx-rule"}`} />
                ) : null}
              </div>
              <div className={`pb-6 pt-1.5 ${upcoming ? "opacity-55" : ""}`}>
                <p className={`text-sm font-semibold ${current ? "text-rlx-green" : "text-rlx-ink"}`}>{step.label}</p>
                {current ? <p className="mt-0.5 text-xs text-rlx-gold-dark">Current stage</p> : null}
              </div>
            </li>
          );
        })}
      </ol>

      {/* Desktop: horizontal stepper */}
      <div className="mt-8 hidden sm:block">
        <div className="relative flex items-start justify-between gap-2">
          <div className="absolute left-0 right-0 top-[18px] h-0.5 bg-rlx-rule" aria-hidden />
          <div
            className="absolute left-0 top-[18px] h-0.5 bg-gradient-to-r from-rlx-gold to-rlx-gold-dark transition-all duration-500"
            style={{ width: `${(activeIndex / (flow.length - 1)) * 100}%` }}
            aria-hidden
          />
          {flow.map((step, idx) => {
            const done = idx <= activeIndex;
            const current = idx === activeIndex && activeIndex < flow.length - 1;
            return (
              <div key={step.id} className="relative z-10 flex flex-1 flex-col items-center px-1 text-center">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                    done
                      ? "bg-rlx-gold text-rlx-green-deep shadow-md"
                      : current
                        ? "border-2 border-rlx-gold bg-rlx-green text-white ring-4 ring-rlx-gold/20"
                        : "border border-rlx-rule bg-white text-rlx-ink-muted"
                  }`}
                >
                  {done ? "✓" : idx + 1}
                </div>
                <p className={`mt-3 max-w-[8.5rem] text-xs font-semibold leading-snug ${current ? "text-rlx-green" : "text-rlx-ink-muted"}`}>
                  {step.label}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function ZimsonHeader() {
  return (
    <header className="border-b border-rlx-gold/30 bg-gradient-to-br from-rlx-green-deep via-rlx-green to-[#2549a8] text-white shadow-lg">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6 sm:py-5">
        <div className="min-w-0">
          <p className="font-display text-2xl font-semibold tracking-wide text-white sm:text-3xl">
            ZIMSON <span className="text-rlx-gold">WATCH</span>
          </p>
          <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.22em] text-white/75">Service care</p>
        </div>
        <div className="hidden h-12 w-px shrink-0 bg-rlx-gold/40 sm:block" aria-hidden />
        <p className="hidden max-w-[10rem] text-right text-xs leading-relaxed text-white/80 sm:block">
          Premium after-sales service for your timepiece
        </p>
      </div>
      <div className="h-1 bg-gradient-to-r from-transparent via-rlx-gold to-transparent opacity-80" />
    </header>
  );
}

export function SrfTrackingPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const token = params.get("t")?.trim() ?? "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [disabled, setDisabled] = useState(false);
  const [customer, setCustomer] = useState<{ name: string; phone: string } | null>(null);
  const [jobs, setJobs] = useState<TrackJob[]>([]);
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  /* Keep backward compat – latest job */
  const job = jobs[0] ?? null;

  async function load() {
    if (!token) {
      setError("Invalid tracking URL.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const out = await apiJson<{ disabled: boolean; customer: { name: string; phone: string } | null; job: TrackJob | null; jobs?: TrackJob[] }>(
        `/api/public/srf-track?t=${encodeURIComponent(token)}`,
      );
      setDisabled(Boolean(out.disabled));
      setCustomer(out.customer ?? null);
      const allJobs = out.jobs ?? (out.job ? [out.job] : []);
      setJobs(allJobs);
      /* Auto-open the latest (first) job */
      setOpenJobId(allJobs[0]?.id ?? null);
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
    <div className="min-h-dvh bg-rlx-bg">
      <ZimsonHeader />

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        <section className="border border-rlx-rule bg-rlx-surface p-5 shadow-sm sm:p-7">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-rlx-gold-dark">Your service</p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-rlx-green sm:text-[1.75rem]">Watch service tracking</h1>
          <p className="mt-2 text-sm leading-relaxed text-rlx-ink-muted">
            Follow your repair journey and respond to estimate updates when needed.
          </p>
          {customer ? (
            <div className="mt-4 inline-flex flex-wrap items-center gap-2 border border-rlx-rule bg-rlx-green-light/60 px-3 py-2">
              <span className="text-sm font-semibold text-rlx-ink">{customer.name}</span>
              <span className="hidden text-rlx-rule sm:inline" aria-hidden>
                |
              </span>
              <span className="font-mono text-xs text-rlx-ink-muted sm:text-sm">{customer.phone}</span>
            </div>
          ) : null}
        </section>

        {loading ? (
          <div className="mt-6 flex items-center gap-3 border border-rlx-rule bg-white px-4 py-4 text-sm text-rlx-ink-muted">
            <span className="inline-block h-4 w-4 animate-pulse rounded-full bg-rlx-gold" aria-hidden />
            Loading your service details…
          </div>
        ) : null}

        {error ? (
          <div className="mt-6 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {error}
          </div>
        ) : null}

        {!loading && disabled ? (
          <div className="mt-6 border border-rlx-gold/40 bg-gradient-to-br from-rlx-green-light to-rlx-gold-light/40 px-5 py-5 sm:px-6">
            <p className="font-display text-lg font-semibold text-rlx-green">Service complete</p>
            <p className="mt-2 text-sm text-rlx-ink-muted">
              This tracking link has been deactivated. Thank you for choosing Zimson Watch.
            </p>
          </div>
        ) : null}

        {!loading && !disabled && jobs.length > 0 ? (
          <div className="mt-6 space-y-4">
            {jobs.length > 1 ? (
              <p className="text-sm font-semibold text-rlx-ink">
                {jobs.length} active service requests found for your account.
              </p>
            ) : null}
            {jobs.map((j, jobIdx) => {
              const pendingReestimate = j.status === "reestimate_required" && !j.customerReestimateResponse;
              const isOpen = openJobId === j.id;
              const activeFlow = flowIndex(j.status);
              return (
                <article key={j.id} className="overflow-hidden border border-rlx-rule bg-rlx-surface shadow-md">
                  {/* Card header — always visible */}
                  <div className="border-b border-rlx-rule bg-gradient-to-r from-rlx-green-deep/5 via-white to-rlx-gold-light/30 px-4 py-4 sm:px-6 sm:py-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        {jobs.length > 1 ? (
                          <p className="text-[10px] font-bold uppercase tracking-widest text-rlx-ink-muted">
                            Request {jobIdx + 1} of {jobs.length}
                          </p>
                        ) : (
                          <p className="text-[10px] font-bold uppercase tracking-widest text-rlx-ink-muted">Service reference</p>
                        )}
                        <p className="mt-0.5 font-mono text-lg font-bold text-rlx-green sm:text-xl">{j.reference}</p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                          pendingReestimate
                            ? "bg-amber-100 text-amber-900 ring-1 ring-amber-300"
                            : "bg-rlx-green text-white shadow-sm"
                        }`}
                      >
                        {customerStatusLabel(j.status, pendingReestimate)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-rlx-ink-muted">
                      {j.watchBrand} {j.watchModel}
                      <span className="px-1 text-rlx-rule">·</span>
                      <span className="font-mono text-xs">{j.serial}</span>
                    </p>
                  </div>

                  {/* Progress + details */}
                  <div className="px-4 py-5 sm:px-6 sm:py-6">
                    <TrackProgress activeIndex={activeFlow} />

                    <button
                      type="button"
                      onClick={() => setOpenJobId((prev) => (prev === j.id ? null : j.id))}
                      className="mt-6 flex w-full items-center justify-between gap-2 border border-rlx-rule bg-rlx-green-light/40 px-3 py-2.5 text-left text-sm font-semibold text-rlx-green transition hover:bg-rlx-green-light/70 sm:w-auto sm:min-w-[12rem]"
                    >
                      <span>{isOpen ? "Hide" : "Show"} service details</span>
                      <span className="text-rlx-gold" aria-hidden>{isOpen ? "▲" : "▼"}</span>
                    </button>

                    {isOpen ? (
                      <div className="mt-5 space-y-5 border-t border-rlx-rule pt-5">
                        <dl className="grid gap-3 sm:grid-cols-2">
                          <div className="border border-rlx-rule bg-rlx-bg/80 px-3 py-3">
                            <dt className="text-[10px] font-bold uppercase tracking-wider text-rlx-ink-muted">Original estimate</dt>
                            <dd className="mt-1 font-display text-lg font-semibold text-rlx-green">{formatInr(j.estimateTotalInr)}</dd>
                          </div>
                          <div className="border border-rlx-rule bg-rlx-bg/80 px-3 py-3">
                            <dt className="text-[10px] font-bold uppercase tracking-wider text-rlx-ink-muted">Complaint</dt>
                            <dd className="mt-1 text-sm text-rlx-ink">{j.complaint?.trim() || "—"}</dd>
                          </div>
                        </dl>

                        {(j.reestimateHistory ?? []).length > 0 ? (
                          <section>
                            <h2 className="text-xs font-bold uppercase tracking-wider text-rlx-green">Re-estimate updates</h2>
                            <ul className="mt-2 space-y-2">
                              {(j.reestimateHistory ?? []).map((x, idx) => (
                                <li key={`${x.requestedAt}-${idx}`} className="border border-rlx-rule border-l-4 border-l-rlx-gold bg-white px-3 py-3 text-sm">
                                  <p className="font-semibold text-rlx-ink">Estimate {idx + 1}: {formatInr(Number(x.amountInr ?? 0))}</p>
                                  <p className="mt-1 text-rlx-ink-muted">{x.note || "—"}</p>
                                  <p className="mt-1 text-[11px] text-rlx-ink-muted/80">{new Date(x.requestedAt).toLocaleString()}</p>
                                </li>
                              ))}
                            </ul>
                          </section>
                        ) : null}

                        {j.photos && j.photos.length > 0 ? (
                          <section>
                            <h2 className="text-xs font-bold uppercase tracking-wider text-rlx-green">Watch photos on file</h2>
                            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                              {j.photos.map((p) => (
                                <figure key={p.id} className="overflow-hidden border border-rlx-rule bg-white shadow-sm">
                                  <img src={`/${p.filePath}`} alt={p.photoKind ?? "Watch photo"} className="aspect-[4/3] w-full object-cover" />
                                  <figcaption className="border-t border-rlx-rule bg-rlx-green-light/50 px-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-wide text-rlx-green">
                                    {p.photoKind ?? "other"}
                                  </figcaption>
                                </figure>
                              ))}
                            </div>
                          </section>
                        ) : null}

                        {pendingReestimate ? (
                          <section className="border border-amber-300/80 bg-gradient-to-br from-amber-50 to-rlx-gold-light/30 p-4 sm:p-5">
                            <h2 className="text-sm font-bold text-amber-950">Your approval is needed</h2>
                            <p className="mt-1 text-sm text-rlx-ink-muted">A revised estimate is ready. Please accept or reject to continue your repair.</p>
                            {j.reestimateRequestedInr != null && Number(j.reestimateRequestedInr) > 0 ? (
                              <p className="mt-2 font-display text-lg font-semibold text-rlx-green">
                                Revised amount: {formatInr(Number(j.reestimateRequestedInr))}
                              </p>
                            ) : null}
                            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                              <button type="button" disabled={busyId === j.id} onClick={() => void respond(j.id, true)} className="flex-1 bg-rlx-green px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-rlx-green-deep disabled:opacity-60">Accept estimate</button>
                              <button type="button" disabled={busyId === j.id} onClick={() => void respond(j.id, false)} className="flex-1 border-2 border-rlx-green bg-white px-4 py-3 text-sm font-bold text-rlx-green transition hover:bg-rlx-green-light disabled:opacity-60">Decline</button>
                            </div>
                          </section>
                        ) : null}

                        {(j.status === "brand_credit_note_pending" || j.status === "brand_credit_note_active") && j.brandCouponCode ? (
                          <section className="border border-emerald-300/70 bg-gradient-to-br from-emerald-50/90 to-rlx-green-light/40 p-4 sm:p-5">
                            <h2 className="text-sm font-bold text-emerald-900">Brand credit / coupon</h2>
                            <p className="mt-2 text-sm text-rlx-ink">
                              Code <strong className="font-mono text-rlx-green">{j.brandCouponCode}</strong>
                              {j.brandCouponValueInr ? <span> · <strong>{formatInr(Number(j.brandCouponValueInr))}</strong></span> : null}
                              {j.brandCouponValidUntil ? <span className="mt-1 block text-xs text-rlx-ink-muted">Valid until {new Date(j.brandCouponValidUntil).toLocaleDateString()}</span> : null}
                            </p>
                            <p className="mt-2 text-xs text-rlx-ink-muted">Redeem at any Zimson Watch store.</p>
                            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                              <button type="button" onClick={() => void navigator.clipboard.writeText(buildCouponMessage(j))} className="flex-1 border border-rlx-green bg-white px-3 py-2.5 text-xs font-bold text-rlx-green hover:bg-rlx-green-light">Copy message</button>
                              <a href={`https://wa.me/?text=${encodeURIComponent(buildCouponMessage(j))}`} target="_blank" rel="noreferrer" className="flex-1 bg-[#25D366] px-3 py-2.5 text-center text-xs font-bold text-white hover:opacity-90">Share on WhatsApp</a>
                            </div>
                          </section>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}

        {!loading && !disabled && jobs.length === 0 ? (
          <p className="mt-6 border border-rlx-rule bg-white px-4 py-4 text-sm text-rlx-ink-muted">
            No active service request found for this link. Please contact your Zimson store.
          </p>
        ) : null}

        <footer className="mt-10 border-t border-rlx-rule pt-6 text-center text-[11px] text-rlx-ink-muted">
          <p className="font-display text-sm text-rlx-green">Zimson Watch</p>
          <p className="mt-1">Need help? Visit your authorised service centre with your SRF reference.</p>
        </footer>
      </main>
    </div>
  );
}
