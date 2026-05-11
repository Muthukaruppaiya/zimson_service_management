import type { SessionUser } from "../types/user";
import type { SrfJob } from "../types/srfJob";

export function jobVisibleToStoreUser(job: SrfJob, user: SessionUser): boolean {
  if (user.role === "super_admin" || user.role === "ho_admin") return true;
  if (user.role === "regional_admin") return user.regionId === job.regionId;
  if (
    user.role === "store_user" ||
    user.role === "store_purchase_user" ||
    user.role === "store_manager" ||
    user.role === "store_accounts"
  ) {
    return (
      (user.regionId === job.regionId && user.storeId === job.storeId) ||
      user.storeId === job.destinationStoreId
    );
  }
  return false;
}

export function jobVisibleToServiceCentre(job: SrfJob, user: SessionUser): boolean {
  if (user.role === "super_admin" || user.role === "ho_admin") return true;
  if (
    user.role === "service_centre_clerk" ||
    user.role === "service_centre_supervisor" ||
    user.role === "service_centre_inward" ||
    user.role === "service_centre_outward" ||
    user.role === "technician" ||
    user.role === "ho_manager" ||
    user.role === "ho_user"
  ) {
    return user.regionId != null && (user.regionId === job.regionId || user.regionId === job.transferSourceRegionId);
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
