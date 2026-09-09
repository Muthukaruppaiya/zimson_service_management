/**
 * Opens the browser print dialog for invoice copies.
 * Invoice markup should live in `.service-invoice-print-root`; chrome uses `.print-hidden`.
 */
export function printServiceInvoice(): void {
  document.body.classList.add("invoice-printing");
  const restore = () => {
    document.body.classList.remove("invoice-printing");
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore);
  window.setTimeout(() => {
    window.print();
  }, 50);
}
