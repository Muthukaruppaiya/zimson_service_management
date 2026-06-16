export { getMastersIndiaEdocConfig, isValidGstin } from "./config";
export { testEdocConnection } from "./client";
export type { EdocResult } from "./types";
export {
  edocEnabled,
  edocEwayAutoEnabled,
  edocFailOpen,
  tryGenerateEinvoiceForQuickBill,
  tryGenerateEinvoiceForSrfClose,
  tryGenerateEwayForChallan,
} from "./hooks";
