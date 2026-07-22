import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import bwipjs from "bwip-js/node";
import type { SrfPrintData } from "./loadSrfPrintData";

type PdfDoc = InstanceType<typeof PDFDocument>;

const NAVY = "#1b3a8f";
const NAVY_DEEP = "#0c1c56";
const GOLD = "#3B82F6";
const GOLD_LIGHT = "#60A5FA";
const INK = "#0d1b2a";
const MUTED = "#64748b";
const BORDER = "#e2e8f5";
const CARD_BG = "#fafbfe";
const PAGE_W = 595.28;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;

function display(v?: string | null): string {
  const t = String(v ?? "").trim();
  return t || "—";
}

function formatDateOnly(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN");
}

function formatDateTime(value?: string | null): string {
  if (!value) return new Date().toLocaleString("en-IN", { hour12: false });
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-IN", { hour12: false });
}

function logoPath(): string | null {
  const p = path.join(process.cwd(), "public", "zimson-logo.png");
  return fs.existsSync(p) ? p : null;
}

function truncate(value: string, max: number): string {
  const v = value.trim() || "-";
  return v.length > max ? `${v.slice(0, max - 1)}…` : v;
}

/** Real, scannable Code128 barcode as a PNG — same symbology used in the browser print preview. */
async function generateBarcodePng(text: string): Promise<Buffer | null> {
  try {
    const png = await bwipjs.toBuffer({
      bcid: "code128",
      text,
      scale: 3,
      height: 10,
      includetext: false,
      backgroundcolor: "ffffff",
    });
    return png;
  } catch {
    return null;
  }
}

/** Filled circle badge with a small white glyph, used for icon accents. Uses flat fills (no PDF shading patterns) for reliable rendering across WhatsApp / mobile PDF viewers. */
function iconBadge(
  doc: PdfDoc,
  cx: number,
  cy: number,
  r: number,
  colorFrom: string,
  colorTo: string,
  glyph: "calendar" | "wallet" | "wrench" | "rupee" | "check" | "pin" | "box",
): void {
  doc.circle(cx, cy, r).fill(colorTo);
  doc.fillColor("#ffffff").strokeColor("#ffffff").lineWidth(1.1);
  const s = r * 0.62;
  if (glyph === "calendar") {
    doc.roundedRect(cx - s, cy - s * 0.75, s * 2, s * 1.55, 1).stroke();
    doc.moveTo(cx - s, cy - s * 0.15).lineTo(cx + s, cy - s * 0.15).stroke();
    doc.moveTo(cx - s * 0.45, cy - s * 1.1).lineTo(cx - s * 0.45, cy - s * 0.6).stroke();
    doc.moveTo(cx + s * 0.45, cy - s * 1.1).lineTo(cx + s * 0.45, cy - s * 0.6).stroke();
  } else if (glyph === "wallet") {
    doc.roundedRect(cx - s, cy - s * 0.7, s * 2, s * 1.4, 1.5).stroke();
    doc.circle(cx + s * 0.45, cy, s * 0.22).fill("#ffffff");
  } else if (glyph === "wrench") {
    doc.lineWidth(1.4);
    doc.moveTo(cx - s * 0.8, cy + s * 0.8).lineTo(cx + s * 0.5, cy - s * 0.5).stroke();
    doc.circle(cx - s * 0.85, cy + s * 0.85, s * 0.32).stroke();
    doc.circle(cx + s * 0.65, cy - s * 0.65, s * 0.28).stroke();
  } else if (glyph === "check") {
    doc.lineWidth(1.6);
    doc.moveTo(cx - s * 0.7, cy).lineTo(cx - s * 0.15, cy + s * 0.55).lineTo(cx + s * 0.8, cy - s * 0.55).stroke();
  } else if (glyph === "pin") {
    doc
      .moveTo(cx, cy + s)
      .bezierCurveTo(cx - s, cy + s * 0.2, cx - s * 0.75, cy - s, cx, cy - s)
      .bezierCurveTo(cx + s * 0.75, cy - s, cx + s, cy + s * 0.2, cx, cy + s)
      .fill("#ffffff");
    doc.circle(cx, cy - s * 0.15, s * 0.32).fill(colorTo);
  } else if (glyph === "box") {
    doc.roundedRect(cx - s, cy - s * 0.85, s * 2, s * 1.7, 1).stroke();
    doc.moveTo(cx - s, cy - s * 0.1).lineTo(cx + s, cy - s * 0.1).stroke();
  } else if (glyph === "rupee") {
    // Drawn as vector strokes (not a text glyph) since the Rupee sign (U+20B9) is
    // not part of the standard, non-embedded Helvetica font used in this document.
    doc.lineWidth(1.3);
    doc.moveTo(cx - s * 0.75, cy - s * 0.85).lineTo(cx + s * 0.75, cy - s * 0.85).stroke();
    doc.moveTo(cx - s * 0.75, cy - s * 0.25).lineTo(cx + s * 0.75, cy - s * 0.25).stroke();
    doc.moveTo(cx - s * 0.75, cy - s * 0.85).lineTo(cx + s * 0.15, cy - s * 0.85).lineTo(cx + s * 0.15, cy - s * 0.25).stroke();
    doc.moveTo(cx - s * 0.35, cy - s * 0.25).lineTo(cx + s * 0.75, cy + s * 0.9).stroke();
  }
  doc.font("Helvetica");
}

/** Rounded pill-shaped navy section header with a gold accent icon, mirroring the on-screen premium design. */
function sectionPill(doc: PdfDoc, title: string, y: number, glyph: "box" | "wrench" | "check" | "pin" = "box"): number {
  doc.font("Helvetica-Bold").fontSize(9.5);
  const label = title.toUpperCase();
  const textW = doc.widthOfString(label);
  const pillH = 21;
  const pillW = textW + 42;
  doc.roundedRect(MARGIN, y, pillW, pillH, pillH / 2).fill(NAVY);
  iconBadge(doc, MARGIN + 14, y + pillH / 2, 7, GOLD_LIGHT, GOLD, glyph);
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(9.5).text(label, MARGIN + 26, y + 6.2);
  doc.font("Helvetica");
  return y + pillH + 8;
}

/** Rounded white card container used throughout the document for a consistent, elevated look. */
function card(doc: PdfDoc, x: number, y: number, w: number, h: number, fill = "#ffffff"): void {
  doc.roundedRect(x, y, w, h, 8).fill(fill).roundedRect(x, y, w, h, 8).lineWidth(0.75).strokeColor(BORDER).stroke();
}

/** Vertical spacing between consecutive meta lines in the top-left info card (must be tall enough for a label + value pair). */
const META_LINE_GAP = 24;

function metaLine(doc: PdfDoc, x: number, y: number, label: string, value: string, glyph: "calendar" | "check" | "pin" | "box"): void {
  iconBadge(doc, x + 6, y + 5, 6, NAVY, NAVY_DEEP, glyph);
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(MUTED).text(label, x + 16, y, { width: 190, continued: false });
  doc.font("Helvetica-Bold").fontSize(9).fillColor(INK).text(truncate(value, 40), x + 16, y + 10, { width: 190 });
}

function fieldRow(doc: PdfDoc, label: string, value: string, y: number, col = 0): number {
  const x = MARGIN + col * (CONTENT_W / 2 + 4);
  doc.fontSize(8).fillColor(MUTED).font("Helvetica").text(label, x, y, { width: 108, continued: false });
  doc
    .fontSize(9)
    .fillColor(INK)
    .font("Helvetica-Bold")
    .text(value, x + 110, y, { width: CONTENT_W / 2 - 112 });
  doc.font("Helvetica");
  return y;
}

/** Builds the SRF acknowledgment PDF sent as the WhatsApp template document header. */
export async function buildSrfPdfBuffer(data: SrfPrintData): Promise<Buffer> {
  const barcodePng = await generateBarcodePng(data.reference);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const advance = Number(data.advanceInr) || 0;
    const estimate = Number(data.estimateTotalInr) || 0;
    const balance = Math.max(estimate - advance, 0);
    const brandModel = [data.watchFamily?.trim(), data.watchModel?.trim()].filter(Boolean).join(" ") || data.watchModel;

    // ---- Banner ---------------------------------------------------------
    // Flat fills only (no PDF shading patterns) so the document renders reliably
    // in WhatsApp's in-app preview and third-party mobile PDF viewers.
    const bannerH = 56;
    doc.rect(0, 0, PAGE_W, bannerH).fill(NAVY_DEEP);
    doc.polygon([PAGE_W - 130, 0], [PAGE_W, 0], [PAGE_W, bannerH]).fillOpacity(0.9).fill(GOLD).fillOpacity(1);

    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(16).text("SERVICE ACKNOWLEDGMENT FORM", MARGIN, 17, {
      width: 340,
      characterSpacing: 0.4,
    });
    doc.font("Helvetica").fontSize(8).fillColor("#dbe4fb").text("Customer copy", MARGIN, 38);

    const logo = logoPath();
    if (logo) {
      try {
        doc.roundedRect(PAGE_W - 150, 8, 110, 40, 6).fill("#ffffff");
        doc.image(logo, PAGE_W - 145, 12, { width: 100, height: 32, fit: [100, 32] });
      } catch {
        /* optional logo */
      }
    }

    doc.rect(0, bannerH, PAGE_W, 4).fill(GOLD);

    // ---- Top meta row ----------------------------------------------------
    // rowH must comfortably fit 4 meta lines (label + value each) — see META_LINE_GAP.
    let y = bannerH + 4 + 12;
    const metaPadTop = 10;
    const rowH = metaPadTop + 3 * META_LINE_GAP + 20 + 10;
    const metaW = 240;
    const gap = 8;
    const smallW = (CONTENT_W - metaW - gap * 2) / 2;

    card(doc, MARGIN, y, metaW, rowH, CARD_BG);
    metaLine(doc, MARGIN + 10, y + metaPadTop, "SERVICE ENTRY NO", data.reference, "box");
    metaLine(doc, MARGIN + 10, y + metaPadTop + META_LINE_GAP, "BOOKING DATE", formatDateTime(data.bookingDate), "calendar");
    metaLine(doc, MARGIN + 10, y + metaPadTop + META_LINE_GAP * 2, "CUSTOMER", display(data.customerName), "check");
    if (data.company) {
      metaLine(doc, MARGIN + 10, y + metaPadTop + META_LINE_GAP * 3, "MOBILE / COMPANY", `${display(data.phone)} · ${data.company}`, "pin");
    } else {
      metaLine(doc, MARGIN + 10, y + metaPadTop + META_LINE_GAP * 3, "MOBILE", display(data.phone), "pin");
    }

    const barcodeX = MARGIN + metaW + gap;
    card(doc, barcodeX, y, smallW, rowH, "#ffffff");
    doc.font("Helvetica-Bold").fontSize(7).fillColor(MUTED).text("SERVICE REFERENCE", barcodeX + 6, y + 10, {
      width: smallW - 12,
      align: "center",
    });
    if (barcodePng) {
      doc.image(barcodePng, barcodeX + 10, y + 24, { fit: [smallW - 20, rowH - 60], align: "center", valign: "center" });
    } else {
      doc.font("Courier-Bold").fontSize(9).fillColor(INK).text(data.reference, barcodeX + 6, y + rowH / 2 - 4, {
        width: smallW - 12,
        align: "center",
      });
    }
    doc.font("Courier-Bold").fontSize(8).fillColor(INK).text(data.reference, barcodeX + 6, y + rowH - 22, {
      width: smallW - 12,
      align: "center",
    });

    const logoX = barcodeX + smallW + gap;
    card(doc, logoX, y, smallW, rowH, "#ffffff");
    if (logo) {
      try {
        doc.image(logo, logoX + smallW / 2 - 44, y + rowH / 2 - 18, { width: 88, height: 36, fit: [88, 36] });
      } catch {
        /* optional */
      }
    }

    y += rowH + 12;

    // ---- Booking center ---------------------------------------------------
    y = sectionPill(doc, "Booking center", y, "pin");
    const centerCardH = data.storeAddress ? 54 : 40;
    card(doc, MARGIN, y, CONTENT_W, centerCardH, CARD_BG);
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(INK).text(data.storeDisplayName, MARGIN + 10, y + 8, { continued: true });
    doc.font("Helvetica-Bold").fillColor(GOLD).text(`  ${data.storeTagline}`);
    let cy = y + 22;
    if (data.storeAddress) {
      doc.font("Helvetica").fontSize(8.5).fillColor(INK).text(data.storeAddress.replace(/\n/g, ", "), MARGIN + 10, cy, {
        width: CONTENT_W - 20,
      });
      cy += doc.heightOfString(data.storeAddress.replace(/\n/g, ", "), { width: CONTENT_W - 20 }) + 4;
    }
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor(MUTED)
      .text(`Ph: ${display(data.storePhone)}    Email: ${display(data.storeEmail)}    GSTIN: ${display(data.storeGstin)}`, MARGIN + 10, cy, {
        width: CONTENT_W - 20,
      });
    y += centerCardH + 14;

    // ---- Product information ----------------------------------------------
    y = sectionPill(doc, "Product information", y, "box");
    const prodRows = 4;
    const prodCardH = prodRows * 16 + 14;
    card(doc, MARGIN, y, CONTENT_W, prodCardH, "#ffffff");
    let fy = y + 12;
    fieldRow(doc, "Brand / Model No", display(data.serial), fy, 0);
    fieldRow(doc, "Brand Name", display(data.watchBrand), fy, 1);
    fy += 16;
    fieldRow(doc, "Brand Model", display(brandModel), fy, 0);
    fieldRow(doc, "Case Type", display(data.caseType), fy, 1);
    fy += 16;
    fieldRow(doc, "Nature of Repair", display(data.natureOfRepair), fy, 0);
    fieldRow(doc, "Strap / Chain Type", display(data.strapChainType), fy, 1);
    fy += 16;
    fieldRow(doc, "Back Cover / S.No", display(data.serial), fy, 0);
    fieldRow(doc, "12 Link Chain Count", display(data.chainCount12Phase || data.chainCount), fy, 1);
    fy += 16;
    fieldRow(doc, "6 Link Chain Count", display(data.chainCount6Phase), fy, 0);
    y += prodCardH + 14;

    // ---- Remarks -----------------------------------------------------------
    y = sectionPill(doc, "Remarks", y, "check");
    const remarkW = (CONTENT_W - gap) / 2;
    const remarkH = 56;
    card(doc, MARGIN, y, remarkW, remarkH, CARD_BG);
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(NAVY).text("CUSTOMER REMARKS", MARGIN + 9, y + 7);
    doc.font("Helvetica").fontSize(8.5).fillColor(INK).text(truncate(data.customerRemarks || data.complaint, 150), MARGIN + 9, y + 18, {
      width: remarkW - 18,
      height: remarkH - 26,
      ellipsis: true,
    });
    const remarkX2 = MARGIN + remarkW + gap;
    card(doc, remarkX2, y, remarkW, remarkH, CARD_BG);
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(NAVY).text("COMPLAINT", remarkX2 + 9, y + 7);
    doc.font("Helvetica").fontSize(8.5).fillColor(INK).text(truncate(data.complaint, 150), remarkX2 + 9, y + 18, {
      width: remarkW - 18,
      height: remarkH - 26,
      ellipsis: true,
    });
    y += remarkH + 14;

    // ---- Service information -----------------------------------------------
    y = sectionPill(doc, "Service information", y, "wrench");
    const cardW = (CONTENT_W - gap * 3) / 4;
    const cardH = 46;
    const amountCards: Array<[string, string, "calendar" | "wallet" | "wrench" | "rupee", string, string]> = [
      ["Estd. Delivery", formatDateOnly(data.estimatedFinishDate), "calendar", "#3b82f6", "#1d4ed8"],
      ["Advance Paid (INR)", `INR ${advance.toFixed(2)}`, "wallet", "#22c55e", "#15803d"],
      ["Est. Service Cost (approx.)", `Approx. INR ${estimate.toFixed(2)}`, "wrench", "#f97316", "#c2410c"],
      ["Balance (Excl. Tax)", `INR ${balance.toFixed(2)}`, "rupee", GOLD_LIGHT, GOLD],
    ];
    amountCards.forEach(([label, val, glyph, cFrom, cTo], i) => {
      const x = MARGIN + i * (cardW + gap);
      card(doc, x, y, cardW, cardH, "#ffffff");
      iconBadge(doc, x + 18, y + cardH / 2, 11, cFrom, cTo, glyph);
      doc.font("Helvetica-Bold").fontSize(6.6).fillColor(MUTED).text(label.toUpperCase(), x + 32, y + 12, {
        width: cardW - 40,
      });
      doc.font("Helvetica-Bold").fontSize(10.5).fillColor(NAVY).text(val, x + 32, y + 24, { width: cardW - 40 });
    });
    y += cardH + 10;

    if (advance > 0) {
      const noteH = 20;
      doc.roundedRect(MARGIN, y, CONTENT_W, noteH, 7).fill("#ecfdf3").roundedRect(MARGIN, y, CONTENT_W, noteH, 7).lineWidth(0.75).strokeColor("#bbf0cf").stroke();
      iconBadge(doc, MARGIN + 13, y + noteH / 2, 6, "#22c55e", "#15803d", "check");
      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor("#14532d")
        .text(
          `Advance collected: INR ${advance.toFixed(2)}${data.advancePaymentMode ? ` (${data.advancePaymentMode})` : ""}`,
          MARGIN + 24,
          y + 6,
        );
      y += noteH + 10;
    } else {
      y += 6;
    }

    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED).text(
      "This is your service acknowledgment copy. Track live repair status using the link sent on WhatsApp.",
      MARGIN,
      y,
      { width: CONTENT_W },
    );
    y += 22;

    // ---- Signature footer ---------------------------------------------------
    doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).lineWidth(0.75).strokeColor(BORDER).stroke();
    y += 12;
    const sigW = (CONTENT_W - gap) / 2;
    iconBadge(doc, MARGIN + 6, y + 3, 6, NAVY, NAVY_DEEP, "check");
    doc.font("Helvetica-Bold").fontSize(8).fillColor(NAVY).text("CUSTOMER SIGNATURE", MARGIN + 16, y);
    doc.moveTo(MARGIN, y + 28).lineTo(MARGIN + sigW, y + 28).lineWidth(0.75).strokeColor("#c7d2e8").stroke();

    const sigX2 = MARGIN + sigW + gap;
    iconBadge(doc, sigX2 + 6, y + 3, 6, NAVY, NAVY_DEEP, "check");
    doc.font("Helvetica-Bold").fontSize(8).fillColor(NAVY).text("STORE REPRESENTATIVE", sigX2 + 16, y);
    doc.moveTo(sigX2, y + 28).lineTo(sigX2 + sigW, y + 28).lineWidth(0.75).strokeColor("#c7d2e8").stroke();

    doc.font("Helvetica").fontSize(8).fillColor(MUTED).text("ZIMSON WATCHES", MARGIN, 800, { width: CONTENT_W, align: "center" });

    doc.end();
  });
}
