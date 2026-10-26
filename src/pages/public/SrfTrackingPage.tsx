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
  storeAdvanceVoucherCode?: string | null;
  storeAdvanceVoucherValueInr?: number | null;
  storeAdvanceVoucherValidUntil?: string | null;
  customerCouponNotifiedAt?: string | null;
  reestimateHistory?: Array<{ amountInr: number | null; note: string; requestedAt: string }>;
  /** Current re-estimate cycle number (1 = first customer approval). */
  reestimateAttemptNo?: number;
  photos?: Array<{ id: string; photoKind?: string; filePath: string }>;
  timeline: TrackHistory[];
};

type TrackPhoto = { id: string; photoKind?: string; filePath: string };

const SERIF = '"Playfair Display", Georgia, "Times New Roman", serif';

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

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
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
  const inset = `${50 / steps.length}%`;

  return (
    <div>
      <div className="relative">
        <div
          className="pointer-events-none absolute top-5 h-[2px] bg-[#e8dfd0]"
          style={{ left: inset, right: inset }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute top-5 h-[2px] bg-gradient-to-r from-[#8B6914] to-[#E8C14E] transition-all duration-700"
          style={{ left: inset, width: `calc((100% - ${inset} * 2) * ${pct / 100})` }}
          aria-hidden
        />
        <ol className="relative z-10 grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
          {steps.map((step, idx) => {
            const done = idx < safeIndex;
            const current = idx === safeIndex;
            return (
              <li key={step.id} className="flex flex-col items-center text-center">
                <div
                  className={[
                    "flex h-10 w-10 items-center justify-center transition-all duration-300",
                    done
                      ? "bg-[#0a1f3d] text-[#E8C14E]"
                      : current
                        ? "bg-gradient-to-br from-[#C9A227] to-[#8B6914] text-white shadow-[0_0_0_4px_rgba(201,162,39,0.2)]"
                        : "border border-[#d4c4a8] bg-white text-[#b09a6e]",
                  ].join(" ")}
                >
                  {done ? (
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <TrackStepIcon stepId={step.id} className="h-[1.15rem] w-[1.15rem]" />
                  )}
                </div>
                <p
                  className={[
                    "mt-2 max-w-[5.5rem] text-[10px] font-semibold leading-tight sm:max-w-[8rem] sm:text-xs",
                    current ? "text-[#0a1f3d]" : done ? "text-[#3d4f66]" : "text-[#9a8a6c]",
                  ].join(" ")}
                >
                  {step.label}
                </p>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function ZimsonHeader({ customer }: { customer: { name: string; phone: string } | null }) {
  return (
    <header className="relative overflow-hidden bg-[#0a1f3d] text-white">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 15% 40%, #C9A227 0%, transparent 45%), radial-gradient(circle at 90% 10%, #fff 0%, transparent 35%)",
        }}
        aria-hidden
      />
      <div className="relative mx-auto max-w-3xl px-5 pb-7 pt-5 sm:px-8 sm:pb-9 sm:pt-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xl font-semibold tracking-[0.14em] text-[#E8C14E] sm:text-2xl" style={{ fontFamily: SERIF }}>
              ZIMSON WATCH
            </p>
            <p className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.36em] text-white/70 sm:text-[10px]">
              Service care
            </p>
          </div>
          <span className="hidden border border-[#E8C14E]/40 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#E8C14E] sm:inline-block">
            Service tracking
          </span>
        </div>

        <div className="mt-7 sm:mt-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#E8C14E]/90">Your service</p>
          <h1 className="mt-1.5 text-[1.7rem] font-semibold leading-tight sm:text-4xl" style={{ fontFamily: SERIF }}>
            {customer?.name ? `Hello, ${customer.name}` : "Watch service tracking"}
          </h1>
          {customer?.phone ? <p className="mt-1.5 font-mono text-sm text-white/65">{customer.phone}</p> : null}
        </div>
      </div>
      <div className="h-[3px] bg-gradient-to-r from-transparent via-[#E8C14E] to-transparent" />
    </header>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#8a7a5c]">{children}</h2>;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading">
      {[0, 1].map((i) => (
        <div key={i} className="animate-pulse border border-[#e8dfd0] bg-white p-5 sm:p-6">
          <div className="h-3 w-24 bg-[#efe7d8]" />
          <div className="mt-3 h-6 w-48 bg-[#efe7d8]" />
          <div className="mt-2 h-3 w-36 bg-[#f4eee2]" />
          <div className="mt-6 grid grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((k) => (
              <div key={k} className="mx-auto h-10 w-10 bg-[#f4eee2]" />
            ))}
          </div>
        </div>
      ))}
    </div>
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
  const [copiedId, setCopiedId] = useState<string | null>(null);
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

  async function copyCoupon(job: TrackJob) {
    try {
      await navigator.clipboard.writeText(buildCouponMessage(job));
      setCopiedId(job.id);
      window.setTimeout(() => setCopiedId((prev) => (prev === job.id ? null : prev)), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="min-h-dvh bg-[#f7f4ef] text-[#1a2332]" style={{ fontFamily: '"Poppins", system-ui, sans-serif' }}>
      <link
        href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700&family=Poppins:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />
      <ZimsonHeader customer={customer} />

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
        {loading ? <LoadingSkeleton /> : null}

        {error ? (
          <div className="mb-4 border border-red-200 border-l-4 border-l-red-500 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {error}
          </div>
        ) : null}

        {!loading && disabled ? (
          <section className="border border-[#e8dfd0] bg-white px-6 py-10 text-center shadow-[0_8px_30px_rgba(10,31,61,0.06)] sm:px-10">
            <div className="mx-auto flex h-14 w-14 items-center justify-center bg-[#0a1f3d] text-[#E8C14E]">
              <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="mt-5 text-2xl font-semibold text-[#0a1f3d]" style={{ fontFamily: SERIF }}>
              Service complete
            </h2>
            <div className="mx-auto mt-3 h-[2px] w-12 bg-[#C9A227]" aria-hidden />
            <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-[#5c6b7a]">
              Your watch has been delivered and this tracking link is no longer active. Thank you for choosing Zimson
              Watch.
            </p>
          </section>
        ) : null}

        {!loading && !disabled && jobs.length > 1 ? (
          <p className="mb-4 text-sm text-[#5c6b7a]">
            <span className="font-semibold text-[#0a1f3d]">{jobs.length}</span> active service requests
          </p>
        ) : null}

        {!loading && !disabled && jobs.length > 0 ? (
          <div className="space-y-5">
            {jobs.map((j, jobIdx) => {
              const pendingReestimate =
                (j.status === "reestimate_required" || j.status === "brand_estimate_customer_pending") &&
                !j.customerReestimateResponse;
              const isOpen = openJobId === j.id;
              const steps = trackingFlowForRepairRoute(j.repairRoute, j.status);
              const activeFlow = trackingFlowIndex(j.status, j.repairRoute);
              const isStoreSelf = j.repairRoute === "store_self" || j.status.startsWith("store_self_");
              const statusLabel = customerTrackingStatusLabel(j.status, pendingReestimate, j.repairRoute);
              const showBrandCoupon =
                (j.status === "brand_credit_note_pending" ||
                  j.status === "brand_credit_note_pending_ho" ||
                  j.status === "brand_credit_note_pending_accounts" ||
                  j.status === "brand_credit_note_active") &&
                Boolean(j.brandCouponCode);
              const hasDetails =
                Boolean(j.complaint?.trim()) ||
                j.estimateTotalInr > 0 ||
                (j.reestimateHistory ?? []).length > 0 ||
                (j.photos ?? []).length > 0;

              return (
                <article
                  key={j.id}
                  className="border border-[#e8dfd0] border-t-[3px] border-t-[#C9A227] bg-white shadow-[0_10px_34px_rgba(10,31,61,0.06)]"
                >
                  <div className="px-5 pb-5 pt-5 sm:px-7 sm:pt-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#8a7a5c]">
                          {jobs.length > 1 ? `Request ${jobIdx + 1} of ${jobs.length}` : "Service reference"}
                        </p>
                        <p className="mt-1 font-mono text-xl font-bold tracking-tight text-[#0a1f3d] sm:text-2xl">
                          {j.reference}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] ${
                          pendingReestimate
                            ? "bg-amber-100 text-amber-950 ring-1 ring-amber-300"
                            : "bg-[#0a1f3d] text-[#E8C14E]"
                        }`}
                      >
                        {statusLabel}
                      </span>
                    </div>

                    <div className="mt-4 flex items-center gap-3 border border-[#f0e9dc] bg-[#fbf8f2] px-3.5 py-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-white text-[#A8850F] ring-1 ring-[#e8dfd0]">
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
                          <circle cx="12" cy="12" r="5" />
                          <path strokeLinecap="round" d="M12 9.8V12l1.4 1.2M9 7l.8-4h4.4l.8 4M9 17l.8 4h4.4l.8-4" />
                        </svg>
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#0a1f3d]">
                          {[j.watchBrand, j.watchModel].filter(Boolean).join(" ") || "Watch"}
                        </p>
                        {j.serial ? <p className="truncate font-mono text-xs text-[#5c6b7a]">S/N {j.serial}</p> : null}
                      </div>
                    </div>
                    {isStoreSelf ? (
                      <p className="mt-2 text-xs font-medium text-[#3d4f66]">Being repaired at your Zimson store.</p>
                    ) : null}

                    <div className="mt-6">
                      <TrackProgress activeIndex={activeFlow} steps={steps} />
                    </div>
                  </div>

                  {pendingReestimate ? (
                    <section className="border-t border-amber-200 bg-gradient-to-br from-amber-50 to-[#fbf8f2] px-5 py-5 sm:px-7">
                      {(() => {
                        const isBrandPending = j.status === "brand_estimate_customer_pending";
                        const attemptNo = Number(j.reestimateAttemptNo ?? 1);
                        const firstReestimate = !isBrandPending && attemptNo <= 1;
                        const softDeclineLabel = firstReestimate ? "Need to talk" : "Decline";
                        return (
                          <>
                            <h3 className="text-base font-bold text-amber-950">Your approval is needed</h3>
                            <p className="mt-1 text-sm text-[#5c6b7a]">
                              {firstReestimate
                                ? "A revised estimate is ready. Accept to continue, or choose Need to talk if you’d like our team to call you."
                                : "A revised estimate is ready. Please accept or decline to continue your repair."}
                            </p>
                            {j.reestimateRequestedInr != null && Number(j.reestimateRequestedInr) > 0 ? (
                              <div className="mt-4 border border-amber-200 bg-white px-4 py-3">
                                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8a7a5c]">
                                  Revised amount (approximate)
                                </p>
                                <p className="mt-1 text-xl font-semibold text-[#0a1f3d]">
                                  {formatApproxEstimateInr(Number(j.reestimateRequestedInr))}
                                </p>
                              </div>
                            ) : null}
                            <div className="mt-4 grid grid-cols-2 gap-3">
                              <button
                                type="button"
                                disabled={busyId === j.id}
                                onClick={() => void respond(j.id, true)}
                                className="bg-[#0a1f3d] px-4 py-3.5 text-sm font-bold text-white transition hover:bg-[#132a4d] disabled:opacity-60"
                              >
                                {busyId === j.id ? "Saving…" : "Accept"}
                              </button>
                              <button
                                type="button"
                                disabled={busyId === j.id}
                                onClick={() => void respond(j.id, false)}
                                className="border-2 border-[#0a1f3d] bg-white px-4 py-3.5 text-sm font-bold text-[#0a1f3d] transition hover:bg-[#fbf8f2] disabled:opacity-60"
                              >
                                {softDeclineLabel}
                              </button>
                            </div>
                          </>
                        );
                      })()}
                    </section>
                  ) : null}

                  {j.storeAdvanceVoucherCode ? (
                    <section className="border-t border-[#f0e9dc] px-5 py-5 sm:px-7">
                      <SectionTitle>Store credit</SectionTitle>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border border-dashed border-[#C9A227] bg-[#fbf8f2] px-4 py-3">
                        <p className="font-mono text-lg font-bold tracking-wider text-[#0a1f3d]">{j.storeAdvanceVoucherCode}</p>
                        {j.storeAdvanceVoucherValueInr ? (
                          <p className="text-lg font-semibold text-[#0a1f3d]">
                            {formatInr(Number(j.storeAdvanceVoucherValueInr))}
                          </p>
                        ) : null}
                      </div>
                      <p className="mt-2 text-xs text-[#5c6b7a]">
                        Issued for the advance paid on this service request. Redeem at a Zimson store.
                        {j.storeAdvanceVoucherValidUntil ? ` Valid until ${formatDate(j.storeAdvanceVoucherValidUntil)}.` : ""}
                      </p>
                    </section>
                  ) : null}

                  {showBrandCoupon ? (
                    <section className="border-t border-[#f0e9dc] px-5 py-5 sm:px-7">
                      <SectionTitle>Brand credit / coupon</SectionTitle>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border border-dashed border-emerald-400 bg-emerald-50/60 px-4 py-3">
                        <p className="font-mono text-lg font-bold tracking-wider text-[#0a1f3d]">{j.brandCouponCode}</p>
                        {j.brandCouponValueInr ? (
                          <p className="text-lg font-semibold text-[#0a1f3d]">{formatInr(Number(j.brandCouponValueInr))}</p>
                        ) : null}
                      </div>
                      <p className="mt-2 text-xs text-[#5c6b7a]">
                        Redeem at any Zimson Watch store.
                        {j.brandCouponValidUntil ? ` Valid until ${formatDate(j.brandCouponValidUntil)}.` : ""}
                      </p>
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => void copyCoupon(j)}
                          className="border border-[#0a1f3d] bg-white px-3 py-2.5 text-xs font-bold text-[#0a1f3d] hover:bg-[#fbf8f2]"
                        >
                          {copiedId === j.id ? "Copied" : "Copy message"}
                        </button>
                        <a
                          href={`https://wa.me/?text=${encodeURIComponent(buildCouponMessage(j))}`}
                          target="_blank"
                          rel="noreferrer"
                          className="bg-[#25D366] px-3 py-2.5 text-center text-xs font-bold text-white hover:opacity-90"
                        >
                          Share on WhatsApp
                        </a>
                      </div>
                    </section>
                  ) : null}

                  {hasDetails ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setOpenJobId((prev) => (prev === j.id ? null : j.id))}
                        className="flex w-full items-center justify-between gap-3 border-t border-[#f0e9dc] px-5 py-3.5 text-left text-sm font-semibold text-[#0a1f3d] transition hover:bg-[#fbf8f2] sm:px-7"
                        aria-expanded={isOpen}
                      >
                        <span>{isOpen ? "Hide details" : "View details"}</span>
                        <svg
                          className={`h-4 w-4 text-[#A8850F] transition-transform ${isOpen ? "rotate-180" : ""}`}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2.2}
                          aria-hidden
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                        </svg>
                      </button>

                      {isOpen ? (
                        <div className="space-y-6 border-t border-[#f0e9dc] bg-[#fdfbf7] px-5 py-6 sm:px-7">
                          <dl className="grid gap-3 sm:grid-cols-2">
                            <div className="border border-[#e8dfd0] bg-white px-4 py-3">
                              <dt className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8a7a5c]">
                                Original estimate (approximate)
                              </dt>
                              <dd className="mt-1.5 text-lg font-semibold text-[#0a1f3d]">
                                {formatApproxEstimateInr(j.estimateTotalInr)}
                              </dd>
                            </div>
                            <div className="border border-[#e8dfd0] bg-white px-4 py-3">
                              <dt className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8a7a5c]">Complaint</dt>
                              <dd className="mt-1.5 text-sm font-medium leading-snug text-[#1a2332]">
                                {j.complaint?.trim() || "—"}
                              </dd>
                            </div>
                          </dl>

                          {(j.reestimateHistory ?? []).length > 0 ? (
                            <section>
                              <SectionTitle>Re-estimate updates</SectionTitle>
                              <ol className="mt-3 space-y-0 border-l-2 border-[#e8dfd0] pl-4">
                                {(j.reestimateHistory ?? []).map((x, idx) => (
                                  <li key={`${x.requestedAt}-${idx}`} className="relative pb-4 last:pb-0">
                                    <span className="absolute -left-[1.4rem] top-1 h-2.5 w-2.5 bg-[#C9A227]" aria-hidden />
                                    <p className="text-sm font-semibold text-[#0a1f3d]">
                                      Estimate {idx + 1}: {estimateAmountLabel(x)}
                                    </p>
                                    {x.note ? <p className="mt-0.5 text-sm text-[#5c6b7a]">{x.note}</p> : null}
                                    <p className="mt-1 text-[11px] text-[#8a7a5c]">{new Date(x.requestedAt).toLocaleString()}</p>
                                  </li>
                                ))}
                              </ol>
                            </section>
                          ) : null}

                          {j.photos && j.photos.length > 0 ? (
                            <section>
                              <SectionTitle>Watch photos on file</SectionTitle>
                              <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
                                {j.photos.map((p) => (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => setLightboxPhoto(p)}
                                    className="group overflow-hidden border border-[#e8dfd0] bg-white text-left transition hover:border-[#C9A227] focus:outline-none focus:ring-2 focus:ring-[#E8C14E]/50"
                                  >
                                    <img
                                      src={`/${p.filePath}`}
                                      alt={p.photoKind ?? "Watch photo"}
                                      className="aspect-square w-full object-cover transition group-hover:scale-105"
                                    />
                                    <span className="block truncate border-t border-[#f0e9dc] bg-[#fbf8f2] px-1 py-1 text-center text-[9px] font-bold uppercase tracking-wide text-[#0a1f3d]">
                                      {p.photoKind ?? "other"}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </section>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : null}

        {!loading && !disabled && !error && jobs.length === 0 ? (
          <section className="border border-[#e8dfd0] bg-white px-6 py-8 text-center">
            <p className="text-base font-semibold text-[#0a1f3d]" style={{ fontFamily: SERIF }}>
              No active service request
            </p>
            <p className="mt-2 text-sm text-[#5c6b7a]">Please contact your Zimson store with your SRF reference.</p>
          </section>
        ) : null}

        <footer className="mt-12 border-t border-[#e8dfd0] pt-7 text-center">
          <p className="text-base font-semibold tracking-[0.12em] text-[#0a1f3d]" style={{ fontFamily: SERIF }}>
            ZIMSON WATCH
          </p>
          <div className="mx-auto mt-2 h-[2px] w-8 bg-[#C9A227]" aria-hidden />
          <p className="mx-auto mt-3 max-w-xs text-xs leading-relaxed text-[#8a7a5c]">
            Need help? Visit your Zimson store with your SRF reference.
          </p>
          <p className="mt-4 text-[10px] uppercase tracking-[0.2em] text-[#b5a684]">
            © {new Date().getFullYear()} Zimson Watch
          </p>
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
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center border border-white/30 bg-white/10 text-white backdrop-blur-sm transition hover:bg-white/20"
            aria-label="Close"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
          <img
            src={`/${lightboxPhoto.filePath}`}
            alt={lightboxPhoto.photoKind ?? "Watch photo"}
            className="max-h-[78vh] max-w-full object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <p className="mt-4 text-center text-sm font-semibold uppercase tracking-wide text-white/90">
            {lightboxPhoto.photoKind ?? "Watch photo"}
          </p>
        </div>
      ) : null}
    </div>
  );
}
