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
import { formatInr, formatApproxEstimateInr, formatApproxEstimateInrPlain } from "../../lib/formatInr";
import {
  resolveSparePriceFromLines,
  spareMasterSellingPrice,
  sparePriceCacheKey,
} from "../../lib/spareSellingPrice";
import { srfReestimateNotifyMessage } from "../../lib/srfApprovalWhatsApp";
import { repairRouteLabel, storeSelfStatusLabel, SRF_ROUTE_LABEL_INSTORE, SRF_ROUTE_LABEL_SEND_TO_SC } from "../../lib/srfRepairRoute";
import { inputClassReadOnly } from "../../lib/uiForm";
import type { SparePriceLine, SpareStockRow } from "../../types/spare";
import type { SrfJob } from "../../types/srfJob";

type TechnicianProfile = {
  id: string;
  fullName: string;
  grade: string;
  isActive: boolean;
};

function TechnicianIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.7 6.3a4 4 0 10-4.9 4.9L4 17v3h3l5.8-5.8a4 4 0 004.9-4.9l-2.6 2.6-2-2 2.6-2.6z" />
    </svg>
  );
}

function ChevronDownIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
    </svg>
  );
}

function AssignCheckIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75l2.25 2.25 6-6.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

type SpareLineDraft = { spareId: string; qty: string };

function isStoreSelfWorking(job: SrfJob): boolean {
  return (
    job.repairRoute === "store_self" &&
    (job.status === "store_self_working" || job.status === "store_self_assigned")
  );
}

function statusDisplay(status: string): string {
  if (status.startsWith("store_self_")) return storeSelfStatusLabel(status);
  return status.replace(/_/g, " ");
}

export function StoreAssignPage() {
  const { user } = useAuth();
  const { activeSpares } = useSpares();
  const { jobs, storeSelfAssignTechnician, storeSelfSubmitSparesSlip, storeSelfMarkRepairComplete, storeSelfRequestReestimate, storeSelfReturnWithoutRepair, storeSelfSendToHo } =
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
  const [storeStockBySpareId, setStoreStockBySpareId] = useState<Record<string, number>>({});
  const [repairPopupError, setRepairPopupError] = useState("");
  const [repairSaving, setRepairSaving] = useState(false);

  const repairPopupJob = useMemo(
    () => (repairPopupJobId ? jobs.find((j) => j.id === repairPopupJobId) ?? null : null),
    [repairPopupJobId, jobs],
  );

  const [completeAck, setCompleteAck] = useState<{
    reference: string;
    customerName: string;
    watchLabel: string;
  } | null>(null);

  const [reestimatePopupJobId, setReestimatePopupJobId] = useState<string | null>(null);
  const [reestimatePreviousInr, setReestimatePreviousInr] = useState(0);
  const [reestimateAmountInput, setReestimateAmountInput] = useState("");
  const [reestimateRemarkInput, setReestimateRemarkInput] = useState("");

  const [returnWithoutRepairJobId, setReturnWithoutRepairJobId] = useState<string | null>(null);
  const [returnWithoutRepairNote, setReturnWithoutRepairNote] = useState("");
  const [returnAck, setReturnAck] = useState<{
    reference: string;
    customerName: string;
    watchLabel: string;
  } | null>(null);

  const [sendToHoJobId, setSendToHoJobId] = useState<string | null>(null);
  const [sendToHoNote, setSendToHoNote] = useState("");
  const [sendToHoAck, setSendToHoAck] = useState<{
    reference: string;
    customerName: string;
    watchLabel: string;
  } | null>(null);

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

  function resolveSpareUnitPrice(spareId: string, watchBrand: string): number {
    if (!spareId) return 0;
    const cached = unitPriceBySpareId[sparePriceCacheKey(spareId, watchBrand)];
    if (cached != null) return cached;
    const spare = activeSpares.find((s) => s.id === spareId);
    return spareMasterSellingPrice(spare);
  }

  async function ensureSparePrice(spareId: string, watchBrand: string): Promise<number> {
    if (!spareId) return 0;
    const cacheKey = sparePriceCacheKey(spareId, watchBrand);
    if (unitPriceBySpareId[cacheKey] != null) return unitPriceBySpareId[cacheKey]!;
    const spare = activeSpares.find((s) => s.id === spareId);
    const fromMaster = spareMasterSellingPrice(spare);
    let price = fromMaster;
    try {
      const q = user?.regionId ? `?regionId=${encodeURIComponent(user.regionId)}` : "";
      const out = await apiJson<{ prices: SparePriceLine[] }>(
        `/api/catalog/spares/${encodeURIComponent(spareId)}/prices${q}`,
      );
      price = resolveSparePriceFromLines(out.prices, watchBrand, fromMaster);
    } catch {
      price = fromMaster;
    }
    setUnitPriceBySpareId((prev) => ({ ...prev, [cacheKey]: price }));
    return price;
  }

  async function fetchStoreStockQty(spareId: string): Promise<number> {
    if (!spareId) return 0;
    if (storeStockBySpareId[spareId] != null) return storeStockBySpareId[spareId]!;
    try {
      const out = await apiJson<{ stock: SpareStockRow[] }>(
        `/api/catalog/spares/${encodeURIComponent(spareId)}/stock`,
      );
      const qty = out.stock.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0);
      setStoreStockBySpareId((prev) => ({ ...prev, [spareId]: qty }));
      return qty;
    } catch {
      setStoreStockBySpareId((prev) => ({ ...prev, [spareId]: 0 }));
      return 0;
    }
  }

  async function validateRepairStock(): Promise<string | null> {
    const usage = new Map<string, { qty: number; name: string }>();
    for (const line of repairLines) {
      const spareId = line.spareId.trim();
      const qty = Number(line.qty);
      if (!spareId || !Number.isFinite(qty) || qty <= 0) continue;
      const spare = activeSpares.find((s) => s.id === spareId);
      const prev = usage.get(spareId) ?? { qty: 0, name: spare?.name ?? spareId };
      usage.set(spareId, { qty: prev.qty + qty, name: prev.name });
    }
    for (const [spareId, entry] of usage.entries()) {
      const available = await fetchStoreStockQty(spareId);
      if (available <= 0) {
        return `${entry.name} is out of stock at your store.`;
      }
      if (available < entry.qty) {
        return `Insufficient store stock for ${entry.name}. Available ${available}, required ${entry.qty}.`;
      }
    }
    return null;
  }

  useEffect(() => {
    if (!repairPopupJobId) return;
    void Promise.all(activeSpares.map((s) => fetchStoreStockQty(s.id))).catch(() => {});
  }, [repairPopupJobId, activeSpares]);

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
      const notify = await storeSelfRequestReestimate(reestimatePopupJobId, { estimateTotalInr: amount, note });
      setMessage({
        type: "ok",
        text: srfReestimateNotifyMessage("Re-estimate sent to customer for approval.", notify),
      });
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

  async function confirmReturnWithoutRepair() {
    if (!returnWithoutRepairJobId) return;
    const job = jobs.find((j) => j.id === returnWithoutRepairJobId);
    setBusyId(returnWithoutRepairJobId);
    setMessage(null);
    try {
      await storeSelfReturnWithoutRepair(returnWithoutRepairJobId, returnWithoutRepairNote.trim());
      setReturnWithoutRepairJobId(null);
      setReturnWithoutRepairNote("");
      if (job) {
        setReturnAck({
          reference: job.reference,
          customerName: job.customerName,
          watchLabel: `${job.watchBrand} ${job.watchModel}`.trim(),
        });
      } else {
        setMessage({
          type: "ok",
          text: "Watch marked for return without repair — continue in store billing.",
        });
      }
    } catch (e) {
      setMessage({
        type: "err",
        text: e instanceof ApiError ? e.message : "Could not return watch without repair.",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function confirmSendToHo() {
    if (!sendToHoJobId) return;
    const job = jobs.find((j) => j.id === sendToHoJobId);
    setBusyId(sendToHoJobId);
    setMessage(null);
    try {
      await storeSelfSendToHo(sendToHoJobId, sendToHoNote.trim());
      setSendToHoJobId(null);
      setSendToHoNote("");
      if (job) {
        setSendToHoAck({
          reference: job.reference,
          customerName: job.customerName,
          watchLabel: `${job.watchBrand} ${job.watchModel}`.trim(),
        });
      } else {
        setMessage({
          type: "ok",
          text: "SRF moved to store dispatch — create outward transfer to HO.",
        });
      }
    } catch (e) {
      setMessage({
        type: "err",
        text: e instanceof ApiError ? e.message : "Could not send SRF to HO.",
      });
    } finally {
      setBusyId(null);
    }
  }

  function openRepairPopup(jobId: string) {
    const job = jobs.find((j) => j.id === jobId);
    setRepairPopupJobId(jobId);
    setRepairPopupError("");
    const initialLines =
      job?.usedSpares && job.usedSpares.length > 0
        ? job.usedSpares.map((u) => ({
            spareId: u.spareId ?? "",
            qty: String(u.qty ?? 1),
          }))
        : [{ spareId: "", qty: "1" }];
    setRepairLines(initialLines);
    const watchBrand = job?.watchBrand ?? "";
    for (const line of initialLines) {
      if (!line.spareId) continue;
      void ensureSparePrice(line.spareId, watchBrand);
      void fetchStoreStockQty(line.spareId);
    }
  }

  function closeRepairPopup() {
    setRepairPopupJobId(null);
    setRepairLines([{ spareId: "", qty: "1" }]);
    setRepairPopupError("");
    setUnitPriceBySpareId({});
    setStoreStockBySpareId({});
  }

  async function confirmRepairWithSpares() {
    if (!repairPopupJobId || repairSaving) return;
    const jobId = repairPopupJobId;
    const job = jobs.find((j) => j.id === jobId);
    const watchBrand = job?.watchBrand ?? "";
    const lines = [];
    for (const x of repairLines) {
      const spareId = x.spareId.trim();
      const qty = Number(x.qty);
      if (!spareId || !Number.isFinite(qty) || qty <= 0) continue;
      const spare = activeSpares.find((s) => s.id === spareId);
      const unitPriceInr = await ensureSparePrice(spareId, watchBrand);
      lines.push({
        spareId,
        name: spare?.name ?? spareId,
        sku: spare?.sku ?? "",
        qty,
        unitPriceInr,
        lineTotalInr: unitPriceInr * qty,
      });
    }
    if (lines.length === 0) {
      setRepairPopupError("Add at least one used spare from inventory.");
      return;
    }
    const noPrice = lines.find((x) => Number(x.unitPriceInr ?? 0) <= 0);
    if (noPrice) {
      const label = noPrice.sku ? `${noPrice.name} (${noPrice.sku})` : noPrice.name;
      setRepairPopupError(
        `Selling price not assigned for ${label}${watchBrand ? ` — add ${watchBrand} price under Inventory → Spare catalogue` : ""}.`,
      );
      return;
    }
    const stockErr = await validateRepairStock();
    if (stockErr) {
      setRepairPopupError(stockErr);
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
        subtitle={`${SRF_ROUTE_LABEL_INSTORE}: assign technician → working → record spares → complete → store billing.`}
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

      <Card title={`Pending assign · ${pending.length}`} subtitle={`Booked as ${SRF_ROUTE_LABEL_INSTORE.toLowerCase()} — not sent to dispatch.`}>
        {pending.length === 0 ? (
          <p className="text-sm text-stone-600">No SRFs waiting for assignment.</p>
        ) : (
          <div className="space-y-3">
            {pending.map((job) => (
              <JobRow key={job.id} job={job} statusLabel={statusDisplay(job.status)}>
                <div className="rounded-xl border border-zimson-100 bg-zimson-50/50 p-3 sm:p-3.5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
                    <label className="block flex-1">
                      <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-zimson-800">
                        <TechnicianIcon />
                        Technician
                      </span>
                      <div className="relative">
                        <select
                          className="w-full appearance-none rounded-xl border border-zimson-200 bg-white px-3.5 py-2.5 pr-9 text-sm font-medium text-stone-800 shadow-sm transition focus:border-zimson-500 focus:outline-none focus:ring-2 focus:ring-zimson-400/30 sm:max-w-xs"
                          value={techByJob[job.id] ?? ""}
                          onChange={(e) => setTechByJob((m) => ({ ...m, [job.id]: e.target.value }))}
                        >
                          <option value="">Select technician…</option>
                          {technicians.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.fullName} ({t.grade})
                            </option>
                          ))}
                        </select>
                        <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                      </div>
                    </label>
                    <button
                      type="button"
                      disabled={busyId === job.id}
                      onClick={() => void assign(job)}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-zimson-500 to-zimson-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-zimson-600 hover:to-zimson-700 hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:shrink-0"
                    >
                      <AssignCheckIcon />
                      {busyId === job.id ? "Assigning…" : "Assign repair"}
                    </button>
                  </div>
                </div>
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
                    <button
                      type="button"
                      disabled={busyId === job.id}
                      onClick={() => {
                        setSendToHoJobId(job.id);
                        setSendToHoNote("");
                      }}
                      className="rounded-xl border border-zimson-600 bg-white px-4 py-2 text-sm font-semibold text-zimson-800 hover:bg-zimson-50 disabled:opacity-50"
                    >
                      {SRF_ROUTE_LABEL_SEND_TO_SC}
                    </button>
                  </div>
                </JobRow>
              ))}
            </div>
          )}
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
                    Revised amount (approx.): {formatApproxEstimateInrPlain(Number(job.reestimateRequestedInr ?? 0), 0)}
                    {job.reestimateRequestedNote ? ` · ${job.reestimateRequestedNote}` : ""}
                  </p>
                </JobRow>
              ))}
              {rejectedReestimate.map((job) => (
                <JobRow key={job.id} job={job} statusLabel="Customer rejected">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyId === job.id}
                      onClick={() => openReestimatePopup(job.id)}
                      className="rounded-xl border border-amber-600 bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      Negotiate &amp; send re-estimate
                    </button>
                    <button
                      type="button"
                      disabled={busyId === job.id}
                      onClick={() => {
                        setReturnWithoutRepairJobId(job.id);
                        setReturnWithoutRepairNote("");
                      }}
                      className="rounded-xl border border-rose-600 bg-white px-4 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-50 disabled:opacity-50"
                    >
                      Return to customer without repair
                    </button>
                  </div>
                </JobRow>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      {sendToHoJobId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-zimson-900">{SRF_ROUTE_LABEL_SEND_TO_SC}</h3>
            <p className="mt-1 text-sm text-stone-600">
              The watch cannot be repaired at your store. It will move to the{" "}
              <strong>Store dispatch</strong> outward queue so you can create a transfer to the centralized service
              centre.
            </p>
            <label className="mt-4 block text-sm">
              Remarks (optional)
              <textarea
                className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
                rows={3}
                value={sendToHoNote}
                onChange={(e) => setSendToHoNote(e.target.value)}
                placeholder="e.g. Movement issue — requires HO workshop"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setSendToHoJobId(null);
                  setSendToHoNote("");
                }}
                className="rounded-xl border border-zimson-300 px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmSendToHo()}
                className="rounded-xl bg-zimson-700 px-4 py-2 text-sm font-semibold text-white"
              >
                Send to dispatch
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {returnWithoutRepairJobId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-rose-900">Return watch without repair</h3>
            <p className="mt-1 text-sm text-stone-600">
              Customer and store could not agree on re-estimate. The watch will be sent to store billing for
              handover to the customer — no tax invoice.
            </p>
            <label className="mt-4 block text-sm">
              Remarks (optional)
              <textarea
                className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
                rows={3}
                value={returnWithoutRepairNote}
                onChange={(e) => setReturnWithoutRepairNote(e.target.value)}
                placeholder="e.g. Customer declined revised estimate; watch returned as-is"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setReturnWithoutRepairJobId(null);
                  setReturnWithoutRepairNote("");
                }}
                className="rounded-xl border border-zimson-300 px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmReturnWithoutRepair()}
                className="rounded-xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white"
              >
                Send to billing
              </button>
            </div>
          </div>
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
                  value={reestimatePreviousInr > 0 ? formatApproxEstimateInr(reestimatePreviousInr) : "—"}
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
                const watchBrand = repairPopupJob?.watchBrand ?? "";
                const unit = resolveSpareUnitPrice(line.spareId, watchBrand);
                const qty = Number(line.qty || 0);
                const storeStock = line.spareId ? storeStockBySpareId[line.spareId] : undefined;
                const lineShort =
                  line.spareId && storeStock != null && Number.isFinite(qty) && qty > 0 && qty > storeStock;
                const outOfStock = line.spareId && storeStock != null && storeStock <= 0;
                const noPrice = line.spareId && unit <= 0;
                return (
                  <div key={idx} className="grid grid-cols-12 gap-2">
                    <select
                      value={line.spareId}
                      onChange={(e) => {
                        const nextId = e.target.value;
                        setRepairPopupError("");
                        if (nextId) {
                          void (async () => {
                            const stock = await fetchStoreStockQty(nextId);
                            if (stock <= 0) {
                              const picked = activeSpares.find((s) => s.id === nextId);
                              setRepairPopupError(
                                `${picked?.name ?? "Spare"} (${picked?.sku ?? nextId}) is out of stock at your store.`,
                              );
                              return;
                            }
                            const price = await ensureSparePrice(nextId, watchBrand);
                            if (price <= 0) {
                              const picked = activeSpares.find((s) => s.id === nextId);
                              setRepairPopupError(
                                `Selling price not assigned for ${picked?.name ?? "spare"} (${picked?.sku ?? nextId})${watchBrand ? ` — add ${watchBrand} price in Inventory` : ""}.`,
                              );
                              return;
                            }
                            setRepairLines((prev) =>
                              prev.map((x, i) => (i === idx ? { ...x, spareId: nextId } : x)),
                            );
                          })();
                          return;
                        }
                        setRepairLines((prev) => prev.map((x, i) => (i === idx ? { ...x, spareId: nextId } : x)));
                      }}
                      disabled={repairSaving}
                      className="col-span-8 rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm disabled:opacity-60"
                    >
                      <option value="">Select spare…</option>
                      {activeSpares.map((s) => {
                        const stock = storeStockBySpareId[s.id];
                        const stockHint =
                          stock != null ? (stock <= 0 ? " · Out of stock" : ` · Stock ${stock}`) : "";
                        return (
                          <option key={s.id} value={s.id}>
                            {s.sku} — {s.name}
                            {stockHint}
                          </option>
                        );
                      })}
                    </select>
                    <input
                      value={line.qty}
                      onChange={(e) => {
                        setRepairPopupError("");
                        setRepairLines((prev) => prev.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)));
                      }}
                      disabled={repairSaving}
                      className={`col-span-3 rounded-xl border bg-zimson-50/50 px-3 py-2 text-sm disabled:opacity-60 ${
                        lineShort ? "border-rose-400" : "border-zimson-300"
                      }`}
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
                      Line amount: {unit > 0 ? formatInr(unit * (Number.isFinite(qty) ? qty : 0)) : "—"}
                      {line.spareId ? (
                        <span
                          className={
                            lineShort || outOfStock || noPrice
                              ? " ml-2 font-semibold text-rose-700"
                              : " ml-2 text-stone-500"
                          }
                        >
                          · Store stock: {storeStock != null ? storeStock : "…"}
                          {outOfStock ? " (out of stock)" : ""}
                          {lineShort && !outOfStock ? ` (need ${qty}, only ${storeStock} available)` : ""}
                          {noPrice ? " · Selling price not assigned" : ""}
                        </span>
                      ) : null}
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

      {sendToHoAck ? (
        <ProcessSuccessModal
          open
          title="Ready for store dispatch"
          description="Create outward transfer to send the watch to the centralized service centre."
          onBackdropClick={() => setSendToHoAck(null)}
          actions={
            <>
              <Link
                to="/service/store-dispatch"
                className="inline-flex w-full min-w-0 items-center justify-center rounded-xl bg-zimson-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-800 sm:w-auto"
                onClick={() => setSendToHoAck(null)}
              >
                Go to store dispatch
              </Link>
              <button
                type="button"
                className="inline-flex w-full min-w-0 items-center justify-center rounded-xl border border-rlx-rule bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 sm:w-auto"
                onClick={() => setSendToHoAck(null)}
              >
                Done
              </button>
            </>
          }
        >
          <div className="rounded-xl border-2 border-zimson-200 bg-zimson-50/80 px-4 py-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zimson-800">SRF reference</p>
            <p className="mt-1 font-mono text-2xl font-bold text-zimson-950">{sendToHoAck.reference}</p>
          </div>
          <p className="mt-3 text-sm text-stone-700">
            <span className="font-semibold text-stone-900">{sendToHoAck.customerName}</span>
            {" · "}
            {sendToHoAck.watchLabel}
          </p>
          <p className="mt-3 rounded-lg border border-zimson-100 bg-zimson-50/50 px-3 py-2 text-sm font-medium text-zimson-900">
            Select this SRF in <strong>Outward SRF</strong> and create an internal transfer to the service centre.
          </p>
        </ProcessSuccessModal>
      ) : null}

      {returnAck ? (
        <ProcessSuccessModal
          open
          title="Ready for customer handover"
          description="No repair — complete handover in store billing."
          onBackdropClick={() => setReturnAck(null)}
          actions={
            <>
              <Link
                to="/service/store-billing"
                className="inline-flex w-full min-w-0 items-center justify-center rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-800 sm:w-auto"
                onClick={() => setReturnAck(null)}
              >
                Go to store billing
              </Link>
              <button
                type="button"
                className="inline-flex w-full min-w-0 items-center justify-center rounded-xl border border-rlx-rule bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 sm:w-auto"
                onClick={() => setReturnAck(null)}
              >
                Done
              </button>
            </>
          }
        >
          <div className="rounded-xl border-2 border-rose-200 bg-rose-50/80 px-4 py-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-rose-800">SRF reference</p>
            <p className="mt-1 font-mono text-2xl font-bold text-rose-950">{returnAck.reference}</p>
          </div>
          <p className="mt-3 text-sm text-stone-700">
            <span className="font-semibold text-stone-900">{returnAck.customerName}</span>
            {" · "}
            {returnAck.watchLabel}
          </p>
          <p className="mt-3 rounded-lg border border-rose-100 bg-rose-50/50 px-3 py-2 text-sm font-medium text-rose-900">
            Select this SRF in store billing and use <strong>Handover to customer without billing</strong> after OTP.
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
            B2B jobs will receive a mandatory GST e-invoice (IRN) at billing close when e-doc is enabled.
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
    <div className="group rounded-2xl border border-zimson-100 bg-white p-4 text-sm shadow-sm transition hover:border-zimson-200 hover:shadow-md sm:p-4.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[13px] font-bold tracking-wide text-zimson-800">{job.reference}</p>
          <p className="mt-0.5 font-medium text-stone-800">
            {job.customerName} <span className="text-stone-400">·</span> {job.watchBrand} {job.watchModel}
          </p>
          <p className="mt-0.5 text-xs text-stone-500">{repairRouteLabel(job.repairRoute)}</p>
          {extra}
        </div>
        <span className="shrink-0 whitespace-nowrap rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-800 ring-1 ring-inset ring-sky-200">
          {statusLabel ?? job.status.replace(/_/g, " ")}
        </span>
      </div>
      <div className="mt-3.5 border-t border-stone-100 pt-3.5">{children}</div>
    </div>
  );
}
