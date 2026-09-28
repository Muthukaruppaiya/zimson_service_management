import ExcelJS from "exceljs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(
  __dirname,
  "..",
  "Zimson_Pilot_Client_Data_to_Prepare.xlsx",
);

const C = {
  darkGreen: "1A3D2B",
  gold: "C9A84C",
  headerFg: "FFFFFF",
  fill: "FFF8DC",
  alt: "F7F9F6",
  border: "C5CAC3",
  must: "C62828",
  optional: "1565C0",
  note: "5D4037",
  white: "FFFFFF",
};

const thin = {
  style: "thin",
  color: { argb: `FF${C.border}` },
};

function applyFill(cell) {
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: `FF${C.fill}` },
  };
}

function styleHeader(row, colCount) {
  row.height = 22;
  row.font = { name: "Calibri", size: 11, bold: true, color: { argb: `FF${C.headerFg}` } };
  row.alignment = { vertical: "middle", wrapText: true };
  for (let i = 1; i <= colCount; i++) {
    const cell = row.getCell(i);
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${C.darkGreen}` },
    };
    cell.border = { top: thin, left: thin, bottom: thin, right: thin };
  }
}

function addTitle(ws, title, subtitle) {
  ws.mergeCells("A1:H1");
  const t = ws.getCell("A1");
  t.value = title;
  t.font = { name: "Calibri", size: 16, bold: true, color: { argb: `FF${C.darkGreen}` } };
  t.alignment = { vertical: "middle" };
  ws.getRow(1).height = 26;

  ws.mergeCells("A2:H2");
  const s = ws.getCell("A2");
  s.value = subtitle;
  s.font = { name: "Calibri", size: 10, italic: true, color: { argb: "FF5D5D5D" } };
  s.alignment = { wrapText: true, vertical: "top" };
  ws.getRow(2).height = 36;

  ws.views = [{ state: "frozen", ySplit: 4, showGridLines: false }];
  ws.pageSetup = {
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: "1:4",
  };
}

function blankFillRows(ws, startRow, count, colCount) {
  for (let r = 0; r < count; r++) {
    const row = ws.getRow(startRow + r);
    row.height = 20;
    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c);
      applyFill(cell);
      cell.border = { top: thin, left: thin, bottom: thin, right: thin };
      cell.font = { name: "Calibri", size: 11 };
      cell.alignment = { vertical: "middle", wrapText: true };
    }
  }
}

function setCols(ws, widths) {
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
}

function addSheetTable(wb, { name, title, subtitle, headers, widths, rows, note }) {
  const ws = wb.addWorksheet(name, {
    properties: { tabColor: { argb: `FF${C.darkGreen}` } },
  });
  addTitle(ws, title, subtitle);
  if (note) {
    ws.mergeCells("A3:H3");
    const n = ws.getCell("A3");
    n.value = note;
    n.font = { name: "Calibri", size: 10, bold: true, color: { argb: `FF${C.must}` } };
    n.alignment = { wrapText: true };
  }
  const headerRow = 4;
  const hr = ws.getRow(headerRow);
  headers.forEach((h, i) => {
    hr.getCell(i + 1).value = h;
  });
  styleHeader(hr, headers.length);
  setCols(ws, widths);
  blankFillRows(ws, headerRow + 1, rows, headers.length);
  return ws;
}

const wb = new ExcelJS.Workbook();
wb.creator = "Zimson Watch Care";
wb.created = new Date();
wb.title = "Pilot run — data the client must prepare";

// ── READ ME ──────────────────────────────────────────────────────────────────
{
  const ws = wb.addWorksheet("READ ME", {
    properties: { tabColor: { argb: `FF${C.gold}` } },
  });
  ws.views = [{ showGridLines: false }];
  setCols(ws, [4, 28, 72, 22]);

  ws.mergeCells("B2:D2");
  ws.getCell("B2").value = "ZIMSON WATCH CARE — PILOT DATA TO PREPARE";
  ws.getCell("B2").font = { name: "Calibri", size: 18, bold: true, color: { argb: `FF${C.darkGreen}` } };

  ws.mergeCells("B3:D3");
  ws.getCell("B3").value =
    "Please fill the yellow cells and send this file back before the pilot. Yellow = you type here. Do not change header rows.";
  ws.getCell("B3").font = { name: "Calibri", size: 11, italic: true };
  ws.getCell("B3").alignment = { wrapText: true };
  ws.getRow(3).height = 32;

  const intro = [
    ["Sheet", "What to fill", "When"],
    ["1. Head Office", "One HO / regional office — GSTIN, PAN, address", "Required"],
    ["2. Stores", "Each store in the pilot (one store is enough)", "Required"],
    ["3. Staff", "People who will sit on the system tomorrow", "Required"],
    ["4. Brands", "Watch brands you will book, and whether serial is mandatory", "Required"],
    ["5. Test Job", "One real customer + one watch for the live booking", "Required"],
    ["6. Spares", "Part numbers, prices, stock", "Only if you will issue spare parts"],
    ["7. Packages", "Service package name, brand, price", "Only if you will book a package"],
    ["8. Package lines", "Spares inside each package", "Only if a package includes parts"],
    ["9. Suppliers", "Vendor GSTIN and contact", "Only if you will test purchase / GRN"],
    ["10. Tax & print", "GST %, SAC, invoice wording if not standard", "If different from usual 18% / SAC 9987"],
  ];

  intro.forEach((line, idx) => {
    const r = 5 + idx;
    line.forEach((v, c) => {
      const cell = ws.getCell(r, c + 2);
      cell.value = v;
      cell.border = { top: thin, left: thin, bottom: thin, right: thin };
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.font =
        idx === 0
          ? { name: "Calibri", size: 11, bold: true, color: { argb: `FF${C.headerFg}` } }
          : { name: "Calibri", size: 11 };
      if (idx === 0) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${C.darkGreen}` } };
      } else if (line[2] === "Required") {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFEBEE" } };
      } else {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3F2FD" } };
      }
    });
    ws.getRow(r).height = 22;
  });

  ws.mergeCells("B18:D18");
  ws.getCell("B18").value =
    "Minimum for tomorrow: sheets 1 to 5. Use a mobile number and email the customer can open during the session (OTP and SRF copy).";
  ws.getCell("B18").font = { name: "Calibri", size: 11, bold: true, color: { argb: `FF${C.must}` } };
  ws.getCell("B18").alignment = { wrapText: true };
  ws.getRow(18).height = 36;
}

// ── 1. Head Office ───────────────────────────────────────────────────────────
{
  addSheetTable(wb, {
    name: "1. Head Office",
    title: "1. Head office (region)",
    subtitle: "Fill one row. Example: Chennai Regional Office | CHN | Zimson Times Pvt. Ltd. | GSTIN 15 chars | PAN 10 chars | phone | email | full address.",
    note: "Required for the pilot.",
    headers: [
      "HO / region name *",
      "Short code (e.g. CHN) *",
      "Legal name *",
      "GSTIN (15) *",
      "PAN (10) *",
      "Office phone *",
      "Office email *",
      "Door / street *",
      "Area",
      "City *",
      "District *",
      "State *",
      "PIN *",
      "Country *",
    ],
    widths: [28, 16, 28, 18, 14, 16, 28, 28, 18, 16, 16, 16, 12, 12],
    rows: 2,
  });
}

// ── 2. Stores ────────────────────────────────────────────────────────────────
{
  addSheetTable(wb, {
    name: "2. Stores",
    title: "2. Stores in the pilot",
    subtitle: "One store is enough for tomorrow. Repeat a row for every extra store.",
    note: "Required. Invoice store code is used on SRF, transfer document and invoice numbers.",
    headers: [
      "Store name *",
      "Belongs to which HO *",
      "Invoice store code (e.g. CBE01) *",
      "Name as printed on invoice *",
      "Tagline (if printed)",
      "Store GSTIN (if different from HO)",
      "Store phone *",
      "Store email *",
      "Full store address (if different from HO)",
      "Invoice terms / footer text",
    ],
    widths: [24, 24, 22, 32, 28, 22, 16, 26, 36, 36],
    rows: 8,
  });
}

// ── 3. Staff ─────────────────────────────────────────────────────────────────
{
  const ws = addSheetTable(wb, {
    name: "3. Staff",
    title: "3. People who will use the system tomorrow",
    subtitle: "One row per person. Roles needed: Store staff, HO clerk, Supervisor, Technician, Delivery boy.",
    note: "Required. Delivery boy needs a 10-digit mobile (no login). Technician needs a grade.",
    headers: [
      "Full name *",
      "Employee code *",
      "Work email *",
      "Mobile (10 digits) *",
      "Role *",
      "Store name (store staff only) *",
      "HO name (HO roles) *",
      "Technician grade (technicians only) *",
    ],
    widths: [24, 16, 28, 16, 22, 24, 24, 22],
    rows: 15,
  });
  const roles = [
    "Store staff",
    "HO clerk",
    "Supervisor",
    "Technician",
    "Delivery boy",
  ];
  for (let r = 5; r <= 19; r++) {
    ws.getCell(r, 5).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`"${roles.join(",")}"`],
      showErrorMessage: true,
      error: "Pick a role from the list.",
    };
  }
}

// ── 4. Brands ────────────────────────────────────────────────────────────────
{
  const ws = addSheetTable(wb, {
    name: "4. Brands",
    title: "4. Brands you will service tomorrow",
    subtitle: "List every brand that may be booked. Say whether serial number is mandatory.",
    note: "Required. At least the brands used on the test watch.",
    headers: ["Brand name *", "Serial number mandatory? (Yes / No) *"],
    widths: [32, 36],
    rows: 20,
  });
  for (let r = 5; r <= 24; r++) {
    ws.getCell(r, 2).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"Yes,No"'],
      showErrorMessage: true,
      error: "Enter Yes or No.",
    };
  }
}

// ── 5. Test Job ──────────────────────────────────────────────────────────────
{
  const ws = addSheetTable(wb, {
    name: "5. Test Job",
    title: "5. One live test job — customer + watch",
    subtitle: "Use a real mobile and a mailbox you can open during the session. OTP and SRF copy go there.",
    note: "Required. Prefer B2C unless you also want to test GST e-invoice.",
    headers: [
      "Customer first name *",
      "Mobile 10 digits *",
      "Email *",
      "Address line 1 *",
      "City *",
      "District *",
      "State *",
      "PIN *",
      "B2C or B2B *",
      "If B2B — company name",
      "If B2B — GSTIN",
      "If B2B — PAN",
      "Watch brand *",
      "Watch family *",
      "Watch model *",
      "Serial number (if brand requires)",
      "Complaint / work *",
      "Estimate amount INR (or package name) *",
      "Estimated delivery date *",
      "Advance amount (optional)",
      "Advance payment mode (optional)",
    ],
    widths: [22, 16, 28, 28, 14, 14, 16, 10, 14, 24, 18, 14, 16, 16, 16, 18, 28, 28, 18, 16, 20],
    rows: 3,
  });
  ws.getCell(5, 9).dataValidation = {
    type: "list",
    allowBlank: true,
    formulae: ['"B2C,B2B"'],
  };
}

// ── 6. Spares ────────────────────────────────────────────────────────────────
{
  addSheetTable(wb, {
    name: "6. Spares",
    title: "6. Spare parts",
    subtitle: "Fill only if you will issue or bill spare parts tomorrow.",
    note: "Optional. Selling price must be greater than 0. It is not calculated from purchase price.",
    headers: [
      "Part number / SKU *",
      "Brand of spare *",
      "Part full name *",
      "Description *",
      "Category *",
      "Sub category",
      "HSN *",
      "GST % *",
      "MRP *",
      "Selling price *",
      "Cost / purchase price",
      "Qty at HO *",
      "Qty at store (if store sale)",
      "UOM (if not Nos)",
    ],
    widths: [18, 16, 28, 28, 16, 16, 12, 10, 12, 14, 16, 12, 18, 14],
    rows: 25,
  });
}

// ── 7. Packages ──────────────────────────────────────────────────────────────
{
  addSheetTable(wb, {
    name: "7. Packages",
    title: "7. Service packages",
    subtitle: "Fill only if you will book a package (not a free-text estimate).",
    note: "Optional. Package selling price must be greater than 0.",
    headers: [
      "Package type (e.g. Overhaul, Polish) *",
      "Package name *",
      "Brand *",
      "Selling price INR *",
    ],
    widths: [32, 28, 18, 18],
    rows: 15,
  });
}

// ── 8. Package lines ─────────────────────────────────────────────────────────
{
  addSheetTable(wb, {
    name: "8. Package lines",
    title: "8. Spares inside each package",
    subtitle: "One row per spare inside a package. Leave blank if packages are labour-only.",
    note: "Optional. SKU must also appear on sheet 6. Spares.",
    headers: [
      "Package name *",
      "Spare SKU *",
      "Qty *",
      "Sale price each *",
    ],
    widths: [28, 18, 10, 18],
    rows: 20,
  });
}

// ── 9. Suppliers ─────────────────────────────────────────────────────────────
{
  addSheetTable(wb, {
    name: "9. Suppliers",
    title: "9. Suppliers",
    subtitle: "Fill only if you will test purchase order / GRN tomorrow.",
    note: "Optional.",
    headers: [
      "Supplier name *",
      "GSTIN",
      "Contact name",
      "Phone",
      "Email",
      "Address",
    ],
    widths: [28, 18, 22, 16, 26, 40],
    rows: 10,
  });
}

// ── 10. Tax ──────────────────────────────────────────────────────────────────
{
  const ws = addSheetTable(wb, {
    name: "10. Tax & print",
    title: "10. Tax and print wording",
    subtitle: "Fill only if not standard. Default in software: GST 18%, SAC 9987.",
    note: "Optional.",
    headers: ["Item", "Your value"],
    widths: [48, 48],
    rows: 6,
  });
  const labels = [
    "GST % on service (if not 18)",
    "GST % on spares (if not 18)",
    "SAC code (if not 9987)",
    "How invoice numbers should look",
    "How SRF numbers should look",
    "Any other print instruction",
  ];
  labels.forEach((label, i) => {
    const cell = ws.getRow(5 + i).getCell(1);
    cell.value = label;
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${C.alt}` },
    };
    cell.font = { name: "Calibri", size: 11, bold: true };
  });
}

await wb.xlsx.writeFile(OUT);
console.log("Wrote", OUT);
