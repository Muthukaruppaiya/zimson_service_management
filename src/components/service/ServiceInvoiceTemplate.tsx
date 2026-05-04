import type { ServiceInvoiceViewModel } from "../../types/serviceInvoice";

type Props = {
  data: ServiceInvoiceViewModel;
  /** Prefix for `id` so multiple instances on a page stay unique. */
  idPrefix?: string;
};

/**
 * Classic GST-style service invoice layout (A4-friendly).
 * Branding strings come from `serviceInvoiceBranding` for now; swap to API-driven props later.
 */
export function ServiceInvoiceTemplate({ data, idPrefix = "inv" }: Props) {
  const rootId = `${idPrefix}-service-invoice-print-root`;

  return (
    <div
      id={rootId}
      className="service-invoice-print-root mx-auto max-w-[210mm] bg-white text-stone-900 shadow-sm print:mx-0 print:max-w-none print:shadow-none"
    >
      <div className="border-2 border-stone-900 p-6 print:border-stone-900 print:p-4">
        {/* Header — common “online” invoice pattern: seller left, document title right */}
        <div className="flex flex-col justify-between gap-6 border-b-2 border-stone-900 pb-5 sm:flex-row sm:items-start">
          <div className="max-w-md space-y-1 text-sm">
            <p className="text-lg font-bold uppercase tracking-tight text-stone-950">{data.seller.legalName}</p>
            {data.seller.addressLines.map((line) => (
              <p key={line} className="text-stone-700">
                {line}
              </p>
            ))}
            <p className="pt-1 font-mono text-xs text-stone-800">
              <span className="font-semibold">GSTIN:</span> {data.seller.gstin}
            </p>
            {data.seller.phone ? (
              <p className="text-xs text-stone-700">
                <span className="font-semibold">Phone:</span> {data.seller.phone}
              </p>
            ) : null}
            {data.seller.email ? (
              <p className="text-xs text-stone-700">
                <span className="font-semibold">Email:</span> {data.seller.email}
              </p>
            ) : null}
          </div>
          <div className="text-right sm:min-w-[200px]">
            <p className="border-2 border-stone-900 px-4 py-2 text-xl font-bold tracking-wide text-stone-950 print:text-lg">
              {data.documentLabel}
            </p>
            <dl className="mt-4 space-y-1 text-xs text-stone-800">
              <div className="flex justify-end gap-2">
                <dt className="font-semibold text-stone-600">Invoice No.</dt>
                <dd className="font-mono font-bold">{data.invoiceNumber}</dd>
              </div>
              <div className="flex justify-end gap-2">
                <dt className="font-semibold text-stone-600">Date</dt>
                <dd>{data.invoiceDate}</dd>
              </div>
              <div className="flex justify-end gap-2">
                <dt className="font-semibold text-stone-600">Place of supply</dt>
                <dd>{data.placeOfSupply}</dd>
              </div>
              <div className="flex justify-end gap-2">
                <dt className="font-semibold text-stone-600">Reverse charge</dt>
                <dd>{data.reverseCharge}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="mt-5 grid gap-5 border-b border-stone-300 pb-5 lg:grid-cols-2">
          <div>
            <p className="mb-2 border-b border-stone-800 pb-1 text-xs font-bold uppercase tracking-wider text-stone-800">
              Bill to
            </p>
            <p className="text-base font-bold text-stone-950">{data.billTo.name}</p>
            {data.billTo.address ? <p className="mt-1 text-sm text-stone-700">{data.billTo.address}</p> : null}
            {data.billTo.phone ? (
              <p className="mt-1 text-xs text-stone-700">
                <span className="font-semibold">Phone:</span> {data.billTo.phone}
              </p>
            ) : null}
            {data.billTo.email ? (
              <p className="text-xs text-stone-700">
                <span className="font-semibold">Email:</span> {data.billTo.email}
              </p>
            ) : null}
            {data.billTo.gstin ? (
              <p className="mt-2 font-mono text-xs">
                <span className="font-semibold">GSTIN:</span> {data.billTo.gstin}
              </p>
            ) : null}
            {data.billTo.pan ? (
              <p className="font-mono text-xs">
                <span className="font-semibold">PAN:</span> {data.billTo.pan}
              </p>
            ) : null}
          </div>
          <div>
            <p className="mb-2 border-b border-stone-800 pb-1 text-xs font-bold uppercase tracking-wider text-stone-800">
              Service details
            </p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              {data.serviceMeta.map((row) => (
                <div key={row.label} className="contents">
                  <dt className="text-stone-500">{row.label}</dt>
                  <dd className="font-medium text-stone-900">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-y-2 border-stone-900 bg-stone-100 text-left text-xs font-bold uppercase tracking-wide text-stone-800 print:bg-stone-200">
                <th className="px-2 py-2">Sl.</th>
                <th className="px-2 py-2">Description of service</th>
                <th className="px-2 py-2">SAC / HSN</th>
                <th className="px-2 py-2 text-right">Amount (INR)</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((ln) => (
                <tr key={ln.slNo} className="border-b border-stone-200">
                  <td className="px-2 py-2 align-top text-stone-600">{ln.slNo}</td>
                  <td className="px-2 py-2 align-top text-stone-900">{ln.description}</td>
                  <td className="px-2 py-2 align-top font-mono text-xs text-stone-700">{ln.hsnSac}</td>
                  <td className="px-2 py-2 text-right font-medium tabular-nums text-stone-900">
                    {ln.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-stone-900 bg-stone-50 font-bold print:bg-stone-100">
                <td colSpan={3} className="px-2 py-3 text-right text-stone-900">
                  Total
                </td>
                <td className="px-2 py-3 text-right text-lg tabular-nums text-stone-950">
                  ₹
                  {data.totalAmount.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {data.paymentMode ? (
          <p className="mt-3 rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-sm font-semibold text-stone-900 print:bg-white">
            Payment mode: <span className="font-bold text-stone-950">{data.paymentMode}</span>
          </p>
        ) : null}

        {data.amountInWordsNote ? (
          <p className="mt-3 border border-dashed border-stone-400 px-3 py-2 text-xs italic text-stone-600">
            {data.amountInWordsNote}
          </p>
        ) : null}

        <div className="mt-5 grid gap-6 lg:grid-cols-2">
          <div className="text-xs text-stone-700">
            {data.bankDetailsLines?.length ? (
              <>
                <p className="mb-1 font-bold uppercase tracking-wide text-stone-800">Bank details</p>
                <ul className="list-inside list-disc space-y-0.5">
                  {data.bankDetailsLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </>
            ) : null}
            {data.notes ? (
              <p className="mt-3">
                <span className="font-semibold text-stone-800">Notes:</span> {data.notes}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col items-end justify-end">
            <div className="mt-8 w-48 border-t border-stone-800 pt-1 text-center text-xs text-stone-600">
              Authorised signatory
            </div>
          </div>
        </div>

        {data.footerTerms?.length ? (
          <div className="mt-6 border-t border-stone-300 pt-3 text-[10px] leading-relaxed text-stone-500">
            {data.footerTerms.map((t) => (
              <p key={t}>{t}</p>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
