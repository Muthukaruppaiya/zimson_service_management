/** Store ↔ service centre workflow statuses. */
export type SrfJobStatus =
  | "draft"
  | "photo_pending"
  | "at_store"
  | "in_transit_sc"
  | "received_at_sc"
  | "assigned"
  | "estimate_ok"
  | "reestimate_required"
  | "customer_rejected"
  | "ready_for_outward"
  | "dispatched_to_store"
  | "received_at_store"
  | "closed"
  | "cancelled";

export type SrfJobPhoto = {
  id: string;
  photoKind?: "front" | "back" | "strap" | "serial" | "damage" | "other";
  filePath: string;
  mime: string;
  bytes: number;
  createdAt: string;
};

export type UsedSpareLine = {
  spareId?: string | null;
  name: string;
  qty: number;
  unitPriceInr?: number | null;
  lineTotalInr?: number | null;
};

export type SrfJob = {
  id: string;
  reference: string;
  regionId: string;
  regionName?: string;
  /** Originating store (where SRF was created). */
  storeId: string;
  storeName?: string;
  customerName: string;
  phone: string;
  customerKind: "B2C" | "B2B";
  company?: string;
  watchBrand: string;
  watchModel: string;
  serial: string;
  complaint: string;
  estimateTotalInr: number;
  advanceInr?: number;
  selectedPartIds: string[];
  createdAt: string;
  status: SrfJobStatus;
  photoCount?: number;
  photos?: SrfJobPhoto[];
  photoSessionActive?: boolean;
  captureLinkDisabledAt?: string | null;
  requiresLocalConversion?: boolean;
  transferTargetRegionId?: string | null;
  transferTargetStoreId?: string | null;
  transferSourceRegionId?: string | null;
  transferSourceStoreId?: string | null;
  transferSourceReference?: string | null;
  trackingUrl?: string | null;
  /** Store → SC challan */
  dcNumber: string | null;
  dispatchedToScAt: string | null;
  inwardAt: string | null;
  assignedTechnicianId: string | null;
  assignedAt: string | null;
  estimateOkAt: string | null;
  reestimateRequestedNote?: string | null;
  reestimateRequestedInr?: number | null;
  reestimateRequestedAt?: string | null;
  reestimateApprovedNote?: string | null;
  reestimateApprovedAt?: string | null;
  customerReestimateResponse?: "accepted" | "rejected" | null;
  customerReestimateRespondedAt?: string | null;
  usedSpares?: UsedSpareLine[];
  sparesSlipSubmittedAt?: string | null;
  sparesSlipSubmittedBy?: string | null;
  hoSparesBillRef?: string | null;
  storeBillRef?: string | null;
  /** Repair finished at SC; waiting SC outward (ODC). */
  completedAtSc: string | null;
  readyForOutwardAt: string | null;
  /** Where the watch is sent after SC outward (may differ from storeId). */
  destinationStoreId: string | null;
  /** SC → store challan */
  outwardDcNumber: string | null;
  dispatchedToStoreAt: string | null;
  receivedBackAtStoreAt?: string | null;
  closedAt?: string | null;
  createdBy?: string | null;
  modifiedBy?: string | null;
  updatedAt?: string;
};

export type CreateSrfJobInput = {
  regionId: string;
  storeId: string;
  customerName: string;
  phone: string;
  customerKind: "B2C" | "B2B";
  company?: string;
  watchBrand: string;
  watchModel: string;
  serial: string;
  complaint: string;
  estimateTotalInr: number;
  advanceInr?: number;
  selectedPartIds: string[];
};
