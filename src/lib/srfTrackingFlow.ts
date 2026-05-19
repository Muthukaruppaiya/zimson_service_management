export type TrackingFlowStep = { id: string; label: string; short: string };

/** Standard store → HO → return journey. */
export const SRF_TRACKING_FLOW_HO: readonly TrackingFlowStep[] = [
  { id: "booked", label: "Service booked", short: "Booked" },
  { id: "sent", label: "Watch moved for repair", short: "In transit" },
  { id: "repair", label: "Repair in progress", short: "Repair" },
  { id: "ready", label: "Ready for delivery", short: "Delivery" },
] as const;

/** Repair by self at the store — no dispatch to HO. */
export const SRF_TRACKING_FLOW_STORE_SELF: readonly TrackingFlowStep[] = [
  { id: "booked", label: "Service booked", short: "Booked" },
  { id: "assign", label: "Assigned at your store", short: "Assigned" },
  { id: "repair", label: "Repair in progress", short: "Repair" },
  { id: "ready", label: "Ready for pickup", short: "Pickup" },
] as const;

/** Infer store-self when DB repair_route is missing but status is on the store-self path. */
export function effectiveSrfRepairRoute(
  repairRoute: string | null | undefined,
  status: string,
): "store_self" | "send_to_ho" {
  if (repairRoute === "store_self") return "store_self";
  if (repairRoute === "send_to_ho") return "send_to_ho";
  if (status.startsWith("store_self_")) return "store_self";
  return "send_to_ho";
}

export function trackingFlowForRepairRoute(
  repairRoute: string | null | undefined,
  status?: string,
): readonly TrackingFlowStep[] {
  const route = status ? effectiveSrfRepairRoute(repairRoute, status) : repairRoute === "store_self" ? "store_self" : "send_to_ho";
  return route === "store_self" ? SRF_TRACKING_FLOW_STORE_SELF : SRF_TRACKING_FLOW_HO;
}

export function trackingFlowIndexHo(status: string): number {
  if (status === "draft" || status === "photo_pending" || status === "at_store") return 0;
  if (status === "in_transit_sc" || status === "received_at_sc" || status === "sent_to_other_ho") return 1;
  if (
    status === "assigned" ||
    status === "estimate_ok" ||
    status === "reestimate_required" ||
    status === "customer_rejected" ||
    status === "sent_to_brand" ||
    status === "brand_estimate_pending" ||
    status === "brand_approved" ||
    status === "brand_repair_in_progress" ||
    status === "received_from_brand" ||
    status === "brand_credit_note_pending" ||
    status === "brand_credit_note_active" ||
    status === "store_self_pending" ||
    status === "store_self_assigned" ||
    status === "store_self_working"
  ) {
    return 2;
  }
  return 3;
}

export function trackingFlowIndexStoreSelf(status: string): number {
  if (
    status === "draft" ||
    status === "photo_pending" ||
    status === "at_store" ||
    status === "store_self_pending"
  ) {
    return 0;
  }
  if (status === "store_self_assigned") return 1;
  if (status === "store_self_working") return 2;
  if (status === "received_at_store" || status === "closed") return 3;
  if (status === "cancelled") return 0;
  return 2;
}

export function trackingFlowIndex(status: string, repairRoute: string | null | undefined): number {
  return effectiveSrfRepairRoute(repairRoute, status) === "store_self"
    ? trackingFlowIndexStoreSelf(status)
    : trackingFlowIndexHo(status);
}

export function customerTrackingStatusLabel(
  status: string,
  hasPendingReestimate: boolean,
  repairRoute?: string | null,
): string {
  if (hasPendingReestimate) return "Approval required";

  if (effectiveSrfRepairRoute(repairRoute, status) === "store_self") {
    if (status === "store_self_pending") return "Awaiting technician assign";
    if (status === "store_self_assigned" || status === "store_self_working") return "Repair at your store";
    if (status === "received_at_store") return "Ready for pickup";
    if (status === "closed") return "Collected";
    if (status === "draft" || status === "photo_pending" || status === "at_store") return "Booking confirmed";
    return "In progress";
  }

  if (status === "draft" || status === "photo_pending" || status === "at_store") return "Booking confirmed";
  if (status === "in_transit_sc" || status === "received_at_sc") return "In service movement";
  if (status === "sent_to_other_ho") return "Sent for specialist repair";
  if (status === "assigned" || status === "estimate_ok" || status === "reestimate_required") return "Under repair";
  if (
    status === "sent_to_brand" ||
    status === "brand_estimate_pending" ||
    status === "brand_approved" ||
    status === "brand_repair_in_progress"
  ) {
    return "With brand service";
  }
  if (status === "received_from_brand") return "Returned from brand";
  if (status === "brand_credit_note_pending" || status === "brand_credit_note_active") return "Brand credit issued";
  if (status === "customer_rejected") return "Awaiting confirmation";
  if (status === "ready_for_outward" || status === "dispatched_to_store") return "Ready for return";
  if (status === "received_at_store") return "Ready for pickup";
  if (status === "closed") return "Delivered";
  return "In progress";
}
