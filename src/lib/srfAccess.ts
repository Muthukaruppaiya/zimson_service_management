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

/** Receiver HO local repair SRF created after inter-HO convert-local. */
export function isInterHoReceiverLocal(
  job: Pick<SrfJob, "reference" | "transferSourceReference" | "requiresLocalConversion" | "status">,
): boolean {
  const root = (job.transferSourceReference ?? "").trim();
  return (
    !!root &&
    root !== job.reference.trim() &&
    !job.requiresLocalConversion &&
    job.status !== "sent_to_other_ho"
  );
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

/** Supervisor list / transferred panel — hide ARCH rows; keep sender inter-HO rows visible during repair. */
export function shouldShowInSupervisorSrfList(job: SrfJob, allJobs: Iterable<SrfJob>): boolean {
  if (isArchivedSrfJob(job)) return false;
  if (job.status === "sent_to_other_ho") {
    if (job.interHoReestimatePhase) return true;
    if (job.interHoBrandEstimatePhase) return true;
    if ((job.transferSourceRegionId ?? "").trim()) return true;
    if ((job.transferTargetRegionId ?? "").trim()) return true;
    const rootRef = rootSrfBookingReference(job);
    return !hasActiveJourneyForRoot(rootRef, job, allJobs);
  }
  return true;
}

/** Active inter-HO re-estimate — sender HO negotiates with customer; receiver row is passive. */
export function isInterHoReestimateHandshakeActive(
  job: Pick<SrfJob, "status" | "interHoReestimatePhase">,
): boolean {
  const phase = job.interHoReestimatePhase;
  if (phase && ["pending_sender", "customer_pending", "customer_accepted", "customer_rejected"].includes(phase)) {
    return true;
  }
  return (
    job.status === "inter_ho_reestimate_pending_sender" ||
    job.status === "inter_ho_reestimate_customer_accepted" ||
    (job.status === "reestimate_required" && phase === "customer_pending") ||
    (job.status === "customer_rejected" && phase === "customer_rejected")
  );
}

/** Hide receiver-local SRF from supervisor decision queue while sender HO owns the handshake. */
export function shouldExcludeFromSupervisorDecisionQueue(job: SrfJob): boolean {
  return isInterHoReceiverLocal(job) && isInterHoReestimateHandshakeActive(job);
}

/** Main booking ref (sender) and converted receiver-local ref for inter-HO chains. */
export function interHoMainAndReceiverRefs(
  job: SrfJob,
  allJobs?: Iterable<SrfJob>,
): { mainRef: string; receiverRef?: string } {
  if (isInterHoReceiverLocal(job)) {
    const mainRef = (job.transferSourceReference ?? "").trim() || job.reference.trim();
    return { mainRef, receiverRef: job.reference.trim() };
  }
  const mainRef = rootSrfBookingReference(job);
  if (job.interHoReestimateReceiverSrfId && allJobs) {
    for (const other of allJobs) {
      if (other.id === job.interHoReestimateReceiverSrfId) {
        return { mainRef, receiverRef: other.reference.trim() };
      }
    }
  }
  if (allJobs) {
    for (const other of allJobs) {
      if (!isInterHoReceiverLocal(other)) continue;
      const src = (other.transferSourceReference ?? "").trim();
      if (src === mainRef) {
        return { mainRef, receiverRef: other.reference.trim() };
      }
    }
  }
  return { mainRef };
}

/** Archived sender-HO row linked to a receiver local SRF. */
export function findInterHoArchivedSenderForReceiver(
  receiverJob: Pick<SrfJob, "id" | "transferSourceReference">,
  allJobs: Iterable<SrfJob>,
): SrfJob | undefined {
  for (const j of allJobs) {
    if (j.status !== "sent_to_other_ho") continue;
    if (j.interHoReestimateReceiverSrfId === receiverJob.id) return j;
    const root = (receiverJob.transferSourceReference ?? "").trim();
    if (!root) continue;
    if (rootSrfBookingReference(j) === root) return j;
  }
  return undefined;
}

/** Repair HO user who may act on receiver-local inter-HO SRFs (brand desk, return dispatch). */
export function isRepairHoUserForInterHoReceiverJob(
  job: Pick<
    SrfJob,
    "reference" | "transferSourceReference" | "requiresLocalConversion" | "status" | "regionId" | "transferSourceRegionId"
  >,
  user: SessionUser,
): boolean {
  if (!isInterHoReceiverLocal(job)) return true;
  if (user.role === "super_admin" || user.role === "admin") {
    if (!user.regionId) return true;
    return user.regionId === (job.regionId ?? "").trim();
  }
  return user.regionId === (job.regionId ?? "").trim();
}

/** Sender HO user viewing a receiver-local inter-HO row (read-only brand desk leg). */
export function isInterHoSenderHoViewingReceiverJob(
  job: Pick<
    SrfJob,
    "reference" | "transferSourceReference" | "requiresLocalConversion" | "status" | "transferSourceRegionId"
  >,
  user: SessionUser,
): boolean {
  if (!isInterHoReceiverLocal(job)) return false;
  if (user.role === "super_admin" || user.role === "admin") return false;
  return user.regionId === (job.transferSourceRegionId ?? "").trim();
}

/** Hide receiver-local brand desk rows from sender HO after sender-facing handshake ends. */
export function shouldHideReceiverBrandDeskFromSenderHo(job: SrfJob, user: SessionUser): boolean {
  if (!isInterHoReceiverLocal(job)) return false;
  if (user.role === "super_admin" || user.role === "admin") return false;
  if (user.regionId !== (job.transferSourceRegionId ?? "").trim()) return false;
  if (job.brandReturnWithoutRepair) return true;
  if (
    job.status === "brand_estimate_pending" &&
    job.customerReestimateResponse === "rejected"
  ) {
    return true;
  }
  return !isInterHoBrandEstimateHandshakeActive(job);
}

/** Live receiver SRF for a sender HO archived `sent_to_other_ho` row. */
export function findInterHoReceiverForArchivedSender(
  archivedSender: Pick<SrfJob, "id" | "interHoReestimateReceiverSrfId" | "reference" | "transferSourceReference">,
  allJobs: Iterable<SrfJob>,
): SrfJob | undefined {
  const linkedId = (archivedSender.interHoReestimateReceiverSrfId ?? "").trim();
  if (linkedId) {
    const direct = [...allJobs].find((j) => j.id === linkedId);
    if (direct) return direct;
  }
  const root = rootSrfBookingReference(archivedSender);
  for (const j of allJobs) {
    if (!isInterHoReceiverLocal(j)) continue;
    if (rootSrfBookingReference(j) === root) return j;
  }
  return undefined;
}

/** Logged-in user belongs to the originating (sender) HO for this inter-HO chain. */
export function isSenderHoUserForInterHoJob(
  job: Pick<SrfJob, "regionId" | "transferSourceRegionId" | "reference" | "transferSourceReference" | "requiresLocalConversion" | "status">,
  user: SessionUser,
): boolean {
  if (user.role === "super_admin" || user.role === "admin") return true;
  if (!user.regionId) return false;
  if (isInterHoReceiverLocal(job)) {
    return user.regionId === (job.transferSourceRegionId ?? "").trim();
  }
  return user.regionId === (job.regionId ?? "").trim();
}

/** Active inter-HO brand estimate — sender HO negotiates with customer; receiver row is passive. */
export function isInterHoBrandEstimateHandshakeActive(
  job: Pick<SrfJob, "status" | "interHoBrandEstimatePhase">,
): boolean {
  const phase = job.interHoBrandEstimatePhase;
  if (phase && ["pending_sender", "customer_pending", "customer_accepted", "customer_rejected"].includes(phase)) {
    return true;
  }
  return (
    job.status === "inter_ho_brand_estimate_pending_sender" ||
    job.status === "inter_ho_brand_estimate_customer_accepted" ||
    (job.status === "brand_estimate_customer_pending" && phase === "customer_pending")
  );
}

/** Sender HO rows with an active inter-HO brand estimate handshake. */
export function isInterHoSenderBrandEstimateRow(
  job: SrfJob,
  user: SessionUser,
  allJobs: Iterable<SrfJob> = [],
): boolean {
  if (isInterHoReceiverLocal(job)) return false;
  const sourceRef = (job.transferSourceReference ?? "").trim();
  let sourceRefBelongsToUserRegion = false;
  if (sourceRef && user.regionId) {
    for (const x of allJobs) {
      if (x.reference.trim() === sourceRef && x.regionId === user.regionId) {
        sourceRefBelongsToUserRegion = true;
        break;
      }
    }
  }
  if (user.role !== "super_admin" && user.role !== "admin") {
    const sourceRegion = (job.transferSourceRegionId ?? "").trim();
    const ownRegion = (job.regionId ?? "").trim();
    if (
      !user.regionId ||
      (user.regionId !== sourceRegion && user.regionId !== ownRegion && !sourceRefBelongsToUserRegion)
    ) {
      return false;
    }
  }
  if (job.interHoBrandEstimatePhase) return true;
  if (
    job.status === "inter_ho_brand_estimate_pending_sender" ||
    job.status === "inter_ho_brand_estimate_customer_accepted"
  ) {
    return true;
  }
  if (job.status === "brand_estimate_customer_pending" && job.interHoBrandEstimatePhase === "customer_pending") {
    return true;
  }
  if (job.status === "sent_to_other_ho" && job.interHoReestimateReceiverSrfId && job.interHoBrandEstimatePhase) {
    return true;
  }
  return false;
}

/** Sender HO rows with inter-HO re-estimate or brand estimate awaiting action. */
export function isInterHoSenderActionRow(
  job: SrfJob,
  user: SessionUser,
  allJobs: Iterable<SrfJob> = [],
): boolean {
  return (
    isInterHoSenderReestimateRow(job, user, allJobs) || isInterHoSenderBrandEstimateRow(job, user, allJobs)
  );
}

/** Sender HO rows with an active inter-HO re-estimate handshake. */
export function isInterHoSenderReestimateRow(
  job: SrfJob,
  user: SessionUser,
  allJobs: Iterable<SrfJob> = [],
): boolean {
  if (isInterHoReceiverLocal(job)) return false;
  const sourceRef = (job.transferSourceReference ?? "").trim();
  let sourceRefBelongsToUserRegion = false;
  if (sourceRef && user.regionId) {
    for (const x of allJobs) {
      if (x.reference.trim() === sourceRef && x.regionId === user.regionId) {
        sourceRefBelongsToUserRegion = true;
        break;
      }
    }
  }
  if (user.role !== "super_admin" && user.role !== "admin") {
    const sourceRegion = (job.transferSourceRegionId ?? "").trim();
    const ownRegion = (job.regionId ?? "").trim();
    if (
      !user.regionId ||
      (user.regionId !== sourceRegion && user.regionId !== ownRegion && !sourceRefBelongsToUserRegion)
    ) {
      return false;
    }
  }
  if (job.interHoReestimatePhase) return true;
  if (
    job.status === "inter_ho_reestimate_pending_sender" ||
    job.status === "inter_ho_reestimate_customer_accepted"
  ) {
    return true;
  }
  if (job.status === "reestimate_required" && job.interHoReestimatePhase === "customer_pending") {
    return true;
  }
  if (job.status === "customer_rejected" && job.interHoReestimatePhase === "customer_rejected") {
    return true;
  }
  if (
    (job.status === "reestimate_required" || job.status === "customer_rejected") &&
    (
      !!(job.transferSourceRegionId ?? "").trim() ||
      !!(job.transferTargetRegionId ?? "").trim() ||
      !!(job.transferSourceReference ?? "").trim()
    )
  ) {
    return true;
  }
  if (job.status === "sent_to_other_ho" && Number(job.reestimateRequestedInr ?? 0) > 0) {
    return true;
  }
  return false;
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

/** Dashboard / KPI scope — store users see one store; regional roles see one region; super admin sees all. */
export function jobMatchesRoleScope(job: SrfJob, user: SessionUser): boolean {
  if (isArchivedSrfJob(job)) return false;
  if (user.role === "super_admin") return true;

  const regionId = (user.regionId ?? "").trim();
  const storeId = (user.storeId ?? "").trim();

  if (user.role === "store_user" || user.role === "store_manager" || user.role === "store_accounts") {
    if (!storeId) return false;
    return job.storeId === storeId || (job.destinationStoreId ?? "") === storeId;
  }

  if (!regionId) return false;

  return job.regionId === regionId || (job.transferSourceRegionId ?? "").trim() === regionId;
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
    if (user.regionId != null && (user.regionId === job.regionId || user.regionId === job.transferSourceRegionId)) {
      return true;
    }
    // Sender HO must see receiver rows during inter-HO brand estimate handshake.
    if (
      user.regionId != null &&
      isInterHoReceiverLocal(job) &&
      user.regionId === (job.transferSourceRegionId ?? "").trim() &&
      isInterHoBrandEstimateHandshakeActive(job)
    ) {
      return true;
    }
    return false;
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
