import type { SessionUser } from "../types/user";
import type { SrfJob } from "../types/srfJob";

export function jobVisibleToStoreUser(job: SrfJob, user: SessionUser): boolean {
  if (user.role === "super_admin") return true;
  if (user.role === "regional_admin") return user.regionId === job.regionId;
  if (user.role === "store_user") {
    return user.regionId === job.regionId && user.storeId === job.storeId;
  }
  return false;
}

export function jobVisibleToServiceCentre(job: SrfJob, user: SessionUser): boolean {
  if (user.role === "super_admin") return true;
  if (
    user.role === "service_centre_clerk" ||
    user.role === "service_centre_supervisor" ||
    user.role === "technician"
  ) {
    return user.regionId != null && user.regionId === job.regionId;
  }
  if (user.role === "regional_admin") return user.regionId === job.regionId;
  return false;
}

export function technicianCanActOnJob(job: SrfJob, user: SessionUser): boolean {
  if (user.role !== "technician") return false;
  const tid = user.technicianProfileId;
  if (!tid || !job.assignedTechnicianId) return false;
  return job.assignedTechnicianId === tid;
}
