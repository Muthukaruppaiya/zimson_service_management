import type { SessionUser } from "../types/user";
import type { SrfJob } from "../types/srfJob";

/** Internal row renamed during inter-HO return (see server ODC outward). Not a customer booking. */
export function isArchivedSrfReference(reference: string): boolean {
  return /-ARCH-/i.test(reference.trim());
}

export function isArchivedSrfJob(job: Pick<SrfJob, "reference">): boolean {
  return isArchivedSrfReference(job.reference);
}

/**
 * Hide superseded sender-HO row when the live booking (same root ref) is active again.
 * Keeps `sent_to_other_ho` visible while watch is at repair HO (no duplicate live ref yet).
 */
export function shouldShowInSrfBookingRegister(job: SrfJob, allJobs: Iterable<SrfJob>): boolean {
  if (isArchivedSrfJob(job)) return false;
  if (job.status !== "sent_to_other_ho") return true;
  const rootRef = (job.transferSourceReference ?? job.reference).trim();
  if (!rootRef) return true;
  for (const other of allJobs) {
    if (other.id === job.id || isArchivedSrfJob(other)) continue;
    if (other.status === "sent_to_other_ho") continue;
    const otherRoot = (other.transferSourceReference ?? other.reference).trim();
    if (other.reference === rootRef || otherRoot === rootRef || other.transferSourceReference === rootRef) {
      return false;
    }
  }
  return true;
}

export function jobVisibleToStoreUser(job: SrfJob, user: SessionUser): boolean {
  if (user.role === "super_admin" || user.role === "admin") return true;
  if (user.role === "admin") return user.regionId === job.regionId;
  if (
    user.role === "store_user" ||
    user.role === "store_user" ||
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
  if (user.role === "super_admin" || user.role === "admin") return true;
  if (
    user.role === "service_centre_clerk" ||
    user.role === "service_centre_supervisor" ||
    user.role === "service_centre_clerk" ||
    user.role === "service_centre_clerk" ||
    user.role === "technician" ||
    user.role === "ho_manager" ||
    user.role === "ho_purchase"
  ) {
    return user.regionId != null && (user.regionId === job.regionId || user.regionId === job.transferSourceRegionId);
  }
  if (user.role === "admin") return user.regionId === job.regionId;
  return false;
}

export function technicianCanActOnJob(job: SrfJob, user: SessionUser): boolean {
  if (user.role !== "technician") return false;
  const tid = user.technicianProfileId;
  if (!tid || !job.assignedTechnicianId) return false;
  return job.assignedTechnicianId === tid;
}
