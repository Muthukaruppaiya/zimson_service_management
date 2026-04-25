import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useRegions } from "../../context/RegionsContext";
import { useSpares } from "../../context/SparesContext";
import { useSrfJobs } from "../../context/SrfJobsContext";
import { SEED_TECHNICIANS } from "../../data/serviceSeed";
import { apiJson } from "../../lib/api";
import { jobVisibleToServiceCentre } from "../../lib/srfAccess";
import { printAssignmentSlip } from "../../lib/serviceDocuments";
import type { SparePriceLine } from "../../types/spare";
import { openPrintDocument } from "../../lib/inventoryDocuments";

export function ScSupervisorPage() {
  const { user } = useAuth();
  const { regions } = useRegions();
  const { activeSpares } = useSpares();
  const { jobs, assignTechnician, convertTransferredSrfToLocal, supervisorRequestReestimate, supervisorTransferToOtherHo, submitSparesSlip, supervisorMarkRepairComplete, getStatusHistory } = useSrfJobs();
  const [pickTech, setPickTech] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [historyByJob, setHistoryByJob] = useState<Record<string, Array<{ id: string; status: string; note: string; changedAt: string }>>>({});
  const [reestimatePopupJobId, setReestimatePopupJobId] = useState<string | null>(null);
  const [reestimateAmountInput, setReestimateAmountInput] = useState("");
  const [reestimateRemarkInput, setReestimateRemarkInput] = useState("");
  const [transferPopupJobId, setTransferPopupJobId] = useState<string | null>(null);
  const [transferTargetRegionId, setTransferTargetRegionId] = useState("");
  const [transferNoteInput, setTransferNoteInput] = useState("");
  const [repairPopupJobId, setRepairPopupJobId] = useState<string | null>(null);
  const [repairLines, setRepairLines] = useState<Array<{ spareId: string; qty: string }>>([{ spareId: "", qty: "1" }]);
  const [unitPriceBySpareId, setUnitPriceBySpareId] = useState<Record<string, number>>({});

  const received = useMemo(() => {
    if (!user) return [];
    return jobs.filter(
      (j) => j.status === "received_at_sc" && jobVisibleToServiceCentre(j, user),
    );
  }, [jobs, user]);
  const decisionQueue = useMemo(() => {
    if (!user) return [];
    return jobs.filter(
      (j) =>
        (j.status === "assigned" || j.status === "estimate_ok" || j.status === "reestimate_required") &&
        jobVisibleToServiceCentre(j, user),
    );
  }, [jobs, user]);

  async function handleAssign(jobId: string) {
    const techId = pickTech[jobId];
    if (!techId) {
      setFeedback((f) => ({ ...f, [jobId]: "Choose a technician." }));
      return;
    }
    try {
      await assignTechnician(jobId, techId);
      const job = jobs.find((x) => x.id === jobId);
      const tech = SEED_TECHNICIANS.find((x) => x.id === techId);
      if (job) printAssignmentSlip(job, tech ? `${tech.name} (${tech.grade})` : techId);
      setFeedback((f) => ({ ...f, [jobId]: "Assigned." }));
    } catch (e) {
      setFeedback((f) => ({ ...f, [jobId]: e instanceof Error ? e.message : "Could not assign." }));
    }
  }

  async function convertLocal(jobId: string) {
    try {
      await convertTransferredSrfToLocal(jobId);
      setFeedback((f) => ({ ...f, [jobId]: "Converted to local SRF. You can assign technician now." }));
    } catch (e) {
      setFeedback((f) => ({ ...f, [jobId]: e instanceof Error ? e.message : "Could not convert SRF." }));
    }
  }

  async function toggleHistory(jobId: string) {
    if (historyByJob[jobId]) {
      setHistoryByJob((prev) => {
        const next = { ...prev };
        delete next[jobId];
        return next;
      });
      return;
    }
    try {
      const rows = await getStatusHistory(jobId);
      setHistoryByJob((prev) => ({ ...prev, [jobId]: rows }));
    } catch (e) {
      setFeedback((f) => ({ ...f, [jobId]: e instanceof Error ? e.message : "Could not load history." }));
    }
  }

  function openReestimatePopup(jobId: string) {
    const job = jobs.find((x) => x.id === jobId);
    setReestimatePopupJobId(jobId);
    setReestimateAmountInput(job ? String(Number(job.estimateTotalInr ?? 0).toFixed(2)) : "");
    setReestimateRemarkInput("");
  }

  function closeReestimatePopup() {
    setReestimatePopupJobId(null);
    setReestimateAmountInput("");
    setReestimateRemarkInput("");
  }

  async function confirmReestimateRequest() {
    if (!reestimatePopupJobId) return;
    const amount = Number(reestimateAmountInput);
    const note = reestimateRemarkInput.trim();
    if (!Number.isFinite(amount) || amount <= 0) {
      setFeedback((f) => ({ ...f, [reestimatePopupJobId]: "Enter valid re-estimate amount." }));
      return;
    }
    if (!note) {
      setFeedback((f) => ({ ...f, [reestimatePopupJobId]: "Enter re-estimate remark." }));
      return;
    }
    try {
      await supervisorRequestReestimate(reestimatePopupJobId, { estimateTotalInr: amount, note });
      setFeedback((f) => ({ ...f, [reestimatePopupJobId]: "Re-estimate sent to customer for approval." }));
      closeReestimatePopup();
    } catch (e) {
      setFeedback((f) => ({
        ...f,
        [reestimatePopupJobId]: e instanceof Error ? e.message : "Could not mark re-estimate.",
      }));
    }
  }

  async function markRepaired(jobId: string) {
    try {
      await supervisorMarkRepairComplete(jobId);
      setFeedback((f) => ({
        ...f,
        [jobId]:
          "Repair recorded successfully. The job is now in the outward (ODC) queue for logistics to dispatch to the store.",
      }));
    } catch (e) {
      setFeedback((f) => ({ ...f, [jobId]: e instanceof Error ? e.message : "Could not mark repaired." }));
    }
  }

  const transferRegionOptions = useMemo(() => {
    if (!user) return [];
    return regions
      .filter((r) => r.id !== (user.regionId ?? ""))
      .map((r) => ({ id: r.id, label: r.name }));
  }, [regions, user]);

  function openTransferPopup(jobId: string) {
    setTransferPopupJobId(jobId);
    setTransferTargetRegionId(transferRegionOptions[0]?.id ?? "");
    setTransferNoteInput("");
  }

  function closeTransferPopup() {
    setTransferPopupJobId(null);
    setTransferTargetRegionId("");
    setTransferNoteInput("");
  }

  async function confirmTransferToOtherHo() {
    if (!transferPopupJobId) return;
    if (!transferTargetRegionId) {
      setFeedback((f) => ({ ...f, [transferPopupJobId]: "Select destination HO region." }));
      return;
    }
    try {
      await supervisorTransferToOtherHo(transferPopupJobId, {
        targetRegionId: transferTargetRegionId,
        note: transferNoteInput || "Transfer to other HO requested.",
      });
      setFeedback((f) => ({
        ...f,
        [transferPopupJobId]: "Moved to outward queue for inter-HO transfer. Create DC from Service Centre Logistics.",
      }));
      closeTransferPopup();
    } catch (e) {
      setFeedback((f) => ({ ...f, [transferPopupJobId]: e instanceof Error ? e.message : "Could not transfer to other HO." }));
    }
  }

  function openRepairPopup(jobId: string) {
    setRepairPopupJobId(jobId);
    setRepairLines([{ spareId: "", qty: "1" }]);
  }

  function closeRepairPopup() {
    setRepairPopupJobId(null);
    setRepairLines([{ spareId: "", qty: "1" }]);
  }

  async function ensureSparePrice(spareId: string) {
    if (!spareId || unitPriceBySpareId[spareId] != null) return;
    const fromMaster = Number(activeSpares.find((s) => s.id === spareId)?.mrpInr ?? 0);
    if (fromMaster > 0) {
      setUnitPriceBySpareId((prev) => ({ ...prev, [spareId]: fromMaster }));
      return;
    }
    try {
      const q = user?.regionId ? `?regionId=${encodeURIComponent(user.regionId)}` : "";
      const out = await apiJson<{ prices: SparePriceLine[] }>(
        `/api/catalog/spares/${encodeURIComponent(spareId)}/prices${q}`,
      );
      const price = Number(out.prices?.[0]?.price ?? 0);
      setUnitPriceBySpareId((prev) => ({ ...prev, [spareId]: price }));
    } catch {
      setUnitPriceBySpareId((prev) => ({ ...prev, [spareId]: 0 }));
    }
  }

  async function confirmRepairWithSpares() {
    if (!repairPopupJobId) return;
    const lines = repairLines
      .map((x) => ({ spareId: x.spareId, qty: Number(x.qty) }))
      .filter((x) => x.spareId && Number.isFinite(x.qty) && x.qty > 0)
      .map((x) => {
        const spare = activeSpares.find((s) => s.id === x.spareId);
        const unitPriceInr = Number(unitPriceBySpareId[x.spareId] ?? spare?.mrpInr ?? 0);
        return {
          name: spare?.name ?? x.spareId,
          qty: x.qty,
          unitPriceInr,
          lineTotalInr: unitPriceInr * x.qty,
        };
      });
    if (lines.length === 0) {
      setFeedback((f) => ({ ...f, [repairPopupJobId]: "Add at least one used spare from inventory." }));
      return;
    }
    if (lines.some((x) => Number(x.unitPriceInr ?? 0) <= 0)) {
      setFeedback((f) => ({ ...f, [repairPopupJobId]: "Price not configured for selected spare(s). Set spare price first." }));
      return;
    }
    try {
      await submitSparesSlip(repairPopupJobId, lines);
      await markRepaired(repairPopupJobId);
      closeRepairPopup();
    } catch (e) {
      setFeedback((f) => ({ ...f, [repairPopupJobId]: e instanceof Error ? e.message : "Could not complete repair." }));
    }
  }

  function printHistory(jobRef: string, rows: Array<{ id: string; status: string; note: string; changedAt: string }>) {
    openPrintDocument(
      `SRF History ${jobRef}`,
      `<div style="font-family:Arial,sans-serif;padding:20px;color:#111">
        <h2 style="margin:0 0 12px">SRF status history</h2>
        <p><strong>Reference:</strong> ${jobRef}</p>
        <table border="1" cellspacing="0" cellpadding="6" style="width:100%;border-collapse:collapse;margin-top:12px">
          <thead><tr><th>Date time</th><th>Status</th><th>Note</th></tr></thead>
          <tbody>
            ${rows
              .map((h) => `<tr><td>${new Date(h.changedAt).toLocaleString()}</td><td>${h.status.replace(/_/g, " ")}</td><td>${h.note || "-"}</td></tr>`)
              .join("")}
          </tbody>
        </table>
      </div>`,
    );
  }

  return (
    <div>
      <PageHeader
        title="Supervisor — assign technicians"
        description="Match repair complexity to technician grade. Technician then analyses the watch and confirms whether the estimate stands (re-estimate is a later phase)."
        actions={
          <Link
            to="/service-centre"
            className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
          >
            Service centre home
          </Link>
        }
      />

      <Card title="Queue — received at service centre" subtitle="Not yet assigned">
        {received.length === 0 ? (
          <p className="text-sm text-stone-600">
            No watches waiting for assignment. Complete inward first, or dispatch from the store with a
            DC.
          </p>
        ) : (
          <div className="space-y-6">
            {received.map((j) => (
              <div
                key={j.id}
                className="rounded-2xl border border-zimson-200/80 bg-white/90 p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm font-bold text-zimson-900">{j.reference}</p>
                    <p className="text-sm text-stone-800">
                      {j.customerName} · {j.phone}
                    </p>
                    <p className="mt-1 text-sm text-stone-600">
                      {j.watchBrand} {j.watchModel} · {j.serial}
                    </p>
                    <p className="mt-2 text-xs text-stone-500">{j.complaint}</p>
                  </div>
                  <div className="text-right text-sm tabular-nums text-stone-700">
                    Est.{" "}
                    {j.estimateTotalInr.toLocaleString(undefined, {
                      style: "currency",
                      currency: "INR",
                    })}
                  </div>
                </div>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="min-w-[200px] flex-1">
                    <label className="text-xs font-medium text-stone-600">Technician (by grade)</label>
                    <select
                      value={pickTech[j.id] ?? ""}
                      onChange={(e) =>
                        setPickTech((p) => ({ ...p, [j.id]: e.target.value }))
                      }
                      disabled={!!j.requiresLocalConversion}
                      className="mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zimson-400/40"
                    >
                      <option value="">Select…</option>
                      {SEED_TECHNICIANS.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} — {t.grade}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleAssign(j.id)}
                    disabled={!!j.requiresLocalConversion}
                    className="rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700"
                  >
                    Assign
                  </button>
                  {j.requiresLocalConversion ? (
                    <button
                      type="button"
                      onClick={() => void convertLocal(j.id)}
                      className="rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-900 hover:bg-indigo-100"
                    >
                      Convert to local SRF
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void toggleHistory(j.id)}
                    className="rounded-xl border border-zimson-300 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 hover:bg-zimson-50"
                  >
                    {historyByJob[j.id] ? "Hide history" : "Show history"}
                  </button>
                </div>
                {feedback[j.id] ? (
                  <p className="mt-2 text-xs text-stone-600">{feedback[j.id]}</p>
                ) : null}
                {historyByJob[j.id] ? (
                  <div className="mt-3 rounded-xl bg-zimson-50 p-3 text-xs text-stone-700">
                    <div className="mb-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => printHistory(j.reference, historyByJob[j.id]!)}
                        className="rounded-lg border border-zimson-300 bg-white px-2 py-1 text-xs font-semibold text-zimson-900"
                      >
                        Print document
                      </button>
                    </div>
                    <ul className="space-y-1">
                      {historyByJob[j.id]!.map((h) => (
                        <li key={h.id}>
                          <span className="font-mono">{new Date(h.changedAt).toLocaleString()}</span> ·{" "}
                          <span className="font-semibold">{h.status.replace(/_/g, " ")}</span>
                          {h.note ? ` — ${h.note}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Supervisor decision queue" subtitle="From supervisor login: mark repaired or need re-estimate" className="mt-8">
        {decisionQueue.length === 0 ? (
          <p className="text-sm text-stone-600">No assigned SRFs pending decision.</p>
        ) : (
          <div className="space-y-4">
            {decisionQueue.map((j) => (
              <div key={j.id} className="rounded-2xl border border-zimson-200/80 bg-white/90 p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm font-bold text-zimson-900">{j.reference}</p>
                    <p className="text-sm text-stone-800">{j.customerName} · {j.phone}</p>
                    <p className="mt-1 text-sm text-stone-600">{j.watchBrand} {j.watchModel} · {j.serial}</p>
                    <p className="mt-1 text-xs text-stone-500">Status: {j.status.replace(/_/g, " ")}</p>
                    <div className="mt-2 rounded-lg border border-zimson-100 bg-zimson-50/50 px-3 py-2 text-xs text-stone-700">
                      <p>
                        <span className="font-semibold text-stone-900">Current approved estimate:</span>{" "}
                        {j.estimateTotalInr.toLocaleString(undefined, { style: "currency", currency: "INR" })}
                      </p>
                      {j.reestimateRequestedInr != null && j.reestimateRequestedInr > 0 ? (
                        <p className="mt-1">
                          <span className="font-semibold text-stone-900">Last proposed re-estimate:</span>{" "}
                          {j.reestimateRequestedInr.toLocaleString(undefined, { style: "currency", currency: "INR" })}
                          {j.reestimateRequestedNote ? ` — ${j.reestimateRequestedNote}` : ""}
                        </p>
                      ) : null}
                    </div>
                    {j.customerReestimateResponse === "accepted" ? (
                      <p className="mt-1 text-xs font-semibold text-emerald-700">
                        Customer accepted re-estimate{j.customerReestimateRespondedAt ? ` · ${new Date(j.customerReestimateRespondedAt).toLocaleString()}` : ""}
                      </p>
                    ) : null}
                    {j.customerReestimateResponse === "rejected" ? (
                      <p className="mt-1 text-xs font-semibold text-rose-700">
                        Customer rejected re-estimate{j.customerReestimateRespondedAt ? ` · ${new Date(j.customerReestimateRespondedAt).toLocaleString()}` : ""}
                      </p>
                    ) : null}
                    {j.usedSpares && j.usedSpares.length > 0 ? (
                      <p className="mt-1 text-xs text-stone-600">
                        Spares: {j.usedSpares.map((x) => `${x.name} x${x.qty}`).join(", ")}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {j.status === "reestimate_required" ? (
                    <div className="w-full rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                      <p className="font-semibold">Waiting for customer approval from tracking link.</p>
                      {j.trackingUrl ? (
                        <>
                          <p className="mt-2 text-[11px]">Share this link with customer:</p>
                          <p className="mt-1 break-all rounded bg-white/80 px-2 py-1 font-mono text-[11px] text-stone-700">{j.trackingUrl}</p>
                        </>
                      ) : (
                        <p className="mt-1 text-[11px]">Tracking link is not available.</p>
                      )}
                    </div>
                  ) : null}
                  {j.status !== "reestimate_required" ? (
                    <button
                      type="button"
                      onClick={() => openRepairPopup(j.id)}
                      className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
                    >
                      Watch repaired
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => openReestimatePopup(j.id)}
                    disabled={j.status === "reestimate_required"}
                    className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Need re-estimate
                  </button>
                  {(j.status === "assigned" || j.status === "estimate_ok") ? (
                    <button
                      type="button"
                      onClick={() => openTransferPopup(j.id)}
                      className="rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-900 hover:bg-indigo-100"
                    >
                      Send to other HO
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void toggleHistory(j.id)}
                    className="rounded-xl border border-zimson-300 bg-white px-4 py-2 text-sm font-semibold text-zimson-900 hover:bg-zimson-50"
                  >
                    {historyByJob[j.id] ? "Hide history" : "Show history"}
                  </button>
                </div>
                {feedback[j.id] ? <p className="mt-2 text-xs text-stone-600">{feedback[j.id]}</p> : null}
                {historyByJob[j.id] ? (
                  <div className="mt-3 rounded-xl bg-zimson-50 p-3 text-xs text-stone-700">
                    <div className="mb-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => printHistory(j.reference, historyByJob[j.id]!)}
                        className="rounded-lg border border-zimson-300 bg-white px-2 py-1 text-xs font-semibold text-zimson-900"
                      >
                        Print document
                      </button>
                    </div>
                    <ul className="space-y-1">
                      {historyByJob[j.id]!.map((h) => (
                        <li key={h.id}>
                          <span className="font-mono">{new Date(h.changedAt).toLocaleString()}</span> ·{" "}
                          <span className="font-semibold">{h.status.replace(/_/g, " ")}</span>
                          {h.note ? ` — ${h.note}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>
      {repairPopupJobId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-zimson-900">Add used spares from inventory</h3>
            <p className="mt-1 text-sm text-stone-600">Select spares and quantity. On confirm, repair is marked complete.</p>
            <div className="mt-4 space-y-3">
              {repairLines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2">
                  <select
                    value={line.spareId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setRepairLines((prev) => prev.map((x, i) => (i === idx ? { ...x, spareId: nextId } : x)));
                      void ensureSparePrice(nextId);
                    }}
                    className="col-span-8 rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
                  >
                    <option value="">Select spare...</option>
                    {activeSpares.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.sku} - {s.name}
                      </option>
                    ))}
                  </select>
                  <input
                    value={line.qty}
                    onChange={(e) =>
                      setRepairLines((prev) => prev.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)))
                    }
                    className="col-span-3 rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
                    placeholder="Qty"
                  />
                  <button
                    type="button"
                    onClick={() => setRepairLines((prev) => prev.filter((_, i) => i !== idx))}
                    className="col-span-1 rounded-xl border border-zimson-300 bg-white text-sm"
                  >
                    x
                  </button>
                  <div className="col-span-12 text-xs text-stone-600">
                    Amount: INR {(() => {
                      const spare = activeSpares.find((s) => s.id === line.spareId);
                      const unit = Number(unitPriceBySpareId[line.spareId] ?? spare?.mrpInr ?? 0);
                      const qty = Number(line.qty || 0);
                      return (unit * (Number.isFinite(qty) ? qty : 0)).toFixed(2);
                    })()}
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setRepairLines((prev) => [...prev, { spareId: "", qty: "1" }])}
              className="mt-3 rounded-xl border border-zimson-300 bg-white px-4 py-2 text-sm font-semibold text-zimson-900"
            >
              Add spare row
            </button>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={closeRepairPopup} className="rounded-xl border border-zimson-300 px-4 py-2 text-sm">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmRepairWithSpares()}
                className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white"
              >
                Confirm repaired
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
                Re-estimate amount (INR)
                <input
                  className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
                  value={reestimateAmountInput}
                  onChange={(e) => setReestimateAmountInput(e.target.value)}
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
      {transferPopupJobId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-zimson-900">Send SRF to other HO</h3>
            <p className="mt-1 text-sm text-stone-600">
              Choose destination HO region. SRF moves to outward queue; logistics will create DC for HO inward.
            </p>
            <div className="mt-4 grid gap-3">
              <label className="text-sm">
                Destination HO region
                <select
                  className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
                  value={transferTargetRegionId}
                  onChange={(e) => setTransferTargetRegionId(e.target.value)}
                >
                  <option value="">Select destination</option>
                  {transferRegionOptions.map((x) => (
                    <option key={x.id} value={x.id}>{x.label}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Note (optional)
                <textarea
                  className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
                  rows={3}
                  value={transferNoteInput}
                  onChange={(e) => setTransferNoteInput(e.target.value)}
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={closeTransferPopup} className="rounded-xl border border-zimson-300 px-4 py-2 text-sm">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmTransferToOtherHo()}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
              >
                Queue transfer
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
