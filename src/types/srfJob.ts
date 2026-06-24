import type { AdvancePaymentDetails } from "../lib/paymentModes";
import type { SrfRepairRoute } from "../lib/srfRepairRoute";

/** Store ↔ service centre workflow statuses. */
export type SrfJobStatus =
  | "draft"
  | "photo_pending"
  | "at_store"
  | "store_self_pending"
  | "store_self_assigned"
  | "store_self_working"
  | "in_transit_sc"
  | "received_at_sc"
  | "sent_to_other_ho"
  | "assigned"
  | "estimate_ok"
  | "reestimate_required"
  | "customer_rejected"
  | "inter_ho_reestimate_pending_sender"
  | "inter_ho_reestimate_customer_accepted"
  | "sent_to_brand"
  | "brand_estimate_pending"
  | "brand_estimate_customer_pending"
  | "brand_estimate_customer_accepted"
  | "brand_approved"
  | "brand_repair_in_progress"
  | "received_from_brand"
  | "brand_credit_note_pending"
  | "brand_credit_note_active"
  | "ready_for_outward"
  | "dispatched_to_store"
  | "received_at_store"
  | "closed"
  | "cancelled";

export type SrfJobPhoto = {
  id: string;
  photoKind?: "front" | "back" | "strap" | "serial" | "damage" | "other" | "document";
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
  watchFamily?: string;
  watchModel: string;
  serial: string;
  complaint: string;
  caseType?: string;
  strapChainType?: string;
  natureOfRepair?: string;
  chainCount?: string;
  customerRemarks?: string;
  estimateTotalInr: number;
  estimatedFinishDate?: string | null;
  advanceInr?: number;
  advancePaymentMode?: string | null;
  advancePaymentDetails?: AdvancePaymentDetails | null;
  selectedPartIds: string[];
  createdAt: string;
  status: SrfJobStatus;
  /** send_to_ho = standard dispatch flow; store_self = assign & bill at store only. */
  repairRoute?: SrfRepairRoute;
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
  /** Inter-HO re-estimate handshake phase (receiver ↔ sender ↔ customer). */
  interHoReestimatePhase?:
    | "pending_sender"
    | "customer_pending"
    | "customer_accepted"
    | "customer_rejected"
    | null;
  interHoReestimateReceiverSrfId?: string | null;
  brandSentAt?: string | null;
  technicianBrandRecommendedAt?: string | null;
  technicianBrandRecommendNote?: string | null;
  brandAcknowledgedAt?: string | null;
  brandMailRef?: string | null;
  brandDispatchRef?: string | null;
  brandDispatchNote?: string | null;
  brandDispatchDocPath?: string | null;
  brandOdcNumber?: string | null;
  brandInwardRef?: string | null;
  brandEstimateInr?: number | null;
  brandEstimateCurrency?: string | null;
  brandEstimateReceivedAt?: string | null;
  brandEstimateEmailMeta?: Record<string, unknown> | null;
  brandMarkupInr?: number | null;
  brandCustomerQuoteInr?: number | null;
  brandHoApprovalSentAt?: string | null;
  brandHoApprovalEmailMeta?: Record<string, unknown> | null;
  brandReturnReceivedAt?: string | null;
  brandInvoiceRef?: string | null;
  brandInvoiceAmountInr?: number | null;
  brandInvoiceMeta?: Record<string, unknown> | null;
  brandCouponCode?: string | null;
  brandCouponValueInr?: number | null;
  brandCouponReceivedAt?: string | null;
  brandCouponValidUntil?: string | null;
  brandCreditNoteApprovedAt?: string | null;
  brandCreditNoteApprovedBy?: string | null;
  customerCouponNotifiedAt?: string | null;
  customerCouponNotifyChannels?: Record<string, unknown> | null;
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
  /** Store tax invoice number allocated at customer billing close. */
  invoiceNumber?: string | null;
  /** Line items + labour captured when the store closed billing (for PDF resend). */
  storeBillingSnapshot?: import("../lib/storeBillingSnapshot").StoreBillingSnapshot | null;
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
  edocIrn?: string | null;
  edocAckNo?: string | null;
  edocAckDate?: string | null;
  edocStatus?: string | null;
  edocError?: string | null;
  edocQr?: string | null;
  edocGeneratedAt?: string | null;
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
  watchFamily?: string;
  watchModel: string;
  serial: string;
  complaint: string;
  estimateTotalInr: number;
  destinationStoreId?: string;
  repairRoute?: SrfRepairRoute;
  estimatedFinishDate?: string | null;
  advanceInr?: number;
  selectedPartIds: string[];
};
