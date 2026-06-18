import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import type { SrfPrintData } from "./loadSrfPrintData";

type PdfDoc = InstanceType<typeof PDFDocument>;

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

function fieldRow(doc: PdfDoc, label: string, value: string, y: number, col = 0): number {
  const x = 40 + col * 270;
  doc.fontSize(8).fillColor("#4a5568").text(label, x, y, { width: 110, continued: false });
  doc.fontSize(9).fillColor("#0d1b2a").font("Helvetica-Bold").text(value, x + 112, y, { width: 150 });
  doc.font("Helvetica");
  return y;
}

function sectionTitle(doc: PdfDoc, title: string, y: number): number {
  doc
    .rect(40, y, 515, 18)
    .fill("#e8edf8")
    .strokeColor("#1b3a8f")
    .lineWidth(1)
    .stroke();
  doc.fontSize(9).fillColor("#1b3a8f").font("Helvetica-Bold").text(title.toUpperCase(), 48, y + 5);
  doc.font("Helvetica");
  return y + 24;
}

/** Builds the SRF acknowledgment PDF sent as the WhatsApp template document header. */
export function buildSrfPdfBuffer(data: SrfPrintData): Promise<Buffer> {
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

    doc.rect(0, 0, 595, 52).fill("#1b3a8f");
    doc.fontSize(16).fillColor("#ffffff").font("Helvetica-Bold").text("SERVICE ACKNOWLEDGMENT FORM", 40, 16, {
      width: 380,
    });
    doc.fontSize(8).font("Helvetica").text("Customer copy", 40, 36);
    const logo = logoPath();
    if (logo) {
      try {
        doc.image(logo, 455, 8, { width: 110, height: 36, fit: [110, 36] });
      } catch {
        /* optional logo */
      }
    }

    doc.rect(0, 52, 595, 4).fill("#c9a227");

    let y = 68;
    doc.fontSize(9).fillColor("#0d1b2a");
    doc.font("Helvetica-Bold").text(`Service Entry No: ${data.reference}`, 40, y);
    doc.font("Helvetica").text(`Booking Date: ${formatDateTime(data.bookingDate)}`, 300, y);
    y += 14;
    doc.text(`Customer: ${data.customerName}`, 40, y);
    doc.text(`Mobile: ${data.phone}`, 300, y);
    y += 14;
    if (data.company) {
      doc.text(`Company: ${data.company}`, 40, y);
      y += 14;
    }

    y = sectionTitle(doc, "Booking center", y);
    doc.fontSize(9).fillColor("#0d1b2a").font("Helvetica-Bold").text(data.storeDisplayName, 40, y);
    doc.font("Helvetica").fillColor("#c9a227").text(` ${data.storeTagline}`, { continued: false });
    y += 12;
    if (data.storeAddress) {
      doc.fillColor("#0d1b2a").text(data.storeAddress.replace(/\n/g, ", "), 40, y, { width: 515 });
      y += doc.heightOfString(data.storeAddress, { width: 515 }) + 4;
    }
    doc.text(`Ph: ${display(data.storePhone)}   Email: ${display(data.storeEmail)}   GSTIN: ${display(data.storeGstin)}`, 40, y, {
      width: 515,
    });
    y += 20;

    y = sectionTitle(doc, "Product information", y);
    fieldRow(doc, "Brand / Model No", display(data.serial), y, 0);
    fieldRow(doc, "Brand Name", display(data.watchBrand), y, 1);
    y += 14;
    fieldRow(doc, "Brand Model", display(brandModel), y, 0);
    fieldRow(doc, "Case Type", display(data.caseType), y, 1);
    y += 14;
    fieldRow(doc, "Nature of Repair", display(data.natureOfRepair), y, 0);
    fieldRow(doc, "Strap / Chain", display(data.strapChainType), y, 1);
    y += 14;
    fieldRow(doc, "Back Cover / S.No", display(data.serial), y, 0);
    fieldRow(doc, "Chain Count", display(data.chainCount), y, 1);
    y += 18;

    y = sectionTitle(doc, "Remarks", y);
    doc.fontSize(8).fillColor("#4a5568").text("Customer Remarks", 40, y);
    doc.fontSize(9).fillColor("#0d1b2a").text(display(data.customerRemarks || data.complaint), 40, y + 10, { width: 250 });
    doc.fontSize(8).fillColor("#4a5568").text("Complaint", 305, y);
    doc.fontSize(9).fillColor("#0d1b2a").text(display(data.complaint), 305, y + 10, { width: 250 });
    y += 42;

    y = sectionTitle(doc, "Service information", y);
    const cardW = 120;
    const cards = [
      ["Estd. Delivery", formatDateOnly(data.estimatedFinishDate)],
      ["Advance Paid (INR)", advance.toFixed(2)],
      ["Est. Service Cost", estimate.toFixed(2)],
      ["Balance (Excl. Tax)", balance.toFixed(2)],
    ];
    cards.forEach(([label, val], i) => {
      const x = 40 + i * (cardW + 8);
      doc.rect(x, y, cardW, 36).strokeColor("#1b3a8f").lineWidth(1).stroke();
      doc.fontSize(7).fillColor("#4a5568").text(label, x + 6, y + 6, { width: cardW - 12, align: "center" });
      doc.fontSize(10).fillColor("#1b3a8f").font("Helvetica-Bold").text(val, x + 6, y + 18, { width: cardW - 12, align: "center" });
      doc.font("Helvetica");
    });
    y += 48;

    if (advance > 0) {
      doc.fontSize(8).fillColor("#4a5568").text(
        `Advance collected: INR ${advance.toFixed(2)}${data.advancePaymentMode ? ` (${data.advancePaymentMode})` : ""}`,
        40,
        y,
      );
      y += 14;
    }

    doc.fontSize(7).fillColor("#4a5568").text(
      "This is your service acknowledgment copy. Track live repair status using the link sent on WhatsApp.",
      40,
      y,
      { width: 515 },
    );
    y += 24;

    doc.moveTo(40, y).lineTo(555, y).strokeColor("#1b3a8f").stroke();
    y += 10;
    doc.fontSize(8).fillColor("#1b3a8f").font("Helvetica-Bold").text("Customer signature", 40, y);
    doc.moveTo(40, y + 28).lineTo(250, y + 28).stroke();
    doc.text("Store representative", 305, y);
    doc.moveTo(305, y + 28).lineTo(515, y + 28).stroke();
    doc.font("Helvetica");

    doc.fontSize(8).fillColor("#4a5568").text("ZIMSON WATCHES", 40, 780, { width: 515, align: "center" });

    doc.end();
  });
}
