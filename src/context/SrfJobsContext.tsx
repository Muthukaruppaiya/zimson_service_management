import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiJson } from "../lib/api";
import type { CreateSrfJobInput, SrfJob, UsedSpareLine } from "../types/srfJob";
import { useAuth } from "./AuthContext";

export type SrfTraceStatusRow = {
  id: string;
  status: string;
  note: string;
  changedById: string | null;
  changedByName: string | null;
  changedByRole: string | null;
  changedAt: string;
};

export type SrfTraceActionRow = {
  id: string;
  action: string;
  description: string;
  details: unknown;
  amountInr: number | null;
  referenceDoc: string | null;
  actorId: string | null;
  actorRole: string | null;
  actorName: string | null;
  createdAt: string;
};

export type SrfTraceReestimateAttempt = {
  id: string;
  attemptNo: number;
  amountInr: number;
  remark: string;
  raisedById: string | null;
  raisedByName: string | null;
  raisedByRole: string | null;
  raisedAt: string;
  customerResponse: "accepted" | "rejected" | null;
  customerResponseAt: string | null;
  customerResponseNote: string | null;
  supervisorFollowup: "negotiate" | "move_to_odc" | null;
  supervisorFollowupNote: string | null;
  supervisorFollowupAt: string | null;
  supervisorFollowupById: string | null;
  supervisorFollowupByName: string | null;
  closedAt: string | null;
};

export type SrfTrace = {
  job: {
    id: string;
    reference: string;
    status: string;
    customerName: string;
    phone: string;
    watchBrand: string;
    watchModel: string;
    serial: string;
    complaint: string;
    estimateTotalInr: number;
    advanceInr?: number;
    advancePaymentMode?: string | null;
    advancePaymentDetails?: unknown;
    regionId: string;
    storeId: string;
    destinationStoreId: string | null;
    dcNumber: string | null;
    outwardDcNumber: string | null;
    hoSparesBillRef: string | null;
    storeBillRef: string | null;
    transferSourceReference: string | null;
    transferSourceRegionId: string | null;
    transferTargetRegionId: string | null;
    brandSentAt?: string | null;
    brandDispatchRef?: string | null;
    brandDispatchNote?: string | null;
    brandEstimateInr?: number | null;
    brandEstimateCurrency?: string | null;
    brandEstimateReceivedAt?: string | null;
    brandHoApprovalSentAt?: string | null;
    brandReturnReceivedAt?: string | null;
    brandInvoiceRef?: string | null;
    brandCouponCode?: string | null;
    brandCouponValueInr?: number | null;
    brandCouponReceivedAt?: string | null;
    brandCouponValidUntil?: string | null;
    customerCouponNotifiedAt?: string | null;
    createdAt: string;
  };
  statusHistory: SrfTraceStatusRow[];
  actions: SrfTraceActionRow[];
  reestimates: SrfTraceReestimateAttempt[];
};

type SrfJobsContextValue = {
  jobs: SrfJob[];
  refreshJobs: () => Promise<void>;
  createDraftJob: (input: CreateSrfJobInput) => Promise<{ srfId: string; reference: string; token: string; captureUrl: string }>;
  refreshPhotoSession: (srfId: string) => Promise<{ token: string; captureUrl: string }>;
  finalizeJob: (
    srfId: string,
    payload: {
      complaint: string;
      estimateTotalInr: number;
      advanceInr?: number;
      advancePaymentMode?: string | null;
      advancePaymentDetails?: unknown;
      selectedPartIds: string[];
    },
  ) => Promise<{ trackingUrl?: string }>;
  dispatchToServiceCentre: (jobIds: string[]) => Promise<{ dcNumber: string; moved: number }>;
  confirmInwardByDc: (dcNumber: string) => Promise<{ updated: number }>;
  assignTechnician: (jobId: string, technicianId: string) => Promise<void>;
  convertTransferredSrfToLocal: (jobId: string) => Promise<void>;
  supervisorRequestReestimate: (jobId: string, payload: { estimateTotalInr: number; note: string }) => Promise<void>;
  supervisorApproveReestimate: (jobId: string, payload: { estimateTotalInr?: number; note?: string }) => Promise<void>;
  supervisorTransferToOtherHo: (jobId: string, payload: { targetRegionId: string; note?: string }) => Promise<{ queued?: boolean }>;
  supervisorMarkRepairComplete: (jobId: string) => Promise<void>;
  supervisorMoveRejectedToOdc: (jobId: string, note?: string) => Promise<void>;
  technicianEstimateOk: (jobId: string, technicianProfileId: string) => Promise<void>;
  technicianRequestReestimate: (jobId: string, technicianProfileId: string, note: string) => Promise<void>;
  technicianSendToBrand: (jobId: string, payload: { dispatchRef?: string; note?: string; dispatchDocPath?: string }) => Promise<void>;
  submitSparesSlip: (jobId: string, lines: UsedSpareLine[]) => Promise<void>;
  technicianMarkRepairComplete: (jobId: string, technicianProfileId: string) => Promise<void>;
  supervisorLogBrandEstimate: (
    jobId: string,
    payload: { estimateInr: number; currency?: string; note?: string; emailMeta?: Record<string, unknown> },
  ) => Promise<void>;
  supervisorApproveBrandEstimate: (jobId: string, payload?: { note?: string; emailMeta?: Record<string, unknown> }) => Promise<void>;
  supervisorReceiveFromBrand: (jobId: string, payload?: { note?: string }) => Promise<void>;
  supervisorLogBrandInvoice: (
    jobId: string,
    payload: { invoiceRef: string; invoiceAmountInr: number; note?: string; invoiceMeta?: Record<string, unknown> },
  ) => Promise<void>;
  supervisorLogBrandCreditNote: (
    jobId: string,
    payload: { couponCode: string; valueInr: number; validUntil?: string; note?: string },
  ) => Promise<void>;
  supervisorNotifyBrandCoupon: (
    jobId: string,
    payload?: { channels?: Record<string, unknown>; note?: string },
  ) => Promise<void>;
  createOutwardBatch: (
    items: { jobId: string; destinationStoreId: string }[],
    opts?: { hoInvoiceRef?: string; storeInvoiceRef?: string },
  ) => Promise<{ odcNumber: string; moved: number }>;
  receiveOutwardByDc: (dcNumber: string) => Promise<{ updated: number }>;
  closeWithInvoice: (
    srfId: string,
    payload?: { hoSparesBillRef?: string; storeBillRef?: string; noBillingHandover?: boolean },
  ) => Promise<void>;
  getStatusHistory: (srfId: string) => Promise<Array<{ id: string; status: string; note: string; changedBy: string | null; changedAt: string }>>;
  getSrfTrace: (srfId: string) => Promise<SrfTrace>;
  cancelDraftSrf: (srfId: string, reason: string) => Promise<void>;
  patchStoreDraftSrf: (
    srfId: string,
    patch: { customerName?: string; phone?: string; watchBrand?: string; watchModel?: string; serial?: string },
  ) => Promise<void>;
};

const SrfJobsContext = createContext<SrfJobsContextValue | null>(null);

export function SrfJobsProvider({ children }: { children: ReactNode }) {
  const { user, authReady } = useAuth();
  const [jobs, setJobs] = useState<SrfJob[]>([]);

  const refreshJobs = useCallback(async () => {
    const data = await apiJson<{ jobs: SrfJob[] }>("/api/service/srf-jobs");
    setJobs(data.jobs);
  }, []);

  useEffect(() => {
    if (!authReady || !user) return;
    void refreshJobs().catch(() => {});
  }, [authReady, user?.id, refreshJobs]);

  const createDraftJob = useCallback(async (input: CreateSrfJobInput) => {
    const result = await apiJson<{ srfId: string; reference: string; token: string; captureUrl: string }>(
      "/api/service/srf-jobs/draft",
      { method: "POST", json: input },
    );
    await refreshJobs();
    return result;
  }, [refreshJobs]);

  const refreshPhotoSession = useCallback(async (srfId: string) => {
    return apiJson<{ token: string; captureUrl: string }>(
      `/api/service/srf-jobs/${encodeURIComponent(srfId)}/photo-session/refresh`,
      { method: "POST" },
    );
  }, []);

  const finalizeJob = useCallback(
    async (
      srfId: string,
      payload: {
        complaint: string;
        estimateTotalInr: number;
        estimatedFinishDate?: string | null;
        advanceInr?: number;
        advancePaymentMode?: string | null;
        advancePaymentDetails?: unknown;
        selectedPartIds: string[];
      },
    ) => {
      const out = await apiJson<{ trackingUrl?: string }>(`/api/service/srf-jobs/${encodeURIComponent(srfId)}/finalize`, {
        method: "POST",
        json: payload,
      });
      await refreshJobs();
      return out;
    },
    [refreshJobs],
  );

  const dispatchToServiceCentre = useCallback(async (jobIds: string[]) => {
    const out = await apiJson<{ dcNumber: string; moved: number }>("/api/service/dcs", {
      method: "POST",
      json: { srfIds: jobIds },
    });
    await refreshJobs();
    return out;
  }, [refreshJobs]);

  const confirmInwardByDc = useCallback(async (dcNumber: string) => {
    const out = await apiJson<{ updated: number }>(`/api/service/dcs/${encodeURIComponent(dcNumber)}/inward`, {
      method: "POST",
    });
    await refreshJobs();
    return out;
  }, [refreshJobs]);

  const assignTechnician = useCallback(async (jobId: string, technicianId: string) => {
    await apiJson(`/api/service/srf-jobs/${encodeURIComponent(jobId)}/assign`, {
      method: "POST",
      json: { technicianId },
    });
    await refreshJobs();
  }, [refreshJobs]);

  const convertTransferredSrfToLocal = useCallback(async (jobId: string) => {
    await apiJson(`/api/service/srf-jobs/${encodeURIComponent(jobId)}/convert-local`, {
      method: "POST",
    });
    await refreshJobs();
  }, [refreshJobs]);

  const supervisorRequestReestimate = useCallback(async (jobId: string, payload: { estimateTotalInr: number; note: string }) => {
    await apiJson(`/api/service/srf-jobs/${encodeURIComponent(jobId)}/supervisor/reestimate`, {
      method: "POST",
      json: payload,
    });
    await refreshJobs();
  }, [refreshJobs]);

  const supervisorApproveReestimate = useCallback(async (jobId: string, payload: { estimateTotalInr?: number; note?: string }) => {
    await apiJson(`/api/service/srf-jobs/${encodeURIComponent(jobId)}/supervisor/reestimate-approve`, {
      method: "POST",
      json: payload,
    });
    await refreshJobs();
  }, [refreshJobs]);

  const supervisorTransferToOtherHo = useCallback(async (jobId: string, payload: { targetRegionId: string; note?: string }) => {
    const out = await apiJson<{ queued?: boolean }>(`/api/service/srf-jobs/${encodeURIComponent(jobId)}/supervisor/transfer-other-ho`, {
      method: "POST",
      json: payload,
    });
    await refreshJobs();
    return out;
  }, [refreshJobs]);

  const supervisorMarkRepairComplete = useCallback(async (jobId: string) => {
    await apiJson(`/api/service/srf-jobs/${encodeURIComponent(jobId)}/supervisor/repair-complete`, {
      method: "POST",
    });
    await refreshJobs();
  }, [refreshJobs]);

  const supervisorMoveRejectedToOdc = useCallback(async (jobId: string, note?: string) => {
    await apiJson(`/api/service/srf-jobs/${encodeURIComponent(jobId)}/supervisor/move-to-odc`, {
      method: "POST",
      json: { note: note ?? "" },
    });
    await refreshJobs();
  }, [refreshJobs]);

  const technicianEstimateOk = useCallback(async (jobId: string, technicianProfileId: string) => {
    await apiJson(`/api/service/srf-jobs/${encodeURIComponent(jobId)}/technician/estimate-ok`, {
      method: "POST",
      json: { technicianProfileId },
    });
    await refreshJobs();
  }, [refreshJobs]);

  const technicianRequestReestimate = useCallback(async (jobId: string, technicianProfileId: string, note: string) => {
    await apiJson(`/api/service/srf-jobs/${encodeURIComponent(jobId)}/technician/reestimate`, {
      method: "POST",
      json: { technicianProfileId, note },
    });
    await refreshJobs();
  }, [refreshJobs]);

  const technicianSendToBrand = useCallback(async (
    jobId: string,
    payload: { dispatchRef?: string; note?: string; dispatchDocPath?: string },
  ) => {
    await apiJson(`/api/service/srf-jobs/${encodeURIComponent(jobId)}/brand/send`, {
      method: "POST",
      json: payload,
    });
    await refreshJobs();
  }, [refreshJobs]);

  const submitSparesSlip = useCallback(async (jobId: string, lines: UsedSpareLine[]) => {
    await apiJson(`/api/service/srf-jobs/${encodeURIComponent(jobId)}/spares-slip`, {
      method: "POST",
      json: { lines },
    });
    await refreshJobs();
  }, [refreshJobs]);

  const technicianMarkRepairComplete = useCallback(async (jobId: string, technicianProfileId: string) => {
    await apiJson(`/api/service/srf-jobs/${encodeURIComponent(jobId)}/technician/repair-complete`, {
      method: "POST",
      json: { technicianProfileId },
    });
    await refreshJobs();
  }, [refreshJobs]);

  const supervisorLogBrandEstimate = useCallback(async (
    jobId: string,
    payload: { estimateInr: number; currency?: string; note?: string; emailMeta?: Record<string, unknown> },
  ) => {
    await apiJson(`/api/service/srf-jobs/${encodeURIComponent(jobId)}/brand/estimate`, {
      method: "POST",
      json: payload,
    });
    await refreshJobs();
  }, [refreshJobs]);

  const supervisorApproveBrandEstimate = useCallback(async (
    jobId: string,
    payload?: { note?: string; emailMeta?: Record<string, unknown> },
  ) => {
    await apiJson(`/api/service/srf-jobs/${encodeURIComponent(jobId)}/brand/approve`, {
      method: "POST",
      json: payload ?? {},
    });
    await refreshJobs();
  }, [refreshJobs]);

  const supervisorReceiveFromBrand = useCallback(async (jobId: string, payload?: { note?: string }) => {
    await apiJson(`/api/service/srf-jobs/${encodeURIComponent(jobId)}/brand/receive-return`, {
      method: "POST",
      json: payload ?? {},
    });
    await refreshJobs();
  }, [refreshJobs]);

  const supervisorLogBrandInvoice = useCallback(async (
    jobId: string,
    payload: { invoiceRef: string; invoiceAmountInr: number; note?: string; invoiceMeta?: Record<string, unknown> },
  ) => {
    await apiJson(`/api/service/srf-jobs/${encodeURIComponent(jobId)}/brand/invoice`, {
      method: "POST",
      json: payload,
    });
    await refreshJobs();
  }, [refreshJobs]);

  const supervisorLogBrandCreditNote = useCallback(async (
    jobId: string,
    payload: { couponCode: string; valueInr: number; validUntil?: string; note?: string },
  ) => {
    await apiJson(`/api/service/srf-jobs/${encodeURIComponent(jobId)}/brand/credit-note`, {
      method: "POST",
      json: payload,
    });
    await refreshJobs();
  }, [refreshJobs]);

  const supervisorNotifyBrandCoupon = useCallback(async (
    jobId: string,
    payload?: { channels?: Record<string, unknown>; note?: string },
  ) => {
    await apiJson(`/api/service/srf-jobs/${encodeURIComponent(jobId)}/brand/notify-customer-coupon`, {
      method: "POST",
      json: payload ?? {},
    });
    await refreshJobs();
  }, [refreshJobs]);

  const createOutwardBatch = useCallback(async (
    items: { jobId: string; destinationStoreId: string }[],
    opts?: { hoInvoiceRef?: string; storeInvoiceRef?: string },
  ) => {
    const out = await apiJson<{ odcNumber: string; moved: number }>("/api/service/odcs", {
      method: "POST",
      json: {
        items: items.map((x) => ({ srfId: x.jobId, destinationStoreId: x.destinationStoreId })),
        hoInvoiceRef: opts?.hoInvoiceRef,
        storeInvoiceRef: opts?.storeInvoiceRef,
      },
    });
    await refreshJobs();
    return out;
  }, [refreshJobs]);

  const receiveOutwardByDc = useCallback(async (dcNumber: string) => {
    const out = await apiJson<{ updated: number }>(`/api/service/odcs/${encodeURIComponent(dcNumber)}/receive`, {
      method: "POST",
    });
    await refreshJobs();
    return out;
  }, [refreshJobs]);

  const closeWithInvoice = useCallback(async (
    srfId: string,
    payload?: { hoSparesBillRef?: string; storeBillRef?: string; noBillingHandover?: boolean },
  ) => {
    await apiJson(`/api/service/srf-jobs/${encodeURIComponent(srfId)}/close`, { method: "POST", json: payload ?? {} });
    await refreshJobs();
  }, [refreshJobs]);

  const getStatusHistory = useCallback(async (srfId: string) => {
    const out = await apiJson<{ rows: Array<{ id: string; status: string; note: string; changedBy: string | null; changedAt: string }> }>(
      `/api/service/srf-jobs/${encodeURIComponent(srfId)}/status-history`,
    );
    return out.rows;
  }, []);

  const getSrfTrace = useCallback(async (srfId: string) => {
    return apiJson<SrfTrace>(`/api/service/srf-jobs/${encodeURIComponent(srfId)}/trace`);
  }, []);

  const cancelDraftSrf = useCallback(
    async (srfId: string, reason: string) => {
      await apiJson(`/api/service/srf-jobs/${encodeURIComponent(srfId)}/cancel`, {
        method: "POST",
        json: { reason },
      });
      await refreshJobs();
    },
    [refreshJobs],
  );

  const patchStoreDraftSrf = useCallback(
    async (
      srfId: string,
      patch: { customerName?: string; phone?: string; watchBrand?: string; watchModel?: string; serial?: string },
    ) => {
      await apiJson(`/api/service/srf-jobs/${encodeURIComponent(srfId)}/store-draft`, {
        method: "PATCH",
        json: patch,
      });
      await refreshJobs();
    },
    [refreshJobs],
  );

  const value = useMemo<SrfJobsContextValue>(
    () => ({
      jobs,
      refreshJobs,
      createDraftJob,
      refreshPhotoSession,
      finalizeJob,
      dispatchToServiceCentre,
      confirmInwardByDc,
      assignTechnician,
      convertTransferredSrfToLocal,
      supervisorRequestReestimate,
      supervisorApproveReestimate,
      supervisorTransferToOtherHo,
      supervisorMarkRepairComplete,
      supervisorMoveRejectedToOdc,
      technicianEstimateOk,
      technicianRequestReestimate,
      technicianSendToBrand,
      submitSparesSlip,
      technicianMarkRepairComplete,
      supervisorLogBrandEstimate,
      supervisorApproveBrandEstimate,
      supervisorReceiveFromBrand,
      supervisorLogBrandInvoice,
      supervisorLogBrandCreditNote,
      supervisorNotifyBrandCoupon,
      createOutwardBatch,
      receiveOutwardByDc,
      closeWithInvoice,
      getStatusHistory,
      getSrfTrace,
      cancelDraftSrf,
      patchStoreDraftSrf,
    }),
    [
      jobs,
      refreshJobs,
      createDraftJob,
      refreshPhotoSession,
      finalizeJob,
      dispatchToServiceCentre,
      confirmInwardByDc,
      assignTechnician,
      convertTransferredSrfToLocal,
      supervisorRequestReestimate,
      supervisorApproveReestimate,
      supervisorTransferToOtherHo,
      supervisorMarkRepairComplete,
      supervisorMoveRejectedToOdc,
      technicianEstimateOk,
      technicianRequestReestimate,
      technicianSendToBrand,
      submitSparesSlip,
      technicianMarkRepairComplete,
      supervisorLogBrandEstimate,
      supervisorApproveBrandEstimate,
      supervisorReceiveFromBrand,
      supervisorLogBrandInvoice,
      supervisorLogBrandCreditNote,
      supervisorNotifyBrandCoupon,
      createOutwardBatch,
      receiveOutwardByDc,
      closeWithInvoice,
      getStatusHistory,
      getSrfTrace,
      cancelDraftSrf,
      patchStoreDraftSrf,
    ],
  );

  return <SrfJobsContext.Provider value={value}>{children}</SrfJobsContext.Provider>;
}

export function useSrfJobs() {
  const ctx = useContext(SrfJobsContext);
  if (!ctx) throw new Error("useSrfJobs must be used within SrfJobsProvider");
  return ctx;
}
