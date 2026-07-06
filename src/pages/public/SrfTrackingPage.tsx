import { useEffect, useMemo, useState } from "react";
import { apiJson } from "../../lib/api";
import { formatInr } from "../../lib/formatInr";
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
  photos?: Array<{ id: string; photoKind?: string; filePath: string }>;
  timeline: TrackHistory[];
};

const STEP_ICONS = ["🧰", "📦", "🔧", "🎁"] as const;

function buildCouponMessage(job: TrackJob): string {
  const coupon = job.brandCouponCode ?? "-";
  const validity = job.brandCouponValidUntil
    ? ` Valid till ${new Date(job.brandCouponValidUntil).toLocaleDateString()}.`
    : "";
  return `Dear customer, SRF ${job.reference}: Brand could not repair your watch. Coupon code ${coupon} of ${formatInr(Number(job.brandCouponValueInr ?? 0))} has been issued. You can redeem it at any Zimson store.${validity}`;
}

function estimateAmountLabel(x: { amountInr: number | null; note: string }): string {
  if (Number(x.amountInr ?? 0) > 0) return formatInr(Number(x.amountInr));
  const m = String(x.note ?? "").match(/INR\s+([0-9]+(?:\.[0-9]+)?)/i);
  return m ? formatInr(Number(m[1])) : formatInr(0);
}

function TrackProgress({ activeIndex, steps }: { activeIndex: number; steps: readonly TrackingFlowStep[] }) {
  const pct = steps.length > 1 ? (activeIndex / (steps.length - 1)) * 100 : 0;
  return (
    <div className="mt-8">
      {/* Mobile vertical */}
      <ol className="space-y-0 sm:hidden">
        {steps.map((step, idx) => {
          const done = idx <= activeIndex;
          const current = idx === activeIndex;
          return (
            <li key={step.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg shadow-md ${
                    done
                      ? "bg-gradient-to-br from-[#c9a227] to-[#8b6914] text-white"
                      : "border border-[#d4c4a8] bg-white text-[#8a7a5c]"
                  } ${current ? "ring-4 ring-[#c9a227]/25" : ""}`}
                >
                  {STEP_ICONS[idx] ?? "●"}
                </div>
                {idx < steps.length - 1 ? (
                  <div className={`my-1 w-0.5 min-h-8 flex-1 ${done ? "bg-[#c9a227]" : "bg-[#e8dfd0]"}`} />
                ) : null}
              </div>
              <div className={`pb-6 pt-2 ${idx > activeIndex ? "opacity-50" : ""}`}>
                <p className={`text-sm font-semibold ${current ? "text-[#0a1f3d]" : "text-[#3d4a5c]"}`}>
                  {step.label}
                </p>
                {current ? <p className="mt-0.5 text-xs font-medium text-[#b8860b]">Current stage</p> : null}
              </div>
            </li>
          );
        })}
      </ol>

      {/* Desktop horizontal */}
      <div className="relative hidden px-2 sm:block">
        <div className="absolute left-[8%] right-[8%] top-[22px] h-1.5 rounded-full bg-[#e8dfd0]" aria-hidden />
        <div
          className="absolute left-[8%] top-[22px] h-1.5 rounded-full bg-gradient-to-r from-[#c9a227] via-[#d4af37] to-[#8b6914] transition-all duration-700"
          style={{ width: `calc(${pct}% * 0.84)` }}
          aria-hidden
        />
        <div className="relative z-10 flex justify-between">
          {steps.map((step, idx) => {
            const done = idx <= activeIndex;
            const current = idx === activeIndex;
            return (
              <div key={step.id} className="flex w-[22%] flex-col items-center text-center">
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-2xl text-xl shadow-lg transition-transform ${
                    done
                      ? "bg-gradient-to-br from-[#c9a227] to-[#8b6914] text-white"
                      : "border border-[#d4c4a8] bg-white text-[#8a7a5c]"
                  } ${current ? "scale-110 ring-4 ring-[#c9a227]/30" : ""}`}
                >
                  {STEP_ICONS[idx] ?? "●"}
                </div>
                <p
                  className={`mt-3 max-w-[7.5rem] text-[11px] font-semibold leading-snug ${
                    current ? "text-[#0a1f3d]" : "text-[#6b7280]"
                  }`}
                >
                  {step.label}
                </p>
              </div>
            );
          })}
        </div>
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
            "radial-gradient(circle at 20% 50%, #c9a227 0%, transparent 45%), radial-gradient(circle at 90% 20%, #fff 0%, transparent 35%)",
        }}
        aria-hidden
      />
      <div className="relative mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-5 sm:px-8 sm:py-6">
        <div className="min-w-0">
          <p
            className="text-2xl font-semibold tracking-[0.12em] text-[#d4af37] sm:text-3xl"
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
      <div className="h-1 bg-gradient-to-r from-transparent via-[#d4af37] to-transparent" />
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

  async function load() {
    if (!token) {
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
      }>(`/api/public/srf-track?t=${encodeURIComponent(token)}`);
      setDisabled(Boolean(out.disabled));
      setCustomer(out.customer ?? null);
      const allJobs = out.jobs ?? (out.job ? [out.job] : []);
      setJobs(allJobs);
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
    <div className="min-h-dvh bg-[#f7f4ef] text-[#1a2332]">
      <link
        href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700&family=Poppins:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />
      <ZimsonHeader />

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-8 sm:py-12" style={{ fontFamily: '"Poppins", system-ui, sans-serif' }}>
        {/* Hero intro card */}
        <section className="rounded-3xl border border-[#e8dfd0] bg-white px-6 py-8 shadow-[0_8px_30px_rgba(10,31,61,0.08)] sm:px-10 sm:py-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#b8860b]">Your service</p>
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
            <span className="inline-block h-4 w-4 animate-pulse rounded-full bg-[#d4af37]" aria-hidden />
            Loading your service details…
          </div>
        ) : null}

        {error ? (
          <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800" role="alert">
            {error}
          </div>
        ) : null}

        {!loading && disabled ? (
          <div className="mt-8 rounded-3xl border border-[#d4af37]/40 bg-gradient-to-br from-[#0a1f3d] to-[#1a3a5c] px-6 py-8 text-white shadow-lg">
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
                  <div className="border-b border-[#f0e9dc] bg-gradient-to-r from-white via-white to-[#faf6ef] px-5 py-5 sm:px-8 sm:py-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
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
                        className={`rounded-full px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] shadow-sm ${
                          pendingReestimate
                            ? "bg-amber-100 text-amber-950 ring-1 ring-amber-300/80"
                            : "bg-[#0a1f3d] text-white"
                        }`}
                      >
                        {statusLabel}
                      </span>
                    </div>

                    <TrackProgress activeIndex={activeFlow} steps={steps} />

                    <button
                      type="button"
                      onClick={() => setOpenJobId((prev) => (prev === j.id ? null : j.id))}
                      className="mt-8 flex w-full items-center justify-between gap-2 rounded-2xl border border-[#e8dfd0] bg-[#faf6ef] px-4 py-3 text-left text-sm font-semibold text-[#0a1f3d] transition hover:border-[#d4af37]/50 hover:bg-[#f5efe3] sm:w-auto sm:min-w-[14rem]"
                    >
                      <span>{isOpen ? "Hide" : "Show"} service details</span>
                      <span className="text-[#b8860b]" aria-hidden>
                        {isOpen ? "▲" : "▼"}
                      </span>
                    </button>
                  </div>

                  {isOpen ? (
                    <div className="space-y-6 border-t border-[#f0e9dc] px-5 py-6 sm:px-8 sm:py-8">
                      <dl className="grid gap-4 sm:grid-cols-2">
                        <div className="rounded-2xl border border-[#e8dfd0] bg-[#faf6ef]/80 px-4 py-4">
                          <dt className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8a7a5c]">
                            Original estimate
                          </dt>
                          <dd
                            className="mt-2 text-2xl font-semibold text-[#0a1f3d]"
                            style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
                          >
                            {formatInr(j.estimateTotalInr)}
                          </dd>
                        </div>
                        <div className="rounded-2xl border border-[#e8dfd0] bg-[#faf6ef]/80 px-4 py-4">
                          <dt className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8a7a5c]">
                            Complaint
                          </dt>
                          <dd className="mt-2 text-sm font-medium text-[#1a2332]">
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
                                className="rounded-2xl border border-[#e8dfd0] border-l-4 border-l-[#d4af37] bg-white px-4 py-4 text-sm shadow-sm"
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
                          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                            {j.photos.map((p) => (
                              <figure
                                key={p.id}
                                className="overflow-hidden rounded-2xl border border-[#e8dfd0] bg-white shadow-sm"
                              >
                                <img
                                  src={`/${p.filePath}`}
                                  alt={p.photoKind ?? "Watch photo"}
                                  className="aspect-square w-full object-cover"
                                />
                                <figcaption className="border-t border-[#f0e9dc] bg-[#faf6ef] px-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-wide text-[#0a1f3d]">
                                  {p.photoKind ?? "other"}
                                </figcaption>
                              </figure>
                            ))}
                          </div>
                        </section>
                      ) : null}

                      {pendingReestimate ? (
                        <section className="rounded-3xl border border-amber-300/70 bg-gradient-to-br from-amber-50 to-[#faf6ef] p-5 sm:p-6">
                          <h2 className="text-base font-bold text-amber-950">Your approval is needed</h2>
                          <p className="mt-1 text-sm text-[#5c6b7a]">
                            A revised estimate is ready. Please accept or reject to continue your repair.
                          </p>
                          {j.reestimateRequestedInr != null && Number(j.reestimateRequestedInr) > 0 ? (
                            <p
                              className="mt-3 text-2xl font-semibold text-[#0a1f3d]"
                              style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
                            >
                              Revised amount: {formatInr(Number(j.reestimateRequestedInr))}
                            </p>
                          ) : null}
                          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                            <button
                              type="button"
                              disabled={busyId === j.id}
                              onClick={() => void respond(j.id, true)}
                              className="flex-1 rounded-2xl bg-[#0a1f3d] px-4 py-3.5 text-sm font-bold text-white shadow-md transition hover:bg-[#132a4d] disabled:opacity-60"
                            >
                              Accept estimate
                            </button>
                            <button
                              type="button"
                              disabled={busyId === j.id}
                              onClick={() => void respond(j.id, false)}
                              className="flex-1 rounded-2xl border-2 border-[#0a1f3d] bg-white px-4 py-3.5 text-sm font-bold text-[#0a1f3d] transition hover:bg-[#faf6ef] disabled:opacity-60"
                            >
                              Decline
                            </button>
                          </div>
                        </section>
                      ) : null}

                      {(j.status === "brand_credit_note_pending" || j.status === "brand_credit_note_active") &&
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
    </div>
  );
}
