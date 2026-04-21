import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiJson } from "../lib/api";
import type { CreateSrfJobInput, SrfJob, UsedSpareLine } from "../types/srfJob";
import { useAuth } from "./AuthContext";

type SrfJobsContextValue = {
  jobs: SrfJob[];
  refreshJobs: () => Promise<void>;
  createDraftJob: (input: CreateSrfJobInput) => Promise<{ srfId: string; reference: string; token: string; captureUrl: string }>;
  refreshPhotoSession: (srfId: string) => Promise<{ token: string; captureUrl: string }>;
  finalizeJob: (
    srfId: string,
    payload: { complaint: string; estimateTotalInr: number; selectedPartIds: string[] },
  ) => Promise<{ trackingUrl?: string }>;
  dispatchToServiceCentre: (jobIds: string[]) => Promise<{ dcNumber: string; moved: number }>;
  confirmInwardByDc: (dcNumber: string) => Promise<{ updated: number }>;
  assignTechnician: (jobId: string, technicianId: string) => Promise<void>;
  supervisorRequestReestimate: (jobId: string, note: string) => Promise<void>;
  supervisorApproveReestimate: (jobId: string, payload: { estimateTotalInr?: number; note?: string }) => Promise<void>;
  supervisorMarkRepairComplete: (jobId: string) => Promise<void>;
  technicianEstimateOk: (jobId: string, technicianProfileId: string) => Promise<void>;
  technicianRequestReestimate: (jobId: string, technicianProfileId: string, note: string) => Promise<void>;
  submitSparesSlip: (jobId: string, lines: UsedSpareLine[]) => Promise<void>;
  technicianMarkRepairComplete: (jobId: string, technicianProfileId: string) => Promise<void>;
  createOutwardBatch: (items: { jobId: string; destinationStoreId: string }[]) => Promise<{ odcNumber: string; moved: number }>;
  receiveOutwardByDc: (dcNumber: string) => Promise<{ updated: number }>;
  closeWithInvoice: (srfId: string, payload?: { hoSparesBillRef?: string; storeBillRef?: string }) => Promise<void>;
  getStatusHistory: (srfId: string) => Promise<Array<{ id: string; status: string; note: string; changedBy: string | null; changedAt: string }>>;
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
    async (srfId: string, payload: { complaint: string; estimateTotalInr: number; selectedPartIds: string[] }) => {
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

  const supervisorRequestReestimate = useCallback(async (jobId: string, note: string) => {
    await apiJson(`/api/service/srf-jobs/${encodeURIComponent(jobId)}/supervisor/reestimate`, {
      method: "POST",
      json: { note },
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

  const supervisorMarkRepairComplete = useCallback(async (jobId: string) => {
    await apiJson(`/api/service/srf-jobs/${encodeURIComponent(jobId)}/supervisor/repair-complete`, {
      method: "POST",
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

  const createOutwardBatch = useCallback(async (items: { jobId: string; destinationStoreId: string }[]) => {
    const out = await apiJson<{ odcNumber: string; moved: number }>("/api/service/odcs", {
      method: "POST",
      json: { items: items.map((x) => ({ srfId: x.jobId, destinationStoreId: x.destinationStoreId })) },
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

  const closeWithInvoice = useCallback(async (srfId: string, payload?: { hoSparesBillRef?: string; storeBillRef?: string }) => {
    await apiJson(`/api/service/srf-jobs/${encodeURIComponent(srfId)}/close`, { method: "POST", json: payload ?? {} });
    await refreshJobs();
  }, [refreshJobs]);

  const getStatusHistory = useCallback(async (srfId: string) => {
    const out = await apiJson<{ rows: Array<{ id: string; status: string; note: string; changedBy: string | null; changedAt: string }> }>(
      `/api/service/srf-jobs/${encodeURIComponent(srfId)}/status-history`,
    );
    return out.rows;
  }, []);

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
      supervisorRequestReestimate,
      supervisorApproveReestimate,
      supervisorMarkRepairComplete,
      technicianEstimateOk,
      technicianRequestReestimate,
      submitSparesSlip,
      technicianMarkRepairComplete,
      createOutwardBatch,
      receiveOutwardByDc,
      closeWithInvoice,
      getStatusHistory,
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
      supervisorRequestReestimate,
      supervisorApproveReestimate,
      supervisorMarkRepairComplete,
      technicianEstimateOk,
      technicianRequestReestimate,
      submitSparesSlip,
      technicianMarkRepairComplete,
      createOutwardBatch,
      receiveOutwardByDc,
      closeWithInvoice,
      getStatusHistory,
    ],
  );

  return <SrfJobsContext.Provider value={value}>{children}</SrfJobsContext.Provider>;
}

export function useSrfJobs() {
  const ctx = useContext(SrfJobsContext);
  if (!ctx) throw new Error("useSrfJobs must be used within SrfJobsProvider");
  return ctx;
}
