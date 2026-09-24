import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import type { SrfPaymentReceiptView } from "../../src/types/srfPaymentReceipt";
import { inrAmountToWords } from "../../src/lib/inrAmountToWords";

const NAVY = "#1b3a8f";
const GOLD = "#C9A227";
const INK = "#0d1b2a";
const MUTED = "#64748b";
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 42;
const CONTENT_W = PAGE_W - MARGIN * 2;

function display(v?: string | null): string {
  const t = String(v ?? "").trim();
  return t || "—";
}

function fmtMoney(n: number): string {
  return `INR ${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function logoPath(): string | null {
  const p = path.join(process.cwd(), "public", "zimson-logo.png");
  return fs.existsSync(p) ? p : null;
}

export async function renderSrfPaymentReceiptPdf(data: SrfPaymentReceiptView): Promise<Buffer> {
  const title = data.kind === "booking_advance" ? "ADVANCE RECEIPT" : "PAYMENT RECEIPT";
  const words = data.amountInWords || inrAmountToWords(data.amountInr);
  const logo = logoPath();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGIN, info: { Title: `${title} ${data.receiptNo}` } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.rect(0, 0, PAGE_W, 72).fill(NAVY);
    if (logo) {
      try {
        doc.image(logo, MARGIN, 18, { height: 36, fit: [120, 36] });
      } catch {
        /* optional */
      }
    }
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(11).text("ZIMSON WATCH CARE", MARGIN + 130, 22, {
      width: CONTENT_W - 130,
    });
    doc.font("Helvetica").fontSize(8).fillColor(GOLD).text("Service payment acknowledgement", MARGIN + 130, 40, {
      width: CONTENT_W - 130,
    });

    let y = 96;
    doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(18).text(title, MARGIN, y, { width: CONTENT_W, align: "center" });
    y += 28;
    doc.fillColor(MUTED).font("Helvetica").fontSize(10).text(`Receipt no. ${data.receiptNo}`, MARGIN, y, {
      width: CONTENT_W,
      align: "center",
    });
    y += 16;
    doc.text(fmtDate(data.collectedAt), MARGIN, y, { width: CONTENT_W, align: "center" });
    y += 18;
    doc.rect(MARGIN, y, CONTENT_W, 3).fill(GOLD);
    y += 18;

    doc.fillColor(INK).font("Helvetica-Bold").fontSize(11).text(display(data.storeName), MARGIN, y);
    y += 14;
    if (data.storeAddress) {
      doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(data.storeAddress, MARGIN, y, { width: CONTENT_W });
      y += doc.heightOfString(data.storeAddress, { width: CONTENT_W }) + 6;
    }
    const storeLine = [data.storePhone ? `Ph: ${data.storePhone}` : "", data.storeGstin ? `GSTIN: ${data.storeGstin}` : ""]
      .filter(Boolean)
      .join("    ");
    if (storeLine) {
      doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(storeLine, MARGIN, y, { width: CONTENT_W });
      y += 16;
    }

    const row = (label: string, value: string) => {
      doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(label.toUpperCase(), MARGIN, y, { width: 140 });
      doc.font("Helvetica-Bold").fontSize(10).fillColor(INK).text(value, MARGIN + 150, y - 1, { width: CONTENT_W - 150 });
      y += 18;
    };
    row("Received from", display(data.customerName));
    row("Mobile", display(data.phone));
    row("SRF no.", display(data.srfReference));
    row("Watch", display([data.watchBrand, data.watchModel, data.serial].filter(Boolean).join(" · ")));
    row("Mode", display(data.paymentSummary || data.paymentMode));
    row("Collected by", display(data.collectedByName));

    y += 8;
    doc.rect(MARGIN, y, CONTENT_W, 78).fill("#f7f5ee").strokeColor(NAVY).lineWidth(1).stroke();
    doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(9).text("AMOUNT RECEIVED", MARGIN + 14, y + 12);
    doc.fontSize(20).text(fmtMoney(data.amountInr), MARGIN + 14, y + 28);
    doc.font("Helvetica-Oblique").fontSize(9).fillColor(INK).text(words, MARGIN + 14, y + 54, { width: CONTENT_W - 28 });
    y += 92;

    if (data.note) {
      doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(data.note, MARGIN, y, { width: CONTENT_W });
      y += doc.heightOfString(data.note, { width: CONTENT_W }) + 10;
    }

    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(INK)
      .text(`Total received on this SRF: ${fmtMoney(data.totalPaidInr)}`, MARGIN, y, { width: CONTENT_W });
    y += 14;
    if (data.estimateTotalInr > 0) {
      doc.fillColor(MUTED).text(`Estimate: ${fmtMoney(data.estimateTotalInr)}`, MARGIN, y, { width: CONTENT_W });
      y += 18;
    }

    y = Math.max(y + 36, PAGE_H - 140);
    doc
      .moveTo(PAGE_W - MARGIN - 180, y)
      .lineTo(PAGE_W - MARGIN, y)
      .strokeColor(INK)
      .lineWidth(0.8)
      .stroke();
    doc.font("Helvetica").fontSize(9).fillColor(INK).text("Authorised signatory", PAGE_W - MARGIN - 180, y + 6, {
      width: 180,
      align: "center",
    });

    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(MUTED)
      .text(
        "This is an acknowledgement of payment received against the service request. It is not a tax invoice. GST invoice is issued at billing.",
        MARGIN,
        PAGE_H - 56,
        { width: CONTENT_W, align: "center" },
      );

    doc.end();
  });
}
