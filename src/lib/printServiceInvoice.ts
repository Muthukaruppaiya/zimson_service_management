/**
 * Opens the browser print dialog for the current page.
 * Invoice markup should live in `.service-invoice-print-root`; chrome uses `.print-hidden`.
 * Later: open a dedicated print window or PDF from the same view model.
 */
export function printServiceInvoice(): void {
  window.print();
}
