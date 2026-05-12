import type { ServiceInvoiceViewModel } from "../../types/serviceInvoice";

type Props = {
  data: ServiceInvoiceViewModel;
  idPrefix?: string;
};

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function ServiceInvoiceTemplate({ data, idPrefix = "inv" }: Props) {
  const rootId = `${idPrefix}-service-invoice-print-root`;
  const pb = data.productBlock;

  return (
    <div
      id={rootId}
      className="service-invoice-print-root mx-auto max-w-[210mm] bg-white text-sm text-stone-900 shadow-sm print:mx-0 print:max-w-none print:text-[9.5pt] print:leading-snug print:shadow-none"
    >
      <div className="border-2 border-stone-900 p-5 print:border print:p-2.5 print:pb-2">
        <div className="flex flex-col justify-between gap-3 border-b-2 border-stone-900 pb-3 print:gap-2 print:border-b print:pb-2 sm:flex-row sm:items-start">
          <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs print:text-[8.5pt] text-stone-800">
            <dt className="font-semibold text-stone-600">Invoice No.</dt>
            <dd className="font-mono font-bold">{data.invoiceNumber}</dd>
            <dt className="font-semibold text-stone-600">Invoice Date</dt>
            <dd>{data.invoiceDate}</dd>
            <dt className="font-semibold text-stone-600">SR No.</dt>
            <dd className="font-mono">{data.serviceReference ?? "—"}</dd>
            <dt className="font-semibold text-stone-600">Invoice type</dt>
            <dd className="font-semibold text-zimson-900">{data.invoiceType ?? "—"}</dd>
          </dl>
          <div className="text-right sm:max-w-[55%]">
            {data.sellerLogoUrl ? (
              <img
                src={data.sellerLogoUrl}
                alt=""
                className="ml-auto mb-1 h-12 max-w-[180px] object-contain print:mb-0.5 print:h-8 print:max-w-[140px]"
              />
            ) : null}
            <p className="text-lg font-bold uppercase tracking-tight text-stone-950 print:text-sm print:leading-tight">
              {data.seller.legalName}
            </p>
            {data.sellerTagline ? (
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-600 print:text-[8pt] print:leading-tight">
                {data.sellerTagline}
              </p>
            ) : null}
            <p className="mt-1.5 border-2 border-stone-900 px-2 py-1 text-sm font-bold print:mt-1 print:border print:px-1.5 print:py-0.5 print:text-[9pt]">
              {data.documentLabel}
            </p>
          </div>
        </div>

        <div className="mt-3 grid gap-3 border-b border-stone-300 pb-3 print:mt-2 print:gap-2 print:pb-2 lg:grid-cols-2">
          <div>
            <p className="mb-0.5 text-xs font-bold uppercase text-stone-700 print:text-[8pt]">Store</p>
            {data.seller.addressLines.map((line) => (
              <p key={line} className="text-stone-800 print:text-[8.5pt] print:leading-snug">
                {line}
              </p>
            ))}
            <p className="mt-0.5 font-mono text-xs print:text-[8pt]">
              <span className="font-semibold">GSTIN:</span> {data.seller.gstin}
            </p>
            {data.seller.phone ? (
              <p className="text-xs print:text-[8pt]">
                <span className="font-semibold">Phone:</span> {data.seller.phone}
              </p>
            ) : null}
            {data.seller.email ? (
              <p className="text-xs print:text-[8pt]">
                <span className="font-semibold">Email:</span> {data.seller.email}
              </p>
            ) : null}
          </div>
          <div>
            <p className="mb-0.5 text-xs font-bold uppercase text-stone-700 print:text-[8pt]">Customer</p>
            <p className="text-base font-bold text-stone-950 print:text-sm print:leading-tight">{data.billTo.name}</p>
            {data.billTo.address ? (
              <p className="mt-0.5 text-stone-800 print:text-[8.5pt] print:leading-snug">{data.billTo.address}</p>
            ) : null}
            {data.billTo.phone ? (
              <p className="mt-0.5 text-xs print:text-[8pt]">
                <span className="font-semibold">Mobile:</span> {data.billTo.phone}
              </p>
            ) : null}
            {data.billTo.email ? (
              <p className="text-xs print:text-[8pt]">
                <span className="font-semibold">Email:</span> {data.billTo.email}
              </p>
            ) : null}
            {data.billTo.gstin ? (
              <p className="mt-0.5 font-mono text-xs print:text-[8pt]">
                <span className="font-semibold">GSTIN:</span> {data.billTo.gstin}
              </p>
            ) : null}
            {data.billTo.pan ? (
              <p className="font-mono text-xs print:text-[8pt]">
                <span className="font-semibold">PAN:</span> {data.billTo.pan}
              </p>
            ) : null}
          </div>
        </div>

        {pb ? (
          <div className="mt-3 grid gap-2 border-b border-stone-300 pb-3 print:mt-2 print:gap-1.5 print:pb-2 sm:grid-cols-2">
            <div className="grid grid-cols-[auto_1fr] gap-x-2 text-xs print:text-[8pt]">
              <span className="text-stone-500">Brand name</span>
              <span className="font-medium">{pb.brandName}</span>
              <span className="text-stone-500">Brand model</span>
              <span className="font-medium">{pb.brandModel}</span>
              <span className="text-stone-500">Brand / model no.</span>
              <span className="font-medium">{pb.modelOrSerial}</span>
              <span className="text-stone-500">Nature of repair</span>
              <span className="font-medium">{pb.natureOfRepair}</span>
            </div>
            {data.serviceMeta.length > 0 ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs print:text-[8pt]">
                {data.serviceMeta.map((row) => (
                  <div key={row.label} className="contents">
                    <dt className="text-stone-500">{row.label}</dt>
                    <dd className="font-medium text-stone-900">{row.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        ) : (
          <div className="mt-3 border-b border-stone-300 pb-3 print:mt-2 print:pb-2">
            <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs print:text-[8pt]">
              {data.serviceMeta.map((row) => (
                <div key={row.label} className="contents">
                  <dt className="text-stone-500">{row.label}</dt>
                  <dd className="font-medium text-stone-900">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        <div className="mt-3 overflow-x-auto print:mt-2">
          <table className="w-full border-collapse text-xs print:text-[8pt]">
            <thead>
              <tr className="border-y-2 border-stone-900 bg-stone-100 text-left font-bold uppercase tracking-wide text-stone-800 print:border-y print:bg-stone-200">
                <th className="px-0.5 py-1 print:py-0.5">S.No</th>
                <th className="px-0.5 py-1 print:py-0.5">Spare code</th>
                <th className="px-0.5 py-1 print:py-0.5">Item name</th>
                <th className="px-0.5 py-1 print:py-0.5">HSN/SAC</th>
                <th className="px-0.5 py-1 print:py-0.5 text-right">Price</th>
                <th className="px-0.5 py-1 print:py-0.5 text-right">Qty</th>
                <th className="px-0.5 py-1 print:py-0.5 text-right">Gross value</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((ln) => (
                <tr key={ln.slNo} className="border-b border-stone-200">
                  <td className="px-0.5 py-1 align-top text-stone-600 print:py-0.5">{ln.slNo}</td>
                  <td className="px-0.5 py-1 align-top font-mono text-[11px] text-stone-700 print:py-0.5 print:text-[7.5pt]">
                    {ln.spareCode ?? "—"}
                  </td>
                  <td className="px-0.5 py-1 align-top text-stone-900 print:py-0.5">{ln.description}</td>
                  <td className="px-0.5 py-1 align-top font-mono text-[11px] print:py-0.5 print:text-[7.5pt]">{ln.hsnSac}</td>
                  <td className="px-0.5 py-1 text-right tabular-nums print:py-0.5">{formatMoney(ln.unitPrice)}</td>
                  <td className="px-0.5 py-1 text-right tabular-nums print:py-0.5">{ln.qty}</td>
                  <td className="px-0.5 py-1 text-right font-medium tabular-nums print:py-0.5">{formatMoney(ln.grossValue)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-stone-900 bg-stone-50 font-semibold print:border-t print:bg-stone-100">
                <td colSpan={4} className="px-0.5 py-1.5 text-right text-stone-900 print:py-1">
                  {data.amountInWords ? (
                    <span className="mb-0.5 block text-[11px] font-normal italic print:text-[7.5pt] print:leading-tight">
                      {data.amountInWords}
                    </span>
                  ) : null}
                  Totals
                </td>
                <td className="px-0.5 py-1.5 text-right tabular-nums print:py-1">
                  {data.totalQty != null ? data.totalQty : "—"}
                </td>
                <td className="px-0.5 py-1.5 print:py-1" />
                <td className="px-0.5 py-1.5 text-right tabular-nums text-stone-950 print:py-1">
                  {formatMoney(data.grossTaxableTotal ?? data.lines.reduce((s, l) => s + l.grossValue, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-2 print:mt-2 print:gap-2">
          <div className="space-y-0.5 text-xs print:text-[8pt]">
            <p>
              <span className="font-semibold">Advance amount:</span> ₹{formatMoney(data.advanceAmount ?? 0)}
            </p>
            {data.paymentMode ? (
              <p>
                <span className="font-semibold">Payment mode:</span> {data.paymentMode}
              </p>
            ) : null}
            <p>
              <span className="font-semibold">Amount paid:</span> ₹{formatMoney(data.amountPaid ?? data.totalAmount)}
            </p>
            <p className="text-stone-600">
              <span className="font-semibold">Payment remarks:</span> {data.paymentRemarks ?? "—"}
            </p>
          </div>
          <div className="space-y-0.5 text-right text-xs print:text-[8pt]">
            <p>
              <span className="font-semibold">Gross amount:</span> ₹{formatMoney(data.grossTaxableTotal ?? 0)}
            </p>
            <p>
              <span className="font-semibold">Tax amount:</span> ₹{formatMoney(data.totalTax ?? 0)}
            </p>
            <p className="text-base font-bold print:text-sm">
              <span className="font-semibold">Net payable:</span> ₹{formatMoney(data.netPayable ?? data.totalAmount)}
            </p>
          </div>
        </div>

        {data.taxBreakdownRows && data.taxBreakdownRows.length > 0 ? (
          <div className="mt-3 overflow-x-auto print:mt-2">
            <table className="w-full border-collapse border border-stone-800 text-xs print:text-[8pt]">
              <thead>
                <tr className="bg-stone-100 font-bold print:bg-stone-200">
                  <th className="border border-stone-700 px-1 py-0.5 text-left print:py-0.5">Tax description</th>
                  <th className="border border-stone-700 px-1 py-0.5 text-right print:py-0.5">Taxable</th>
                  <th className="border border-stone-700 px-1 py-0.5 text-right print:py-0.5">CGST</th>
                  <th className="border border-stone-700 px-1 py-0.5 text-right print:py-0.5">SGST</th>
                  <th className="border border-stone-700 px-1 py-0.5 text-right print:py-0.5">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.taxBreakdownRows.map((r, idx) => (
                  <tr key={`${r.description}-${idx}`}>
                    <td className="border border-stone-300 px-1 py-0.5 print:py-0.5">{r.description}</td>
                    <td className="border border-stone-300 px-1 py-0.5 text-right tabular-nums print:py-0.5">
                      {formatMoney(r.taxable)}
                    </td>
                    <td className="border border-stone-300 px-1 py-0.5 text-right tabular-nums print:py-0.5">
                      {formatMoney(r.cgst)}
                    </td>
                    <td className="border border-stone-300 px-1 py-0.5 text-right tabular-nums print:py-0.5">
                      {formatMoney(r.sgst)}
                    </td>
                    <td className="border border-stone-300 px-1 py-0.5 text-right tabular-nums font-semibold print:py-0.5">
                      {formatMoney(r.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {data.bankDetailsLines?.length ? (
          <div className="mt-3 text-xs text-stone-700 print:mt-2 print:text-[8pt]">
            <p className="font-bold uppercase text-stone-800 print:text-[8pt]">Bank details</p>
            <ul className="list-inside list-disc print:leading-snug">
              {data.bankDetailsLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {data.notes ? (
          <p className="mt-2 text-xs print:mt-1.5 print:text-[8pt]">
            <span className="font-semibold">Notes:</span> {data.notes}
          </p>
        ) : null}

        {data.footerTerms?.length ? (
          <div className="inv-terms mt-3 border-t border-stone-300 pt-2 text-[11px] leading-snug text-stone-700 print:mt-2 print:border-t print:pt-1.5 print:text-[7.5pt] print:leading-tight">
            <p className="mb-0.5 font-bold uppercase text-stone-800 print:text-[8pt]">Terms and conditions</p>
            <ol className="list-decimal space-y-0.5 pl-4 print:space-y-0 print:pl-3">
              {data.footerTerms.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ol>
          </div>
        ) : null}

        <div className="mt-4 flex flex-col justify-between gap-2 border-t border-stone-300 pt-3 text-xs text-stone-700 print:mt-3 print:gap-1.5 print:pt-2 print:text-[8pt] sm:flex-row sm:items-end">
          <div>
            {data.generatedBy ? (
              <p>
                <span className="font-semibold">Invoice generated by:</span> {data.generatedBy}
              </p>
            ) : null}
            {data.invoiceLegalFooter ? (
              <p className="mt-1 font-semibold text-stone-900 print:mt-0.5">For {data.invoiceLegalFooter}</p>
            ) : null}
          </div>
          <div className="w-52 border-t border-stone-800 pt-1 text-center text-stone-600 print:w-44 print:text-[7.5pt]">
            Authorised signatory
          </div>
        </div>

        <p className="mt-2 text-right text-[10px] text-stone-500 print:mt-1 print:text-[8pt]">1 / 1</p>
      </div>
    </div>
  );
}
