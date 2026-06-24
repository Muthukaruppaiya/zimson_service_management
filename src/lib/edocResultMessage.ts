import type { TransferFlow } from "./transferDocumentKind";
import { transferFlowNeedsEway } from "./ewayBill";

export type EdocUiResult = {
  ok?: boolean;
  skipped?: boolean;
  skipReason?: string | null;
  ewayBillNo?: string | null;
  ewayValidUpto?: string | null;
  pdfUrl?: string | null;
  error?: string | null;
};

export function formatEwayEdocMessage(edoc: EdocUiResult | null | undefined): string | null {
  if (!edoc) return null;
  if (edoc.ewayBillNo) {
    const valid = edoc.ewayValidUpto ? ` Valid until ${edoc.ewayValidUpto}.` : "";
    return `E-way bill ${edoc.ewayBillNo} generated.${valid}`;
  }
  if (edoc.skipped && edoc.skipReason) return `E-way: ${edoc.skipReason}`;
  if (edoc.error) return `E-way failed: ${edoc.error}`;
  return null;
}

/** E-way is not required (same GSTIN, store leg, etc.). */
export function challanEwayNotApplicable(skipReason?: string | null, edocError?: string | null): boolean {
  const msg = String(skipReason ?? edocError ?? "").toLowerCase();
  return (
    msg.includes("same gstin") ||
    msg.includes("store dispatch") ||
    msg.includes("not required only for inter-ho transfer")
  );
}

export function challanCanCreateOrRetryEway(args: {
  flow: TransferFlow;
  edocEnabled: boolean;
  ewayBillNo?: string | null;
  edocStatus?: string | null;
  edocError?: string | null;
  skipped?: boolean;
  skipReason?: string | null;
}): boolean {
  if (!args.edocEnabled) return false;
  if (String(args.ewayBillNo ?? "").trim()) return false;
  /** Inter-HO dispatch/return: e-way is mandatory even when both HOs share one GSTIN. */
  if (transferFlowNeedsEway(args.flow)) return true;
  return false;
}

/** History table: allow manual retry whenever no e-way number exists yet. */
export function challanShowEwayHistoryRetry(
  edocEnabled: boolean,
  ewayBillNo?: string | null,
): boolean {
  return edocEnabled && !String(ewayBillNo ?? "").trim();
}

export function formatEinvoiceEdocMessage(edoc: {
  ok?: boolean;
  skipped?: boolean;
  skipReason?: string | null;
  irn?: string | null;
  error?: string | null;
} | null | undefined): string | null {
  if (!edoc) return null;
  if (edoc.irn) return `E-invoice registered. IRN: ${edoc.irn}`;
  if (edoc.skipped && edoc.skipReason) return `E-invoice skipped: ${edoc.skipReason}`;
  if (edoc.error) return edoc.error;
  if (edoc.skipReason) return edoc.skipReason;
  return null;
}

export function humanizeEinvoiceError(raw: string | null | undefined): string {
  const msg = String(raw ?? "").trim();
  return msg || "E-invoice could not be registered with the GST portal (IRP).";
}

type EinvoiceRetryRow = {
  edocIrn?: string | null;
  edocStatus?: string | null;
};

function needsEinvoiceRetry(
  customerKind: string,
  row: EinvoiceRetryRow,
  edocEnabled: boolean,
): boolean {
  const status = String(row.edocStatus ?? "").toUpperCase();
  return (
    edocEnabled &&
    customerKind === "B2B" &&
    !String(row.edocIrn ?? "").trim() &&
    status !== "SKIPPED" &&
    status !== "SUCCESS"
  );
}

export function isTransientEinvoiceErrorMessage(msg: string | null | undefined): boolean {
  const m = String(msg ?? "").toLowerCase();
  return (
    /expecting value|504|timeout|empty response|not responding|gateway time-out|sandbox irp/i.test(m)
  );
}

export function quickBillNeedsEinvoiceRetry(
  row: { customerType: string } & EinvoiceRetryRow,
  edocEnabled: boolean,
): boolean {
  return needsEinvoiceRetry(row.customerType, row, edocEnabled);
}

export function srfNeedsEinvoiceRetry(
  row: { customerKind: string } & EinvoiceRetryRow,
  edocEnabled: boolean,
): boolean {
  return needsEinvoiceRetry(row.customerKind, row, edocEnabled);
}

/** B2B closed bill with no IRN yet (first attempt, not skipped). */
export function srfCanGenerateEinvoice(
  row: { customerKind: string } & EinvoiceRetryRow,
  edocEnabled: boolean,
): boolean {
  return (
    edocEnabled &&
    row.customerKind === "B2B" &&
    !String(row.edocIrn ?? "").trim() &&
    row.edocStatus !== "SKIPPED" &&
    row.edocStatus !== "FAILED"
  );
}
