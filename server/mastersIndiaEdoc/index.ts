export { getMastersIndiaEdocConfig, isValidGstin } from "./config";
export { testEdocConnection, testEinvoiceConnection, testEwayConnection } from "./client";
export type { EdocResult } from "./types";
export {
  edocEnabled,
  edocEwayAutoEnabled,
  edocFailOpen,
  tryGenerateEinvoiceForQuickBill,
  tryGenerateEinvoiceForInterHoInvoice,
  tryGenerateEinvoiceForSrfClose,
  tryGenerateEwayForChallan,
  tryGenerateEwayForChallanId,
  tryGenerateEwayForBrandSend,
  tryGenerateEwayForOnlineSpareOrder,
  getEwayPrefillForChallan,
  getEwayPrefillForBrandSend,
  getEwayPrefillForOnlineSpareOrder,
  parseEwayGenerateInput,
  transferFlowNeedsEway,
} from "./hooks";
export type { EwayGenerateInput, EwayPrefill } from "./types";
