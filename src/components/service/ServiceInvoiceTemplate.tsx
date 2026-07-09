import type { ServiceInvoiceViewModel } from "../../types/serviceInvoice";
import { EinvoiceSignedQr } from "./EinvoiceSignedQr";
import { InvoiceNumberScanCodes } from "./InvoiceNumberScanCodes";

type Props = {
  data: ServiceInvoiceViewModel;
  idPrefix?: string;
};

function fmt(n: number): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtSigned(n: number): string {
  const abs = Math.abs(n);
  const body = abs.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n < 0) return `-${body}`;
  if (n > 0) return `+${body}`;
  return body;
}

/** Strip leading list markers so <ol> does not show "1. 1." / "2. 2." */
function normalizeTermLine(text: string): string {
  return text
    .replace(/^\s*\d+[\).\]:-]+\s*/, "")
    .replace(/^\s*\d+\s+/, "")
    .trim();
}

/** Two explicit columns — html2canvas/PDF cannot reliably render CSS column-count. */
function TermsColumns({ terms }: { terms: string[] }) {
  const lines = terms.map(normalizeTermLine).filter(Boolean);
  if (lines.length === 0) return null;
  const splitAt = Math.ceil(lines.length / 2);
  const colA = lines.slice(0, splitAt);
  const colB = lines.slice(splitAt);
  return (
    <div className="inv-terms-columns">
      <ol className="inv-terms-col">
        {colA.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ol>
      {colB.length > 0 ? (
        <ol className="inv-terms-col" start={splitAt + 1}>
          {colB.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ol>
      ) : (
        <div className="inv-terms-col inv-terms-col--empty" aria-hidden />
      )}
    </div>
  );
}

function buildProductInfoRows(
  pb: ServiceInvoiceViewModel["productBlock"],
  serviceMeta: ServiceInvoiceViewModel["serviceMeta"],
): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  const seen = new Set<string>();
  const push = (label: string, value: string) => {
    const key = label.trim().toLowerCase();
    if (seen.has(key)) return;
    const v = String(value ?? "").trim();
    if (!v) return;
    seen.add(key);
    rows.push({ label, value: v });
  };
  if (pb) {
    push("Brand Name", pb.brandName);
    push("Brand Model", pb.brandModel);
    push("Brand / Model Number", pb.modelOrSerial);
    push("Nature of Repair", pb.natureOfRepair);
  }
  for (const row of serviceMeta) {
    push(row.label, row.value);
  }
  return rows;
}

function pairMetaRows(rows: { label: string; value: string }[]): { label: string; value: string }[][] {
  const pairs: { label: string; value: string }[][] = [];
  for (let i = 0; i < rows.length; i += 2) {
    pairs.push(rows.slice(i, i + 2));
  }
  return pairs;
}

function ProductInfoTable({ rows }: { rows: { label: string; value: string }[] }) {
  if (rows.length === 0) return null;
  return (
    <table className="inv-field-table inv-product-table inv-bill-to-table">
      <colgroup>
        <col className="inv-col-label" />
        <col className="inv-col-value" />
        <col className="inv-col-label" />
        <col className="inv-col-value" />
      </colgroup>
      <tbody>
        {pairMetaRows(rows).map((pair, idx) => (
          <tr key={`${pair[0]?.label ?? idx}-${pair[1]?.label ?? ""}`}>
            <td className="inv-field-label">{pair[0]?.label ?? ""}</td>
            <td className="inv-field-value">{pair[0]?.value ?? ""}</td>
            <td className="inv-field-label">{pair[1]?.label ?? ""}</td>
            <td className="inv-field-value">{pair[1]?.value ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ServiceInvoiceTemplate({ data, idPrefix = "inv" }: Props) {
  const rootId = `${idPrefix}-service-invoice-print-root`;
  const pb = data.productBlock;
  const productInfoRows = buildProductInfoRows(pb, data.serviceMeta);
  const isQuickBill = data.invoiceType === "Quick Bill";
  const isB2cCustomer = !String(data.billTo.gstin ?? "").trim();
  const hasEinvoiceQr = Boolean(data.irn || data.einvoiceQr);

  const FALLBACK_LOGO = "/zimson-logo.png";
  const logoSrc = data.sellerLogoUrl || FALLBACK_LOGO;
  const scanInvoiceNumber = (data.invoiceNumber || data.serviceReference || "").trim();
  const grossTotal =
    data.grossTaxableTotal ?? data.lines.reduce((s, l) => s + l.grossValue, 0);

  return (
    <div
      id={rootId}
      className={`service-invoice-print-root inv-doc${isQuickBill ? " inv-quick-bill" : ""}`}
      data-expect-einvoice-qr={data.irn || data.einvoiceQr ? "1" : undefined}
    >
      <div className="inv-sheet inv-page-main">
        {/* Document banner */}
        <div className="inv-banner">
          <div className="inv-banner-title">{data.documentLabel?.trim() || "TAX INVOICE"}</div>
          <div className="inv-banner-sub">
            <div>{data.invoiceType || "Tax Invoice"}</div>
            {data.placeOfSupply ? <div>Place of supply: {data.placeOfSupply}</div> : null}
          </div>
        </div>

        {/* Header: meta | logo + barcode | e-invoice QR */}
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
          {data.irn ? (
                    <tr>
                      <td className="inv-meta-label">IRN</td>
                      <td className="inv-meta-value mono" style={{ fontSize: "0.65rem", wordBreak: "break-all" }}>
                        : {data.irn}
                      </td>
                    </tr>
                  ) : null}
                  {data.ackNo ? (
                    <tr>
                      <td className="inv-meta-label">Ack No</td>
                      <td className="inv-meta-value mono">: {data.ackNo}</td>
                    </tr>
                  ) : null}
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
            {!isB2cCustomer ? (
              <div className="inv-logo-above-barcode">
                <img
                  src={logoSrc}
                  alt="Zimson"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).onerror = null;
                    (e.currentTarget as HTMLImageElement).src = FALLBACK_LOGO;
                  }}
                />
              </div>
            ) : null}
            <InvoiceNumberScanCodes invoiceNumber={scanInvoiceNumber} className="mt-1 shrink-0" />
          </div>
          <div className="inv-top-cell inv-qr-wrap" style={{ width: "32%" }}>
            {hasEinvoiceQr ? (
              <EinvoiceSignedQr
                signedPayload={data.einvoiceQr}
                irn={data.irn}
                className="mt-0"
              />
            ) : isB2cCustomer ? (
              <div className="inv-logo-above-barcode" style={{ marginTop: 0 }}>
                <img
                  src={logoSrc}
                  alt="Zimson"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).onerror = null;
                    (e.currentTarget as HTMLImageElement).src = FALLBACK_LOGO;
                  }}
                />
              </div>
            ) : null}
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
              <table className="inv-field-table inv-bill-to-table">
                <colgroup>
                  <col className="inv-col-bill-label" />
                  <col className="inv-col-bill-value" />
                </colgroup>
                <tbody>
                  <tr>
                    <td className="inv-field-label">Customer Name</td>
                    <td className="inv-field-value">{data.billTo.name}</td>
                  </tr>
                  <tr>
                    <td className="inv-field-label">Customer ID</td>
                    <td className="inv-field-value mono">{data.billTo.customerCode || "—"}</td>
                  </tr>
                  <tr>
                    <td className="inv-field-label">Mobile Number</td>
                    <td className="inv-field-value">{data.billTo.phone || "—"}</td>
                  </tr>
                  <tr>
                    <td className="inv-field-label">Email ID</td>
                    <td className="inv-field-value">{data.billTo.email || "—"}</td>
                  </tr>
                  <tr>
                    <td className="inv-field-label">GSTIN Number</td>
                    <td className="inv-field-value mono">{data.billTo.gstin || "—"}</td>
                  </tr>
                  <tr>
                    <td className="inv-field-label">Pan Number</td>
                    <td className="inv-field-value mono">{data.billTo.pan || "—"}</td>
                  </tr>
                  <tr>
                    <td className="inv-field-label">Billing Address</td>
                    <td className="inv-field-value">{data.billTo.address || "—"}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Product information */}
        {productInfoRows.length > 0 ? (
          <div className="inv-product-panel">
            <div className="inv-section-head inv-product-section-head">Product Information</div>
            <ProductInfoTable rows={productInfoRows} />
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
                {(data.advanceAmount ?? 0) > 0 ? (
                  <tr>
                    <td className="inv-pay-label">Advance Amount</td>
                    <td className="inv-pay-value">{fmt(data.advanceAmount ?? 0)}</td>
                  </tr>
                ) : null}
            {data.paymentSplits && data.paymentSplits.length > 0
              ? data.paymentSplits.map((split) => (
                      <tr key={split.mode}>
                        <td className="inv-pay-label">
                          {(data.advanceAmount ?? 0) > 0 ? `Balance — ${split.mode}` : split.mode}
                        </td>
                        <td className="inv-pay-value">
                          {fmt(split.amountInr)}
                          {split.reference?.trim() ? ` (${split.reference.trim()})` : ""}
                        </td>
                      </tr>
                ))
              : (data.balanceCollectedInr ?? 0) > 0 &&
                  ((data.advanceAmount ?? 0) > 0 || data.paymentMode)
                ? (
                        <tr>
                          <td className="inv-pay-label">
                            {(data.advanceAmount ?? 0) > 0
                              ? data.paymentMode
                                ? `Balance — ${data.paymentMode}`
                                : "Balance collected"
                              : data.paymentMode
                                ? `${data.paymentMode} Payment`
                                : "Amount paid"}
                          </td>
                          <td className="inv-pay-value">{fmt(data.balanceCollectedInr ?? 0)}</td>
                        </tr>
                  )
                : null}
                <tr>
                  <td className="inv-pay-label">Invoice total (incl. GST)</td>
                  <td className="inv-pay-value">{fmt(data.netPayable ?? data.amountPaid ?? data.totalAmount)}</td>
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
                  {(data.roundOffInr ?? 0) !== 0 ? (
                    <tr>
                      <td className="inv-total-label">Round off</td>
                      <td className="inv-total-value">
                        ₹ {fmtSigned(data.roundOffInr ?? 0)}
                      </td>
                    </tr>
                  ) : null}
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

        {/* Footer — page 1 */}
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
            <div className="inv-sign-wrap">
              <div className="inv-sign-line">Authorised Signatory</div>
            </div>
          </div>
        </div>

        <div className="inv-footnote">
          This is a computer-generated document. Signature may not be required subject to company
          policy. Subject to jurisdiction at Chennai, Tamil Nadu, E. &amp; O.E.
        </div>

        {data.footerTerms && data.footerTerms.length > 0 ? (
          <div className="inv-terms-block">
            <div className="inv-terms-page-head">
              <span className="inv-terms-page-title">Terms and Conditions</span>
              <span className="inv-terms-page-ref mono">
                {data.invoiceNumber}
                {data.invoiceDate ? ` · ${data.invoiceDate}` : ""}
              </span>
            </div>
            <div className="inv-terms">
              <TermsColumns terms={data.footerTerms} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
