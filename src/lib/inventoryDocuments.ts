import { getActiveTemplateByKind, listTemplateFieldReferences, loadDocumentTemplateStore } from "./documentTemplates";
import { documentBarcodeImageSrc } from "./invoiceScanCodes";
import { POPPINS_FONT_CSS, POPPINS_GOOGLE_HEAD } from "./appFonts";
import { getAppLogoUrl } from "./appBranding";
import { grnDocDateLabel, grnDocNumberLabel, grnModeLabel, grnTypeDetail, isDirectGrn } from "./grnMode";
import { inrAmountToWords } from "./inrAmountToWords";
import { printRegion, printSpare, printStore, printSupplier } from "./printContext";
import { formatRegionAddress, normalizeGstin } from "./transferDocumentKind";
import type { DocumentKind } from "../types/documentTemplate";
import type { Supplier, SupplierLocation } from "../types/supplier";

type PartyBlock = {
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  /** Extra lines under the party (e.g. supplier code, contact person). */
  extra?: string[];
};

/** Line fields shared by every inventory document. Missing SKU/HSN/brand are filled from the spare master. */
type DocLineInput = {
  spareId?: string | null;
  description: string;
  sku?: string | null;
  brand?: string | null;
  hsn?: string | null;
  uom?: string | null;
};

type PricedLine = DocLineInput & {
  qty: number;
  rate: number;
  gstRate: number | null;
  taxAmount?: number | null;
};

// ── Formatting ────────────────────────────────────────────────────────────────

function esc(v: string | number | null | undefined): string {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function dash(v: string | number | null | undefined): string {
  const s = String(v ?? "").trim();
  return s ? esc(s) : "—";
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatMoney(value: number): string {
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function formatQty(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

function activeConfig(kind: DocumentKind) {
  const store = loadDocumentTemplateStore();
  const tpl = getActiveTemplateByKind(store, kind);
  return { branding: store.branding, tpl };
}

const PLACEHOLDER_LABELS = new Set(
  (["po", "pr", "grn", "transfer"] as DocumentKind[]).flatMap((k) =>
    listTemplateFieldReferences(k).map((r) => r.label.replace(" label", "").trim().toLowerCase()),
  ),
);

/** Template label override, ignoring the auto-generated placeholder text ("… title"). */
function lbl(labels: Record<string, string>, key: string, fallback: string): string {
  const v = labels[key]?.trim();
  if (!v || PLACEHOLDER_LABELS.has(v.toLowerCase())) return fallback;
  return v;
}

// ── Parties ───────────────────────────────────────────────────────────────────

function hoParty(regionId?: string | null, fallbackName?: string | null): PartyBlock {
  const region = printRegion(regionId);
  if (region) {
    return {
      name: `${region.name}${/\bHO\b/i.test(region.name) ? "" : " — HO"}`,
      address: formatRegionAddress(region),
      phone: region.phone,
      email: region.email,
      gstin: region.gst,
    };
  }
  const { branding } = activeConfig("po");
  return {
    name: fallbackName?.trim() || branding.companyName,
    address: [branding.companyAddress, branding.companyCityStateZip].filter(Boolean).join(", "),
    phone: branding.companyPhone,
    email: branding.companyEmail,
  };
}

function storeParty(storeId?: string | null, fallbackName?: string | null): PartyBlock {
  const hit = printStore(storeId);
  if (hit) {
    const { store, region } = hit;
    return {
      name: store.invoiceDisplayName?.trim() || store.name,
      address: store.invoiceAddress?.trim() || formatRegionAddress(region),
      phone: store.invoicePhone?.trim() || region.phone,
      email: store.invoiceEmail?.trim() || region.email,
      gstin: store.invoiceGstin?.trim() || region.gst,
    };
  }
  return { name: fallbackName?.trim() || String(storeId ?? "").trim() || "—" };
}

function locationAddress(loc: SupplierLocation): string {
  return [loc.doorNo, loc.street, loc.place, loc.district, [loc.state, loc.pinCode].filter(Boolean).join(" - ")]
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

function supplierAddress(s: Supplier): string {
  if (s.address?.trim()) return s.address.trim();
  const loc = s.locations?.[0];
  return loc ? locationAddress(loc) : "";
}

function supplierParty(input: {
  supplierId?: string | null;
  supplierBranchId?: string | null;
  supplierName?: string | null;
  supplier?: PartyBlock;
}): PartyBlock {
  const master = printSupplier(input.supplierId);
  const branch = input.supplierBranchId
    ? master?.locations?.find((l) => l.id === input.supplierBranchId) ?? null
    : null;
  const given = input.supplier;
  const name = given?.name?.trim() || master?.name || input.supplierName?.trim() || "—";
  const branchPhone = branch?.phone?.trim();
  const phones = branchPhone
    ? [branchPhone]
    : [given?.phone || master?.phone, master?.alternatePhone].filter((x): x is string => Boolean(x?.trim()));
  const extra: string[] = [...(given?.extra ?? [])];
  if (master?.supplierCode) extra.unshift(`Supplier code: ${master.supplierCode}`);
  if (branch?.branchName) extra.push(`Branch: ${branch.branchName}`);
  const contact = branch?.contactName?.trim() || master?.contactName;
  if (contact) extra.push(`Contact: ${contact}`);
  const branchAddr = branch ? locationAddress(branch) : "";
  return {
    name,
    address: given?.address || branchAddr || (master ? supplierAddress(master) : ""),
    phone: phones.join(" / "),
    email: given?.email || branch?.email?.trim() || master?.email || "",
    gstin: given?.gstin || master?.gst || "",
    extra,
  };
}

function partyHtml(heading: string, p: PartyBlock): string {
  const rows = [
    p.address?.trim() ? `<div class="pa-addr">${esc(p.address)}</div>` : "",
    ...(p.extra ?? []).map((x) => `<div class="pa-row">${esc(x)}</div>`),
    p.phone?.trim() ? `<div class="pa-row"><span>Phone</span>${esc(p.phone)}</div>` : "",
    p.email?.trim() ? `<div class="pa-row"><span>Email</span>${esc(p.email)}</div>` : "",
    `<div class="pa-row"><span>GSTIN</span><b class="mono">${dash(p.gstin)}</b></div>`,
  ].join("");
  return `<div class="party">
    <div class="party-h">${esc(heading)}</div>
    <div class="party-b"><div class="pa-name">${esc(p.name)}</div>${rows}</div>
  </div>`;
}

function partiesHtml(blocks: Array<[string, PartyBlock]>): string {
  return `<div class="parties cols-${blocks.length}">${blocks.map(([h, p]) => partyHtml(h, p)).join("")}</div>`;
}

// ── Layout pieces ─────────────────────────────────────────────────────────────

function headerHtml(input: { title: string; docNo: string; docDate?: string | null; issuer: PartyBlock; subtitle?: string }): string {
  const { branding } = activeConfig("po");
  const logo = getAppLogoUrl();
  const barcodeSrc = documentBarcodeImageSrc(input.docNo, { scale: 2, height: 10 });
  const issuerLines = [
    input.issuer.address,
    [input.issuer.phone ? `Ph: ${input.issuer.phone}` : "", input.issuer.email ? `Email: ${input.issuer.email}` : ""]
      .filter(Boolean)
      .join("  ·  "),
    input.issuer.gstin ? `GSTIN: ${input.issuer.gstin}` : "",
  ].filter((x) => String(x ?? "").trim());
  return `<div class="hd">
    <div class="hd-co">
      ${logo ? `<img class="hd-logo" src="${esc(logo)}" alt="" onerror="this.style.display='none'" />` : ""}
      <div>
        <div class="hd-brand">${esc(branding.companyName)}</div>
        <div class="hd-office">${esc(input.issuer.name)}</div>
        ${issuerLines.map((l) => `<div class="hd-line">${esc(l)}</div>`).join("")}
      </div>
    </div>
    <div class="hd-doc">
      <div class="hd-title">${esc(input.title)}</div>
      ${input.subtitle ? `<div class="hd-sub">${esc(input.subtitle)}</div>` : ""}
      <img class="hd-barcode" src="${barcodeSrc}" alt="${esc(input.docNo)}" />
      <div class="hd-no mono">${esc(input.docNo)}</div>
      <div class="hd-date">Date: <b>${esc(formatDate(input.docDate))}</b></div>
    </div>
  </div>`;
}

function metaHtml(cells: Array<[string, string | null | undefined]>): string {
  const visible = cells.filter(([, v]) => v !== undefined);
  return `<div class="meta">${visible
    .map(([k, v]) => `<div class="meta-c"><div class="meta-k">${esc(k)}</div><div class="meta-v">${dash(v)}</div></div>`)
    .join("")}</div>`;
}

function enrichLine<T extends DocLineInput>(l: T): T & { sku: string; brand: string; hsn: string; uom: string; name: string } {
  const spare = printSpare(l.spareId);
  const rawDesc = String(l.description ?? "").trim();
  const name = !rawDesc || rawDesc === l.spareId ? spare?.name ?? rawDesc : rawDesc;
  return {
    ...l,
    name: name || "—",
    sku: String(l.sku ?? spare?.sku ?? "").trim(),
    brand: String(l.brand ?? spare?.brand ?? "").trim(),
    hsn: String(l.hsn ?? spare?.hsn ?? "").trim(),
    uom: String(l.uom ?? "").trim() || "Nos",
  };
}

function itemCellHtml(l: { name: string; sku: string; brand: string }): string {
  const sub = [l.sku ? `SKU ${l.sku}` : "", l.brand].filter(Boolean).join(" · ");
  return `<div class="it-name">${esc(l.name)}</div>${sub ? `<div class="it-sub">${esc(sub)}</div>` : ""}`;
}

function sameStateSupply(a?: string | null, b?: string | null): boolean | null {
  const x = normalizeGstin(a);
  const y = normalizeGstin(b);
  if (x.length < 2 || y.length < 2) return null;
  return x.slice(0, 2) === y.slice(0, 2);
}

function pricedTableHtml(
  rawLines: PricedLine[],
  opts: { qtyLabel: string; supplierGstin?: string | null; hoGstin?: string | null },
): { html: string; grandTotal: number; hasPricing: boolean } {
  const lines = rawLines.map(enrichLine);
  const hasPricing = lines.some((l) => l.rate > 0);
  let taxable = 0;
  let tax = 0;
  let qty = 0;
  const body = lines
    .map((l, i) => {
      const lineTaxable = round2(l.rate * l.qty);
      const rate = l.gstRate ?? 0;
      const lineTax = l.taxAmount != null && Number.isFinite(l.taxAmount) ? round2(l.taxAmount) : round2((lineTaxable * rate) / 100);
      taxable += lineTaxable;
      tax += lineTax;
      qty += l.qty;
      const money = (v: number) => (hasPricing && l.rate > 0 ? formatMoney(v) : "—");
      return `<tr>
        <td class="c">${i + 1}</td>
        <td>${itemCellHtml(l)}</td>
        <td class="c mono">${dash(l.hsn)}</td>
        <td class="r">${formatQty(l.qty)}</td>
        <td class="c">${esc(l.uom)}</td>
        <td class="r">${money(l.rate)}</td>
        <td class="r">${money(lineTaxable)}</td>
        <td class="c">${hasPricing && l.rate > 0 && l.gstRate != null ? `${l.gstRate}%` : "—"}</td>
        <td class="r">${money(lineTax)}</td>
        <td class="r b">${money(lineTaxable + lineTax)}</td>
      </tr>`;
    })
    .join("");
  taxable = round2(taxable);
  tax = round2(tax);
  const exact = round2(taxable + tax);
  const grandTotal = Math.round(exact);
  const roundOff = round2(grandTotal - exact);
  const intra = sameStateSupply(opts.supplierGstin, opts.hoGstin);
  const taxRows = !hasPricing
    ? ""
    : intra === false
      ? `<tr><td>IGST</td><td class="r">${formatMoney(tax)}</td></tr>`
      : `<tr><td>CGST</td><td class="r">${formatMoney(round2(tax / 2))}</td></tr>
         <tr><td>SGST</td><td class="r">${formatMoney(round2(tax - round2(tax / 2)))}</td></tr>`;
  const html = `<table class="lines">
      <thead><tr>
        <th class="c" style="width:26px">#</th>
        <th>Item / part</th>
        <th class="c" style="width:64px">HSN</th>
        <th class="r" style="width:48px">${esc(opts.qtyLabel)}</th>
        <th class="c" style="width:40px">UOM</th>
        <th class="r" style="width:72px">Rate (₹)</th>
        <th class="r" style="width:82px">Taxable (₹)</th>
        <th class="c" style="width:42px">GST</th>
        <th class="r" style="width:70px">GST (₹)</th>
        <th class="r" style="width:86px">Amount (₹)</th>
      </tr></thead>
      <tbody>${body || `<tr><td colspan="10" class="c muted">No lines</td></tr>`}</tbody>
      <tfoot><tr>
        <td></td><td class="b">Total (${lines.length} line${lines.length === 1 ? "" : "s"})</td><td></td>
        <td class="r b">${formatQty(qty)}</td><td></td><td></td>
        <td class="r b">${hasPricing ? formatMoney(taxable) : "—"}</td><td></td>
        <td class="r b">${hasPricing ? formatMoney(tax) : "—"}</td>
        <td class="r b">${hasPricing ? formatMoney(exact) : "—"}</td>
      </tr></tfoot>
    </table>
    ${
      hasPricing
        ? `<div class="sum">
      <div class="sum-words"><div class="meta-k">Amount in words</div><div class="words">${esc(inrAmountToWords(grandTotal))}</div></div>
      <table class="sum-t"><tbody>
        <tr><td>Taxable value</td><td class="r">${formatMoney(taxable)}</td></tr>
        ${taxRows}
        ${roundOff !== 0 ? `<tr><td>Round off</td><td class="r">${roundOff > 0 ? "+" : ""}${formatMoney(roundOff)}</td></tr>` : ""}
        <tr class="grand"><td>Grand total</td><td class="r">₹ ${formatMoney(grandTotal)}</td></tr>
      </tbody></table>
    </div>`
        : ""
    }`;
  return { html, grandTotal, hasPricing };
}

function qtyTableHtml(
  rawLines: Array<DocLineInput & { qty: number; note?: string | null }>,
  opts: { qtyLabel: string; noteLabel?: string },
): string {
  const lines = rawLines.map(enrichLine);
  const withNote = Boolean(opts.noteLabel);
  const total = lines.reduce((s, l) => s + l.qty, 0);
  const cols = withNote ? 7 : 6;
  return `<table class="lines">
    <thead><tr>
      <th class="c" style="width:26px">#</th>
      <th>Item / part</th>
      <th class="c" style="width:110px">SKU</th>
      <th class="c" style="width:74px">HSN</th>
      <th class="c" style="width:46px">UOM</th>
      <th class="r" style="width:70px">${esc(opts.qtyLabel)}</th>
      ${withNote ? `<th style="width:160px">${esc(opts.noteLabel!)}</th>` : ""}
    </tr></thead>
    <tbody>${
      lines
        .map(
          (l, i) => `<tr>
        <td class="c">${i + 1}</td>
        <td>${itemCellHtml({ ...l, sku: "" })}</td>
        <td class="c mono">${dash(l.sku)}</td>
        <td class="c mono">${dash(l.hsn)}</td>
        <td class="c">${esc(l.uom)}</td>
        <td class="r b">${formatQty(l.qty)}</td>
        ${withNote ? `<td>${dash(l.note)}</td>` : ""}
      </tr>`,
        )
        .join("") || `<tr><td colspan="${cols}" class="c muted">No lines</td></tr>`
    }</tbody>
    <tfoot><tr>
      <td></td><td class="b">Total (${lines.length} line${lines.length === 1 ? "" : "s"})</td><td></td><td></td><td></td>
      <td class="r b">${formatQty(total)}</td>${withNote ? "<td></td>" : ""}
    </tr></tfoot>
  </table>`;
}

function notesHtml(blocks: Array<[string, string | null | undefined]>): string {
  const shown = blocks.filter(([, v]) => String(v ?? "").trim());
  if (!shown.length) return "";
  return `<div class="notes">${shown
    .map(([k, v]) => `<div class="note"><div class="meta-k">${esc(k)}</div><div class="note-v">${esc(String(v))}</div></div>`)
    .join("")}</div>`;
}

function signaturesHtml(labels: string[], forName?: string): string {
  return `<div class="signs cols-${labels.length}">${labels
    .map(
      (l, i) => `<div class="sign">
        ${i === labels.length - 1 && forName ? `<div class="sign-for">For ${esc(forName)}</div>` : `<div class="sign-for">&nbsp;</div>`}
        <div class="sign-line"></div>
        <div class="sign-l">${esc(l)}</div>
      </div>`,
    )
    .join("")}</div>`;
}

function footerHtml(): string {
  const printed = new Date().toLocaleString("en-IN", { hour12: true });
  return `<div class="ft"><span>This is a computer generated document.</span><span>Printed on ${esc(printed)}</span></div>`;
}

function wrapDoc(inner: string): string {
  return `<div class="doc">${inner}${footerHtml()}</div><style>${docStyle()}</style>`;
}

function docStyle(): string {
  return `
  @page { size: A4; margin: 10mm; }
  body { font-family: ${POPPINS_FONT_CSS}; margin: 0; padding: 16px; color: #0D1B2A; background: #eef1f7; }
  .doc { box-sizing: border-box; width: 100%; max-width: 190mm; margin: 0 auto; background: #fff; border: 1px solid #1B3A8F; padding: 14px 16px; font-size: 11px; line-height: 1.4; }
  .doc * { box-sizing: border-box; }
  .mono { font-family: Consolas, 'Courier New', monospace; }
  .muted { color: #64748b; }
  .b { font-weight: 700; }
  .c { text-align: center; }
  .r { text-align: right; }

  .hd { display: grid; grid-template-columns: 1fr auto; gap: 16px; align-items: start; padding-bottom: 10px; border-bottom: 3px solid #1B3A8F; }
  .hd-co { display: flex; gap: 10px; align-items: flex-start; min-width: 0; }
  .hd-logo { width: 54px; height: 54px; object-fit: contain; flex-shrink: 0; }
  .hd-brand { font-size: 17px; font-weight: 800; color: #1B3A8F; text-transform: uppercase; letter-spacing: .3px; }
  .hd-office { font-size: 12px; font-weight: 700; margin-top: 1px; }
  .hd-line { font-size: 10.5px; color: #334155; }
  .hd-doc { text-align: right; min-width: 200px; }
  .hd-title { font-size: 19px; font-weight: 800; color: #1B3A8F; text-transform: uppercase; letter-spacing: .6px; line-height: 1.15; }
  .hd-sub { font-size: 10.5px; color: #475569; margin-top: 2px; }
  .hd-barcode { display: block; margin: 6px 0 2px auto; height: 40px; max-width: 220px; object-fit: contain; }
  .hd-no { font-size: 12px; font-weight: 700; }
  .hd-date { font-size: 11px; margin-top: 1px; }
  .accent { height: 3px; background: #C9A227; margin-top: 2px; }

  .meta { display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid #cbd5e1; border-bottom: 0; border-right: 0; margin-top: 10px; }
  .meta-c { padding: 5px 8px; border-right: 1px solid #cbd5e1; border-bottom: 1px solid #cbd5e1; min-height: 38px; }
  .meta-k { font-size: 8.5px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: .5px; }
  .meta-v { font-size: 11px; font-weight: 600; margin-top: 1px; word-break: break-word; }

  .parties { display: grid; gap: 8px; margin-top: 10px; }
  .parties.cols-2 { grid-template-columns: 1fr 1fr; }
  .parties.cols-3 { grid-template-columns: 1fr 1fr 1fr; }
  .party { border: 1px solid #cbd5e1; display: flex; flex-direction: column; }
  .party-h { background: #1B3A8F; color: #fff; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .6px; padding: 4px 8px; }
  .party-b { padding: 6px 8px; flex: 1; }
  .pa-name { font-size: 12px; font-weight: 700; margin-bottom: 2px; }
  .pa-addr { color: #334155; margin-bottom: 3px; }
  .pa-row { display: flex; gap: 6px; }
  .pa-row span { display: inline-block; min-width: 42px; color: #64748b; font-size: 9.5px; text-transform: uppercase; padding-top: 1px; }

  table { width: 100%; border-collapse: collapse; }
  .lines { margin-top: 10px; table-layout: auto; }
  .lines th { background: #1B3A8F; color: #fff; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .4px; padding: 5px 5px; border: 1px solid #1B3A8F; text-align: left; }
  .lines th.c { text-align: center; } .lines th.r { text-align: right; }
  .lines td { border: 1px solid #d5dbe7; padding: 5px; vertical-align: top; font-size: 10.5px; }
  .lines tbody tr:nth-child(even) td { background: #f8fafc; }
  .lines tfoot td { background: #eef2fb; border-top: 2px solid #1B3A8F; font-size: 10.5px; }
  .lines thead { display: table-header-group; }
  .lines tr { page-break-inside: avoid; }
  .it-name { font-weight: 600; }
  .it-sub { font-size: 9.5px; color: #64748b; margin-top: 1px; }

  .sum { display: grid; grid-template-columns: 1fr 250px; gap: 12px; margin-top: 8px; align-items: start; }
  .sum-words { border: 1px dashed #cbd5e1; padding: 6px 8px; }
  .words { font-weight: 600; margin-top: 2px; }
  .sum-t td { border: 1px solid #d5dbe7; padding: 4px 8px; font-size: 11px; }
  .sum-t .grand td { background: #1B3A8F; color: #fff; font-weight: 800; font-size: 12px; border-color: #1B3A8F; }

  .notes { display: grid; gap: 6px; margin-top: 10px; }
  .note { border: 1px solid #e2e8f0; padding: 6px 8px; }
  .note-v { margin-top: 2px; white-space: pre-wrap; }
  .check { display: flex; gap: 18px; flex-wrap: wrap; margin-top: 3px; }
  .box { display: inline-block; width: 10px; height: 10px; border: 1px solid #0D1B2A; margin-right: 4px; vertical-align: -1px; }

  .signs { display: grid; gap: 18px; margin-top: 26px; }
  .signs.cols-2 { grid-template-columns: 1fr 1fr; }
  .signs.cols-3 { grid-template-columns: 1fr 1fr 1fr; }
  .sign { text-align: center; }
  .sign-for { font-size: 10px; font-weight: 700; min-height: 14px; }
  .sign-line { border-top: 1px solid #0D1B2A; margin-top: 30px; }
  .sign-l { font-size: 10px; margin-top: 3px; color: #334155; }

  .ft { display: flex; justify-content: space-between; margin-top: 14px; padding-top: 6px; border-top: 1px solid #e2e8f0; font-size: 9px; color: #64748b; }

  @media print {
    body { padding: 0; background: #fff; }
    .doc { border: none; padding: 0; max-width: none; }
    .lines th, .party-h, .sum-t .grand td, .lines tfoot td, .lines tbody tr:nth-child(even) td { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
  `;
}

/** Shared layout pieces for non-inventory documents that should match the inventory print style. */
export const standardDoc = {
  esc,
  formatDate,
  formatMoney,
  header: headerHtml,
  meta: metaHtml,
  parties: partiesHtml,
  notes: notesHtml,
  signatures: signaturesHtml,
  wrap: wrapDoc,
  hoParty,
  storeParty,
  companyName: () => activeConfig("po").branding.companyName,
};

// ── Preview window ────────────────────────────────────────────────────────────

export function openPrintDocument(title: string, html: string): void {
  const w = window.open("", "_blank");
  if (!w) {
    window.alert("Popup blocked. Please allow popups for this site and retry print.");
    return;
  }
  const baseHref = window.location.origin;
  const fullHtml = `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <base href="${esc(baseHref)}/" />
      ${POPPINS_GOOGLE_HEAD}
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
          font-family: ${POPPINS_FONT_CSS};
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
          background: #1B3A8F;
          border-color: #1B3A8F;
          color: #C9A227;
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

// ── Purchase order / voucher ──────────────────────────────────────────────────

type PurchaseLineInput = DocLineInput & {
  qty: number;
  unit?: string;
  unitPrice: number;
  gstRate?: number | null;
  taxAmount?: number | null;
};

type PurchaseDocInput = {
  regionId?: string | null;
  supplierId?: string | null;
  supplierBranchId?: string | null;
  supplier: PartyBlock;
  shipTo: PartyBlock;
  shipToStoreId?: string | null;
  notes?: string;
  requestedBy?: string;
  requisitioner?: string;
  shippedVia?: string;
  fobPoint?: string;
  terms?: string;
  status?: string | null;
  lines: PurchaseLineInput[];
};

function toPricedLines(lines: PurchaseLineInput[]): PricedLine[] {
  return lines.map((l) => {
    const spare = printSpare(l.spareId);
    return {
      ...l,
      uom: l.uom ?? l.unit,
      rate: Number(l.unitPrice) || 0,
      qty: Number(l.qty) || 0,
      gstRate: l.gstRate ?? spare?.gstPercent ?? null,
      taxAmount: l.taxAmount != null && l.taxAmount > 0 ? l.taxAmount : null,
    };
  });
}

function purchaseDocument(
  kind: "po" | "voucher",
  input: PurchaseDocInput & { docNo: string; docDate?: string; refCells: Array<[string, string | null | undefined]> },
): string {
  const { branding, tpl } = activeConfig("po");
  const issuer = hoParty(input.regionId);
  const supplier = supplierParty({ supplierId: input.supplierId, supplierBranchId: input.supplierBranchId, supplier: input.supplier });
  const shipTo = input.shipToStoreId ? storeParty(input.shipToStoreId, input.shipTo.name) : input.shipTo.address ? input.shipTo : { ...issuer, name: input.shipTo.name || issuer.name };
  const table = pricedTableHtml(toPricedLines(input.lines), {
    qtyLabel: "Qty",
    supplierGstin: supplier.gstin,
    hoGstin: issuer.gstin,
  });
  const title = kind === "po" ? tpl.title || "Purchase Order" : "Purchase Voucher";
  return wrapDoc(`
    ${headerHtml({ title, docNo: input.docNo, docDate: input.docDate, issuer })}
    <div class="accent"></div>
    ${metaHtml([
      [kind === "po" ? lbl(tpl.labels, "numberLabel", "PO Number") : "Voucher No.", input.docNo],
      [kind === "po" ? lbl(tpl.labels, "dateLabel", "PO Date") : "Voucher Date", formatDate(input.docDate)],
      ...input.refCells,
      ["Status", input.status ?? undefined],
      [lbl(tpl.labels, "requisitionerLabel", "Requisitioner"), input.requisitioner ?? input.requestedBy ?? undefined],
      [lbl(tpl.labels, "shippedViaLabel", "Shipped Via"), input.shippedVia ?? undefined],
      [lbl(tpl.labels, "fobLabel", "Delivery basis"), input.fobPoint ?? undefined],
    ])}
    ${partiesHtml([
      [lbl(tpl.labels, "toLabel", "Supplier (Bill From)"), supplier],
      [lbl(tpl.labels, "shipToLabel", "Ship To / Deliver At"), shipTo],
    ])}
    ${table.html}
    ${notesHtml([
      [lbl(tpl.labels, "termsLabel", "Terms & conditions"), input.terms ?? tpl.defaultTerms],
      ["Remarks", input.notes],
    ])}
    ${signaturesHtml([tpl.signLabelSecondary || "Prepared By", "Checked By", tpl.signLabelPrimary || "Authorised Signatory"], branding.companyName)}
  `);
}

export function buildPurchaseOrderDocument(
  input: PurchaseDocInput & { poNumber: string; poDate?: string; prNumber?: string | null },
): string {
  return purchaseDocument("po", {
    ...input,
    docNo: input.poNumber,
    docDate: input.poDate,
    refCells: [["PR Reference", input.prNumber ?? undefined]],
  });
}

export function buildPurchaseVoucherDocument(
  input: PurchaseDocInput & {
    voucherNumber: string;
    voucherDate?: string;
    invoiceNumber?: string | null;
    invoiceDate?: string | null;
  },
): string {
  return purchaseDocument("voucher", {
    ...input,
    docNo: input.voucherNumber,
    docDate: input.voucherDate,
    refCells: [
      ["Supplier Invoice No.", input.invoiceNumber ?? "—"],
      ["Supplier Invoice Date", formatDate(input.invoiceDate)],
    ],
  });
}

// ── Purchase requisition ──────────────────────────────────────────────────────

export function buildPrDocument(input: {
  prNumber: string;
  createdAt?: string;
  regionId: string;
  regionName?: string;
  storeId: string;
  storeName?: string;
  neededBy?: string | null;
  notes?: string;
  status?: string | null;
  requestedBy?: string | null;
  lines: Array<DocLineInput & { qty: number; reason?: string }>;
}): string {
  const { branding, tpl } = activeConfig("pr");
  const store = storeParty(input.storeId, input.storeName);
  const ho = hoParty(input.regionId, input.regionName);
  return wrapDoc(`
    ${headerHtml({ title: tpl.title || "Purchase Requisition", docNo: input.prNumber, docDate: input.createdAt, issuer: ho })}
    <div class="accent"></div>
    ${metaHtml([
      [lbl(tpl.labels, "documentNoLabel", "PR Number"), input.prNumber],
      ["Date of request", formatDate(input.createdAt)],
      ["Date required", formatDate(input.neededBy)],
      ["Status", input.status ?? undefined],
      ["Requested by", input.requestedBy ?? undefined],
      ["Department", "Service / Spares"],
    ])}
    ${partiesHtml([
      ["Requesting store", store],
      ["Issue from (HO)", ho],
    ])}
    ${qtyTableHtml(
      input.lines.map((l) => ({ ...l, note: l.reason })),
      { qtyLabel: "Req. Qty", noteLabel: "Reason / remarks" },
    )}
    ${notesHtml([["Remarks", input.notes]])}
    ${signaturesHtml([tpl.signLabelPrimary || "Requested By", "Store Manager", tpl.signLabelSecondary || "Approved By (HO)"], branding.companyName)}
  `);
}

// ── Goods received note ───────────────────────────────────────────────────────

export function buildGrnDocument(input: {
  grnNumber: string;
  createdAt?: string;
  poNumber: string;
  voucherNumber?: string | null;
  regionId?: string | null;
  supplierId?: string | null;
  supplierBranchId?: string | null;
  supplierName: string;
  mode: string;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  receivedBy?: string | null;
  notes?: string;
  lines: Array<
    DocLineInput & { qtyReceived: number; qtyOrdered?: number | null; costPrice?: number; gstRate?: number; taxAmount?: number }
  >;
}): string {
  const { branding, tpl } = activeConfig("grn");
  const receivedAt = hoParty(input.regionId);
  const supplier = supplierParty({ supplierId: input.supplierId, supplierBranchId: input.supplierBranchId, supplierName: input.supplierName });
  const against = input.voucherNumber?.trim()
    ? input.voucherNumber
    : isDirectGrn(input.poNumber)
      ? "Direct GRN (no PO)"
      : input.poNumber;
  const table = pricedTableHtml(
    input.lines.map((l) => ({
      ...l,
      qty: Number(l.qtyReceived) || 0,
      rate: Number(l.costPrice ?? 0) || 0,
      gstRate: l.gstRate ?? printSpare(l.spareId)?.gstPercent ?? 18,
      taxAmount: l.taxAmount,
    })),
    { qtyLabel: "Recd", supplierGstin: supplier.gstin, hoGstin: receivedAt.gstin },
  );
  return wrapDoc(`
    ${headerHtml({ title: tpl.title || "Goods Received Note", docNo: input.grnNumber, docDate: input.createdAt, issuer: receivedAt, subtitle: grnModeLabel(input.mode) })}
    <div class="accent"></div>
    ${metaHtml([
      ["GRN Number", input.grnNumber],
      ["GRN Date", formatDate(input.createdAt)],
      ["GRN Type", grnTypeDetail(input.poNumber, input.voucherNumber)],
      [input.voucherNumber ? "Voucher No." : "PO Number", against],
      [grnDocNumberLabel(input.mode), input.invoiceNumber ?? "—"],
      [grnDocDateLabel(input.mode), formatDate(input.invoiceDate)],
      ["Received by", input.receivedBy ?? undefined],
      ["Total lines", String(input.lines.length)],
    ])}
    ${partiesHtml([
      [lbl(tpl.labels, "supplierInfoLabel", "Supplier"), supplier],
      [lbl(tpl.labels, "deliveryInfoLabel", "Received at"), receivedAt],
    ])}
    ${table.html}
    <div class="notes">
      <div class="note">
        <div class="meta-k">${esc(lbl(tpl.labels, "receivedConditionLabel", "Received condition"))}</div>
        <div class="check">
          <span><i class="box"></i>Good condition</span>
          <span><i class="box"></i>Damaged</span>
          <span><i class="box"></i>Short supply</span>
          <span><i class="box"></i>Excess supply</span>
          <span><i class="box"></i>Qty verified with ${esc(grnDocNumberLabel(input.mode).toLowerCase())}</span>
        </div>
      </div>
      ${input.notes?.trim() ? `<div class="note"><div class="meta-k">${esc(lbl(tpl.labels, "commentsLabel", "Comments"))}</div><div class="note-v">${esc(input.notes)}</div></div>` : ""}
    </div>
    ${signaturesHtml([lbl(tpl.labels, "receivedByLabel", tpl.signLabelPrimary || "Received By"), "Checked By (QC)", tpl.signLabelSecondary || "Authorised Signatory"], branding.companyName)}
  `);
}

// ── HO → store stock transfer ─────────────────────────────────────────────────

export function buildTransferDocument(input: {
  refNumber: string;
  date?: string;
  fromLocation: string;
  toLocation: string;
  regionId?: string | null;
  storeId?: string | null;
  grnNumber?: string | null;
  prNumber?: string | null;
  preparedBy?: string | null;
  notes?: string | null;
  lines: Array<DocLineInput & { qty: number }>;
}): string {
  const { branding, tpl } = activeConfig("transfer");
  const from = input.regionId || printRegion(null) ? hoParty(input.regionId, input.fromLocation) : { name: input.fromLocation };
  const to = input.storeId ? storeParty(input.storeId, input.toLocation) : { name: input.toLocation };
  return wrapDoc(`
    ${headerHtml({ title: tpl.title || "Stock Transfer Note", docNo: input.refNumber, docDate: input.date, issuer: from, subtitle: "Internal stock transfer · HO → Store" })}
    <div class="accent"></div>
    ${metaHtml([
      ["Transfer No.", input.refNumber],
      ["Transfer Date", formatDate(input.date)],
      ["Against GRN", input.grnNumber ?? undefined],
      ["Against PR", input.prNumber ?? undefined],
      ["Prepared by", input.preparedBy ?? undefined],
      ["Total lines", String(input.lines.length)],
    ])}
    ${partiesHtml([
      [lbl(tpl.labels, "fromLabel", "Dispatch from"), from],
      [lbl(tpl.labels, "toLabel", "Deliver to"), to],
    ])}
    ${qtyTableHtml(input.lines, { qtyLabel: lbl(tpl.labels, "qtyLabel", "Qty") })}
    ${notesHtml([
      ["Terms", input.prNumber ? tpl.defaultTerms : null],
      ["Remarks", input.notes],
    ])}
    ${signaturesHtml([tpl.signLabelPrimary || "Dispatched By (HO)", "Carried By", tpl.signLabelSecondary || "Received By (Store)"], branding.companyName)}
  `);
}

// ── Purchase return (debit to supplier) ───────────────────────────────────────

export function buildPurchaseReturnDocument(input: {
  prtNumber: string;
  createdAt?: string;
  returnDate?: string | null;
  grnNumber: string;
  poNumber: string;
  regionId?: string | null;
  supplierId?: string | null;
  supplierBranchId?: string | null;
  supplierName: string;
  reason: string;
  debitNoteNumber?: string | null;
  preparedBy?: string | null;
  notes?: string;
  lines: Array<DocLineInput & { qtyReturned: number; costPrice?: number; gstRate?: number; taxAmount?: number }>;
}): string {
  const { branding } = activeConfig("grn");
  const from = hoParty(input.regionId);
  const supplier = supplierParty({ supplierId: input.supplierId, supplierBranchId: input.supplierBranchId, supplierName: input.supplierName });
  const table = pricedTableHtml(
    input.lines.map((l) => ({
      ...l,
      qty: Number(l.qtyReturned) || 0,
      rate: Number(l.costPrice ?? 0) || 0,
      gstRate: l.gstRate ?? printSpare(l.spareId)?.gstPercent ?? 18,
      taxAmount: l.taxAmount,
    })),
    { qtyLabel: "Ret. Qty", supplierGstin: supplier.gstin, hoGstin: from.gstin },
  );
  const date = input.returnDate || input.createdAt;
  return wrapDoc(`
    ${headerHtml({ title: "Purchase Return", docNo: input.prtNumber, docDate: date, issuer: from, subtitle: "Goods returned to supplier" })}
    <div class="accent"></div>
    ${metaHtml([
      ["Return No.", input.prtNumber],
      ["Return Date", formatDate(date)],
      ["Against GRN", input.grnNumber],
      ["PO Number", isDirectGrn(input.poNumber) ? "Direct GRN" : input.poNumber],
      ["Reason", input.reason],
      ["Debit Note No.", input.debitNoteNumber ?? "—"],
      ["Prepared by", input.preparedBy ?? undefined],
      ["Total lines", String(input.lines.length)],
    ])}
    ${partiesHtml([
      ["Returned to (Supplier)", supplier],
      ["Returned from", from],
    ])}
    ${table.html}
    ${notesHtml([["Remarks", input.notes]])}
    ${signaturesHtml(["Returned By", "Supplier Acknowledgement", "Authorised Signatory"], branding.companyName)}
  `);
}
