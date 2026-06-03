import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ServiceBreadcrumb } from "../../components/service/ServiceBreadcrumb";
import { ProcessSuccessModal } from "../../components/ui/ProcessSuccessModal";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useSpares } from "../../context/SparesContext";
import { useSrfJobs } from "../../context/SrfJobsContext";
import { apiJson, ApiError } from "../../lib/api";
import { printAssignmentSlip } from "../../lib/serviceDocuments";
import { jobVisibleToStoreUser } from "../../lib/srfAccess";
import { formatInr } from "../../lib/formatInr";
import { repairRouteLabel } from "../../lib/srfRepairRoute";
import { inputClassReadOnly } from "../../lib/uiForm";
import type { SrfJob } from "../../types/srfJob";

type TechnicianProfile = {
  id: string;
  fullName: string;
  grade: string;
  isActive: boolean;
};

type SpareLineDraft = { spareId: string; qty: string };

function isStoreSelfWorking(job: SrfJob): boolean {
  return (
    job.repairRoute === "store_self" &&
    (job.status === "store_self_working" || job.status === "store_self_assigned")
  );
}

function statusDisplay(status: string): string {
  if (status === "store_self_working" || status === "store_self_assigned") return "Working";
  if (status === "store_self_pending") return "Pending assign";
  return status.replace(/_/g, " ");
}

export function StoreAssignPage() {
  const { user } = useAuth();
  const { activeSpares } = useSpares();
  const { jobs, storeSelfAssignTechnician, storeSelfSubmitSparesSlip, storeSelfMarkRepairComplete, storeSelfRequestReestimate } =
    useSrfJobs();
  const [technicians, setTechnicians] = useState<TechnicianProfile[]>([]);
  const [techByJob, setTechByJob] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [assignAck, setAssignAck] = useState<{
    reference: string;
    customerName: string;
    watchLabel: string;
    technicianLabel: string;
    job: SrfJob;
  } | null>(null);

  const [repairPopupJobId, setRepairPopupJobId] = useState<string | null>(null);
  const [repairLines, setRepairLines] = useState<SpareLineDraft[]>([{ spareId: "", qty: "1" }]);
  const [unitPriceBySpareId, setUnitPriceBySpareId] = useState<Record<string, number>>({});
  const [repairPopupError, setRepairPopupError] = useState("");
  const [repairSaving, setRepairSaving] = useState(false);

  const [completeAck, setCompleteAck] = useState<{
    reference: string;
    customerName: string;
    watchLabel: string;
  } | null>(null);

  const [reestimatePopupJobId, setReestimatePopupJobId] = useState<string | null>(null);
  const [reestimatePreviousInr, setReestimatePreviousInr] = useState(0);
  const [reestimateAmountInput, setReestimateAmountInput] = useState("");
  const [reestimateRemarkInput, setReestimateRemarkInput] = useState("");

  useEffect(() => {
    void apiJson<{ rows: TechnicianProfile[] }>("/api/service/technicians?activeOnly=1")
      .then((out) => setTechnicians(out.rows))
      .catch(() => setTechnicians([]));
  }, []);

  const pending = useMemo(() => {
    if (!user) return [];
    return jobs.filter(
      (j) => j.status === "store_self_pending" && j.repairRoute === "store_self" && jobVisibleToStoreUser(j, user),
    );
  }, [jobs, user]);

  const working = useMemo(() => {
    if (!user) return [];
    return jobs.filter((j) => isStoreSelfWorking(j) && jobVisibleToStoreUser(j, user));
  }, [jobs, user]);

  const awaitingReestimate = useMemo(() => {
    if (!user) return [];
    return jobs.filter(
      (j) =>
        j.repairRoute === "store_self" &&
        j.status === "reestimate_required" &&
        !j.customerReestimateResponse &&
        jobVisibleToStoreUser(j, user),
    );
  }, [jobs, user]);

  const rejectedReestimate = useMemo(() => {
    if (!user) return [];
    return jobs.filter(
      (j) =>
        j.repairRoute === "store_self" &&
        j.status === "customer_rejected" &&
        jobVisibleToStoreUser(j, user),
    );
  }, [jobs, user]);

  function techName(id: string | null | undefined): string {
    if (!id) return "—";
    return technicians.find((t) => t.id === id)?.fullName ?? id;
  }

  async function ensureSparePrice(spareId: string) {
    if (!spareId || unitPriceBySpareId[spareId] != null) return;
    try {
      const q = user?.regionId ? `?regionId=${encodeURIComponent(user.regionId)}` : "";
      const out = await apiJson<{ prices: Array<{ price: number }> }>(
        `/api/catalog/spares/${encodeURIComponent(spareId)}/prices${q}`,
      );
      const price = Number(out.prices?.[0]?.price ?? 0);
      setUnitPriceBySpareId((prev) => ({ ...prev, [spareId]: price }));
    } catch {
      setUnitPriceBySpareId((prev) => ({ ...prev, [spareId]: 0 }));
    }
  }

  async function assign(job: SrfJob) {
    const technicianId = techByJob[job.id]?.trim();
    if (!technicianId) {
      setMessage({ type: "err", text: "Select a technician first." });
      return;
    }
    const tech = technicians.find((t) => t.id === technicianId);
    if (!tech) {
      setMessage({ type: "err", text: "Technician not found." });
      return;
    }
    setBusyId(job.id);
    setMessage(null);
    try {
      await storeSelfAssignTechnician(job.id, technicianId);
      const technicianLabel = `${tech.fullName} (${tech.grade})`;
      setAssignAck({
        reference: job.reference,
        customerName: job.customerName,
        watchLabel: `${job.watchBrand} ${job.watchModel} · ${job.serial}`,
        technicianLabel,
        job: { ...job, status: "store_self_working", assignedTechnicianId: technicianId },
      });
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "Could not assign." });
    } finally {
      setBusyId(null);
    }
  }

  function openReestimatePopup(jobId: string) {
    const job = jobs.find((j) => j.id === jobId);
    setReestimatePopupJobId(jobId);
    setReestimatePreviousInr(Number(job?.estimateTotalInr ?? 0));
    setReestimateAmountInput("");
    setReestimateRemarkInput("");
  }

  function closeReestimatePopup() {
    setReestimatePopupJobId(null);
    setReestimatePreviousInr(0);
    setReestimateAmountInput("");
    setReestimateRemarkInput("");
  }

  async function confirmReestimateRequest() {
    if (!reestimatePopupJobId) return;
    const amount = Number(reestimateAmountInput);
    const note = reestimateRemarkInput.trim();
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage({ type: "err", text: "Enter a valid re-estimate amount." });
      return;
    }
    if (!note) {
      setMessage({ type: "err", text: "Enter re-estimate remark." });
      return;
    }
    setBusyId(reestimatePopupJobId);
    setMessage(null);
    try {
      await storeSelfRequestReestimate(reestimatePopupJobId, { estimateTotalInr: amount, note });
      setMessage({ type: "ok", text: "Re-estimate sent to customer for approval." });
      closeReestimatePopup();
    } catch (e) {
      setMessage({
        type: "err",
        text: e instanceof ApiError ? e.message : "Could not send re-estimate.",
      });
    } finally {
      setBusyId(null);
    }
  }

  function openRepairPopup(jobId: string) {
    const job = jobs.find((j) => j.id === jobId);
    setRepairPopupJobId(jobId);
    setRepairPopupError("");
    if (job?.usedSpares && job.usedSpares.length > 0) {
      setRepairLines(
        job.usedSpares.map((u) => ({
          spareId: u.spareId ?? "",
          qty: String(u.qty ?? 1),
        })),
      );
    } else {
      setRepairLines([{ spareId: "", qty: "1" }]);
    }
  }

  function closeRepairPopup() {
    setRepairPopupJobId(null);
    setRepairLines([{ spareId: "", qty: "1" }]);
    setRepairPopupError("");
  }

  async function confirmRepairWithSpares() {
    if (!repairPopupJobId || repairSaving) return;
    const jobId = repairPopupJobId;
    const job = jobs.find((j) => j.id === jobId);
    const lines = repairLines
      .map((x) => ({ spareId: x.spareId, qty: Number(x.qty) }))
      .filter((x) => x.spareId && Number.isFinite(x.qty) && x.qty > 0)
      .map((x) => {
        const spare = activeSpares.find((s) => s.id === x.spareId);
        const unitPriceInr = Number(unitPriceBySpareId[x.spareId] ?? spare?.sellingPriceInr ?? spare?.mrpInr ?? 0);
        return {
          spareId: x.spareId,
          name: spare?.name ?? x.spareId,
          qty: x.qty,
          unitPriceInr,
          lineTotalInr: unitPriceInr * x.qty,
        };
      });
    if (lines.length === 0) {
      setRepairPopupError("Add at least one used spare from inventory.");
      return;
    }
    setRepairSaving(true);
    setRepairPopupError("");
    try {
      await storeSelfSubmitSparesSlip(jobId, lines);
      await storeSelfMarkRepairComplete(jobId);
      closeRepairPopup();
      if (job) {
        setCompleteAck({
          reference: job.reference,
          customerName: job.customerName,
          watchLabel: `${job.watchBrand} ${job.watchModel}`.trim(),
        });
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Could not complete repair.";
      setRepairPopupError(msg);
    } finally {
      setRepairSaving(false);
    }
  }

  return (
    <div>
      <ServiceBreadcrumb current="Store assign" />
      <PageHeader
        title="Store assign"
        subtitle="Repair by self: assign technician → working → record spares → complete → store billing."
      />
      {message ? (
        <p
          className={`mb-4 rounded-xl px-4 py-2 text-sm ${
            message.type === "ok" ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-800"
          }`}
        >
          {message.text}
        </p>
      ) : null}

      <Card title={`Pending assign · ${pending.length}`} subtitle="Booked as repair by self — not sent to dispatch.">
        {pending.length === 0 ? (
          <p className="text-sm text-stone-600">No SRFs waiting for assignment.</p>
        ) : (
          <div className="space-y-3">
            {pending.map((job) => (
              <JobRow key={job.id} job={job} statusLabel={statusDisplay(job.status)}>
                <label className="block text-xs font-semibold text-stone-700">
                  Technician
                  <select
                    className="mt-1 w-full max-w-xs rounded-xl border border-zimson-200 px-3 py-2 text-sm"
                    value={techByJob[job.id] ?? ""}
                    onChange={(e) => setTechByJob((m) => ({ ...m, [job.id]: e.target.value }))}
                  >
                    <option value="">Select…</option>
                    {technicians.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.fullName} ({t.grade})
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={busyId === job.id}
                  onClick={() => void assign(job)}
                  className="mt-2 rounded-xl bg-zimson-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Assign repair
                </button>
              </JobRow>
            ))}
          </div>
        )}
      </Card>

      <div className="mt-6">
        <Card title={`Working · ${working.length}`} subtitle="Technician is repairing the watch at your store.">
          {working.length === 0 ? (
            <p className="text-sm text-stone-600">No watches in repair right now.</p>
          ) : (
            <div className="space-y-3">
              {working.map((job) => (
                <JobRow
                  key={job.id}
                  job={job}
                  statusLabel={statusDisplay(job.status)}
                  extra={
                    <>
                      <p className="text-xs text-stone-600">Technician: {techName(job.assignedTechnicianId)}</p>
                      {job.sparesSlipSubmittedAt ? (
                        <p className="text-xs text-emerald-700">Spares slip saved</p>
                      ) : null}
                    </>
                  }
                >
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyId === job.id}
                      onClick={() => openRepairPopup(job.id)}
                      className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      Watch repair complete
                    </button>
                    <button
                      type="button"
                      disabled={busyId === job.id}
                      onClick={() => openReestimatePopup(job.id)}
                      className="rounded-xl border border-amber-500 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-950 disabled:opacity-50"
                    >
                      Need re-estimate
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-stone-500">
                    Complete repair with spares, or send a revised estimate to the customer for approval.
                  </p>
                </JobRow>
              ))}
            </div>
          )}
          <p className="mt-4 text-sm text-stone-600">
            <Link to="/service/store-billing" className="font-semibold text-zimson-800 underline">
              Go to store billing
            </Link>{" "}
            after completion to raise the customer invoice.
          </p>
        </Card>
      </div>

      {(awaitingReestimate.length > 0 || rejectedReestimate.length > 0) ? (
        <div className="mt-6">
          <Card
            title={`Re-estimate · ${awaitingReestimate.length + rejectedReestimate.length}`}
            subtitle="Customer must approve from the tracking link before repair can continue."
          >
            <div className="space-y-3">
              {awaitingReestimate.map((job) => (
                <JobRow key={job.id} job={job} statusLabel="Awaiting customer">
                  <p className="text-xs text-amber-900">
                    Revised amount: INR {Number(job.reestimateRequestedInr ?? 0).toLocaleString()}
                    {job.reestimateRequestedNote ? ` · ${job.reestimateRequestedNote}` : ""}
                  </p>
                </JobRow>
              ))}
              {rejectedReestimate.map((job) => (
                <JobRow key={job.id} job={job} statusLabel="Customer rejected">
                  <button
                    type="button"
                    disabled={busyId === job.id}
                    onClick={() => openReestimatePopup(job.id)}
                    className="rounded-xl border border-amber-600 bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Negotiate &amp; send re-estimate
                  </button>
                </JobRow>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      {reestimatePopupJobId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-zimson-900">Request re-estimate approval</h3>
            <p className="mt-1 text-sm text-stone-600">Enter revised estimate amount and remarks for customer approval.</p>
            <div className="mt-4 grid gap-3">
              <label className="text-sm">
                Previous estimate (INR)
                <input
                  className={`${inputClassReadOnly} mt-1 w-full rounded-xl border border-zimson-200 px-3 py-2 text-sm`}
                  value={reestimatePreviousInr > 0 ? formatInr(reestimatePreviousInr) : "—"}
                  readOnly
                  tabIndex={-1}
                />
              </label>
              <label className="text-sm">
                New re-estimate amount (INR) *
                <input
                  className="mt-1 w-full rounded-xl border border-zimson-300 bg-white px-3 py-2 text-sm"
                  value={reestimateAmountInput}
                  onChange={(e) => setReestimateAmountInput(e.target.value)}
                  placeholder="Enter revised amount"
                  autoFocus
                />
              </label>
              <label className="text-sm">
                Remarks
                <textarea
                  className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
                  rows={3}
                  value={reestimateRemarkInput}
                  onChange={(e) => setReestimateRemarkInput(e.target.value)}
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={closeReestimatePopup} className="rounded-xl border border-zimson-300 px-4 py-2 text-sm">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmReestimateRequest()}
                className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white"
              >
                Send to customer
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {repairPopupJobId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-zimson-900">Used spares</h3>
            <p className="mt-1 text-sm text-stone-600">
              Record parts used for this repair, then the SRF will be marked complete and sent to billing.
            </p>
            {repairPopupError ? (
              <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900" role="alert">
                {repairPopupError}
              </p>
            ) : null}
            <div className="mt-4 space-y-3">
              {repairLines.map((line, idx) => {
                const spare = activeSpares.find((s) => s.id === line.spareId);
                const unit = Number(unitPriceBySpareId[line.spareId] ?? spare?.sellingPriceInr ?? spare?.mrpInr ?? 0);
                const qty = Number(line.qty || 0);
                return (
                  <div key={idx} className="grid grid-cols-12 gap-2">
                    <select
                      value={line.spareId}
                      onChange={(e) => {
                        const nextId = e.target.value;
                        setRepairPopupError("");
                        setRepairLines((prev) => prev.map((x, i) => (i === idx ? { ...x, spareId: nextId } : x)));
                        void ensureSparePrice(nextId);
                      }}
                      disabled={repairSaving}
                      className="col-span-8 rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm disabled:opacity-60"
                    >
                      <option value="">Select spare…</option>
                      {activeSpares.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.sku} — {s.name}
                        </option>
                      ))}
                    </select>
                    <input
                      value={line.qty}
                      onChange={(e) => {
                        setRepairPopupError("");
                        setRepairLines((prev) => prev.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)));
                      }}
                      disabled={repairSaving}
                      className="col-span-3 rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm disabled:opacity-60"
                      placeholder="Qty"
                    />
                    <button
                      type="button"
                      onClick={() => setRepairLines((prev) => prev.filter((_, i) => i !== idx))}
                      disabled={repairSaving || repairLines.length <= 1}
                      className="col-span-1 rounded-xl border border-zimson-300 bg-white text-sm disabled:opacity-40"
                    >
                      ×
                    </button>
                    <div className="col-span-12 text-xs text-stone-600">
                      Line amount: INR {(unit * (Number.isFinite(qty) ? qty : 0)).toFixed(2)}
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setRepairLines((prev) => [...prev, { spareId: "", qty: "1" }])}
              disabled={repairSaving}
              className="mt-3 rounded-xl border border-zimson-300 bg-white px-4 py-2 text-sm font-semibold text-zimson-900 disabled:opacity-60"
            >
              Add spare row
            </button>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeRepairPopup}
                disabled={repairSaving}
                className="rounded-xl border border-zimson-300 px-4 py-2 text-sm disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmRepairWithSpares()}
                disabled={repairSaving}
                className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-70"
              >
                {repairSaving ? "Saving…" : "Save spares & complete SRF"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {assignAck ? (
        <ProcessSuccessModal
          open
          title="Technician assigned — repair in progress"
          description={`${assignAck.reference} · ${assignAck.technicianLabel}`}
          onBackdropClick={() => setAssignAck(null)}
          actions={
            <>
              <button
                type="button"
                className="inline-flex w-full min-w-0 items-center justify-center rounded-xl bg-rlx-green px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rlx-green/90 sm:w-auto"
                onClick={() =>
                  printAssignmentSlip(assignAck.job, assignAck.technicianLabel, {
                    assignedAt: assignAck.job.assignedAt ? new Date(assignAck.job.assignedAt) : new Date(),
                    serviceCentreLabel: assignAck.job.regionName,
                  })
                }
              >
                Print technician notes
              </button>
              <button
                type="button"
                className="inline-flex w-full min-w-0 items-center justify-center rounded-xl border border-rlx-rule bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 sm:w-auto"
                onClick={() => setAssignAck(null)}
              >
                Done
              </button>
            </>
          }
        >
          <div className="rounded-xl border-2 border-rlx-green/30 bg-rlx-green/5 px-4 py-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-rlx-green">SRF reference</p>
            <p className="mt-1 font-mono text-2xl font-bold text-stone-900">{assignAck.reference}</p>
          </div>
          <p className="mt-3 text-sm text-stone-700">
            <span className="font-semibold text-stone-900">{assignAck.customerName}</span>
            {" · "}
            {assignAck.watchLabel}
          </p>
          <p className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
            Status is now <strong>Working</strong>. When repair is finished, use <strong>Watch repair complete</strong> to
            record spares and close the SRF for billing.
          </p>
        </ProcessSuccessModal>
      ) : null}

      {completeAck ? (
        <ProcessSuccessModal
          open
          title="SRF repair completed"
          description="Ready for customer billing at your store."
          onBackdropClick={() => setCompleteAck(null)}
          actions={
            <>
              <Link
                to="/service/store-billing"
                className="inline-flex w-full min-w-0 items-center justify-center rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 sm:w-auto"
                onClick={() => setCompleteAck(null)}
              >
                Go to store billing
              </Link>
              <button
                type="button"
                className="inline-flex w-full min-w-0 items-center justify-center rounded-xl border border-rlx-rule bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 sm:w-auto"
                onClick={() => setCompleteAck(null)}
              >
                Done
              </button>
            </>
          }
        >
          <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/80 px-4 py-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">SRF reference</p>
            <p className="mt-1 font-mono text-2xl font-bold text-emerald-900">{completeAck.reference}</p>
          </div>
          <p className="mt-3 text-sm text-stone-700">
            <span className="font-semibold text-stone-900">{completeAck.customerName}</span>
            {" · "}
            {completeAck.watchLabel}
          </p>
          <p className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2 text-sm font-medium text-emerald-900">
            Used spares are saved. Raise the tax invoice on the store billing screen when the customer collects the watch.
          </p>
        </ProcessSuccessModal>
      ) : null}
    </div>
  );
}

function JobRow({
  job,
  children,
  extra,
  statusLabel,
}: {
  job: SrfJob;
  children: ReactNode;
  extra?: ReactNode;
  statusLabel?: string;
}) {
  return (
    <div className="rounded-xl border border-zimson-100 bg-white p-4 text-sm shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-mono font-semibold text-zimson-900">{job.reference}</p>
          <p className="text-stone-700">
            {job.customerName} · {job.watchBrand} {job.watchModel}
          </p>
          <p className="text-xs text-stone-500">{repairRouteLabel(job.repairRoute)}</p>
          {extra}
        </div>
        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-900">
          {statusLabel ?? job.status.replace(/_/g, " ")}
        </span>
      </div>
      <div className="mt-3 border-t border-stone-100 pt-3">{children}</div>
    </div>
  );
}
