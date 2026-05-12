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
      className="service-invoice-print-root mx-auto max-w-[210mm] bg-white text-stone-900 shadow-sm print:mx-0 print:max-w-none print:shadow-none"
    >
      <div className="border-2 border-stone-900 p-5 text-sm print:border-stone-900 print:p-4">
        <div className="flex flex-col justify-between gap-4 border-b-2 border-stone-900 pb-4 sm:flex-row sm:items-start">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-stone-800">
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
                className="ml-auto mb-2 h-12 max-w-[180px] object-contain print:h-10"
              />
            ) : null}
            <p className="text-lg font-bold uppercase tracking-tight text-stone-950">{data.seller.legalName}</p>
            {data.sellerTagline ? (
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-600">{data.sellerTagline}</p>
            ) : null}
            <p className="mt-2 border-2 border-stone-900 px-3 py-1.5 text-sm font-bold print:text-xs">{data.documentLabel}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 border-b border-stone-300 pb-4 lg:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-bold uppercase text-stone-700">Store</p>
            {data.seller.addressLines.map((line) => (
              <p key={line} className="text-stone-800">
                {line}
              </p>
            ))}
            <p className="mt-1 font-mono text-xs">
              <span className="font-semibold">GSTIN:</span> {data.seller.gstin}
            </p>
            {data.seller.phone ? (
              <p className="text-xs">
                <span className="font-semibold">Phone:</span> {data.seller.phone}
              </p>
            ) : null}
            {data.seller.email ? (
              <p className="text-xs">
                <span className="font-semibold">Email:</span> {data.seller.email}
              </p>
            ) : null}
          </div>
          <div>
            <p className="mb-1 text-xs font-bold uppercase text-stone-700">Customer</p>
            <p className="text-base font-bold text-stone-950">{data.billTo.name}</p>
            {data.billTo.address ? <p className="mt-1 text-stone-800">{data.billTo.address}</p> : null}
            {data.billTo.phone ? (
              <p className="mt-1 text-xs">
                <span className="font-semibold">Mobile:</span> {data.billTo.phone}
              </p>
            ) : null}
            {data.billTo.email ? (
              <p className="text-xs">
                <span className="font-semibold">Email:</span> {data.billTo.email}
              </p>
            ) : null}
            {data.billTo.gstin ? (
              <p className="mt-1 font-mono text-xs">
                <span className="font-semibold">GSTIN:</span> {data.billTo.gstin}
              </p>
            ) : null}
            {data.billTo.pan ? (
              <p className="font-mono text-xs">
                <span className="font-semibold">PAN:</span> {data.billTo.pan}
              </p>
            ) : null}
          </div>
        </div>

        {pb ? (
          <div className="mt-4 grid gap-2 border-b border-stone-300 pb-4 sm:grid-cols-2">
            <div className="grid grid-cols-[auto_1fr] gap-x-2 text-xs">
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
              <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xs">
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
          <div className="mt-4 border-b border-stone-300 pb-4">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              {data.serviceMeta.map((row) => (
                <div key={row.label} className="contents">
                  <dt className="text-stone-500">{row.label}</dt>
                  <dd className="font-medium text-stone-900">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-y-2 border-stone-900 bg-stone-100 text-left font-bold uppercase tracking-wide text-stone-800 print:bg-stone-200">
                <th className="px-1 py-2">S.No</th>
                <th className="px-1 py-2">Spare code</th>
                <th className="px-1 py-2">Item name</th>
                <th className="px-1 py-2">HSN/SAC</th>
                <th className="px-1 py-2 text-right">Price</th>
                <th className="px-1 py-2 text-right">Qty</th>
                <th className="px-1 py-2 text-right">Gross value</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((ln) => (
                <tr key={ln.slNo} className="border-b border-stone-200">
                  <td className="px-1 py-1.5 align-top text-stone-600">{ln.slNo}</td>
                  <td className="px-1 py-1.5 align-top font-mono text-[11px] text-stone-700">{ln.spareCode ?? "—"}</td>
                  <td className="px-1 py-1.5 align-top text-stone-900">{ln.description}</td>
                  <td className="px-1 py-1.5 align-top font-mono text-[11px]">{ln.hsnSac}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums">{formatMoney(ln.unitPrice)}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums">{ln.qty}</td>
                  <td className="px-1 py-1.5 text-right font-medium tabular-nums">{formatMoney(ln.grossValue)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-stone-900 bg-stone-50 font-semibold print:bg-stone-100">
                <td colSpan={4} className="px-1 py-2 text-right text-stone-900">
                  {data.amountInWords ? (
                    <span className="mb-1 block text-[11px] font-normal italic">{data.amountInWords}</span>
                  ) : null}
                  Totals
                </td>
                <td className="px-1 py-2 text-right tabular-nums">{data.totalQty != null ? data.totalQty : "—"}</td>
                <td className="px-1 py-2" />
                <td className="px-1 py-2 text-right tabular-nums text-stone-950">
                  {formatMoney(data.grossTaxableTotal ?? data.lines.reduce((s, l) => s + l.grossValue, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="space-y-1 text-xs">
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
          <div className="space-y-1 text-right text-xs">
            <p>
              <span className="font-semibold">Gross amount:</span> ₹{formatMoney(data.grossTaxableTotal ?? 0)}
            </p>
            <p>
              <span className="font-semibold">Tax amount:</span> ₹{formatMoney(data.totalTax ?? 0)}
            </p>
            <p className="text-base font-bold">
              <span className="font-semibold">Net payable:</span> ₹{formatMoney(data.netPayable ?? data.totalAmount)}
            </p>
          </div>
        </div>

        {data.taxBreakdownRows && data.taxBreakdownRows.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse border border-stone-800 text-xs">
              <thead>
                <tr className="bg-stone-100 font-bold print:bg-stone-200">
                  <th className="border border-stone-700 px-2 py-1 text-left">Tax description</th>
                  <th className="border border-stone-700 px-2 py-1 text-right">Taxable</th>
                  <th className="border border-stone-700 px-2 py-1 text-right">CGST</th>
                  <th className="border border-stone-700 px-2 py-1 text-right">SGST</th>
                  <th className="border border-stone-700 px-2 py-1 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.taxBreakdownRows.map((r, idx) => (
                  <tr key={`${r.description}-${idx}`}>
                    <td className="border border-stone-300 px-2 py-1">{r.description}</td>
                    <td className="border border-stone-300 px-2 py-1 text-right tabular-nums">{formatMoney(r.taxable)}</td>
                    <td className="border border-stone-300 px-2 py-1 text-right tabular-nums">{formatMoney(r.cgst)}</td>
                    <td className="border border-stone-300 px-2 py-1 text-right tabular-nums">{formatMoney(r.sgst)}</td>
                    <td className="border border-stone-300 px-2 py-1 text-right tabular-nums font-semibold">{formatMoney(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {data.bankDetailsLines?.length ? (
          <div className="mt-4 text-xs text-stone-700">
            <p className="font-bold uppercase text-stone-800">Bank details</p>
            <ul className="list-inside list-disc">
              {data.bankDetailsLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {data.notes ? (
          <p className="mt-3 text-xs">
            <span className="font-semibold">Notes:</span> {data.notes}
          </p>
        ) : null}

        {data.footerTerms?.length ? (
          <div className="mt-5 border-t border-stone-300 pt-3 text-[11px] leading-relaxed text-stone-700">
            <p className="mb-1 font-bold uppercase text-stone-800">Terms and conditions</p>
            <ol className="list-decimal space-y-1 pl-5">
              {data.footerTerms.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ol>
          </div>
        ) : null}

        <div className="mt-8 flex flex-col justify-between gap-4 border-t border-stone-300 pt-4 text-xs text-stone-700 sm:flex-row sm:items-end">
          <div>
            {data.generatedBy ? (
              <p>
                <span className="font-semibold">Invoice generated by:</span> {data.generatedBy}
              </p>
            ) : null}
            {data.invoiceLegalFooter ? (
              <p className="mt-2 font-semibold text-stone-900">For {data.invoiceLegalFooter}</p>
            ) : null}
          </div>
          <div className="w-52 border-t border-stone-800 pt-1 text-center text-stone-600">Authorised signatory</div>
        </div>

        <p className="mt-4 text-right text-[10px] text-stone-500 print:text-[9px]">1 / 1</p>
      </div>
    </div>
  );
}
