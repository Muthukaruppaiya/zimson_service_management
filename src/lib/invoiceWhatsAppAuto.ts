import { phoneLast10 } from "./customerLookup";
import type { QuickBillEdocInfo } from "../types/quickBill";

/** Whether the invoice PDF should be auto-delivered on WhatsApp after billing. */
export function shouldAutoSendInvoiceWhatsApp(
  edoc: QuickBillEdocInfo | null | undefined,
  phone: string | null | undefined,
): boolean {
  if (phoneLast10(phone ?? "").length !== 10) return false;
  if (!edoc) return true;
  if (edoc.skipped) return true;
  if (edoc.ok) return true;
  return false;
}

/** Dedup key so we send once per invoice + e-invoice outcome (retry after IRN registers re-triggers). */
export function autoInvoiceWhatsAppDedupKey(
  invoiceNumber: string,
  edoc: QuickBillEdocInfo | null | undefined,
): string {
  if (edoc?.ok && edoc.irn) return `${invoiceNumber}:irn:${edoc.irn}`;
  if (edoc?.skipped) return `${invoiceNumber}:skipped`;
  if (!edoc) return `${invoiceNumber}:no-edoc`;
  return `${invoiceNumber}:pending`;
}
