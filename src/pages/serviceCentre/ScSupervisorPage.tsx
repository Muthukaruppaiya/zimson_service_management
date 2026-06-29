import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { SrfTraceModal } from "../../components/service/SrfTraceModal";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { ProcessSuccessModal } from "../../components/ui/ProcessSuccessModal";
import { useAuth } from "../../context/AuthContext";
import { useRegions } from "../../context/RegionsContext";
import { useSpares } from "../../context/SparesContext";
import { useSrfJobs } from "../../context/SrfJobsContext";
import { ApiError, apiJson } from "../../lib/api";
import { srfReestimateNotifyMessage } from "../../lib/srfApprovalWhatsApp";
import {
  findLocalRepairSrfForRoot,
  interHoMainAndReceiverRefs,
  isArchivedSrfJob,
  isInterHoReceiverLocal,
  jobVisibleToServiceCentre,
  rootSrfBookingReference,
  shouldShowInSupervisorSrfList,
  isInterHoSenderReestimateRow,
  isInterHoSenderBrandEstimateRow,
  isInterHoSenderActionRow,
  findInterHoArchivedSenderForReceiver,
  isSenderHoUserForInterHoJob,
} from "../../lib/srfAccess";
import { printAssignmentSlip, printBrandDispatchDocument, printEstimateDocument, printSrfDocument } from "../../lib/serviceDocuments";
import type { SrfJob } from "../../types/srfJob";
import type { SparePriceLine, SpareStockRow } from "../../types/spare";
import type { TechnicianProfile } from "../../types/technician";
import { openPrintDocument } from "../../lib/inventoryDocuments";
import { formatInr } from "../../lib/formatInr";
import {
  resolveSparePriceFromLines,
  spareMasterSellingPrice,
  sparePriceCacheKey,
} from "../../lib/spareSellingPrice";
import { inputClassReadOnly } from "../../lib/uiForm";
import { EwayBillModal } from "../../components/service/EwayBillModal";
import { formatEwayEdocMessage, type EdocUiResult } from "../../lib/edocResultMessage";

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

function customerDeclinedBrandEstimate(job: SrfJob): boolean {
  return job.status === "brand_estimate_pending" && job.customerReestimateResponse === "rejected";
}

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

function needsInterHoSenderInvoice(
  job: Pick<SrfJob, "transferSourceRegionId" | "requiresLocalConversion" | "hoSparesBillRef" | "interHoReturnWithoutRepair">,
): boolean {
  if (job.interHoReturnWithoutRepair) return false;
  return (
    !!(job.transferSourceRegionId ?? "").trim() &&
    !job.requiresLocalConversion &&
    !(job.hoSparesBillRef ?? "").trim()
  );
}

function resolveInterHoBrandForwardAmount(jobId: string, jobs: SrfJob[]): { brandEstimateInr: number; remark: string } {
  const row = jobs.find((j) => j.id === jobId);
  if (!row) return { brandEstimateInr: 0, remark: "" };
  let receiver = row.status !== "sent_to_other_ho" ? row : undefined;
  let arch = row.status === "sent_to_other_ho" ? row : undefined;
  if (!receiver && arch?.interHoReestimateReceiverSrfId) {
    receiver = jobs.find((j) => j.id === arch!.interHoReestimateReceiverSrfId);
  }
  if (!arch && receiver) {
    const root = rootSrfBookingReference(receiver);
    arch = jobs.find(
      (j) =>
        j.status === "sent_to_other_ho" &&
        (j.interHoReestimateReceiverSrfId === receiver!.id || rootSrfBookingReference(j) === root),
    );
  }
  const amountSource = receiver ?? arch ?? row;
  const brandEstimateInr = Number(
    receiver?.brandEstimateInr ?? amountSource?.brandEstimateInr ?? amountSource?.reestimateRequestedInr ?? 0,
  );
  const remark = String(
    amountSource?.reestimateRequestedNote ?? "Brand repair estimate — includes handling and service charges.",
  );
  return { brandEstimateInr, remark };
}

type BrandConfirmKind = "approve_send_brand" | "receive_from_brand";

type BrandSuccessAck = {
  title: string;
  description: string;
  reference: string;
  detail: string;
  interHoInvoiceJobId?: string;
};

export function ScSupervisorPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { srfId } = useParams<{ srfId?: string }>();
  const senderApprovalOnlyView = location.pathname === "/service-centre/supervisor/reestimate-sender";
  const { user } = useAuth();
  const { regions } = useRegions();
  const { activeSpares } = useSpares();
  const {
    jobs,
    assignTechnician,
    convertTransferredSrfToLocal,
    supervisorRequestReestimate,
    interHoRequestReestimate,
    interHoForwardReestimateToCustomer,
    interHoApproveReestimateForReceiver,
    interHoForwardBrandEstimateToSender,
    interHoForwardBrandEstimateToCustomer,
    interHoApproveBrandEstimateForReceiver,
    interHoReturnWithoutRepair,
    technicianSendToBrand,
    supervisorConfirmBrandDispatch,
    supervisorTransferToOtherHo,
    submitSparesSlip,
    supervisorMarkRepairComplete,
    supervisorMoveRejectedToOdc,
    supervisorLogBrandEstimate,
    supervisorApproveBrandEstimate,
    supervisorForwardBrandEstimateToCustomer,
    supervisorBrandReturnWithoutRepair,
    supervisorCustomerAcceptedBrandEstimateLater,
    supervisorBrandReadyOutwardNoRepair,
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
  const [reestimatePreviousInr, setReestimatePreviousInr] = useState(0);
  const [reestimateAmountInput, setReestimateAmountInput] = useState("");
  const [reestimateRemarkInput, setReestimateRemarkInput] = useState("");
  const [reestimateInterHoMode, setReestimateInterHoMode] = useState(false);
  const [senderForwardPopupJobId, setSenderForwardPopupJobId] = useState<string | null>(null);
  const [senderForwardAmountInput, setSenderForwardAmountInput] = useState("");
  const [senderForwardRemarkInput, setSenderForwardRemarkInput] = useState("");
  const [transferPopupJobId, setTransferPopupJobId] = useState<string | null>(null);
  const [transferTargetRegionId, setTransferTargetRegionId] = useState("");
  const [transferNoteInput, setTransferNoteInput] = useState("");
  const [repairPopupJobId, setRepairPopupJobId] = useState<string | null>(null);
  const repairPopupJob = useMemo(
    () => (repairPopupJobId ? jobs.find((j) => j.id === repairPopupJobId) ?? null : null),
    [repairPopupJobId, jobs],
  );
  const [repairLines, setRepairLines] = useState<Array<{ spareId: string; qty: string }>>([{ spareId: "", qty: "1" }]);
  const [unitPriceBySpareId, setUnitPriceBySpareId] = useState<Record<string, number>>({});
  const [hoStockBySpareId, setHoStockBySpareId] = useState<Record<string, number>>({});
  const [repairPopupError, setRepairPopupError] = useState("");
  const [repairSaving, setRepairSaving] = useState(false);
  const [repairSuccessMonitor, setRepairSuccessMonitor] = useState<{
    reference: string;
    customerName: string;
    watchLabel: string;
    spareSummary: string;
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
  const [moveToOdcInterHo, setMoveToOdcInterHo] = useState(false);
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
  const [ewayBrandJobId, setEwayBrandJobId] = useState<string | null>(null);
  const [sendBrandReason, setSendBrandReason] = useState("Cannot be repaired at HO");
  const [brandEstimatePopupJobId, setBrandEstimatePopupJobId] = useState<string | null>(null);
  const [brandEstimateAmountInput, setBrandEstimateAmountInput] = useState("");
  const [brandEstimateNoteInput, setBrandEstimateNoteInput] = useState("");
  const [brandForwardPopupJobId, setBrandForwardPopupJobId] = useState<string | null>(null);
  const [brandForwardInterHoSender, setBrandForwardInterHoSender] = useState(false);
  const [senderForwardBrandMode, setSenderForwardBrandMode] = useState(false);
  const [brandMarkupInput, setBrandMarkupInput] = useState("");
  const [brandForwardNoteInput, setBrandForwardNoteInput] = useState("");
  const [brandInvoicePopupJobId, setBrandInvoicePopupJobId] = useState<string | null>(null);
  const [brandInvoiceRefInput, setBrandInvoiceRefInput] = useState("");
  const [brandInvoiceAmountInput, setBrandInvoiceAmountInput] = useState("");
  const [brandInvoiceNoteInput, setBrandInvoiceNoteInput] = useState("");
  const [brandCreditPopupJobId, setBrandCreditPopupJobId] = useState<string | null>(null);
  const [brandCreditNoteRefInput, setBrandCreditNoteRefInput] = useState("");
  const [brandCouponValidUntilInput, setBrandCouponValidUntilInput] = useState("");
  const [brandCouponNoteInput, setBrandCouponNoteInput] = useState("");
  const [brandNotifyPopupJobId, setBrandNotifyPopupJobId] = useState<string | null>(null);
  const [brandNotifyNoteInput, setBrandNotifyNoteInput] = useState("Customer informed through web, SMS and WhatsApp copy.");
  const [brandConfirmPopup, setBrandConfirmPopup] = useState<{
    kind: BrandConfirmKind;
    jobId: string;
    note: string;
  } | null>(null);
  const [brandSuccessAck, setBrandSuccessAck] = useState<BrandSuccessAck | null>(null);
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
          j.status === "customer_rejected" ||
          j.status === "inter_ho_reestimate_pending_sender" ||
          j.status === "inter_ho_reestimate_customer_accepted") &&
        jobVisibleToServiceCentre(j, user) &&
        !(
          isInterHoReceiverLocal(j) &&
          !!j.interHoReestimatePhase &&
          (j.interHoReestimatePhase === "pending_sender" ||
            j.interHoReestimatePhase === "customer_pending" ||
            j.interHoReestimatePhase === "customer_accepted" ||
            j.interHoReestimatePhase === "customer_rejected") &&
          !!user.regionId &&
          user.regionId === j.transferSourceRegionId
        ),
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
          j.status === "brand_outward_pending" ||
          j.status === "brand_dispatch_pending" ||
          j.status === "brand_estimate_pending" ||
          j.status === "brand_estimate_customer_pending" ||
          j.status === "brand_estimate_customer_accepted" ||
          j.status === "brand_approved" ||
          j.status === "brand_repair_in_progress" ||
          j.status === "received_from_brand" ||
          j.status === "brand_credit_note_pending" ||
          j.status === "inter_ho_brand_estimate_pending_sender") &&
        jobVisibleToServiceCentre(j, user),
    );
  }, [jobs, user]);
  const brandDeskView = useMemo(
    () => (srfId ? brandDeskQueue.filter((j) => j.id === srfId) : brandDeskQueue),
    [brandDeskQueue, srfId],
  );
  /** Repair HO creates inter-HO invoice to sender HO before return dispatch (includes brand-return jobs). */
  const repairHoInvoiceQueue = useMemo(() => {
    if (!user) return [];
    return jobs.filter(
      (j) =>
        j.status === "ready_for_outward" &&
        needsInterHoSenderInvoice(j) &&
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
  const interHoSenderReestimateQueue = useMemo(() => {
    if (!user) return [];
    const seen = new Set<string>();
    const out: SrfJob[] = [];
    const push = (j: SrfJob) => {
      if (seen.has(j.id)) return;
      seen.add(j.id);
      out.push(j);
    };
    for (const j of jobs) {
      if (jobVisibleToServiceCentre(j, user) && isInterHoSenderActionRow(j, user, jobs)) {
        push(j);
      }
    }
    for (const j of jobs) {
      if (!jobVisibleToServiceCentre(j, user) || !isInterHoReceiverLocal(j)) continue;
      if (!isSenderHoUserForInterHoJob(j, user)) continue;
      if (
        j.status !== "inter_ho_brand_estimate_pending_sender" &&
        j.status !== "inter_ho_brand_estimate_customer_accepted" &&
        j.interHoBrandEstimatePhase !== "pending_sender" &&
        j.interHoBrandEstimatePhase !== "customer_accepted" &&
        j.interHoBrandEstimatePhase !== "customer_rejected"
      ) {
        continue;
      }
      const arch = findInterHoArchivedSenderForReceiver(j, jobs);
      if (arch) push(arch);
      else push(j);
    }
    return out;
  }, [jobs, user]);
  const interHoSenderActionQueue = useMemo(() => {
    if (!user) return [];
    return interHoSenderReestimateQueue.filter(
      (j) => {
        const brandPhase = j.interHoBrandEstimatePhase;
        const rePhase = j.interHoReestimatePhase;
        if (
          brandPhase === "pending_sender" ||
          brandPhase === "customer_rejected"
        ) {
          return true;
        }
        if (brandPhase === "customer_accepted") {
          return true;
        }
        if (
          rePhase === "pending_sender" ||
          rePhase === "customer_accepted" ||
          rePhase === "customer_rejected"
        ) {
          return true;
        }
        return (
          j.interHoReestimatePhase === "pending_sender" ||
          j.interHoReestimatePhase === "customer_pending" ||
          j.interHoReestimatePhase === "customer_accepted" ||
          j.interHoReestimatePhase === "customer_rejected" ||
          j.interHoBrandEstimatePhase === "customer_pending" ||
          ((j.status === "reestimate_required" || j.status === "customer_rejected") &&
            (!!j.transferSourceRegionId || !!j.transferTargetRegionId || !!j.transferSourceReference)) ||
          j.status === "inter_ho_reestimate_pending_sender" ||
          j.status === "inter_ho_reestimate_customer_accepted" ||
          j.status === "inter_ho_brand_estimate_pending_sender" ||
          j.status === "inter_ho_brand_estimate_customer_accepted"
        );
      },
    );
  }, [interHoSenderReestimateQueue, user]);
  const interHoSenderFallbackQueue = useMemo(() => {
    if (!user) return [];
    return jobs.filter((j) => {
      if (!jobVisibleToServiceCentre(j, user)) return false;
      if (isInterHoReceiverLocal(j)) return false;
      const interHoLinked =
        !!(j.transferSourceRegionId ?? "").trim() ||
        !!(j.transferTargetRegionId ?? "").trim() ||
        !!(j.transferSourceReference ?? "").trim() ||
        !!j.interHoReestimatePhase ||
        !!j.interHoBrandEstimatePhase;
      if (!interHoLinked) return false;
      return (
        j.status === "inter_ho_reestimate_pending_sender" ||
        j.status === "inter_ho_reestimate_customer_accepted" ||
        j.status === "inter_ho_brand_estimate_pending_sender" ||
        j.status === "inter_ho_brand_estimate_customer_accepted" ||
        j.status === "reestimate_required" ||
        j.status === "customer_rejected" ||
        j.status === "sent_to_other_ho"
      );
    });
  }, [jobs, user]);
  const interHoSenderReestimateView = useMemo(() => {
    const base = senderApprovalOnlyView
      ? interHoSenderFallbackQueue
      : interHoSenderActionQueue;
    return srfId ? base.filter((j) => j.id === srfId) : base;
  }, [interHoSenderActionQueue, interHoSenderFallbackQueue, senderApprovalOnlyView, srfId]);
  const transferredView = useMemo(
    () => (srfId ? transferredQueue.filter((j) => j.id === srfId) : transferredQueue),
    [transferredQueue, srfId],
  );
  const supervisorListRows = useMemo(() => {
    if (senderApprovalOnlyView) {
      return interHoSenderFallbackQueue;
    }
    const seen = new Set<string>();
    const rows: SrfJob[] = [];
    for (const j of [
      ...received,
      ...decisionQueue,
      ...brandDeskQueue,
      ...repairHoInvoiceQueue,
      ...interHoSenderReestimateQueue,
      ...transferredQueue,
    ]) {
      if (seen.has(j.id)) continue;
      if (!shouldShowInSupervisorSrfList(j, jobs)) continue;
      seen.add(j.id);
      rows.push(j);
    }
    return rows;
  }, [senderApprovalOnlyView, interHoSenderFallbackQueue, received, decisionQueue, brandDeskQueue, repairHoInvoiceQueue, interHoSenderReestimateQueue, transferredQueue, jobs]);

  const listDetailJob = useMemo(
    () => (listDetailJobId ? jobs.find((j) => j.id === listDetailJobId) ?? null : null),
    [jobs, listDetailJobId],
  );
  const listDetailMeta = useMemo(() => {
    if (!listDetailJob || !user) return null;
    const { mainRef, receiverRef } = interHoMainAndReceiverRefs(listDetailJob, jobs);
    const rootRef = rootSrfBookingReference(listDetailJob);
    const needsConvert =
      listDetailJob.status === "received_at_sc" && !!listDetailJob.requiresLocalConversion;
    const localRepair =
      listDetailJob.status === "sent_to_other_ho"
        ? findLocalRepairSrfForRoot(rootRef, jobs, user)
        : undefined;
    const senderBrandEstimate = isInterHoSenderBrandEstimateRow(listDetailJob, user, jobs);
    const senderReestimate =
      isInterHoSenderReestimateRow(listDetailJob, user, jobs) && !senderBrandEstimate;
    const showReestimateDetails =
      Number(listDetailJob.reestimateRequestedInr ?? 0) > 0 ||
      Boolean(listDetailJob.reestimateRequestedNote?.trim()) ||
      Boolean(listDetailJob.interHoReestimatePhase) ||
      Boolean(listDetailJob.interHoBrandEstimatePhase) ||
      listDetailJob.status === "reestimate_required" ||
      listDetailJob.status === "customer_rejected" ||
      listDetailJob.status === "inter_ho_reestimate_pending_sender" ||
      listDetailJob.status === "inter_ho_reestimate_customer_accepted" ||
      listDetailJob.status === "inter_ho_brand_estimate_pending_sender" ||
      listDetailJob.status === "inter_ho_brand_estimate_customer_accepted";
    return {
      mainRef,
      receiverRef,
      rootRef,
      needsConvert,
      localRepair,
      senderReestimate,
      senderBrandEstimate,
      showReestimateDetails,
    };
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
    setReestimateInterHoMode(isInterHoReceiverLocal(job ?? { reference: "", transferSourceReference: null, requiresLocalConversion: false, status: "" }));
    setReestimatePreviousInr(Number(job?.estimateTotalInr ?? 0));
    setReestimateAmountInput("");
    setReestimateRemarkInput("");
  }

  function closeReestimatePopup() {
    setReestimatePopupJobId(null);
    setReestimateInterHoMode(false);
    setReestimatePreviousInr(0);
    setReestimateAmountInput("");
    setReestimateRemarkInput("");
  }

  function openSenderForwardPopup(jobId: string) {
    const row = jobs.find((j) => j.id === jobId);
    if (!row) return;
    let receiver = row.status !== "sent_to_other_ho" ? row : undefined;
    let arch = row.status === "sent_to_other_ho" ? row : undefined;
    if (!receiver && arch?.interHoReestimateReceiverSrfId) {
      receiver = jobs.find((j) => j.id === arch!.interHoReestimateReceiverSrfId);
    }
    if (!arch && receiver && user) {
      const root = rootSrfBookingReference(receiver);
      arch = jobs.find(
        (j) =>
          j.status === "sent_to_other_ho" &&
          (j.interHoReestimateReceiverSrfId === receiver!.id || rootSrfBookingReference(j) === root),
      );
    }
    const isBrand =
      arch?.interHoBrandEstimatePhase === "pending_sender" ||
      arch?.interHoBrandEstimatePhase === "customer_rejected" ||
      row.interHoBrandEstimatePhase === "pending_sender" ||
      row.interHoBrandEstimatePhase === "customer_rejected";
    const amountSource = receiver ?? arch ?? row;
    const { brandEstimateInr, remark: brandRemark } = resolveInterHoBrandForwardAmount(jobId, jobs);
    setSenderForwardBrandMode(isBrand);
    setSenderForwardPopupJobId(jobId);
    if (isBrand) {
      setSenderForwardAmountInput(brandEstimateInr > 0 ? String(brandEstimateInr) : String(amountSource?.reestimateRequestedInr ?? ""));
      setSenderForwardRemarkInput(brandRemark);
    } else {
      setSenderForwardAmountInput(String(amountSource?.reestimateRequestedInr ?? ""));
      setSenderForwardRemarkInput(String(amountSource?.reestimateRequestedNote ?? ""));
    }
  }

  function closeSenderForwardPopup() {
    setSenderForwardPopupJobId(null);
    setSenderForwardAmountInput("");
    setSenderForwardRemarkInput("");
    setSenderForwardBrandMode(false);
  }

  async function confirmSenderForwardToCustomer() {
    if (!senderForwardPopupJobId) return;
    const note = senderForwardRemarkInput.trim();
    if (!note) {
      setFeedback((f) => ({ ...f, [senderForwardPopupJobId]: "Enter remark for customer." }));
      return;
    }
    if (senderForwardBrandMode) {
      const customerAmountInr = Number(senderForwardAmountInput);
      const { brandEstimateInr } = resolveInterHoBrandForwardAmount(senderForwardPopupJobId, jobs);
      if (!Number.isFinite(customerAmountInr) || customerAmountInr <= 0) {
        setFeedback((f) => ({ ...f, [senderForwardPopupJobId]: "Enter a valid amount for the customer." }));
        return;
      }
      const markupInr = Math.max(0, customerAmountInr - brandEstimateInr);
      try {
        const notify = await interHoForwardBrandEstimateToCustomer(senderForwardPopupJobId, { markupInr, note });
        setFeedback((f) => ({
          ...f,
          [senderForwardPopupJobId]: srfReestimateNotifyMessage(
            "Brand estimate sent to customer on the existing tracking link.",
            notify,
          ),
        }));
        closeSenderForwardPopup();
      } catch (e) {
        setFeedback((f) => ({
          ...f,
          [senderForwardPopupJobId]: e instanceof Error ? e.message : "Could not forward to customer.",
        }));
      }
      return;
    }
    const amount = Number(senderForwardAmountInput);
    if (!Number.isFinite(amount) || amount <= 0) {
      setFeedback((f) => ({ ...f, [senderForwardPopupJobId]: "Enter valid amount to send to customer." }));
      return;
    }
    try {
      const notify = await interHoForwardReestimateToCustomer(senderForwardPopupJobId, { estimateTotalInr: amount, note });
      setFeedback((f) => ({
        ...f,
        [senderForwardPopupJobId]: srfReestimateNotifyMessage(
          "Re-estimate sent to customer on the existing tracking link.",
          notify,
        ),
      }));
      closeSenderForwardPopup();
    } catch (e) {
      setFeedback((f) => ({
        ...f,
        [senderForwardPopupJobId]: e instanceof Error ? e.message : "Could not forward to customer.",
      }));
    }
  }

  async function approveInterHoForReceiver(archivedJobId: string) {
    const row = jobs.find((j) => j.id === archivedJobId);
    const isBrand = row?.interHoBrandEstimatePhase === "customer_accepted";
    try {
      if (isBrand) {
        await interHoApproveBrandEstimateForReceiver(archivedJobId);
        setFeedback((f) => ({
          ...f,
          [archivedJobId]: "Customer-approved brand estimate released to repair HO — they can approve brand repair.",
        }));
      } else {
        await interHoApproveReestimateForReceiver(archivedJobId);
        setFeedback((f) => ({
          ...f,
          [archivedJobId]: "Customer-approved re-estimate released to repair HO — repair can continue.",
        }));
      }
    } catch (e) {
      setFeedback((f) => ({
        ...f,
        [archivedJobId]: e instanceof Error ? e.message : "Could not approve for repair HO.",
      }));
    }
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
      if (reestimateInterHoMode) {
        await interHoRequestReestimate(reestimatePopupJobId, { estimateTotalInr: amount, note });
        setFeedback((f) => ({
          ...f,
          [reestimatePopupJobId]: "Re-estimate sent to sender HO — they will forward to the customer.",
        }));
      } else {
        const notify = await supervisorRequestReestimate(reestimatePopupJobId, { estimateTotalInr: amount, note });
        setFeedback((f) => ({
          ...f,
          [reestimatePopupJobId]: srfReestimateNotifyMessage("Re-estimate sent to customer for approval.", notify),
        }));
      }
      closeReestimatePopup();
    } catch (e) {
      setFeedback((f) => ({
        ...f,
        [reestimatePopupJobId]: e instanceof Error ? e.message : "Could not mark re-estimate.",
      }));
    }
  }

  function openMoveToOdcPopup(jobId: string) {
    const job = jobs.find((j) => j.id === jobId);
    setMoveToOdcInterHo(job ? isInterHoReceiverLocal(job) : false);
    setMoveToOdcPopupJobId(jobId);
    setMoveToOdcNote("");
  }

  function closeMoveToOdcPopup() {
    setMoveToOdcPopupJobId(null);
    setMoveToOdcInterHo(false);
    setMoveToOdcNote("");
  }

  async function confirmMoveToOdc() {
    if (!moveToOdcPopupJobId) return;
    try {
      if (moveToOdcInterHo) {
        await interHoReturnWithoutRepair(moveToOdcPopupJobId, moveToOdcNote.trim());
        setFeedback((f) => ({
          ...f,
          [moveToOdcPopupJobId]:
            "Queued return to sender HO without repair. Logistics: create return DC to sender HO. Sender HO will inward and dispatch to store for customer handover (no billing).",
        }));
      } else {
        await supervisorMoveRejectedToOdc(moveToOdcPopupJobId, moveToOdcNote.trim());
        setFeedback((f) => ({
          ...f,
          [moveToOdcPopupJobId]:
            "Moved to internal outward queue. Logistics can now create internal outward transfer and return watch without billing.",
        }));
      }
      closeMoveToOdcPopup();
    } catch (e) {
      setFeedback((f) => ({
        ...f,
        [moveToOdcPopupJobId]: e instanceof Error ? e.message : "Could not move to outward queue.",
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
    if (!note) {
      setFeedback((f) => ({ ...f, [jobId]: "Reason is required to send to brand." }));
      return;
    }
    try {
      await technicianSendToBrand(jobId, { note });
      closeSendToBrandPopup();
      setBrandSuccessAck({
        title: "Queued for brand dispatch",
        description: jobs.find((x) => x.id === jobId)?.reference ?? jobId,
        reference: jobs.find((x) => x.id === jobId)?.reference ?? jobId,
        detail:
          "Front desk will enter courier / AWB details in Service Centre Logistics. You acknowledge and confirm dispatch on the brand desk after entry.",
      });
    } catch (e) {
      setFeedback((f) => ({
        ...f,
        [jobId]: e instanceof Error ? e.message : "Could not queue brand dispatch.",
      }));
    }
  }

  async function confirmBrandDispatchFromDesk(job: SrfJob) {
    const note = (job.brandDispatchNote ?? "").trim();
    try {
      const out = await supervisorConfirmBrandDispatch(job.id, { note: note || undefined });
      printBrandDispatchDocument(job, {
        dispatchRef: job.brandDispatchRef ?? undefined,
        note: note || job.brandDispatchClerkNote || undefined,
      });
      setEwayBrandJobId(job.id);
      setBrandSuccessAck({
        title: "Sent to brand",
        description: job.reference,
        reference: job.reference,
        detail: `ODC ${out.brandOdcNumber ?? "generated"}. Dispatch document opened for print. Track brand mail for estimate or credit note.`,
      });
    } catch (e) {
      setFeedback((f) => ({
        ...f,
        [job.id]: e instanceof Error ? e.message : "Could not confirm brand dispatch.",
      }));
    }
  }

  async function executeBrandConfirm() {
    if (!brandConfirmPopup) return;
    const { kind, jobId, note } = brandConfirmPopup;
    const job = jobs.find((j) => j.id === jobId);
    const reference = job?.reference ?? jobId;
    try {
      if (kind === "approve_send_brand") {
        await supervisorApproveBrandEstimate(jobId, {
          note: note.trim() || "Customer accepted — HO approval sent to brand.",
        });
        setBrandSuccessAck({
          title: "Approval sent to brand",
          description: reference,
          reference,
          detail: "HO approved the brand estimate. Brand repair is now in progress.",
        });
      } else if (kind === "receive_from_brand") {
        await supervisorReceiveFromBrand(jobId, {
          note: note.trim() || "Watch received from brand.",
        });
        const withoutRepair = job?.brandReturnWithoutRepair;
        setBrandSuccessAck({
          title: "Received from brand",
          description: reference,
          reference,
          detail: withoutRepair
            ? "Unrepaired watch received at HO. Use Send to store (no repair) to move to outward queue."
            : "Watch received at HO. Log the brand invoice to move to outward queue.",
        });
      }
      setBrandConfirmPopup(null);
    } catch (e) {
      setFeedback((f) => ({
        ...f,
        [jobId]: e instanceof Error ? e.message : "Could not update brand status.",
      }));
    }
  }

  async function confirmBrandForwardToCustomer() {
    if (!brandForwardPopupJobId) return;
    const jobId = brandForwardPopupJobId;
    const note = brandForwardNoteInput.trim();
    if (!note) {
      setFeedback((f) => ({ ...f, [jobId]: "Remark is required." }));
      return;
    }
    if (brandForwardInterHoSender) {
      try {
        await interHoForwardBrandEstimateToSender(jobId, { note });
        setBrandForwardPopupJobId(null);
        setBrandForwardInterHoSender(false);
        setBrandSuccessAck({
          title: "Estimate sent to sender HO",
          description: jobs.find((j) => j.id === jobId)?.reference ?? jobId,
          reference: jobs.find((j) => j.id === jobId)?.reference ?? jobId,
          detail: "Sender HO will add markup and forward the brand estimate to the customer for approval.",
        });
      } catch (e) {
        setFeedback((f) => ({ ...f, [jobId]: e instanceof Error ? e.message : "Could not forward to sender HO." }));
      }
      return;
    }
    const markupInr = Number(brandMarkupInput);
    if (!Number.isFinite(markupInr) || markupInr < 0) {
      setFeedback((f) => ({ ...f, [jobId]: "Enter a valid markup amount (0 or more)." }));
      return;
    }
    try {
      const notify = await supervisorForwardBrandEstimateToCustomer(jobId, { markupInr, note });
      setBrandForwardPopupJobId(null);
      setBrandSuccessAck({
        title: "Estimate sent to customer",
        description: jobs.find((j) => j.id === jobId)?.reference ?? jobId,
        reference: jobs.find((j) => j.id === jobId)?.reference ?? jobId,
        detail: srfReestimateNotifyMessage("Customer will approve on the tracking link.", notify),
      });
    } catch (e) {
      setFeedback((f) => ({ ...f, [jobId]: e instanceof Error ? e.message : "Could not forward to customer." }));
    }
  }

  async function confirmBrandReturnWithoutRepair(jobId: string) {
    const note = window.prompt(
      "Remark — brand cannot repair / customer does not want brand repair:",
      "Brand cannot repair — watch will return without repair.",
    );
    if (note === null) return;
    const trimmed = note.trim();
    if (!trimmed) {
      setFeedback((f) => ({ ...f, [jobId]: "Remark is required." }));
      return;
    }
    try {
      await supervisorBrandReturnWithoutRepair(jobId, trimmed);
      setBrandSuccessAck({
        title: "Return without repair",
        description: jobs.find((j) => j.id === jobId)?.reference ?? jobId,
        reference: jobs.find((j) => j.id === jobId)?.reference ?? jobId,
        detail: "Awaiting watch return from brand. Mark received when the watch arrives at HO.",
      });
    } catch (e) {
      setFeedback((f) => ({
        ...f,
        [jobId]: e instanceof Error ? e.message : "Could not mark return without repair.",
      }));
    }
  }

  async function confirmCustomerAcceptedBrandEstimateLater(jobId: string) {
    const note = window.prompt(
      "Optional note — customer accepted brand estimate after follow-up:",
      "Customer accepted brand repair estimate on phone.",
    );
    if (note === null) return;
    try {
      await supervisorCustomerAcceptedBrandEstimateLater(jobId, note.trim() || undefined);
      setBrandSuccessAck({
        title: "Customer accepted estimate",
        description: jobs.find((j) => j.id === jobId)?.reference ?? jobId,
        reference: jobs.find((j) => j.id === jobId)?.reference ?? jobId,
        detail: "Approve and send to brand, then receive the watch and dispatch to store as usual.",
      });
    } catch (e) {
      setFeedback((f) => ({
        ...f,
        [jobId]: e instanceof Error ? e.message : "Could not record customer acceptance.",
      }));
    }
  }

  async function confirmBrandOutwardNoRepair(jobId: string) {
    const note = window.prompt(
      "Optional note — send unrepaired watch to store:",
      "Unrepaired watch from brand — dispatch to booking store.",
    );
    if (note === null) return;
    try {
      await supervisorBrandReadyOutwardNoRepair(jobId, note.trim() || undefined);
      setBrandSuccessAck({
        title: "Ready for outward",
        description: jobs.find((j) => j.id === jobId)?.reference ?? jobId,
        reference: jobs.find((j) => j.id === jobId)?.reference ?? jobId,
        detail: "Watch moved to logistics outward queue — no brand invoice required.",
      });
    } catch (e) {
      setFeedback((f) => ({
        ...f,
        [jobId]: e instanceof Error ? e.message : "Could not move to outward queue.",
      }));
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
      setBrandEstimatePopupJobId(null);
      setBrandSuccessAck({
        title: "Brand estimate logged",
        description: jobs.find((j) => j.id === jobId)?.reference ?? jobId,
        reference: jobs.find((j) => j.id === jobId)?.reference ?? jobId,
        detail: `Brand estimate INR ${amount.toFixed(2)} saved. Forward to customer with markup.`,
      });
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
      setBrandInvoicePopupJobId(null);
      const job = jobs.find((j) => j.id === jobId);
      const interHo = job ? needsInterHoSenderInvoice(job) : false;
      setBrandSuccessAck({
        title: "Brand invoice logged",
        description: job?.reference ?? jobId,
        reference: job?.reference ?? jobId,
        detail: interHo
          ? `Brand invoice ${invoiceRef} saved. Create invoice to sender HO next.`
          : `Brand invoice ${invoiceRef} saved. SRF moved to outward queue.`,
        interHoInvoiceJobId: interHo ? jobId : undefined,
      });
      if (interHo) {
        navigate(`/service-centre/inter-ho-invoice?srfId=${encodeURIComponent(jobId)}&invoiceFor=sender-ho`);
      }
    } catch (e) {
      setFeedback((f) => ({ ...f, [jobId]: e instanceof Error ? e.message : "Could not log brand invoice." }));
    }
  }

  async function confirmBrandCreditNote() {
    if (!brandCreditPopupJobId) return;
    const jobId = brandCreditPopupJobId;
    const brandCreditNoteRef = brandCreditNoteRefInput.trim();
    const validUntil = brandCouponValidUntilInput.trim();
    const note = brandCouponNoteInput.trim();
    if (!note) {
      setFeedback((f) => ({ ...f, [jobId]: "Credit note remark from brand mail is required." }));
      return;
    }
    try {
      await supervisorLogBrandCreditNote(jobId, {
        brandCreditNoteRef: brandCreditNoteRef || undefined,
        validUntil: validUntil || undefined,
        note,
      });
      setBrandCreditPopupJobId(null);
      setBrandSuccessAck({
        title: "Credit note sent to accounts",
        description: jobs.find((j) => j.id === jobId)?.reference ?? jobId,
        reference: jobs.find((j) => j.id === jobId)?.reference ?? jobId,
        detail: "Accounts HO will issue voucher and email the customer.",
      });
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
    const job = jobs.find((j) => j.id === jobId);
    const watchBrand = job?.watchBrand ?? "";
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
          next[sparePriceCacheKey(l.spareId, watchBrand)] = resolvedUnit;
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
      void ensureSparePrice(spareId, watchBrand);
    }
  }

  function closeRepairPopup() {
    setRepairPopupJobId(null);
    setRepairLines([{ spareId: "", qty: "1" }]);
    setUnitPriceBySpareId({});
    setRepairPopupError("");
    setRepairSaving(false);
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
        qty,
        unitPriceInr,
        lineTotalInr: unitPriceInr * qty,
      });
    }
    if (lines.length === 0) {
      setRepairPopupError("Add at least one used spare from inventory.");
      return;
    }
    if (lines.some((x) => Number(x.unitPriceInr ?? 0) <= 0)) {
      const missing = lines.find((x) => Number(x.unitPriceInr ?? 0) <= 0);
      const spare = missing ? activeSpares.find((s) => s.id === missing.spareId) : null;
      setRepairPopupError(
        `Selling price not assigned for ${spare?.name ?? "spare"}${watchBrand ? ` — add ${watchBrand} price in Inventory → Spare catalogue` : ""}.`,
      );
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
      const isInterHoReturnRepair =
        !!(job?.transferSourceRegionId ?? "").trim() &&
        !job?.requiresLocalConversion;
      if (isInterHoReturnRepair) {
        navigate(
          `/service-centre/inter-ho-invoice?srfId=${encodeURIComponent(jobId)}&invoiceFor=sender-ho`,
        );
        return;
      }
      if (job) {
        setRepairSuccessMonitor({
          reference: job.reference,
          customerName: job.customerName,
          watchLabel: `${job.watchBrand} ${job.watchModel}`.trim(),
          spareSummary: lines.map((x) => `${x.name} ×${x.qty}`).join(", "),
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

  function interHoReestimatePhaseLabel(phase: string | null | undefined): string {
    switch (phase) {
      case "pending_sender":
        return "Awaiting sender HO — forward to customer";
      case "customer_pending":
        return "With customer on tracking link";
      case "customer_accepted":
        return "Customer accepted — sender HO to approve repair";
      case "customer_rejected":
        return "Customer rejected — negotiate";
      default:
        return "—";
    }
  }

  function interHoBrandEstimatePhaseLabel(phase: string | null | undefined): string {
    switch (phase) {
      case "pending_sender":
        return "Awaiting sender HO — forward to customer";
      case "customer_pending":
        return "With customer on tracking link";
      case "customer_accepted":
        return "Customer approved — repair HO notified";
      case "customer_rejected":
        return "Customer rejected — negotiate";
      default:
        return "—";
    }
  }

  function supervisorListStatusLabel(job: SrfJob): string {
    if (job.interHoBrandEstimatePhase === "pending_sender" || job.status === "inter_ho_brand_estimate_pending_sender") {
      return "inter ho brand estimate pending sender";
    }
    if (job.interHoBrandEstimatePhase === "customer_pending") {
      return "brand estimate sent to customer";
    }
    if (job.interHoBrandEstimatePhase === "customer_accepted") {
      return "customer approved brand estimate";
    }
    if (job.status === "inter_ho_brand_estimate_customer_accepted") {
      return "customer approved brand estimate";
    }
    if (job.interHoReestimatePhase === "pending_sender" || job.status === "inter_ho_reestimate_pending_sender") {
      return "inter ho re-estimate pending sender";
    }
    if (job.interHoReestimatePhase === "customer_pending") {
      return "re-estimate sent to customer";
    }
    if (job.interHoReestimatePhase === "customer_rejected" || job.status === "customer_rejected") {
      return "customer rejected - negotiate";
    }
    if (job.interHoReestimatePhase === "customer_accepted" || job.status === "inter_ho_reestimate_customer_accepted") {
      return "customer accepted - awaiting sender approval";
    }
    return job.status.replace(/_/g, " ");
  }

  return (
    <div>
      <PageHeader
        title={senderApprovalOnlyView ? "Sender HO — re-estimate approvals" : "Supervisor — assign technicians"}
        description=""
        actions={
          <div className="flex flex-wrap gap-2">
            {!senderApprovalOnlyView ? (
              <Link
                to="/service-centre/supervisor/reestimate-sender"
                className="inline-flex rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900 shadow-sm transition hover:bg-amber-100"
              >
                Sender re-estimate approvals
              </Link>
            ) : (
              <Link
                to="/service-centre/supervisor"
                className="inline-flex rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-900 shadow-sm transition hover:bg-indigo-100"
              >
                Back to supervisor
              </Link>
            )}
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
                  const { mainRef, receiverRef } = interHoMainAndReceiverRefs(j, jobs);
                  const senderReestimate = user ? isInterHoSenderReestimateRow(j, user, jobs) : false;
                  const isInterHoLocal = isInterHoReceiverLocal(j);
                  const localRootRef = (j.transferSourceReference ?? "").trim();
                  const displayMainRef = isInterHoLocal ? j.reference : mainRef;
                  const needsConvert = j.status === "received_at_sc" && !!j.requiresLocalConversion;
                  return (
                  <tr key={j.id} className="border-b border-zimson-100 last:border-0">
                    <td className="px-3 py-2 font-mono text-xs font-semibold text-zimson-900">
                      {displayMainRef}
                      {senderReestimate ? (
                        <span className="mt-0.5 block text-[10px] font-semibold text-indigo-700">
                          Inter-HO re-estimate (sender action)
                        </span>
                      ) : null}
                      {isInterHoLocal ? (
                        <span className="mt-0.5 block text-[10px] font-semibold text-emerald-700">
                          Local repair SRF
                        </span>
                      ) : null}
                      {isInterHoLocal && localRootRef ? (
                        <span className="mt-0.5 block text-[10px] font-normal text-stone-500">
                          Root SRF: <span className="font-mono">{localRootRef}</span>
                        </span>
                      ) : null}
                      {!isInterHoLocal && receiverRef && receiverRef !== mainRef ? (
                        <span className="mt-0.5 block text-[10px] font-normal text-stone-500">
                          Receiver SRF (converted): <span className="font-mono">{receiverRef}</span>
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">{j.customerName}</td>
                    <td className="px-3 py-2">{j.watchBrand} {j.watchModel}</td>
                    <td className="px-3 py-2 text-xs text-stone-700">{supervisorListStatusLabel(j)}</td>
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
                        {senderReestimate &&
                        (j.interHoReestimatePhase === "pending_sender" ||
                          j.interHoReestimatePhase === "customer_rejected" ||
                          j.status === "inter_ho_reestimate_pending_sender") ? (
                          <button
                            type="button"
                            onClick={() => openSenderForwardPopup(j.id)}
                            className="rounded-lg border border-amber-500 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-100"
                          >
                            {j.interHoReestimatePhase === "customer_rejected"
                              ? "Negotiate & forward to customer"
                              : "Forward to customer"}
                          </button>
                        ) : null}
                        {senderReestimate &&
                        (j.interHoReestimatePhase === "customer_accepted" ||
                          j.status === "inter_ho_reestimate_customer_accepted") ? (
                          <button
                            type="button"
                            onClick={() => void approveInterHoForReceiver(j.id)}
                            className="rounded-lg border border-emerald-600 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
                          >
                            Approve repair HO
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => navigate(`/service-centre/supervisor/srf/${encodeURIComponent(j.id)}`)}
                          className="rounded-lg border border-zimson-300 bg-white px-3 py-1.5 text-xs font-semibold text-zimson-900 hover:bg-zimson-50"
                        >
                          Open SRF
                        </button>
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
            const { mainRef, receiverRef } = interHoMainAndReceiverRefs(j, jobs);
            const isInterHoLocal = isInterHoReceiverLocal(j);
            return (
            <div key={j.id} className="rounded-2xl border border-zimson-200/80 bg-white/90 p-4 shadow-sm">
              <p className="font-mono text-sm font-bold text-zimson-900">{mainRef}</p>
              {isInterHoLocal ? (
                <p className="text-[11px] font-semibold text-emerald-700">Local repair SRF (inter-HO)</p>
              ) : null}
              {receiverRef && receiverRef !== mainRef ? (
                <p className="text-[11px] text-stone-500">
                  Receiver SRF (converted): <span className="font-mono font-semibold">{receiverRef}</span>
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
          subtitle="Repair HO must invoice sender HO before return dispatch (local repair or brand return)"
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
      {interHoSenderReestimateView.length > 0 ? (
        <Card
          title={`Inter-HO customer approvals (sender) · ${interHoSenderReestimateView.length}`}
          subtitle="Repair HO re-estimate or brand estimate — forward to the customer on the existing tracking link."
          className="mb-6"
        >
          <div className="space-y-4">
            {interHoSenderReestimateView.map((j) => {
              const { mainRef, receiverRef } = interHoMainAndReceiverRefs(j, jobs);
              const isBrand = !!j.interHoBrandEstimatePhase;
              return (
                <div
                  key={j.id}
                  className="rounded-2xl border-2 border-indigo-200 bg-indigo-50/40 p-4 shadow-sm"
                >
                  <p className="font-mono text-sm font-bold text-zimson-900">{mainRef}</p>
                  {isBrand ? (
                    <p className="mt-0.5 text-[10px] font-semibold text-violet-700">Inter-HO brand estimate (sender action)</p>
                  ) : null}
                  {receiverRef && receiverRef !== mainRef ? (
                    <p className="text-[11px] text-stone-500">
                      Receiver SRF (converted): <span className="font-mono">{receiverRef}</span>
                    </p>
                  ) : null}
                  <p className="text-sm text-stone-800">{j.customerName} · {j.phone}</p>
                  <p className="mt-1 text-sm text-stone-600">
                    {j.watchBrand} {j.watchModel} · {j.serial}
                  </p>
                  {j.interHoBrandEstimatePhase === "pending_sender" ? (
                    <p className="mt-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-900">
                      Repair HO forwarded brand estimate INR {Number(j.reestimateRequestedInr ?? 0).toLocaleString()}
                      {j.reestimateRequestedNote ? ` — ${j.reestimateRequestedNote}` : ""}
                    </p>
                  ) : null}
                  {j.interHoBrandEstimatePhase === "customer_pending" ? (
                    <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                      Waiting for customer approval on brand estimate (INR{" "}
                      {Number(j.reestimateRequestedInr ?? 0).toLocaleString()}).
                    </p>
                  ) : null}
                  {j.interHoBrandEstimatePhase === "customer_accepted" ? (
                    <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
                      Customer approved brand estimate INR {Number(j.reestimateRequestedInr ?? 0).toLocaleString()}. Repair HO has been notified to approve and send to brand.
                    </p>
                  ) : null}
                  {j.interHoBrandEstimatePhase === "customer_rejected" ? (
                    <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-900">
                      Customer rejected brand estimate — negotiate and forward a revised quote via tracking link.
                    </p>
                  ) : null}
                  {j.interHoReestimatePhase === "pending_sender" ? (
                    <p className="mt-2 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-900">
                      Repair HO proposed INR {Number(j.reestimateRequestedInr ?? 0).toLocaleString()}
                      {j.reestimateRequestedNote ? ` — ${j.reestimateRequestedNote}` : ""}
                    </p>
                  ) : null}
                  {j.interHoReestimatePhase === "customer_pending" ? (
                    <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                      Waiting for customer approval on tracking link (INR{" "}
                      {Number(j.reestimateRequestedInr ?? 0).toLocaleString()}).
                    </p>
                  ) : null}
                  {j.interHoReestimatePhase === "customer_accepted" ? (
                    <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
                      Customer accepted INR {Number(j.reestimateRequestedInr ?? 0).toLocaleString()} — release repair HO.
                    </p>
                  ) : null}
                  {j.interHoReestimatePhase === "customer_rejected" ? (
                    <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-900">
                      Customer rejected — negotiate and send a revised amount via tracking link.
                    </p>
                  ) : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {(j.interHoBrandEstimatePhase === "pending_sender" || j.interHoBrandEstimatePhase === "customer_rejected") ? (
                      <button
                        type="button"
                        onClick={() => openSenderForwardPopup(j.id)}
                        className="rounded-xl border border-violet-500 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-950 hover:bg-violet-100"
                      >
                        {j.interHoBrandEstimatePhase === "customer_rejected"
                          ? "Negotiate & forward brand estimate"
                          : "Forward estimate to customer"}
                      </button>
                    ) : null}
                    {(j.interHoReestimatePhase === "pending_sender" || j.interHoReestimatePhase === "customer_rejected") ? (
                      <button
                        type="button"
                        onClick={() => openSenderForwardPopup(j.id)}
                        className="rounded-xl border border-amber-500 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100"
                      >
                        {j.interHoReestimatePhase === "customer_rejected"
                          ? "Negotiate & forward to customer"
                          : "Update price & forward to customer"}
                      </button>
                    ) : null}
                    {j.interHoReestimatePhase === "customer_accepted" ? (
                      <button
                        type="button"
                        onClick={() => void approveInterHoForReceiver(j.id)}
                        className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
                      >
                        Approve for repair HO
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setTraceJobId(j.id)}
                      className="rounded-xl border border-zimson-300 bg-white px-4 py-2 text-sm font-semibold text-zimson-900 hover:bg-zimson-50"
                    >
                      View trace
                    </button>
                  </div>
                  {feedback[j.id] ? <p className="mt-2 text-xs text-stone-600">{feedback[j.id]}</p> : null}
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}
      {brandDeskView.length > 0 ? (
        <Card title="Brand desk" subtitle="Send to brand → acknowledge brand mail → estimate or credit note path" className="mb-6">
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
                    {j.technicianBrandRecommendedAt ? (
                      <p className="mt-1 text-xs font-semibold text-violet-800">
                        Technician recommends brand repair
                        {j.technicianBrandRecommendNote ? ` — ${j.technicianBrandRecommendNote}` : ""}
                      </p>
                    ) : null}
                    {j.brandAcknowledgedAt ? (
                      <p className="mt-1 text-xs text-emerald-700">
                        Brand mail acknowledged
                        {j.brandMailRef ? ` · ${j.brandMailRef}` : ""}
                        {" · "}{new Date(j.brandAcknowledgedAt).toLocaleString()}
                      </p>
                    ) : null}
                    {j.brandCustomerQuoteInr ? (
                      <p className="mt-1 text-xs text-stone-600">
                        <span className="font-semibold">Customer quote:</span>{" "}
                        {Number(j.brandCustomerQuoteInr).toLocaleString(undefined, { style: "currency", currency: "INR" })}
                        {j.brandMarkupInr != null && Number(j.brandMarkupInr) > 0
                          ? ` (brand ${Number(j.brandEstimateInr ?? 0).toLocaleString(undefined, { style: "currency", currency: "INR" })} + markup ${Number(j.brandMarkupInr).toLocaleString(undefined, { style: "currency", currency: "INR" })})`
                          : ""}
                      </p>
                    ) : null}
                    {j.brandInvoiceAmountInr ? (
                      <p className="mt-1 text-xs text-stone-600">
                        <span className="font-semibold">Brand invoice:</span>{" "}
                        {Number(j.brandInvoiceAmountInr).toLocaleString(undefined, { style: "currency", currency: "INR" })}
                      </p>
                    ) : null}
                    {j.brandCouponValueInr ? (
                      <p className="mt-1 text-xs text-stone-600">
                        <span className="font-semibold">Credit note / voucher:</span>{" "}
                        {j.brandCouponCode ? `${j.brandCouponCode} · ` : ""}
                        {Number(j.brandCouponValueInr).toLocaleString(undefined, { style: "currency", currency: "INR" })}
                        {j.brandCreditNoteApprovedAt ? " · Accounts approved" : j.status === "brand_credit_note_pending" ? " · Pending accounts" : ""}
                      </p>
                    ) : null}
                    {needsInterHoSenderInvoice(j) ? (
                      <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                        Inter-HO transfer: invoice sender HO before return dispatch
                        {j.status === "received_from_brand"
                          ? " — complete this brand step, then create repair HO invoice."
                          : j.status === "sent_to_brand" || j.status === "brand_repair_in_progress"
                            ? " — after brand return and invoice."
                            : "."}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {j.status === "brand_outward_pending" ? (
                    <p className="w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      Waiting for front desk to log brand dispatch (courier / AWB) in Service Centre Logistics.
                      {j.brandDispatchNote ? ` Supervisor note: ${j.brandDispatchNote}` : ""}
                    </p>
                  ) : null}
                  {j.status === "brand_dispatch_pending" ? (
                    <>
                      <p className="w-full rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
                        Front desk logged dispatch ref <span className="font-mono font-semibold">{j.brandDispatchRef}</span>
                        {j.brandDispatchClerkNote ? ` — ${j.brandDispatchClerkNote}` : ""}
                        {j.brandDispatchClerkAt
                          ? ` (${new Date(j.brandDispatchClerkAt).toLocaleString()})`
                          : ""}
                      </p>
                      <button
                        type="button"
                        onClick={() => void confirmBrandDispatchFromDesk(j)}
                        className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800"
                      >
                        Acknowledge &amp; confirm send to brand
                      </button>
                    </>
                  ) : null}
                  {j.status === "sent_to_brand" ? (
                    <>
                      <p className="w-full rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900">
                        Watch sent to brand — log the outcome from brand mail when received (no separate mail acknowledgement step).
                      </p>
                      <button
                        type="button"
                        onClick={() => setEwayBrandJobId(j.id)}
                        className="rounded-xl border border-rlx-gold bg-white px-4 py-2 text-sm font-semibold text-rlx-green hover:bg-rlx-green-light"
                      >
                        Create e-way bill
                      </button>
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
                      <button
                        type="button"
                        onClick={() => {
                          setBrandCreditPopupJobId(j.id);
                          setBrandCreditNoteRefInput("");
                          setBrandCouponValidUntilInput("");
                          setBrandCouponNoteInput("");
                        }}
                        className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-900 hover:bg-rose-100"
                      >
                        Log brand credit note
                      </button>
                      <button
                        type="button"
                        onClick={() => void confirmBrandReturnWithoutRepair(j.id)}
                        className="rounded-xl border border-stone-400 bg-stone-100 px-4 py-2 text-sm font-semibold text-stone-900 hover:bg-stone-200"
                      >
                        Cannot repair — return without repair
                      </button>
                    </>
                  ) : null}
                  {j.status === "brand_estimate_pending" ? (
                    <>
                      {customerDeclinedBrandEstimate(j) ? (
                        <p className="w-full rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
                          Customer declined the brand repair estimate
                          {j.brandCustomerQuoteInr
                            ? ` (INR ${Number(j.brandCustomerQuoteInr).toLocaleString()}).`
                            : "."}{" "}
                          Resend to customer, record acceptance after follow-up, or return watch from brand without repair.
                        </p>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          setBrandForwardPopupJobId(j.id);
                          setBrandForwardInterHoSender(isInterHoReceiverLocal(j));
                          setBrandMarkupInput("");
                          setBrandForwardNoteInput(
                            isInterHoReceiverLocal(j)
                              ? "Brand repair estimate from brand mail — sender HO to forward to customer."
                              : "Brand repair estimate — includes handling and service charges.",
                          );
                        }}
                        className="rounded-xl bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800"
                      >
                        {customerDeclinedBrandEstimate(j)
                          ? "Resend estimate to customer"
                          : isInterHoReceiverLocal(j)
                            ? "Forward estimate to sender HO"
                            : "Forward estimate to customer"}
                      </button>
                      {customerDeclinedBrandEstimate(j) ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void confirmCustomerAcceptedBrandEstimateLater(j.id)}
                            className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
                          >
                            Customer accepted estimate (later)
                          </button>
                          <button
                            type="button"
                            onClick={() => void confirmBrandReturnWithoutRepair(j.id)}
                            className="rounded-xl border border-stone-400 bg-stone-100 px-4 py-2 text-sm font-semibold text-stone-900 hover:bg-stone-200"
                          >
                            Return from brand without repair
                          </button>
                        </>
                      ) : null}
                    </>
                  ) : null}
                  {j.status === "inter_ho_brand_estimate_pending_sender" ? (
                    <>
                      <p className="w-full rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
                        Brand estimate sent to sender HO (INR {Number(j.brandEstimateInr ?? j.reestimateRequestedInr ?? 0).toLocaleString()})
                        {user && isSenderHoUserForInterHoJob(j, user)
                          ? " — add markup and forward to the customer."
                          : " — awaiting sender HO to forward to customer."}
                      </p>
                      {user && isSenderHoUserForInterHoJob(j, user) ? (
                        <button
                          type="button"
                          onClick={() => {
                            const arch = findInterHoArchivedSenderForReceiver(j, jobs);
                            openSenderForwardPopup(arch?.id ?? j.id);
                          }}
                          className="rounded-xl border border-violet-500 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-950 hover:bg-violet-100"
                        >
                          Forward estimate to customer
                        </button>
                      ) : null}
                    </>
                  ) : null}
                  {j.status === "brand_estimate_customer_pending" && j.interHoBrandEstimatePhase === "customer_pending" ? (
                    <p className="w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      Sender HO forwarded brand estimate — waiting for customer approval
                      {j.brandCustomerQuoteInr
                        ? ` (INR ${Number(j.brandCustomerQuoteInr).toLocaleString()}).`
                        : "."}
                    </p>
                  ) : null}
                  {j.status === "brand_estimate_customer_pending" && !j.interHoBrandEstimatePhase ? (
                    <p className="w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      Waiting for customer approval on brand repair estimate
                      {j.brandCustomerQuoteInr
                        ? ` (INR ${Number(j.brandCustomerQuoteInr).toLocaleString()}).`
                        : "."}
                    </p>
                  ) : null}
                  {j.status === "brand_estimate_customer_accepted" ? (
                    user && isInterHoReceiverLocal(j) && isSenderHoUserForInterHoJob(j, user) ? (
                      <p className="w-full rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                        Customer approved brand estimate — repair HO has been notified to approve and send to brand.
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          setBrandConfirmPopup({
                            kind: "approve_send_brand",
                            jobId: j.id,
                            note: "Customer accepted — HO approval sent to brand.",
                          })
                        }
                        className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
                      >
                        Approve & send to brand
                      </button>
                    )
                  ) : null}
                  {j.status === "brand_approved" || j.status === "brand_repair_in_progress" ? (
                    <>
                      {j.brandReturnWithoutRepair ? (
                        <p className="w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-xs text-stone-800">
                          Awaiting return from brand <span className="font-semibold">without repair</span> — mark received when the watch arrives, then send to store.
                        </p>
                      ) : null}
                      <button
                      type="button"
                      onClick={() =>
                        setBrandConfirmPopup({
                          kind: "receive_from_brand",
                          jobId: j.id,
                          note: "Watch received from brand.",
                        })
                      }
                      className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800"
                    >
                      Mark received from brand
                    </button>
                    </>
                  ) : null}
                  {j.status === "received_from_brand" ? (
                    j.brandReturnWithoutRepair ? (
                      <button
                        type="button"
                        onClick={() => void confirmBrandOutwardNoRepair(j.id)}
                        className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
                      >
                        Send to store (no repair)
                      </button>
                    ) : (
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
                    )
                  ) : null}
                  {j.status === "brand_credit_note_pending" ? (
                    <p className="w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      Credit note logged — awaiting accounts HO to set amount, issue 12-digit voucher, and email customer. SRF will close automatically (watch stays at brand — no return dispatch).
                    </p>
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
              const { mainRef, receiverRef } = interHoMainAndReceiverRefs(j, jobs);
              const localRepair = user ? findLocalRepairSrfForRoot(mainRef, jobs, user) : undefined;
              return (
              <div key={j.id} className="rounded-2xl border border-zimson-200/80 bg-white/90 p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm font-bold text-zimson-900">{mainRef}</p>
                    {receiverRef && receiverRef !== mainRef ? (
                      <p className="text-[11px] text-stone-500">
                        Receiver SRF (converted): <span className="font-mono font-semibold">{receiverRef}</span>
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
                    {j.interHoReestimatePhase === "pending_sender" ? (
                      <p className="mt-2 text-xs font-semibold text-indigo-800">
                        Repair HO proposed re-estimate INR {Number(j.reestimateRequestedInr ?? 0).toLocaleString()}
                        {j.reestimateRequestedNote ? ` — ${j.reestimateRequestedNote}` : ""}
                      </p>
                    ) : null}
                    {j.interHoReestimatePhase === "customer_pending" ? (
                      <p className="mt-2 text-xs font-semibold text-amber-800">
                        Re-estimate forwarded to customer — awaiting tracking link approval.
                      </p>
                    ) : null}
                    {j.interHoReestimatePhase === "customer_accepted" ? (
                      <p className="mt-2 text-xs font-semibold text-emerald-800">
                        Customer accepted INR {Number(j.reestimateRequestedInr ?? 0).toLocaleString()} — release repair HO to continue.
                      </p>
                    ) : null}
                    {j.interHoReestimatePhase === "customer_rejected" ? (
                      <p className="mt-2 text-xs font-semibold text-rose-800">
                        Customer rejected — negotiate and send a revised amount via tracking link.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {j.interHoReestimatePhase === "pending_sender" || j.interHoReestimatePhase === "customer_rejected" ? (
                      <button
                        type="button"
                        onClick={() => openSenderForwardPopup(j.id)}
                        className="rounded-xl border border-amber-500 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100"
                      >
                        {j.interHoReestimatePhase === "customer_rejected"
                          ? "Negotiate & forward to customer"
                          : "Update price & forward to customer"}
                      </button>
                    ) : null}
                    {j.interHoReestimatePhase === "customer_accepted" ? (
                      <button
                        type="button"
                        onClick={() => void approveInterHoForReceiver(j.id)}
                        className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
                      >
                        Approve for repair HO
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
              const { mainRef, receiverRef } = interHoMainAndReceiverRefs(j, jobs);
              const spareFlow = spareFlowBySrfId.get(j.id) ?? null;
              const hasSpareFlow = !!spareFlow;
              const spareFlowInwardDone = Boolean(spareFlow?.inwardReceivedAt);
              const hasTransferFlow = Boolean(j.transferTargetRegionId || j.transferSourceRegionId || j.requiresLocalConversion);
              const interHoReceiverLocal = isInterHoReceiverLocal(j);
              const reestimateJourneyActive =
                j.status === "reestimate_required" ||
                j.status === "customer_rejected" ||
                j.status === "inter_ho_reestimate_pending_sender" ||
                j.status === "inter_ho_reestimate_customer_accepted" ||
                j.interHoReestimatePhase === "pending_sender" ||
                j.interHoReestimatePhase === "customer_pending" ||
                j.interHoReestimatePhase === "customer_rejected" ||
                j.interHoReestimatePhase === "customer_accepted";
              const lockTransferBrandSpares = hasSpareFlow || (hasTransferFlow && !interHoReceiverLocal);
              const disableReestimate =
                hasSpareFlow ||
                j.status === "inter_ho_reestimate_pending_sender" ||
                (hasTransferFlow && !interHoReceiverLocal);
              const canOpenRepair =
                !reestimateJourneyActive &&
                j.status !== "reestimate_required" &&
                j.status !== "customer_rejected" &&
                j.status !== "inter_ho_reestimate_pending_sender" &&
                j.status !== "inter_ho_reestimate_customer_accepted";
              return (
              <div key={j.id} className="rounded-2xl border border-zimson-200/80 bg-white/90 p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm font-bold text-zimson-900">{mainRef}</p>
                    {receiverRef && receiverRef !== mainRef ? (
                      <p className="text-[11px] text-stone-500">
                        Receiver SRF (converted): <span className="font-mono font-semibold">{receiverRef}</span>
                      </p>
                    ) : null}
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
                    {j.technicianBrandRecommendedAt ? (
                      <p className="mt-1 text-xs font-semibold text-violet-800">
                        Technician recommends brand repair
                        {j.technicianBrandRecommendNote ? ` — ${j.technicianBrandRecommendNote}` : ""}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {j.status === "reestimate_required" ? (
                    <div className="w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      <p className="font-semibold">
                        {j.interHoReestimatePhase === "customer_pending"
                          ? "Waiting for customer approval (sender HO forwarded via tracking link)."
                          : "Waiting for customer approval from tracking link."}
                      </p>
                    </div>
                  ) : null}
                  {j.status === "inter_ho_reestimate_pending_sender" ? (
                    <div className="w-full rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
                      <p className="font-semibold">
                        Re-estimate sent to sender HO (INR {Number(j.reestimateRequestedInr ?? 0).toLocaleString()}) — awaiting
                        customer forwarding.
                      </p>
                    </div>
                  ) : null}
                  {j.status === "inter_ho_reestimate_customer_accepted" ? (
                    <div className="w-full rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                      <p className="font-semibold">Customer accepted — awaiting sender HO to release repair.</p>
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
                    disabled={
                      j.status === "reestimate_required" ||
                      j.status === "inter_ho_reestimate_pending_sender" ||
                      j.status === "inter_ho_reestimate_customer_accepted" ||
                      disableReestimate
                    }
                    className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {j.status === "customer_rejected"
                      ? interHoReceiverLocal
                        ? "Negotiate & resend to sender HO"
                        : "Negotiate & send re-estimate"
                      : interHoReceiverLocal
                        ? "Need re-estimate (sender HO)"
                        : "Need re-estimate"}
                  </button>
                  {j.status === "customer_rejected" ? (
                    <button
                      type="button"
                      onClick={() => openMoveToOdcPopup(j.id)}
                      className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
                    >
                      {interHoReceiverLocal
                        ? "Return to sender HO (no repair)"
                        : "Move to internal outward (no repair)"}
                    </button>
                  ) : null}
                  {(j.status === "assigned" || j.status === "estimate_ok") && !lockTransferBrandSpares && !interHoReceiverLocal && !reestimateJourneyActive ? (
                    <button
                      type="button"
                      onClick={() => openTransferPopup(j.id)}
                      className="rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-900 hover:bg-indigo-100"
                    >
                      Send to other HO
                    </button>
                  ) : null}
                  {(j.status === "assigned" ||
                    j.status === "estimate_ok" ||
                    j.status === "reestimate_required" ||
                    j.status === "customer_rejected") &&
                  !lockTransferBrandSpares &&
                  !reestimateJourneyActive ? (
                    <button
                      type="button"
                      onClick={() => openSendToBrandPopup(j.id)}
                      className="rounded-xl border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-900 hover:bg-violet-100"
                    >
                      Send to brand
                    </button>
                  ) : null}
                  {(j.status === "assigned" || j.status === "estimate_ok") && !lockTransferBrandSpares && !reestimateJourneyActive ? (
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
      {senderForwardPopupJobId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-zimson-900">
              {senderForwardBrandMode ? "Forward brand estimate to customer" : "Forward re-estimate to customer"}
            </h3>
            <p className="mt-1 text-sm text-stone-600">
              {senderForwardBrandMode
                ? "Customer quote is pre-filled from the brand estimate. Increase the amount to add markup, then send on the tracking link."
                : "Update the price if needed, then send to the customer on the same tracking link used at booking."}
            </p>
            <div className="mt-4 grid gap-3">
              <label className="text-sm">
                {senderForwardBrandMode ? "Amount for customer (INR) *" : "Amount for customer (INR) *"}
                <input
                  className="mt-1 w-full rounded-xl border border-zimson-300 bg-white px-3 py-2 text-sm"
                  value={senderForwardAmountInput}
                  onChange={(e) => setSenderForwardAmountInput(e.target.value)}
                  placeholder={senderForwardBrandMode ? "Brand estimate amount" : "Revised estimate"}
                  autoFocus
                />
              </label>
              <label className="text-sm">
                Remarks for customer
                <textarea
                  className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
                  rows={3}
                  value={senderForwardRemarkInput}
                  onChange={(e) => setSenderForwardRemarkInput(e.target.value)}
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={closeSenderForwardPopup} className="rounded-xl border border-zimson-300 px-4 py-2 text-sm">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmSenderForwardToCustomer()}
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
            <h3 className="text-lg font-semibold text-zimson-900">Add used spares from inventory</h3>
            <p className="mt-1 text-sm text-stone-600">
              Select spares and quantity, then save. Repair is marked complete and the watch moves to front desk for outward.
              {repairPopupJob?.watchBrand ? (
                <span className="block mt-1 text-xs text-stone-500">
                  Selling prices use watch brand <strong>{repairPopupJob.watchBrand}</strong> from spare catalogue.
                </span>
              ) : null}
            </p>
            {repairPopupError ? (
              <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-900" role="alert">
                {repairPopupError}
              </p>
            ) : null}
            <div className="mt-4 space-y-3">
              {repairLines.map((line, idx) => {
                const watchBrand = repairPopupJob?.watchBrand ?? "";
                const spare = activeSpares.find((s) => s.id === line.spareId);
                const unit = resolveSpareUnitPrice(line.spareId, watchBrand);
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
                      if (nextId) {
                        void (async () => {
                          const picked = activeSpares.find((s) => s.id === nextId);
                          const price = await ensureSparePrice(nextId, watchBrand);
                          if (price <= 0) {
                            setRepairPopupError(
                              `Selling price not assigned for ${picked?.name ?? "spare"} (${picked?.sku ?? nextId})${watchBrand ? ` — add ${watchBrand} price in Inventory → Spare catalogue` : ""}.`,
                            );
                          }
                          void fetchHoStockQty(nextId);
                        })();
                      }
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
            <h3 className="text-lg font-semibold text-zimson-900">Queue send to brand</h3>
            <p className="mt-1 text-sm text-stone-600">
              Supervisor approves sending the watch to brand. Front desk logs courier / AWB in Logistics; you confirm send on the brand desk.
            </p>
            <div className="mt-4 grid gap-3">
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
                Queue for front desk
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {brandForwardPopupJobId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-zimson-900">
              {brandForwardInterHoSender ? "Forward brand estimate to sender HO" : "Forward brand estimate to customer"}
            </h3>
            <p className="mt-1 text-sm text-stone-600">
              {brandForwardInterHoSender ? (
                <>
                  Brand estimate{" "}
                  {(() => {
                    const job = jobs.find((x) => x.id === brandForwardPopupJobId);
                    return job?.brandEstimateInr
                      ? Number(job.brandEstimateInr).toLocaleString(undefined, { style: "currency", currency: "INR" })
                      : "—";
                  })()}
                  {" "}— sender HO will add markup and reach the customer.
                </>
              ) : (
                <>
                  Brand estimate{" "}
                  {(() => {
                    const job = jobs.find((x) => x.id === brandForwardPopupJobId);
                    return job?.brandEstimateInr
                      ? Number(job.brandEstimateInr).toLocaleString(undefined, { style: "currency", currency: "INR" })
                      : "—";
                  })()}
                  {" "}+ your markup = customer quote.
                </>
              )}
            </p>
            <div className="mt-4 grid gap-3">
              {!brandForwardInterHoSender ? (
              <label className="text-sm">Markup / additional amount (INR)
                <input className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm" value={brandMarkupInput} onChange={(e) => setBrandMarkupInput(e.target.value)} placeholder="0" />
              </label>
              ) : null}
              <label className="text-sm">{brandForwardInterHoSender ? "Remark for sender HO *" : "Remark for customer *"}
                <textarea className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm" rows={3} value={brandForwardNoteInput} onChange={(e) => setBrandForwardNoteInput(e.target.value)} />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => { setBrandForwardPopupJobId(null); setBrandForwardInterHoSender(false); }} className="rounded-xl border border-zimson-300 px-4 py-2 text-sm">Cancel</button>
              <button type="button" onClick={() => void confirmBrandForwardToCustomer()} className="rounded-xl bg-indigo-700 px-4 py-2 text-sm font-semibold text-white">
                {brandForwardInterHoSender ? "Send to sender HO" : "Send to customer"}
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
            <h3 className="text-lg font-semibold text-zimson-900">Log brand credit note (from mail)</h3>
            <p className="mt-1 text-sm text-stone-600">Accounts HO will set voucher amount and auto-generate a 12-digit code for the customer.</p>
            <div className="mt-4 grid gap-3">
              <label className="text-sm">Brand credit note ref (from mail)
                <input className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm" value={brandCreditNoteRefInput} onChange={(e) => setBrandCreditNoteRefInput(e.target.value)} placeholder="Brand mail reference (optional)" />
              </label>
              <label className="text-sm">Suggested valid until
                <input type="date" className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm" value={brandCouponValidUntilInput} onChange={(e) => setBrandCouponValidUntilInput(e.target.value)} />
              </label>
              <label className="text-sm">Remark from brand mail *
                <textarea className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm" rows={3} value={brandCouponNoteInput} onChange={(e) => setBrandCouponNoteInput(e.target.value)} placeholder="Summary of brand credit note email…" />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setBrandCreditPopupJobId(null)} className="rounded-xl border border-zimson-300 px-4 py-2 text-sm">Cancel</button>
              <button type="button" onClick={() => void confirmBrandCreditNote()} className="rounded-xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white">Send to accounts</button>
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
            <h3 className="text-lg font-semibold text-zimson-900">
              {reestimateInterHoMode ? "Request re-estimate via sender HO" : "Request re-estimate approval"}
            </h3>
            <p className="mt-1 text-sm text-stone-600">
              {reestimateInterHoMode
                ? "Repair HO proposes a revised amount. Sender HO will forward it to the customer on the existing tracking link."
                : "Enter revised estimate amount and remarks for customer approval."}
            </p>
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
                {reestimateInterHoMode ? "Send to sender HO" : "Send to customer"}
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
            <h3 className="text-lg font-semibold text-rose-900">
              {moveToOdcInterHo ? "Return watch to sender HO (no repair)" : "Move SRF to outward queue"}
            </h3>
            <p className="mt-1 text-sm text-stone-600">
              {moveToOdcInterHo
                ? "Use this after the customer declined the re-estimate and will not proceed. Repair HO returns the watch un-repaired to sender HO. Sender HO will inward, dispatch to store, and the store hands over to the customer without billing."
                : "Use this only after speaking with the customer and confirming they do not want the repair. The watch will be returned to store via internal outward transfer and handed over without billing."}
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
                {moveToOdcInterHo ? "Confirm — return to sender HO" : "Confirm — move to internal outward"}
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
                <h3 className="mt-0.5 font-mono text-lg font-bold text-zimson-900">
                  {listDetailMeta?.mainRef ?? listDetailJob.reference}
                </h3>
                {listDetailMeta?.receiverRef && listDetailMeta.receiverRef !== listDetailMeta.mainRef ? (
                  <p className="text-[11px] text-stone-500">
                    Receiver SRF (converted):{" "}
                    <span className="font-mono font-semibold">{listDetailMeta.receiverRef}</span>
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
                {listDetailMeta?.showReestimateDetails ? (
                  <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 sm:col-span-2">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-amber-900">
                      Re-estimate details
                    </p>
                    <table className="w-full text-sm">
                      <tbody>
                        <tr>
                          <td className="py-0.5 pr-3 font-medium text-stone-600">Original estimate</td>
                          <td className="py-0.5">
                            {formatInr(Number(listDetailJob.estimateTotalInr ?? 0))}
                          </td>
                        </tr>
                        <tr>
                          <td className="py-0.5 pr-3 font-medium text-stone-600">Proposed re-estimate</td>
                          <td className="py-0.5 font-semibold text-amber-950">
                            {Number(listDetailJob.reestimateRequestedInr ?? 0) > 0
                              ? formatInr(Number(listDetailJob.reestimateRequestedInr))
                              : "—"}
                          </td>
                        </tr>
                        {Number(listDetailJob.reestimateRequestedInr ?? 0) > 0 &&
                        Number(listDetailJob.estimateTotalInr ?? 0) > 0 ? (
                          <tr>
                            <td className="py-0.5 pr-3 font-medium text-stone-600">Difference</td>
                            <td className="py-0.5 font-medium text-stone-800">
                              {formatInr(
                                Number(listDetailJob.reestimateRequestedInr) -
                                  Number(listDetailJob.estimateTotalInr),
                              )}
                            </td>
                          </tr>
                        ) : null}
                        <tr>
                          <td className="py-0.5 pr-3 font-medium text-stone-600 align-top">Remarks</td>
                          <td className="py-0.5">{listDetailJob.reestimateRequestedNote?.trim() || "—"}</td>
                        </tr>
                        <tr>
                          <td className="py-0.5 pr-3 font-medium text-stone-600">Requested at</td>
                          <td className="py-0.5">
                            {listDetailJob.reestimateRequestedAt
                              ? new Date(listDetailJob.reestimateRequestedAt).toLocaleString()
                              : "—"}
                          </td>
                        </tr>
                        {listDetailJob.interHoBrandEstimatePhase ? (
                          <tr>
                            <td className="py-0.5 pr-3 font-medium text-stone-600">Inter-HO brand step</td>
                            <td className="py-0.5 font-medium text-violet-900">
                              {interHoBrandEstimatePhaseLabel(listDetailJob.interHoBrandEstimatePhase)}
                            </td>
                          </tr>
                        ) : null}
                        {listDetailJob.interHoReestimatePhase ? (
                          <tr>
                            <td className="py-0.5 pr-3 font-medium text-stone-600">Inter-HO step</td>
                            <td className="py-0.5 font-medium text-indigo-900">
                              {interHoReestimatePhaseLabel(listDetailJob.interHoReestimatePhase)}
                            </td>
                          </tr>
                        ) : null}
                        {listDetailJob.customerReestimateResponse ? (
                          <tr>
                            <td className="py-0.5 pr-3 font-medium text-stone-600">Customer response</td>
                            <td
                              className={`py-0.5 font-semibold ${
                                listDetailJob.customerReestimateResponse === "accepted"
                                  ? "text-emerald-800"
                                  : "text-rose-800"
                              }`}
                            >
                              {listDetailJob.customerReestimateResponse === "accepted"
                                ? "Accepted"
                                : "Rejected"}
                              {listDetailJob.customerReestimateRespondedAt
                                ? ` · ${new Date(listDetailJob.customerReestimateRespondedAt).toLocaleString()}`
                                : ""}
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                    {listDetailMeta.senderReestimate &&
                    (listDetailJob.interHoReestimatePhase === "pending_sender" ||
                      listDetailJob.interHoReestimatePhase === "customer_rejected" ||
                      listDetailJob.status === "inter_ho_reestimate_pending_sender") ? (
                      <div className="mt-3 flex flex-wrap gap-2 border-t border-amber-200/80 pt-3">
                        <button
                          type="button"
                          onClick={() => {
                            openSenderForwardPopup(listDetailJob.id);
                            setListDetailJobId(null);
                          }}
                          className="rounded-lg border border-amber-500 bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-200"
                        >
                          Update price &amp; forward to customer
                        </button>
                      </div>
                    ) : null}
                    {listDetailMeta.senderBrandEstimate &&
                    (listDetailJob.interHoBrandEstimatePhase === "pending_sender" ||
                      listDetailJob.interHoBrandEstimatePhase === "customer_rejected") ? (
                      <div className="mt-3 flex flex-wrap gap-2 border-t border-violet-200/80 pt-3">
                        <button
                          type="button"
                          onClick={() => {
                            openSenderForwardPopup(listDetailJob.id);
                            setListDetailJobId(null);
                          }}
                          className="rounded-lg border border-violet-500 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-950 hover:bg-violet-100"
                        >
                          Forward brand estimate to customer
                        </button>
                      </div>
                    ) : null}
                    {listDetailMeta.senderBrandEstimate &&
                    listDetailJob.interHoBrandEstimatePhase === "customer_accepted" ? (
                      <div className="mt-3 border-t border-emerald-200/80 pt-3">
                        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
                          Customer approved brand estimate INR{" "}
                          {Number(listDetailJob.reestimateRequestedInr ?? 0).toLocaleString()}. Repair HO has been
                          notified to approve and send to brand.
                        </p>
                      </div>
                    ) : null}
                    {listDetailMeta.senderReestimate &&
                    (listDetailJob.interHoReestimatePhase === "customer_accepted" ||
                      listDetailJob.status === "inter_ho_reestimate_customer_accepted") ? (
                      <div className="mt-3 flex flex-wrap gap-2 border-t border-amber-200/80 pt-3">
                        <button
                          type="button"
                          onClick={() => {
                            void approveInterHoForReceiver(listDetailJob.id);
                          }}
                          className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
                        >
                          Approve for repair HO
                        </button>
                      </div>
                    ) : null}
                  </section>
                ) : null}
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

      {brandConfirmPopup ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-zimson-900">
              {brandConfirmPopup.kind === "approve_send_brand"
                ? "Confirm approval to brand"
                : "Confirm received from brand"}
            </h3>
            <p className="mt-2 text-sm text-stone-600">
              {brandConfirmPopup.kind === "approve_send_brand"
                ? "Customer accepted the estimate. Send HO approval to brand and start brand repair?"
                : "Confirm the watch has been received back from brand at your HO."}
            </p>
            <label className="mt-4 block text-sm">
              Note (optional)
              <textarea
                className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
                rows={2}
                value={brandConfirmPopup.note}
                onChange={(e) =>
                  setBrandConfirmPopup((prev) => (prev ? { ...prev, note: e.target.value } : prev))
                }
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBrandConfirmPopup(null)}
                className="rounded-xl border border-zimson-300 px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void executeBrandConfirm()}
                className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {brandSuccessAck ? (
        <ProcessSuccessModal
          open
          title={brandSuccessAck.title}
          description={brandSuccessAck.description}
          onBackdropClick={() => setBrandSuccessAck(null)}
          actions={
            <>
              {brandSuccessAck.interHoInvoiceJobId ? (
                <button
                  type="button"
                  className="inline-flex w-full min-w-0 items-center justify-center rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700 sm:w-auto"
                  onClick={() => {
                    const id = brandSuccessAck.interHoInvoiceJobId!;
                    setBrandSuccessAck(null);
                    navigate(`/service-centre/inter-ho-invoice?srfId=${encodeURIComponent(id)}&invoiceFor=sender-ho`);
                  }}
                >
                  Create sender HO invoice
                </button>
              ) : null}
              <button
                type="button"
                className="inline-flex w-full min-w-0 items-center justify-center rounded-xl bg-rlx-green px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rlx-green/90 sm:w-auto"
                onClick={() => setBrandSuccessAck(null)}
              >
                Done
              </button>
            </>
          }
        >
          <div className="rounded-xl border-2 border-violet-200 bg-violet-50/80 px-4 py-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-violet-800">SRF reference</p>
            <p className="mt-1 font-mono text-2xl font-bold text-violet-950">{brandSuccessAck.reference}</p>
          </div>
          <p className="mt-3 rounded-lg border border-violet-100 bg-white px-3 py-2 text-sm text-stone-800">
            {brandSuccessAck.detail}
          </p>
        </ProcessSuccessModal>
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
          title="Spares saved — watch sent to outward"
          description="Used spares recorded. Repair marked complete."
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
          <p className="mt-3 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-950">
            <span className="font-semibold">Data saved.</span> Used spares: {repairSuccessMonitor.spareSummary}
          </p>
          <p className="mt-2 rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2 text-sm font-medium text-emerald-900">
            Watch moved to the outward queue. Front desk / logistics will dispatch when ready.
          </p>
        </ProcessSuccessModal>
      ) : null}

      {traceJobId ? <SrfTraceModal srfId={traceJobId} onClose={() => setTraceJobId(null)} /> : null}

      {ewayBrandJobId ? (
        <EwayBillModal
          open={Boolean(ewayBrandJobId)}
          kind="brand"
          resourceId={ewayBrandJobId}
          onClose={() => setEwayBrandJobId(null)}
          onSuccess={(edoc: EdocUiResult) => {
            if (ewayBrandJobId) {
              setFeedback((f) => ({
                ...f,
                [ewayBrandJobId]: formatEwayEdocMessage(edoc) ?? "E-way bill generated.",
              }));
            }
          }}
        />
      ) : null}
    </div>
  );
}
