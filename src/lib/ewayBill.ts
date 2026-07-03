import type { TransferFlow } from "./transferDocumentKind";
import type { BrandEwayConsigneeOption } from "../types/brandEwayConsignee";

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
  watchBrand?: string;
  brandConsignees?: BrandEwayConsigneeOption[];
  defaultConsigneeId?: string | null;
};

export type EwayBillKind = "challan" | "brand" | "online_order";

/** GST e-way applies to intra-state and inter-state goods movement (all transfer flows). */
export function transferFlowNeedsEway(flow: TransferFlow): boolean {
  return (
    flow === "store_to_ho" ||
    flow === "ho_to_store" ||
    flow === "ho_to_ho_dispatch" ||
    flow === "ho_to_ho_return"
  );
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
