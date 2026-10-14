import { localDayString } from "./reportDateRange";

export type ReportSheet = {
  name: string;
  columns: string[];
  rows: Record<string, unknown>[];
};

export type ReportExportMeta = {
  title: string;
  /** File name without date / extension, e.g. "aging_report". */
  fileBase: string;
  /** Lines printed under the title (period, filters). */
  subtitle?: string[];
};

export type ReportExportFormat = "excel" | "csv" | "pdf";

function fileName(meta: ReportExportMeta, ext: string): string {
  const base = meta.fileBase.replace(/[^a-z0-9_-]+/gi, "_").replace(/_+/g, "_") || "report";
  return `${base}_${localDayString(new Date())}.${ext}`;
}

function textValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  if (value instanceof Date) return value.toLocaleString();
  return String(value);
}

function excelValue(value: unknown): string | number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return textValue(value);
}

function triggerDownload(blob: Blob, name: string): void {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export function exportReportCsv(meta: ReportExportMeta, sheets: ReportSheet[]): void {
  const esc = (v: unknown) => `"${textValue(v).replace(/"/g, '""')}"`;
  const blocks = sheets.map((sheet) => {
    const lines = [
      sheet.columns.map(esc).join(","),
      ...sheet.rows.map((row) => sheet.columns.map((c) => esc(row[c])).join(",")),
    ];
    return sheets.length > 1 ? [esc(sheet.name), ...lines].join("\r\n") : lines.join("\r\n");
  });
  const blob = new Blob([`\uFEFF${blocks.join("\r\n\r\n")}`], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, fileName(meta, "csv"));
}

function safeSheetName(name: string, used: Set<string>): string {
  const base = (name.replace(/[[\]:*?/\\]/g, " ").trim() || "Sheet").slice(0, 31);
  let candidate = base;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${n++})`;
    candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

export async function exportReportExcel(meta: ReportExportMeta, sheets: ReportSheet[]): Promise<void> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  for (const sheet of sheets) {
    const header: (string | number)[][] = [[meta.title], ...(meta.subtitle ?? []).map((s) => [s]), []];
    const aoa: (string | number)[][] = [
      ...header,
      sheet.columns,
      ...sheet.rows.map((row) => sheet.columns.map((c) => excelValue(row[c]))),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = sheet.columns.map((c) => {
      let w = c.length;
      for (const row of sheet.rows.slice(0, 500)) w = Math.max(w, textValue(row[c]).length);
      return { wch: Math.min(Math.max(w + 2, 8), 50) };
    });
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(sheet.name, used));
  }
  XLSX.writeFile(wb, fileName(meta, "xlsx"));
}

const PDF_CHAR_MAP: Record<string, string> = {
  "₹": "Rs.",
  "—": "-",
  "–": "-",
  "→": "->",
  "←": "<-",
  "✓": "Y",
  "✕": "x",
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
  "…": "...",
};

function pdfText(value: unknown): string {
  return textValue(value)
    .replace(/[^\x00-\xFF]/g, (ch) => PDF_CHAR_MAP[ch] ?? "?")
    .replace(/\s+/g, " ")
    .trim();
}

export async function exportReportPdf(meta: ReportExportMeta, sheets: ReportSheet[]): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 28;
  const usableW = pageW - margin * 2;
  const bottom = pageH - margin - 14;
  const brand: [number, number, number] = [27, 58, 143];
  const gold: [number, number, number] = [201, 162, 39];

  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...brand);
  doc.text(pdfText(meta.title), margin, y + 12);
  y += 20;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  for (const line of [...(meta.subtitle ?? []), `Generated: ${new Date().toLocaleString()}`]) {
    doc.text(pdfText(line), margin, y + 9);
    y += 12;
  }
  doc.setDrawColor(...gold);
  doc.setLineWidth(1.2);
  doc.line(margin, y + 4, pageW - margin, y + 4);
  y += 14;

  for (const [sheetIdx, sheet] of sheets.entries()) {
    const cols = sheet.columns;
    const fontSize = cols.length > 12 ? 6.5 : cols.length > 8 ? 7.5 : 8.5;
    const lineH = fontSize * 1.25;
    const padX = 3;
    const padY = 3;

    doc.setFontSize(fontSize);
    const natural = cols.map((c) => {
      doc.setFont("helvetica", "bold");
      let w = doc.getTextWidth(pdfText(c));
      doc.setFont("helvetica", "normal");
      for (const row of sheet.rows.slice(0, 300)) w = Math.max(w, doc.getTextWidth(pdfText(row[c])));
      return Math.min(Math.max(w + padX * 2, 34), 200);
    });
    const total = natural.reduce((s, w) => s + w, 0);
    const widths = natural.map((w) => (w / total) * usableW);

    const drawHeader = () => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(fontSize);
      const headLines = cols.map((c, i) => doc.splitTextToSize(pdfText(c), widths[i]! - padX * 2) as string[]);
      const h = Math.max(...headLines.map((l) => l.length)) * lineH + padY * 2;
      doc.setFillColor(...brand);
      doc.rect(margin, y, usableW, h, "F");
      doc.setTextColor(255, 255, 255);
      let x = margin;
      headLines.forEach((lines, i) => {
        doc.text(lines, x + padX, y + padY + fontSize);
        x += widths[i]!;
      });
      y += h;
      doc.setFont("helvetica", "normal");
    };

    if (sheets.length > 1) {
      if (sheetIdx > 0 && y > bottom - 60) {
        doc.addPage();
        y = margin;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...brand);
      doc.text(`${pdfText(sheet.name)} (${sheet.rows.length})`, margin, y + 10);
      y += 16;
    }

    drawHeader();

    if (sheet.rows.length === 0) {
      doc.setFontSize(fontSize + 1);
      doc.setTextColor(120, 120, 120);
      doc.text("No rows.", margin + padX, y + 14);
      y += 24;
      continue;
    }

    sheet.rows.forEach((row, rowIdx) => {
      doc.setFontSize(fontSize);
      const cellLines = cols.map((c, i) => {
        const lines = doc.splitTextToSize(pdfText(row[c]), widths[i]! - padX * 2) as string[];
        return lines.length > 3 ? [...lines.slice(0, 2), `${lines[2]!.slice(0, -3)}...`] : lines;
      });
      const h = Math.max(1, ...cellLines.map((l) => l.length)) * lineH + padY * 2;
      if (y + h > bottom) {
        doc.addPage();
        y = margin;
        drawHeader();
        doc.setFontSize(fontSize);
      }
      if (rowIdx % 2 === 1) {
        doc.setFillColor(243, 245, 250);
        doc.rect(margin, y, usableW, h, "F");
      }
      doc.setTextColor(40, 40, 40);
      let x = margin;
      cellLines.forEach((lines, i) => {
        doc.text(lines, x + padX, y + padY + fontSize);
        x += widths[i]!;
      });
      doc.setDrawColor(225, 225, 225);
      doc.setLineWidth(0.4);
      doc.line(margin, y + h, margin + usableW, y + h);
      y += h;
    });
    y += 16;
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(130, 130, 130);
    doc.text(pdfText(meta.title), margin, pageH - margin + 6);
    doc.text(`Page ${p} of ${pages}`, pageW - margin, pageH - margin + 6, { align: "right" });
  }

  doc.save(fileName(meta, "pdf"));
}

export async function exportReport(
  format: ReportExportFormat,
  meta: ReportExportMeta,
  sheets: ReportSheet[],
): Promise<void> {
  if (format === "csv") exportReportCsv(meta, sheets);
  else if (format === "excel") await exportReportExcel(meta, sheets);
  else await exportReportPdf(meta, sheets);
}
