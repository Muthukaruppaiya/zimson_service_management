import type { ServiceInvoiceViewModel } from "../../types/serviceInvoice";
import { InvoiceNumberScanCodes } from "./InvoiceNumberScanCodes";

type Props = {
  data: ServiceInvoiceViewModel;
  idPrefix?: string;
};

function fmt(n: number): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Payment mode label → amount label (e.g. "Cash" → "Cash Amount") */
function paymentAmountLabel(mode: string | undefined): string {
  if (!mode) return "Amount Paid";
  const m = mode.trim().toLowerCase();
  if (m === "cash") return "Cash Amount";
  if (m === "upi") return "UPI Amount";
  if (m === "card") return "Card Amount";
  if (m.includes("cheque") || m.includes("check")) return "Cheque Amount";
  if (m.includes("neft") || m.includes("rtgs") || m.includes("bank")) return "Transfer Amount";
  return `${mode} Amount`;
}

export function ServiceInvoiceTemplate({ data, idPrefix = "inv" }: Props) {
  const rootId = `${idPrefix}-service-invoice-print-root`;
  const pb = data.productBlock;

  const FALLBACK_LOGO = "/zimson-logo.png";
  const logoSrc = data.sellerLogoUrl || FALLBACK_LOGO;
  const scanInvoiceNumber = (data.invoiceNumber || data.serviceReference || "").trim();

  return (
    <div
      id={rootId}
      className="service-invoice-print-root mx-auto max-w-[210mm] bg-white text-sm text-stone-900 shadow-sm print:mx-0 print:max-w-none print:text-[9.5pt] print:leading-snug print:shadow-none"
    >
      <div className="border border-stone-400 print:border-stone-600">

        {/* ══ HEADER ═══════════════════════════════════════════════════════ */}
        <div className="flex items-start justify-between gap-4 border-b border-stone-400 px-4 py-3 print:px-3 print:py-2">
          {/* Left — Invoice meta */}
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs print:text-[8pt]">
            <dt className="font-semibold text-stone-600 whitespace-nowrap">Invoice No</dt>
            <dd className="font-mono font-bold text-stone-900">: {data.invoiceNumber}</dd>
            <dt className="font-semibold text-stone-600 whitespace-nowrap">Invoice Date</dt>
            <dd className="text-stone-900">: {data.invoiceDate}</dd>
            {data.serviceReference ? (
              <>
                <dt className="font-semibold text-stone-600 whitespace-nowrap">
                  {data.invoiceType === "Quick Bill" ? "Quick Bill No" : "SR No"}
                </dt>
                <dd className="font-mono text-stone-900">: {data.serviceReference}</dd>
              </>
            ) : null}
            {data.invoiceType ? (
              <>
                <dt className="font-semibold text-stone-600 whitespace-nowrap">Invoice Type</dt>
                <dd className="font-semibold text-stone-900">: {data.invoiceType}</dd>
              </>
            ) : null}
          </dl>

          {/* Right — Logo + invoice barcode / QR */}
          <div className="flex flex-col items-end">
            <img
              src={logoSrc}
              alt="Zimson"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).onerror = null;
                (e.currentTarget as HTMLImageElement).src = FALLBACK_LOGO;
              }}
              className="h-20 w-auto max-w-[220px] object-contain print:h-14 print:max-w-[180px]"
            />
            <InvoiceNumberScanCodes invoiceNumber={scanInvoiceNumber} />
          </div>
        </div>

        {/* ══ STORE + CUSTOMER ════════════════════════════════════════════ */}
        <div className="grid grid-cols-2 border-b border-stone-400 print:border-stone-400">
          {/* Store — left */}
          <div className="border-r border-stone-300 px-4 py-3 print:px-3 print:py-2">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-stone-500 print:text-[7.5pt]">
              Store
            </p>
            <p className="font-bold text-stone-900 print:text-[9pt]">{data.seller.legalName}</p>
            {data.seller.addressLines.map((line) => (
              <p key={line} className="text-xs leading-snug text-stone-700 print:text-[8pt]">{line}</p>
            ))}
            {data.seller.phone ? (
              <p className="mt-0.5 text-xs print:text-[8pt]">
                <span className="font-semibold">PH:</span> {data.seller.phone}
              </p>
            ) : null}
            {data.seller.email ? (
              <p className="text-xs print:text-[8pt]">
                <span className="font-semibold">EMail:</span> {data.seller.email}
              </p>
            ) : null}
            <p className="mt-0.5 text-xs font-mono print:text-[8pt]">
              <span className="font-semibold">GSTIN:</span> {data.seller.gstin}
            </p>
          </div>

          {/* Customer — right (label: value format — all fields always shown) */}
          <div className="px-4 py-3 print:px-3 print:py-2">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-stone-500 print:text-[7.5pt]">
              Customer
            </p>
            <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs print:text-[8pt]">
              <span className="font-semibold text-stone-600 whitespace-nowrap">Customer Name</span>
              <span className="text-stone-900 font-medium">: {data.billTo.name}</span>

              <span className="font-semibold text-stone-600 whitespace-nowrap">Customer ID</span>
              <span className="font-mono text-stone-900">: {data.billTo.customerCode || ""}</span>

              <span className="font-semibold text-stone-600 whitespace-nowrap">Mobile Number</span>
              <span className="text-stone-900">: {data.billTo.phone || ""}</span>

              <span className="font-semibold text-stone-600 whitespace-nowrap">Email ID</span>
              <span className="text-stone-700">: {data.billTo.email || ""}</span>

              <span className="font-semibold text-stone-600 whitespace-nowrap">GSTIN Number</span>
              <span className="font-mono text-stone-900">: {data.billTo.gstin || ""}</span>

              <span className="font-semibold text-stone-600 whitespace-nowrap">Pan Number</span>
              <span className="font-mono text-stone-900">: {data.billTo.pan || ""}</span>

              <span className="font-semibold text-stone-600 whitespace-nowrap">Address</span>
              <span className="text-stone-700">: {data.billTo.address || ""}</span>
            </div>
          </div>
        </div>

        {/* ══ PRODUCT INFORMATION ════════════════════════════════════════ */}
        {pb ? (
          <div className="border-b border-stone-400 px-4 py-3 print:px-3 print:py-2">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-stone-500 print:text-[7.5pt]">
              Product Information
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs print:text-[8pt]">
              {/* Left column */}
              <div className="space-y-0.5">
                <div className="flex gap-2">
                  <span className="w-32 shrink-0 font-semibold text-stone-600">Brand Name</span>
                  <span className="text-stone-900">: {pb.brandName}</span>
                </div>
                <div className="flex gap-2">
                  <span className="w-32 shrink-0 font-semibold text-stone-600">Brand / Model Number</span>
                  <span className="text-stone-900">: {pb.modelOrSerial}</span>
                </div>
                <div className="flex gap-2">
                  <span className="w-32 shrink-0 font-semibold text-stone-600">Nature of Repair</span>
                  <span className="text-stone-900">: {pb.natureOfRepair}</span>
                </div>
              </div>
              {/* Right column — Brand Model */}
              <div className="flex gap-2">
                <span className="w-24 shrink-0 font-semibold text-stone-600">Brand Model</span>
                <span className="text-stone-900">: {pb.brandModel}</span>
              </div>
            </div>
            {/* Extra serviceMeta (SRF complaint etc.) */}
            {data.serviceMeta.length > 0 ? (
              <div className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs print:text-[8pt]">
                {data.serviceMeta.map((row) => (
                  <div key={row.label} className="contents">
                    <span className="font-semibold text-stone-600">{row.label}</span>
                    <span className="text-stone-900">: {row.value}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : data.serviceMeta.length > 0 ? (
          <div className="border-b border-stone-400 px-4 py-3 print:px-3 print:py-2">
            <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs print:text-[8pt]">
              {data.serviceMeta.map((row) => (
                <div key={row.label} className="contents">
                  <span className="font-semibold text-stone-600">{row.label}</span>
                  <span className="text-stone-900">: {row.value}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* ══ ITEMS TABLE ════════════════════════════════════════════════ */}
        <div className="border-b border-stone-400 overflow-x-auto print:overflow-visible">
          <table className="w-full border-collapse text-xs print:text-[8pt]">
            <thead>
              <tr className="border-b border-stone-800 bg-stone-100 text-left font-bold text-stone-800 print:bg-stone-200">
                <th className="px-3 py-2 print:px-2 print:py-1">S.No</th>
                <th className="px-3 py-2 print:px-2 print:py-1">Spare Code</th>
                <th className="px-3 py-2 print:px-2 print:py-1">Item Name</th>
                <th className="px-3 py-2 print:px-2 print:py-1">HSN/ SAC Number</th>
                <th className="px-3 py-2 print:px-2 print:py-1 text-right">Price</th>
                <th className="px-3 py-2 print:px-2 print:py-1 text-right">Quantity</th>
                <th className="px-3 py-2 print:px-2 print:py-1 text-right">Gross Value</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((ln) => (
                <tr key={ln.slNo} className="border-b border-stone-200">
                  <td className="px-3 py-1.5 text-stone-600 print:px-2 print:py-1">{ln.slNo}</td>
                  <td className="px-3 py-1.5 font-mono text-[11px] text-stone-700 print:px-2 print:py-1 print:text-[7.5pt]">
                    {ln.spareCode ?? "—"}
                  </td>
                  <td className="px-3 py-1.5 text-stone-900 print:px-2 print:py-1">{ln.description}</td>
                  <td className="px-3 py-1.5 font-mono text-[11px] print:px-2 print:py-1 print:text-[7.5pt]">{ln.hsnSac}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums print:px-2 print:py-1">{fmt(ln.unitPrice)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums print:px-2 print:py-1">{ln.qty}</td>
                  <td className="px-3 py-1.5 text-right font-medium tabular-nums print:px-2 print:py-1">{fmt(ln.grossValue)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-stone-800 font-semibold bg-stone-50">
                <td colSpan={5} className="px-3 py-1.5 text-stone-700 print:px-2 print:py-1">
                  {data.amountInWords ? (
                    <span className="block text-[11px] font-normal italic print:text-[7.5pt]">
                      {data.amountInWords}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums print:px-2 print:py-1">
                  {data.totalQty != null ? data.totalQty : ""}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums font-bold text-stone-950 print:px-2 print:py-1">
                  {fmt(data.grossTaxableTotal ?? data.lines.reduce((s, l) => s + l.grossValue, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ══ PAYMENT + TOTALS ═══════════════════════════════════════════ */}
        <div className="grid grid-cols-2 border-b border-stone-400">
          {/* Left — Payment modes */}
          <div className="border-r border-stone-300 px-4 py-3 print:px-3 print:py-2">
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-stone-500 print:text-[7.5pt]">
              Payment Modes
            </p>
            <div className="space-y-0.5 text-xs print:text-[8pt]">
              <div className="flex gap-2">
                <span className="w-36 shrink-0 font-semibold text-stone-600">Advance Amount</span>
                <span>: {fmt(data.advanceAmount ?? 0)}</span>
              </div>
              {data.paymentSplits && data.paymentSplits.length > 0 ? (
                data.paymentSplits.map((split) => (
                  <div key={split.mode} className="flex gap-2">
                    <span className="w-36 shrink-0 font-semibold text-stone-600">{split.mode}</span>
                    <span className="tabular-nums">
                      : {fmt(split.amountInr)}
                      {split.reference?.trim() ? (
                        <span className="ml-1 font-normal text-stone-600">({split.reference.trim()})</span>
                      ) : null}
                    </span>
                  </div>
                ))
              ) : data.paymentMode ? (
                <div className="flex gap-2 font-semibold">
                  <span className="w-36 shrink-0 text-stone-600">{data.paymentMode} Payment</span>
                  <span>: {fmt((data.amountPaid ?? data.totalAmount) - (data.advanceAmount ?? 0))}</span>
                </div>
              ) : null}
              <div className="flex gap-2">
                <span className="w-36 shrink-0 font-semibold text-stone-600">
                  {data.paymentSplits?.length ? "Total paid" : paymentAmountLabel(data.paymentMode)}
                </span>
                <span>: {fmt(data.amountPaid ?? data.totalAmount)}</span>
              </div>
              {data.notes ? (
                <p className="mt-1 text-stone-600 italic print:text-[7.5pt]">
                  Remarks: {data.notes}
                </p>
              ) : null}
            </div>
          </div>

          {/* Right — Gross / Tax / Net */}
          <div className="flex flex-col items-end justify-end px-4 py-3 text-xs print:px-3 print:py-2 print:text-[8pt]">
            <div className="w-full space-y-0.5">
              <div className="flex justify-between gap-4">
                <span className="font-semibold text-stone-600">Gross Amount</span>
                <span className="tabular-nums">₹ {fmt(data.grossTaxableTotal ?? 0)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="font-semibold text-stone-600">Tax Amount</span>
                <span className="tabular-nums">₹ {fmt(data.totalTax ?? 0)}</span>
              </div>
              <div className="flex justify-between gap-4 border-t border-stone-400 pt-1 font-bold text-sm print:text-[9pt]">
                <span className="text-stone-900">Net Payable</span>
                <span className="tabular-nums text-stone-950">₹ {fmt(data.netPayable ?? data.totalAmount)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ══ TAX BREAKDOWN ══════════════════════════════════════════════ */}
        {data.taxBreakdownRows && data.taxBreakdownRows.length > 0 ? (
          <div className="border-b border-stone-400 px-4 py-3 print:px-3 print:py-2">
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-stone-500 print:text-[7.5pt]">
              Payment Remarks
            </p>
            <table className="w-full border-collapse border border-stone-700 text-xs print:text-[8pt]">
              <thead>
                <tr className="bg-stone-100 font-bold print:bg-stone-200">
                  <th className="border border-stone-600 px-2 py-1 text-left print:py-0.5">Tax Description</th>
                  <th className="border border-stone-600 px-2 py-1 text-right print:py-0.5">Taxable Amount</th>
                  <th className="border border-stone-600 px-2 py-1 text-right print:py-0.5">CGST</th>
                  <th className="border border-stone-600 px-2 py-1 text-right print:py-0.5">SGST</th>
                  <th className="border border-stone-600 px-2 py-1 text-right print:py-0.5">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.taxBreakdownRows.map((r, idx) => (
                  <tr key={`${r.description}-${idx}`}>
                    <td className="border border-stone-300 px-2 py-0.5">{r.description}</td>
                    <td className="border border-stone-300 px-2 py-0.5 text-right tabular-nums">{fmt(r.taxable)}</td>
                    <td className="border border-stone-300 px-2 py-0.5 text-right tabular-nums">{fmt(r.cgst)}</td>
                    <td className="border border-stone-300 px-2 py-0.5 text-right tabular-nums">{fmt(r.sgst)}</td>
                    <td className="border border-stone-300 px-2 py-0.5 text-right tabular-nums font-semibold">{fmt(r.total)}</td>
                  </tr>
                ))}
                <tr className="font-bold bg-stone-50">
                  <td className="border border-stone-400 px-2 py-0.5">Total</td>
                  <td className="border border-stone-400 px-2 py-0.5 text-right tabular-nums">
                    {fmt(data.taxBreakdownRows.reduce((s, r) => s + r.taxable, 0))}
                  </td>
                  <td className="border border-stone-400 px-2 py-0.5 text-right tabular-nums">
                    {fmt(data.taxBreakdownRows.reduce((s, r) => s + r.cgst, 0))}
                  </td>
                  <td className="border border-stone-400 px-2 py-0.5 text-right tabular-nums">
                    {fmt(data.taxBreakdownRows.reduce((s, r) => s + r.sgst, 0))}
                  </td>
                  <td className="border border-stone-400 px-2 py-0.5 text-right tabular-nums">
                    {fmt(data.taxBreakdownRows.reduce((s, r) => s + r.total, 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : null}

        {/* ══ TERMS AND CONDITIONS ═══════════════════════════════════════ */}
        {data.footerTerms && data.footerTerms.length > 0 ? (
          <div className="inv-terms border-b border-stone-400 px-4 py-3 print:px-3 print:py-2">
            <p className="mb-1.5 font-bold uppercase tracking-wide text-stone-800 print:text-[8pt]">
              Terms and Conditions
            </p>
            <ol className="list-decimal space-y-0.5 pl-4 text-[11px] leading-snug text-stone-700 print:space-y-0 print:pl-3 print:text-[7.5pt] print:leading-tight">
              {data.footerTerms.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ol>
          </div>
        ) : null}

        {/* ══ FOOTER ════════════════════════════════════════════════════ */}
        <div className="flex items-end justify-between gap-4 px-4 py-3 text-xs text-stone-700 print:px-3 print:py-2 print:text-[8pt]">
          <div>
            {data.generatedBy ? (
              <p>
                <span className="font-semibold">Invoice generated by:</span> {data.generatedBy}
              </p>
            ) : null}
            {data.invoiceLegalFooter ? (
              <p className="mt-1 font-bold text-stone-900 print:mt-0.5">
                For {data.invoiceLegalFooter}
              </p>
            ) : null}
          </div>
          <div className="text-center">
            <div className="mb-1 h-8 print:h-6" />
            <div className="border-t border-stone-700 pt-1 text-xs text-stone-600 print:text-[7.5pt]">
              Authorised Signatory
            </div>
          </div>
        </div>

        {/* Computer generated note */}
        <div className="border-t border-stone-200 px-4 pb-2 pt-1 text-[9px] text-stone-400 print:text-[7pt]">
          This is a computer-generated document. Signature may not be required subject to company policy.
          Subject to jurisdiction at Chennai, Tamil Nadu, E. &amp; O.E.
        </div>

      </div>
    </div>
  );
}
