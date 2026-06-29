import type { SessionUser } from "../types/user";
import type { SrfJob } from "../types/srfJob";
import { jobMatchesRoleScope } from "./srfAccess";

export type DashboardOverviewStats = {
  openServiceRequests: number;
  awaitingCustomerApproval: number;
  atHeadOffice: number;
  readyForHandover: number;
};

const INACTIVE_STATUSES = new Set<SrfJob["status"]>(["closed", "cancelled", "draft"]);

const STORE_AT_STATUSES = new Set<SrfJob["status"]>([
  "at_store",
  "store_self_pending",
  "store_self_assigned",
  "store_self_working",
  "received_at_store",
  "photo_pending",
]);

function isOpenServiceRequest(job: SrfJob): boolean {
  return !INACTIVE_STATUSES.has(job.status);
}

function isAwaitingCustomerApproval(job: SrfJob): boolean {
  if (job.status === "brand_estimate_customer_pending") return true;
  if (job.status === "reestimate_required") return true;
  if (job.status === "estimate_ok") return true;
  if (job.interHoReestimatePhase === "customer_pending") return true;
  if (job.interHoBrandEstimatePhase === "customer_pending") return true;
  return false;
}

function isAtHeadOffice(job: SrfJob): boolean {
  if (INACTIVE_STATUSES.has(job.status)) return false;
  if (STORE_AT_STATUSES.has(job.status)) return false;
  if (job.status === "dispatched_to_store") return false;
  return true;
}

function isReadyForHandover(job: SrfJob): boolean {
  return job.status === "received_at_store";
}

export function computeDashboardOverviewStats(
  jobs: SrfJob[],
  user: SessionUser | null | undefined,
): DashboardOverviewStats {
  const empty: DashboardOverviewStats = {
    openServiceRequests: 0,
    awaitingCustomerApproval: 0,
    atHeadOffice: 0,
    readyForHandover: 0,
  };
  if (!user) return empty;

  const visible = jobs.filter((j) => jobMatchesRoleScope(j, user));

  return {
    openServiceRequests: visible.filter(isOpenServiceRequest).length,
    awaitingCustomerApproval: visible.filter(isAwaitingCustomerApproval).length,
    atHeadOffice: visible.filter(isAtHeadOffice).length,
    readyForHandover: visible.filter(isReadyForHandover).length,
  };
}
