import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CustomerLinkQr } from "../../components/service/CustomerLinkQr";
import { SrfTraceModal } from "../../components/service/SrfTraceModal";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useRegions } from "../../context/RegionsContext";
import { useSpares } from "../../context/SparesContext";
import { useSrfJobs } from "../../context/SrfJobsContext";
import { ApiError, apiJson } from "../../lib/api";
import { jobVisibleToServiceCentre } from "../../lib/srfAccess";
import { printAssignmentSlip, printBrandDispatchDocument } from "../../lib/serviceDocuments";
import type { SparePriceLine } from "../../types/spare";
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

export function ScSupervisorPage() {
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
  const [moveToOdcPopupJobId, setMoveToOdcPopupJobId] = useState<string | null>(null);
  const [moveToOdcNote, setMoveToOdcNote] = useState("");
  const [traceJobId, setTraceJobId] = useState<string | null>(null);
  const [spareOrderRows, setSpareOrderRows] = useState<InterHoSpareOrder[]>([]);
  const [spareOrderMsg, setSpareOrderMsg] = useState("");
  const [requestSparesJobId, setRequestSparesJobId] = useState<string | null>(null);
  const [requestSparesTargetRegionId, setRequestSparesTargetRegionId] = useState("");
  const [requestSparesNote, setRequestSparesNote] = useState("");
  const [requestSparesLines, setRequestSparesLines] = useState<Array<{ spareId: string; qty: string; unitPriceInr: string }>>([
    { spareId: "", qty: "1", unitPriceInr: "0" },
  ]);
  const [fulfillOrderId, setFulfillOrderId] = useState<string | null>(null);
  const [fulfillInvoiceRef, setFulfillInvoiceRef] = useState("");
  const [fulfillNote, setFulfillNote] = useState("");
  const [orderDetailsId, setOrderDetailsId] = useState<string | null>(null);
  const [technicians, setTechnicians] = useState<TechnicianProfile[]>([]);
  const [sendBrandPopupJobId, setSendBrandPopupJobId] = useState<string | null>(null);
  const [sendBrandDispatchRef, setSendBrandDispatchRef] = useState("");
  const [sendBrandReason, setSendBrandReason] = useState("Cannot be repaired at HO");

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
  const brandDeskQueue = useMemo(() => {
    if (!user) return [];
    return jobs.filter(
      (j) =>
        [
          "sent_to_brand",
          "brand_estimate_pending",
          "brand_approved",
          "brand_repair_in_progress",
          "received_from_brand",
          "brand_credit_note_pending",
          "brand_credit_note_active",
        ].includes(j.status) && jobVisibleToServiceCentre(j, user),
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
      const tech = technicians.find((x) => x.id === techId);
      if (job) printAssignmentSlip(job, tech ? `${tech.fullName} (${tech.grade})` : techId);
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

  async function markRepaired(jobId: string) {
    try {
      await supervisorMarkRepairComplete(jobId);
      setFeedback((f) => ({
        ...f,
        [jobId]:
          "Repair recorded successfully. The job is now in internal outward queue for logistics dispatch to store.",
      }));
    } catch (e) {
      setFeedback((f) => ({ ...f, [jobId]: e instanceof Error ? e.message : "Could not mark repaired." }));
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

  async function logBrandEstimate(jobId: string) {
    const amountRaw = window.prompt("Brand estimate amount (INR):", "0");
    const amount = Number(amountRaw ?? "");
    if (!Number.isFinite(amount) || amount <= 0) {
      setFeedback((f) => ({ ...f, [jobId]: "Enter valid brand estimate amount." }));
      return;
    }
    const note = window.prompt("Brand estimate note (mail reference / remarks):", "")?.trim() ?? "";
    try {
      await supervisorLogBrandEstimate(jobId, { estimateInr: amount, currency: "INR", note });
      setFeedback((f) => ({ ...f, [jobId]: `Brand estimate logged: INR ${amount.toFixed(2)}.` }));
    } catch (e) {
      setFeedback((f) => ({ ...f, [jobId]: e instanceof Error ? e.message : "Could not log brand estimate." }));
    }
  }

  async function approveBrandEstimate(jobId: string) {
    const note = window.prompt("HO approval note to brand:", "Approved by HO")?.trim() ?? "";
    try {
      await supervisorApproveBrandEstimate(jobId, { note });
      setFeedback((f) => ({ ...f, [jobId]: "Brand estimate approved by HO." }));
    } catch (e) {
      setFeedback((f) => ({ ...f, [jobId]: e instanceof Error ? e.message : "Could not approve brand estimate." }));
    }
  }

  async function receiveFromBrand(jobId: string) {
    const note = window.prompt("Return receipt note:", "Watch received at HO from brand.")?.trim() ?? "";
    try {
      await supervisorReceiveFromBrand(jobId, { note });
      setFeedback((f) => ({ ...f, [jobId]: "Watch marked as received from brand." }));
    } catch (e) {
      setFeedback((f) => ({ ...f, [jobId]: e instanceof Error ? e.message : "Could not mark return receipt." }));
    }
  }

  async function logBrandInvoice(jobId: string) {
    const invoiceRef = window.prompt("Brand invoice reference:", "")?.trim() ?? "";
    if (!invoiceRef) {
      setFeedback((f) => ({ ...f, [jobId]: "Invoice reference is required." }));
      return;
    }
    const note = window.prompt("Invoice note (optional):", "")?.trim() ?? "";
    try {
      await supervisorLogBrandInvoice(jobId, { invoiceRef, note });
      setFeedback((f) => ({ ...f, [jobId]: `Brand invoice logged (${invoiceRef}). Sent to outward queue.` }));
    } catch (e) {
      setFeedback((f) => ({ ...f, [jobId]: e instanceof Error ? e.message : "Could not log brand invoice." }));
    }
  }

  async function logBrandCreditNote(jobId: string) {
    const couponCode = window.prompt("Coupon / credit note code:", "")?.trim() ?? "";
    if (!couponCode) {
      setFeedback((f) => ({ ...f, [jobId]: "Coupon code is required." }));
      return;
    }
    const valueRaw = window.prompt("Coupon value (INR):", "0");
    const valueInr = Number(valueRaw ?? "");
    if (!Number.isFinite(valueInr) || valueInr <= 0) {
      setFeedback((f) => ({ ...f, [jobId]: "Enter valid coupon value." }));
      return;
    }
    const validUntil = window.prompt("Valid until (YYYY-MM-DD, optional):", "")?.trim() ?? "";
    const note = window.prompt("Credit note remark:", "Brand could not repair; credit note issued.")?.trim() ?? "";
    try {
      await supervisorLogBrandCreditNote(jobId, { couponCode, valueInr, validUntil: validUntil || undefined, note });
      setFeedback((f) => ({ ...f, [jobId]: `Brand credit note logged (${couponCode}).` }));
    } catch (e) {
      setFeedback((f) => ({ ...f, [jobId]: e instanceof Error ? e.message : "Could not log brand credit note." }));
    }
  }

  async function notifyCoupon(jobId: string) {
    const note = window.prompt("Customer notification note:", "Customer informed through web, SMS and WhatsApp copy.")?.trim() ?? "";
    try {
      await supervisorNotifyBrandCoupon(jobId, {
        channels: { web: true, smsTemplateShared: true, whatsappTemplateShared: true },
        note,
      });
      setFeedback((f) => ({ ...f, [jobId]: "Customer coupon notification recorded." }));
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

  const incomingSpareOrders = useMemo(
    () => spareOrderRows.filter((o) => o.toRegionId === (user?.regionId ?? "") || user?.role === "super_admin" || user?.role === "ho_admin"),
    [spareOrderRows, user?.regionId, user?.role],
  );
  const outgoingSpareOrders = useMemo(
    () => spareOrderRows.filter((o) => o.fromRegionId === (user?.regionId ?? "") || user?.role === "super_admin" || user?.role === "ho_admin"),
    [spareOrderRows, user?.regionId, user?.role],
  );
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
    setRequestSparesLines([{ spareId: "", qty: "1", unitPriceInr: "0" }]);
  }

  function closeRequestSparesPopup() {
    setRequestSparesJobId(null);
    setRequestSparesTargetRegionId("");
    setRequestSparesNote("");
    setRequestSparesLines([{ spareId: "", qty: "1", unitPriceInr: "0" }]);
  }

  async function confirmRequestSparesOtherHo() {
    if (!requestSparesJobId) return;
    const lines = requestSparesLines
      .map((x) => ({
        spareId: x.spareId,
        qty: Number(x.qty),
        unitPriceInr: Number(x.unitPriceInr || 0),
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

  function openFulfillOrder(orderId: string) {
    setFulfillOrderId(orderId);
    setFulfillInvoiceRef("");
    setFulfillNote("");
  }

  function closeFulfillOrder() {
    setFulfillOrderId(null);
    setFulfillInvoiceRef("");
    setFulfillNote("");
  }

  async function confirmFulfillOrder() {
    if (!fulfillOrderId) return;
    if (!fulfillInvoiceRef.trim()) {
      setSpareOrderMsg("Enter invoice reference.");
      return;
    }
    try {
      await apiJson(`/api/service/inter-ho-spare-orders/${encodeURIComponent(fulfillOrderId)}/fulfill`, {
        method: "POST",
        json: { invoiceRef: fulfillInvoiceRef.trim(), note: fulfillNote.trim() },
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

  function openRepairPopup(jobId: string) {
    const flow = spareFlowBySrfId.get(jobId);
    if (flow?.status === "FULFILLED" && flow.inwardReceivedAt && flow.lines.length > 0) {
      setUnitPriceBySpareId((prev) => {
        const next = { ...prev };
        for (const l of flow.lines) {
          if (l.spareId) next[l.spareId] = Number(l.unitPriceInr ?? 0);
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
  }

  function closeRepairPopup() {
    setRepairPopupJobId(null);
    setRepairLines([{ spareId: "", qty: "1" }]);
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
    if (!repairPopupJobId) return;
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
          <div className="flex flex-wrap gap-2">
            <Link
              to="/service-centre/online-store"
              className="inline-flex rounded-xl border border-cyan-400 bg-cyan-50 px-4 py-2.5 text-sm font-semibold text-cyan-900 shadow-sm transition hover:bg-cyan-100"
            >
              Open online store
            </Link>
            <Link
              to="/service-centre"
              className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
            >
              Service centre home
            </Link>
          </div>
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
                      {technicians.length === 0 ? <option value="" disabled>No technicians in master</option> : null}
                      {technicians.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.fullName} — {t.grade}
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
                  <button
                    type="button"
                    onClick={() => setTraceJobId(j.id)}
                    className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900 hover:bg-amber-100"
                  >
                    View full trace
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
            {decisionQueue.map((j) => {
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
                      <p className="font-semibold">
                        Customer rejected the re-estimate. Watch is on hold for supervisor follow-up.
                      </p>
                      <p className="mt-1 text-[11px]">
                        Call the customer and try to negotiate. If they agree on a revised amount, click
                        <span className="font-semibold"> &quot;Negotiate &amp; send re-estimate&quot;</span> to share the new
                        estimate via tracking link. If the customer still does not want the repair, click
                        <span className="font-semibold"> &quot;Move to internal outward&quot;</span> to send the watch back to the store
                        without billing.
                      </p>
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
      <Card
        title="Brand desk queue"
        subtitle="Jobs moved to brand for external repair or credit-note handling"
        className="mt-8"
      >
        {brandDeskQueue.length === 0 ? (
          <p className="text-sm text-stone-600">No SRFs in brand workflow.</p>
        ) : (
          <div className="space-y-4">
            {brandDeskQueue.map((j) => (
              <div key={j.id} className="rounded-2xl border border-zimson-200/80 bg-white/90 p-4 shadow-sm">
                <p className="font-mono text-sm font-bold text-zimson-900">{j.reference}</p>
                <p className="text-sm text-stone-800">{j.customerName} · {j.phone}</p>
                <p className="mt-1 text-sm text-stone-600">
                  {j.watchBrand} {j.watchModel} · {j.serial}
                </p>
                <p className="mt-1 text-xs text-stone-500">Status: {j.status.replace(/_/g, " ")}</p>
                {(j.brandDispatchRef || j.brandEstimateInr || j.brandInvoiceRef || j.brandCouponCode) ? (
                  <div className="mt-2 rounded-lg border border-zimson-100 bg-zimson-50/50 px-3 py-2 text-xs text-stone-700">
                    {j.brandDispatchRef ? <p>Dispatch ref: {j.brandDispatchRef}</p> : null}
                    {j.brandEstimateInr ? <p>Brand estimate: INR {Number(j.brandEstimateInr).toFixed(2)}</p> : null}
                    {j.brandInvoiceRef ? <p>Brand invoice: {j.brandInvoiceRef}</p> : null}
                    {j.brandCouponCode ? (
                      <p>
                        Coupon: {j.brandCouponCode}
                        {j.brandCouponValueInr ? ` · INR ${Number(j.brandCouponValueInr).toFixed(2)}` : ""}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {j.status === "sent_to_brand" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void logBrandEstimate(j.id)}
                        className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100"
                      >
                        Log brand estimate
                      </button>
                      <button
                        type="button"
                        onClick={() => void logBrandCreditNote(j.id)}
                        className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-900 hover:bg-rose-100"
                      >
                        Brand gave credit note
                      </button>
                    </>
                  ) : null}
                  {j.status === "brand_estimate_pending" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void approveBrandEstimate(j.id)}
                        className="rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-900 hover:bg-indigo-100"
                      >
                        Approve estimate to brand
                      </button>
                      <button
                        type="button"
                        onClick={() => void logBrandCreditNote(j.id)}
                        className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-900 hover:bg-rose-100"
                      >
                        Convert to credit note
                      </button>
                    </>
                  ) : null}
                  {(j.status === "brand_approved" || j.status === "brand_repair_in_progress") ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void receiveFromBrand(j.id)}
                        className="rounded-xl border border-cyan-300 bg-cyan-50 px-4 py-2 text-sm font-semibold text-cyan-900 hover:bg-cyan-100"
                      >
                        Receive watch from brand
                      </button>
                      <button
                        type="button"
                        onClick={() => void logBrandCreditNote(j.id)}
                        className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-900 hover:bg-rose-100"
                      >
                        Brand gave credit note
                      </button>
                    </>
                  ) : null}
                  {j.status === "received_from_brand" ? (
                    <button
                      type="button"
                      onClick={() => void logBrandInvoice(j.id)}
                      className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
                    >
                      Log brand invoice and move to outward
                    </button>
                  ) : null}
                  {(j.status === "brand_credit_note_pending" || j.status === "brand_credit_note_active") ? (
                    <button
                      type="button"
                      onClick={() => void notifyCoupon(j.id)}
                      className="rounded-xl border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-900 hover:bg-violet-100"
                    >
                      Mark customer notified (web/msg/whatsapp)
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void setTraceJobId(j.id)}
                    className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100"
                  >
                    View full trace
                  </button>
                </div>
                {feedback[j.id] ? <p className="mt-2 text-xs text-stone-600">{feedback[j.id]}</p> : null}
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card title="Online spare sales orders" subtitle="External-style sales flow (internally inter-HO stock transfer)" className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs text-stone-600">
            Outgoing requests from your HO: {outgoingSpareOrders.length} · Incoming to your HO: {incomingSpareOrders.length}
          </p>
          <button
            type="button"
            onClick={() => void refreshSpareOrders()}
            className="rounded-xl border border-zimson-300 bg-white px-3 py-1.5 text-xs font-semibold text-zimson-900 hover:bg-zimson-50"
          >
            Refresh
          </button>
        </div>
        {spareOrderMsg ? <p className="mb-2 text-xs text-stone-600">{spareOrderMsg}</p> : null}
        {spareOrderRows.length === 0 ? (
          <p className="text-sm text-stone-600">No online spare sales orders yet.</p>
        ) : (
          <div className="space-y-3">
            {spareOrderRows.map((o) => (
              <div key={o.id} className="rounded-xl border border-zimson-200/80 bg-white p-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono font-semibold text-zimson-900">
                    {o.orderNumber} · SRF {o.srfReference}
                  </p>
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${o.status === "FULFILLED" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                    {o.status}
                  </span>
                </div>
                <p className="mt-1 text-stone-700">
                  {o.fromRegionName} → {o.toRegionName} · Requested by {o.requestedByName ?? o.requestedBy} on{" "}
                  {new Date(o.requestedAt).toLocaleString()}
                </p>
                {o.note ? <p className="mt-1 text-stone-600">Note: {o.note}</p> : null}
                <p className="mt-2 text-stone-700">
                  {o.lines.map((l) => `${l.spareName} x${l.qty}`).join(", ")}
                </p>
                {o.status === "FULFILLED" ? (
                  <p className="mt-1 text-emerald-700">
                    Fulfilled by {o.fulfilledByName ?? o.fulfilledBy ?? "-"} · Invoice {o.invoiceRef ?? "-"} ·{" "}
                    {o.fulfilledAt ? new Date(o.fulfilledAt).toLocaleString() : "-"}
                  </p>
                ) : null}
                {o.status === "REQUESTED" &&
                (user?.role === "super_admin" || user?.role === "ho_admin" || o.toRegionId === (user?.regionId ?? "")) ? (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => openFulfillOrder(o.id)}
                      className="rounded-lg bg-zimson-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zimson-800"
                    >
                      Process sale & invoice
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrderDetailsId(o.id)}
                      className="ml-2 rounded-lg border border-zimson-300 bg-white px-3 py-1.5 text-xs font-semibold text-zimson-900 hover:bg-zimson-50"
                    >
                      View details
                    </button>
                  </div>
                ) : (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => setOrderDetailsId(o.id)}
                      className="rounded-lg border border-zimson-300 bg-white px-3 py-1.5 text-xs font-semibold text-zimson-900 hover:bg-zimson-50"
                    >
                      View details
                    </button>
                  </div>
                )}
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
                      const unit = Number(unitPriceBySpareId[line.spareId] ?? spare?.sellingPriceInr ?? spare?.mrpInr ?? 0);
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
              Raise spare requirement against this SRF. Destination HO will fulfill with invoice (different GST), then repair flow continues as usual.
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
                    <input
                      value={line.unitPriceInr}
                      onChange={(e) =>
                        setRequestSparesLines((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, unitPriceInr: e.target.value } : x)),
                        )
                      }
                      className="col-span-2 rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
                      placeholder="Rate"
                    />
                    <button
                      type="button"
                      onClick={() => setRequestSparesLines((prev) => prev.filter((_, i) => i !== idx))}
                      className="col-span-1 rounded-xl border border-zimson-300 bg-white text-sm"
                    >
                      x
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setRequestSparesLines((prev) => [...prev, { spareId: "", qty: "1", unitPriceInr: "0" }])}
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
            <p className="mt-1 text-sm text-stone-600">Enter invoice reference. Stock will be deducted from this HO.</p>
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
      {traceJobId ? <SrfTraceModal srfId={traceJobId} onClose={() => setTraceJobId(null)} /> : null}
    </div>
  );
}
