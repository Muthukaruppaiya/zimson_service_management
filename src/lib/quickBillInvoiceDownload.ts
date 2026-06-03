import {
  mapQuickBillInvoiceToViewModel,
  type ServiceInvoiceMappingOptions,
} from "../components/service/mapQuickBillToServiceInvoice";
import type { QuickBillInvoice } from "../types/quickBill";
import { downloadServiceInvoicePdfFromPage, triggerBlobDownload } from "./captureInvoicePdf";
import { captureInvoicePdfFromViewModel } from "./renderInvoiceForPdf";

export function quickBillInvoicePdfFilename(inv: QuickBillInvoice): string {
  const base = (inv.invoiceNumber || inv.billNumber).replace(/[^\w.-]+/g, "_") || "invoice";
  return `Zimson-Invoice-${base}.pdf`;
}

/** PDF for WhatsApp/email — does not rely on visible DOM (same as store billing). */
export async function captureQuickBillInvoicePdf(
  inv: QuickBillInvoice,
  options: ServiceInvoiceMappingOptions,
): Promise<Blob> {
  const vm = mapQuickBillInvoiceToViewModel(inv, options);
  const idPrefix = `qb-${inv.id.replace(/-/g, "").slice(0, 12)}`;
  return captureInvoicePdfFromViewModel(vm, idPrefix);
}

/**
 * Downloads the formal tax invoice as PDF.
 * When `fromPage` is true, captures the visible `.service-invoice-print-root` (preview modal).
 */
export async function downloadQuickBillInvoicePdf(
  inv: QuickBillInvoice,
  options: ServiceInvoiceMappingOptions,
  fromPage = false,
): Promise<void> {
  const filename = quickBillInvoicePdfFilename(inv);
  if (fromPage) {
    await downloadServiceInvoicePdfFromPage(filename);
    return;
  }
  const vm = mapQuickBillInvoiceToViewModel(inv, options);
  const idPrefix = `qb-${inv.id.replace(/-/g, "").slice(0, 12)}`;
  const blob = await captureInvoicePdfFromViewModel(vm, idPrefix);
  triggerBlobDownload(blob, filename);
}

/** @deprecated Use downloadQuickBillInvoicePdf — kept for any external callers. */
export async function downloadQuickBillInvoiceHtml(
  inv: QuickBillInvoice,
  options: ServiceInvoiceMappingOptions,
  fromPage = false,
): Promise<void> {
  await downloadQuickBillInvoicePdf(inv, options, fromPage);
}
