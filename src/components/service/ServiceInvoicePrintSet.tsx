import type { ServiceInvoiceViewModel } from "../../types/serviceInvoice";
import { toCustomerCopyInvoiceVm, toInternalCopyInvoiceVm } from "../../lib/invoiceCopy";
import { ServiceInvoiceTemplate } from "./ServiceInvoiceTemplate";

type Props = {
  data: ServiceInvoiceViewModel;
  idPrefix?: string;
};

/**
 * Print layout: Customer Copy (no spare price split-up) then Internal Copy (line-by-line).
 * Each copy is a separate A4 page.
 */
export function ServiceInvoicePrintSet({ data, idPrefix = "inv" }: Props) {
  const customer = toCustomerCopyInvoiceVm(data);
  const internal = toInternalCopyInvoiceVm(data);
  return (
    <div className="service-invoice-print-set">
      <ServiceInvoiceTemplate data={customer} idPrefix={`${idPrefix}-customer`} />
      <ServiceInvoiceTemplate data={internal} idPrefix={`${idPrefix}-internal`} />
    </div>
  );
}
