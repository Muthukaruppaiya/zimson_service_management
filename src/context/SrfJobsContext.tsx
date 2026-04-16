import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { SEED_SRF_JOBS } from "../data/seedSrfJobs";
import { apiJson, useApiMode } from "../lib/api";
import { createId } from "../lib/id";
import { STORAGE_SRF_JOBS } from "../lib/storageKeys";
import type { CreateSrfJobInput, SrfJob, SrfJobStatus } from "../types/srfJob";
import { useAuth } from "./AuthContext";

function normalizeJob(raw: SrfJob): SrfJob {
  return {
    ...raw,
    destinationStoreId: raw.destinationStoreId ?? null,
    outwardDcNumber: raw.outwardDcNumber ?? null,
    readyForOutwardAt: raw.readyForOutwardAt ?? null,
  };
}

function loadJobsLocal(): SrfJob[] {
  try {
    const raw = localStorage.getItem(STORAGE_SRF_JOBS);
    if (raw) {
      const parsed = JSON.parse(raw) as SrfJob[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed.map(normalizeJob);
    }
  } catch {
    /* ignore */
  }
  return structuredClone(SEED_SRF_JOBS).map(normalizeJob);
}

function saveJobsLocal(jobs: SrfJob[]) {
  localStorage.setItem(STORAGE_SRF_JOBS, JSON.stringify(jobs));
}

function nextDcNumber() {
  return `DC-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
}

function nextOdcNumber() {
  return `ODC-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
}

type SrfJobsContextValue = {
  jobs: SrfJob[];
  createJob: (input: CreateSrfJobInput) => SrfJob;
  dispatchToServiceCentre: (jobIds: string[]) => { dcNumber: string } | { error: string };
  confirmInwardByDc: (dcNumber: string) => { updated: number } | { error: string };
  assignTechnician: (jobId: string, technicianId: string) => { ok: true } | { error: string };
  technicianEstimateOk: (jobId: string, technicianProfileId: string) => { ok: true } | { error: string };
  technicianMarkRepairComplete: (
    jobId: string,
    technicianProfileId: string,
  ) => { ok: true } | { error: string };
  createOutwardBatch: (
    items: { jobId: string; destinationStoreId: string }[],
  ) => { odcNumber: string } | { error: string };
};

const SrfJobsContext = createContext<SrfJobsContextValue | null>(null);

export function SrfJobsProvider({ children }: { children: ReactNode }) {
  const api = useApiMode();
  const { user, authReady } = useAuth();
  const [jobs, setJobs] = useState<SrfJob[]>(() =>
    api ? structuredClone(SEED_SRF_JOBS).map(normalizeJob) : loadJobsLocal(),
  );

  useEffect(() => {
    if (!api || !authReady || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await apiJson<{ jobs: SrfJob[] }>("/api/srf-jobs");
        if (!cancelled) setJobs(data.jobs.map(normalizeJob));
      } catch {
        /* keep current */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, authReady, user?.id]);

  const persist = useCallback(
    (next: SrfJob[]) => {
      setJobs(next);
      if (!api) {
        saveJobsLocal(next);
        return;
      }
      void apiJson("/api/srf-jobs", { method: "PUT", json: { jobs: next } }).catch(console.error);
    },
    [api],
  );

  const createJob = useCallback(
    (input: CreateSrfJobInput): SrfJob => {
      const row: SrfJob = {
        id: createId("srf-job"),
        reference: input.reference,
        regionId: input.regionId,
        storeId: input.storeId,
        customerName: input.customerName.trim(),
        phone: input.phone.trim(),
        customerKind: input.customerKind,
        company: input.company?.trim() || undefined,
        watchBrand: input.watchBrand,
        watchModel: input.watchModel,
        serial: input.serial.trim(),
        complaint: input.complaint.trim(),
        estimateTotalInr: input.estimateTotalInr,
        selectedPartIds: [...input.selectedPartIds],
        createdAt: new Date().toISOString(),
        status: "at_store",
        dcNumber: null,
        dispatchedToScAt: null,
        inwardAt: null,
        assignedTechnicianId: null,
        assignedAt: null,
        estimateOkAt: null,
        completedAtSc: null,
        readyForOutwardAt: null,
        destinationStoreId: null,
        outwardDcNumber: null,
        dispatchedToStoreAt: null,
      };
      const next = [row, ...jobs];
      persist(next);
      return row;
    },
    [jobs, persist],
  );

  const dispatchToServiceCentre = useCallback(
    (jobIds: string[]): { dcNumber: string } | { error: string } => {
      if (jobIds.length === 0) return { error: "Select at least one SRF." };
      const dc = nextDcNumber();
      const now = new Date().toISOString();
      const idSet = new Set(jobIds);
      let ok = false;
      const next = jobs.map((j) => {
        if (!idSet.has(j.id)) return j;
        if (j.status !== "at_store") return j;
        ok = true;
        return {
          ...j,
          status: "in_transit_sc" as SrfJobStatus,
          dcNumber: dc,
          dispatchedToScAt: now,
        };
      });
      if (!ok) return { error: "Selected rows must be at store and ready to dispatch." };
      persist(next);
      return { dcNumber: dc };
    },
    [jobs, persist],
  );

  const confirmInwardByDc = useCallback(
    (dcNumber: string): { updated: number } | { error: string } => {
      const dc = dcNumber.trim().toUpperCase();
      if (!dc) return { error: "Enter DC number from the challan copy." };
      let count = 0;
      const now = new Date().toISOString();
      const next = jobs.map((j) => {
        if (j.dcNumber?.toUpperCase() !== dc) return j;
        if (j.status !== "in_transit_sc") return j;
        count += 1;
        return {
          ...j,
          status: "received_at_sc" as SrfJobStatus,
          inwardAt: now,
        };
      });
      if (count === 0) {
        return {
          error: "No watches in transit found for this DC, or inward was already done.",
        };
      }
      persist(next);
      return { updated: count };
    },
    [jobs, persist],
  );

  const assignTechnician = useCallback(
    (jobId: string, technicianId: string): { ok: true } | { error: string } => {
      const now = new Date().toISOString();
      let found = false;
      const next = jobs.map((j) => {
        if (j.id !== jobId) return j;
        found = true;
        if (j.status !== "received_at_sc") {
          return j;
        }
        return {
          ...j,
          status: "assigned" as SrfJobStatus,
          assignedTechnicianId: technicianId,
          assignedAt: now,
        };
      });
      if (!found) return { error: "SRF not found." };
      const updated = next.find((j) => j.id === jobId);
      if (updated?.status !== "assigned") {
        return { error: "SRF must be received at service centre before assignment." };
      }
      persist(next);
      return { ok: true };
    },
    [jobs, persist],
  );

  const technicianEstimateOk = useCallback(
    (jobId: string, technicianProfileId: string): { ok: true } | { error: string } => {
      const now = new Date().toISOString();
      const next = jobs.map((j) => {
        if (j.id !== jobId) return j;
        if (j.assignedTechnicianId !== technicianProfileId) return j;
        if (j.status !== "assigned") return j;
        return {
          ...j,
          status: "estimate_ok" as SrfJobStatus,
          estimateOkAt: now,
        };
      });
      const u = next.find((j) => j.id === jobId);
      if (!u || u.status !== "estimate_ok") {
        return { error: "Only the assigned technician can confirm estimate on an assigned SRF." };
      }
      persist(next);
      return { ok: true };
    },
    [jobs, persist],
  );

  const technicianMarkRepairComplete = useCallback(
    (jobId: string, technicianProfileId: string): { ok: true } | { error: string } => {
      const now = new Date().toISOString();
      const next = jobs.map((j) => {
        if (j.id !== jobId) return j;
        if (j.assignedTechnicianId !== technicianProfileId) return j;
        if (j.status !== "estimate_ok") return j;
        return {
          ...j,
          status: "ready_for_outward" as SrfJobStatus,
          completedAtSc: now,
          readyForOutwardAt: now,
        };
      });
      const u = next.find((j) => j.id === jobId);
      if (!u || u.status !== "ready_for_outward") {
        return {
          error: "Confirm estimate OK first, then mark repair complete for SC outward.",
        };
      }
      persist(next);
      return { ok: true };
    },
    [jobs, persist],
  );

  const createOutwardBatch = useCallback(
    (items: { jobId: string; destinationStoreId: string }[]): { odcNumber: string } | { error: string } => {
      if (items.length === 0) return { error: "Select at least one watch and destination store." };
      for (const it of items) {
        const j = jobs.find((x) => x.id === it.jobId);
        if (!j || j.status !== "ready_for_outward") {
          return { error: "Every selected row must be ready for outward (after technician completion)." };
        }
        if (!it.destinationStoreId.trim()) {
          return { error: "Choose a destination store for each selected SRF." };
        }
      }
      const odc = nextOdcNumber();
      const now = new Date().toISOString();
      const map = new Map(items.map((i) => [i.jobId, i.destinationStoreId.trim()]));
      const next = jobs.map((j) => {
        const dest = map.get(j.id);
        if (!dest) return j;
        if (j.status !== "ready_for_outward") return j;
        return {
          ...j,
          status: "dispatched_to_store" as SrfJobStatus,
          destinationStoreId: dest,
          outwardDcNumber: odc,
          dispatchedToStoreAt: now,
        };
      });
      persist(next);
      return { odcNumber: odc };
    },
    [jobs, persist],
  );

  const value = useMemo(
    () => ({
      jobs,
      createJob,
      dispatchToServiceCentre,
      confirmInwardByDc,
      assignTechnician,
      technicianEstimateOk,
      technicianMarkRepairComplete,
      createOutwardBatch,
    }),
    [
      jobs,
      createJob,
      dispatchToServiceCentre,
      confirmInwardByDc,
      assignTechnician,
      technicianEstimateOk,
      technicianMarkRepairComplete,
      createOutwardBatch,
    ],
  );

  return <SrfJobsContext.Provider value={value}>{children}</SrfJobsContext.Provider>;
}

export function useSrfJobs() {
  const ctx = useContext(SrfJobsContext);
  if (!ctx) throw new Error("useSrfJobs must be used within SrfJobsProvider");
  return ctx;
}
