import { documentBarcodeImageSrc } from "./invoiceScanCodes";
import { openPrintDocument } from "./inventoryDocuments";
import { getAppLogoUrl } from "./appBranding";
import { POPPINS_FONT_CSS, POPPINS_GOOGLE_HEAD } from "./appFonts";
import type { AdvancePaymentDetails } from "./paymentModes";
import { repairRouteLabel, type SrfRepairRoute } from "./srfRepairRoute";
import type { SrfJob } from "../types/srfJob";
import {
  transferDocumentTitle,
  transferNumberLabel,
  transferFlowDirection,
  type TransferFlow,
  type TransferPartyBlock,
  type TransferPrintKind,
} from "./transferDocumentKind";
import { publicMediaUrl } from "./mediaUrl";

export type { TransferFlow, TransferPartyBlock, TransferPrintKind } from "./transferDocumentKind";
export type TransferPrintMeta = {
  printKind: TransferPrintKind;
  flow: TransferFlow;
  transferNumber: string;
  from: TransferPartyBlock;
  to: TransferPartyBlock;
};

function base(title: string, body: string): string {
  const baseHref = typeof window !== "undefined" ? window.location.origin : "";
  return `<!doctype html>
  <html>
    <head><meta charset="utf-8"/>${POPPINS_GOOGLE_HEAD}<title>${title}</title></head>
    <base href="${baseHref}/" />
    <body style="font-family:${POPPINS_FONT_CSS};padding:24px;color:#111">
      ${body}
    </body>
  </html>`;
}

function barcodeBlock(reference: string): string {
  const src = documentBarcodeImageSrc(reference, { scale: 2, height: 10 });
  return `<div style="display:flex;flex-direction:column;align-items:flex-end;margin-bottom:8px">
    <img src="${src}" alt="Barcode ${escHtml(reference)}" style="border:1px solid #111;padding:4px;background:#fff;max-width:260px;height:52px;object-fit:contain;display:block"/>
    <p style="margin:5px 0 0;font-family:Consolas,'Courier New',monospace;font-size:11px;font-weight:700;letter-spacing:0.05em;color:#0d1b2a">${escHtml(reference)}</p>
  </div>`;
}


function backendOrigin(): string {
  if (typeof window === "undefined") return "";
  const { protocol, hostname, origin } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `${protocol}//${hostname}:4000`;
  }
  return origin;
}

function absolutePhotoSrc(filePath: string): string {
  if (/^https?:\/\//i.test(filePath)) return filePath;
  return `${backendOrigin()}${publicMediaUrl(filePath)}`;
}

function formatAdvanceForPrint(
  advanceInr: number | undefined,
  mode: string | null | undefined,
  details: AdvancePaymentDetails | null | undefined,
): string {
  if (!advanceInr || advanceInr <= 0) return "";
  const parts: string[] = [`<div style="margin-top:8px"><strong>Advance collected:</strong> INR ${advanceInr.toFixed(2)} (${mode ?? "-"})</div>`];
  if (details?.reference) {
    parts.push(`<div style="margin-top:4px;font-size:12px"><strong>Payment ref:</strong> ${details.reference}</div>`);
  }
  return parts.join("");
}

export type SrfPrintObservations = Partial<
  Record<
    "caseCrystal" | "glassCrystal" | "strapBracelet" | "hands" | "crownPushers" | "movement" | "waterResistance" | "additionalNotes",
    string
  >
>;

export type SrfPrintStoreInfo = {
  displayName?: string;
  tagline?: string;
  address?: string;
  phone?: string;
  email?: string;
  gstin?: string;
};

export type SrfSuggestedRepairs = Partial<
  Record<"movementOverhaul" | "polishing" | "waterKit" | "bezel" | "crownStem" | "glassCrystal" | "dialHands", string>
>;

export type SrfPrintInput = {
  reference: string;
  customerName: string;
  phone: string;
  watchBrand: string;
  watchModel: string;
  watchFamily?: string;
  serial: string;
  complaint: string;
  estimateTotalInr: number;
  estimatedFinishDate?: string | null;
  advanceInr?: number;
  advancePaymentMode?: string | null;
  advancePaymentDetails?: AdvancePaymentDetails | null;
  bookingDate?: string | Date | null;
  manualRefNo?: string;
  company?: string;
  storeInfo?: SrfPrintStoreInfo;
  natureOfRepair?: string;
  repairRoute?: SrfRepairRoute | string;
  caseType?: string;
  strapChainType?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  chainCount12Phase?: string;
  chainCount6Phase?: string;
  chainCount?: string;
  customerRemarks?: string;
  receptionistRemarks?: string;
  comments?: string;
  observations?: SrfPrintObservations;
  suggestedRepairs?: SrfSuggestedRepairs;
  modelNumber?: string;
};

const SRF_FALLBACK_LOGO = "/zimson-logo.png";

/** Map a store record to invoice block fields for SRF print. */
export function srfPrintStoreFromSeed(store: {
  name: string;
  invoiceDisplayName?: string;
  invoiceTagline?: string;
  invoiceAddress?: string;
  invoicePhone?: string;
  invoiceEmail?: string;
  invoiceGstin?: string;
}): SrfPrintStoreInfo {
  return {
    displayName: store.invoiceDisplayName?.trim() || store.name,
    tagline: store.invoiceTagline?.trim() || "SINCE 1948",
    address: store.invoiceAddress?.trim() || "",
    phone: store.invoicePhone?.trim() || "",
    email: store.invoiceEmail?.trim() || "",
    gstin: store.invoiceGstin?.trim() || "",
  };
}

function escHtml(v: string): string {
  return v
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatDateTime(value?: string | Date | null): string {
  if (!value) return new Date().toLocaleString("en-IN", { hour12: false });
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("en-IN", { hour12: false });
}

function formatDateOnly(value?: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN");
}

function absoluteAssetUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

function srfDisplay(v?: string | null): string {
  const t = String(v ?? "").trim();
  return t || "-";
}

function resolveSrfLogoUrl(): string {
  const raw = getAppLogoUrl().trim();
  if (!raw || raw === "/icons.svg" || raw.endsWith("/icons.svg")) {
    return absoluteAssetUrl(SRF_FALLBACK_LOGO);
  }
  if (raw.startsWith("data:")) return raw;
  return absoluteAssetUrl(raw);
}

function srfLogoImgHtml(): string {
  const primary = resolveSrfLogoUrl();
  const fallback = absoluteAssetUrl(SRF_FALLBACK_LOGO);
  return `<img class="xfer-logo srf-logo" src="${escHtml(primary)}" alt="Zimson" onerror="this.onerror=null;this.src='${escHtml(fallback)}';" />`;
}

function bookingCenterBlock(store?: SrfPrintStoreInfo): string {
  const name = store?.displayName?.trim() || "ZIMSON - THE WATCH STORE";
  const tagline = store?.tagline?.trim() || "SINCE 1948";
  const address = store?.address?.trim() || "—";
  const phone = store?.phone?.trim() || "—";
  const email = store?.email?.trim() || "—";
  const gstin = store?.gstin?.trim() || "—";
  return `<div class="row">${srfIcon(SRF_ICONS.pin)}<span><span class="srf-center-name">${escHtml(name)}</span>${tagline ? ` <span class="srf-center-tag">${escHtml(tagline)}</span>` : ""}<br/>${escHtml(address).replace(/\n/g, "<br/>")}</span></div>
  <div class="row">${srfIcon(SRF_ICONS.phone)}<strong>${escHtml(phone)}</strong>&nbsp;&nbsp;&nbsp;${srfIcon(SRF_ICONS.mail)}${escHtml(email)}&nbsp;&nbsp;&nbsp;${srfIcon(SRF_ICONS.globe)}<strong>GSTIN:</strong>&nbsp;${escHtml(gstin)}</div>`;
}

function srfIcon(inner: string, size = 12): string {
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

const SRF_ICONS = {
  fileEntry: `<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h8"/>`,
  calendar: `<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>`,
  person: `<circle cx="12" cy="7" r="4"/><path d="M4 21v-1a8 8 0 0116 0v1"/>`,
  phone: `<path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0122 16.92z"/>`,
  pin: `<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1118 0z"/><circle cx="12" cy="10" r="3"/>`,
  mail: `<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/>`,
  globe: `<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/>`,
  box: `<path d="M21 8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/>`,
  clipboard: `<path d="M9 5h6a2 2 0 012 2v12a2 2 0 01-2 2H9a2 2 0 01-2-2V7a2 2 0 012-2z"/><path d="M9 3h6v4H9z"/><path d="M9 12h6M9 16h6"/>`,
  wrench: `<path d="M14.7 6.3a4 4 0 10-4.9 4.9L4 17v3h3l5.8-5.8a4 4 0 004.9-4.9l-2.6 2.6-2-2 2.6-2.6z"/>`,
  wallet: `<path d="M21 12V8a2 2 0 00-2-2H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2v-2"/><path d="M16 12h5v3h-5a1.5 1.5 0 010-3z"/>`,
  rupee: `<path d="M6 4h11M6 9h11M8 4c3 0 5 1.6 5 3.5S11 11 8 11h-2l7 7"/>`,
  check: `<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/>`,
  comment: `<path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/>`,
  hash: `<path d="M5 9h14M5 15h14M11 4L9 20M15 4l-2 16"/>`,
  clipboardCheck: `<path d="M9 5h6a2 2 0 012 2v12a2 2 0 01-2 2H9a2 2 0 01-2-2V7a2 2 0 012-2z"/><path d="M9 3h6v4H9z"/><path d="M9 13l2 2 4-4"/>`,
};

function buildRepairLines(repairs?: SrfSuggestedRepairs): string[] {
  if (!repairs) return [];
  const pairs: [string, string | undefined][] = [
    ["Movement overhaul", repairs.movementOverhaul],
    ["Polishing", repairs.polishing],
    ["Water kit", repairs.waterKit],
    ["Bezel", repairs.bezel],
    ["Crown / stem", repairs.crownStem],
    ["Glass / crystal", repairs.glassCrystal],
    ["Dial / hands", repairs.dialHands],
  ];
  return pairs.filter(([, v]) => String(v ?? "").trim()).map(([k, v]) => `${k}: ${String(v).trim()}`);
}

const SRF_SPARE_ROWS = 5;

function srfBarcode(reference: string): string {
  const src = documentBarcodeImageSrc(reference, { scale: 2, height: 10 });
  return `<div class="doc-barcode-stack">
    <img src="${src}" alt="${escHtml(reference)}" class="doc-barcode-img" />
    <p class="doc-barcode-label">${escHtml(reference)}</p>
  </div>`;
}

function technicianSpareRows(count = SRF_SPARE_ROWS): string {
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    return `<tr>
      <td class="c">${n}</td>
      <td>&nbsp;</td>
      <td>&nbsp;</td>
      <td>&nbsp;</td>
      <td>&nbsp;</td>
      <td>&nbsp;</td>
    </tr>`;
  }).join("");
}

function srfField(label: string, value: string): string {
  return `<div class="field"><span class="field-lbl">${escHtml(label)}</span><span class="field-val">${escHtml(value)}</span></div>`;
}

function srfRemarksCompact(label: string, value: string, icon?: string): string {
  const v = value.trim() || "-";
  const short = v.length > 220 ? `${v.slice(0, 217)}…` : v;
  return `<div class="remark-chip"><span class="remark-chip-lbl">${srfIcon(icon ?? SRF_ICONS.comment)}${escHtml(label)}</span><span class="remark-chip-val">${escHtml(short)}</span></div>`;
}

/** Invoice-aligned palette — full A4 sheet (210 × 297 mm), premium card layout. */
const SRF_PRINT_CSS = `
  @page { size: A4 portrait; margin: 8mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: ${POPPINS_FONT_CSS};
    font-size: 10px;
    line-height: 1.35;
    color: #0d1b2a;
    background: #e8edf8;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  svg.ic { flex-shrink: 0; }
  .doc {
    width: 210mm;
    min-height: 297mm;
    margin: 0 auto;
    border: 1px solid #d8dff0;
    border-radius: 14px;
    overflow: hidden;
    background: #fff;
    box-shadow: 0 10px 32px rgba(13, 27, 42, 0.1);
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .srf-banner {
    position: relative;
    display: table;
    width: 100%;
    table-layout: fixed;
    background: linear-gradient(120deg, #0c1c56 0%, #1b3a8f 55%, #15308c 100%);
    color: #fff;
    overflow: hidden;
  }
  .srf-banner::after {
    content: "";
    position: absolute;
    top: 0; right: 0; bottom: 0;
    width: 130px;
    background: linear-gradient(135deg, rgba(201,162,39,0) 45%, rgba(201,162,39,0.9) 100%);
    pointer-events: none;
  }
  .srf-banner-title {
    position: relative;
    z-index: 1;
    display: table-cell;
    vertical-align: middle;
    padding: 13px 16px;
    font-size: 19px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .srf-banner-sub {
    position: relative;
    z-index: 1;
    display: table-cell;
    vertical-align: middle;
    padding: 13px 18px;
    font-size: 9.5px;
    line-height: 1.55;
    text-align: right;
    color: #dbe4fb;
  }
  .srf-accent { height: 4px; background: linear-gradient(90deg, #3B82F6 0%, #BFDBFE 50%, #3B82F6 100%); }
  .srf-top-row {
    display: grid;
    grid-template-columns: 1.55fr 1fr 1fr;
    gap: 10px;
    padding: 12px;
    background: #f6f8fd;
    border-bottom: 1px solid #e2e8f5;
  }
  .srf-card {
    border: 1px solid #e2e8f5;
    border-radius: 12px;
    background: #fff;
    box-shadow: 0 1px 4px rgba(27, 58, 143, 0.07);
    padding: 9px 12px;
  }
  .srf-meta-card { display: flex; flex-direction: column; gap: 5px; justify-content: center; }
  .srf-meta-line { display: flex; align-items: flex-start; gap: 6px; font-size: 9.5px; color: #0d1b2a; }
  .srf-meta-line .ic { color: #1b3a8f; margin-top: 1px; }
  .srf-meta-line strong { color: #64748b; font-weight: 600; margin-right: 2px; }
  .srf-barcode-wrap, .srf-logo-wrap { display: flex; align-items: center; justify-content: center; }
  .doc-barcode-stack { text-align: center; }
  .doc-barcode-img { max-width: 100%; height: 48px; width: auto; object-fit: contain; display: block; margin: 0 auto; }
  .doc-barcode-label {
    margin: 5px 0 0;
    padding: 0;
    font-family: Consolas, "Courier New", monospace;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.05em;
    color: #0d1b2a;
    line-height: 1.2;
  }
  .srf-logo {
    height: 50px;
    max-width: 170px;
    object-fit: contain;
    display: inline-block;
    vertical-align: middle;
  }
  .srf-center { padding: 0 12px 12px; }
  .sec-pill {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    background: linear-gradient(90deg, #15308c, #1b3a8f);
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    padding: 6px 14px;
    border-radius: 8px;
    margin: 12px 0 8px;
    box-shadow: 0 2px 6px rgba(27, 58, 143, 0.25);
  }
  .sec-pill .ic { color: #60A5FA; }
  .srf-center-body {
    border: 1px solid #e2e8f5;
    border-radius: 12px;
    background: #fafbfe;
    padding: 9px 12px;
    font-size: 9.5px;
    line-height: 1.55;
  }
  .srf-center-body .row { display: flex; align-items: flex-start; gap: 6px; margin-bottom: 3px; }
  .srf-center-body .row:last-child { margin-bottom: 0; }
  .srf-center-body .ic { color: #1b3a8f; margin-top: 1px; }
  .srf-center-name { font-weight: 700; color: #0d1b2a; }
  .srf-center-tag { font-weight: 600; color: #3B82F6; }
  .srf-body { padding: 0 12px 14px; }
  .cols-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 20px; margin-bottom: 4px; }
  .field { display: flex; gap: 6px; margin-bottom: 3px; align-items: baseline; font-size: 9.5px; }
  .field-lbl { font-weight: 600; color: #64748b; min-width: 118px; flex-shrink: 0; }
  .field-val { font-weight: 700; color: #0d1b2a; flex: 1; }
  .remarks-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin: 6px 0 8px; }
  .remark-chip {
    border: 1px solid #e2e8f5;
    border-radius: 10px;
    background: #fafbfe;
    padding: 7px 9px;
    min-height: 40px;
  }
  .remark-chip-lbl { display: flex; align-items: center; gap: 4px; font-weight: 700; color: #1b3a8f; font-size: 8px; text-transform: uppercase; margin-bottom: 3px; }
  .remark-chip-lbl .ic { color: #3B82F6; }
  .remark-chip-val { display: block; font-size: 9px; line-height: 1.35; white-space: pre-wrap; color: #1f2937; }
  .repair-chip {
    border: 1px dashed #3B82F6;
    border-radius: 10px;
    background: #fffdf5;
    padding: 6px 9px;
    margin-bottom: 8px;
    font-size: 9px;
    line-height: 1.35;
  }
  .repair-chip strong { color: #1b3a8f; }
  .amounts {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin-bottom: 8px;
  }
  .amount-card {
    display: flex;
    align-items: center;
    gap: 8px;
    border: 1px solid #e2e8f5;
    border-radius: 12px;
    background: #fff;
    box-shadow: 0 1px 4px rgba(27, 58, 143, 0.06);
    padding: 8px 10px;
  }
  .amount-ic {
    flex-shrink: 0;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
  }
  .amount-ic svg { color: #fff; }
  .amount-ic.blue { background: linear-gradient(135deg, #3b82f6, #1d4ed8); }
  .amount-ic.green { background: linear-gradient(135deg, #22c55e, #15803d); }
  .amount-ic.orange { background: linear-gradient(135deg, #f97316, #c2410c); }
  .amount-ic.gold { background: linear-gradient(135deg, #60A5FA, #3B82F6); }
  .amount-card-txt { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .amount-card-lbl { font-size: 7.3px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.03em; }
  .amount-card-val { font-size: 11.5px; font-weight: 800; color: #1b3a8f; }
  .advance-note {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 9px;
    color: #14532d;
    margin: 0 0 8px;
    padding: 6px 10px;
    background: #ecfdf3;
    border: 1px solid #bbf0cf;
    border-radius: 8px;
  }
  .advance-note .ic { color: #16a34a; }
  .tech-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    font-size: 9px;
    padding: 2px 0 8px;
    color: #4a5568;
  }
  .tech-strip b { color: #1b3a8f; }
  .spares-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 9px; border: 1px solid #1b3a8f; border-radius: 10px; overflow: hidden; }
  .spares-table th {
    background: linear-gradient(90deg, #15308c, #1b3a8f);
    color: #60A5FA;
    font-weight: 700;
    text-align: center;
    padding: 5px 5px;
    font-size: 8px;
    text-transform: uppercase;
    border-right: 1px solid rgba(255, 255, 255, 0.14);
  }
  .spares-table th:last-child { border-right: none; }
  .spares-table td {
    border-right: 1px solid #e2e8f5;
    border-top: 1px solid #e2e8f5;
    padding: 3px 5px;
    height: 16px;
    vertical-align: middle;
  }
  .spares-table td:last-child { border-right: none; }
  .spares-table td.c { text-align: center; width: 22px; background: #f4f6fb; font-weight: 600; }
  .spares-table tfoot td {
    font-weight: 700;
    background: #eef1fa;
    color: #1b3a8f;
    padding: 4px 5px;
    border-top: 1px solid #1b3a8f;
    border-right: 1px solid #d8dff0;
  }
  .spares-table tfoot tr:last-child td {
    background: linear-gradient(90deg, #BFDBFE, #3B82F6);
    color: #16308a;
    font-size: 10px;
    border-right: none;
  }
  .sign-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid #e2e8f5;
  }
  .sign-lbl { display: flex; align-items: center; gap: 4px; font-size: 8px; font-weight: 700; color: #1b3a8f; text-transform: uppercase; margin-bottom: 16px; }
  .sign-lbl .ic { color: #3B82F6; }
  .sign-line { border-bottom: 1px solid #c7d2e8; }
  .sign-wide { grid-column: 1 / -1; margin-top: 4px; }
  .sign-wide .sign-line { min-height: 18px; }
  @media print {
    body { background: #fff; }
    .doc { width: 100%; min-height: auto; margin: 0; box-shadow: none; }
  }
  @media screen {
    body { padding: 12px 0; }
  }
`;

export function printSrfDocument(job: SrfPrintInput): void {
  const obs = job.observations ?? {};
  const advance = Number(job.advanceInr ?? 0);
  const estimate = Number(job.estimateTotalInr ?? 0);
  const balance = Math.max(estimate - advance, 0);
  const bookingDate = formatDateTime(job.bookingDate ?? new Date());
  const estdDelivery = job.estimatedFinishDate ? formatDateOnly(job.estimatedFinishDate) : "-";
  const nature =
    job.natureOfRepair?.trim() ||
    (job.repairRoute ? repairRouteLabel(job.repairRoute) : "Chargeable - Service");
  const modelNo = srfDisplay(job.modelNumber?.trim() || job.serial);
  const brandModel =
    [job.watchFamily?.trim(), job.watchModel.trim()].filter(Boolean).join(" ") || job.watchModel || "-";
  const repairLines = buildRepairLines(job.suggestedRepairs);
  const repairBlock =
    repairLines.length > 0
      ? `<div class="repair-chip"><strong>Suggested repairs:</strong> ${escHtml(repairLines.join(" · "))}</div>`
      : "";
  const comments =
    job.comments?.trim() ||
    [obs.additionalNotes?.trim(), repairLines.length ? repairLines.join("; ") : ""].filter(Boolean).join("\n") ||
    "-";
  const barcode = srfBarcode(job.reference);
  const bookingCenter = bookingCenterBlock(job.storeInfo);
  const logoHtml = srfLogoImgHtml();
  const baseHref = typeof window !== "undefined" ? window.location.origin : "";
  const companyLine = job.company?.trim()
    ? `<div class="srf-meta-line">${srfIcon(SRF_ICONS.box)}<strong>Company:</strong> ${escHtml(job.company.trim())}</div>`
    : "";

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  ${POPPINS_GOOGLE_HEAD}
  <base href="${escHtml(baseHref)}/" />
  <title>SRF ${escHtml(job.reference)}</title>
  <style>${SRF_PRINT_CSS}</style>
</head>
<body>
  <div class="doc">
    <div class="srf-banner">
      <div class="srf-banner-title">Service Acknowledgment Form</div>
      <div class="srf-banner-sub">Internal Copy<br/>Manual Ref: ${escHtml(job.manualRefNo?.trim() || "—")}</div>
    </div>
    <div class="srf-accent" aria-hidden="true"></div>

    <div class="srf-top-row">
      <div class="srf-card srf-meta-card">
        <div class="srf-meta-line">${srfIcon(SRF_ICONS.fileEntry)}<strong>Service Entry No:</strong> ${escHtml(job.reference)}</div>
        <div class="srf-meta-line">${srfIcon(SRF_ICONS.calendar)}<strong>Booking Date:</strong> ${escHtml(bookingDate)}</div>
        <div class="srf-meta-line">${srfIcon(SRF_ICONS.person)}<strong>Customer:</strong> ${escHtml(job.customerName)}</div>
        <div class="srf-meta-line">${srfIcon(SRF_ICONS.phone)}<strong>Mobile:</strong> ${escHtml(job.phone)}</div>
        ${companyLine}
      </div>
      <div class="srf-card srf-barcode-wrap">${barcode}</div>
      <div class="srf-card srf-logo-wrap">${logoHtml}</div>
    </div>

    <div class="srf-center">
      <div class="sec-pill">${srfIcon(SRF_ICONS.box, 13)}Booking Center</div>
      <div class="srf-center-body">
        ${bookingCenter}
      </div>
    </div>

    <div class="srf-body">
      <div class="sec-pill">${srfIcon(SRF_ICONS.box, 13)}Product Information</div>
      <div class="cols-2">
        <div>
          ${srfField("Brand / Model No", modelNo)}
          ${srfField("Brand Name", srfDisplay(job.watchBrand))}
          ${srfField("Brand Model", srfDisplay(brandModel))}
          ${srfField("Case Type", srfDisplay(job.caseType))}
          ${srfField("Nature of Repair", srfDisplay(nature))}
          ${srfField("Invoice Number", srfDisplay(job.invoiceNumber))}
          ${srfField("Invoice Date", srfDisplay(job.invoiceDate ? formatDateOnly(job.invoiceDate) : null))}
        </div>
        <div>
          ${srfField("Dial / CLR", srfDisplay(obs.glassCrystal))}
          ${srfField("Strap / Chain Type", srfDisplay(job.strapChainType || obs.strapBracelet))}
          ${srfField("Case / Crystal", srfDisplay(obs.caseCrystal))}
          ${srfField("Hands", srfDisplay(obs.hands))}
          ${srfField("Crown / Pushers", srfDisplay(obs.crownPushers))}
          ${srfField("Movement", srfDisplay(obs.movement))}
          ${srfField("Water Resistance", srfDisplay(obs.waterResistance))}
          ${srfField("Back Cover / S.No", srfDisplay(job.serial))}
          ${srfField("12 Link Chain Count", srfDisplay(job.chainCount12Phase || job.chainCount))}
          ${srfField("6 Link Chain Count", srfDisplay(job.chainCount6Phase))}
        </div>
      </div>
      ${repairBlock}
      <div class="remarks-row">
        ${srfRemarksCompact("Customer Remarks", job.customerRemarks?.trim() || job.complaint || "-", SRF_ICONS.comment)}
        ${srfRemarksCompact("Receptionist Remarks", job.receptionistRemarks?.trim() || "-", SRF_ICONS.person)}
        ${srfRemarksCompact("Comments", comments, SRF_ICONS.clipboard)}
      </div>

      <div class="sec-pill">${srfIcon(SRF_ICONS.clipboard, 13)}Service Information</div>
      <div class="amounts">
        <div class="amount-card"><span class="amount-ic blue">${srfIcon(SRF_ICONS.calendar, 13)}</span><span class="amount-card-txt"><span class="amount-card-lbl">Estd. Delivery</span><span class="amount-card-val">${escHtml(estdDelivery)}</span></span></div>
        <div class="amount-card"><span class="amount-ic green">${srfIcon(SRF_ICONS.wallet, 13)}</span><span class="amount-card-txt"><span class="amount-card-lbl">Advance Paid (INR)</span><span class="amount-card-val">₹${advance.toFixed(2)}</span></span></div>
        <div class="amount-card"><span class="amount-ic orange">${srfIcon(SRF_ICONS.wrench, 13)}</span><span class="amount-card-txt"><span class="amount-card-lbl">Est. Service Cost (approx.)</span><span class="amount-card-val">Approx. ₹${estimate.toFixed(2)}</span></span></div>
        <div class="amount-card"><span class="amount-ic gold">${srfIcon(SRF_ICONS.rupee, 13)}</span><span class="amount-card-txt"><span class="amount-card-lbl">Balance (Excl. Tax)</span><span class="amount-card-val">₹${balance.toFixed(2)}</span></span></div>
      </div>
      ${advance > 0 ? `<div class="advance-note">${srfIcon(SRF_ICONS.check, 13)}${formatAdvanceForPrint(job.advanceInr, job.advancePaymentMode, job.advancePaymentDetails ?? null)}</div>` : ""}

      <div class="sec-pill">${srfIcon(SRF_ICONS.wrench, 13)}Technician Entry — Spares</div>
      <div class="tech-strip">
        <span><b>SAF No:</b> ${escHtml(job.reference)}</span>
        <span><b>Brand:</b> ${escHtml(srfDisplay(job.watchBrand))}</span>
        <span><b>Calibre:</b> ${escHtml(srfDisplay(brandModel))}</span>
        <span><b>Model No:</b> ${escHtml(modelNo)}</span>
        <span><b>Chargeable / Free:</b> ${escHtml(srfDisplay(nature))}</span>
        <span><b>Date:</b> ${escHtml(formatDateOnly(job.bookingDate ? String(job.bookingDate) : undefined))}</span>
      </div>

      <table class="spares-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Parts Name</th>
            <th>Stock No.</th>
            <th>Defect</th>
            <th>Issued Y/N</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>${technicianSpareRows(SRF_SPARE_ROWS)}</tbody>
        <tfoot>
          <tr><td colspan="5" style="text-align:right">Total Spares</td><td></td></tr>
          <tr><td colspan="5" style="text-align:right">Labour / Overhaul</td><td></td></tr>
          <tr><td colspan="5" style="text-align:right">Total</td><td></td></tr>
        </tfoot>
      </table>

      <div class="sign-row">
        <div><div class="sign-lbl">${srfIcon(SRF_ICONS.person, 11)}Mechanics Name</div><div class="sign-line"></div></div>
        <div><div class="sign-lbl">${srfIcon(SRF_ICONS.hash, 11)}Code</div><div class="sign-line"></div></div>
        <div><div class="sign-lbl">${srfIcon(SRF_ICONS.calendar, 11)}Serviced Date</div><div class="sign-line"></div></div>
        <div><div class="sign-lbl">${srfIcon(SRF_ICONS.clipboardCheck, 11)}Inspected By</div><div class="sign-line"></div></div>
        <div class="sign-wide"><div class="sign-lbl">${srfIcon(SRF_ICONS.comment, 11)}Remarks</div><div class="sign-line"></div></div>
      </div>
    </div>
  </div>
</body>
</html>`;

  openPrintDocument(`SRF ${job.reference}`, html);
}

export function printFullSrfDocument(
  job: SrfJob,
  historyRows: Array<{ id: string; status: string; note: string; changedAt: string }> = [],
): void {
  const spareRows = (job.usedSpares ?? [])
    .map(
      (x, idx) =>
        `<tr>
          <td>${idx + 1}</td>
          <td>${x.name}</td>
          <td>${x.qty}</td>
          <td>INR ${Number(x.unitPriceInr ?? 0).toFixed(2)}</td>
          <td>INR ${Number(x.lineTotalInr ?? 0).toFixed(2)}</td>
        </tr>`,
    )
    .join("");
  const historyTableRows = historyRows
    .map(
      (h, idx) =>
        `<tr>
          <td>${idx + 1}</td>
          <td>${new Date(h.changedAt).toLocaleString()}</td>
          <td>${h.status.replace(/_/g, " ")}</td>
          <td>${h.note || "-"}</td>
        </tr>`,
    )
    .join("");
  const photoBlocks = (job.photos ?? [])
    .map((p) => {
      const src = absolutePhotoSrc(p.filePath);
      return `<div style="width:170px">
        <img src="${src}" alt="${p.photoKind ?? "watch photo"}" style="width:170px;height:120px;object-fit:cover;border:1px solid #ccc;border-radius:6px"/>
        <div style="font-size:11px;margin-top:4px;text-transform:capitalize">${p.photoKind ?? "other"}</div>
      </div>`;
    })
    .join("");
  const html = base(
    `SRF ${job.reference}`,
    `${barcodeBlock(job.reference)}
     <h2 style="margin:0 0 12px">Service Request Form - Full Lifecycle</h2>
     <h3 style="margin:12px 0 6px">Customer and watch details</h3>
     <table style="width:100%;border-collapse:collapse" border="1" cellspacing="0" cellpadding="6">
       <tbody>
         <tr><td><strong>SRF reference</strong></td><td>${job.reference}</td><td><strong>Status</strong></td><td>${job.status}</td></tr>
         <tr><td><strong>Customer</strong></td><td>${job.customerName}</td><td><strong>Phone</strong></td><td>${job.phone}</td></tr>
         <tr><td><strong>Watch</strong></td><td>${job.watchBrand} ${job.watchModel}</td><td><strong>Serial</strong></td><td>${job.serial}</td></tr>
         <tr><td><strong>Complaint</strong></td><td colspan="3">${job.complaint || "-"}</td></tr>
         <tr><td><strong>Estimate (approx.)</strong></td><td>Approx. INR ${Number(job.estimateTotalInr ?? 0).toFixed(2)}</td><td><strong>Created at</strong></td><td>${new Date(job.createdAt).toLocaleString()}</td></tr>
       </tbody>
     </table>
     <h3 style="margin:16px 0 6px">Process references and movement</h3>
     <table style="width:100%;border-collapse:collapse" border="1" cellspacing="0" cellpadding="6">
       <tbody>
         <tr><td><strong>DC number</strong></td><td>${job.dcNumber || "-"}</td><td><strong>Dispatched to SC</strong></td><td>${job.dispatchedToScAt ? new Date(job.dispatchedToScAt).toLocaleString() : "-"}</td></tr>
         <tr><td><strong>SC inward</strong></td><td>${job.inwardAt ? new Date(job.inwardAt).toLocaleString() : "-"}</td><td><strong>Technician assigned</strong></td><td>${job.assignedTechnicianId || "-"}</td></tr>
         <tr><td><strong>ODC number</strong></td><td>${job.outwardDcNumber || "-"}</td><td><strong>Dispatched to store</strong></td><td>${job.dispatchedToStoreAt ? new Date(job.dispatchedToStoreAt).toLocaleString() : "-"}</td></tr>
         <tr><td><strong>Received at store</strong></td><td>${job.receivedBackAtStoreAt ? new Date(job.receivedBackAtStoreAt).toLocaleString() : "-"}</td><td><strong>Closed at</strong></td><td>${job.closedAt ? new Date(job.closedAt).toLocaleString() : "-"}</td></tr>
       </tbody>
     </table>
     <h3 style="margin:16px 0 6px">Technician and supervisor feedback trail</h3>
     <table style="width:100%;border-collapse:collapse" border="1" cellspacing="0" cellpadding="6">
       <thead><tr><th>#</th><th>Date time</th><th>Status</th><th>Feedback / note</th></tr></thead>
       <tbody>${historyTableRows || '<tr><td colspan="4">No history notes</td></tr>'}</tbody>
     </table>
     <h3 style="margin:16px 0 6px">Used spares details</h3>
     <table style="width:100%;border-collapse:collapse" border="1" cellspacing="0" cellpadding="6">
       <thead><tr><th>#</th><th>Spare</th><th>Qty</th><th>Unit price</th><th>Line total</th></tr></thead>
       <tbody>${spareRows || '<tr><td colspan="5">No spares entered</td></tr>'}</tbody>
     </table>
     <h3 style="margin:16px 0 6px">Watch images</h3>
     <div style="display:flex;flex-wrap:wrap;gap:8px">${photoBlocks || "<div>No images uploaded</div>"}</div>
     <div style="margin-top:12px"><strong>Spares slip submitted by:</strong> ${job.sparesSlipSubmittedBy || "-"} ${job.sparesSlipSubmittedAt ? `(${new Date(job.sparesSlipSubmittedAt).toLocaleString()})` : ""}</div>
     <div><strong>HO bill ref:</strong> ${job.hoSparesBillRef || "-"}</div>
     <div><strong>Store bill ref:</strong> ${job.storeBillRef || "-"}</div>
     <div style="margin-top:24px">Customer Sign: _____________________</div>
     <div style="margin-top:16px">Technician Sign: _____________________</div>
     <div style="margin-top:16px">Supervisor Sign: _____________________</div>
     <div style="margin-top:16px">Store Sign: _____________________</div>`,
  );
  openPrintDocument(`SRF ${job.reference}`, html);
}

/** Service centre acknowledgment after inwarding watches from store DC. */
const TRANSFER_PRINT_CSS = `
  @page { size: A4 portrait; margin: 8mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: ${POPPINS_FONT_CSS};
    font-size: 10px;
    line-height: 1.35;
    color: #0d1b2a;
    background: #e8edf8;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .doc {
    width: 210mm;
    min-height: 297mm;
    margin: 0 auto;
    border: 2px solid #1b3a8f;
    background: #fff;
    page-break-inside: avoid;
  }
  .xfer-banner { display: table; width: 100%; table-layout: fixed; background: #1b3a8f; color: #fff; }
  .xfer-banner-title {
    display: table-cell; vertical-align: middle; padding: 10px 14px;
    font-size: 17px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
  }
  .xfer-banner-sub { display: table-cell; vertical-align: middle; padding: 10px 14px; font-size: 10px; text-align: right; }
  .xfer-accent { height: 4px; background: linear-gradient(90deg, #3B82F6 0%, #93C5FD 50%, #3B82F6 100%); }
  .xfer-top-row { display: table; width: 100%; table-layout: fixed; border-bottom: 1px solid #1b3a8f; }
  .xfer-top-cell { display: table-cell; vertical-align: top; padding: 8px 10px; border-right: 1px solid #d8dff0; }
  .xfer-top-cell:last-child { border-right: none; }
  .xfer-top-cell--meta { width: 38%; vertical-align: top; }
  .xfer-top-cell--barcode { width: 34%; vertical-align: middle; text-align: center; }
  .xfer-top-cell--logo { width: 28%; vertical-align: middle; text-align: right; }
  .doc-barcode-stack { text-align: center; margin: 0 auto; max-width: 220px; }
  .doc-barcode-img { display: block; width: 100%; max-width: 220px; height: 48px; margin: 0 auto; object-fit: contain; }
  .doc-barcode-label {
    margin: 4px 0 0;
    padding: 0;
    font-family: Consolas, "Courier New", monospace;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.05em;
    color: #0d1b2a;
    line-height: 1.2;
    text-align: center;
  }
  .xfer-logo, .srf-logo {
    height: 52px;
    max-width: 160px;
    width: auto;
    object-fit: contain;
    display: inline-block;
    vertical-align: middle;
  }
  .xfer-meta-box { border: 1px solid #1b3a8f; background: #f4f6fb; padding: 6px 8px; font-size: 9.5px; }
  .xfer-meta-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .xfer-meta-table td { padding: 3px 0; vertical-align: top; line-height: 1.35; }
  .xfer-meta-table td.lbl {
    width: 44%;
    font-weight: 600;
    color: #4a5568;
    padding-right: 10px;
    white-space: nowrap;
  }
  .xfer-meta-table td.val {
    width: 56%;
    font-weight: 700;
    color: #0d1b2a;
    word-break: break-word;
  }
  .xfer-meta-table td.val.mono { font-family: Consolas, "Courier New", monospace; font-size: 9px; }
  .xfer-meta-table tr + tr td { border-top: 1px solid #e8edf8; }
  .xfer-body { padding: 0; }
  .xfer-pad { padding: 0 12px; }
  .xfer-party-grid + .xfer-body .sec-title { margin-top: 0; }
  .xfer-party-grid { display: table; width: 100%; table-layout: fixed; border-bottom: 1px solid #1b3a8f; }
  .xfer-party-col { display: table-cell; width: 50%; vertical-align: top; padding: 0; border-right: 1px solid #d8dff0; }
  .xfer-party-col:last-child { border-right: none; }
  .xfer-party-head {
    background: #e8edf8; color: #1b3a8f; font-size: 10px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.06em; padding: 5px 10px; border-bottom: 1px solid #1b3a8f;
  }
  .xfer-party-body { padding: 8px 10px; font-size: 9.5px; line-height: 1.45; min-height: 88px; }
  .xfer-party-body .name { font-weight: 700; font-size: 10px; margin: 0 0 4px; color: #0d1b2a; }
  .xfer-party-body .loc { color: #3B82F6; font-weight: 600; font-size: 9px; margin: 0 0 6px; }
  .xfer-party-body .addr { margin: 0 0 4px; }
  .xfer-party-body .contact { margin: 0; }
  .sec-title {
    background: #e8edf8; color: #1b3a8f; font-size: 10px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.06em; padding: 5px 10px; margin: 8px 0 0;
    border-top: 1px solid #1b3a8f; border-bottom: 2px solid #1b3a8f;
  }
  .xfer-watches { width: 100%; border-collapse: collapse; font-size: 9px; table-layout: fixed; }
  .xfer-watches th {
    background: #1b3a8f; color: #3B82F6; font-weight: 700; text-align: center;
    padding: 4px 5px; border: 1px solid #1b3a8f; font-size: 8px; text-transform: uppercase;
  }
  .xfer-watches td { border: 1px solid #d8dff0; padding: 4px 5px; vertical-align: top; word-wrap: break-word; }
  .xfer-watches td.c { text-align: center; width: 28px; background: #f4f6fb; font-weight: 600; }
  .xfer-watches td.mono { font-family: Consolas, monospace; font-weight: 600; }
  .xfer-watches tfoot td { font-weight: 700; background: #e8edf8; color: #1b3a8f; border: 1px solid #1b3a8f; }
  .xfer-watches tfoot td.xfer-total-label { text-align: right; padding-right: 8px; }
  .xfer-watches tfoot td.xfer-total-val { text-align: center; width: 15%; }
  .xfer-refs { font-size: 9px; margin: 6px 0 0; color: #4a5568; }
  .xfer-refs span { display: inline-block; margin: 0 16px 4px 0; }
  .xfer-refs b { color: #1b3a8f; }
  .sign-row {
    display: table; width: 100%; table-layout: fixed;
    margin-top: 10px; padding-top: 8px; border-top: 1px solid #1b3a8f;
  }
  .sign-cell { display: table-cell; vertical-align: bottom; width: 33.33%; padding-right: 10px; }
  .sign-cell:last-child { padding-right: 0; }
  .sign-lbl { font-size: 8px; font-weight: 700; color: #1b3a8f; text-transform: uppercase; margin-bottom: 14px; }
  .sign-line { border-bottom: 1px solid #1b3a8f; min-height: 1px; max-width: 100%; }
  .xfer-footnote { font-size: 8px; color: #4a5568; margin: 8px 0 0; line-height: 1.35; }
  .xfer-footer { padding: 0 12px 14px; }
  @media print { body { background: #fff; } .doc { width: 100%; min-height: auto; margin: 0; } }
  @media screen { body { padding: 12px 0; } }
`;

function xferMetaRow(label: string, value: string, mono = false): string {
  return `<tr><td class="lbl">${escHtml(label)}</td><td class="val${mono ? " mono" : ""}">${escHtml(value)}</td></tr>`;
}

function xferPartyHtml(head: string, party: TransferPartyBlock): string {
  return `<div class="xfer-party-col">
    <div class="xfer-party-head">${escHtml(head)}</div>
    <div class="xfer-party-body">
      <div class="loc">${escHtml(party.locationLabel)}</div>
      <div class="name">${escHtml(party.legalName)}</div>
      <div class="addr">${escHtml(party.address).replace(/\n/g, "<br/>")}</div>
      <div class="contact"><strong>Ph:</strong> ${escHtml(party.phone)}</div>
      <div class="contact"><strong>Email:</strong> ${escHtml(party.email)}</div>
      <div class="contact"><strong>GSTIN:</strong> ${escHtml(party.gstin)}</div>
    </div>
  </div>`;
}

function xferWatchRows(jobs: SrfJob[]): string {
  return jobs
    .map(
      (j, idx) =>
        `<tr>
          <td class="c">${idx + 1}</td>
          <td class="mono">${escHtml(j.reference)}</td>
          <td>${escHtml(j.customerName)}</td>
          <td>${escHtml(j.phone)}</td>
          <td>${escHtml(j.watchBrand)}</td>
          <td>${escHtml(j.watchModel)}</td>
          <td class="mono">${escHtml(j.serial || "—")}</td>
        </tr>`,
    )
    .join("");
}

export type TransferPrintInput = {
  transferNumber: string;
  printKind: TransferPrintKind;
  flow: TransferFlow;
  /** OUT = dispatch / outward; IN = inward receipt copy. Defaults from flow. */
  direction?: "IN" | "OUT";
  transferDate?: Date | string;
  from: TransferPartyBlock;
  to: TransferPartyBlock;
  jobs: SrfJob[];
  seriesCode?: string;
  hoInvoiceRef?: string;
  storeInvoiceRef?: string;
  preparedBy?: string;
};

export function printTransferDocument(input: TransferPrintInput): void {
  const title = transferDocumentTitle(input.printKind, input.flow);
  const numLabel = transferNumberLabel(input.printKind, input.seriesCode);
  const direction = input.direction ?? transferFlowDirection(input.flow);
  const docTypeLabel = direction;
  const when = input.transferDate
    ? input.transferDate instanceof Date
      ? input.transferDate.toLocaleString("en-IN", { hour12: false })
      : new Date(input.transferDate).toLocaleString("en-IN", { hour12: false })
    : new Date().toLocaleString("en-IN", { hour12: false });
  const barcode = srfBarcode(input.transferNumber);
  const logoHtml = srfLogoImgHtml();
  const baseHref = typeof window !== "undefined" ? window.location.origin : "";
  const refs: string[] = [];
  if (input.hoInvoiceRef?.trim()) refs.push(`<span><b>HO invoice ref:</b> ${escHtml(input.hoInvoiceRef.trim())}</span>`);
  if (input.storeInvoiceRef?.trim()) refs.push(`<span><b>Store invoice ref:</b> ${escHtml(input.storeInvoiceRef.trim())}</span>`);
  const refsBlock = refs.length ? `<div class="xfer-refs">${refs.join("")}</div>` : "";

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  ${POPPINS_GOOGLE_HEAD}
  <base href="${escHtml(baseHref)}/" />
  <title>${escHtml(title)} ${escHtml(input.transferNumber)}</title>
  <style>${TRANSFER_PRINT_CSS}</style>
</head>
<body>
  <div class="doc">
    <div class="xfer-banner">
      <div class="xfer-banner-title">${escHtml(title)}</div>
      <div class="xfer-banner-sub">Internal logistics copy<br/>Printed ${escHtml(when)}</div>
    </div>
    <div class="xfer-accent" aria-hidden="true"></div>
    <div class="xfer-top-row">
      <div class="xfer-top-cell xfer-top-cell--meta">
        <div class="xfer-meta-box">
          <table class="xfer-meta-table">
            <tbody>
              ${xferMetaRow(numLabel, input.transferNumber, true)}
              ${xferMetaRow("Transfer date", when)}
              ${xferMetaRow("Total items", String(input.jobs.length))}
              ${xferMetaRow("Document type", docTypeLabel)}
              ${xferMetaRow("From GSTIN", input.from.gstin)}
              ${xferMetaRow("To GSTIN", input.to.gstin)}
            </tbody>
          </table>
        </div>
      </div>
      <div class="xfer-top-cell xfer-top-cell--barcode xfer-barcode-wrap">${barcode}</div>
      <div class="xfer-top-cell xfer-top-cell--logo xfer-logo-wrap">${logoHtml}</div>
    </div>
    <div class="xfer-party-grid">
      ${xferPartyHtml("From (Sender)", input.from)}
      ${xferPartyHtml("To (Receiver)", input.to)}
    </div>
    <div class="xfer-body">
      ${refsBlock ? `<div class="xfer-pad">${refsBlock}</div>` : ""}
      <div class="sec-title">Items in this transfer (${input.jobs.length})</div>
      <table class="xfer-watches">
        <colgroup>
          <col class="c-no" /><col class="c-srf" /><col class="c-cust" /><col class="c-mob" />
          <col class="c-brand" /><col class="c-model" /><col class="c-serial" />
        </colgroup>
        <thead>
          <tr>
            <th>#</th>
            <th>SRF No.</th>
            <th>Customer</th>
            <th>Mobile</th>
            <th>Brand</th>
            <th>Model</th>
            <th>Serial No.</th>
          </tr>
        </thead>
        <tbody>${xferWatchRows(input.jobs) || '<tr><td colspan="7">No watches listed</td></tr>'}</tbody>
        <tfoot>
          <tr>
            <td colspan="6" class="xfer-total-label">Total</td>
            <td class="xfer-total-val">${input.jobs.length}</td>
          </tr>
        </tfoot>
      </table>
      <div class="xfer-footer">
        <div class="sign-row">
          <div class="sign-cell"><div class="sign-lbl">Dispatched by</div><div class="sign-line"></div>${input.preparedBy ? `<div style="font-size:8px;margin-top:4px">${escHtml(input.preparedBy)}</div>` : ""}</div>
          <div class="sign-cell"><div class="sign-lbl">Received by</div><div class="sign-line"></div></div>
          <div class="sign-cell"><div class="sign-lbl">Date &amp; stamp</div><div class="sign-line"></div></div>
        </div>
        <p class="xfer-footnote">
          ${input.flow === "store_to_ho" || input.flow === "ho_to_store"
            ? "Internal transfer between store and regional service centre (HO). Not a GST delivery challan."
            : input.printKind === "dc"
              ? "Delivery Challan for inter-HO movement or when sender and receiver GSTIN differ."
              : "Internal transfer document when sender and receiver share the same GSTIN."}
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;

  openPrintDocument(`${title} ${input.transferNumber}`, html);
}

export function printTransferFromMeta(
  meta: TransferPrintMeta,
  jobs: SrfJob[],
  opts?: {
    seriesCode?: string;
    hoInvoiceRef?: string;
    storeInvoiceRef?: string;
    preparedBy?: string;
    transferDate?: Date;
    direction?: "IN" | "OUT";
  },
): void {
  printTransferDocument({
    transferNumber: meta.transferNumber,
    printKind: meta.printKind,
    flow: meta.flow,
    direction: opts?.direction,
    from: meta.from,
    to: meta.to,
    jobs,
    seriesCode: opts?.seriesCode,
    hoInvoiceRef: opts?.hoInvoiceRef,
    storeInvoiceRef: opts?.storeInvoiceRef,
    preparedBy: opts?.preparedBy,
    transferDate: opts?.transferDate ?? new Date(),
  });
}

const INWARD_RECEIPT_EXTRA_CSS = `
  .inward-srf-table th { font-size: 7px; padding: 3px 2px; letter-spacing: 0.03em; }
  .inward-srf-table td { font-size: 7.5px; padding: 3px 2px; }
  .inward-srf-table td.complaint { max-width: 88px; word-break: break-word; line-height: 1.25; }
  .inward-srf-table td.amt { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .inward-received-banner {
    margin: 8px 0 4px; padding: 8px 10px; border: 2px solid #1b3a8f; background: #f4f6fb;
    font-size: 10px; font-weight: 700; color: #1b3a8f; text-align: center; text-transform: uppercase;
    letter-spacing: 0.05em;
  }
`;

function truncateInwardText(value: string | null | undefined, max: number): string {
  const t = String(value ?? "").trim();
  if (!t) return "—";
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function inwardJobStatusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

function inwardReceiptWatchRows(jobs: SrfJob[], receivedAtLocation: string): string {
  return jobs
    .map(
      (j, idx) =>
        `<tr>
          <td class="c">${idx + 1}</td>
          <td class="mono">${escHtml(j.reference)}</td>
          <td>${escHtml(j.customerName)}</td>
          <td>${escHtml(j.phone || "—")}</td>
          <td>${escHtml(srfDisplay(j.watchBrand))}</td>
          <td>${escHtml(srfDisplay(j.watchModel))}</td>
          <td class="mono">${escHtml(j.serial || "—")}</td>
          <td class="complaint">${escHtml(truncateInwardText(j.complaint, 72))}</td>
          <td class="amt">${escHtml(
            Number.isFinite(j.estimateTotalInr)
              ? `Approx. ${j.estimateTotalInr.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
              : "—",
          )}</td>
          <td>${escHtml(inwardJobStatusLabel(j.status))}</td>
          <td>${escHtml(receivedAtLocation)}</td>
        </tr>`,
    )
    .join("");
}

export type SrfInwardReceiptInput = {
  inwardNumber: string;
  numberLabel?: string;
  documentTitle?: string;
  documentSubtitle?: string;
  receivedAtLocation: string;
  receivedAtDetail?: string;
  fromLocationLabel?: string;
  fromLocationName: string;
  fromLocationDetail?: string;
  receivedBy: string;
  receivedAt: Date;
  jobs: SrfJob[];
  transferSeries?: "TD" | "DC";
  partyFrom?: TransferPartyBlock;
  partyTo?: TransferPartyBlock;
  /** @deprecated Use receivedAtLocation */
  hoName?: string;
  /** @deprecated Use fromLocationName */
  fromStoreName?: string;
};

function normalizeInwardReceiptInput(payload: SrfInwardReceiptInput): Required<
  Pick<
    SrfInwardReceiptInput,
    | "inwardNumber"
    | "numberLabel"
    | "documentTitle"
    | "documentSubtitle"
    | "receivedAtLocation"
    | "fromLocationLabel"
    | "fromLocationName"
    | "receivedBy"
    | "receivedAt"
    | "jobs"
  >
> &
  Pick<SrfInwardReceiptInput, "receivedAtDetail" | "fromLocationDetail" | "transferSeries" | "partyFrom" | "partyTo"> {
  return {
    inwardNumber: payload.inwardNumber,
    numberLabel: payload.numberLabel ?? "Inward / transfer number",
    documentTitle: payload.documentTitle ?? "SRF Inward Acknowledgment",
    documentSubtitle:
      payload.documentSubtitle ??
      "The SRF watch(es) listed below have been physically received and inwarded at the location shown.",
    receivedAtLocation: payload.receivedAtLocation || payload.hoName || "—",
    receivedAtDetail: payload.receivedAtDetail,
    fromLocationLabel: payload.fromLocationLabel ?? "Received from",
    fromLocationName: payload.fromLocationName || payload.fromStoreName || "—",
    fromLocationDetail: payload.fromLocationDetail,
    receivedBy: payload.receivedBy,
    receivedAt: payload.receivedAt,
    jobs: payload.jobs,
    transferSeries: payload.transferSeries,
    partyFrom: payload.partyFrom,
    partyTo: payload.partyTo,
  };
}

export function printSrfInwardReceiptDocument(payload: SrfInwardReceiptInput): void {
  const input = normalizeInwardReceiptInput(payload);
  const when = input.receivedAt.toLocaleString("en-IN", { hour12: false });
  const barcode = srfBarcode(input.inwardNumber);
  const logoHtml = srfLogoImgHtml();
  const baseHref = typeof window !== "undefined" ? window.location.origin : "";
  const seriesNote = input.transferSeries
    ? xferMetaRow("Transfer series", input.transferSeries)
    : "";
  const receivedDetail = input.receivedAtDetail?.trim()
    ? `<br/>${escHtml(input.receivedAtDetail).replace(/\n/g, "<br/>")}`
    : "";
  const fromDetail = input.fromLocationDetail?.trim()
    ? `<br/>${escHtml(input.fromLocationDetail).replace(/\n/g, "<br/>")}`
    : "";

  const partyBlock =
    input.partyFrom && input.partyTo
      ? `<div class="xfer-party-grid">
          ${xferPartyHtml("Shipped from (Sender)", input.partyFrom)}
          ${xferPartyHtml("Received at (Location)", input.partyTo)}
        </div>`
      : `<div class="xfer-party-grid">
          <div class="xfer-party-col">
            <div class="xfer-party-head">Received at location</div>
            <div class="xfer-party-body">
              <div class="name">${escHtml(input.receivedAtLocation)}</div>
              ${receivedDetail}
            </div>
          </div>
          <div class="xfer-party-col">
            <div class="xfer-party-head">${escHtml(input.fromLocationLabel)}</div>
            <div class="xfer-party-body">
              <div class="name">${escHtml(input.fromLocationName)}</div>
              ${fromDetail}
            </div>
          </div>
        </div>`;

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  ${POPPINS_GOOGLE_HEAD}
  <base href="${escHtml(baseHref)}/" />
  <title>${escHtml(input.documentTitle)} ${escHtml(input.inwardNumber)}</title>
  <style>${TRANSFER_PRINT_CSS}${INWARD_RECEIPT_EXTRA_CSS}</style>
</head>
<body>
  <div class="doc">
    <div class="xfer-banner">
      <div class="xfer-banner-title">${escHtml(input.documentTitle)}</div>
      <div class="xfer-banner-sub">Inward receipt · Received at location<br/>Printed ${escHtml(when)}</div>
    </div>
    <div class="xfer-accent" aria-hidden="true"></div>
    <div class="xfer-top-row">
      <div class="xfer-top-cell xfer-top-cell--meta">
        <div class="xfer-meta-box">
          <table class="xfer-meta-table">
            <tbody>
              ${xferMetaRow(input.numberLabel, input.inwardNumber, true)}
              ${xferMetaRow("Document type", "IN")}
              ${xferMetaRow("Received at", input.receivedAtLocation)}
              ${xferMetaRow(input.fromLocationLabel, input.fromLocationName)}
              ${xferMetaRow("Inward date & time", when)}
              ${xferMetaRow("Received by", input.receivedBy)}
              ${xferMetaRow("Total SRF watches", String(input.jobs.length))}
              ${seriesNote}
            </tbody>
          </table>
        </div>
      </div>
      <div class="xfer-top-cell xfer-top-cell--barcode xfer-barcode-wrap">${barcode}</div>
      <div class="xfer-top-cell xfer-top-cell--logo xfer-logo-wrap">${logoHtml}</div>
    </div>
    ${partyBlock}
    <div class="xfer-body">
      <div class="xfer-pad">
        <div class="inward-received-banner">SRF received at: ${escHtml(input.receivedAtLocation)}</div>
        <p style="font-size:9px;color:#4a5568;margin:0 0 6px">${escHtml(input.documentSubtitle)}</p>
      </div>
      <div class="sec-title">SRF details received (${input.jobs.length})</div>
      <div class="xfer-pad">
        <table class="xfer-watches inward-srf-table">
        <thead>
          <tr>
            <th>#</th>
            <th>SRF No.</th>
            <th>Customer</th>
            <th>Mobile</th>
            <th>Brand</th>
            <th>Model</th>
            <th>Serial</th>
            <th>Complaint</th>
            <th>Est. (₹)</th>
            <th>Status</th>
            <th>Received at</th>
          </tr>
        </thead>
        <tbody>${inwardReceiptWatchRows(input.jobs, input.receivedAtLocation) || '<tr><td colspan="11">No SRF rows</td></tr>'}</tbody>
        <tfoot>
          <tr>
            <td colspan="10" style="text-align:right">Total items inwarded</td>
            <td style="text-align:center">${input.jobs.length}</td>
          </tr>
        </tfoot>
      </table>
      </div>
      <div class="xfer-footer">
        <div class="sign-row">
          <div class="sign-cell"><div class="sign-lbl">Received by</div><div class="sign-line"></div><div style="font-size:8px;margin-top:4px">${escHtml(input.receivedBy)}</div></div>
          <div class="sign-cell"><div class="sign-lbl">Verified by (supervisor)</div><div class="sign-line"></div></div>
          <div class="sign-cell"><div class="sign-lbl">Date &amp; stamp</div><div class="sign-line"></div></div>
        </div>
        <p class="xfer-footnote">
          This document confirms physical receipt of the SRF watch(es) at ${escHtml(input.receivedAtLocation)} against ${escHtml(input.numberLabel)} ${escHtml(input.inwardNumber)}.
          Retain for store/HO records and customer traceability.
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;

  openPrintDocument(`${input.documentTitle} ${input.inwardNumber}`, html);
}

/** Service centre inward acknowledgment (A4, tabular SRF details). */
export function printScInwardAckDocument(payload: SrfInwardReceiptInput): void {
  printSrfInwardReceiptDocument(payload);
}

/** Store inward acknowledgment when HO return is received at store. */
export function printStoreInwardReceiptDocument(payload: {
  inwardNumber: string;
  storeLabel: string;
  fromHoLabel: string;
  receivedBy: string;
  receivedAt: Date;
  jobs: SrfJob[];
  partyFrom?: TransferPartyBlock;
  partyTo?: TransferPartyBlock;
}): void {
  printSrfInwardReceiptDocument({
    inwardNumber: payload.inwardNumber,
    numberLabel: "Transfer number (TD)",
    documentTitle: "SRF Inward Acknowledgment — Received at Store",
    documentSubtitle:
      "The SRF watch(es) below have been received at the store location and are available for customer collection when ready.",
    receivedAtLocation: payload.storeLabel,
    fromLocationLabel: "From service centre (HO)",
    fromLocationName: payload.fromHoLabel,
    receivedBy: payload.receivedBy,
    receivedAt: payload.receivedAt,
    jobs: payload.jobs,
    transferSeries: "TD",
    partyFrom: payload.partyFrom,
    partyTo: payload.partyTo,
  });
}

/** @deprecated Prefer printTransferDocument / printTransferFromMeta with full party addresses. */
export function printDcDocument(
  kind: "DC" | "ODC",
  number: string,
  jobs: SrfJob[],
  opts?: {
    fromLocation?: string;
    toLocation?: string;
    fromHo?: string;
    toHo?: string;
    hoInvoiceRef?: string;
    storeInvoiceRef?: string;
    documentHeading?: string;
    printMeta?: TransferPrintMeta;
    flow?: TransferFlow;
    printKind?: TransferPrintKind;
    from?: TransferPartyBlock;
    to?: TransferPartyBlock;
    preparedBy?: string;
  },
): void {
  if (opts?.printMeta) {
    printTransferFromMeta(opts.printMeta, jobs, {
      seriesCode: kind,
      hoInvoiceRef: opts.hoInvoiceRef,
      storeInvoiceRef: opts.storeInvoiceRef,
      preparedBy: opts.preparedBy,
    });
    return;
  }
  if (opts?.from && opts?.to && opts.flow && opts.printKind) {
    printTransferDocument({
      transferNumber: number,
      printKind: opts.printKind,
      flow: opts.flow,
      from: opts.from,
      to: opts.to,
      jobs,
      seriesCode: kind,
      hoInvoiceRef: opts.hoInvoiceRef,
      storeInvoiceRef: opts.storeInvoiceRef,
      preparedBy: opts.preparedBy,
    });
    return;
  }
  const first = jobs[0];
  const from: TransferPartyBlock = {
    locationLabel: opts?.fromLocation ?? `From: ${first?.storeName ?? first?.regionName ?? "—"}`,
    legalName: opts?.fromHo ?? first?.regionName ?? "—",
    address: opts?.fromLocation ?? "—",
    phone: "—",
    email: "—",
    gstin: "—",
  };
  const to: TransferPartyBlock = {
    locationLabel: opts?.toLocation ?? `To: ${first?.destinationStoreId ?? first?.storeName ?? "—"}`,
    legalName: opts?.toHo ?? first?.regionName ?? "—",
    address: opts?.toLocation ?? "—",
    phone: "—",
    email: "—",
    gstin: "—",
  };
  const flow: TransferFlow =
    opts?.flow ?? (kind === "DC" && opts?.documentHeading?.toLowerCase().includes("store") ? "store_to_ho" : "ho_to_store");
  printTransferDocument({
    transferNumber: number,
    printKind: opts?.printKind ?? "dc",
    flow,
    from,
    to,
    jobs,
    seriesCode: kind,
    hoInvoiceRef: opts?.hoInvoiceRef ?? first?.hoSparesBillRef ?? undefined,
    storeInvoiceRef: opts?.storeInvoiceRef ?? first?.storeBillRef ?? undefined,
    preparedBy: opts?.preparedBy,
  });
}

const TECH_NOTES_PRINT_EXTRA_CSS = `
  .tech-notes-prefill {
    font-size: 9px; color: #0d1b2a; white-space: pre-wrap; margin-bottom: 6px;
    padding: 6px 8px; background: #f4f6fb; border: 1px solid #d8dff0;
  }
  .tech-notes-ruled {
    min-height: 100mm;
    border: 2px solid #1b3a8f;
    background-color: #fff;
    background-image: repeating-linear-gradient(
      180deg,
      transparent,
      transparent 17px,
      #d8dff0 17px,
      #d8dff0 18px
    );
    padding: 8px 10px 10px;
  }
  .complaint-block {
    font-size: 9px; line-height: 1.45; padding: 6px 8px;
    border: 1px solid #d8dff0; background: #fafbfd; min-height: 36px;
  }
`;

function assignmentSlipWatchRow(job: SrfJob): string {
  return `<tr>
    <td class="c">1</td>
    <td class="mono">${escHtml(job.reference)}</td>
    <td>${escHtml(srfDisplay(job.watchBrand))}</td>
    <td>${escHtml(srfDisplay(job.watchModel))}</td>
    <td class="mono">${escHtml(job.serial || "—")}</td>
    <td class="amt">${escHtml(
      Number.isFinite(job.estimateTotalInr)
        ? `Approx. ${job.estimateTotalInr.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
        : "—",
    )}</td>
    <td>${escHtml(inwardJobStatusLabel(job.status))}</td>
  </tr>`;
}

export type TechnicianNotesPrintOpts = {
  assignedAt?: Date;
  serviceCentreLabel?: string;
  prefillNotes?: string;
};

/** Technician assignment slip with ruled notes area (A4, branded template). */
export function printAssignmentSlip(
  job: SrfJob,
  technicianLabel: string,
  opts?: TechnicianNotesPrintOpts,
): void {
  const when = (opts?.assignedAt ?? new Date()).toLocaleString("en-IN", { hour12: false });
  const printed = new Date().toLocaleString("en-IN", { hour12: false });
  const barcode = srfBarcode(job.reference);
  const logoHtml = srfLogoImgHtml();
  const baseHref = typeof window !== "undefined" ? window.location.origin : "";
  const hoLabel = opts?.serviceCentreLabel?.trim() || job.regionName?.trim() || "Service centre";
  const storeLine = job.storeName?.trim() ? `${job.storeName}${job.regionName ? ` · ${job.regionName}` : ""}` : "—";
  const estFinish = job.estimatedFinishDate ? formatDateOnly(job.estimatedFinishDate) : "—";
  const prefill = opts?.prefillNotes?.trim() || job.reestimateRequestedNote?.trim() || "";
  const prefillBlock = prefill
    ? `<div class="tech-notes-prefill"><strong>System / prior note:</strong> ${escHtml(prefill)}</div>`
    : "";

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  ${POPPINS_GOOGLE_HEAD}
  <base href="${escHtml(baseHref)}/" />
  <title>Technician Notes ${escHtml(job.reference)}</title>
  <style>${TRANSFER_PRINT_CSS}${TECH_NOTES_PRINT_EXTRA_CSS}</style>
</head>
<body>
  <div class="doc">
    <div class="xfer-banner">
      <div class="xfer-banner-title">Technician Assignment &amp; Work Notes</div>
      <div class="xfer-banner-sub">Internal repair copy<br/>Printed ${escHtml(printed)}</div>
    </div>
    <div class="xfer-accent" aria-hidden="true"></div>
    <div class="xfer-top-row">
      <div class="xfer-top-cell xfer-top-cell--meta">
        <div class="xfer-meta-box">
          <div><strong>SRF No.:</strong> ${escHtml(job.reference)}</div>
          <div><strong>Technician:</strong> ${escHtml(technicianLabel)}</div>
          <div><strong>Assigned at:</strong> ${escHtml(when)}</div>
          <div><strong>Service centre:</strong> ${escHtml(hoLabel)}</div>
          <div><strong>Booking store:</strong> ${escHtml(storeLine)}</div>
          <div><strong>Est. finish:</strong> ${escHtml(estFinish)}</div>
        </div>
      </div>
      <div class="xfer-top-cell xfer-top-cell--barcode xfer-barcode-wrap">${barcode}</div>
      <div class="xfer-top-cell xfer-top-cell--logo xfer-logo-wrap">${logoHtml}</div>
    </div>
    <div class="xfer-body">
      <div class="sec-title">SRF / watch details</div>
      <table class="xfer-watches inward-srf-table">
        <thead>
          <tr>
            <th>#</th>
            <th>SRF No.</th>
            <th>Brand</th>
            <th>Model</th>
            <th>Serial</th>
            <th>Estimate (approx.) (₹)</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>${assignmentSlipWatchRow(job)}</tbody>
      </table>
      <div class="sec-title">Complaint / remarks</div>
      <div class="complaint-block">${escHtml(job.complaint?.trim() || "—")}</div>
      <div class="sec-title">Technician notes (diagnosis, work done, parts used)</div>
      <p style="font-size:8px;color:#4a5568;margin:0 0 4px">Use the ruled area below for handwritten or stamped workshop notes. Retain with the watch until repair is complete.</p>
      ${prefillBlock}
      <div class="tech-notes-ruled" aria-label="Technician notes area"></div>
      <div class="sign-row">
        <div><div class="sign-lbl">Technician</div><div class="sign-line"></div><div style="font-size:8px;margin-top:4px">${escHtml(technicianLabel)}</div></div>
        <div><div class="sign-lbl">Supervisor</div><div class="sign-line"></div></div>
        <div><div class="sign-lbl">Date &amp; stamp</div><div class="sign-line"></div></div>
      </div>
    </div>
  </div>
</body>
</html>`;

  openPrintDocument(`Technician Notes ${job.reference}`, html);
}

export function printBrandDispatchDocument(job: SrfJob, payload?: { dispatchRef?: string; note?: string }): void {
  const dispatchRef = payload?.dispatchRef?.trim() || job.brandDispatchRef?.trim() || "—";
  const note =
    payload?.note?.trim() ||
    job.brandDispatchNote?.trim() ||
    "External brand repair required (cannot be repaired at HO).";
  const printed = new Date().toLocaleString("en-IN", { hour12: false });
  const bookingDate = formatDateTime(job.createdAt);
  const bookingCenter = job.storeName ?? job.storeId ?? "—";
  const bookingAddress = [job.storeName, job.regionName].filter(Boolean).join(", ") || "—";
  const barcode = srfBarcode(job.reference);
  const logoHtml = srfLogoImgHtml();
  const baseHref = typeof window !== "undefined" ? window.location.origin : "";
  const totalAmt = Number(job.brandInvoiceAmountInr ?? job.estimateTotalInr ?? 0);
  const sparesRows = (job.usedSpares ?? [])
    .map(
      (x, idx) =>
        `<tr>
          <td class="c">${idx + 1}</td>
          <td class="mono">${escHtml(x.spareId ?? "—")}</td>
          <td>${escHtml(x.name)}</td>
          <td class="c">${escHtml(String(Number(x.qty ?? 0)))}</td>
          <td class="amt">${escHtml(Number(x.unitPriceInr ?? 0).toFixed(2))}</td>
          <td class="amt">${escHtml(
            Number(x.lineTotalInr ?? Number(x.unitPriceInr ?? 0) * Number(x.qty ?? 0)).toFixed(2),
          )}</td>
        </tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  ${POPPINS_GOOGLE_HEAD}
  <base href="${escHtml(baseHref)}/" />
  <title>Brand Dispatch ${escHtml(job.reference)}</title>
  <style>${TRANSFER_PRINT_CSS}${TECH_NOTES_PRINT_EXTRA_CSS}</style>
</head>
<body>
  <div class="doc">
    <div class="xfer-banner">
      <div class="xfer-banner-title">Brand Dispatch &amp; Technician Notes</div>
      <div class="xfer-banner-sub">External brand service copy<br/>Printed ${escHtml(printed)}</div>
    </div>
    <div class="xfer-accent" aria-hidden="true"></div>
    <div class="xfer-top-row">
      <div class="xfer-top-cell xfer-top-cell--meta">
        <div class="xfer-meta-box">
          <div><strong>SRF No.:</strong> ${escHtml(job.reference)}</div>
          <div><strong>Dispatch ODC:</strong> ${escHtml(job.brandOdcNumber ?? "—")}</div>
          <div><strong>Dispatch ref / AWB:</strong> ${escHtml(dispatchRef)}</div>
          <div><strong>Booking date:</strong> ${escHtml(bookingDate)}</div>
          <div><strong>Booking centre:</strong> ${escHtml(bookingCenter)}</div>
        </div>
      </div>
      <div class="xfer-top-cell xfer-top-cell--barcode xfer-barcode-wrap">${barcode}</div>
      <div class="xfer-top-cell xfer-top-cell--logo xfer-logo-wrap">${logoHtml}</div>
    </div>
    <div class="xfer-body">
      <div class="sec-title">Customer &amp; product</div>
      <table class="xfer-watches inward-srf-table">
        <thead>
          <tr>
            <th>SRF No.</th>
            <th>Customer</th>
            <th>Mobile</th>
            <th>Brand / model</th>
            <th>Serial</th>
            <th>Brand inward ref</th>
            <th>Invoice ref</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="mono">${escHtml(job.reference)}</td>
            <td>${escHtml(job.customerName)}</td>
            <td>${escHtml(job.phone || "—")}</td>
            <td>${escHtml(`${job.watchBrand} ${job.watchModel}`.trim())}</td>
            <td class="mono">${escHtml(job.serial || "—")}</td>
            <td>${escHtml(job.brandInwardRef ?? "—")}</td>
            <td>${escHtml(job.brandInvoiceRef ?? "—")}</td>
          </tr>
        </tbody>
      </table>
      <div class="sec-title">Customer complaint</div>
      <div class="complaint-block">${escHtml(job.complaint?.trim() || "—")}</div>
      <div class="sec-title">Technician / supervisor paper note</div>
      <div class="tech-notes-prefill">${escHtml(note)}</div>
      <div class="sec-title">Centre address</div>
      <div class="complaint-block">${escHtml(bookingAddress)}</div>
      <div class="sec-title">Spares / parts entry</div>
      <table class="xfer-watches">
        <thead>
          <tr><th>#</th><th>Stock no.</th><th>Part name</th><th>Qty</th><th>Unit (₹)</th><th>Line (₹)</th></tr>
        </thead>
        <tbody>${sparesRows || '<tr><td colspan="6">No spares lines entered yet.</td></tr>'}</tbody>
        <tfoot>
          <tr>
            <td colspan="5" style="text-align:right">Total spares / main amount (₹)</td>
            <td class="amt">${escHtml(totalAmt.toFixed(2))}</td>
          </tr>
        </tfoot>
      </table>
      <div class="sec-title">Accessories / packing remarks</div>
      <div class="tech-notes-ruled" style="min-height: 28mm"></div>
      <div class="sign-row">
        <div><div class="sign-lbl">Prepared by (supervisor)</div><div class="sign-line"></div></div>
        <div><div class="sign-lbl">Received by (brand)</div><div class="sign-line"></div></div>
        <div><div class="sign-lbl">Outward / inward date</div><div class="sign-line"></div></div>
      </div>
    </div>
  </div>
</body>
</html>`;

  openPrintDocument(`Brand Dispatch ${job.reference}`, html);
}

export function printEstimateDocument(
  job: SrfJob,
  payload?: {
    observations?: Partial<Record<"caseCrystal" | "glassCrystal" | "strapBracelet" | "hands" | "crownPushers" | "movement" | "waterResistance" | "additionalNotes", string>>;
    suggestedRepairs?: Partial<Record<"movementOverhaul" | "polishing" | "waterKit" | "bezel" | "crownStem" | "glassCrystal" | "dialHands", string>>;
  },
): void {
  const spareRows = (job.usedSpares ?? [])
    .map(
      (x) =>
        `<tr>
          <td style="padding:6px;border:1px solid #111">A</td>
          <td style="padding:6px;border:1px solid #111">${x.name}</td>
          <td style="padding:6px;border:1px solid #111;text-align:right">INR ${Number(x.lineTotalInr ?? Number(x.unitPriceInr ?? 0) * Number(x.qty ?? 0)).toFixed(2)}</td>
        </tr>`,
    )
    .join("");
  const baseRepair = Number(job.estimateTotalInr ?? 0);
  const spareTotal = (job.usedSpares ?? []).reduce((sum, x) => {
    const lineTotal = Number(x.lineTotalInr ?? NaN);
    if (Number.isFinite(lineTotal)) return sum + lineTotal;
    return sum + Number(x.unitPriceInr ?? 0) * Number(x.qty ?? 0);
  }, 0);
  const mandatoryRepair = Math.max(baseRepair - spareTotal, 0);
  const obs = payload?.observations ?? {};
  const repairs = payload?.suggestedRepairs ?? {};
  const html = base(
    `Estimate ${job.reference}`,
    `${barcodeBlock(job.reference)}
     <h2 style="margin:0 0 6px">WATCH OBSERVATION &amp; SERVICE ESTIMATION</h2>
     <table style="width:100%;border-collapse:collapse;margin-top:10px" border="1" cellspacing="0" cellpadding="6">
       <tbody>
         <tr><td><strong>SRF No</strong></td><td>${job.reference}</td><td><strong>Date of Estimation</strong></td><td>${new Date().toLocaleDateString()}</td></tr>
         <tr><td><strong>Customer</strong></td><td>${job.customerName}</td><td><strong>Phone</strong></td><td>${job.phone}</td></tr>
         <tr><td><strong>Brand</strong></td><td>${job.watchBrand}</td><td><strong>Model</strong></td><td>${job.watchModel}</td></tr>
         <tr><td><strong>Serial Number</strong></td><td>${job.serial}</td><td><strong>Service Ref</strong></td><td>${job.reference}</td></tr>
        <tr><td><strong>Estimated service finish</strong></td><td>${job.estimatedFinishDate || "-"}</td><td><strong></strong></td><td></td></tr>
       </tbody>
     </table>

     <h3 style="margin:14px 0 6px">Watch Condition / Observation</h3>
     <table style="width:100%;border-collapse:collapse" border="1" cellspacing="0" cellpadding="6">
       <thead><tr><th>Component</th><th>Condition / Observation</th></tr></thead>
       <tbody>
         <tr><td>Case / Crystal</td><td>${obs.caseCrystal || job.complaint || "-"}</td></tr>
         <tr><td>Glass / Crystal</td><td>${obs.glassCrystal || "-"}</td></tr>
         <tr><td>Strap / Bracelet</td><td>${obs.strapBracelet || "-"}</td></tr>
         <tr><td>Hands</td><td>${obs.hands || "-"}</td></tr>
         <tr><td>Crown / Pushers</td><td>${obs.crownPushers || "-"}</td></tr>
         <tr><td>Movement</td><td>${obs.movement || "-"}</td></tr>
         <tr><td>Water resistance</td><td>${obs.waterResistance || "-"}</td></tr>
         <tr><td>Additional notes</td><td>${obs.additionalNotes || job.complaint || "-"}</td></tr>
       </tbody>
     </table>

     <h3 style="margin:14px 0 6px">Suggested Repairs</h3>
     <table style="width:100%;border-collapse:collapse" border="1" cellspacing="0" cellpadding="6">
       <thead><tr><th>Repair / Service Item</th><th>Remarks</th></tr></thead>
       <tbody>
         <tr><td>Movement overhaul</td><td>${repairs.movementOverhaul || "-"}</td></tr>
         <tr><td>Polishing (Case / Bracelet)</td><td>${repairs.polishing || "-"}</td></tr>
         <tr><td>Replace water resistant kit</td><td>${repairs.waterKit || "-"}</td></tr>
         <tr><td>Replace bezel</td><td>${repairs.bezel || "-"}</td></tr>
         <tr><td>Replace Crown / Stem</td><td>${repairs.crownStem || "-"}</td></tr>
         <tr><td>Replace Glass / Crystal</td><td>${repairs.glassCrystal || "-"}</td></tr>
         <tr><td>Replace Dial / Hands</td><td>${repairs.dialHands || "-"}</td></tr>
       </tbody>
     </table>

     <h3 style="margin:14px 0 6px">Service Cost Breakdown</h3>
     <table style="width:100%;border-collapse:collapse" cellspacing="0" cellpadding="0">
       <tbody>
         <tr>
           <td style="width:100%;vertical-align:top">
             <table style="width:100%;border-collapse:collapse" border="1" cellspacing="0" cellpadding="6">
               <thead><tr><th style="width:80px">Mandatory Repair (A)</th><th>Description</th><th style="width:180px">Amount (INR)</th></tr></thead>
               <tbody>
                 <tr><td style="border:1px solid #111;padding:6px">A</td><td style="border:1px solid #111;padding:6px">Service / Labour</td><td style="border:1px solid #111;padding:6px;text-align:right">INR ${mandatoryRepair.toFixed(2)}</td></tr>
                 ${spareRows || '<tr><td style="border:1px solid #111;padding:6px">A</td><td style="border:1px solid #111;padding:6px">Spare parts</td><td style="border:1px solid #111;padding:6px;text-align:right">INR 0.00</td></tr>'}
                 <tr><td colspan="2" style="border:1px solid #111;padding:6px;text-align:right"><strong>TOTAL (A)</strong></td><td style="border:1px solid #111;padding:6px;text-align:right"><strong>INR ${baseRepair.toFixed(2)}</strong></td></tr>
               </tbody>
             </table>
             <table style="width:100%;border-collapse:collapse;margin-top:6px" border="1" cellspacing="0" cellpadding="6">
               <thead><tr><th style="width:80px">Optional Repair (B)</th><th>Description</th><th style="width:180px">Amount (INR)</th></tr></thead>
               <tbody>
                 <tr><td style="border:1px solid #111;padding:6px">B</td><td style="border:1px solid #111;padding:6px">-</td><td style="border:1px solid #111;padding:6px;text-align:right">INR 0.00</td></tr>
                 <tr><td colspan="2" style="border:1px solid #111;padding:6px;text-align:right"><strong>TOTAL (B)</strong></td><td style="border:1px solid #111;padding:6px;text-align:right"><strong>INR 0.00</strong></td></tr>
               </tbody>
             </table>
           </td>
         </tr>
       </tbody>
     </table>

     <div style="margin-top:10px;border:1px solid #111;padding:8px;text-align:right"><strong>Total Estimated Cost (approx.) (A+B): Approx. INR ${baseRepair.toFixed(2)}</strong></div>
     <div style="margin-top:8px;font-size:12px"><strong>Rupees:</strong> ${baseRepair.toLocaleString("en-IN")} only</div>

     <h3 style="margin:14px 0 6px">Terms and Conditions</h3>
     <ol style="margin:0;padding-left:18px;font-size:12px;line-height:1.45">
       <li>The estimation provided is an approximate cost. Final cost may vary based on actual condition.</li>
       <li>Customer approval is required before initiating service.</li>
       <li>Any additional faults found during service will be informed with revised cost.</li>
       <li>Watch should be collected within 30 days after service completion.</li>
       <li>Replaced parts will be discarded unless requested at submission time.</li>
       <li>Functional warranty is applicable only for serviced components.</li>
       <li>Computer-generated document; physical signature may be captured where needed.</li>
     </ol>

     <div style="margin-top:26px">Customer Signature: ____________________________</div>
     <div style="margin-top:16px">Date: ____________________________</div>
     <div style="margin-top:16px">Authorized Personnel: ____________________________</div>`,
  );
  openPrintDocument(`Estimate ${job.reference}`, html);
}

function formatCollectionPaymentForPrint(
  _mode: string,
  _paidAmountInr: number,
  details: AdvancePaymentDetails | null | undefined,
): string {
  if (details?.reference) {
    return `<div style="margin-top:8px;font-size:12px"><strong>Collection payment ref:</strong> ${details.reference}</div>`;
  }
  return "";
}

export function printStoreServiceInvoice(
  job: SrfJob,
  payload: {
    paymentMode: string;
    paidAmountInr: number;
    otpCode: string;
    billedAt?: Date;
    hoSparesBillRef?: string;
    storeBillRef?: string;
    additionalCharges?: Array<{ description: string; amountInr: number }>;
    paymentDetails?: AdvancePaymentDetails;
  },
): void {
  const billedAt = payload.billedAt ?? new Date();
  const spareRows = (job.usedSpares ?? [])
    .map((x, idx) => `<tr><td>${idx + 1}</td><td>${x.name}</td><td>${x.qty}</td></tr>`)
    .join("");
  const additionalChargeRows = (payload.additionalCharges ?? [])
    .map(
      (line, idx) =>
        `<tr><td>${idx + 1}</td><td>${line.description}</td><td>INR ${Number(line.amountInr ?? 0).toFixed(2)}</td></tr>`,
    )
    .join("");
  const html = base(
    `Invoice ${job.reference}`,
    `${barcodeBlock(job.reference)}<h2 style="margin:0 0 12px">Service Handover Invoice</h2>
     <table style="width:100%;border-collapse:collapse" border="1" cellspacing="0" cellpadding="6">
       <tbody>
         <tr><td><strong>SRF</strong></td><td>${job.reference}</td><td><strong>Date</strong></td><td>${billedAt.toLocaleString()}</td></tr>
         <tr><td><strong>Customer</strong></td><td>${job.customerName}</td><td><strong>Phone</strong></td><td>${job.phone}</td></tr>
         <tr><td><strong>Watch</strong></td><td>${job.watchBrand} ${job.watchModel}</td><td><strong>Serial</strong></td><td>${job.serial}</td></tr>
         <tr><td><strong>Service estimate (approx.)</strong></td><td>Approx. INR ${(job.estimateTotalInr ?? 0).toFixed(2)}</td><td><strong>Paid amount</strong></td><td>INR ${payload.paidAmountInr.toFixed(2)}</td></tr>
         <tr><td><strong>Payment mode</strong></td><td>${payload.paymentMode}</td><td><strong>Collection OTP</strong></td><td>${payload.otpCode}</td></tr>
         <tr><td><strong>HO spare bill ref</strong></td><td>${payload.hoSparesBillRef || "-"}</td><td><strong>Store bill ref</strong></td><td>${payload.storeBillRef || "-"}</td></tr>
       </tbody>
     </table>
     ${Number(job.brandInvoiceAmountInr ?? 0) > 0 ? `
     <h3 style="margin:16px 0 8px">Brand repair invoice</h3>
     <table style="width:100%;border-collapse:collapse" border="1" cellspacing="0" cellpadding="6">
       <tbody>
         <tr><td><strong>Brand invoice ref</strong></td><td>${job.brandInvoiceRef ?? "-"}</td></tr>
         <tr><td><strong>Brand invoice amount</strong></td><td>INR ${Number(job.brandInvoiceAmountInr ?? 0).toFixed(2)}</td></tr>
         ${Number(job.brandEstimateInr ?? 0) > 0 ? `<tr><td><strong>Brand estimate</strong></td><td>INR ${Number(job.brandEstimateInr ?? 0).toFixed(2)}</td></tr>` : ""}
       </tbody>
     </table>` : `
     <h3 style="margin:16px 0 8px">Used spares</h3>
     <table style="width:100%;border-collapse:collapse" border="1" cellspacing="0" cellpadding="6">
       <thead><tr><th>#</th><th>Spare</th><th>Qty</th></tr></thead>
       <tbody>${spareRows || '<tr><td colspan="3">No spares entered</td></tr>'}</tbody>
     </table>`}
     <h3 style="margin:16px 0 8px">Additional line items</h3>
     <table style="width:100%;border-collapse:collapse" border="1" cellspacing="0" cellpadding="6">
       <thead><tr><th>#</th><th>Description</th><th>Amount</th></tr></thead>
       <tbody>${additionalChargeRows || '<tr><td colspan="3">No additional charges</td></tr>'}</tbody>
     </table>
     ${formatCollectionPaymentForPrint(payload.paymentMode, payload.paidAmountInr, payload.paymentDetails)}
     ${formatAdvanceForPrint(job.advanceInr, job.advancePaymentMode, job.advancePaymentDetails as AdvancePaymentDetails | null | undefined)}
     <div style="margin-top:24px">Customer Sign: _____________________</div>
     <div style="margin-top:16px">Store Sign: _____________________</div>`,
  );
  openPrintDocument(`Invoice ${job.reference}`, html);
}
