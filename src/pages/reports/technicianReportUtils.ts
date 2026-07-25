import { useCallback, useEffect, useMemo, useState } from "react";
import { apiJson } from "../../lib/api";
import type { SrfJob, SrfJobStatus } from "../../types/srfJob";
import type { TechnicianProfile } from "../../types/technician";

export const ASSIGN_CSV_COLUMNS = [
  "SR No",
  "Customer",
  "Phone",
  "Watch",
  "Serial",
  "Technician",
  "Grade",
  "Assigned At",
  "Days Since Assign",
  "Aging Bucket",
  "Status",
  "Repair Route",
  "Region",
  "Store",
];

export const REPAIRED_CSV_COLUMNS = [
  "SR No",
  "Customer",
  "Phone",
  "Watch",
  "Serial",
  "Technician",
  "Grade",
  "Assigned At",
  "Repaired At",
  "Turnaround (days)",
  "Status",
  "Repair Route",
  "Region",
  "Store",
];

const BRAND_OR_OUTWARD_STATUSES = new Set<SrfJobStatus>([
  "brand_outward_pending",
  "brand_dispatch_pending",
  "sent_to_brand",
  "brand_estimate_pending",
  "brand_estimate_customer_pending",
  "brand_estimate_customer_accepted",
  "brand_approved",
  "brand_repair_in_progress",
  "received_from_brand",
  "brand_credit_note_pending",
  "brand_credit_note_pending_ho",
  "brand_credit_note_pending_accounts",
  "brand_credit_note_active",
  "ready_for_outward",
  "pending_store_transit",
  "dispatched_to_store",
  "awaiting_store_inward",
  "received_at_store",
  "closed",
  "cancelled",
]);

export function daysSince(iso?: string | null): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24)));
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function watchLabel(job: SrfJob): string {
  return [job.watchBrand, job.watchFamily, job.watchModel].filter(Boolean).join(" ");
}

export function assignAgingBucket(days: number): string {
  if (days <= 3) return "0-3 days";
  if (days <= 7) return "4-7 days";
  if (days <= 14) return "8-14 days";
  if (days <= 30) return "15-30 days";
  return "30+ days";
}

export function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

export function repairRouteLabel(job: SrfJob): string {
  if (job.repairRoute === "store_self") return "In-store repair";
  return "HO / service centre";
}

export function isTechnicianAssignActive(job: SrfJob): boolean {
  if (!job.assignedTechnicianId?.trim()) return false;
  if (job.completedAtSc) return false;
  if (BRAND_OR_OUTWARD_STATUSES.has(job.status)) return false;
  if (job.status === "draft" || job.status === "photo_pending") return false;
  if (job.status === "at_store" || job.status === "pending_ho_transit") return false;
  if (job.status === "in_transit_sc" || job.status === "awaiting_sc_inward") return false;
  return true;
}

export function isTechnicianRepairedHistory(job: SrfJob): boolean {
  if (!job.assignedTechnicianId?.trim()) return false;
  return Boolean(job.completedAtSc);
}

/** Watches inwarded but not yet assigned to a technician. */
export function isUnassignedWatch(job: SrfJob): boolean {
  if (job.assignedTechnicianId?.trim()) return false;
  if (job.status === "closed" || job.status === "cancelled") return false;
  return job.status === "received_at_sc" || job.status === "store_self_pending";
}

export function unassignedStatusLabel(job: SrfJob): string {
  if (job.status === "store_self_pending") return "In-store — pending technician assign";
  if (job.status === "received_at_sc") {
    if (job.requiresLocalConversion) return "HO received — convert to local SRF first";
    if (job.transferSourceRegionId?.trim()) return "HO received (inter-HO) — pending assign";
    return "HO received — pending technician assign";
  }
  return statusLabel(job.status);
}

export const UNASSIGNED_CSV_COLUMNS = [
  "SR No",
  "Customer",
  "Phone",
  "Watch",
  "Serial",
  "Unassigned Status",
  "Received At",
  "Days Since Inward",
  "Aging Bucket",
  "Repair Route",
  "Region",
  "Store",
  "Inbound DC",
];

export function technicianDisplay(
  techId: string | null | undefined,
  techById: Map<string, TechnicianProfile>,
): { name: string; grade: string } {
  if (!techId) return { name: "—", grade: "—" };
  const tech = techById.get(techId);
  if (!tech) return { name: techId, grade: "—" };
  return { name: tech.fullName, grade: tech.grade };
}

export function useTechnicianDirectory() {
  const [technicians, setTechnicians] = useState<TechnicianProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const out = await apiJson<{ rows: TechnicianProfile[] }>("/api/service/technicians");
      setTechnicians(out.rows ?? []);
    } catch (e) {
      setTechnicians([]);
      setError(e instanceof Error ? e.message : "Could not load technicians.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const techById = useMemo(() => {
    const m = new Map<string, TechnicianProfile>();
    for (const t of technicians) m.set(t.id, t);
    return m;
  }, [technicians]);

  return { technicians, techById, loading, error, refresh };
}
