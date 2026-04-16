/** Store ↔ service centre workflow statuses. */
export type SrfJobStatus =
  | "at_store"
  | "in_transit_sc"
  | "received_at_sc"
  | "assigned"
  | "estimate_ok"
  | "ready_for_outward"
  | "dispatched_to_store";

export type SrfJob = {
  id: string;
  reference: string;
  regionId: string;
  /** Originating store (where SRF was created). */
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
  selectedPartIds: string[];
  createdAt: string;
  status: SrfJobStatus;
  /** Store → SC challan */
  dcNumber: string | null;
  dispatchedToScAt: string | null;
  inwardAt: string | null;
  assignedTechnicianId: string | null;
  assignedAt: string | null;
  estimateOkAt: string | null;
  /** Repair finished at SC; waiting SC outward (ODC). */
  completedAtSc: string | null;
  readyForOutwardAt: string | null;
  /** Where the watch is sent after SC outward (may differ from storeId). */
  destinationStoreId: string | null;
  /** SC → store challan */
  outwardDcNumber: string | null;
  dispatchedToStoreAt: string | null;
};

export type CreateSrfJobInput = {
  reference: string;
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
  selectedPartIds: string[];
};
