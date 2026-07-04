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

/**
 * E-way for transfer DCs:
 * - HO → HO dispatch / return: yes
 * - Store ↔ HO (TD): no
 * Brand send and online spare orders use kind "brand" / "online_order" separately.
 */
export function transferFlowNeedsEway(flow: TransferFlow): boolean {
  return flow === "ho_to_ho_dispatch" || flow === "ho_to_ho_return";
}

/** True when this delivery document should offer / generate e-way. */
export function documentNeedsEway(args: {
  flow?: TransferFlow | null;
  documentNumber?: string | null;
  printKind?: "dc" | "transfer" | string | null;
  documentKind?: "DC" | "TD" | string | null;
}): boolean {
  if (args.flow && transferFlowNeedsEway(args.flow)) return true;
  if (args.printKind === "dc" || args.documentKind === "DC") return true;
  const no = String(args.documentNumber ?? "").trim();
  return /^DC/i.test(no);
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
