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

/** Strip leading "1." / "1)" so <ol> does not show "1. 1." */
function normalizeTermLine(text: string): string {
  return text.replace(/^\s*\d+[\).\]:-]+\s*/, "").trim();
}

export function ServiceInvoiceTemplate({ data, idPrefix = "inv" }: Props) {
  const rootId = `${idPrefix}-service-invoice-print-root`;
  const pb = data.productBlock;

  const FALLBACK_LOGO = "/zimson-logo.png";
  const logoSrc = data.sellerLogoUrl || FALLBACK_LOGO;
  const scanInvoiceNumber = (data.invoiceNumber || data.serviceReference || "").trim();
  const grossTotal =
    data.grossTaxableTotal ?? data.lines.reduce((s, l) => s + l.grossValue, 0);

  return (
    <div
      id={rootId}
      className="service-invoice-print-root inv-doc"
    >
      <div className="inv-sheet">
        {/* Document banner */}
        <div className="inv-banner">
          <div className="inv-banner-title">{data.documentLabel?.trim() || "TAX INVOICE"}</div>
          <div className="inv-banner-sub">
            <div>{data.invoiceType || "Tax Invoice"}</div>
            {data.placeOfSupply ? <div>Place of supply: {data.placeOfSupply}</div> : null}
          </div>
        </div>

        {/* Header: meta | barcode | logo */}
        <div className="inv-top-row">
          <div className="inv-top-cell" style={{ width: "32%" }}>
            <div className="inv-meta-box">
              <table>
                <tbody>
                  <tr>
                    <td className="inv-meta-label">Invoice No</td>
                    <td className="inv-meta-value mono">: {data.invoiceNumber}</td>
                  </tr>
                  <tr>
                    <td className="inv-meta-label">Invoice Date</td>
                    <td className="inv-meta-value">: {data.invoiceDate}</td>
                  </tr>
                  {data.serviceReference ? (
                    <tr>
                      <td className="inv-meta-label">
                        {data.invoiceType === "Quick Bill" ? "Quick Bill No" : "SR No"}
                      </td>
                      <td className="inv-meta-value mono">: {data.serviceReference}</td>
                    </tr>
                  ) : null}
                  {data.invoiceType ? (
                    <tr>
                      <td className="inv-meta-label">Invoice Type</td>
                      <td className="inv-meta-value">: {data.invoiceType}</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
          <div className="inv-top-cell inv-barcode-wrap" style={{ width: "36%" }}>
            <InvoiceNumberScanCodes invoiceNumber={scanInvoiceNumber} className="mt-0 shrink-0" />
          </div>
          <div className="inv-top-cell inv-logo-wrap" style={{ width: "32%" }}>
            <img
              src={logoSrc}
              alt="Zimson"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).onerror = null;
                (e.currentTarget as HTMLImageElement).src = FALLBACK_LOGO;
              }}
            />
          </div>
        </div>

        {/* Bill From / Bill To */}
        <div className="inv-party-grid">
          <div className="inv-party-col">
            <div className="inv-section-head">Bill From (Seller)</div>
            <div className="inv-party-body">
              <p style={{ fontWeight: 700, margin: "0 0 4px" }}>{data.seller.legalName}</p>
              {data.seller.addressLines.map((line) => (
                <p key={line} style={{ margin: "0 0 2px" }}>
                  {line}
                </p>
              ))}
              {data.seller.phone ? (
                <p style={{ margin: "4px 0 0" }}>
                  <strong>PH:</strong> {data.seller.phone}
                </p>
              ) : null}
              {data.seller.email ? (
                <p style={{ margin: 0 }}>
                  <strong>EMail:</strong> {data.seller.email}
                </p>
              ) : null}
              <p style={{ margin: "4px 0 0" }}>
                <strong>GSTIN:</strong>{" "}
                <span className="mono" style={{ fontFamily: "Consolas, monospace" }}>
                  {data.seller.gstin}
                </span>
              </p>
            </div>
          </div>
          <div className="inv-party-col">
            <div className="inv-section-head">Bill To (Customer)</div>
            <div className="inv-party-body">
              <table className="inv-field-table">
                <tbody>
                  <tr>
                    <td className="inv-field-label">Customer Name</td>
                    <td className="inv-field-value">: {data.billTo.name}</td>
                  </tr>
                  <tr>
                    <td className="inv-field-label">Customer ID</td>
                    <td className="inv-field-value mono">: {data.billTo.customerCode || "—"}</td>
                  </tr>
                  <tr>
                    <td className="inv-field-label">Mobile Number</td>
                    <td className="inv-field-value">: {data.billTo.phone || "—"}</td>
                  </tr>
                  <tr>
                    <td className="inv-field-label">Email ID</td>
                    <td className="inv-field-value">: {data.billTo.email || "—"}</td>
                  </tr>
                  <tr>
                    <td className="inv-field-label">GSTIN Number</td>
                    <td className="inv-field-value mono">: {data.billTo.gstin || "—"}</td>
                  </tr>
                  <tr>
                    <td className="inv-field-label">Pan Number</td>
                    <td className="inv-field-value mono">: {data.billTo.pan || "—"}</td>
                  </tr>
                  <tr>
                    <td className="inv-field-label">Billing Address</td>
                    <td className="inv-field-value">: {data.billTo.address || "—"}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Product information */}
        {pb ? (
          <div className="inv-product-panel">
            <div className="inv-section-head" style={{ margin: "0 -10px 8px", borderTop: "none" }}>
              Product Information
            </div>
            <table className="inv-field-table inv-product-fields">
              <colgroup>
                <col className="inv-col-label" />
                <col className="inv-col-value" />
                <col className="inv-col-label" />
                <col className="inv-col-value" />
              </colgroup>
              <tbody>
                <tr>
                  <td className="inv-field-label">Brand Name</td>
                  <td className="inv-field-value">: {pb.brandName}</td>
                  <td className="inv-field-label">Brand Model</td>
                  <td className="inv-field-value">: {pb.brandModel}</td>
                </tr>
                <tr>
                  <td className="inv-field-label">Brand / Model Number</td>
                  <td className="inv-field-value">: {pb.modelOrSerial}</td>
                  <td className="inv-field-label">Nature of Repair</td>
                  <td className="inv-field-value">: {pb.natureOfRepair}</td>
                </tr>
              </tbody>
            </table>
            {data.serviceMeta.length > 0 ? (
              <table className="inv-field-table" style={{ marginTop: 6 }}>
                <tbody>
                  {data.serviceMeta.map((row) => (
                    <tr key={row.label}>
                      <td className="inv-field-label">{row.label}</td>
                      <td className="inv-field-value" colSpan={3}>
                        : {row.value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
        ) : data.serviceMeta.length > 0 ? (
          <div className="inv-product-panel">
            <table className="inv-field-table">
              <tbody>
                {data.serviceMeta.map((row) => (
                  <tr key={row.label}>
                    <td className="inv-field-label">{row.label}</td>
                    <td className="inv-field-value">: {row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {/* Line items */}
        <table className="inv-items-table">
          <thead>
            <tr>
              <th>S.No</th>
              <th>Spare Code</th>
              <th>Item Name</th>
              <th>HSN/SAC Number</th>
              <th className="num">Price</th>
              <th className="num">Quantity</th>
              <th className="num">Gross Value</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((ln) => (
              <tr key={ln.slNo}>
                <td>{ln.slNo}</td>
                <td className="mono" style={{ fontFamily: "Consolas, monospace" }}>
                  {ln.spareCode ?? "—"}
                </td>
                <td>{ln.description}</td>
                <td className="mono" style={{ fontFamily: "Consolas, monospace" }}>
                  {ln.hsnSac}
                </td>
                <td className="num">{fmt(ln.unitPrice)}</td>
                <td className="num">{ln.qty}</td>
                <td className="num">{fmt(ln.grossValue)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5}>
                {data.amountInWords ? (
                  <span className="inv-amount-words">{data.amountInWords}</span>
                ) : null}
              </td>
              <td className="num">{data.totalQty != null ? data.totalQty : ""}</td>
              <td className="num">{fmt(grossTotal)}</td>
            </tr>
          </tfoot>
        </table>

        {/* Payment + totals */}
        <div className="inv-bottom-grid">
          <div className="inv-bottom-col" style={{ width: "50%" }}>
            <div className="inv-section-head" style={{ margin: "-10px -10px 8px", borderTop: "none" }}>
              Payment Modes
            </div>
            <table className="inv-pay-table">
              <tbody>
                <tr>
                  <td className="inv-pay-label">Advance Amount</td>
                  <td className="inv-pay-value">{fmt(data.advanceAmount ?? 0)}</td>
                </tr>
            {data.paymentSplits && data.paymentSplits.length > 0
              ? data.paymentSplits.map((split) => (
                      <tr key={split.mode}>
                        <td className="inv-pay-label">{split.mode}</td>
                        <td className="inv-pay-value">
                          {fmt(split.amountInr)}
                          {split.reference?.trim() ? ` (${split.reference.trim()})` : ""}
                        </td>
                      </tr>
                ))
              : data.paymentMode
                ? (
                        <tr>
                          <td className="inv-pay-label">{data.paymentMode} Payment</td>
                          <td className="inv-pay-value">
                            {fmt((data.amountPaid ?? data.totalAmount) - (data.advanceAmount ?? 0))}
                          </td>
                        </tr>
                  )
                : null}
                <tr>
                  <td className="inv-pay-label">
                    {data.paymentSplits?.length ? "Total paid" : paymentAmountLabel(data.paymentMode)}
                  </td>
                  <td className="inv-pay-value">{fmt(data.amountPaid ?? data.totalAmount)}</td>
                </tr>
              </tbody>
            </table>
            {data.notes ? (
              <p style={{ marginTop: 8, fontStyle: "italic", color: "#4a5568" }}>
                Remarks: {data.notes}
              </p>
            ) : null}
          </div>
          <div className="inv-bottom-col" style={{ width: "50%" }}>
            <div className="inv-totals-box">
              <table className="inv-totals-table">
                <tbody>
                  <tr>
                    <td className="inv-total-label">Gross Amount</td>
                    <td className="inv-total-value">₹ {fmt(data.grossTaxableTotal ?? 0)}</td>
                  </tr>
                  <tr>
                    <td className="inv-total-label">Tax Amount</td>
                    <td className="inv-total-value">₹ {fmt(data.totalTax ?? 0)}</td>
                  </tr>
                </tbody>
              </table>
              <table className="inv-net-box">
                <tbody>
                  <tr>
                    <td>Net Payable</td>
                    <td>₹ {fmt(data.netPayable ?? data.totalAmount)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Tax breakdown */}
        {data.taxBreakdownRows && data.taxBreakdownRows.length > 0 ? (
          <div className="inv-product-panel">
            <div className="inv-section-head" style={{ margin: "0 -10px 8px", borderTop: "none" }}>
              Tax Summary
            </div>
            {(() => {
              const rows = data.taxBreakdownRows;
              const showIgst = rows.some((r) => r.igst > 0);
              const showCgstSgst = rows.some((r) => r.cgst > 0 || r.sgst > 0);
              return (
                <table className="inv-tax-table">
                  <thead>
                    <tr>
                      <th>Tax Description</th>
                      <th style={{ textAlign: "right" }}>Taxable Amount</th>
                      {showCgstSgst ? <th style={{ textAlign: "right" }}>CGST</th> : null}
                      {showCgstSgst ? <th style={{ textAlign: "right" }}>SGST</th> : null}
                      {showIgst ? <th style={{ textAlign: "right" }}>IGST</th> : null}
                      <th style={{ textAlign: "right" }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, idx) => (
                      <tr key={`${r.description}-${idx}`}>
                        <td>{r.description}</td>
                        <td style={{ textAlign: "right" }}>{fmt(r.taxable)}</td>
                        {showCgstSgst ? <td style={{ textAlign: "right" }}>{fmt(r.cgst)}</td> : null}
                        {showCgstSgst ? <td style={{ textAlign: "right" }}>{fmt(r.sgst)}</td> : null}
                        {showIgst ? <td style={{ textAlign: "right" }}>{fmt(r.igst)}</td> : null}
                        <td style={{ textAlign: "right", fontWeight: 600 }}>{fmt(r.total)}</td>
                      </tr>
                    ))}
                    <tr style={{ fontWeight: 700, background: "#e8edf8" }}>
                      <td>Total</td>
                      <td style={{ textAlign: "right" }}>
                        {fmt(rows.reduce((s, r) => s + r.taxable, 0))}
                      </td>
                      {showCgstSgst ? (
                        <td style={{ textAlign: "right" }}>{fmt(rows.reduce((s, r) => s + r.cgst, 0))}</td>
                      ) : null}
                      {showCgstSgst ? (
                        <td style={{ textAlign: "right" }}>{fmt(rows.reduce((s, r) => s + r.sgst, 0))}</td>
                      ) : null}
                      {showIgst ? (
                        <td style={{ textAlign: "right" }}>{fmt(rows.reduce((s, r) => s + r.igst, 0))}</td>
                      ) : null}
                      <td style={{ textAlign: "right" }}>{fmt(rows.reduce((s, r) => s + r.total, 0))}</td>
                    </tr>
                  </tbody>
                </table>
              );
            })()}
          </div>
        ) : null}

        {/* Terms */}
        {data.footerTerms && data.footerTerms.length > 0 ? (
          <div className="inv-terms">
            <div className="inv-terms-title">Terms and Conditions</div>
            <ol>
              {data.footerTerms.map((t, i) => (
                <li key={i}>{normalizeTermLine(t)}</li>
              ))}
            </ol>
          </div>
        ) : null}

        {/* Footer */}
        <div className="inv-footer">
          <div className="inv-footer-left">
            {data.generatedBy ? (
              <p style={{ margin: 0 }}>
                <strong>Invoice generated by:</strong> {data.generatedBy}
              </p>
            ) : null}
            {data.invoiceLegalFooter ? (
              <p style={{ margin: "6px 0 0", fontWeight: 700 }}>
                For {data.invoiceLegalFooter}
              </p>
            ) : null}
          </div>
          <div className="inv-footer-right">
            <div className="inv-sign-line">Authorised Signatory</div>
          </div>
        </div>

        <div className="inv-footnote">
          This is a computer-generated document. Signature may not be required subject to company
          policy. Subject to jurisdiction at Chennai, Tamil Nadu, E. &amp; O.E.
        </div>
      </div>
    </div>
  );
}
