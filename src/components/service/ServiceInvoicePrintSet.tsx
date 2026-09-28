import type { ServiceInvoiceViewModel } from "../../types/serviceInvoice";
import { toCustomerCopyInvoiceVm } from "../../lib/invoiceCopy";
import { ServiceInvoiceTemplate } from "./ServiceInvoiceTemplate";

type Props = {
  data: ServiceInvoiceViewModel;
  idPrefix?: string;
};

const INVOICE_COPIES = [
  { id: "original", label: "ORIGINAL" },
  { id: "duplicate", label: "DUPLICATE" },
  { id: "triplicate", label: "TRIPLICATE" },
] as const;

/** Three GST copies: Original, Duplicate, Triplicate (same invoice body). */
export function ServiceInvoicePrintSet({ data, idPrefix = "inv" }: Props) {
  const customer = toCustomerCopyInvoiceVm(data);
  return (
    <div className="service-invoice-print-set">
      {INVOICE_COPIES.map((copy) => (
        <ServiceInvoiceTemplate
          key={copy.id}
          data={{ ...customer, copyKind: "customer", copyLabel: copy.label }}
          idPrefix={`${idPrefix}-${copy.id}`}
        />
      ))}
    </div>
  );
}
