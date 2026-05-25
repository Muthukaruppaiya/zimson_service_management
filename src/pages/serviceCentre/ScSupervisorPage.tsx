import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CustomerLinkQr } from "../../components/service/CustomerLinkQr";
import { SrfTraceModal } from "../../components/service/SrfTraceModal";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { ProcessSuccessModal } from "../../components/ui/ProcessSuccessModal";
import { useAuth } from "../../context/AuthContext";
import { useRegions } from "../../context/RegionsContext";
import { useSpares } from "../../context/SparesContext";
import { useSrfJobs } from "../../context/SrfJobsContext";
import { ApiError, apiJson } from "../../lib/api";
import {
  findLocalRepairSrfForRoot,
  isArchivedSrfJob,
  jobVisibleToServiceCentre,
  rootSrfBookingReference,
  shouldShowInSupervisorSrfList,
} from "../../lib/srfAccess";
import { printAssignmentSlip, printBrandDispatchDocument, printEstimateDocument, printSrfDocument } from "../../lib/serviceDocuments";
import type { SrfJob } from "../../types/srfJob";
import type { SparePriceLine, SpareStockRow } from "../../types/spare";
import type { TechnicianProfile } from "../../types/technician";
import { openPrintDocument } from "../../lib/inventoryDocuments";

type InterHoSpareOrder = {
  id: string;
  orderNumber: string;
  srfId: string;
  srfReference: string;
  fromRegionId: string;
  fromRegionName: string;
  toRegionId: string;
  toRegionName: string;
  status: "REQUESTED" | "FULFILLED" | "CANCELLED";
  note: string;
  requestedBy: string;
  requestedByName: string | null;
  requestedAt: string;
  invoiceRef: string | null;
  fulfilledNote: string;
  fulfilledBy: string | null;
  fulfilledByName: string | null;
  fulfilledAt: string | null;
  dispatchedAt?: string | null;
  inwardReceivedAt?: string | null;
  lines: Array<{
    id: string;
    spareId: string;
    spareName: string;
    qty: number;
    unitPriceInr: number;
    lineTotalInr: number;
  }>;
};

function sparesAmountInr(job: { usedSpares?: Array<{ qty: number; unitPriceInr?: number | null; lineTotalInr?: number | null }>; brandInvoiceAmountInr?: number | null }): number {
  const lines = job.usedSpares ?? [];
  if (lines.length > 0) {
    return lines.reduce((sum, l) => {
      const lineTotal = Number(l.lineTotalInr ?? NaN);
      if (Number.isFinite(lineTotal)) return sum + lineTotal;
      return sum + Number(l.unitPriceInr ?? 0) * Number(l.qty ?? 0);
    }, 0);
  }
  if (Number.isFinite(Number(job.brandInvoiceAmountInr ?? NaN))) return Number(job.brandInvoiceAmountInr);
  return 0;
}

export function ScSupervisorPage() {
  const navigate = useNavigate();
  const { srfId } = useParams<{ srfId?: string }>();
  const { user } = useAuth();
  const { regions } = useRegions();
  const { activeSpares } = useSpares();
  const {
    jobs,
    assignTechnician,
    convertTransferredSrfToLocal,
    supervisorRequestReestimate,
    technicianSendToBrand,
    supervisorTransferToOtherHo,
    submitSparesSlip,
    supervisorMarkRepairComplete,
    supervisorMoveRejectedToOdc,
    supervisorLogBrandEstimate,
    supervisorApproveBrandEstimate,
    supervisorReceiveFromBrand,
    supervisorLogBrandInvoice,
    supervisorLogBrandCreditNote,
    supervisorNotifyBrandCoupon,
    getStatusHistory,
  } = useSrfJobs();
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [pickTech, setPickTech] = useState<Record<string, string>>({});
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
  const [hoStockBySpareId, setHoStockBySpareId] = useState<Record<string, number>>({});
  const [repairPopupError, setRepairPopupError] = useState("");
  const [repairSaving, setRepairSaving] = useState(false);
  const [repairSuccessMonitor, setRepairSuccessMonitor] = useState<{
    reference: string;
    customerName: string;
    watchLabel: string;
  } | null>(null);
  const [assignSuccessAck, setAssignSuccessAck] = useState<{
    reference: string;
    customerName: string;
    watchLabel: string;
    technicianLabel: string;
    job: SrfJob;
  } | null>(null);
  const [convertLocalAck, setConvertLocalAck] = useState<{
    reference: string;
    newSrfId: string;
    sourceReference: string;
  } | null>(null);
  const [moveToOdcPopupJobId, setMoveToOdcPopupJobId] = useState<string | null>(null);
  const [moveToOdcNote, setMoveToOdcNote] = useState("");
  const [traceJobId, setTraceJobId] = useState<string | null>(null);
  const [spareOrderRows, setSpareOrderRows] = useState<InterHoSpareOrder[]>([]);
  const [spareOrderMsg, setSpareOrderMsg] = useState("");
  const [requestSparesJobId, setRequestSparesJobId] = useState<string | null>(null);
  const [requestSparesTargetRegionId, setRequestSparesTargetRegionId] = useState("");
  const [requestSparesNote, setRequestSparesNote] = useState("");
  const [requestSparesLines, setRequestSparesLines] = useState<Array<{ spareId: string; qty: string }>>([
    { spareId: "", qty: "1" },
  ]);
  const [fulfillOrderId, setFulfillOrderId] = useState<string | null>(null);
  const [fulfillInvoiceRef, setFulfillInvoiceRef] = useState("");
  const [fulfillNote, setFulfillNote] = useState("");
  const [fulfillLines, setFulfillLines] = useState<Array<{ lineId: string; spareId: string; spareName: string; qty: string; unitPriceInr: string }>>([]);
  const [orderDetailsId, setOrderDetailsId] = useState<string | null>(null);
  const [technicians, setTechnicians] = useState<TechnicianProfile[]>([]);
  const [sendBrandPopupJobId, setSendBrandPopupJobId] = useState<string | null>(null);
  const [sendBrandDispatchRef, setSendBrandDispatchRef] = useState("");
  const [sendBrandReason, setSendBrandReason] = useState("Cannot be repaired at HO");
  const [brandEstimatePopupJobId, setBrandEstimatePopupJobId] = useState<string | null>(null);
  const [brandEstimateAmountInput, setBrandEstimateAmountInput] = useState("");
  const [brandEstimateNoteInput, setBrandEstimateNoteInput] = useState("");
  const [brandInvoicePopupJobId, setBrandInvoicePopupJobId] = useState<string | null>(null);
  const [brandInvoiceRefInput, setBrandInvoiceRefInput] = useState("");
  const [brandInvoiceAmountInput, setBrandInvoiceAmountInput] = useState("");
  const [brandInvoiceNoteInput, setBrandInvoiceNoteInput] = useState("");
  const [brandCreditPopupJobId, setBrandCreditPopupJobId] = useState<string | null>(null);
  const [brandCouponCodeInput, setBrandCouponCodeInput] = useState("");
  const [brandCouponValueInput, setBrandCouponValueInput] = useState("");
  const [brandCouponValidUntilInput, setBrandCouponValidUntilInput] = useState("");
  const [brandCouponNoteInput, setBrandCouponNoteInput] = useState("");
  const [brandNotifyPopupJobId, setBrandNotifyPopupJobId] = useState<string | null>(null);
  const [brandNotifyNoteInput, setBrandNotifyNoteInput] = useState("Customer informed through web, SMS and WhatsApp copy.");
  void spareOrderMsg;
  const [scanSrfInput, setScanSrfInput] = useState("");
  const [listDetailJobId, setListDetailJobId] = useState<string | null>(null);

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
        (j.status === "assigned" ||
          j.status === "estimate_ok" ||
          j.status === "reestimate_required" ||
          j.status === "customer_rejected") &&
        jobVisibleToServiceCentre(j, user),
    );
  }, [jobs, user]);
  const decisionView = useMemo(
    () => (srfId ? decisionQueue.filter((j) => j.id === srfId) : decisionQueue),
    [decisionQueue, srfId],
  );
  const receivedView = useMemo(
    () => (srfId ? received.filter((j) => j.id === srfId) : received),
    [received, srfId],
  );
  const brandDeskQueue = useMemo(() => {
    if (!user) return [];
    return jobs.filter(
      (j) =>
        (j.status === "sent_to_brand" ||
          j.status === "brand_estimate_pending" ||
          j.status === "brand_approved" ||
          j.status === "brand_repair_in_progress" ||
          j.status === "received_from_brand") &&
        jobVisibleToServiceCentre(j, user),
    );
  }, [jobs, user]);
  const brandDeskView = useMemo(
    () => (srfId ? brandDeskQueue.filter((j) => j.id === srfId) : brandDeskQueue),
    [brandDeskQueue, srfId],
  );
  /** Repair HO creates inter-HO invoice before return dispatch to sender HO (not sender HO). */
  const repairHoInvoiceQueue = useMemo(() => {
    if (!user) return [];
    return jobs.filter(
      (j) =>
        j.status === "ready_for_outward" &&
        !!j.transferTargetRegionId &&
        !j.requiresLocalConversion &&
        !(j.hoSparesBillRef ?? "").trim() &&
        jobVisibleToServiceCentre(j, user),
    );
  }, [jobs, user]);
  const transferredQueue = useMemo(() => {
    if (!user) return [];
    return jobs.filter(
      (j) =>
        j.status === "sent_to_other_ho" &&
        jobVisibleToServiceCentre(j, user) &&
        shouldShowInSupervisorSrfList(j, jobs),
    );
  }, [jobs, user]);
  const transferredView = useMemo(
    () => (srfId ? transferredQueue.filter((j) => j.id === srfId) : transferredQueue),
    [transferredQueue, srfId],
  );
  const supervisorListRows = useMemo(() => {
    const seen = new Set<string>();
    const rows: SrfJob[] = [];
    for (const j of [...received, ...decisionQueue, ...brandDeskQueue, ...repairHoInvoiceQueue, ...transferredQueue]) {
      if (seen.has(j.id)) continue;
      if (!shouldShowInSupervisorSrfList(j, jobs)) continue;
      seen.add(j.id);
      rows.push(j);
    }
    return rows;
  }, [received, decisionQueue, brandDeskQueue, repairHoInvoiceQueue, transferredQueue, jobs]);

  const listDetailJob = useMemo(
    () => (listDetailJobId ? jobs.find((j) => j.id === listDetailJobId) ?? null : null),
    [jobs, listDetailJobId],
  );
  const listDetailMeta = useMemo(() => {
    if (!listDetailJob || !user) return null;
    const rootRef = rootSrfBookingReference(listDetailJob);
    const needsConvert =
      listDetailJob.status === "received_at_sc" && !!listDetailJob.requiresLocalConversion;
    const localRepair =
      listDetailJob.status === "sent_to_other_ho"
        ? findLocalRepairSrfForRoot(rootRef, jobs, user)
        : undefined;
    return { rootRef, needsConvert, localRepair };
  }, [listDetailJob, jobs, user]);

  /** Archived / superseded sender rows → open the live local repair SRF when possible. */
  useEffect(() => {
    if (!srfId || !user) return;
    const job = jobs.find((j) => j.id === srfId);
    if (!job || !jobVisibleToServiceCentre(job, user)) return;
    const rootRef = rootSrfBookingReference(job);
    const local = findLocalRepairSrfForRoot(rootRef, jobs, user);
    if (!local || local.id === job.id) return;
    if (isArchivedSrfJob(job) || !shouldShowInSupervisorSrfList(job, jobs)) {
      navigate(`/service-centre/supervisor/srf/${encodeURIComponent(local.id)}`, { replace: true });
    }
  }, [srfId, jobs, user, navigate]);

  const repairHoInvoiceView = useMemo(
    () => (srfId ? repairHoInvoiceQueue.filter((j) => j.id === srfId) : repairHoInvoiceQueue),
    [repairHoInvoiceQueue, srfId],
  );

  async function handleAssign(jobId: string) {
    const techId = pickTech[jobId];
    if (!techId) {
      setFeedback((f) => ({ ...f, [jobId]: "Choose a technician." }));
      return;
    }
    try {
      const job = jobs.find((x) => x.id === jobId);
      const tech = technicians.find((t) => t.id === techId);
      if (!job || !tech) {
        setFeedback((f) => ({ ...f, [jobId]: "SRF or technician not found." }));
        return;
      }
      await assignTechnician(jobId, techId);
      const technicianLabel = `${tech.fullName} (${tech.grade})`;
      setAssignSuccessAck({
        reference: job.reference,
        customerName: job.customerName,
        watchLabel: `${job.watchBrand} ${job.watchModel} · ${job.serial}`,
        technicianLabel,
        job,
      });
      setFeedback((f) => {
        const next = { ...f };
        delete next[jobId];
        return next;
      });
      setPickTech((p) => {
        const next = { ...p };
        delete next[jobId];
        return next;
      });
    } catch (e) {
      setFeedback((f) => ({ ...f, [jobId]: e instanceof Error ? e.message : "Could not assign." }));
    }
  }

  async function convertLocal(jobId: string) {
    const sourceJob = jobs.find((j) => j.id === jobId);
    try {
      const out = await convertTransferredSrfToLocal(jobId);
      setConvertLocalAck({
        reference: out.reference,
        newSrfId: out.newSrfId,
        sourceReference: sourceJob?.reference ?? jobId,
      });
      setFeedback((f) => {
        const next = { ...f };
        delete next[jobId];
        return next;
      });
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

  function openMoveToOdcPopup(jobId: string) {
    setMoveToOdcPopupJobId(jobId);
    setMoveToOdcNote("");
  }

  function closeMoveToOdcPopup() {
    setMoveToOdcPopupJobId(null);
    setMoveToOdcNote("");
  }

  async function confirmMoveToOdc() {
    if (!moveToOdcPopupJobId) return;
    try {
      await supervisorMoveRejectedToOdc(moveToOdcPopupJobId, moveToOdcNote.trim());
      setFeedback((f) => ({
        ...f,
        [moveToOdcPopupJobId]:
          "Moved to internal outward queue. Logistics can now create internal outward transfer and return watch without billing.",
      }));
      closeMoveToOdcPopup();
    } catch (e) {
      setFeedback((f) => ({
        ...f,
        [moveToOdcPopupJobId]: e instanceof Error ? e.message : "Could not move to internal outward queue.",
      }));
    }
  }

  function openSendToBrandPopup(jobId: string) {
    setSendBrandPopupJobId(jobId);
    setSendBrandDispatchRef("");
    setSendBrandReason("Cannot be repaired at HO");
  }

  function closeSendToBrandPopup() {
    setSendBrandPopupJobId(null);
    setSendBrandDispatchRef("");
    setSendBrandReason("Cannot be repaired at HO");
  }

  async function sendToBrandBySupervisor() {
    if (!sendBrandPopupJobId) return;
    const jobId = sendBrandPopupJobId;
    const note = sendBrandReason.trim();
    const dispatchRef = sendBrandDispatchRef.trim();
    if (!note) {
      setFeedback((f) => ({ ...f, [jobId]: "Reason is required to send to brand." }));
      return;
    }
    try {
      const row = jobs.find((x) => x.id === jobId);
      if (row) printBrandDispatchDocument(row, { dispatchRef, note });
      await technicianSendToBrand(jobId, { dispatchRef, note });
      setFeedback((f) => ({ ...f, [jobId]: "Sent to brand. ODC generated and dispatch document opened for print." }));
      closeSendToBrandPopup();
    } catch (e) {
      setFeedback((f) => ({ ...f, [jobId]: e instanceof Error ? e.message : "Could not send to brand." }));
    }
  }

  async function confirmBrandEstimate() {
    if (!brandEstimatePopupJobId) return;
    const jobId = brandEstimatePopupJobId;
    const amount = Number(brandEstimateAmountInput);
    const note = brandEstimateNoteInput.trim();
    if (!Number.isFinite(amount) || amount <= 0) {
      setFeedback((f) => ({ ...f, [jobId]: "Enter valid brand estimate amount." }));
      return;
    }
    try {
      await supervisorLogBrandEstimate(jobId, { estimateInr: amount, currency: "INR", note });
      setFeedback((f) => ({ ...f, [jobId]: `Brand estimate logged: INR ${amount.toFixed(2)}.` }));
      setBrandEstimatePopupJobId(null);
    } catch (e) {
      setFeedback((f) => ({ ...f, [jobId]: e instanceof Error ? e.message : "Could not log brand estimate." }));
    }
  }

  async function confirmBrandInvoice() {
    if (!brandInvoicePopupJobId) return;
    const jobId = brandInvoicePopupJobId;
    const invoiceRef = brandInvoiceRefInput.trim();
    const invoiceAmountInr = Number(brandInvoiceAmountInput);
    const note = brandInvoiceNoteInput.trim();
    if (!invoiceRef) {
      setFeedback((f) => ({ ...f, [jobId]: "Invoice reference is required." }));
      return;
    }
    if (!Number.isFinite(invoiceAmountInr) || invoiceAmountInr <= 0) {
      setFeedback((f) => ({ ...f, [jobId]: "Brand invoice amount is required." }));
      return;
    }
    try {
      await supervisorLogBrandInvoice(jobId, { invoiceRef, invoiceAmountInr, note });
      setFeedback((f) => ({ ...f, [jobId]: `Brand invoice logged (${invoiceRef}). Sent to outward queue.` }));
      setBrandInvoicePopupJobId(null);
    } catch (e) {
      setFeedback((f) => ({ ...f, [jobId]: e instanceof Error ? e.message : "Could not log brand invoice." }));
    }
  }

  async function confirmBrandCreditNote() {
    if (!brandCreditPopupJobId) return;
    const jobId = brandCreditPopupJobId;
    const couponCode = brandCouponCodeInput.trim();
    const valueInr = Number(brandCouponValueInput);
    const validUntil = brandCouponValidUntilInput.trim();
    const note = brandCouponNoteInput.trim();
    if (!couponCode) {
      setFeedback((f) => ({ ...f, [jobId]: "Coupon code is required." }));
      return;
    }
    if (!Number.isFinite(valueInr) || valueInr <= 0) {
      setFeedback((f) => ({ ...f, [jobId]: "Enter valid coupon value." }));
      return;
    }
    try {
      await supervisorLogBrandCreditNote(jobId, { couponCode, valueInr, validUntil: validUntil || undefined, note });
      setFeedback((f) => ({ ...f, [jobId]: `Brand credit note logged (${couponCode}).` }));
      setBrandCreditPopupJobId(null);
    } catch (e) {
      setFeedback((f) => ({ ...f, [jobId]: e instanceof Error ? e.message : "Could not log brand credit note." }));
    }
  }

  async function confirmNotifyCoupon() {
    if (!brandNotifyPopupJobId) return;
    const jobId = brandNotifyPopupJobId;
    const note = brandNotifyNoteInput.trim();
    try {
      await supervisorNotifyBrandCoupon(jobId, {
        channels: { web: true, smsTemplateShared: true, whatsappTemplateShared: true },
        note,
      });
      setFeedback((f) => ({ ...f, [jobId]: "Customer coupon notification recorded." }));
      setBrandNotifyPopupJobId(null);
    } catch (e) {
      setFeedback((f) => ({ ...f, [jobId]: e instanceof Error ? e.message : "Could not mark customer notification." }));
    }
  }

  const transferRegionOptions = useMemo(() => {
    if (!user) return [];
    return regions
      .filter((r) => r.id !== (user.regionId ?? ""))
      .map((r) => ({ id: r.id, label: r.name }));
  }, [regions, user]);

  const selectedOrder = useMemo(
    () => spareOrderRows.find((o) => o.id === orderDetailsId) ?? null,
    [spareOrderRows, orderDetailsId],
  );
  const spareFlowBySrfId = useMemo(() => {
    const m = new Map<string, InterHoSpareOrder>();
    const sorted = [...spareOrderRows].sort(
      (a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime(),
    );
    for (const row of sorted) {
      if (row.status === "CANCELLED") continue;
      if (!m.has(row.srfId)) m.set(row.srfId, row);
    }
    return m;
  }, [spareOrderRows]);

  async function refreshSpareOrders() {
    try {
      const out = await apiJson<{ rows: InterHoSpareOrder[] }>("/api/service/inter-ho-spare-orders");
      setSpareOrderRows(out.rows);
      setSpareOrderMsg("");
    } catch (e) {
      setSpareOrderMsg(e instanceof Error ? e.message : "Could not load inter-HO spare orders.");
    }
  }

  useEffect(() => {
    if (!user) return;
    void refreshSpareOrders();
    void apiJson<{ rows: TechnicianProfile[] }>("/api/service/technicians?activeOnly=1")
      .then((out) => setTechnicians(out.rows))
      .catch(() => setTechnicians([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!fulfillOrderId) return;
    const order = spareOrderRows.find((o) => o.id === fulfillOrderId);
    if (!order) {
      setFulfillLines([]);
      return;
    }
    setFulfillLines(
      order.lines.map((l) => ({
        lineId: l.id,
        spareId: l.spareId,
        spareName: l.spareName,
        qty: String(Number(l.qty || 0)),
        unitPriceInr: String(Number(l.unitPriceInr || 0)),
      })),
    );
  }, [fulfillOrderId, spareOrderRows]);

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

  function openRequestSparesPopup(jobId: string) {
    setRequestSparesJobId(jobId);
    setRequestSparesTargetRegionId(transferRegionOptions[0]?.id ?? "");
    setRequestSparesNote("");
    setRequestSparesLines([{ spareId: "", qty: "1" }]);
  }

  function closeRequestSparesPopup() {
    setRequestSparesJobId(null);
    setRequestSparesTargetRegionId("");
    setRequestSparesNote("");
    setRequestSparesLines([{ spareId: "", qty: "1" }]);
  }

  async function confirmRequestSparesOtherHo() {
    if (!requestSparesJobId) return;
    const lines = requestSparesLines
      .map((x) => ({
        spareId: x.spareId,
        qty: Number(x.qty),
      }))
      .filter((x) => x.spareId && Number.isFinite(x.qty) && x.qty > 0);
    if (!requestSparesTargetRegionId) {
      setFeedback((f) => ({ ...f, [requestSparesJobId]: "Choose supplier HO region." }));
      return;
    }
    if (lines.length === 0) {
      setFeedback((f) => ({ ...f, [requestSparesJobId]: "Add at least one spare line." }));
      return;
    }
    try {
      await apiJson(`/api/service/srf-jobs/${encodeURIComponent(requestSparesJobId)}/supervisor/request-spares-other-ho`, {
        method: "POST",
        json: {
          targetRegionId: requestSparesTargetRegionId,
          note: requestSparesNote,
          lines,
        },
      });
      setFeedback((f) => ({
        ...f,
        [requestSparesJobId]: "Online spare sales order created. Authorized CBE partner can dispatch spares with invoice.",
      }));
      closeRequestSparesPopup();
      await refreshSpareOrders();
    } catch (e) {
      setFeedback((f) => ({ ...f, [requestSparesJobId]: e instanceof Error ? e.message : "Could not raise spare order." }));
    }
  }

  function closeFulfillOrder() {
    setFulfillOrderId(null);
    setFulfillInvoiceRef("");
    setFulfillNote("");
    setFulfillLines([]);
  }

  async function confirmFulfillOrder() {
    if (!fulfillOrderId) return;
    if (!fulfillInvoiceRef.trim()) {
      setSpareOrderMsg("Enter invoice reference.");
      return;
    }
    const invoiceLines = fulfillLines
      .map((l) => ({
        lineId: l.lineId,
        spareId: l.spareId,
        qty: Number(l.qty),
        unitPriceInr: Number(l.unitPriceInr),
      }))
      .filter((l) => l.spareId && Number.isFinite(l.qty) && l.qty > 0);
    if (invoiceLines.length === 0) {
      setSpareOrderMsg("Add valid invoice line qty and rate.");
      return;
    }
    if (invoiceLines.some((l) => !Number.isFinite(l.unitPriceInr) || l.unitPriceInr <= 0)) {
      setSpareOrderMsg("Invoice line rate must be greater than 0.");
      return;
    }
    try {
      await apiJson(`/api/service/inter-ho-spare-orders/${encodeURIComponent(fulfillOrderId)}/fulfill`, {
        method: "POST",
        json: { invoiceRef: fulfillInvoiceRef.trim(), note: fulfillNote.trim(), lines: invoiceLines },
      });
      closeFulfillOrder();
      await refreshSpareOrders();
      setSpareOrderMsg("Online spare order fulfilled, invoice recorded, and stock deducted.");
    } catch (e) {
      if (e instanceof ApiError && e.body && typeof e.body === "object") {
        const b = e.body as { error?: unknown; shortages?: Array<{ spareName?: unknown; available?: unknown; required?: unknown }> };
        const msg = typeof b.error === "string" ? b.error : e.message;
        const parts = Array.isArray(b.shortages)
          ? b.shortages
              .map((s) => {
                const name = String(s.spareName ?? "Spare");
                const available = Number(s.available ?? 0);
                const required = Number(s.required ?? 0);
                return `${name} (available ${available}, required ${required})`;
              })
              .filter(Boolean)
          : [];
        setSpareOrderMsg(parts.length > 0 ? `${msg} Details: ${parts.join(", ")}` : msg);
        return;
      }
      setSpareOrderMsg(e instanceof Error ? e.message : "Could not fulfill spare order.");
    }
  }

  async function fetchHoStockQty(spareId: string): Promise<number> {
    if (!spareId) return 0;
    if (hoStockBySpareId[spareId] != null) return hoStockBySpareId[spareId]!;
    try {
      const out = await apiJson<{ stock: SpareStockRow[] }>(
        `/api/catalog/spares/${encodeURIComponent(spareId)}/stock`,
      );
      const qty = out.stock.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0);
      setHoStockBySpareId((prev) => ({ ...prev, [spareId]: qty }));
      return qty;
    } catch {
      setHoStockBySpareId((prev) => ({ ...prev, [spareId]: 0 }));
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
      const available = await fetchHoStockQty(spareId);
      if (available < entry.qty) {
        return `Insufficient HO stock for ${entry.name}. Available ${available}, required ${entry.qty}.`;
      }
    }
    return null;
  }

  function openRepairPopup(jobId: string) {
    setRepairPopupError("");
    const flow = spareFlowBySrfId.get(jobId);
    if (flow?.status === "FULFILLED" && flow.inwardReceivedAt && flow.lines.length > 0) {
      setUnitPriceBySpareId((prev) => {
        const next = { ...prev };
        for (const l of flow.lines) {
          if (!l.spareId) continue;
          const unit = Number(l.unitPriceInr ?? 0);
          const qty = Number(l.qty ?? 0);
          const lineTotal = Number(l.lineTotalInr ?? 0);
          const resolvedUnit = unit > 0 ? unit : qty > 0 && lineTotal > 0 ? lineTotal / qty : 0;
          next[l.spareId] = resolvedUnit;
        }
        return next;
      });
      setRepairLines([
        ...flow.lines.map((l) => ({ spareId: l.spareId, qty: String(Number(l.qty || 0)) })),
        { spareId: "", qty: "1" },
      ]);
      setFeedback((f) => ({
        ...f,
        [jobId]: `Requested spares from ${flow.orderNumber} auto-loaded. Add extra rows only if needed.`,
      }));
    } else {
      setRepairLines([{ spareId: "", qty: "1" }]);
      if (flow && !flow.inwardReceivedAt) {
        setFeedback((f) => ({
          ...f,
          [jobId]: `Spare order ${flow.orderNumber} is not inwarded yet. Complete inward before repair.`,
        }));
      }
    }
    setRepairPopupJobId(jobId);
    const spareIds =
      flow?.status === "FULFILLED" && flow.inwardReceivedAt
        ? flow.lines.map((l) => l.spareId).filter(Boolean)
        : [];
    for (const spareId of spareIds) {
      void fetchHoStockQty(spareId);
    }
  }

  function closeRepairPopup() {
    setRepairPopupJobId(null);
    setRepairLines([{ spareId: "", qty: "1" }]);
    setRepairPopupError("");
    setRepairSaving(false);
  }

  async function ensureSparePrice(spareId: string) {
    if (!spareId || unitPriceBySpareId[spareId] != null) return;
    const spare = activeSpares.find((s) => s.id === spareId);
    const fromMaster = Number(spare?.sellingPriceInr ?? spare?.mrpInr ?? 0);
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
    if (lines.some((x) => Number(x.unitPriceInr ?? 0) <= 0)) {
      setRepairPopupError("Price not configured for selected spare(s). Set spare price first.");
      return;
    }
    const stockErr = await validateRepairStock();
    if (stockErr) {
      setRepairPopupError(stockErr);
      window.alert(`Insufficient spare stock\n\n${stockErr}`);
      return;
    }
    setRepairSaving(true);
    setRepairPopupError("");
    try {
      await submitSparesSlip(jobId, lines);
      await supervisorMarkRepairComplete(jobId);
      closeRepairPopup();
      if (job) {
        setRepairSuccessMonitor({
          reference: job.reference,
          customerName: job.customerName,
          watchLabel: `${job.watchBrand} ${job.watchModel}`.trim(),
        });
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Could not complete repair.";
      setRepairPopupError(msg);
      if (msg.toLowerCase().includes("insufficient")) {
        window.alert(`Insufficient spare stock\n\n${msg}`);
      }
    } finally {
      setRepairSaving(false);
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
        description=""
        actions={
          <div className="flex flex-wrap gap-2">
            {srfId ? (
              <Link
                to="/service-centre/supervisor"
                className="inline-flex rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-900 shadow-sm transition hover:bg-indigo-100"
              >
                Back to SRF list
              </Link>
            ) : null}
          </div>
        }
      />
      {!srfId ? (
        <Card title="Supervisor SRF list">
          <div className="mb-3 flex flex-wrap gap-2">
            <input
              value={scanSrfInput}
              onChange={(e) => setScanSrfInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                const ref = scanSrfInput.trim().toLowerCase();
                if (!ref) return;
                const row =
                  supervisorListRows.find((j) => j.reference.toLowerCase() === ref) ??
                  supervisorListRows.find((j) => rootSrfBookingReference(j).toLowerCase() === ref);
                if (row) {
                  navigate(`/service-centre/supervisor/srf/${encodeURIComponent(row.id)}`);
                  setScanSrfInput("");
                }
              }}
              placeholder="Scan SRF barcode/reference and press Enter"
              className="w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm"
            />
          </div>
          <div className="overflow-x-auto rounded-xl border border-zimson-200/80">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-zimson-200 bg-zimson-50/80 text-xs font-semibold uppercase tracking-wide text-stone-600">
                <tr>
                  <th className="px-3 py-2">SRF</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Watch</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {supervisorListRows.map((j) => {
                  const rootRef = rootSrfBookingReference(j);
                  const isInterHoLocal =
                    !!j.transferSourceReference &&
                    j.transferSourceReference !== j.reference &&
                    !j.requiresLocalConversion;
                  const needsConvert = j.status === "received_at_sc" && !!j.requiresLocalConversion;
                  const localRepair =
                    user && j.status === "sent_to_other_ho"
                      ? findLocalRepairSrfForRoot(rootRef, jobs, user)
                      : undefined;
                  return (
                  <tr key={j.id} className="border-b border-zimson-100 last:border-0">
                    <td className="px-3 py-2 font-mono text-xs font-semibold text-zimson-900">
                      {j.reference}
                      {isInterHoLocal ? (
                        <span className="mt-0.5 block text-[10px] font-semibold text-emerald-700">
                          Local repair SRF
                        </span>
                      ) : null}
                      {rootRef && rootRef !== j.reference ? (
                        <span className="mt-0.5 block text-[10px] font-normal text-stone-500">
                          Sender / root: <span className="font-mono">{rootRef}</span>
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">{j.customerName}</td>
                    <td className="px-3 py-2">{j.watchBrand} {j.watchModel}</td>
                    <td className="px-3 py-2 text-xs text-stone-700">{j.status.replace(/_/g, " ")}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => setListDetailJobId(j.id)}
                          className="rounded-lg border border-zimson-400 bg-zimson-50 px-3 py-1.5 text-xs font-semibold text-zimson-900 hover:bg-zimson-100"
                        >
                          Details
                        </button>
                        {needsConvert ? (
                          <button
                            type="button"
                            onClick={() => void convertLocal(j.id)}
                            className="rounded-lg border border-indigo-400 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-900 hover:bg-indigo-100"
                          >
                            Convert to local SRF
                          </button>
                        ) : null}
                        {localRepair ? (
                          <button
                            type="button"
                            onClick={() =>
                              navigate(
                                `/service-centre/supervisor/srf/${encodeURIComponent(localRepair.id)}`,
                              )
                            }
                            className="rounded-lg border border-emerald-400 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
                          >
                            Open local SRF ({localRepair.reference})
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => navigate(`/service-centre/supervisor/srf/${encodeURIComponent(j.id)}`)}
                            className="rounded-lg border border-zimson-300 bg-white px-3 py-1.5 text-xs font-semibold text-zimson-900 hover:bg-zimson-50"
                          >
                            Open SRF
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {srfId ? (
      <>
      {receivedView.length > 0 ? (
        <Card title="Assignment" subtitle="Assign technician for this SRF" className="mb-6">
          {receivedView.map((j) => {
            const rootRef = rootSrfBookingReference(j);
            const isInterHoLocal =
              !!j.transferSourceReference &&
              j.transferSourceReference !== j.reference &&
              !j.requiresLocalConversion;
            return (
            <div key={j.id} className="rounded-2xl border border-zimson-200/80 bg-white/90 p-4 shadow-sm">
              <p className="font-mono text-sm font-bold text-zimson-900">{j.reference}</p>
              {isInterHoLocal ? (
                <p className="text-[11px] font-semibold text-emerald-700">Local repair SRF (inter-HO)</p>
              ) : null}
              {rootRef && rootRef !== j.reference ? (
                <p className="text-[11px] text-stone-500">
                  Sender / root: <span className="font-mono font-semibold">{rootRef}</span>
                </p>
              ) : null}
              <p className="text-sm text-stone-800">{j.customerName} · {j.phone}</p>
              <p className="mt-1 text-sm text-stone-600">{j.watchBrand} {j.watchModel} · {j.serial}</p>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="min-w-[240px] flex-1">
                  <label className="text-xs font-medium text-stone-600">Technician</label>
                  <select
                    value={pickTech[j.id] ?? ""}
                    onChange={(e) => setPickTech((p) => ({ ...p, [j.id]: e.target.value }))}
                    disabled={!!j.requiresLocalConversion}
                    className="mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zimson-400/40"
                  >
                    <option value="">Select…</option>
                    {technicians.length === 0 ? <option value="" disabled>No technicians in master</option> : null}
                    {technicians.map((t) => (
                      <option key={t.id} value={t.id}>{t.fullName} — {t.grade}</option>
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
              </div>
              {feedback[j.id] ? <p className="mt-2 text-xs text-stone-600">{feedback[j.id]}</p> : null}
            </div>
            );
          })}
        </Card>
      ) : null}
      {repairHoInvoiceView.length > 0 ? (
        <Card
          title="Inter-HO repair invoice"
          subtitle="Repair HO must create invoice to sender HO before return dispatch"
          className="mb-6"
        >
          {repairHoInvoiceView.map((j) => (
            <div key={j.id} className="rounded-2xl border border-zimson-200/80 bg-white/90 p-4 shadow-sm">
              <p className="font-mono text-sm font-bold text-zimson-900">{j.reference}</p>
              <p className="text-sm text-stone-800">{j.customerName} · {j.phone}</p>
              <p className="mt-1 text-sm text-stone-600">{j.watchBrand} {j.watchModel} · {j.serial}</p>
              <p className="mt-2 text-xs text-amber-800">
                Bill sender HO for repair/spares, then logistics can dispatch the return ODC.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Link
                  to={`/service-centre/inter-ho-invoice?srfId=${encodeURIComponent(j.id)}&invoiceFor=sender-ho`}
                  className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                >
                  Create repair HO invoice
                </Link>
              </div>
            </div>
          ))}
        </Card>
      ) : null}
      {brandDeskView.length > 0 ? (
        <Card title="Brand desk" subtitle="SRFs sent to brand — track estimate, approval, receive and invoice" className="mb-6">
          <div className="space-y-4">
            {brandDeskView.map((j) => (
              <div key={j.id} className="rounded-2xl border border-violet-200/80 bg-white/90 p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm font-bold text-zimson-900">{j.reference}</p>
                    <p className="text-sm text-stone-800">{j.customerName} · {j.phone}</p>
                    <p className="mt-1 text-sm text-stone-600">{j.watchBrand} {j.watchModel} · {j.serial}</p>
                    <p className="mt-1 text-xs text-stone-500">Status: <span className="font-semibold text-violet-700">{j.status.replace(/_/g, " ")}</span></p>
                    {j.brandEstimateInr ? (
                      <p className="mt-1 text-xs text-stone-600">
                        <span className="font-semibold">Brand estimate:</span>{" "}
                        {Number(j.brandEstimateInr).toLocaleString(undefined, { style: "currency", currency: "INR" })}
                      </p>
                    ) : null}
                    {j.brandInvoiceAmountInr ? (
                      <p className="mt-1 text-xs text-stone-600">
                        <span className="font-semibold">Brand invoice:</span>{" "}
                        {Number(j.brandInvoiceAmountInr).toLocaleString(undefined, { style: "currency", currency: "INR" })}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {j.status === "sent_to_brand" ? (
                    <button
                      type="button"
                      onClick={() => {
                        setBrandEstimatePopupJobId(j.id);
                        setBrandEstimateAmountInput("");
                        setBrandEstimateNoteInput("");
                      }}
                      className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
                    >
                      Log brand estimate
                    </button>
                  ) : null}
                  {j.status === "brand_estimate_pending" ? (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await supervisorApproveBrandEstimate(j.id, { note: "" });
                          setFeedback((f) => ({ ...f, [j.id]: "Brand estimate approved." }));
                        } catch (e) {
                          setFeedback((f) => ({ ...f, [j.id]: e instanceof Error ? e.message : "Could not approve." }));
                        }
                      }}
                      className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
                    >
                      Approve brand estimate
                    </button>
                  ) : null}
                  {j.status === "brand_approved" || j.status === "brand_repair_in_progress" ? (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await supervisorReceiveFromBrand(j.id, { note: "" });
                          setFeedback((f) => ({ ...f, [j.id]: "Watch received from brand." }));
                        } catch (e) {
                          setFeedback((f) => ({ ...f, [j.id]: e instanceof Error ? e.message : "Could not receive." }));
                        }
                      }}
                      className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800"
                    >
                      Mark received from brand
                    </button>
                  ) : null}
                  {j.status === "received_from_brand" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setBrandInvoicePopupJobId(j.id);
                          setBrandInvoiceRefInput("");
                          setBrandInvoiceAmountInput(j.brandEstimateInr ? String(Number(j.brandEstimateInr).toFixed(2)) : "");
                          setBrandInvoiceNoteInput("");
                        }}
                        className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
                      >
                        Log brand invoice
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setBrandCreditPopupJobId(j.id);
                          setBrandCouponCodeInput("");
                          setBrandCouponValueInput("");
                          setBrandCouponValidUntilInput("");
                          setBrandCouponNoteInput("");
                        }}
                        className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-900 hover:bg-rose-100"
                      >
                        Log brand credit note
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void toggleHistory(j.id)}
                    className="rounded-xl border border-zimson-300 bg-white px-4 py-2 text-sm font-semibold text-zimson-900 hover:bg-zimson-50"
                  >
                    {historyByJob[j.id] ? "Hide history" : "Show history"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTraceJobId(j.id)}
                    className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100"
                  >
                    View full trace
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
         </Card>
      ) : null}
      {transferredView.length > 0 ? (
        <Card title="Transferred to Other HO" subtitle="These SRFs are currently at another HO for repair. Original reference is preserved for tracking." className="mt-8">
          <div className="space-y-4">
            {transferredView.map((j) => {
              const rootRef = rootSrfBookingReference(j);
              const localRepair = user ? findLocalRepairSrfForRoot(rootRef, jobs, user) : undefined;
              return (
              <div key={j.id} className="rounded-2xl border border-zimson-200/80 bg-white/90 p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm font-bold text-zimson-900">{j.reference}</p>
                    {rootRef && rootRef !== j.reference ? (
                      <p className="text-[11px] text-stone-500">
                        Sender / root: <span className="font-mono font-semibold">{rootRef}</span>
                      </p>
                    ) : null}
                    <p className="text-sm text-stone-800">{j.customerName} · {j.phone}</p>
                    <p className="mt-1 text-sm text-stone-600">{j.watchBrand} {j.watchModel} · {j.serial}</p>
                    <p className="mt-1 text-xs font-semibold italic text-amber-700">
                      Sent to other HO for repair. Awaiting return dispatch from repair HO.
                    </p>
                    {localRepair ? (
                      <p className="mt-1 text-xs font-semibold text-emerald-700">
                        Active repair at this HO: {localRepair.reference} — use Open local SRF for assignment and repair.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {localRepair ? (
                      <button
                        type="button"
                        onClick={() =>
                          navigate(
                            `/service-centre/supervisor/srf/${encodeURIComponent(localRepair.id)}`,
                          )
                        }
                        className="rounded-xl border border-emerald-400 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100"
                      >
                        Open local SRF ({localRepair.reference})
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => toggleHistory(j.id)}
                      className="rounded-xl border border-zimson-300 bg-white px-4 py-2 text-sm font-semibold text-zimson-900 hover:bg-zimson-50"
                    >
                      {historyByJob[j.id] ? "Hide history" : "View history"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTraceJobId(j.id)}
                      className="rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-900 hover:bg-indigo-100"
                    >
                      View full trace
                    </button>
                  </div>
                </div>
                {historyByJob[j.id] ? (
                  <div className="mt-3 rounded-xl bg-zimson-50 p-3 text-xs text-stone-700">
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
              );
            })}
          </div>
        </Card>
      ) : null}
      <Card title="Supervisor decision queue" subtitle="From supervisor login: mark repaired or need re-estimate" className="mt-8">
        {decisionView.length === 0 ? (
          <p className="text-sm text-stone-600">
            {receivedView.length > 0 || repairHoInvoiceView.length > 0
              ? "No decision-pending SRFs for this item yet."
              : "No assigned SRFs pending decision."}
          </p>
        ) : (
          <div className="space-y-4">
            {decisionView.map((j) => {
              const spareFlow = spareFlowBySrfId.get(j.id) ?? null;
              const hasSpareFlow = !!spareFlow;
              const spareFlowInwardDone = Boolean(spareFlow?.inwardReceivedAt);
              const hasTransferFlow = Boolean(j.transferTargetRegionId || j.transferSourceRegionId || j.requiresLocalConversion);
              const lockToRepairOnly = hasTransferFlow || hasSpareFlow;
              const canOpenRepair = j.status !== "reestimate_required" && j.status !== "customer_rejected";
              return (
              <div key={j.id} className="rounded-2xl border border-zimson-200/80 bg-white/90 p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm font-bold text-zimson-900">{j.reference}</p>
                    <p className="text-sm text-stone-800">{j.customerName} · {j.phone}</p>
                    <p className="mt-1 text-sm text-stone-600">{j.watchBrand} {j.watchModel} · {j.serial}</p>
                    <p className="mt-1 text-xs text-stone-500">Status: {j.status.replace(/_/g, " ")}</p>
                    <div className="mt-2 rounded-lg border border-zimson-100 bg-zimson-50/50 px-3 py-2 text-xs text-stone-700">
                      <p>
                        <span className="font-semibold text-stone-900">Spares / brand amount:</span>{" "}
                        {sparesAmountInr(j).toLocaleString(undefined, { style: "currency", currency: "INR" })}
                      </p>
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
                    {hasSpareFlow ? (
                      <p className="mt-1 text-xs font-medium text-cyan-700">
                        Spare flow active ({spareFlow?.orderNumber}) ·{" "}
                        {spareFlowInwardDone ? "Inward completed" : "Waiting inward"}
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
                          <p className="mt-2 text-[11px]">Share this link with customer (SMS / WhatsApp / QR):</p>
                          <p className="mt-1 break-all rounded bg-white/80 px-2 py-1 font-mono text-[11px] text-stone-700">{j.trackingUrl}</p>
                          <CustomerLinkQr url={j.trackingUrl} size={220} mode="qr" caption="Customer scans QR to open customer review" className="mt-2" />
                        </>
                      ) : (
                        <p className="mt-1 text-[11px]">Tracking link is not available.</p>
                      )}
                    </div>
                  ) : null}
                  {j.status === "customer_rejected" ? (
                    <div className="w-full rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
                      {/* <p className="font-semibold">
                        Customer rejected the re-estimate. Watch is on hold for supervisor follow-up.
                      </p> */}
                      {/* <p className="mt-1 text-[11px]">
                        Call the customer and try to negotiate. If they agree on a revised amount, click
                        <span className="font-semibold"> &quot;Negotiate &amp; send re-estimate&quot;</span> to share the new
                        estimate via tracking link. If the customer still does not want the repair, click
                        <span className="font-semibold"> &quot;Move to internal outward&quot;</span> to send the watch back to the store
                        without billing.
                      </p> */}
                    </div>
                  ) : null}
                  {canOpenRepair ? (
                    <button
                      type="button"
                      onClick={() => openRepairPopup(j.id)}
                      disabled={hasSpareFlow && !spareFlowInwardDone}
                      className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {hasSpareFlow
                        ? spareFlowInwardDone
                          ? "Watch repaired (auto spare lines)"
                          : "Waiting spare inward"
                        : "Watch repaired"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => openReestimatePopup(j.id)}
                    disabled={j.status === "reestimate_required" || lockToRepairOnly}
                    className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {j.status === "customer_rejected" ? "Negotiate & send re-estimate" : "Need re-estimate"}
                  </button>
                  {j.status === "customer_rejected" ? (
                    <button
                      type="button"
                      onClick={() => openMoveToOdcPopup(j.id)}
                      className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
                    >
                      Move to internal outward (no repair)
                    </button>
                  ) : null}
                  {(j.status === "assigned" || j.status === "estimate_ok") && !lockToRepairOnly ? (
                    <button
                      type="button"
                      onClick={() => openTransferPopup(j.id)}
                      className="rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-900 hover:bg-indigo-100"
                    >
                      Send to other HO
                    </button>
                  ) : null}
                  {(j.status === "assigned" || j.status === "estimate_ok" || j.status === "reestimate_required" || j.status === "customer_rejected") && !lockToRepairOnly ? (
                    <button
                      type="button"
                      onClick={() => openSendToBrandPopup(j.id)}
                      className="rounded-xl border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-900 hover:bg-violet-100"
                    >
                      Send to brand
                    </button>
                  ) : null}
                  {(j.status === "assigned" || j.status === "estimate_ok") && !lockToRepairOnly ? (
                    <button
                      type="button"
                      onClick={() => openRequestSparesPopup(j.id)}
                      className="rounded-xl border border-cyan-300 bg-cyan-50 px-4 py-2 text-sm font-semibold text-cyan-900 hover:bg-cyan-100"
                    >
                      Order spares from other HO
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void toggleHistory(j.id)}
                    className="rounded-xl border border-zimson-300 bg-white px-4 py-2 text-sm font-semibold text-zimson-900 hover:bg-zimson-50"
                  >
                    {historyByJob[j.id] ? "Hide history" : "Show history"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTraceJobId(j.id)}
                    className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100"
                  >
                    View full trace
                  </button>
                  <button
                    type="button"
                    onClick={() => printEstimateDocument(j)}
                    className="rounded-xl border border-zimson-300 bg-white px-4 py-2 text-sm font-semibold text-zimson-900 hover:bg-zimson-50"
                  >
                    Print estimate
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
              );
            })}
          </div>
        )}
      </Card>
      </>
      ) : null}
      {repairPopupJobId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-zimson-900">Add used spares from inventory</h3>
            <p className="mt-1 text-sm text-stone-600">
              Select spares and quantity, then save. Repair is marked complete and the watch moves to front desk for outward.
            </p>
            {repairPopupError ? (
              <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-900" role="alert">
                {repairPopupError}
              </p>
            ) : null}
            <div className="mt-4 space-y-3">
              {repairLines.map((line, idx) => {
                const spare = activeSpares.find((s) => s.id === line.spareId);
                const unit = Number(unitPriceBySpareId[line.spareId] ?? spare?.sellingPriceInr ?? spare?.mrpInr ?? 0);
                const qty = Number(line.qty || 0);
                const hoStock = line.spareId ? hoStockBySpareId[line.spareId] : undefined;
                const lineShort =
                  line.spareId && hoStock != null && Number.isFinite(qty) && qty > 0 && qty > hoStock;
                return (
                <div key={idx} className="grid grid-cols-12 gap-2">
                  <select
                    value={line.spareId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setRepairPopupError("");
                      setRepairLines((prev) => prev.map((x, i) => (i === idx ? { ...x, spareId: nextId } : x)));
                      void ensureSparePrice(nextId);
                      void fetchHoStockQty(nextId);
                    }}
                    disabled={repairSaving}
                    className="col-span-8 rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm disabled:opacity-60"
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
                    x
                  </button>
                  <div className="col-span-12 text-xs text-stone-600">
                    Amount: INR {(unit * (Number.isFinite(qty) ? qty : 0)).toFixed(2)}
                    {line.spareId ? (
                      <span className={lineShort ? " ml-2 font-semibold text-rose-700" : " ml-2 text-stone-500"}>
                        · HO stock: {hoStock != null ? hoStock : "…"}
                        {lineShort ? ` (need ${qty}, only ${hoStock} available)` : ""}
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
                {repairSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {sendBrandPopupJobId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-zimson-900">Send SRF to brand</h3>
            <p className="mt-1 text-sm text-stone-600">
              Enter technician paper-note summary. System will generate an ODC number for brand dispatch.
            </p>
            <div className="mt-4 grid gap-3">
              <label className="text-sm">
                Brand dispatch reference / AWB (optional)
                <input
                  className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
                  value={sendBrandDispatchRef}
                  onChange={(e) => setSendBrandDispatchRef(e.target.value)}
                  placeholder="Optional courier / handover ref"
                />
              </label>
              <label className="text-sm">
                Technician note / reason *
                <textarea
                  className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
                  rows={3}
                  value={sendBrandReason}
                  onChange={(e) => setSendBrandReason(e.target.value)}
                  placeholder="Cannot be repaired at HO due to ..."
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={closeSendToBrandPopup} className="rounded-xl border border-zimson-300 px-4 py-2 text-sm">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void sendToBrandBySupervisor()}
                className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white"
              >
                Send to brand
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {brandEstimatePopupJobId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-zimson-900">Log brand estimate</h3>
            <div className="mt-4 grid gap-3">
              <label className="text-sm">Estimate amount (INR)
                <input className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm" value={brandEstimateAmountInput} onChange={(e) => setBrandEstimateAmountInput(e.target.value)} />
              </label>
              <label className="text-sm">Mail note / remarks
                <textarea className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm" rows={3} value={brandEstimateNoteInput} onChange={(e) => setBrandEstimateNoteInput(e.target.value)} />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setBrandEstimatePopupJobId(null)} className="rounded-xl border border-zimson-300 px-4 py-2 text-sm">Cancel</button>
              <button type="button" onClick={() => void confirmBrandEstimate()} className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white">Save</button>
            </div>
          </div>
        </div>
      ) : null}
      {brandInvoicePopupJobId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-zimson-900">Log brand invoice</h3>
            <div className="mt-4 grid gap-3">
              <label className="text-sm">Brand invoice reference *
                <input className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm" value={brandInvoiceRefInput} onChange={(e) => setBrandInvoiceRefInput(e.target.value)} />
              </label>
              <label className="text-sm">Brand invoice amount (main amount) *
                <input className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm" value={brandInvoiceAmountInput} onChange={(e) => setBrandInvoiceAmountInput(e.target.value)} />
              </label>
              <label className="text-sm">Note (optional)
                <textarea className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm" rows={2} value={brandInvoiceNoteInput} onChange={(e) => setBrandInvoiceNoteInput(e.target.value)} />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setBrandInvoicePopupJobId(null)} className="rounded-xl border border-zimson-300 px-4 py-2 text-sm">Cancel</button>
              <button type="button" onClick={() => void confirmBrandInvoice()} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Save and move outward</button>
            </div>
          </div>
        </div>
      ) : null}
      {brandCreditPopupJobId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-zimson-900">Log brand credit note</h3>
            <div className="mt-4 grid gap-3">
              <label className="text-sm">Coupon / credit note code *
                <input className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm" value={brandCouponCodeInput} onChange={(e) => setBrandCouponCodeInput(e.target.value)} />
              </label>
              <label className="text-sm">Coupon value (INR) *
                <input className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm" value={brandCouponValueInput} onChange={(e) => setBrandCouponValueInput(e.target.value)} />
              </label>
              <label className="text-sm">Valid until
                <input type="date" className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm" value={brandCouponValidUntilInput} onChange={(e) => setBrandCouponValidUntilInput(e.target.value)} />
              </label>
              <label className="text-sm">Remark
                <textarea className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm" rows={2} value={brandCouponNoteInput} onChange={(e) => setBrandCouponNoteInput(e.target.value)} />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setBrandCreditPopupJobId(null)} className="rounded-xl border border-zimson-300 px-4 py-2 text-sm">Cancel</button>
              <button type="button" onClick={() => void confirmBrandCreditNote()} className="rounded-xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white">Save coupon</button>
            </div>
          </div>
        </div>
      ) : null}
      {brandNotifyPopupJobId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-zimson-900">Customer coupon notification</h3>
            <label className="mt-3 block text-sm">Note
              <textarea className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm" rows={3} value={brandNotifyNoteInput} onChange={(e) => setBrandNotifyNoteInput(e.target.value)} />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setBrandNotifyPopupJobId(null)} className="rounded-xl border border-zimson-300 px-4 py-2 text-sm">Cancel</button>
              <button type="button" onClick={() => void confirmNotifyCoupon()} className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white">Mark notified</button>
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
      {requestSparesJobId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-zimson-900">Online spare sales order</h3>
            <p className="mt-1 text-sm text-stone-600">
              Raise spare requirement against this SRF (spare + qty only). Destination HO invoice price will be used after fulfill/inward.
            </p>
            <div className="mt-4 grid gap-3">
              <label className="text-sm">
                Supplier HO region
                <select
                  className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
                  value={requestSparesTargetRegionId}
                  onChange={(e) => setRequestSparesTargetRegionId(e.target.value)}
                >
                  <option value="">Select supplier HO</option>
                  {transferRegionOptions.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Requirement note
                <textarea
                  className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
                  rows={2}
                  value={requestSparesNote}
                  onChange={(e) => setRequestSparesNote(e.target.value)}
                />
              </label>
              <div className="space-y-2">
                {requestSparesLines.map((line, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2">
                    <select
                      value={line.spareId}
                      onChange={(e) =>
                        setRequestSparesLines((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, spareId: e.target.value } : x)),
                        )
                      }
                      className="col-span-7 rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
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
                        setRequestSparesLines((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)),
                        )
                      }
                      className="col-span-2 rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
                      placeholder="Qty"
                    />
                    <button
                      type="button"
                      onClick={() => setRequestSparesLines((prev) => prev.filter((_, i) => i !== idx))}
                      className="col-span-3 rounded-xl border border-zimson-300 bg-white text-sm"
                    >
                      x
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setRequestSparesLines((prev) => [...prev, { spareId: "", qty: "1" }])}
                  className="rounded-xl border border-zimson-300 bg-white px-4 py-2 text-sm font-semibold text-zimson-900"
                >
                  Add spare
                </button>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={closeRequestSparesPopup} className="rounded-xl border border-zimson-300 px-4 py-2 text-sm">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmRequestSparesOtherHo()}
                className="rounded-xl bg-cyan-700 px-4 py-2 text-sm font-semibold text-white"
              >
              Place online order
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {fulfillOrderId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-zimson-900">Process online spare sale</h3>
            <p className="mt-1 text-sm text-stone-600">Enter invoice reference and invoice rates. Stock will be deducted from this HO.</p>
            <div className="mt-4 grid gap-3">
              <label className="text-sm">
                Invoice reference
                <input
                  className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
                  value={fulfillInvoiceRef}
                  onChange={(e) => setFulfillInvoiceRef(e.target.value)}
                />
              </label>
              <label className="text-sm">
                Note (optional)
                <textarea
                  className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
                  rows={2}
                  value={fulfillNote}
                  onChange={(e) => setFulfillNote(e.target.value)}
                />
              </label>
              <div className="rounded-xl border border-zimson-200/80">
                <div className="grid grid-cols-12 gap-2 border-b border-zimson-200 bg-zimson-50/70 px-3 py-2 text-xs font-semibold text-stone-700">
                  <div className="col-span-5">Spare</div>
                  <div className="col-span-2 text-right">Qty</div>
                  <div className="col-span-3 text-right">Rate (INR)</div>
                  <div className="col-span-2 text-right">Total</div>
                </div>
                <div className="max-h-56 space-y-2 overflow-auto p-2">
                  {fulfillLines.map((line, idx) => {
                    const qty = Number(line.qty || 0);
                    const rate = Number(line.unitPriceInr || 0);
                    const total = (Number.isFinite(qty) ? qty : 0) * (Number.isFinite(rate) ? rate : 0);
                    return (
                      <div key={line.lineId} className="grid grid-cols-12 items-center gap-2 rounded-lg bg-white px-1 py-1 text-xs">
                        <div className="col-span-5 truncate text-stone-800">{line.spareName}</div>
                        <div className="col-span-2 text-right text-stone-700">{qty}</div>
                        <div className="col-span-3">
                          <input
                            value={line.unitPriceInr}
                            onChange={(e) =>
                              setFulfillLines((prev) =>
                                prev.map((x, i) => (i === idx ? { ...x, unitPriceInr: e.target.value.replace(/[^\d.]/g, "") } : x)),
                              )
                            }
                            className="w-full rounded-lg border border-zimson-300 bg-zimson-50/50 px-2 py-1 text-right text-xs"
                            placeholder="0"
                          />
                        </div>
                        <div className="col-span-2 text-right font-semibold text-stone-800">{total.toFixed(2)}</div>
                      </div>
                    );
                  })}
                  {fulfillLines.length === 0 ? (
                    <p className="px-1 py-2 text-xs text-stone-500">No order lines found for this online order.</p>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={closeFulfillOrder} className="rounded-xl border border-zimson-300 px-4 py-2 text-sm">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmFulfillOrder()}
                className="rounded-xl bg-zimson-700 px-4 py-2 text-sm font-semibold text-white"
              >
                Fulfill now
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {selectedOrder ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-start justify-between">
              <div>
            <h3 className="text-lg font-semibold text-zimson-900">Online order details — {selectedOrder.orderNumber}</h3>
                <p className="text-xs text-stone-600">
                  SRF {selectedOrder.srfReference} · {selectedOrder.fromRegionName} → {selectedOrder.toRegionName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOrderDetailsId(null)}
                className="rounded-xl border border-zimson-300 px-3 py-1.5 text-sm"
              >
                Close
              </button>
            </div>
            <div className="grid gap-2 rounded-xl border border-zimson-200 bg-zimson-50/40 p-3 text-xs text-stone-700 sm:grid-cols-2">
              <p><span className="font-semibold text-stone-900">Status:</span> {selectedOrder.status}</p>
              <p><span className="font-semibold text-stone-900">Requested by:</span> {selectedOrder.requestedByName ?? selectedOrder.requestedBy}</p>
              <p><span className="font-semibold text-stone-900">Requested at:</span> {new Date(selectedOrder.requestedAt).toLocaleString()}</p>
              <p><span className="font-semibold text-stone-900">Invoice ref:</span> {selectedOrder.invoiceRef ?? "-"}</p>
              <p className="sm:col-span-2"><span className="font-semibold text-stone-900">Request note:</span> {selectedOrder.note || "-"}</p>
              <p className="sm:col-span-2"><span className="font-semibold text-stone-900">Fulfill note:</span> {selectedOrder.fulfilledNote || "-"}</p>
            </div>
            <div className="mt-3 overflow-x-auto rounded-xl border border-zimson-200/80">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-zimson-50/90 text-stone-600">
                  <tr>
                    <th className="px-3 py-2">Spare</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Rate</th>
                    <th className="px-3 py-2 text-right">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOrder.lines.map((l) => (
                    <tr key={l.id} className="border-t border-zimson-100">
                      <td className="px-3 py-2">{l.spareName}</td>
                      <td className="px-3 py-2 text-right">{l.qty}</td>
                      <td className="px-3 py-2 text-right">
                        {Number(l.unitPriceInr ?? 0).toLocaleString(undefined, { style: "currency", currency: "INR" })}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">
                        {Number(l.lineTotalInr ?? 0).toLocaleString(undefined, { style: "currency", currency: "INR" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
      {moveToOdcPopupJobId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-rose-900">Move SRF to outward queue</h3>
            <p className="mt-1 text-sm text-stone-600">
              Use this only after speaking with the customer and confirming they do not want the repair. The
              watch will be returned to store via internal outward transfer and handed over without billing.
            </p>
            <div className="mt-4 grid gap-3">
              <label className="text-sm">
                Reason / call summary (optional)
                <textarea
                  className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
                  rows={3}
                  value={moveToOdcNote}
                  onChange={(e) => setMoveToOdcNote(e.target.value)}
                  placeholder="e.g. Spoke with customer on 12-Apr; declined revised estimate of INR 2,500."
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={closeMoveToOdcPopup} className="rounded-xl border border-zimson-300 px-4 py-2 text-sm">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmMoveToOdc()}
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white"
              >
                Confirm — move to internal outward
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {listDetailJob ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex flex-shrink-0 flex-wrap items-start justify-between gap-3 border-b border-zimson-200 bg-zimson-50/60 px-5 py-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-stone-500">SRF details</p>
                <h3 className="mt-0.5 font-mono text-lg font-bold text-zimson-900">{listDetailJob.reference}</h3>
                {listDetailMeta?.rootRef && listDetailMeta.rootRef !== listDetailJob.reference ? (
                  <p className="text-[11px] text-stone-500">
                    Sender / root: <span className="font-mono font-semibold">{listDetailMeta.rootRef}</span>
                  </p>
                ) : null}
                <p className="mt-0.5 text-sm text-stone-600">
                  {listDetailJob.customerName} · {listDetailJob.watchBrand} {listDetailJob.watchModel}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {listDetailMeta?.needsConvert ? (
                  <button
                    type="button"
                    onClick={() => void convertLocal(listDetailJob.id)}
                    className="rounded-lg border border-indigo-400 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-900 hover:bg-indigo-100"
                  >
                    Convert to local SRF
                  </button>
                ) : null}
                {listDetailMeta?.localRepair ? (
                  <button
                    type="button"
                    onClick={() => {
                      setListDetailJobId(null);
                      navigate(
                        `/service-centre/supervisor/srf/${encodeURIComponent(listDetailMeta.localRepair!.id)}`,
                      );
                    }}
                    className="rounded-lg border border-emerald-400 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
                  >
                    Open local SRF ({listDetailMeta.localRepair.reference})
                  </button>
                ) : (
                <button
                  type="button"
                  onClick={() => {
                    setListDetailJobId(null);
                    navigate(`/service-centre/supervisor/srf/${encodeURIComponent(listDetailJob.id)}`);
                  }}
                  className="rounded-lg border border-zimson-500 bg-zimson-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zimson-700"
                >
                  Open SRF
                </button>
                )}
                <button
                  type="button"
                  onClick={() => setTraceJobId(listDetailJob.id)}
                  className="rounded-lg border border-zimson-300 bg-white px-3 py-1.5 text-xs font-semibold text-zimson-900 hover:bg-zimson-50"
                >
                  Full trace
                </button>
                <button
                  type="button"
                  onClick={() => setListDetailJobId(null)}
                  className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                >
                  Close ✕
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-zimson-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-zimson-900">
                  {listDetailJob.status.replace(/_/g, " ")}
                </span>
                <span className="text-xs text-stone-500">Created {new Date(listDetailJob.createdAt).toLocaleString()}</span>
                {listDetailJob.inwardAt ? (
                  <span className="text-xs text-stone-500">SC inward {new Date(listDetailJob.inwardAt).toLocaleString()}</span>
                ) : null}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <section className="rounded-xl border border-zimson-200 bg-zimson-50/40 p-3">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-stone-500">Customer</p>
                  <table className="w-full text-sm">
                    <tbody>
                      <tr>
                        <td className="py-0.5 pr-3 font-medium text-stone-600">Name</td>
                        <td className="py-0.5">{listDetailJob.customerName}</td>
                      </tr>
                      <tr>
                        <td className="py-0.5 pr-3 font-medium text-stone-600">Phone</td>
                        <td className="py-0.5 font-mono">{listDetailJob.phone}</td>
                      </tr>
                    </tbody>
                  </table>
                </section>
                <section className="rounded-xl border border-zimson-200 bg-zimson-50/40 p-3">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-stone-500">Watch</p>
                  <table className="w-full text-sm">
                    <tbody>
                      <tr>
                        <td className="py-0.5 pr-3 font-medium text-stone-600">Brand / model</td>
                        <td className="py-0.5">
                          {listDetailJob.watchBrand} {listDetailJob.watchModel}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-0.5 pr-3 font-medium text-stone-600">Serial</td>
                        <td className="py-0.5 font-mono">{listDetailJob.serial || "—"}</td>
                      </tr>
                    </tbody>
                  </table>
                </section>
                <section className="rounded-xl border border-zimson-200 bg-zimson-50/40 p-3 sm:col-span-2">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-stone-500">Service &amp; logistics</p>
                  <table className="w-full text-sm">
                    <tbody>
                      <tr>
                        <td className="py-0.5 pr-3 font-medium text-stone-600 align-top">Complaint</td>
                        <td className="py-0.5">{listDetailJob.complaint || "—"}</td>
                      </tr>
                      <tr>
                        <td className="py-0.5 pr-3 font-medium text-stone-600">Estimate</td>
                        <td className="py-0.5 font-semibold text-zimson-900">
                          {Number(listDetailJob.estimateTotalInr ?? 0).toLocaleString(undefined, {
                            style: "currency",
                            currency: "INR",
                          })}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-0.5 pr-3 font-medium text-stone-600">Advance</td>
                        <td className="py-0.5">
                          {Number(listDetailJob.advanceInr ?? 0) > 0
                            ? Number(listDetailJob.advanceInr).toLocaleString(undefined, {
                                style: "currency",
                                currency: "INR",
                              })
                            : "—"}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-0.5 pr-3 font-medium text-stone-600">Inward DC</td>
                        <td className="py-0.5 font-mono">{listDetailJob.dcNumber ?? "—"}</td>
                      </tr>
                      <tr>
                        <td className="py-0.5 pr-3 font-medium text-stone-600">Outward DC</td>
                        <td className="py-0.5 font-mono">{listDetailJob.outwardDcNumber ?? "—"}</td>
                      </tr>
                      <tr>
                        <td className="py-0.5 pr-3 font-medium text-stone-600">Store / region</td>
                        <td className="py-0.5">
                          {listDetailJob.storeName ?? listDetailJob.storeId}
                          {listDetailJob.regionName ? ` · ${listDetailJob.regionName}` : ""}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </section>
              </div>
              {listDetailJob.photos && listDetailJob.photos.length > 0 ? (
                <section className="mt-4">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-stone-500">
                    Watch photos ({listDetailJob.photos.length})
                  </p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {listDetailJob.photos.map((p) => (
                      <div key={p.id} className="overflow-hidden rounded-lg border border-zimson-200">
                        <img src={`/${p.filePath}`} alt={p.photoKind ?? "watch"} className="aspect-[4/3] w-full object-cover" />
                        <p className="border-t border-zimson-100 bg-zimson-50/70 px-1.5 py-0.5 text-center text-[10px] capitalize text-stone-600">
                          {p.photoKind ?? "other"}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    printSrfDocument({
                      reference: listDetailJob.reference,
                      customerName: listDetailJob.customerName,
                      phone: listDetailJob.phone,
                      watchBrand: listDetailJob.watchBrand,
                      watchModel: listDetailJob.watchModel,
                      serial: listDetailJob.serial,
                      complaint: listDetailJob.complaint || "-",
                      estimateTotalInr: Number(listDetailJob.estimateTotalInr ?? 0),
                      photos: listDetailJob.photos ?? [],
                    })
                  }
                  className="rounded-lg border border-zimson-300 bg-zimson-50 px-3 py-1.5 text-xs font-semibold text-zimson-900 hover:bg-zimson-100"
                >
                  Print SRF
                </button>
                <button
                  type="button"
                  onClick={() => printEstimateDocument(listDetailJob)}
                  className="rounded-lg border border-zimson-300 bg-zimson-50 px-3 py-1.5 text-xs font-semibold text-zimson-900 hover:bg-zimson-100"
                >
                  Print estimate
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {convertLocalAck ? (
        <ProcessSuccessModal
          open
          title="Local SRF created"
          description={`${convertLocalAck.reference} — ready for technician assignment`}
          onBackdropClick={() => setConvertLocalAck(null)}
          actions={
            <>
              <button
                type="button"
                className="inline-flex w-full min-w-0 items-center justify-center rounded-xl bg-rlx-green px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rlx-green/90 sm:w-auto"
                onClick={() => {
                  const id = convertLocalAck.newSrfId;
                  setConvertLocalAck(null);
                  navigate(`/service-centre/supervisor/srf/${encodeURIComponent(id)}`);
                }}
              >
                Open local SRF
              </button>
              <button
                type="button"
                className="inline-flex w-full min-w-0 items-center justify-center rounded-xl border border-rlx-rule bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 sm:w-auto"
                onClick={() => setConvertLocalAck(null)}
              >
                Close
              </button>
            </>
          }
        >
          <div className="rounded-xl border-2 border-rlx-green/30 bg-rlx-green/5 px-4 py-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-rlx-green">New local SRF</p>
            <p className="mt-1 font-mono text-2xl font-bold text-stone-900">{convertLocalAck.reference}</p>
          </div>
          <p className="mt-3 text-sm text-stone-600">
            Converted from inter-HO transfer <span className="font-mono font-semibold">{convertLocalAck.sourceReference}</span>.
            Open the new SRF to assign a technician and continue repair at this HO.
          </p>
        </ProcessSuccessModal>
      ) : null}

      {assignSuccessAck ? (
        <ProcessSuccessModal
          open
          title="Watch assigned to technician"
          description={`${assignSuccessAck.reference} · ${assignSuccessAck.technicianLabel}`}
          onBackdropClick={() => setAssignSuccessAck(null)}
          actions={
            <>
              <button
                type="button"
                className="inline-flex w-full min-w-0 items-center justify-center rounded-xl bg-rlx-green px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rlx-green/90 sm:w-auto"
                onClick={() =>
                  printAssignmentSlip(assignSuccessAck.job, assignSuccessAck.technicianLabel, {
                    assignedAt: assignSuccessAck.job.assignedAt
                      ? new Date(assignSuccessAck.job.assignedAt)
                      : new Date(),
                    serviceCentreLabel:
                      regions.find((r) => r.id === user?.regionId)?.name ?? assignSuccessAck.job.regionName,
                  })
                }
              >
                Print technician notes
              </button>
              <button
                type="button"
                className="inline-flex w-full min-w-0 items-center justify-center rounded-xl border border-rlx-rule bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 sm:w-auto"
                onClick={() => setAssignSuccessAck(null)}
              >
                Done
              </button>
            </>
          }
        >
          <div className="rounded-xl border-2 border-rlx-green/30 bg-rlx-green/5 px-4 py-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-rlx-green">SRF reference</p>
            <p className="mt-1 font-mono text-2xl font-bold text-stone-900">{assignSuccessAck.reference}</p>
          </div>
          <p className="mt-3 text-sm text-stone-700">
            <span className="font-semibold text-stone-900">{assignSuccessAck.customerName}</span>
            {" · "}
            {assignSuccessAck.watchLabel}
          </p>
          <p className="mt-3 rounded-lg border border-rlx-rule bg-stone-50 px-3 py-2 text-sm text-stone-800">
            Assigned to <strong>{assignSuccessAck.technicianLabel}</strong>. The technician can open the workbench
            and start the repair.
          </p>
        </ProcessSuccessModal>
      ) : null}

      {repairSuccessMonitor ? (
        <ProcessSuccessModal
          open
          title="Watch repaired successfully"
          description="Sent to front desk for outward processing."
          onBackdropClick={() => setRepairSuccessMonitor(null)}
          actions={
            <button
              type="button"
              className="inline-flex w-full min-w-0 items-center justify-center rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 sm:w-auto"
              onClick={() => setRepairSuccessMonitor(null)}
            >
              Done
            </button>
          }
        >
          <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/80 px-4 py-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">SRF reference</p>
            <p className="mt-1 font-mono text-2xl font-bold text-emerald-900">{repairSuccessMonitor.reference}</p>
          </div>
          <p className="mt-3 text-sm text-stone-700">
            <span className="font-semibold text-stone-900">{repairSuccessMonitor.customerName}</span>
            {" · "}
            {repairSuccessMonitor.watchLabel}
          </p>
          <p className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2 text-sm font-medium text-emerald-900">
            The watch is in the outward queue. Front desk / logistics will dispatch when ready.
          </p>
        </ProcessSuccessModal>
      ) : null}

      {traceJobId ? <SrfTraceModal srfId={traceJobId} onClose={() => setTraceJobId(null)} /> : null}
    </div>
  );
}
