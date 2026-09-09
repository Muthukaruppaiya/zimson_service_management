import type { ReactNode } from "react";
import type { ServiceInvoiceViewModel } from "../../types/serviceInvoice";
import { formatPrintedHsnSac } from "../../lib/hsnGst";
import { EinvoiceSignedQr } from "./EinvoiceSignedQr";
import { InvoiceNumberScanCodes } from "./InvoiceNumberScanCodes";
import {
  InvIconBox,
  InvIconCalendar,
  InvIconFile,
  InvIconGstin,
  InvIconHash,
  InvIconMail,
  InvIconPen,
  InvIconPerson,
  InvIconPhone,
  InvIconStore,
  InvIconTag,
  InvIconWallet,
} from "./invoiceDocumentIcons";

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
  return (
    <ol className="inv-terms-list">
      {lines.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ol>
  );
}

function printedHsn(hsnSac: string): string {
  if (!hsnSac?.trim()) return "—";
  if (hsnSac.includes(",")) {
    return hsnSac
      .split(",")
      .map((part) => formatPrintedHsnSac(part.trim()))
      .filter(Boolean)
      .join(", ");
  }
  return formatPrintedHsnSac(hsnSac);
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

function InvSecPill({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="inv-sec-pill">
      <span className="inv-sec-pill-ic" aria-hidden>
        {icon}
      </span>
      <span className="inv-sec-pill-txt">{children}</span>
    </div>
  );
}

function InvMetaLine({ icon, label, value, mono }: { icon: ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div className="inv-meta-line">
      <span className="inv-meta-ic" aria-hidden>
        {icon}
      </span>
      <span className="inv-meta-txt">
        <span className="inv-meta-lbl">{label}</span>
        <span className={`inv-meta-val${mono ? " mono" : ""}`}>{value}</span>
      </span>
    </div>
  );
}

export function ServiceInvoiceTemplate({ data, idPrefix = "inv" }: Props) {
  const rootId = `${idPrefix}-service-invoice-print-root`;
  const pb = data.productBlock;
  const productInfoRows = buildProductInfoRows(pb, data.serviceMeta);
  const isQuickBill = data.invoiceType === "Quick Bill";
  const isB2cCustomer = !String(data.billTo.gstin ?? "").trim();
  const hasEinvoiceQr = Boolean(data.irn || data.einvoiceQr);
  const isCustomerCopy = data.copyKind === "customer";
  const copyLabel = isCustomerCopy ? "CUSTOMER COPY" : data.copyKind === "internal" ? "INTERNAL COPY" : null;

  const FALLBACK_LOGO = "/zimson-logo.png";
  const logoSrc = data.sellerLogoUrl || FALLBACK_LOGO;
  const scanInvoiceNumber = (data.invoiceNumber || data.serviceReference || "").trim();
  const grossTotal =
    data.grossTaxableTotal ?? data.lines.reduce((s, l) => s + l.grossValue, 0);

  return (
    <div
      id={rootId}
      className={`service-invoice-print-root inv-doc${isQuickBill ? " inv-quick-bill" : ""}${
        isCustomerCopy ? " inv-copy-customer" : data.copyKind === "internal" ? " inv-copy-internal" : ""
      }`}
      data-expect-einvoice-qr={data.irn || data.einvoiceQr ? "1" : undefined}
    >
      <div className="inv-sheet inv-page-main">
        <div className="inv-watermark" aria-hidden>
          <img
            src={logoSrc}
            alt=""
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).onerror = null;
              (e.currentTarget as HTMLImageElement).src = FALLBACK_LOGO;
            }}
          />
        </div>

        <div className="inv-banner">
          <div className="inv-banner-title">{data.documentLabel?.trim() || "TAX INVOICE"}</div>
          <div className="inv-banner-sub">
            {copyLabel ? <div className="inv-copy-label">{copyLabel}</div> : null}
            <div>{data.invoiceType || "Tax Invoice"}</div>
            {data.placeOfSupply ? <div>Place of supply: {data.placeOfSupply}</div> : null}
          </div>
        </div>
        <div className="inv-accent" aria-hidden />

        <div className="inv-top-row">
          <div className="inv-top-cell inv-card inv-meta-card">
            <InvMetaLine icon={<InvIconFile />} label="Invoice No" value={data.invoiceNumber} mono />
            <InvMetaLine icon={<InvIconCalendar />} label="Invoice Date" value={data.invoiceDate} />
            {data.serviceReference ? (
              <InvMetaLine
                icon={<InvIconHash />}
                label={data.invoiceType === "Quick Bill" ? "Quick Bill No" : "SR No"}
                value={data.serviceReference}
                mono
              />
            ) : null}
            {data.invoiceType ? (
              <InvMetaLine icon={<InvIconTag />} label="Invoice Type" value={data.invoiceType} />
            ) : null}
            {data.irn ? (
              <InvMetaLine icon={<InvIconFile />} label="IRN" value={data.irn} mono />
            ) : null}
            {data.ackNo ? (
              <InvMetaLine icon={<InvIconHash />} label="Ack No" value={data.ackNo} mono />
            ) : null}
          </div>
          <div className="inv-top-cell inv-card inv-barcode-wrap">
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
          <div className="inv-top-cell inv-card inv-qr-wrap">
            {hasEinvoiceQr ? (
              <EinvoiceSignedQr signedPayload={data.einvoiceQr} irn={data.irn} className="mt-0" />
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

        <div className="inv-party-grid">
          <div className="inv-party-col">
            <InvSecPill icon={<InvIconStore />}>Bill From (Seller)</InvSecPill>
            <div className="inv-party-body inv-card-body">
              <p className="inv-party-name">{data.seller.legalName}</p>
              {data.seller.addressLines.map((line) => (
                <p key={line} className="inv-party-line">
                  {line}
                </p>
              ))}
              {data.seller.phone ? (
                <p className="inv-party-contact">
                  <InvIconPhone className="inv-ic inv-ic-inline" />
                  <span>{data.seller.phone}</span>
                </p>
              ) : null}
              {data.seller.email ? (
                <p className="inv-party-contact">
                  <InvIconMail className="inv-ic inv-ic-inline" />
                  <span>{data.seller.email}</span>
                </p>
              ) : null}
              <p className="inv-party-contact">
                <InvIconGstin className="inv-ic inv-ic-inline" />
                <span className="mono">{data.seller.gstin}</span>
              </p>
            </div>
          </div>
          <div className="inv-party-col">
            <InvSecPill icon={<InvIconPerson />}>Bill To (Customer)</InvSecPill>
            <div className="inv-party-body inv-card-body">
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

        {productInfoRows.length > 0 ? (
          <div className="inv-product-panel">
            <InvSecPill icon={<InvIconBox />}>Product Information</InvSecPill>
            <div className="inv-card-body inv-product-body">
              <ProductInfoTable rows={productInfoRows} />
            </div>
          </div>
        ) : null}

        {/* Line items */}
        <table className={`inv-items-table${isCustomerCopy ? " inv-items-table--customer" : ""}`}>
          <colgroup>
            <col className="inv-col-sno" />
            {!isCustomerCopy ? <col className="inv-col-spare" /> : null}
            <col className="inv-col-item" />
            <col className="inv-col-hsn" />
            <col className="inv-col-price" />
            <col className="inv-col-qty" />
            <col className="inv-col-gross" />
          </colgroup>
          <thead>
            <tr>
              <th>S.No</th>
              {!isCustomerCopy ? <th>Spare Code</th> : null}
              <th>Item Name</th>
              <th>HSN/SAC</th>
              <th className="num">Price (₹)</th>
              <th className="num">Qty</th>
              <th className="num">Gross (₹)</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((ln) => (
              <tr key={ln.slNo}>
                <td className="inv-td-sno">{ln.slNo}</td>
                {!isCustomerCopy ? (
                  <td className="inv-td-spare mono">{ln.spareCode ?? "—"}</td>
                ) : null}
                <td className="inv-td-item">{ln.description}</td>
                <td className="inv-td-hsn mono">{printedHsn(ln.hsnSac)}</td>
                <td className="num">{fmt(ln.unitPrice)}</td>
                <td className="num">{ln.qty}</td>
                <td className="num">{fmt(ln.grossValue)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={isCustomerCopy ? 4 : 5}>
                {data.amountInWords ? (
                  <span className="inv-amount-words">{data.amountInWords}</span>
                ) : null}
              </td>
              <td className="num">{data.totalQty != null ? data.totalQty : ""}</td>
              <td className="num">{fmt(grossTotal)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="inv-bottom-grid">
          <div className="inv-bottom-col">
            <InvSecPill icon={<InvIconWallet />}>Payment Summary</InvSecPill>
            <div className="inv-pay-card">
              <table className="inv-pay-table">
                <tbody>
                  {(data.advanceAmount ?? 0) > 0 ? (
                    <tr>
                      <td className="inv-pay-label">Advance Amount</td>
                      <td className="inv-pay-value">₹ {fmt(data.advanceAmount ?? 0)}</td>
                    </tr>
                  ) : null}
                  {data.paymentSplits && data.paymentSplits.length > 0
                    ? data.paymentSplits.map((split) => (
                        <tr key={split.mode}>
                          <td className="inv-pay-label">
                            {(data.advanceAmount ?? 0) > 0 ? `Balance — ${split.mode}` : split.mode}
                          </td>
                          <td className="inv-pay-value">
                            ₹ {fmt(split.amountInr)}
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
                            <td className="inv-pay-value">₹ {fmt(data.balanceCollectedInr ?? 0)}</td>
                          </tr>
                        )
                      : null}
                  <tr className="inv-pay-total-row">
                    <td className="inv-pay-label">Invoice total (incl. GST)</td>
                    <td className="inv-pay-value">₹ {fmt(data.netPayable ?? data.amountPaid ?? data.totalAmount)}</td>
                  </tr>
                </tbody>
              </table>
              {data.notes ? <p className="inv-pay-notes">Remarks: {data.notes}</p> : null}
            </div>
          </div>
          <div className="inv-bottom-col">
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
                      <td className="inv-total-value">₹ {fmtSigned(data.roundOffInr ?? 0)}</td>
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

        <div className="inv-footer">
          <div className="inv-footer-left">
            {data.generatedBy ? (
              <p className="inv-footer-gen">
                <InvIconPen className="inv-ic inv-ic-inline" />
                <span>
                  <strong>Invoice generated by:</strong> {data.generatedBy}
                </span>
              </p>
            ) : null}
            {data.invoiceLegalFooter ? (
              <p className="inv-footer-for">
                For <strong>{data.invoiceLegalFooter}</strong>
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
