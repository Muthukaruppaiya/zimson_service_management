import type { ServiceInvoiceTaxRow, ServiceInvoiceViewModel } from "../../types/serviceInvoice";
import { SERVICE_INVOICE_BRANDING } from "../../config/serviceInvoiceBranding";
import { formatPrintedHsnSac } from "../../lib/hsnGst";
import {
  formatInvoiceJurisdictionLine,
  resolveInvoiceJurisdiction,
} from "../../lib/invoiceJurisdiction";
import {
  formatPrintedServiceItemDescription,
  isServicePackageInvoiceDescription,
  splitPrintedServiceItemDescription,
} from "../../lib/servicePackage";
import { EinvoiceSignedQr } from "./EinvoiceSignedQr";
import { tcsInvoiceLabel } from "../../lib/tcs";

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

function rupee(n: number): string {
  return `₹ ${fmt(n)}`;
}

/** Strip leading list markers so <ol> does not show "1. 1." / "2. 2." */
function normalizeTermLine(text: string): string {
  return text
    .replace(/^\s*\d+[\).\]:-]+\s*/, "")
    .replace(/^\s*\d+\s+/, "")
    .trim();
}

function TermsList({ terms }: { terms: string[] }) {
  const lines = terms.map(normalizeTermLine).filter(Boolean);
  if (lines.length === 0) return null;
  return (
    <table className="inv-terms-list">
      <tbody>
        {lines.map((t, i) => (
          <tr key={i}>
            <td className="inv-terms-num">{i + 1}.</td>
            <td className="inv-terms-text">{t}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function printedLineType(ln: {
  lineKind?: "service" | "spare";
  isSpareLine?: boolean;
  description: string;
}): string {
  if (ln.lineKind === "service" || isServicePackageInvoiceDescription(ln.description)) return "Service";
  if (ln.lineKind === "spare" || ln.isSpareLine) return "Spare";
  return "Service";
}

function printedItemName(ln: {
  lineKind?: "service" | "spare";
  isSpareLine?: boolean;
  description: string;
}) {
  const type = printedLineType(ln);
  if (type !== "Service") return formatPrintedServiceItemDescription(ln.description);
  const { title, rest } = splitPrintedServiceItemDescription(ln.description);
  return (
    <>
      <strong className="inv-item-pkg">{title}</strong>
      {rest ? (
        <>
          <br />
          {rest}
        </>
      ) : null}
    </>
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

function metaValue(rows: { label: string; value: string }[], label: string): string {
  const key = label.trim().toLowerCase();
  const hit = rows.find((r) => r.label.trim().toLowerCase() === key);
  return hit?.value?.trim() ?? "";
}

function hsnFromTaxRow(row: ServiceInvoiceTaxRow): string {
  if (row.hsnSac?.trim()) return printedHsn(row.hsnSac);
  const m = row.description.match(/HSN\s+([A-Za-z0-9]+)/i);
  return m?.[1] ? printedHsn(m[1]) : "—";
}

function hsnBreakupDescription(row: ServiceInvoiceTaxRow): string {
  const hsn = (row.hsnSac || "").replace(/\D/g, "");
  if (hsn.startsWith("9987")) return "Watch Repair Service";
  const cleaned = row.description.replace(/\s*\([^)]*HSN[^)]*\)/i, "").trim();
  if (cleaned && !/%\s*(CGST|SGST|IGST)/i.test(cleaned)) return cleaned;
  return hsn ? "Spare parts" : row.description || "Goods / Service";
}

function gstHalfRateLabel(rows: ServiceInvoiceTaxRow[], kind: "cgst" | "sgst" | "igst"): string {
  const withTax = rows.filter((r) => (kind === "igst" ? r.igst : kind === "cgst" ? r.cgst : r.sgst) > 0);
  const percents = withTax
    .map((r) => {
      if (r.ratePercent != null && r.ratePercent > 0) {
        return kind === "igst" ? r.ratePercent : r.ratePercent / 2;
      }
      if (r.taxable > 0) {
        const amt = kind === "igst" ? r.igst : kind === "cgst" ? r.cgst : r.sgst;
        return Math.round((amt / r.taxable) * 1000) / 10;
      }
      return null;
    })
    .filter((n): n is number => n != null && n > 0);
  const unique = [...new Set(percents.map((n) => String(n)))];
  if (unique.length === 1) {
    const n = Number(unique[0]);
    const label = kind === "igst" ? "IGST" : kind === "cgst" ? "CGST" : "SGST";
    return `${label} (${n % 1 === 0 ? n.toFixed(0) : String(n)}%) (₹)`;
  }
  return kind === "igst" ? "IGST (₹)" : kind === "cgst" ? "CGST (₹)" : "SGST (₹)";
}

function isDummyPrintValue(value: string): boolean {
  const t = value.replace(/\s+/g, " ").trim().toLowerCase();
  if (!t) return true;
  if (t.includes("placeholder")) return true;
  if (t.includes("corporate / registered office")) return true;
  if (t.includes("zimson watches & services")) return true;
  if (t.includes("accounts@zimson.com")) return true;
  if (/^(\+91[-\s]*)?0{4,}[-\s]*0{4,}$/.test(t.replace(/\s/g, ""))) return true;
  return false;
}

function InvKv({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <tr>
      <td className="inv-k">{label}</td>
      <td className="inv-colon">:</td>
      <td className={`inv-v${mono ? " mono" : ""}`}>{value.trim() ? value : "—"}</td>
    </tr>
  );
}

export function ServiceInvoiceTemplate({ data, idPrefix = "inv" }: Props) {
  const rootId = `${idPrefix}-service-invoice-print-root`;
  const pb = data.productBlock;
  const isCustomerCopy = data.copyKind === "customer" || Boolean(data.copyLabel);
  const copyStamp = data.copyLabel?.trim().toUpperCase() || "";
  const copyClass = copyStamp ? ` inv-copy-${copyStamp.toLowerCase()}` : "";
  const FALLBACK_LOGO = "/zimson-logo.png";
  const logoSrc = data.sellerLogoUrl || FALLBACK_LOGO;
  const taxRows = data.taxBreakdownRows ?? [];
  const showIgst = taxRows.some((r) => r.igst > 0);
  const brand = SERVICE_INVOICE_BRANDING;
  const pickSeller = (raw: string | undefined, fallback: string) => {
    const v = String(raw ?? "").trim();
    return v && !isDummyPrintValue(v) ? v : fallback;
  };
  const addressText = (() => {
    const lines = data.seller.addressLines.map((l) => l.trim()).filter((l) => l && !isDummyPrintValue(l));
    return lines.length > 0 ? lines.join("\n") : brand.sellerAddressLines.join("\n");
  })();
  const companyName = pickSeller(data.seller.legalName, brand.sellerDisplayName);
  const sellerPhone = pickSeller(data.seller.phone, brand.sellerPhone);
  const sellerEmail = pickSeller(data.seller.email, brand.sellerEmail);
  const sellerGstin = pickSeller(data.seller.gstin, brand.sellerGstin);
  const legalFooter = pickSeller(data.invoiceLegalFooter, brand.legalFooter);
  const jur = resolveInvoiceJurisdiction({
    city: data.jurisdictionCity,
    state: data.jurisdictionState,
    addressLines: addressText ? addressText.split("\n") : data.seller.addressLines,
    gstin: sellerGstin,
  });
  const jurisdictionLine = formatInvoiceJurisdictionLine(jur.city, jur.state);
  const complaint = metaValue(data.serviceMeta, "Complaint");
  const warranty = metaValue(data.serviceMeta, "Warranty");
  const advanceMeta =
    metaValue(data.serviceMeta, "Advance collected") || metaValue(data.serviceMeta, "Advance Collected");
  const advancePrinted =
    advanceMeta ||
    ((data.advanceAmount ?? 0) > 0
      ? `INR ${fmt(data.advanceAmount ?? 0)}${data.paymentMode ? ` (${data.paymentMode})` : ""}`
      : "");
  const extraWatchMeta = data.serviceMeta.filter((row) => {
    const k = row.label.trim().toLowerCase();
    return !["complaint", "warranty", "advance collected", "nature of repair"].includes(k);
  });

  const taxTotalCgst = taxRows.reduce((s, r) => s + r.cgst, 0);
  const taxTotalSgst = taxRows.reduce((s, r) => s + r.sgst, 0);
  const taxTotalIgst = taxRows.reduce((s, r) => s + r.igst, 0);
  const taxTotalAmt = taxRows.reduce((s, r) => s + r.total, 0);
  const taxTotalTaxable = taxRows.reduce((s, r) => s + r.taxable, 0);

  return (
    <div
      id={rootId}
      className={`service-invoice-print-root inv-doc${isCustomerCopy ? " inv-copy-customer" : data.copyKind === "internal" ? " inv-copy-internal" : ""}${copyClass}`}
      data-expect-einvoice-qr={data.irn || data.einvoiceQr ? "1" : undefined}
    >
      <div className="inv-sheet inv-page-main">
        <div className="inv-title-box">
          <div className="inv-banner-title">{data.documentLabel?.trim() || "TAX INVOICE"}</div>
          {copyStamp ? <div className="inv-copy-label">{copyStamp}</div> : null}
        </div>

        <table className="inv-frame inv-company-table">
          <tbody>
            <tr>
              <td className="inv-company-fields">
                <p className="inv-company-name">{companyName}</p>
                {addressText ? <p className="inv-company-line">{addressText}</p> : null}
                {sellerPhone ? <p className="inv-company-line">{sellerPhone}</p> : null}
                {sellerEmail ? <p className="inv-company-line">{sellerEmail}</p> : null}
                {sellerGstin ? <p className="inv-company-line mono">{sellerGstin}</p> : null}
              </td>
              <td className="inv-logo-cell">
                <img
                  src={logoSrc}
                  alt="Logo"
                  className="inv-logo-img"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).onerror = null;
                    (e.currentTarget as HTMLImageElement).src = FALLBACK_LOGO;
                  }}
                />
                {data.irn || data.einvoiceQr ? (
                  <div className="inv-logo-einvoice">
                    <EinvoiceSignedQr signedPayload={data.einvoiceQr} irn={data.irn} size={120} className="inv-logo-qr" />
                    {data.irn ? <p className="inv-logo-irn">IRN {data.irn}</p> : null}
                  </div>
                ) : null}
              </td>
            </tr>
          </tbody>
        </table>

        <table className="inv-frame inv-split-table">
          <tbody>
            <tr>
              <td className="inv-split-cell inv-customer-block">
                <table className="inv-kv">
                  <tbody>
                    <InvKv label="Customer Name" value={data.billTo.name} />
                    <InvKv label="Customer ID" value={data.billTo.customerCode || ""} mono />
                    <InvKv label="Mobile Number" value={data.billTo.phone || ""} />
                    <InvKv label="Email ID" value={data.billTo.email || ""} />
                    <InvKv label="GSTIN Number" value={data.billTo.gstin || ""} mono />
                    <InvKv label="PAN Number" value={data.billTo.pan || ""} mono />
                    <InvKv label="Billing Address" value={data.billTo.address || ""} />
                  </tbody>
                </table>
              </td>
              <td className="inv-split-cell">
                <table className="inv-kv">
                  <tbody>
                    <InvKv label="Invoice No" value={data.invoiceNumber} mono />
                    <InvKv label="Invoice Date" value={data.invoiceDate} />
                    {data.serviceReference ? (
                      <InvKv
                        label={data.invoiceType === "Quick Bill" ? "Quick Bill No" : "SR No"}
                        value={data.serviceReference}
                        mono
                      />
                    ) : null}
                    {data.invoiceType ? <InvKv label="Invoice Type" value={data.invoiceType} /> : null}
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>

        <div className="inv-frame">
          <table className="inv-watch-table">
            <colgroup>
              <col className="inv-watch-k" />
              <col className="inv-watch-c" />
              <col className="inv-watch-v" />
              <col className="inv-watch-k" />
              <col className="inv-watch-c" />
              <col className="inv-watch-v" />
            </colgroup>
            <tbody>
              <tr>
                <td className="inv-k">Brand Name</td>
                <td className="inv-colon">:</td>
                <td className="inv-v">{pb?.brandName || "—"}</td>
                <td className="inv-k">Brand Model</td>
                <td className="inv-colon">:</td>
                <td className="inv-v">{pb?.brandModel || "—"}</td>
              </tr>
              <tr>
                <td className="inv-k">Brand / Model No.</td>
                <td className="inv-colon">:</td>
                <td className="inv-v">{pb?.modelOrSerial || "—"}</td>
                <td className="inv-k">Nature of Repair</td>
                <td className="inv-colon">:</td>
                <td className="inv-v">{pb?.natureOfRepair || "—"}</td>
              </tr>
              <tr>
                <td className="inv-k">Complaint</td>
                <td className="inv-colon">:</td>
                <td className="inv-v">{complaint || "—"}</td>
                <td className="inv-k">Warranty</td>
                <td className="inv-colon">:</td>
                <td className="inv-v">{warranty || "—"}</td>
              </tr>
              {advancePrinted ? (
                <tr>
                  <td className="inv-k">Advance Collected</td>
                  <td className="inv-colon">:</td>
                  <td className="inv-v" colSpan={4}>
                    {advancePrinted}
                  </td>
                </tr>
              ) : null}
              {extraWatchMeta.map((row, i) =>
                i % 2 === 0 ? (
                  <tr key={row.label}>
                    <td className="inv-k">{row.label}</td>
                    <td className="inv-colon">:</td>
                    <td className="inv-v">{row.value}</td>
                    {extraWatchMeta[i + 1] ? (
                      <>
                        <td className="inv-k">{extraWatchMeta[i + 1]!.label}</td>
                        <td className="inv-colon">:</td>
                        <td className="inv-v">{extraWatchMeta[i + 1]!.value}</td>
                      </>
                    ) : (
                      <>
                        <td className="inv-k" />
                        <td className="inv-colon" />
                        <td className="inv-v" />
                      </>
                    )}
                  </tr>
                ) : null,
              )}
            </tbody>
          </table>
        </div>

        <table className={`inv-grid${isCustomerCopy ? " inv-items-table--customer" : ""}`}>
          <colgroup>
            <col className="inv-col-sno" />
            <col className="inv-col-type" />
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
              <th>Type</th>
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
                <td>{printedLineType(ln)}</td>
                {!isCustomerCopy ? <td className="mono">{ln.spareCode ?? "—"}</td> : null}
                <td className="inv-td-item" style={{ whiteSpace: "pre-line" }}>
                  {printedItemName(ln)}
                </td>
                <td className="mono inv-td-hsn">{printedHsn(ln.hsnSac)}</td>
                <td className="num">{fmt(ln.unitPrice)}</td>
                <td className="num">{ln.qty}</td>
                <td className="num">{fmt(ln.grossValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {taxRows.length > 0 ? (
          <div className="inv-frame">
            <div className="inv-sec-title">HSN Breakup</div>
            <table className="inv-grid inv-hsn-table">
              <thead>
                <tr>
                  <th>HSN/SAC</th>
                  <th>Description</th>
                  <th className="num">Taxable Amount (₹)</th>
                  {showIgst ? (
                    <th className="num">{gstHalfRateLabel(taxRows, "igst")}</th>
                  ) : (
                    <>
                      <th className="num">{gstHalfRateLabel(taxRows, "cgst")}</th>
                      <th className="num">{gstHalfRateLabel(taxRows, "sgst")}</th>
                    </>
                  )}
                  <th className="num">Total Tax (₹)</th>
                </tr>
              </thead>
              <tbody>
                {taxRows.map((row, idx) => (
                  <tr key={`${hsnFromTaxRow(row)}-${idx}`}>
                    <td className="mono">{hsnFromTaxRow(row)}</td>
                    <td>{hsnBreakupDescription(row)}</td>
                    <td className="num">{fmt(row.taxable)}</td>
                    {showIgst ? (
                      <td className="num">{fmt(row.igst)}</td>
                    ) : (
                      <>
                        <td className="num">{fmt(row.cgst)}</td>
                        <td className="num">{fmt(row.sgst)}</td>
                      </>
                    )}
                    <td className="num">{fmt(row.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>Total</td>
                  <td className="num">{fmt(taxTotalTaxable || data.grossTaxableTotal || 0)}</td>
                  {showIgst ? (
                    <td className="num">{fmt(taxTotalIgst)}</td>
                  ) : (
                    <>
                      <td className="num">{fmt(taxTotalCgst)}</td>
                      <td className="num">{fmt(taxTotalSgst)}</td>
                    </>
                  )}
                  <td className="num">{fmt(taxTotalAmt || data.totalTax || 0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : null}

        <table className="inv-frame inv-split-table inv-totals-split">
          <tbody>
            <tr>
              <td className="inv-split-cell">
                <table className="inv-kv inv-pay-kv">
                  <tbody>
                    {(data.advanceAmount ?? 0) > 0 ? (
                      <InvKv label="Advance Amount" value={rupee(data.advanceAmount ?? 0)} />
                    ) : null}
                    {data.paymentSplits && data.paymentSplits.length > 0
                      ? data.paymentSplits.map((split) => (
                          <InvKv
                            key={split.mode}
                            label={(data.advanceAmount ?? 0) > 0 ? `Balance — ${split.mode}` : split.mode}
                            value={`${rupee(split.amountInr)}${split.reference?.trim() ? ` (${split.reference.trim()})` : ""}`}
                          />
                        ))
                      : (data.balanceCollectedInr ?? 0) > 0 &&
                          ((data.advanceAmount ?? 0) > 0 || data.paymentMode)
                        ? (
                            <InvKv
                              label={
                                (data.advanceAmount ?? 0) > 0
                                  ? data.paymentMode
                                    ? `Balance — ${data.paymentMode}`
                                    : "Balance collected"
                                  : data.paymentMode
                                    ? `${data.paymentMode} Payment`
                                    : "Amount paid"
                              }
                              value={rupee(data.balanceCollectedInr ?? 0)}
                            />
                          )
                        : null}
                    <InvKv
                      label="Invoice total (incl. GST)"
                      value={rupee(data.netPayable ?? data.amountPaid ?? data.totalAmount)}
                    />
                  </tbody>
                </table>
                {data.notes ? <p className="inv-pay-notes">Remarks: {data.notes}</p> : null}
                {data.amountInWords ? <p className="inv-amount-words">{data.amountInWords}</p> : null}
              </td>
              <td className="inv-split-cell">
                <table className="inv-kv inv-pay-kv">
                  <tbody>
                    <InvKv label="Gross Amount" value={rupee(data.grossTaxableTotal ?? 0)} />
                    <InvKv label="Tax Amount" value={rupee(data.totalTax ?? 0)} />
                    {(data.tcsAmount ?? 0) > 0 ? (
                      <InvKv label={tcsInvoiceLabel(data.tcsRatePercent)} value={rupee(data.tcsAmount ?? 0)} />
                    ) : null}
                    <InvKv label="Round off" value={`₹ ${fmtSigned(data.roundOffInr ?? 0)}`} />
                    <InvKv label="Net Payable" value={rupee(data.netPayable ?? data.totalAmount)} />
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>

        <table className="inv-signoff">
          <tbody>
            <tr>
              <td className="inv-signoff-left">
                {data.generatedBy ? (
                  <p className="inv-footer-gen">
                    Document generated by: <strong>{data.generatedBy}</strong>
                  </p>
                ) : null}
                {legalFooter ? (
                  <p className="inv-footer-for">
                    For <strong>{legalFooter}</strong>
                  </p>
                ) : null}
              </td>
              <td className="inv-signoff-right">
                <div className="inv-sign-line">Authorised Signatory</div>
              </td>
            </tr>
          </tbody>
        </table>

        <div className="inv-frame inv-terms-block">
          <p className="inv-jurisdiction">{jurisdictionLine}</p>
          {data.footerTerms && data.footerTerms.length > 0 ? (
            <>
              <div className="inv-sec-title inv-terms-page-title">TERMS AND CONDITIONS</div>
              <div className="inv-terms">
                <TermsList terms={data.footerTerms} />
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
