import ExcelJS from "exceljs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "ZIMSON_Project_Gantt_v2.xlsx");

// ── Colour palette ────────────────────────────────────────────────────────────
const C = {
  darkGreen:   "1A3D2B",
  gold:        "C9A84C",
  lightGold:   "F5E6C0",
  headerBg:    "1A3D2B",
  headerFg:    "FFFFFF",
  rowAlt:      "F7F9F6",
  rowNorm:     "FFFFFF",
  barDone:     "2E7D51",   // completed bar
  barIP:       "C9A84C",   // in-progress bar
  barPlan:     "90A4AE",   // planned bar
  barFull:     "D4EDDA",   // full-row background for done rows
  border:      "C5CAC3",
  phaseGreen:  "E8F5E9",
  phaseText:   "1A3D2B",
  weekend:     "F0F0F0",
  ganttDone:   "2E7D51",
  ganttIP:     "F5A623",
  ganttTodo:   "B0BEC5",
  ganttEmpty:  "FAFAFA",
};

// ── Project timeline (weeks starting Mon) ─────────────────────────────────────
// Project: ZIMSON Service Management — Apr 2026 to Jun 2026
const PROJECT_START = new Date("2026-04-06"); // Monday

function weekLabel(weekIdx) {
  const d = new Date(PROJECT_START);
  d.setDate(d.getDate() + weekIdx * 7);
  return `W${weekIdx + 1}\n${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}`;
}

const TOTAL_WEEKS = 12;

// ── Tasks ─────────────────────────────────────────────────────────────────────
// status: "done" | "inprogress" | "planned"
const PHASES = [
  {
    phase: "PHASE 1 — Core System Setup",
    color: "1A3D2B",
    tasks: [
      { task: "Project scaffold & DB schema",   owner: "Full Stack",    start: 1, end: 1, pct: 100, status: "done",       notes: "Vite + React + Express + PostgreSQL" },
      { task: "Authentication & session mgmt",  owner: "Backend",       start: 1, end: 2, pct: 100, status: "done",       notes: "Employee code login, JWT sessions" },
      { task: "Sidebar & role-based routing",   owner: "Frontend",      start: 1, end: 2, pct: 100, status: "done",       notes: "ModuleRoute, AppShell, nav guards" },
      { task: "Toast / notification system",    owner: "Frontend",      start: 2, end: 2, pct: 100, status: "done",       notes: "Global ToastProvider + useToast" },
    ],
  },
  {
    phase: "PHASE 2 — Master Data",
    color: "2E7D51",
    tasks: [
      { task: "Region management + PIN lookup", owner: "Full Stack",    start: 2, end: 3, pct: 100, status: "done",       notes: "Address split, postal API, popups" },
      { task: "Store & warehouse management",   owner: "Full Stack",    start: 3, end: 3, pct: 100, status: "done",       notes: "Under region hierarchy" },
      { task: "User creation & role system",    owner: "Full Stack",    start: 3, end: 4, pct: 100, status: "done",       notes: "Simplified roles, edit/deactivate" },
      { task: "Demo login — DB users",          owner: "Frontend",      start: 4, end: 4, pct: 100, status: "done",       notes: "Plain-text password default" },
      { task: "Spares catalogue & bulk import", owner: "Full Stack",    start: 4, end: 5, pct: 100, status: "done",       notes: "Seeded Excel template upload" },
    ],
  },
  {
    phase: "PHASE 3 — Inventory Procurement",
    color: "1565C0",
    tasks: [
      { task: "Supplier master + spare mapping",owner: "Full Stack",    start: 5, end: 6, pct: 100, status: "done",       notes: "Supplier form, modal, SparePicker" },
      { task: "Purchase Request (PR) creation", owner: "Full Stack",    start: 5, end: 6, pct: 100, status: "done",       notes: "Searchable spares, direct to HO" },
      { task: "PR approval workflow",           owner: "Full Stack",    start: 6, end: 6, pct: 100, status: "done",       notes: "HO approval, reject, remind btn" },
      { task: "PR History page",                owner: "Frontend",      start: 6, end: 7, pct: 100, status: "done",       notes: "Status labels, filters, Fulfil" },
      { task: "Purchase Order (PO) creation",   owner: "Full Stack",    start: 7, end: 7, pct: 100, status: "done",       notes: "Consolidated demand → supplier POs" },
      { task: "PO History page",                owner: "Frontend",      start: 7, end: 7, pct: 100, status: "done",       notes: "Stats, search, detail modal, print" },
    ],
  },
  {
    phase: "PHASE 4 — Goods Receipt & Stock",
    color: "6A1B9A",
    tasks: [
      { task: "GRN — cost price & HSN tax",     owner: "Full Stack",    start: 7, end: 8, pct: 100, status: "done",       notes: "Auto GST from HSN, CGST/SGST split" },
      { task: "GRN — vendor invoice upload",    owner: "Full Stack",    start: 8, end: 8, pct: 100, status: "done",       notes: "Multer, PDF/image, stored on disk" },
      { task: "GRN History page",               owner: "Frontend",      start: 8, end: 8, pct: 100, status: "done",       notes: "Stats, search, detail modal, print" },
      { task: "PR auto-status from GRN",        owner: "Backend",       start: 8, end: 8, pct: 100, status: "done",       notes: "APPROVED→GOODS_AT_HO on GRN post" },
      { task: "HO → Store stock fulfil",        owner: "Full Stack",    start: 8, end: 9, pct: 100, status: "done",       notes: "Fulfil modal, transfer qty, FULFILLED" },
    ],
  },
  {
    phase: "PHASE 5 — Notifications & Comms",
    color: "BF360C",
    tasks: [
      { task: "PR submission notifications",    owner: "Backend",       start: 6, end: 6, pct: 100, status: "done",       notes: "HO mgr notified on new PR" },
      { task: "PR approval/reject notifications",owner: "Backend",      start: 6, end: 7, pct: 100, status: "done",       notes: "Store notified on HO decision" },
      { task: "PR remind button",               owner: "Full Stack",    start: 7, end: 7, pct: 100, status: "done",       notes: "Re-ping HO mgr from store" },
      { task: "PO creation notifications",      owner: "Backend",       start: 8, end: 8, pct: 100, status: "done",       notes: "Store told PO has been raised" },
      { task: "GRN goods-arrived notifications",owner: "Backend",       start: 8, end: 8, pct: 100, status: "done",       notes: "Store notified goods at HO" },
    ],
  },
  {
    phase: "PHASE 6 — Service Centre Module",
    color: "00695C",
    tasks: [
      { task: "SRF booking & job card",         owner: "Full Stack",    start: 3, end: 5, pct: 100, status: "done",       notes: "Watch intake, SRF number, tracking" },
      { task: "Technician workbench",           owner: "Full Stack",    start: 5, end: 6, pct: 100, status: "done",       notes: "Job assignment, status updates" },
      { task: "Quick bill (walk-in)",           owner: "Full Stack",    start: 6, end: 7, pct: 100, status: "done",       notes: "Invoice, PDF print, history" },
      { task: "Store billing & dispatch",       owner: "Full Stack",    start: 7, end: 8, pct: 100, status: "done",       notes: "Billing, DC creation, tracking" },
    ],
  },
  {
    phase: "PHASE 7 — Reporting & Settings",
    color: "4527A0",
    tasks: [
      { task: "Document templates (GRN/PO/DC)", owner: "Frontend",      start: 5,  end: 7,  pct: 100, status: "done",       notes: "Print-ready branded documents" },
      { task: "Tax & HSN settings",             owner: "Full Stack",    start: 4,  end: 5,  pct: 10,  status: "inprogress", notes: "GST rates, invoice config — 10% done" },
      { task: "Documentation",                  owner: "Full Stack",    start: 6,  end: 10, pct: 60,  status: "inprogress", notes: "API docs, user manual — 60% done" },
      { task: "Dashboard & KPI cards",          owner: "Frontend",      start: 9,  end: 10, pct: 40,  status: "inprogress", notes: "Role-based summary widgets" },
      { task: "Accounts module setup",          owner: "Full Stack",    start: 10, end: 12, pct: 0,   status: "planned",    notes: "Ledger, P&L, reconciliation — not started" },
      { task: "Reports & exports",              owner: "Full Stack",    start: 11, end: 12, pct: 0,   status: "planned",    notes: "PR/PO/GRN Excel exports" },
    ],
  },
  {
    phase: "PHASE 8 — Communication Integrations",
    color: "C62828",
    tasks: [
      { task: "WhatsApp Business API integration", owner: "Backend",   start: 10, end: 12, pct: 0,   status: "planned",    notes: "Order updates, PR alerts via WhatsApp" },
      { task: "SMS (OTP & alerts) integration",    owner: "Backend",   start: 10, end: 11, pct: 0,   status: "planned",    notes: "Twilio / MSG91 — login OTP, status SMS" },
      { task: "Email (SMTP) integration",          owner: "Backend",   start: 10, end: 11, pct: 0,   status: "planned",    notes: "Nodemailer — invoices, approvals, reports" },
      { task: "Notification preferences UI",       owner: "Frontend",  start: 11, end: 12, pct: 0,   status: "planned",    notes: "User-level channel opt-in settings" },
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function fill(hex) { return { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + hex } }; }
function font(hex, bold = false, size = 10) { return { color: { argb: "FF" + hex }, bold, size, name: "Calibri" }; }
function border(hex = C.border) {
  const s = { style: "thin", color: { argb: "FF" + hex } };
  return { top: s, left: s, bottom: s, right: s };
}
function align(h = "left", v = "middle", wrap = false) { return { horizontal: h, vertical: v, wrapText: wrap }; }

// ── Build workbook ─────────────────────────────────────────────────────────────
const wb = new ExcelJS.Workbook();
wb.creator = "Zimson Service Management";
wb.created = new Date();

// ══════════════════════════════════════════════════════════════════════════════
// SHEET 1 — GANTT CHART
// ══════════════════════════════════════════════════════════════════════════════
const ws = wb.addWorksheet("Gantt Chart", { views: [{ state: "frozen", xSplit: 4, ySplit: 4 }] });

// Column widths
ws.getColumn(1).width = 5;   // #
ws.getColumn(2).width = 38;  // Task
ws.getColumn(3).width = 16;  // Owner
ws.getColumn(4).width = 6;   // % Done
for (let w = 1; w <= TOTAL_WEEKS; w++) {
  ws.getColumn(4 + w).width = 6.5;
}

// ── Row 1: Project title ──────────────────────────────────────────────────────
ws.mergeCells(1, 1, 1, 4 + TOTAL_WEEKS);
const titleCell = ws.getCell(1, 1);
titleCell.value = "ZIMSON SERVICE MANAGEMENT — PROJECT GANTT CHART";
titleCell.font = { ...font("FFFFFF", true, 14) };
titleCell.fill = fill(C.darkGreen);
titleCell.alignment = align("center", "middle");
ws.getRow(1).height = 32;

// ── Row 2: Sub-title ─────────────────────────────────────────────────────────
ws.mergeCells(2, 1, 2, 4);
const subLeft = ws.getCell(2, 1);
subLeft.value = `Project Period: Apr 2026 – Jun 2026   |   Generated: ${new Date().toLocaleDateString("en-IN")}`;
subLeft.font = font("555555", false, 9);
subLeft.fill = fill("F5E6C0");
subLeft.alignment = align("left", "middle");

// Legend cells
const legendData = [
  { label: "■ Completed", color: C.ganttDone },
  { label: "■ In Progress", color: C.ganttIP },
  { label: "■ Planned", color: C.ganttTodo },
];
const legendStartCol = 5 + TOTAL_WEEKS - legendData.length * 2;
legendData.forEach((l, i) => {
  const col = legendStartCol + i * 2;
  ws.mergeCells(2, col, 2, col + 1);
  const c = ws.getCell(2, col);
  c.value = l.label;
  c.font = { ...font(l.color, true, 9) };
  c.fill = fill("F5E6C0");
  c.alignment = align("center", "middle");
});
ws.getRow(2).height = 18;

// ── Row 3: blank spacer ───────────────────────────────────────────────────────
ws.getRow(3).height = 4;

// ── Row 4: Column headers ─────────────────────────────────────────────────────
const hdr = ws.getRow(4);
hdr.height = 36;
[["#", 1], ["Task / Deliverable", 2], ["Owner", 3], ["%", 4]].forEach(([v, c]) => {
  const cell = ws.getCell(4, c);
  cell.value = v;
  cell.font = font(C.headerFg, true, 10);
  cell.fill = fill(C.headerBg);
  cell.border = border(C.headerBg);
  cell.alignment = align("center", "middle");
});

for (let w = 0; w < TOTAL_WEEKS; w++) {
  const cell = ws.getCell(4, 5 + w);
  cell.value = weekLabel(w);
  cell.font = font(C.headerFg, true, 8);
  cell.fill = fill(C.headerBg);
  cell.border = border(C.headerBg);
  cell.alignment = align("center", "middle", true);
}

// ── Task rows ─────────────────────────────────────────────────────────────────
let rowIdx = 5;
let taskNum = 0;

for (const phase of PHASES) {
  // Phase header row
  ws.mergeCells(rowIdx, 1, rowIdx, 4 + TOTAL_WEEKS);
  const phCell = ws.getCell(rowIdx, 1);
  phCell.value = `  ${phase.phase}`;
  phCell.font = { ...font("FFFFFF", true, 10) };
  phCell.fill = fill(phase.color);
  phCell.alignment = align("left", "middle");
  ws.getRow(rowIdx).height = 22;
  rowIdx++;

  for (const t of phase.tasks) {
    taskNum++;
    const row = ws.getRow(rowIdx);
    row.height = 20;
    const isAlt = taskNum % 2 === 0;
    const rowBg = t.status === "done" ? "F1FBF4" : (isAlt ? C.rowAlt : C.rowNorm);

    // # column
    const numCell = ws.getCell(rowIdx, 1);
    numCell.value = taskNum;
    numCell.font = font("888888", false, 9);
    numCell.fill = fill(rowBg);
    numCell.border = border();
    numCell.alignment = align("center", "middle");

    // Task name
    const nameCell = ws.getCell(rowIdx, 2);
    nameCell.value = t.task;
    nameCell.font = font(t.status === "done" ? "2E7D51" : "222222", t.status === "done", 10);
    nameCell.fill = fill(rowBg);
    nameCell.border = border();
    nameCell.alignment = align("left", "middle");

    // Owner
    const ownerCell = ws.getCell(rowIdx, 3);
    ownerCell.value = t.owner;
    ownerCell.font = font("555555", false, 9);
    ownerCell.fill = fill(rowBg);
    ownerCell.border = border();
    ownerCell.alignment = align("center", "middle");

    // % Done
    const pctCell = ws.getCell(rowIdx, 4);
    pctCell.value = t.pct / 100;
    pctCell.numFmt = "0%";
    pctCell.font = font(t.pct === 100 ? "2E7D51" : t.pct > 0 ? "BF6900" : "888888", true, 9);
    pctCell.fill = fill(rowBg);
    pctCell.border = border();
    pctCell.alignment = align("center", "middle");

    // Gantt bar columns
    const barColor = t.status === "done" ? C.ganttDone : t.status === "inprogress" ? C.ganttIP : C.ganttTodo;
    for (let w = 0; w < TOTAL_WEEKS; w++) {
      const col = 5 + w;
      const cell = ws.getCell(rowIdx, col);
      const weekNum = w + 1;
      const inRange = weekNum >= t.start && weekNum <= t.end;
      if (inRange) {
        cell.fill = fill(barColor);
        // First week — add left tick, last week — add right tick
        if (weekNum === t.start && weekNum === t.end) cell.value = "◆";
        else if (weekNum === t.start) cell.value = "◀";
        else if (weekNum === t.end) cell.value = "▶";
        else cell.value = "─";
        cell.font = { ...font("FFFFFF", false, 9) };
        cell.alignment = align("center", "middle");
      } else {
        cell.fill = fill(rowBg);
        cell.value = "";
      }
      cell.border = border();
    }

    rowIdx++;
  }

  // Spacing row after phase
  ws.getRow(rowIdx).height = 6;
  rowIdx++;
}

// ── Row after all tasks: summary footer ───────────────────────────────────────
ws.mergeCells(rowIdx, 1, rowIdx, 4 + TOTAL_WEEKS);
const footerCell = ws.getCell(rowIdx, 1);
const totalTasks = PHASES.flatMap((p) => p.tasks).length;
const doneTasks = PHASES.flatMap((p) => p.tasks).filter((t) => t.status === "done").length;
const ipTasks = PHASES.flatMap((p) => p.tasks).filter((t) => t.status === "inprogress").length;
footerCell.value = `  Total Tasks: ${totalTasks}   |   Completed: ${doneTasks}   |   In Progress: ${ipTasks}   |   Planned: ${totalTasks - doneTasks - ipTasks}   |   Overall Progress: ${Math.round((doneTasks / totalTasks) * 100)}%`;
footerCell.font = font("FFFFFF", true, 10);
footerCell.fill = fill(C.darkGreen);
footerCell.alignment = align("left", "middle");
ws.getRow(rowIdx).height = 20;

// ══════════════════════════════════════════════════════════════════════════════
// SHEET 2 — TASK LIST (detailed)
// ══════════════════════════════════════════════════════════════════════════════
const ws2 = wb.addWorksheet("Task Details");

const cols2 = ["#", "Phase", "Task / Deliverable", "Owner", "Start Week", "End Week", "Duration (Wks)", "% Complete", "Status", "Notes"];
const widths2 = [5, 32, 42, 14, 11, 11, 14, 11, 13, 50];
cols2.forEach((h, i) => { ws2.getColumn(i + 1).width = widths2[i]; });

// Title
ws2.mergeCells(1, 1, 1, cols2.length);
const t2 = ws2.getCell(1, 1);
t2.value = "ZIMSON SERVICE MANAGEMENT — Task Details";
t2.font = font("FFFFFF", true, 13);
t2.fill = fill(C.darkGreen);
t2.alignment = align("center", "middle");
ws2.getRow(1).height = 28;

// Header
const hdr2 = ws2.getRow(2);
hdr2.height = 20;
cols2.forEach((h, i) => {
  const c = ws2.getCell(2, i + 1);
  c.value = h;
  c.font = font("FFFFFF", true, 10);
  c.fill = fill(C.darkGreen);
  c.border = border();
  c.alignment = align("center", "middle");
});

let r2 = 3, n2 = 0;
for (const phase of PHASES) {
  for (const t of phase.tasks) {
    n2++;
    const row = ws2.getRow(r2);
    row.height = 18;
    const bg = n2 % 2 === 0 ? "F7F9F6" : "FFFFFF";
    const statusColor = t.status === "done" ? "2E7D51" : t.status === "inprogress" ? "BF6900" : "607D8B";
    const vals = [n2, phase.phase, t.task, t.owner, `Week ${t.start}`, `Week ${t.end}`, t.end - t.start + 1, t.pct / 100,
      t.status === "done" ? "✅ Completed" : t.status === "inprogress" ? "🔄 In Progress" : "📋 Planned", t.notes];
    vals.forEach((v, i) => {
      const c = ws2.getCell(r2, i + 1);
      c.value = v;
      c.fill = fill(bg);
      c.border = border();
      c.alignment = align(i >= 4 ? "center" : "left", "middle");
      if (i === 7) { c.numFmt = "0%"; c.font = font(statusColor, true, 10); }
      else if (i === 8) { c.font = font(statusColor, true, 10); }
      else c.font = font("333333", false, 10);
    });
    r2++;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SHEET 3 — SUMMARY DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
const ws3 = wb.addWorksheet("Summary");
ws3.getColumn(1).width = 5;
ws3.getColumn(2).width = 30;
ws3.getColumn(3).width = 18;
ws3.getColumn(4).width = 18;
ws3.getColumn(5).width = 18;

ws3.mergeCells(1, 1, 1, 5);
const st = ws3.getCell(1, 1);
st.value = "ZIMSON SERVICE MANAGEMENT — Project Summary";
st.font = font("FFFFFF", true, 14);
st.fill = fill(C.darkGreen);
st.alignment = align("center", "middle");
ws3.getRow(1).height = 32;

// KPI row
ws3.getRow(3).height = 14;
const kpis = [
  { label: "Total Tasks",    value: totalTasks,                                 color: "1A3D2B" },
  { label: "Completed",      value: `${doneTasks} (${Math.round(doneTasks/totalTasks*100)}%)`, color: "2E7D51" },
  { label: "In Progress",    value: ipTasks,                                    color: "BF6900" },
  { label: "Planned",        value: totalTasks - doneTasks - ipTasks,           color: "607D8B" },
];
kpis.forEach((k, i) => {
  const col = 2 + i;
  ws3.mergeCells(4, col, 4, col);
  ws3.mergeCells(5, col, 5, col);
  const lc = ws3.getCell(4, col);
  lc.value = k.label;
  lc.font = font("FFFFFF", true, 10);
  lc.fill = fill(k.color);
  lc.alignment = align("center", "middle");
  lc.border = border(k.color);
  ws3.getRow(4).height = 18;

  const vc = ws3.getCell(5, col);
  vc.value = k.value;
  vc.font = { ...font(k.color, true, 20) };
  vc.fill = fill("FFFFFF");
  vc.alignment = align("center", "middle");
  vc.border = border(k.color);
  ws3.getRow(5).height = 40;
});

// Phase breakdown table
ws3.getRow(7).height = 20;
["Phase", "Tasks", "Done", "In Prog", "% Complete"].forEach((h, i) => {
  const c = ws3.getCell(7, 1 + i);
  c.value = h;
  c.font = font("FFFFFF", true, 10);
  c.fill = fill(C.darkGreen);
  c.border = border();
  c.alignment = align("center", "middle");
});

let pr = 8;
for (const phase of PHASES) {
  const done = phase.tasks.filter((t) => t.status === "done").length;
  const ip = phase.tasks.filter((t) => t.status === "inprogress").length;
  const pct = Math.round((done / phase.tasks.length) * 100);
  const bg = pr % 2 === 0 ? "F7F9F6" : "FFFFFF";
  const row3 = ws3.getRow(pr);
  row3.height = 18;
  [phase.phase.replace(/PHASE \d+ — /, ""), phase.tasks.length, done, ip, pct / 100].forEach((v, i) => {
    const c = ws3.getCell(pr, 1 + i);
    c.value = v;
    c.fill = fill(bg);
    c.border = border();
    c.alignment = align(i === 0 ? "left" : "center", "middle");
    if (i === 4) { c.numFmt = "0%"; c.font = font(pct === 100 ? "2E7D51" : "BF6900", true, 10); }
    else c.font = font("333333", false, 10);
  });
  pr++;
}

// ── Write file ─────────────────────────────────────────────────────────────────
await wb.xlsx.writeFile(OUT);
console.log(`✅  Gantt chart saved to:\n    ${OUT}`);
