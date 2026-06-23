import type { TransferFlow } from "./transferDocumentKind";

export type EwayPrefill = {
  documentNumber: string;
  flowLabel: string;
  fromLabel: string;
  toLabel: string;
  consignorGstin: string;
  consigneeGstin: string;
  vehicleNumber: string;
  defaultValueInr: number;
  interstate: boolean;
  existingEwayBillNo?: string | null;
  requiresConsigneeInput?: boolean;
};

export type EwayBillKind = "challan" | "brand" | "online_order";

export function transferFlowNeedsEway(flow: TransferFlow): boolean {
  return flow === "ho_to_ho_dispatch" || flow === "ho_to_ho_return";
}

export function ewayPrefillPath(kind: EwayBillKind, resourceId: string): string {
  if (kind === "challan") return `/api/edoc/delivery-challans/${encodeURIComponent(resourceId)}/eway-prefill`;
  if (kind === "brand") return `/api/edoc/srf-jobs/${encodeURIComponent(resourceId)}/eway-prefill`;
  return `/api/edoc/inter-ho-spare-orders/${encodeURIComponent(resourceId)}/eway-prefill`;
}

export function ewayGeneratePath(kind: EwayBillKind, resourceId: string): string {
  if (kind === "challan") return `/api/edoc/delivery-challans/${encodeURIComponent(resourceId)}/generate-eway`;
  if (kind === "brand") return `/api/edoc/srf-jobs/${encodeURIComponent(resourceId)}/generate-eway`;
  return `/api/edoc/inter-ho-spare-orders/${encodeURIComponent(resourceId)}/generate-eway`;
}
