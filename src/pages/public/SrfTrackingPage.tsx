import { useEffect, useMemo, useState } from "react";
import { apiJson } from "../../lib/api";
import { formatInr, formatApproxEstimateInr } from "../../lib/formatInr";
import {
  customerTrackingStatusLabel,
  trackingFlowForRepairRoute,
  trackingFlowIndex,
  type TrackingFlowStep,
} from "../../lib/srfTrackingFlow";

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
  repairRoute?: string | null;
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
  /** Current re-estimate cycle number (1 = first customer approval). */
  reestimateAttemptNo?: number;
  photos?: Array<{ id: string; photoKind?: string; filePath: string }>;
  timeline: TrackHistory[];
};

type TrackPhoto = { id: string; photoKind?: string; filePath: string };

function buildCouponMessage(job: TrackJob): string {
  const coupon = job.brandCouponCode ?? "-";
  const validity = job.brandCouponValidUntil
    ? ` Valid till ${new Date(job.brandCouponValidUntil).toLocaleDateString()}.`
    : "";
  return `Dear customer, SRF ${job.reference}: Brand could not repair your watch. Coupon code ${coupon} of ${formatInr(Number(job.brandCouponValueInr ?? 0))} has been issued. You can redeem it at any Zimson store.${validity}`;
}

function estimateAmountLabel(x: { amountInr: number | null; note: string }): string {
  if (Number(x.amountInr ?? 0) > 0) return formatApproxEstimateInr(Number(x.amountInr));
  const m = String(x.note ?? "").match(/INR\s+([0-9]+(?:\.[0-9]+)?)/i);
  return m ? formatApproxEstimateInr(Number(m[1])) : formatApproxEstimateInr(0);
}

function TrackStepIcon({ stepId, className = "h-5 w-5" }: { stepId: string; className?: string }) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.75,
    "aria-hidden": true as const,
  };
  switch (stepId) {
    case "booked":
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5a2 2 0 012-2h2a2 2 0 012 2v0a2 2 0 01-2 2h-2a2 2 0 01-2-2v0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6M9 16h4" />
        </svg>
      );
    case "sent":
    case "assign":
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5-5 5M6 12h12" />
        </svg>
      );
    case "repair":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.7 6.3a4 4 0 00-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 005.4-5.4l-2.5 2.5-2-2 2.5-2.5z"
          />
        </svg>
      );
    case "ready":
    default:
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8 10L4 11" />
        </svg>
      );
  }
}

function TrackProgress({ activeIndex, steps }: { activeIndex: number; steps: readonly TrackingFlowStep[] }) {
  const last = Math.max(steps.length - 1, 1);
  const safeIndex = Math.min(Math.max(activeIndex, 0), last);
  const pct = Math.round((safeIndex / last) * 100);

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-[#e8dfd0] bg-gradient-to-b from-white to-[#faf6ef] p-4 shadow-sm sm:p-5">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#A8850F]">
            Step {safeIndex + 1} of {steps.length}
          </p>
          <p className="mt-0.5 text-sm font-semibold text-[#0a1f3d]">{steps[safeIndex]?.label}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold tabular-nums text-[#0a1f3d]">{pct}%</p>
          <p className="text-[10px] font-medium uppercase tracking-wide text-[#8a7a5c]">Complete</p>
        </div>
      </div>

      <div className="relative px-1 sm:px-3">
        <div
          className="pointer-events-none absolute left-[12.5%] right-[12.5%] top-[22px] h-[3px] rounded-full bg-[#e8dfd0] sm:top-[26px]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute left-[12.5%] top-[22px] h-[3px] rounded-full bg-gradient-to-r from-[#8B6914] via-[#C9A227] to-[#E8C14E] transition-all duration-700 sm:top-[26px]"
          style={{ width: `calc(${pct}% * 0.75)` }}
          aria-hidden
        />

        <ol className="relative z-10 grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
          {steps.map((step, idx) => {
            const done = idx < safeIndex;
            const current = idx === safeIndex;
            const upcoming = idx > safeIndex;
            return (
              <li key={step.id} className="flex flex-col items-center text-center">
                <div
                  className={[
                    "relative flex h-11 w-11 items-center justify-center rounded-full transition-all duration-300 sm:h-[3.25rem] sm:w-[3.25rem]",
                    done
                      ? "bg-[#0a1f3d] text-[#E8C14E] shadow-md"
                      : current
                        ? "bg-gradient-to-br from-[#C9A227] to-[#8B6914] text-white shadow-[0_0_0_4px_rgba(201,162,39,0.22)] sm:shadow-[0_0_0_5px_rgba(201,162,39,0.22)]"
                        : "border border-[#d4c4a8] bg-white text-[#b09a6e]",
                    upcoming ? "opacity-70" : "",
                  ].join(" ")}
                >
                  {done ? (
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <TrackStepIcon stepId={step.id} className="h-5 w-5 sm:h-[1.35rem] sm:w-[1.35rem]" />
                  )}
                </div>
                <p
                  className={[
                    "mt-2.5 max-w-[5.5rem] text-[10px] font-semibold leading-snug sm:max-w-[8rem] sm:text-[12px]",
                    current ? "text-[#0a1f3d]" : done ? "text-[#3d4f66]" : "text-[#8a7a5c]",
                  ].join(" ")}
                >
                  {step.label}
                </p>
                {current ? (
                  <span className="mt-1.5 inline-flex rounded-full bg-[#0a1f3d] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-[#E8C14E]">
                    Now
                  </span>
                ) : done ? (
                  <span className="mt-1.5 text-[9px] font-medium text-[#A8850F]">Done</span>
                ) : (
                  <span className="mt-1.5 text-[9px] font-medium text-transparent select-none">·</span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function ZimsonHeader() {
  return (
    <header className="relative overflow-hidden bg-[#0a1f3d] text-white shadow-xl">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 50%, #C9A227 0%, transparent 45%), radial-gradient(circle at 90% 20%, #fff 0%, transparent 35%)",
        }}
        aria-hidden
      />
      <div className="relative mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-5 sm:px-8 sm:py-6">
        <div className="min-w-0">
          <p
            className="text-2xl font-semibold tracking-[0.12em] text-[#E8C14E] sm:text-3xl"
            style={{ fontFamily: '"Playfair Display", Georgia, "Times New Roman", serif' }}
          >
            ZIMSON WATCH
          </p>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.35em] text-white/80 sm:text-[11px]">
            Service care
          </p>
        </div>
        <p className="hidden max-w-[14rem] text-right text-xs leading-relaxed text-white/75 sm:block md:text-sm">
          Premium after-sales service for your timepiece.
        </p>
      </div>
      <div className="h-1 bg-gradient-to-r from-transparent via-[#E8C14E] to-transparent" />
    </header>
  );
}

export function SrfTrackingPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const token = params.get("t")?.trim() ?? "";
  const pin = params.get("p")?.trim() ?? "";
  const trackQuery = token
    ? `t=${encodeURIComponent(token)}`
    : pin
      ? `p=${encodeURIComponent(pin)}`
      : "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [disabled, setDisabled] = useState(false);
  const [customer, setCustomer] = useState<{ name: string; phone: string } | null>(null);
  const [jobs, setJobs] = useState<TrackJob[]>([]);
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<TrackPhoto | null>(null);

  async function load() {
    if (!trackQuery) {
      setError("Invalid tracking URL.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const out = await apiJson<{
        disabled: boolean;
        customer: { name: string; phone: string } | null;
        job: TrackJob | null;
        jobs?: TrackJob[];
      }>(`/api/public/srf-track?${trackQuery}`);
      setDisabled(Boolean(out.disabled));
      setCustomer(out.customer ?? null);
      const allJobs = out.jobs ?? (out.job ? [out.job] : []);
      setJobs(allJobs);
      setOpenJobId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load tracking details.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackQuery]);

  useEffect(() => {
    if (!lightboxPhoto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxPhoto(null);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [lightboxPhoto]);

  async function respond(jobId: string, accepted: boolean) {
    setBusyId(jobId);
    setError(null);
    try {
      await apiJson("/api/public/srf-track/reestimate-response", {
        method: "POST",
        json: token ? { token, srfId: jobId, accepted } : { pin, srfId: jobId, accepted },
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit response.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-dvh bg-[#f7f4ef] text-[#1a2332]">
      <link
        href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700&family=Poppins:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />
      <ZimsonHeader />

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-8 sm:py-12" style={{ fontFamily: '"Poppins", system-ui, sans-serif' }}>
        {/* Hero intro card */}
        <section className="rounded-3xl border border-[#e8dfd0] bg-white px-6 py-8 shadow-[0_8px_30px_rgba(10,31,61,0.08)] sm:px-10 sm:py-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#A8850F]">Your service</p>
          <h1
            className="mt-2 text-3xl font-semibold tracking-tight text-[#0a1f3d] sm:text-4xl"
            style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
          >
            Watch service tracking
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-[#5c6b7a] sm:text-base">
            Follow your repair journey and respond to estimate updates when needed.
          </p>
          {customer ? (
            <div className="mt-6 flex flex-wrap gap-2">
              <span className="inline-flex items-center rounded-full border border-[#e8dfd0] bg-[#faf6ef] px-4 py-2 text-sm font-semibold text-[#0a1f3d]">
                {customer.name}
              </span>
              <span className="inline-flex items-center rounded-full border border-[#e8dfd0] bg-[#faf6ef] px-4 py-2 font-mono text-sm text-[#5c6b7a]">
                {customer.phone}
              </span>
            </div>
          ) : null}
        </section>

        {loading ? (
          <div className="mt-8 flex items-center gap-3 rounded-2xl border border-[#e8dfd0] bg-white px-5 py-4 text-sm text-[#5c6b7a] shadow-sm">
            <span className="inline-block h-4 w-4 animate-pulse rounded-full bg-[#E8C14E]" aria-hidden />
            Loading your service details…
          </div>
        ) : null}

        {error ? (
          <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800" role="alert">
            {error}
          </div>
        ) : null}

        {!loading && disabled ? (
          <div className="mt-8 rounded-3xl border border-[#E8C14E]/40 bg-gradient-to-br from-[#0a1f3d] to-[#1a3a5c] px-6 py-8 text-white shadow-lg">
            <p className="text-xl font-semibold" style={{ fontFamily: '"Playfair Display", Georgia, serif' }}>
              Service complete
            </p>
            <p className="mt-2 text-sm text-white/80">
              This tracking link has been deactivated. Thank you for choosing Zimson Watch.
            </p>
          </div>
        ) : null}

        {!loading && !disabled && jobs.length > 0 ? (
          <div className="mt-8 space-y-6">
            {jobs.length > 1 ? (
              <p className="text-sm font-medium text-[#5c6b7a]">
                <span className="font-semibold text-[#0a1f3d]">{jobs.length}</span> active service requests found for
                your account.
              </p>
            ) : null}

            {jobs.map((j, jobIdx) => {
              const pendingReestimate =
                (j.status === "reestimate_required" || j.status === "brand_estimate_customer_pending") &&
                !j.customerReestimateResponse;
              const isOpen = openJobId === j.id;
              const steps = trackingFlowForRepairRoute(j.repairRoute, j.status);
              const activeFlow = trackingFlowIndex(j.status, j.repairRoute);
              const isStoreSelf = j.repairRoute === "store_self" || j.status.startsWith("store_self_");
              const statusLabel = customerTrackingStatusLabel(j.status, pendingReestimate, j.repairRoute);

              return (
                <article
                  key={j.id}
                  className="overflow-hidden rounded-3xl border border-[#e8dfd0] bg-white shadow-[0_10px_40px_rgba(10,31,61,0.07)]"
                >
                  <div className="px-5 py-5 sm:px-8 sm:py-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#8a7a5c]">
                          {jobs.length > 1 ? `Request ${jobIdx + 1} of ${jobs.length}` : "Service reference"}
                        </p>
                        <p className="mt-1 font-mono text-xl font-bold tracking-tight text-[#0a1f3d] sm:text-2xl">
                          {j.reference}
                        </p>
                        <p className="mt-2 text-sm text-[#5c6b7a]">
                          {j.watchBrand} {j.watchModel}
                          <span className="mx-1.5 text-[#d4c4a8]">·</span>
                          <span className="font-mono text-xs">{j.serial}</span>
                        </p>
                        {isStoreSelf ? (
                          <p className="mt-1 text-xs font-medium text-sky-800">
                            Repaired at your Zimson store (not sent to service centre).
                          </p>
                        ) : null}
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] shadow-sm ${
                          pendingReestimate
                            ? "bg-amber-100 text-amber-950 ring-1 ring-amber-300/80"
                            : "bg-[#0a1f3d] text-white"
                        }`}
                      >
                        {statusLabel}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setOpenJobId((prev) => (prev === j.id ? null : j.id))}
                      className="mt-5 flex w-full items-center justify-between gap-3 rounded-2xl border border-[#e8dfd0] bg-[#faf6ef] px-4 py-3.5 text-left text-sm font-semibold text-[#0a1f3d] transition hover:border-[#E8C14E]/50 hover:bg-[#f5efe3]"
                      aria-expanded={isOpen}
                    >
                      <span>{isOpen ? "Hide tracking & details" : "Show tracking & details"}</span>
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-sm text-[#A8850F] shadow-sm transition-transform ${
                          isOpen ? "rotate-180" : ""
                        }`}
                        aria-hidden
                      >
                        ▼
                      </span>
                    </button>
                  </div>

                  {isOpen ? (
                    <div className="space-y-6 border-t border-[#f0e9dc] px-5 py-6 sm:px-8 sm:py-8">
                      <section>
                        <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#0a1f3d]">
                          Repair progress
                        </h2>
                        <p className="mt-1 text-xs text-[#8a7a5c]">Follow your watch through each stage of service.</p>
                        <TrackProgress activeIndex={activeFlow} steps={steps} />
                      </section>
                      <dl className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border border-[#e8dfd0] bg-[#faf6ef]/80 px-3 py-3">
                          <dt className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8a7a5c]">
                            Original Estimate (approximate)
                          </dt>
                          <dd className="mt-1.5 text-base font-semibold text-[#0a1f3d] sm:text-lg">
                            {formatApproxEstimateInr(j.estimateTotalInr)}
                          </dd>
                        </div>
                        <div className="rounded-xl border border-[#e8dfd0] bg-[#faf6ef]/80 px-3 py-3">
                          <dt className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8a7a5c]">
                            Complaint
                          </dt>
                          <dd className="mt-1.5 text-xs font-medium leading-snug text-[#1a2332] sm:text-sm">
                            {j.complaint?.trim() || "—"}
                          </dd>
                        </div>
                      </dl>

                      {(j.reestimateHistory ?? []).length > 0 ? (
                        <section>
                          <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#0a1f3d]">
                            Re-estimate updates
                          </h2>
                          <ul className="mt-3 space-y-3">
                            {(j.reestimateHistory ?? []).map((x, idx) => (
                              <li
                                key={`${x.requestedAt}-${idx}`}
                                className="rounded-2xl border border-[#e8dfd0] border-l-4 border-l-[#E8C14E] bg-white px-4 py-4 text-sm shadow-sm"
                              >
                                <p className="font-semibold text-[#0a1f3d]">
                                  Estimate {idx + 1}: {estimateAmountLabel(x)}
                                </p>
                                <p className="mt-1 text-[#5c6b7a]">{x.note || "—"}</p>
                                <p className="mt-2 text-[11px] text-[#8a7a5c]">
                                  {new Date(x.requestedAt).toLocaleString()}
                                </p>
                              </li>
                            ))}
                          </ul>
                        </section>
                      ) : null}

                      {j.photos && j.photos.length > 0 ? (
                        <section>
                          <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#0a1f3d]">
                            Watch photos on file
                          </h2>
                          <p className="mt-1 text-xs text-[#8a7a5c]">Tap a thumbnail to view full size.</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {j.photos.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => setLightboxPhoto(p)}
                                className="overflow-hidden rounded-xl border border-[#e8dfd0] bg-white text-left shadow-sm transition hover:border-[#E8C14E]/70 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#E8C14E]/40"
                              >
                                <img
                                  src={`/${p.filePath}`}
                                  alt={p.photoKind ?? "Watch photo"}
                                  className="h-14 w-14 object-cover sm:h-16 sm:w-16"
                                />
                                <span className="block w-14 truncate border-t border-[#f0e9dc] bg-[#faf6ef] px-1.5 py-1 text-center text-[9px] font-bold uppercase tracking-wide text-[#0a1f3d] sm:w-16">
                                  {p.photoKind ?? "other"}
                                </span>
                              </button>
                            ))}
                          </div>
                        </section>
                      ) : null}

                      {pendingReestimate ? (
                        <section className="rounded-3xl border border-amber-300/70 bg-gradient-to-br from-amber-50 to-[#faf6ef] p-5 sm:p-6">
                          <h2 className="text-base font-bold text-amber-950">Your approval is needed</h2>
                          {(() => {
                            const isBrandPending = j.status === "brand_estimate_customer_pending";
                            const attemptNo = Number(j.reestimateAttemptNo ?? 1);
                            const firstReestimate = !isBrandPending && attemptNo <= 1;
                            const softDeclineLabel = firstReestimate ? "Need to talk" : "Decline";
                            return (
                              <>
                                <p className="mt-1 text-sm text-[#5c6b7a]">
                                  {firstReestimate
                                    ? "A revised estimate is ready. Accept to continue, or choose Need to talk if you’d like our team to call you."
                                    : "A revised estimate is ready. Please accept or decline to continue your repair."}
                                </p>
                                {j.reestimateRequestedInr != null && Number(j.reestimateRequestedInr) > 0 ? (
                                  <p className="mt-3 text-base font-semibold text-[#0a1f3d] sm:text-lg">
                                    Revised amount (approximate):{" "}
                                    {formatApproxEstimateInr(Number(j.reestimateRequestedInr))}
                                  </p>
                                ) : null}
                                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                                  <button
                                    type="button"
                                    disabled={busyId === j.id}
                                    onClick={() => void respond(j.id, true)}
                                    className="flex-1 rounded-2xl bg-[#0a1f3d] px-4 py-3.5 text-sm font-bold text-white shadow-md transition hover:bg-[#132a4d] disabled:opacity-60"
                                  >
                                    Accept
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busyId === j.id}
                                    onClick={() => void respond(j.id, false)}
                                    className="flex-1 rounded-2xl border-2 border-[#0a1f3d] bg-white px-4 py-3.5 text-sm font-bold text-[#0a1f3d] transition hover:bg-[#faf6ef] disabled:opacity-60"
                                  >
                                    {softDeclineLabel}
                                  </button>
                                </div>
                              </>
                            );
                          })()}
                        </section>
                      ) : null}

                      {(j.status === "brand_credit_note_pending" ||
                        j.status === "brand_credit_note_pending_ho" ||
                        j.status === "brand_credit_note_pending_accounts" ||
                        j.status === "brand_credit_note_active") &&
                      j.brandCouponCode ? (
                        <section className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-[#faf6ef] p-5 sm:p-6">
                          <h2 className="text-base font-bold text-emerald-900">Brand credit / coupon</h2>
                          <p className="mt-2 text-sm text-[#1a2332]">
                            Code <strong className="font-mono text-[#0a1f3d]">{j.brandCouponCode}</strong>
                            {j.brandCouponValueInr ? (
                              <span>
                                {" "}
                                · <strong>{formatInr(Number(j.brandCouponValueInr))}</strong>
                              </span>
                            ) : null}
                            {j.brandCouponValidUntil ? (
                              <span className="mt-1 block text-xs text-[#5c6b7a]">
                                Valid until {new Date(j.brandCouponValidUntil).toLocaleDateString()}
                              </span>
                            ) : null}
                          </p>
                          <p className="mt-2 text-xs text-[#5c6b7a]">Redeem at any Zimson Watch store.</p>
                          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                            <button
                              type="button"
                              onClick={() => void navigator.clipboard.writeText(buildCouponMessage(j))}
                              className="flex-1 rounded-2xl border border-[#0a1f3d] bg-white px-3 py-2.5 text-xs font-bold text-[#0a1f3d] hover:bg-[#faf6ef]"
                            >
                              Copy message
                            </button>
                            <a
                              href={`https://wa.me/?text=${encodeURIComponent(buildCouponMessage(j))}`}
                              target="_blank"
                              rel="noreferrer"
                              className="flex-1 rounded-2xl bg-[#25D366] px-3 py-2.5 text-center text-xs font-bold text-white hover:opacity-90"
                            >
                              Share on WhatsApp
                            </a>
                          </div>
                        </section>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : null}

        {!loading && !disabled && jobs.length === 0 ? (
          <p className="mt-8 rounded-2xl border border-[#e8dfd0] bg-white px-5 py-5 text-sm text-[#5c6b7a] shadow-sm">
            No active service request found for this link. Please contact your Zimson store.
          </p>
        ) : null}

        <footer className="mt-14 border-t border-[#e8dfd0] pt-8 text-center">
          <p
            className="text-lg font-semibold tracking-wide text-[#0a1f3d]"
            style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
          >
            Zimson Watch
          </p>
          <p className="mt-2 text-xs text-[#8a7a5c]">
            Need help? Visit your authorised service centre with your SRF reference.
          </p>
          <nav className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11px] font-medium text-[#5c6b7a]">
            <span>Home</span>
            <span className="text-[#d4c4a8]">|</span>
            <span>Contact Us</span>
            <span className="text-[#d4c4a8]">|</span>
            <span>About Zimson</span>
            <span className="text-[#d4c4a8]">|</span>
            <span>Support</span>
          </nav>
        </footer>
      </main>

      {lightboxPhoto ? (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={lightboxPhoto.photoKind ?? "Watch photo"}
          onClick={() => setLightboxPhoto(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxPhoto(null)}
            className="absolute right-4 top-4 flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20"
          >
            <span aria-hidden>←</span> Back
          </button>
          <img
            src={`/${lightboxPhoto.filePath}`}
            alt={lightboxPhoto.photoKind ?? "Watch photo"}
            className="max-h-[78vh] max-w-full rounded-2xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <p className="mt-4 text-center text-sm font-semibold uppercase tracking-wide text-white/90">
            {lightboxPhoto.photoKind ?? "Watch photo"}
          </p>
          <button
            type="button"
            onClick={() => setLightboxPhoto(null)}
            className="mt-4 rounded-2xl bg-white px-6 py-2.5 text-sm font-bold text-[#0a1f3d] shadow-lg transition hover:bg-[#faf6ef]"
          >
            Close
          </button>
        </div>
      ) : null}
    </div>
  );
}
