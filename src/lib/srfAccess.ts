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
/** Root booking reference for inter-HO chains (strips internal -ARCH- suffix rows). */
export function rootSrfBookingReference(job: Pick<SrfJob, "reference" | "transferSourceReference">): string {
  const archMatch = job.reference.trim().match(/^(.+)-ARCH-/i);
  if (archMatch?.[1]) return archMatch[1].trim();
  const fromTransfer = (job.transferSourceReference ?? "").trim();
  if (fromTransfer) return fromTransfer;
  return job.reference.trim();
}

function hasActiveJourneyForRoot(rootRef: string, job: SrfJob, allJobs: Iterable<SrfJob>): boolean {
  if (!rootRef) return false;
  for (const other of allJobs) {
    if (other.id === job.id || isArchivedSrfJob(other)) continue;
    if (other.status === "sent_to_other_ho") continue;
    const otherRoot = rootSrfBookingReference(other);
    if (
      other.reference === rootRef ||
      otherRoot === rootRef ||
      (other.transferSourceReference ?? "").trim() === rootRef
    ) {
      return true;
    }
  }
  return false;
}

export function shouldShowInSrfBookingRegister(job: SrfJob, allJobs: Iterable<SrfJob>): boolean {
  if (isArchivedSrfJob(job)) return false;
  if (job.status !== "sent_to_other_ho") return true;
  const rootRef = rootSrfBookingReference(job);
  return !hasActiveJourneyForRoot(rootRef, job, allJobs);
}

/** Supervisor list / transferred panel — hide ARCH rows and superseded sent_to_other_ho parents. */
export function shouldShowInSupervisorSrfList(job: SrfJob, allJobs: Iterable<SrfJob>): boolean {
  if (isArchivedSrfJob(job)) return false;
  if (job.status === "sent_to_other_ho") {
    const rootRef = rootSrfBookingReference(job);
    return !hasActiveJourneyForRoot(rootRef, job, allJobs);
  }
  return true;
}

/** Find live local repair SRF created from inter-HO convert (same root booking ref). */
export function findLocalRepairSrfForRoot(
  rootRef: string,
  allJobs: Iterable<SrfJob>,
  user: SessionUser,
): SrfJob | undefined {
  const root = rootRef.trim();
  if (!root) return undefined;
  for (const j of allJobs) {
    if (isArchivedSrfJob(j)) continue;
    if (j.status === "sent_to_other_ho") continue;
    if (!jobVisibleToServiceCentre(j, user)) continue;
    const jRoot = rootSrfBookingReference(j);
    if (jRoot !== root && (j.transferSourceReference ?? "").trim() !== root) continue;
    if (j.requiresLocalConversion) continue;
    return j;
  }
  return undefined;
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
