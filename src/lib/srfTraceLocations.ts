/** Labels and movement text for SRF full trace (shared by API + UI). */

export type SrfTraceLocationJob = {
  regionId: string;
  regionName?: string | null;
  storeId: string;
  storeName?: string | null;
  destinationStoreId: string | null;
  destinationStoreName?: string | null;
  transferSourceRegionId?: string | null;
  transferSourceRegionName?: string | null;
  transferTargetRegionId?: string | null;
  transferTargetRegionName?: string | null;
};

export type SrfTraceLocationContext = {
  storeLabel: string;
  scLabel: string;
  destStoreLabel: string;
  regionLabel: string;
  transferSourceRegionLabel: string | null;
  transferTargetRegionLabel: string | null;
};

export function buildTraceLocationContext(job: SrfTraceLocationJob): SrfTraceLocationContext {
  const regionLabel = job.regionName?.trim() || job.regionId;
  const storeLabel = job.storeName?.trim() || job.storeId;
  const destStoreLabel =
    job.destinationStoreName?.trim() || job.destinationStoreId?.trim() || storeLabel;
  return {
    regionLabel,
    storeLabel,
    scLabel: `${regionLabel} Service Centre`,
    destStoreLabel,
    transferSourceRegionLabel:
      job.transferSourceRegionName?.trim() || job.transferSourceRegionId?.trim() || null,
    transferTargetRegionLabel:
      job.transferTargetRegionName?.trim() || job.transferTargetRegionId?.trim() || null,
  };
}

function storeLabelFromDetails(
  storeId: string | null | undefined,
  ctx: SrfTraceLocationContext,
  job: SrfTraceLocationJob,
): string {
  if (!storeId) return ctx.destStoreLabel;
  if (storeId === job.storeId) return ctx.storeLabel;
  if (storeId === job.destinationStoreId && job.destinationStoreName) {
    return job.destinationStoreName;
  }
  return storeId;
}

/** Where the watch sits while a given workflow status applies. */
export function watchLocationForStatus(status: string, ctx: SrfTraceLocationContext): string {
  switch (status) {
    case "draft":
    case "photos_pending":
    case "at_store":
    case "store_self_pending":
      return ctx.storeLabel;
    case "store_self_assigned":
    case "store_self_working":
      return `${ctx.storeLabel} (working — repair in progress)`;
    case "in_transit_sc":
      return `In transit · ${ctx.storeLabel} → ${ctx.scLabel}`;
    case "received_at_sc":
    case "assigned":
    case "estimate_ok":
    case "repair_complete":
    case "ready_for_outward":
    case "awaiting_customer_reestimate":
    case "reestimate_sent":
    case "brand_sent":
    case "brand_estimate_received":
    case "brand_return_received":
      return ctx.scLabel;
    case "sent_to_other_ho":
      return ctx.transferTargetRegionLabel
        ? `Transfer queued · ${ctx.transferTargetRegionLabel} HO`
        : "Transfer queued · other HO";
    case "dispatched_to_store":
      return `In transit · ${ctx.scLabel} → ${ctx.destStoreLabel}`;
    case "received_at_store":
    case "closed":
    case "cancelled":
      return ctx.destStoreLabel;
    default:
      return ctx.storeLabel;
  }
}

function parseDetails(details: unknown): Record<string, unknown> | null {
  if (details == null) return null;
  if (typeof details === "object" && !Array.isArray(details)) {
    return details as Record<string, unknown>;
  }
  if (typeof details === "string") {
    try {
      const parsed = JSON.parse(details) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

/** Inward / outward movement line for a logged action (null if not a physical move). */
export function locationMoveForAction(
  action: string,
  details: unknown,
  ctx: SrfTraceLocationContext,
  job: SrfTraceLocationJob,
): string | null {
  const d = parseDetails(details);
  switch (action) {
    case "store_dc_dispatch":
      return `Outward: ${ctx.storeLabel} → ${ctx.scLabel}`;
    case "sc_inward_dc":
      return `Inward: In transit from store → ${ctx.scLabel}`;
    case "sender_ho_inward_return_dc":
      return `Inward: Return DC at ${
        ctx.transferSourceRegionLabel ? `${ctx.transferSourceRegionLabel} HO` : ctx.regionLabel + " HO"
      }`;
    case "ho_dispatch_to_store": {
      const destId = typeof d?.destinationStoreId === "string" ? d.destinationStoreId : job.destinationStoreId;
      const dest = storeLabelFromDetails(destId, ctx, job);
      return `Outward: ${ctx.scLabel} → ${dest}`;
    }
    case "store_inward_odc":
      return `Inward: In transit from HO → ${ctx.destStoreLabel}`;
    case "inter_ho_dispatch_to_repair":
      return `Outward: ${ctx.regionLabel} HO → ${
        ctx.transferTargetRegionLabel ? `${ctx.transferTargetRegionLabel} HO` : "repair HO"
      }`;
    case "inter_ho_return_to_sender":
      return `Outward: Repair HO → ${
        ctx.transferSourceRegionLabel
          ? `${ctx.transferSourceRegionLabel} HO`
          : `${ctx.regionLabel} HO`
      }`;
    case "supervisor_transfer_other_ho":
      return `Queued transfer: ${ctx.scLabel} → ${
        ctx.transferTargetRegionLabel ? `${ctx.transferTargetRegionLabel} HO` : "other HO"
      }`;
    case "convert_to_local_create":
      return `Inward: Inter-HO transfer → ${ctx.scLabel}`;
    case "convert_to_local_close_source":
      return `Outward: Source SRF archived at sender HO`;
    case "srf_finalized":
      return `Watch registered at ${ctx.storeLabel}`;
    case "store_self_assign_technician":
      return watchLocationForStatus("store_self_working", ctx);
    case "store_self_repair_complete":
      return ctx.destStoreLabel;
    case "srf_draft_created":
      return `Watch at ${ctx.storeLabel} (draft)`;
    default:
      return null;
  }
}

/** Watch location immediately after an action (when it changes physical custody). */
export function watchLocationAfterAction(
  action: string,
  _details: unknown,
  ctx: SrfTraceLocationContext,
  _job: SrfTraceLocationJob,
): string | null {
  switch (action) {
    case "store_dc_dispatch":
      return watchLocationForStatus("in_transit_sc", ctx);
    case "sc_inward_dc":
    case "convert_to_local_create":
      return ctx.scLabel;
    case "sender_ho_inward_return_dc":
      return ctx.transferSourceRegionLabel
        ? `${ctx.transferSourceRegionLabel} HO (ready for store dispatch)`
        : `${ctx.regionLabel} HO (ready for store dispatch)`;
    case "ho_dispatch_to_store":
      return watchLocationForStatus("dispatched_to_store", ctx);
    case "store_inward_odc":
      return ctx.destStoreLabel;
    case "inter_ho_dispatch_to_repair":
      return ctx.transferTargetRegionLabel
        ? `In transit · ${ctx.regionLabel} HO → ${ctx.transferTargetRegionLabel} HO`
        : "In transit · inter-HO repair";
    case "inter_ho_return_to_sender":
      return ctx.transferSourceRegionLabel
        ? `In transit · repair HO → ${ctx.transferSourceRegionLabel} HO`
        : `In transit · repair HO → ${ctx.regionLabel} HO`;
    case "supervisor_transfer_other_ho":
      return watchLocationForStatus("sent_to_other_ho", ctx);
    case "srf_finalized":
    case "srf_draft_created":
      return ctx.storeLabel;
    case "store_self_assign_technician":
      return watchLocationForStatus("store_self_working", ctx);
    case "store_self_repair_complete":
      return watchLocationForStatus("received_at_store", ctx);
    case "store_close_with_invoice":
    case "store_no_billing_handover":
      return ctx.destStoreLabel;
    default:
      return null;
  }
}

export type TraceRowWithLocation = {
  watchLocation?: string;
  locationMove?: string | null;
};

export function enrichTraceActionRow<T extends { action: string; details?: unknown }>(
  row: T,
  ctx: SrfTraceLocationContext,
  job: SrfTraceLocationJob,
): T & TraceRowWithLocation {
  const locationMove = locationMoveForAction(row.action, row.details, ctx, job);
  const after = watchLocationAfterAction(row.action, row.details, ctx, job);
  return {
    ...row,
    locationMove,
    watchLocation: after ?? undefined,
  };
}

export function enrichTraceStatusRow<T extends { status: string }>(
  row: T,
  ctx: SrfTraceLocationContext,
): T & TraceRowWithLocation {
  return {
    ...row,
    watchLocation: watchLocationForStatus(row.status, ctx),
  };
}

/** Replay timeline so each row gets watchLocation; actions with movement get locationMove. */
export function enrichTraceTimeline<
  A extends { action: string; details?: unknown; createdAt: string },
  S extends { status: string; changedAt: string },
>(
  job: SrfTraceLocationJob,
  actions: A[],
  statusHistory: S[],
): { actions: (A & TraceRowWithLocation)[]; statusHistory: (S & TraceRowWithLocation)[] } {
  const ctx = buildTraceLocationContext(job);
  let currentLocation = watchLocationForStatus("at_store", ctx);

  type Ev =
    | { kind: "action"; at: string; action: A }
    | { kind: "status"; at: string; status: S };

  const events: Ev[] = [
    ...actions.map((action) => ({ kind: "action" as const, at: action.createdAt, action })),
    ...statusHistory.map((status) => ({ kind: "status" as const, at: status.changedAt, status })),
  ];
  events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  const actionEnriched = new Map<A, A & TraceRowWithLocation>();
  const statusEnriched = new Map<S, S & TraceRowWithLocation>();

  for (const ev of events) {
    if (ev.kind === "status") {
      currentLocation = watchLocationForStatus(ev.status.status, ctx);
      statusEnriched.set(ev.status, {
        ...ev.status,
        watchLocation: currentLocation,
      });
    } else {
      const move = locationMoveForAction(ev.action.action, ev.action.details, ctx, job);
      const after = watchLocationAfterAction(ev.action.action, ev.action.details, ctx, job);
      if (after) currentLocation = after;
      actionEnriched.set(ev.action, {
        ...ev.action,
        locationMove: move,
        watchLocation: currentLocation,
      });
    }
  }

  return {
    actions: actions.map((a) => actionEnriched.get(a) ?? enrichTraceActionRow(a, ctx, job)),
    statusHistory: statusHistory.map((s) => statusEnriched.get(s) ?? enrichTraceStatusRow(s, ctx)),
  };
}
