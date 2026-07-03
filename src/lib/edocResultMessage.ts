import type { TransferFlow } from "./transferDocumentKind";

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

/** E-way could not be generated (missing GSTIN, e-doc off, etc.) — not a flow-type exemption. */
export function challanEwayNotApplicable(skipReason?: string | null, edocError?: string | null): boolean {
  const msg = String(skipReason ?? edocError ?? "").toLowerCase();
  return msg.includes("e-doc not configured") || msg.includes("gstin required for e-way");
}

export function challanCanCreateOrRetryEway(args: {
  flow?: TransferFlow;
  edocEnabled: boolean;
  ewayBillNo?: string | null;
  edocStatus?: string | null;
  edocError?: string | null;
  skipped?: boolean;
  skipReason?: string | null;
}): boolean {
  if (!args.edocEnabled) return false;
  if (String(args.ewayBillNo ?? "").trim()) return false;
  return true;
}

export function renderChallanEwayStatus(row: {
  edocEwayBillNo?: string | null;
  edocStatus?: string | null;
  edocError?: string | null;
}): { label: string; className: string; title?: string } {
  if (row.edocEwayBillNo?.trim()) {
    return { label: `EWB ${row.edocEwayBillNo}`, className: "text-emerald-700" };
  }
  if (row.edocStatus === "SKIPPED") {
    return { label: "Skipped", className: "text-stone-500", title: row.edocError ?? undefined };
  }
  if (row.edocStatus === "FAILED") {
    return { label: "Failed", className: "text-rose-700", title: row.edocError ?? undefined };
  }
  return { label: "Pending", className: "text-amber-700" };
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
