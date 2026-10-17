import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import bwipjs from "bwip-js/node";
import type { SrfPrintData } from "./loadSrfPrintData";

type PdfDoc = InstanceType<typeof PDFDocument>;

const NAVY = "#1b3a8f";
const NAVY_DEEP = "#0c1c56";
const GOLD = "#C9A227";
const GOLD_LIGHT = "#E8C14E";
const INK = "#0d1b2a";
const MUTED = "#64748b";
const BORDER = "#e2e8f5";
const DIVIDER = "#e6ebf5";
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;
/** Small inset so content lines up just inside the section headers. */
const PAD = 4;
const GAP = 10;
const SECTION_GAP = 12;

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
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
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
  _colorFrom: string,
  colorTo: string,
  glyph: "calendar" | "wallet" | "wrench" | "rupee" | "check" | "pin" | "box",
): void {
  doc.save();
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
  doc.restore();
  doc.font("Helvetica");
}

/** Navy section header pill with a gold icon, followed by a thin rule to the right margin. */
function sectionPill(doc: PdfDoc, title: string, y: number, glyph: "box" | "wrench" | "check" | "pin" = "box"): number {
  doc.font("Helvetica-Bold").fontSize(9);
  const label = title.toUpperCase();
  const textW = doc.widthOfString(label, { characterSpacing: 0.6 });
  const pillH = 20;
  const pillW = textW + 40;
  doc.roundedRect(MARGIN, y, pillW, pillH, pillH / 2).fill(NAVY);
  iconBadge(doc, MARGIN + 12, y + pillH / 2, 6.5, GOLD_LIGHT, GOLD, glyph);
  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(label, MARGIN + 25, y + (pillH - 9) / 2 + 0.5, { characterSpacing: 0.6, lineBreak: false });
  doc
    .moveTo(MARGIN + pillW + 8, y + pillH / 2)
    .lineTo(PAGE_W - MARGIN, y + pillH / 2)
    .lineWidth(0.75)
    .strokeColor(BORDER)
    .stroke();
  doc.font("Helvetica");
  return y + pillH + 8;
}

const META_LABEL_SIZE = 7;
const META_VALUE_SIZE = 9.5;
const META_LINE_GAP = 23;

function metaLine(
  doc: PdfDoc,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string,
  glyph: "calendar" | "check" | "pin" | "box",
): void {
  iconBadge(doc, x + 7, y + 8, 7, NAVY, NAVY_DEEP, glyph);
  doc
    .font("Helvetica-Bold")
    .fontSize(META_LABEL_SIZE)
    .fillColor(MUTED)
    .text(label, x + 20, y, { width: width - 20, characterSpacing: 0.4, lineBreak: false });
  doc
    .font("Helvetica-Bold")
    .fontSize(META_VALUE_SIZE)
    .fillColor(INK)
    .text(truncate(value, 46), x + 20, y + 9.5, { width: width - 20, lineBreak: false, ellipsis: true });
}

type FieldPair = [string, string];

/** Two-column label/value grid sized to its content; returns the card height used. */
function fieldGrid(doc: PdfDoc, y: number, rows: Array<[FieldPair, FieldPair | null]>): number {
  const colGap = 18;
  const colW = (CONTENT_W - PAD * 2 - colGap) / 2;
  const labelW = 96;
  const valueW = colW - labelW - 6;
  const rowPadY = 5;

  const measure = (pair: FieldPair | null): number => {
    if (!pair) return 0;
    doc.font("Helvetica").fontSize(8);
    const lh = doc.heightOfString(pair[0], { width: labelW });
    doc.font("Helvetica-Bold").fontSize(9);
    const vh = doc.heightOfString(pair[1], { width: valueW });
    return Math.max(lh, vh);
  };
  const heights = rows.map(([l, r]) => Math.max(measure(l), measure(r), 10) + rowPadY * 2);
  const cardH = heights.reduce((a, b) => a + b, 0);

  let ry = y;
  rows.forEach(([left, right], i) => {
    const h = heights[i]!;
    const draw = (pair: FieldPair | null, colX: number) => {
      if (!pair) return;
      doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(pair[0], colX, ry + rowPadY + 0.5, { width: labelW });
      doc.font("Helvetica-Bold").fontSize(9).fillColor(INK).text(pair[1], colX + labelW + 6, ry + rowPadY, { width: valueW });
    };
    draw(left, MARGIN + PAD);
    draw(right, MARGIN + PAD + colW + colGap);
    if (i < rows.length - 1) {
      doc
        .moveTo(MARGIN + PAD, ry + h)
        .lineTo(PAGE_W - MARGIN - PAD, ry + h)
        .lineWidth(0.5)
        .strokeColor(DIVIDER)
        .stroke();
    }
    ry += h;
  });
  doc.font("Helvetica");
  return cardH;
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
    const logo = logoPath();

    // ---- Banner ---------------------------------------------------------
    // Flat fills only (no PDF shading patterns) so the document renders reliably
    // in WhatsApp's in-app preview and third-party mobile PDF viewers.
    const bannerH = 60;
    doc.rect(0, 0, PAGE_W, bannerH).fill(NAVY_DEEP);
    doc.polygon([PAGE_W - 150, 0], [PAGE_W, 0], [PAGE_W, bannerH], [PAGE_W - 95, bannerH]).fill(NAVY);
    doc.rect(0, bannerH, PAGE_W, 3.5).fill(GOLD);

    doc
      .fillColor("#ffffff")
      .font("Helvetica-Bold")
      .fontSize(16)
      .text("SERVICE ACKNOWLEDGMENT FORM", MARGIN, (bannerH - 16) / 2 + 1, {
        width: CONTENT_W - 140,
        characterSpacing: 0.5,
        lineBreak: false,
      });

    const logoBoxW = 118;
    const logoBoxH = 40;
    const logoBoxX = PAGE_W - MARGIN - logoBoxW;
    const logoBoxY = (bannerH - logoBoxH) / 2;
    doc.roundedRect(logoBoxX, logoBoxY, logoBoxW, logoBoxH, 6).fill("#ffffff");
    if (logo) {
      try {
        doc.image(logo, logoBoxX + 8, logoBoxY + 5, { fit: [logoBoxW - 16, logoBoxH - 10], align: "center", valign: "center" });
      } catch {
        /* optional logo */
      }
    } else {
      doc.font("Helvetica-Bold").fontSize(11).fillColor(NAVY_DEEP).text("ZIMSON", logoBoxX, logoBoxY + 14, {
        width: logoBoxW,
        align: "center",
      });
    }

    // ---- Top meta row ----------------------------------------------------
    let y = bannerH + 3.5 + 14;
    const metaRows: Array<[string, string, "calendar" | "check" | "pin" | "box"]> = [
      ["SERVICE NO.", data.reference, "box"],
      ["BOOKING DATE & TIME", formatDateTime(data.bookingDate), "calendar"],
      ["CUSTOMER", display(data.customerName), "check"],
      [data.company ? "MOBILE / COMPANY" : "MOBILE", data.company ? `${display(data.phone)} · ${data.company}` : display(data.phone), "pin"],
    ];
    const rowH = PAD * 2 + (metaRows.length - 1) * META_LINE_GAP + 20;
    const metaW = 300;
    const barcodeW = CONTENT_W - metaW - GAP;

    metaRows.forEach(([label, value, glyph], i) => {
      metaLine(doc, MARGIN + PAD, y + PAD + i * META_LINE_GAP, metaW - PAD * 2, label, value, glyph);
    });

    const barcodeX = MARGIN + metaW + GAP;
    doc
      .font("Helvetica-Bold")
      .fontSize(7)
      .fillColor(MUTED)
      .text("SERVICE REFERENCE", barcodeX, y + PAD, { width: barcodeW, align: "center", characterSpacing: 0.4 });
    const codeTop = y + PAD + 14;
    const codeH = rowH - PAD * 2 - 14 - 18;
    if (barcodePng) {
      doc.image(barcodePng, barcodeX + PAD, codeTop, {
        fit: [barcodeW - PAD * 2, codeH],
        align: "center",
        valign: "center",
      });
    }
    doc
      .font("Courier-Bold")
      .fontSize(10)
      .fillColor(INK)
      .text(data.reference, barcodeX, y + rowH - PAD - 10, { width: barcodeW, align: "center", lineBreak: false });

    y += rowH + SECTION_GAP;

    // ---- Booking center ---------------------------------------------------
    y = sectionPill(doc, "Booking center", y, "pin");
    const centerInnerW = CONTENT_W - PAD * 2;
    const addressText = data.storeAddress ? data.storeAddress.replace(/[\s,]*\n\s*/g, ", ") : "";
    const contactText = `Ph: ${display(data.storePhone)}     Email: ${display(data.storeEmail)}     GSTIN: ${display(data.storeGstin)}`;
    doc.font("Helvetica").fontSize(8.5);
    const addrH = addressText ? doc.heightOfString(addressText, { width: centerInnerW }) : 0;
    const contactH = doc.heightOfString(contactText, { width: centerInnerW });
    const centerCardH = PAD + 12 + (addrH ? addrH + 4 : 0) + 4 + contactH + PAD;
    let cy = y + PAD;
    doc.font("Helvetica-Bold").fontSize(10).fillColor(INK).text(display(data.storeDisplayName), MARGIN + PAD, cy, {
      continued: Boolean(data.storeTagline),
      lineBreak: false,
    });
    if (data.storeTagline) {
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor(GOLD).text(`   ${data.storeTagline}`, { lineBreak: false });
    }
    cy += 16;
    if (addressText) {
      doc.font("Helvetica").fontSize(8.5).fillColor(INK).text(addressText, MARGIN + PAD, cy, { width: centerInnerW });
      cy += addrH + 4;
    }
    doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(contactText, MARGIN + PAD, cy, { width: centerInnerW });
    y += centerCardH + SECTION_GAP;

    // ---- Product information ----------------------------------------------
    y = sectionPill(doc, "Product information", y, "box");
    const prodH = fieldGrid(doc, y, [
      [["Brand Name", display(data.watchBrand)], ["Brand / Model No", display(data.serial)]],
      [["Brand Model", display(brandModel)], ["Case Type", display(data.caseType)]],
      [["Nature of Repair", display(data.natureOfRepair)], ["Strap / Chain Type", display(data.strapChainType)]],
      [["Back Cover / S.No", display(data.serial)], ["12 Link Chain Count", display(data.chainCount12Phase || data.chainCount)]],
      [["6 Link Chain Count", display(data.chainCount6Phase)], null],
    ]);
    y += prodH + SECTION_GAP;

    // ---- Remarks -----------------------------------------------------------
    y = sectionPill(doc, "Remarks", y, "check");
    const remarkW = (CONTENT_W - GAP) / 2;
    const remarkInnerW = remarkW - PAD * 2;
    const customerRemark = truncate(data.customerRemarks || data.complaint || "", 220);
    const complaint = truncate(data.complaint || "", 220);
    doc.font("Helvetica").fontSize(8.5);
    const remarkTextH = Math.min(
      60,
      Math.max(
        doc.heightOfString(customerRemark, { width: remarkInnerW }),
        doc.heightOfString(complaint, { width: remarkInnerW }),
        11,
      ),
    );
    const remarkH = PAD + 12 + remarkTextH + PAD;
    const drawRemark = (x: number, title: string, text: string) => {
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor(NAVY).text(title, x + PAD, y + PAD, { characterSpacing: 0.4 });
      doc.font("Helvetica").fontSize(8.5).fillColor(INK).text(text, x + PAD, y + PAD + 12, {
        width: remarkInnerW,
        height: remarkTextH + 1,
        ellipsis: true,
      });
    };
    drawRemark(MARGIN, "CUSTOMER REMARKS", customerRemark);
    drawRemark(MARGIN + remarkW + GAP, "COMPLAINT", complaint);
    y += remarkH + SECTION_GAP;

    // ---- Service information -----------------------------------------------
    y = sectionPill(doc, "Service information", y, "wrench");
    const cardW = (CONTENT_W - GAP * 3) / 4;
    const cardH = 52;
    const amountCards: Array<[string, string, "calendar" | "wallet" | "wrench" | "rupee", string]> = [
      ["Estd. Delivery", formatDateOnly(data.estimatedFinishDate), "calendar", "#a8850f"],
      ["Advance Paid", `INR ${advance.toFixed(2)}`, "wallet", "#15803d"],
      ["Est. Cost (Approx.)", `INR ${estimate.toFixed(2)}`, "wrench", "#c2410c"],
      ["Balance (Excl. Tax)", `INR ${balance.toFixed(2)}`, "rupee", GOLD],
    ];
    amountCards.forEach(([label, val, glyph, color], i) => {
      const x = MARGIN + i * (cardW + GAP);
      const textX = x + 36;
      const textW = cardW - 36 - 8;
      iconBadge(doc, x + 19, y + cardH / 2, 11, color, color, glyph);
      const lbl = label.toUpperCase();
      doc.font("Helvetica-Bold").fontSize(6.6);
      const lblH = doc.heightOfString(lbl, { width: textW });
      doc.font("Helvetica-Bold").fontSize(10);
      const valH = doc.heightOfString(val, { width: textW });
      const top = y + Math.max(4, (cardH - (lblH + 3 + valH)) / 2);
      doc.font("Helvetica-Bold").fontSize(6.6).fillColor(MUTED).text(lbl, textX, top, { width: textW });
      doc.font("Helvetica-Bold").fontSize(10).fillColor(NAVY).text(val, textX, top + lblH + 3, { width: textW });
    });
    y += cardH + GAP;

    if (advance > 0) {
      const noteH = 18;
      iconBadge(doc, MARGIN + PAD + 2, y + noteH / 2, 6, "#22c55e", "#15803d", "check");
      doc
        .font("Helvetica-Bold")
        .fontSize(8.5)
        .fillColor("#14532d")
        .text(
          `Advance collected: INR ${advance.toFixed(2)}${data.advancePaymentMode ? ` (${data.advancePaymentMode})` : ""}`,
          MARGIN + PAD + 14,
          y + (noteH - 8.5) / 2 + 0.5,
          { width: CONTENT_W - PAD * 2 - 14, lineBreak: false },
        );
      y += noteH + GAP;
    }

    // ---- Tracking note ------------------------------------------------------
    const trackH = 16;
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(MUTED)
      .text(
        "This is your service acknowledgment. Track live repair status using the link sent on WhatsApp.",
        MARGIN + PAD,
        y + (trackH - 8) / 2 + 0.5,
        { width: CONTENT_W - PAD * 2, lineBreak: false, ellipsis: true },
      );
    y += trackH + 26;

    // ---- Signatures ---------------------------------------------------------
    const sigW = (CONTENT_W - 40) / 2;
    const sigLineY = Math.min(y + 18, PAGE_H - 70);
    const drawSig = (x: number, title: string) => {
      doc.moveTo(x, sigLineY).lineTo(x + sigW, sigLineY).lineWidth(0.75).strokeColor("#b8c4de").stroke();
      doc.font("Helvetica-Bold").fontSize(8).fillColor(NAVY).text(title, x, sigLineY + 6, {
        width: sigW,
        align: "center",
        characterSpacing: 0.4,
      });
    };
    drawSig(MARGIN, "CUSTOMER SIGNATURE");
    drawSig(MARGIN + sigW + 40, "STORE REPRESENTATIVE");

    // ---- Footer -------------------------------------------------------------
    const footerY = PAGE_H - 30;
    doc.rect(0, footerY, PAGE_W, 30).fill(NAVY_DEEP);
    doc.rect(0, footerY, PAGE_W, 2).fill(GOLD);
    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .fillColor("#ffffff")
      .text("ZIMSON WATCHES", MARGIN, footerY + 11, { width: CONTENT_W / 2, lineBreak: false, characterSpacing: 0.6 });
    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor("#c7d2f0")
      .text(`Computer generated · ${data.reference}`, MARGIN + CONTENT_W / 2, footerY + 11.5, {
        width: CONTENT_W / 2,
        align: "right",
        lineBreak: false,
      });

    doc.end();
  });
}
