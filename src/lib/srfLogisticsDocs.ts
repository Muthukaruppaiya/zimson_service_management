import type { SrfJob } from "../types/srfJob";

/** How an inward batch should be labeled in UI and printouts. */
export type ScInwardDocumentKind = "store_transfer" | "inter_ho_dc" | "inter_ho_return";

export function scInwardDocumentKindFromJob(
  job: Pick<SrfJob, "requiresLocalConversion" | "transferTargetRegionId" | "transferSourceRegionId">,
): ScInwardDocumentKind {
  if (!job.requiresLocalConversion && job.transferSourceRegionId) return "inter_ho_return";
  if (job.requiresLocalConversion && job.transferTargetRegionId) return "inter_ho_dc";
  if (job.transferTargetRegionId || job.transferSourceRegionId) return "inter_ho_dc";
  return "store_transfer";
}

export function scInwardNumberLabel(kind: ScInwardDocumentKind): string {
  return kind === "store_transfer" ? "Transfer number (TD)" : "DC number";
}

export function scInwardAckTitle(kind: ScInwardDocumentKind): string {
  if (kind === "inter_ho_return") return "Return DC received at sender HO";
  if (kind === "inter_ho_dc") return "Inter-HO DC inwarded at service centre";
  return "Watches received from store";
}

export function scInwardAckSubtitle(kind: ScInwardDocumentKind, updated: number): string {
  const n = `${updated} watch${updated === 1 ? "" : "es"}`;
  if (kind === "inter_ho_return") {
    return `${n} inwarded. Sender HO can dispatch back to the booking store when ready.`;
  }
  if (kind === "inter_ho_dc") {
    return `${n} inwarded from another HO. Supervisor can convert to local or assign as per queue.`;
  }
  return `${n} inwarded successfully. Supervisor can now assign technicians.`;
}

/** Printed inward receipt banner subtitle (confirmation at location). */
export function scInwardReceiptPrintSubtitle(kind: ScInwardDocumentKind): string {
  if (kind === "inter_ho_return") {
    return "SRF watch(es) received at sender HO — return DC inward confirmed.";
  }
  if (kind === "inter_ho_dc") {
    return "SRF watch(es) received at this service centre from another HO.";
  }
  return "SRF watch(es) received and inwarded at this service centre location.";
}

export function storeInwardReceiptPrintSubtitle(): string {
  return "SRF watch(es) received and inwarded at the store location.";
}
