export type GrnMode = "WITH_BILL" | "WITHOUT_BILL";

export function isVendorInvoiceGrn(mode: string): boolean {
  return mode === "WITH_BILL";
}

export function isVoucherGrn(mode: string): boolean {
  return mode === "WITHOUT_BILL";
}

/** Stored value WITH_BILL = GRN against vendor invoice; WITHOUT_BILL = GRN against voucher. */
export function grnModeLabel(mode: string): string {
  return isVoucherGrn(mode) ? "GRN against voucher" : "GRN against vendor invoice";
}

export function grnDocNumberLabel(mode: string): string {
  return isVoucherGrn(mode) ? "Voucher number" : "Invoice number";
}

export function grnDocDateLabel(mode: string): string {
  return isVoucherGrn(mode) ? "Voucher date" : "Invoice date";
}

export function grnUploadLabel(mode: string): string {
  return isVoucherGrn(mode) ? "Upload voucher (PDF / DOC)" : "Upload vendor invoice (PDF / DOC)";
}

export function grnAttachHint(mode: string): string {
  return isVoucherGrn(mode) ? "Click to attach voucher (PDF or DOC)…" : "Click to attach invoice (PDF or DOC)…";
}

export function grnDocNumberPlaceholder(mode: string): string {
  return isVoucherGrn(mode) ? "e.g. VOU-2601-0001" : "e.g. INV-2601-0001";
}

export function grnModeBadgeClass(mode: string): string {
  return isVoucherGrn(mode)
    ? "border-amber-200 bg-amber-50 text-amber-700"
    : "border-blue-200 bg-blue-50 text-blue-700";
}

export function isDirectGrn(poNumber?: string | null): boolean {
  const v = String(poNumber ?? "").trim();
  return !v || v.toLowerCase() === "direct";
}

/** Against PO (with PO number) vs Direct GRN. */
export function grnTypeLabel(poNumber?: string | null): string {
  return isDirectGrn(poNumber) ? "Direct GRN" : "Against PO";
}

export function grnTypeDetail(poNumber?: string | null): string {
  const n = String(poNumber ?? "").trim();
  if (isDirectGrn(n)) return "Direct GRN";
  return `Against PO ${n}`;
}

export const GRN_DOC_ACCEPT =
  ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const GRN_DOC_EXTENSIONS = [".pdf", ".doc", ".docx"];

export function isAllowedGrnDocument(file: File): boolean {
  const name = file.name.toLowerCase();
  return GRN_DOC_EXTENSIONS.some((ext) => name.endsWith(ext));
}
