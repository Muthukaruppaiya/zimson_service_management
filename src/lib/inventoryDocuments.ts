import { getActiveTemplateByKind, loadDocumentTemplateStore } from "./documentTemplates";
import type { DocumentKind } from "../types/documentTemplate";

type PartyBlock = {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  gstin?: string;
};

function formatDate(value?: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

function formatMoney(value: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function esc(v: string): string {
  return v
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function barcode(ref: string): string {
  const q = encodeURIComponent(ref);
  return `<img src="https://bwipjs-api.metafloor.com/?bcid=code128&text=${q}&scale=2&includetext=true&textxalign=center" alt="BARCODE ${esc(ref)}" style="border:1px solid #111;padding:4px;background:#fff;max-width:240px" />`;
}

function activeConfig(kind: DocumentKind) {
  const store = loadDocumentTemplateStore();
  const tpl = getActiveTemplateByKind(store, kind);
  return { branding: store.branding, tpl };
}

function lbl(labels: Record<string, string>, key: string, fallback: string): string {
  return labels[key]?.trim() || fallback;
}

function baseStyle(): string {
  return `
  body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 20px; color: #111; background: #fff; }
  .doc { max-width: 980px; margin: 0 auto; border: 1px solid #111; padding: 18px; background: #fff; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
  .title { font-size: 34px; font-weight: 800; letter-spacing: 0.5px; margin: 0; text-transform: uppercase; }
  .meta { text-align: right; font-size: 12px; line-height: 1.5; }
  .sec { margin-top: 14px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #111; padding: 6px 8px; font-size: 12px; vertical-align: top; }
  th { background: #111; color: #fff; text-align: left; text-transform: uppercase; font-size: 11px; }
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0; }
  .box { border: 1px solid #111; border-right: 0; padding: 0; }
  .box:last-child { border-right: 1px solid #111; }
  .box-h { background: #111; color: #fff; font-size: 11px; font-weight: 700; padding: 6px 8px; text-transform: uppercase; }
  .box-b { padding: 8px; font-size: 12px; line-height: 1.45; min-height: 105px; }
  .right { text-align: right; }
  .small { font-size: 11px; color: #333; }
  .mt8 { margin-top: 8px; }
  .sign { margin-top: 24px; display: flex; justify-content: flex-end; gap: 40px; }
  .sign-line { width: 210px; border-top: 1px solid #111; text-align: center; font-size: 12px; padding-top: 6px; }
  .line { border-top: 1px solid #111; margin: 10px 0; }
  .subhead { background: #9ca3af; color: #fff; font-weight: 700; text-align: center; font-size: 20px; padding: 6px 10px; }
  .blank { height: 22px; }
  @media print { body { padding: 0; } .doc { border: none; } }
  `;
}

export function openPrintDocument(title: string, html: string): void {
  const w = window.open("", "_blank");
  if (!w) {
    window.alert("Popup blocked. Please allow popups for this site and retry print.");
    return;
  }
  const fullHtml = `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${esc(title)}</title>
      <style>
        .print-preview-toolbar {
          position: sticky;
          top: 0;
          z-index: 9999;
          display: flex;
          gap: 8px;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          border-bottom: 1px solid #d6d3d1;
          background: #ffffff;
          font-family: Arial, Helvetica, sans-serif;
        }
        .print-preview-toolbar__left {
          font-size: 13px;
          color: #44403c;
          font-weight: 600;
        }
        .print-preview-toolbar__actions {
          display: flex;
          gap: 8px;
        }
        .print-preview-btn {
          border: 1px solid #a8a29e;
          background: #fff;
          color: #1c1917;
          border-radius: 8px;
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .print-preview-btn--primary {
          background: #111827;
          border-color: #111827;
          color: #fff;
        }
        @media print {
          .print-preview-toolbar { display: none !important; }
        }
      </style>
    </head>
    <body>
      <div class="print-preview-toolbar">
        <div class="print-preview-toolbar__left">${esc(title)} - Preview</div>
        <div class="print-preview-toolbar__actions">
          <button class="print-preview-btn print-preview-btn--primary" onclick="window.print()">Print / Save PDF</button>
          <button class="print-preview-btn" onclick="window.close()">Close</button>
        </div>
      </div>
      ${html}
    </body>
  </html>`;
  w.document.open();
  w.document.write(fullHtml);
  w.document.close();
  w.focus();
}

export function buildPurchaseOrderDocument(input: {
  poNumber: string;
  poDate?: string;
  prNumber?: string | null;
  supplier: PartyBlock;
  shipTo: PartyBlock;
  notes?: string;
  requestedBy?: string;
  requisitioner?: string;
  shippedVia?: string;
  fobPoint?: string;
  terms?: string;
  lines: Array<{ description: string; qty: number; unit: string; unitPrice: number }>;
}): string {
  const { branding, tpl } = activeConfig("po");
  const lines = input.lines.length > 0 ? input.lines : [{ description: "-", qty: 0, unit: "Nos", unitPrice: 0 }];
  const subtotal = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  return `
  <div class="doc">
    <div class="top">
      <h1 class="title" style="text-align:${tpl.titleAlign}">${esc(tpl.title)}</h1>
      <div class="meta">
        <div>${barcode(input.poNumber)}</div>
        <div><strong>${esc(branding.companyName)}</strong></div>
        <div>${esc(branding.companySlogan)}</div>
        <div>${esc(branding.companyAddress)}</div>
        <div>${esc(branding.companyCityStateZip)}</div>
        <div>Phone: ${esc(branding.companyPhone)}</div>
        <div>Email: ${esc(branding.companyEmail)}</div>
      </div>
    </div>
    <div class="sec grid-3">
      <div class="box">
        <div class="box-h">${esc(lbl(tpl.labels, "toLabel", "To"))}</div>
        <div class="box-b">
          <div><strong>${esc(input.supplier.name)}</strong></div>
          <div>${esc(input.supplier.address ?? "-")}</div>
          <div>Phone: ${esc(input.supplier.phone ?? "-")}</div>
          <div>Email: ${esc(input.supplier.email ?? "-")}</div>
          <div>GSTIN: ${esc(input.supplier.gstin ?? "-")}</div>
        </div>
      </div>
      <div class="box">
        <div class="box-h">${esc(lbl(tpl.labels, "shipToLabel", "Ship To"))}</div>
        <div class="box-b">
          <div><strong>${esc(input.shipTo.name)}</strong></div>
          <div>${esc(input.shipTo.address ?? "-")}</div>
          <div>Phone: ${esc(input.shipTo.phone ?? "-")}</div>
          <div>Email: ${esc(input.shipTo.email ?? "-")}</div>
        </div>
      </div>
      <div class="box">
        <div class="box-h">${esc(lbl(tpl.labels, "numberLabel", "PO Number"))}</div>
        <div class="box-b">
          <div><strong>${esc(input.poNumber)}</strong></div>
          <div class="small mt8">PR Ref: ${esc(input.prNumber ?? "-")}</div>
          <div class="small mt8">PO Date: ${esc(formatDate(input.poDate))}</div>
          <div class="small">Requester: ${esc(input.requestedBy ?? "-")}</div>
          <div class="small">Terms: ${esc(input.terms ?? tpl.defaultTerms)}</div>
        </div>
      </div>
    </div>
    <div class="sec">
      <table>
        <thead>
          <tr>
            <th>${esc(lbl(tpl.labels, "dateLabel", "PO Date"))}</th>
            <th>${esc(lbl(tpl.labels, "requisitionerLabel", "Requisitioner"))}</th>
            <th>${esc(lbl(tpl.labels, "shippedViaLabel", "Shipped Via"))}</th>
            <th>${esc(lbl(tpl.labels, "fobLabel", "FOB Point"))}</th>
            <th>${esc(lbl(tpl.labels, "termsLabel", "Terms"))}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${esc(formatDate(input.poDate))}</td>
            <td>${esc(input.requisitioner ?? input.requestedBy ?? "-")}</td>
            <td>${esc(input.shippedVia ?? "Road")}</td>
            <td>${esc(input.fobPoint ?? "Destination")}</td>
            <td>${esc(input.terms ?? tpl.defaultTerms)}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="sec">
      <table>
        <thead>
          <tr><th>Qty</th><th>Unit</th><th>Description</th><th class="right">Unit Price</th><th class="right">Total</th></tr>
        </thead>
        <tbody>
          ${lines
            .map(
              (l) => `<tr>
              <td>${l.qty}</td>
              <td>${esc(l.unit)}</td>
              <td>${esc(l.description)}</td>
              <td class="right">${formatMoney(l.unitPrice)}</td>
              <td class="right">${formatMoney(l.qty * l.unitPrice)}</td>
            </tr>`,
            )
            .join("")}
        </tbody>
        <tfoot>
          <tr><td colspan="4" class="right"><strong>Total</strong></td><td class="right"><strong>${formatMoney(subtotal)}</strong></td></tr>
        </tfoot>
      </table>
    </div>
    <div class="sec small"><strong>Notes:</strong> ${esc(input.notes || "-")}</div>
    <div class="sign"><div class="sign-line">${esc(tpl.signLabelPrimary)}</div><div class="sign-line">${esc(tpl.signLabelSecondary)}</div></div>
  </div>
  <style>${baseStyle()}</style>`;
}

export function buildPrDocument(input: {
  prNumber: string;
  createdAt?: string;
  regionId: string;
  regionName?: string;
  storeId: string;
  storeName?: string;
  neededBy?: string | null;
  notes?: string;
  lines: Array<{ description: string; qty: number; reason?: string }>;
}): string {
  const { branding, tpl } = activeConfig("pr");
  const lines = input.lines.length > 0 ? input.lines : [{ description: "-", qty: 0, reason: "-" }];
  return `
  <div class="doc">
    <table>
      <tbody>
        <tr>
          <td style="width:20%;text-align:center;">${barcode(input.prNumber)}</td>
          <td style="width:60%;text-align:center;"><strong>${esc(branding.companyName)}</strong></td>
          <td style="width:20%;text-align:center;">Normal</td>
        </tr>
      </tbody>
    </table>
    <div class="sec subhead" style="text-align:${tpl.titleAlign}">${esc(tpl.title)}</div>
    <div class="sec">
      <table>
        <tbody>
          <tr><td><strong>${esc(lbl(tpl.labels, "organizationLabel", "Organization"))}:</strong></td><td>${esc(branding.companyName)}</td><td><strong>${esc(lbl(tpl.labels, "documentNoLabel", "Document No"))}:</strong></td><td>${esc(input.prNumber)}</td></tr>
          <tr><td><strong>${esc(lbl(tpl.labels, "departmentLabel", "Department"))}:</strong></td><td>Inventory</td><td><strong>${esc(lbl(tpl.labels, "revisionLabel", "Revision"))}:</strong></td><td>1</td></tr>
          <tr><td><strong>${esc(lbl(tpl.labels, "sectionLabel", "Section"))}:</strong></td><td>Store</td><td><strong>${esc(lbl(tpl.labels, "sheetLabel", "Sheet"))}:</strong></td><td>1 of 1</td></tr>
        </tbody>
      </table>
    </div>
    <div class="sec"><strong>${esc(lbl(tpl.labels, "detailsLabel", "Details"))}</strong>
      <table>
        <tbody>
          <tr><td><strong>Date of request</strong></td><td>${esc(formatDate(input.createdAt))}</td><td><strong>Date required</strong></td><td>${esc(formatDate(input.neededBy))}</td></tr>
          <tr><td><strong>Requested By</strong></td><td>${esc(input.storeName ?? input.storeId)}</td><td><strong>Approval Manager</strong></td><td>${esc(tpl.signLabelSecondary)}</td></tr>
          <tr><td><strong>Cost Center</strong></td><td>${esc(input.regionName ?? input.regionId)}</td><td><strong>GL Account</strong></td><td>-</td></tr>
          <tr><td><strong>Vendor Name</strong></td><td>-</td><td><strong>Vendor Contact</strong></td><td>-</td></tr>
        </tbody>
      </table>
    </div>
    <div class="sec">
      <table>
        <thead>
          <tr><th>S No.</th><th>Material Code</th><th>Material Name</th><th>Qty</th><th>Unit Price</th><th>Total Price</th></tr>
        </thead>
        <tbody>
          ${lines
            .map((l, i) => `<tr><td>${i + 1}</td><td>MC ${String(i + 1).padStart(3, "0")}</td><td>${esc(l.description)}</td><td>${l.qty}</td><td>-</td><td>-</td></tr>`)
            .join("")}
        </tbody>
      </table>
    </div>
    <div class="sec small"><strong>Notes:</strong> ${esc(input.notes || "-")}</div>
    <div class="sign"><div class="sign-line">${esc(tpl.signLabelPrimary)}</div><div class="sign-line">${esc(tpl.signLabelSecondary)}</div></div>
  </div>
  <style>${baseStyle()}</style>`;
}

export function buildGrnDocument(input: {
  grnNumber: string;
  createdAt?: string;
  poNumber: string;
  supplierName: string;
  mode: string;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  notes?: string;
  lines: Array<{ description: string; qtyReceived: number }>;
}): string {
  const { branding, tpl } = activeConfig("grn");
  const lines = input.lines.length > 0 ? input.lines : [{ description: "-", qtyReceived: 0 }];
  const totalItems = lines.length;
  const totalAmount = 0;
  return `
  <div class="doc">
    <h1 class="title" style="text-align:${tpl.titleAlign};font-size:38px;">${esc(tpl.title)}</h1>
    <div class="line"></div>
    <div class="sec" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div>
        <p>${barcode(input.grnNumber)}</p>
        <p><strong>GRN NUMBER:</strong> ${esc(input.grnNumber)}</p>
        <p><strong>DATE:</strong> ${esc(formatDate(input.createdAt))}</p>
      </div>
      <div class="meta" style="text-align:left;">
        <p><strong>${esc(branding.companyName)}</strong></p>
        <p>${esc(branding.companyAddress)}</p>
      </div>
    </div>
    <div class="sec" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div>
        <p><strong>${esc(lbl(tpl.labels, "deliveryInfoLabel", "DELIVERY INFORMATION"))}:</strong></p>
        <p>Delivery note: ${esc(input.poNumber)}</p>
        <p>Delivery date: ${esc(formatDate(input.createdAt))}</p>
        <p>Carrier: -</p>
      </div>
      <div>
        <p><strong>${esc(lbl(tpl.labels, "supplierInfoLabel", "SUPPLIER INFORMATION"))}:</strong></p>
        <p>Supplier Name: ${esc(input.supplierName)}</p>
        <p>Supplier Contact: ${esc(branding.companyPhone)}</p>
      </div>
    </div>
    <div class="sec">
      <table>
        <thead><tr><th>Item</th><th>Description</th><th>Unit Of Measure</th><th>Quantity Ordered</th><th>Quantity Received</th><th>Unit Price</th><th>Total Price</th></tr></thead>
        <tbody>
          ${lines
            .map(
              (l, i) =>
                `<tr><td>${i + 1}</td><td>${esc(l.description)}</td><td>Nos</td><td>${l.qtyReceived}</td><td>${l.qtyReceived}</td><td>-</td><td>-</td></tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>
    <div class="sec" style="width:45%;margin-left:auto;">
      <table>
        <tbody>
          <tr><td><strong>Total Items</strong></td><td>${totalItems}</td></tr>
          <tr><td><strong>Total Amount</strong></td><td>${formatMoney(totalAmount)}</td></tr>
        </tbody>
      </table>
    </div>
    <div class="sec"><strong>${esc(lbl(tpl.labels, "receivedConditionLabel", "Received Condition"))}:</strong> ____________________________________________</div>
    <div class="sec"><strong>${esc(lbl(tpl.labels, "commentsLabel", "Comments"))}:</strong> ${esc(input.notes || "-")}</div>
    <div class="sign"><div class="sign-line">${esc(tpl.signLabelPrimary)}</div><div class="sign-line">${esc(tpl.signLabelSecondary)}</div></div>
  </div>
  <style>${baseStyle()}</style>`;
}

export function buildTransferDocument(input: {
  refNumber: string;
  date?: string;
  fromLocation: string;
  toLocation: string;
  lines: Array<{ description: string; qty: number }>;
}): string {
  const { branding, tpl } = activeConfig("transfer");
  return `
  <div class="doc">
    <div class="top">
      <h1 class="title" style="text-align:${tpl.titleAlign}">${esc(tpl.title)}</h1>
      <div class="meta">
        <div>${barcode(input.refNumber)}</div>
        <div><strong>${esc(branding.companyName)}</strong></div>
        <div><strong>Ref: ${esc(input.refNumber)}</strong></div>
        <div>Date: ${esc(formatDate(input.date))}</div>
      </div>
    </div>
    <div class="sec small">${esc(lbl(tpl.labels, "fromLabel", "From"))}: ${esc(input.fromLocation)} | ${esc(lbl(tpl.labels, "toLabel", "To"))}: ${esc(input.toLocation)}</div>
    <div class="sec">
      <table>
        <thead><tr><th>Line</th><th>Description</th><th>${esc(lbl(tpl.labels, "qtyLabel", "Transfer Qty"))}</th></tr></thead>
        <tbody>
          ${input.lines.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.description)}</td><td>${l.qty}</td></tr>`).join("")}
        </tbody>
      </table>
    </div>
    <div class="sign"><div class="sign-line">${esc(tpl.signLabelPrimary)}</div><div class="sign-line">${esc(tpl.signLabelSecondary)}</div></div>
  </div>
  <style>${baseStyle()}</style>`;
}
