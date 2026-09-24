import { documentBarcodeImageSrc } from "./invoiceScanCodes";
import { openPrintDocument } from "./inventoryDocuments";
import type { SparePart } from "../types/spare";

export type SpareStickerData = {
  itemNumber: string;
  sku: string;
  internalSerial: string;
  mrpLabel: string;
  brandMark: string;
  barcodeSrc: string;
};

function esc(v: string): string {
  return v
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Left-side article number on TIMEX-style stickers.
 * Only a real catalogue item code is printed — never a generated id.
 */
export function spareStickerItemNumber(spare: SparePart): string {
  const cf = spare.customFields ?? {};
  const fromCf = String(cf.item_code ?? cf.itemCode ?? cf.item_number ?? cf.itemNumber ?? "").trim();
  if (/^\d{4,8}$/.test(fromCf)) return fromCf;
  if (/^\d{4,8}$/.test(spare.sku.trim())) return spare.sku.trim();
  return "";
}

export function spareStickerMrpLabel(spare: SparePart): string {
  const raw = Number(spare.mrpInr ?? spare.sellingPriceInr ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) return "MRP: —";
  const shown = Number.isInteger(raw) ? String(raw) : raw.toFixed(2);
  return `MRP: ${shown}`;
}

export function spareStickerBrandMark(brand: string | null | undefined, locationCode: string | null | undefined): string {
  const b = String(brand ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  const loc = locationSuffix(locationCode);
  if (b && loc) return `${b}-${loc}`;
  return b || loc || "ZIMSON";
}

function locationSuffix(locationCode: string | null | undefined): string {
  return String(locationCode ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4);
}

/** SKU as printed on the sticker (catalogue SKU + store code, e.g. 10SI35485-CB). */
export function spareStickerSku(sku: string, locationCode?: string | null): string {
  const base = sku.trim();
  const loc = locationSuffix(locationCode);
  if (!base || !loc) return base;
  if (base.toUpperCase().endsWith(`-${loc}`)) return base;
  return `${base}-${loc}`;
}

/**
 * Internal serial printed on the sticker (system id, or custom field when set).
 * When printing several copies, each copy gets a unique suffix.
 */
export function spareStickerInternalSerial(
  spare: SparePart,
  opts?: { locationCode?: string | null; copyIndex?: number },
): string {
  const cf = spare.customFields ?? {};
  const fromCf = String(
    cf.internal_serial ?? cf.internalSerial ?? cf.serial_no ?? cf.serialNo ?? cf.serial ?? "",
  ).trim();
  const loc = locationSuffix(opts?.locationCode);
  const idPart = spare.id.replace(/-/g, "").slice(-8).toUpperCase();
  const base = fromCf || (loc ? `${loc}-${idPart}` : idPart);
  const copyIndex = Math.max(1, opts?.copyIndex ?? 1);
  return `${base}-${String(copyIndex).padStart(3, "0")}`;
}

export function buildSpareStickerData(
  spare: SparePart,
  opts?: { brand?: string | null; locationCode?: string | null; copyIndex?: number },
): SpareStickerData {
  const catalogSku = spare.sku.trim() || spare.id;
  const sku = spareStickerSku(catalogSku, opts?.locationCode);
  return {
    itemNumber: spareStickerItemNumber(spare),
    sku,
    internalSerial: spareStickerInternalSerial(spare, opts),
    mrpLabel: spareStickerMrpLabel(spare),
    brandMark: spareStickerBrandMark(opts?.brand, opts?.locationCode),
    barcodeSrc: documentBarcodeImageSrc(catalogSku, { scale: 3, height: 10 }),
  };
}

function stickerCardHtml(data: SpareStickerData): string {
  const item = data.itemNumber
    ? `<span class="sticker-item">${esc(data.itemNumber)}</span>`
    : `<span class="sticker-item"></span>`;
  return `<div class="sticker">
  <div class="sticker-top">
    ${item}
    <span class="sticker-sku">${esc(data.sku)}</span>
  </div>
  <div class="sticker-bar">
    <img src="${esc(data.barcodeSrc)}" alt="${esc(data.sku)}" />
  </div>
  <div class="sticker-serial">ISN ${esc(data.internalSerial)}</div>
  <div class="sticker-bottom">
    <span class="sticker-mrp">${esc(data.mrpLabel)}</span>
    <span class="sticker-brand">${esc(data.brandMark)}</span>
  </div>
</div>`;
}

const STICKER_CSS = `
  body { margin: 0; padding: 12px; background: #d4d4d4; color: #111; }
  .sheet { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
  .sticker {
    width: 70mm;
    height: 25mm;
    box-sizing: border-box;
    background: #fff;
    border: 0.25mm solid #cfcfcf;
    border-radius: 3.4mm;
    padding: 1.6mm 3mm 1.4mm;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    font-family: Arial, Helvetica, sans-serif;
    color: #111;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .sticker-top, .sticker-bottom {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 2.5mm;
  }
  .sticker-item, .sticker-sku, .sticker-mrp, .sticker-brand {
    font-weight: 700;
    font-size: 9pt;
    letter-spacing: 0.01em;
    line-height: 1;
    white-space: nowrap;
  }
  .sticker-sku, .sticker-brand { text-align: right; }
  .sticker-sku { max-width: 46mm; overflow: hidden; text-overflow: ellipsis; }
  .sticker-bar {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 9mm;
    padding: 0.3mm 3mm;
  }
  .sticker-bar img {
    display: block;
    width: 100%;
    height: 7.2mm;
    object-fit: contain;
    object-position: center;
  }
  .sticker-serial {
    font-weight: 700;
    font-size: 7.5pt;
    letter-spacing: 0.04em;
    line-height: 1;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  @media print {
    @page { margin: 4mm; }
    body { padding: 0; background: #fff; }
    .sticker { page-break-inside: avoid; }
  }
`;

export function printSpareStickers(stickers: SpareStickerData[], copies = 1): void {
  if (stickers.length === 0) return;
  const count = Math.max(1, Math.min(99, copies));
  const cards = stickers
    .flatMap((s) =>
      Array.from({ length: count }, (_, i) => {
        const copyIndex = i + 1;
        const serialBase = s.internalSerial.replace(/-\d{3}$/, "");
        return stickerCardHtml({
          ...s,
          internalSerial: `${serialBase}-${String(copyIndex).padStart(3, "0")}`,
        });
      }),
    )
    .join("");
  openPrintDocument(
    `Spare sticker${stickers.length > 1 ? "s" : ""}`,
    `<style>${STICKER_CSS}</style><div class="sheet">${cards}</div>`,
  );
}
