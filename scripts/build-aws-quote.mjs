/**
 * Regenerates docs/Zimson-AWS-Monthly-Quote-OnDemand.xlsx — full hosting pack for 75 stores.
 */
import ExcelJS from "exceljs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "docs", "Zimson-AWS-Monthly-Quote-OnDemand.xlsx");
const FX = 96;
const STORES = 75;
const REGION = "ap-south-1 (Mumbai)";

const LINE_ITEMS = [
  {
    label: "EC2 application server (1 × t4g.xlarge, 4 vCPU, 16 GB)",
    usd: 118,
    note: "Single server; Node API + React SPA (Nginx); headroom for PDF peaks",
  },
  {
    label: "RDS PostgreSQL (db.t4g.large, Single-AZ)",
    usd: 96,
    note: "One zone; automated backups + manual snapshots recommended",
  },
  {
    label: "RDS storage (100 GB gp3)",
    usd: 12,
    note: "Customers, SRF, inventory, quick bills",
  },
  {
    label: "Elastic IP + HTTPS on EC2 (no load balancer)",
    usd: 4,
    note: "Let's Encrypt or ACM on Nginx; DNS A-record → Elastic IP",
  },
  {
    label: "EBS volume (1 × 80 GB gp3, app server)",
    usd: 6,
    note: "OS + app; user uploads on S3 when integrated",
  },
  {
    label: "Amazon S3 (≈220 GB + requests)",
    usd: 14,
    note: "srf/ + quick-bill/ prefixes; ~1.4 GB/day across 75 stores",
  },
  {
    label: "Data transfer & miscellaneous",
    usd: 10,
    note: "In-region; light internet egress",
  },
];

const PACKAGE_SUMMARY = [
  ["EC2", "1 × t4g.xlarge (4 vCPU, 16 GB RAM) — single application server"],
  ["Database", "Amazon RDS PostgreSQL db.t4g.large, Single-AZ, 100 GB gp3"],
  ["Load balancer", "None — Elastic IP + Nginx HTTPS on EC2"],
  ["Object storage", "Amazon S3 private bucket (SRF photos, Quick Bill document/image)"],
  ["App stack", "Node.js + Express API, React SPA (built to dist/), PostgreSQL on RDS"],
];

const ARCHITECTURE_ROWS = [
  ["Layer", "AWS service", "Specification", "Role"],
  ["Users (stores)", "Internet", `${STORES} locations, ~95–180 peak concurrent`, "HTTPS to EC2"],
  ["Web + API", "EC2 t4g.xlarge", "4 vCPU, 16 GB, Amazon Linux 2023", "Nginx → static SPA + proxy /api"],
  ["Application", "Node.js (PM2)", "1–2 workers on EC2", "Zimson Service Management API"],
  ["Database", "RDS PostgreSQL", "db.t4g.large Single-AZ, 100 GB", "All transactional data"],
  ["Files / images", "S3", "~220 GB year-1 (private)", "SRF capture, Quick Bill uploads"],
  ["DNS / TLS", "Route 53 + EIP", "No ALB", "A record → Elastic IP; cert on Nginx"],
  ["Backups", "RDS snapshots + S3 lifecycle", "Daily automated", "Point-in-time recovery (RDS)"],
];

const EC2_COMPARE = [
  ["Instance", "vCPU", "RAM", "Monthly USD (est.)", "Monthly INR (est.)", "Fit for 75 stores?"],
  ["t4g.medium", 2, "4 GB", 30, 30 * FX, "Pilot only (10–20 stores)"],
  ["t4g.large", 2, "8 GB", 59, 59 * FX, "Possible but tight at peak"],
  ["t4g.xlarge", 4, "16 GB", 118, 118 * FX, "Selected — recommended"],
  ["t4g.2xlarge", 8, "32 GB", 236, 236 * FX, "Only if monitoring shows sustained overload"],
];

const DESIGN_COMPARE = [
  ["Item", "Previous (HA) design", "Current design (approved)"],
  ["Stores", "~80", `~${STORES}`],
  ["EC2", "2 × t4g.large", "1 × t4g.xlarge"],
  ["RDS", "db.t4g.large Multi-AZ", "db.t4g.large Single-AZ"],
  ["Load balancer", "ALB + ACM", "None"],
  ["Monthly total (est.)", "~$338 / ~₹28,700", `~$${LINE_ITEMS.reduce((s, x) => s + x.usd, 0)} / ~₹${LINE_ITEMS.reduce((s, x) => s + x.usd, 0) * FX}`],
  ["High availability", "Yes (2 EC2 + Multi-AZ DB)", "No — single server; planned maintenance window on deploy"],
  ["When to upgrade", "—", "2× EC2 + ALB + Multi-AZ RDS if >150 concurrent or zero-downtime required"],
];

const EXCLUDED = [
  "SMS (Qikberry) — billed by provider",
  "WhatsApp (Qikchat) — billed by provider",
  "SMTP email (Gmail / corporate) — often free tier or separate",
  "Domain registration (Route 53 / registrar)",
  "Application development & S3 code integration",
  "AWS Business Support (~10% of AWS bill, optional)",
  "Third-party GST lookup APIs (Sandbox / Explorium)",
];

const ENV_VARS = [
  ["Variable", "Example / notes", "Required"],
  ["DATABASE_URL", "postgresql://user:pass@rds-endpoint:5432/zimson", "Yes"],
  ["NODE_ENV", "production", "Yes"],
  ["PORT", "4000 (Nginx proxies 443 → 4000)", "Yes"],
  ["APP_BASE_URL", "https://service.zimson.in", "Yes — customer links, password reset"],
  ["MESSAGING_PUBLIC_BASE_URL", "https://api.zimson.in (same host or API subdomain)", "Yes for WhatsApp PDF"],
  ["SMTP_HOST / SMTP_USER / SMTP_PASSWORD", "Or configure in app Settings UI", "Yes for email OTP / forgot password"],
  ["QIKBERRY_* / QIKCHAT_*", "SMS & WhatsApp keys", "Per feature"],
];

const DEPLOY_CHECKLIST = [
  ["Step", "Task", "Owner"],
  ["1", "Create VPC, security groups (443, 22 from office IP only)", "IT"],
  ["2", "Launch EC2 t4g.xlarge, attach 80 GB gp3, Elastic IP", "IT"],
  ["3", "Create RDS db.t4g.large Single-AZ PostgreSQL 100 GB", "IT"],
  ["4", "Create S3 bucket (private), IAM role on EC2 for PutObject/GetObject", "IT"],
  ["5", "Install Node 20+, Nginx, PM2; clone app; npm run build", "Dev/IT"],
  ["6", "Set .env; run migrations; seed super admin", "Dev"],
  ["7", "Nginx: serve dist/ + proxy /api; TLS certificate", "IT"],
  ["8", "Configure messaging in Settings (SMTP, Qikberry, Qikchat)", "Super admin"],
  ["9", "CloudWatch alarms: CPU >70%, disk >80%, RDS connections", "IT"],
  ["10", "RDS automated backups 7–35 days; test restore once", "IT"],
  ["11", "UAT with 2–3 pilot stores before all 75 stores", "Business"],
];

const MONITORING = [
  ["Metric", "Warning threshold", "Action"],
  ["EC2 CPU (avg 5 min)", "> 70% for 15 min", "Check PDF/upload load; consider scale up"],
  ["EC2 memory", "> 80%", "Restart PM2; check memory leaks; consider t4g.2xlarge"],
  ["EC2 disk (EBS)", "> 80%", "Move uploads to S3; expand volume"],
  ["RDS CPU", "> 70%", "Slow query review; consider read replica later"],
  ["RDS storage", "> 80% of 100 GB", "Increase allocated storage"],
  ["API response time", "p95 > 3s", "Profile Node; index PostgreSQL"],
];

const headerFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1B3A8F" } };
const headerFont = { bold: true, color: { argb: "FFC9A227" }, size: 11 };
const totalFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F0FE" } };
const titleFont = { bold: true, size: 14, color: { argb: "FF1B3A8F" } };

function styleHeaderRow(row) {
  row.eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  row.height = 22;
}

function addTableSheet(wb, name, rows, colWidths) {
  const ws = wb.addWorksheet(name);
  colWidths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
  rows.forEach((rowData, ri) => {
    const row = ws.getRow(ri + 1);
    rowData.forEach((val, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = val;
      if (typeof val === "number" && ci >= 3 && ri > 0) {
        cell.numFmt = ci === 3 ? '"$"#,##0' : '"₹"#,##0';
      }
    });
    if (ri === 0) styleHeaderRow(row);
  });
  return ws;
}

function addSummarySheet(wb, totalUsd) {
  const ws = wb.addWorksheet("Summary", { properties: { tabColor: { argb: "FFC9A227" } } });
  ws.columns = [{ width: 22 }, { width: 58 }, { width: 16 }, { width: 16 }];

  ws.mergeCells("A1:D1");
  ws.getCell("A1").value = "Zimson Service Management — AWS Hosting (Complete Summary)";
  ws.getCell("A1").font = titleFont;
  ws.getRow(1).height = 28;

  const meta = [
    ["Stores", `${STORES} retail/service locations`],
    ["Region", REGION],
    ["Pricing model", "On-demand (pay as you go)"],
    ["FX rate used", `₹${FX} per USD`],
    ["Quote date", new Date().toISOString().slice(0, 10)],
  ];
  meta.forEach((r, i) => {
    const row = ws.getRow(3 + i);
    row.getCell(1).value = r[0];
    row.getCell(1).font = { bold: true };
    row.getCell(2).value = r[1];
  });

  let r = 9;
  ws.getCell(`A${r}`).value = "Monthly cost (selected design)";
  ws.getCell(`A${r}`).font = { bold: true, size: 12 };
  r++;
  ws.getRow(r).values = ["", "Line item", "USD", "INR"];
  styleHeaderRow(ws.getRow(r));
  r++;
  LINE_ITEMS.forEach((item) => {
    const row = ws.getRow(r);
    row.getCell(2).value = item.label;
    row.getCell(3).value = item.usd;
    row.getCell(3).numFmt = '"$"#,##0';
    row.getCell(4).value = item.usd * FX;
    row.getCell(4).numFmt = '"₹"#,##0';
    r++;
  });
  const tot = ws.getRow(r);
  tot.getCell(2).value = "TOTAL per month";
  tot.getCell(2).font = { bold: true };
  tot.getCell(3).value = totalUsd;
  tot.getCell(3).numFmt = '"$"#,##0';
  tot.getCell(3).font = { bold: true };
  tot.getCell(4).value = totalUsd * FX;
  tot.getCell(4).numFmt = '"₹"#,##0';
  tot.getCell(4).font = { bold: true };
  tot.eachCell((c) => {
    c.fill = totalFill;
  });
  r += 2;

  ws.getCell(`A${r}`).value = "Package at a glance";
  ws.getCell(`A${r}`).font = { bold: true, size: 12 };
  r++;
  PACKAGE_SUMMARY.forEach(([k, v]) => {
    ws.getCell(`A${r}`).value = k;
    ws.getCell(`A${r}`).font = { bold: true };
    ws.getCell(`B${r}`).value = v;
    r++;
  });
  r++;

  ws.getCell(`A${r}`).value = "Sheet index (this workbook)";
  ws.getCell(`A${r}`).font = { bold: true };
  r++;
  const sheets = [
    "Summary — this page",
    "Monthly On-Demand — detailed quote with formulas",
    "Architecture — components and roles",
    "EC2 Sizing — instance comparison",
    "Design Comparison — old HA vs current",
    "Assumptions — scope and upgrade path",
    "Excluded Items — not in AWS bill",
    "Production Env — key environment variables",
    "Deploy Checklist — go-live steps",
    "Monitoring — thresholds and actions",
  ];
  sheets.forEach((s) => {
    ws.getCell(`A${r}`).value = s;
    r++;
  });
}

function addQuoteSheet(wb) {
  const ws = wb.addWorksheet("Monthly On-Demand", {
    views: [{ state: "frozen", ySplit: 10 }],
  });
  ws.columns = [{ width: 6 }, { width: 52 }, { width: 14 }, { width: 14 }, { width: 48 }];

  ws.mergeCells("A1:E1");
  ws.getCell("A1").value = "Zimson Service Management — AWS Monthly Quote (On-Demand)";
  ws.getCell("A1").font = titleFont;
  ws.getRow(1).height = 28;

  ws.mergeCells("A2:E2");
  ws.getCell("A2").value = `Scope: ${STORES} stores | ${REGION} | FX ₹${FX}/USD | 1× EC2 t4g.xlarge | RDS Single-AZ | No ALB`;
  ws.getCell("A2").font = { italic: true, size: 10 };

  ws.getCell("A4").value = "Package summary";
  ws.getCell("A4").font = { bold: true, size: 12 };
  PACKAGE_SUMMARY.forEach(([k, v], i) => {
    ws.getCell(`A${5 + i}`).value = k;
    ws.getCell(`A${5 + i}`).font = { bold: true };
    ws.getCell(`B${5 + i}`).value = v;
  });

  const hdrRow = 10;
  const hdr = ws.getRow(hdrRow);
  hdr.values = ["SL No", "Line item", "Monthly (USD)", "Monthly (INR)", "Notes"];
  styleHeaderRow(hdr);

  const dataStart = hdrRow + 1;
  LINE_ITEMS.forEach((item, i) => {
    const r = ws.getRow(dataStart + i);
    r.getCell(1).value = i + 1;
    r.getCell(2).value = item.label;
    r.getCell(3).value = item.usd;
    r.getCell(3).numFmt = '"$"#,##0';
    r.getCell(4).value = { formula: `C${dataStart + i}*${FX}` };
    r.getCell(4).numFmt = '"₹"#,##0';
    r.getCell(5).value = item.note;
  });

  const totalRowNum = dataStart + LINE_ITEMS.length;
  const totalRow = ws.getRow(totalRowNum);
  totalRow.getCell(2).value = "TOTAL (monthly estimate)";
  totalRow.getCell(2).font = { bold: true };
  totalRow.getCell(3).value = { formula: `SUM(C${dataStart}:C${totalRowNum - 1})` };
  totalRow.getCell(3).numFmt = '"$"#,##0';
  totalRow.getCell(3).font = { bold: true };
  totalRow.getCell(4).value = { formula: `SUM(D${dataStart}:D${totalRowNum - 1})` };
  totalRow.getCell(4).numFmt = '"₹"#,##0';
  totalRow.getCell(4).font = { bold: true };
  const totalUsd = LINE_ITEMS.reduce((s, x) => s + x.usd, 0);
  totalRow.getCell(5).value = `Rounded ~$${totalUsd} / ₹${totalUsd * FX}`;
  totalRow.eachCell((c) => {
    c.fill = totalFill;
  });

  let excl = totalRowNum + 2;
  ws.getCell(`A${excl}`).value = "Excluded from this quote";
  ws.getCell(`A${excl}`).font = { bold: true };
  excl++;
  EXCLUDED.forEach((t) => {
    ws.getCell(`A${excl}`).value = `• ${t}`;
    excl++;
  });
  excl++;
  ws.getCell(`A${excl}`).value = "S3 storage assumption";
  ws.getCell(`A${excl}`).font = { bold: true };
  ws.getCell(`A${excl + 1}`).value =
    "~1.4 GB new uploads/day across 75 stores; ~220 GB stored on average in year 1.";
  ws.getCell(`A${excl + 2}`).value =
    "Reserved Instances (1-year) can reduce EC2 + RDS cost ~25–35% (not applied here).";
}

function addAssumptionsSheet(wb) {
  const ws = wb.addWorksheet("Assumptions");
  ws.getColumn(1).width = 100;
  const lines = [
    "Zimson AWS Hosting — Assumptions",
    "",
    `Stores: ~${STORES} retail/service locations`,
    "Concurrent users (peak): ~95–180",
    `Region: ${REGION}`,
    "Application: Node.js + Express API, React SPA on same EC2 (Nginx reverse proxy)",
    "Database: Amazon RDS for PostgreSQL — NOT on EC2",
    "Files: Amazon S3 for SRF photos and Quick Bill document/image (recommended at go-live)",
    "",
    "EC2: 1 × t4g.xlarge (4 vCPU, 16 GB RAM) — selected for PDF generation and peak counter load",
    "RDS: db.t4g.large Single-AZ (2 vCPU, 8 GB) — one availability zone is sufficient",
    "No Application Load Balancer — DNS points to Elastic IP; HTTPS terminated on Nginx",
    "",
    "Single-server trade-off: brief downtime possible during app deploy or EC2 reboot",
    "Mitigation: deploy in low-traffic window; RDS backups; S3 versioning optional",
    "",
    "Upgrade path when needed:",
    "• Add second EC2 + ALB for high availability",
    "• RDS Multi-AZ for automatic database failover",
    "• CloudFront optional for static assets (not costed here)",
    "",
    "Pilot option (not this quote): 1 × t4g.medium + db.t4g.medium Single-AZ ≈ ₹11,000–13,500/month for 10–20 stores",
  ];
  lines.forEach((text, i) => {
    const cell = ws.getCell(`A${i + 1}`);
    cell.value = text;
    if (i === 0) cell.font = { bold: true, size: 12 };
  });
}

const wb = new ExcelJS.Workbook();
wb.creator = "Zimson Service Management";
wb.created = new Date();

const totalUsd = LINE_ITEMS.reduce((s, x) => s + x.usd, 0);

addSummarySheet(wb, totalUsd);
addQuoteSheet(wb);
addTableSheet(wb, "Architecture", ARCHITECTURE_ROWS, [14, 18, 36, 40]);
addTableSheet(wb, "EC2 Sizing", EC2_COMPARE, [14, 8, 10, 16, 16, 28]);
addTableSheet(wb, "Design Comparison", DESIGN_COMPARE, [18, 32, 36]);
addAssumptionsSheet(wb);
{
  const ws = wb.addWorksheet("Excluded Items");
  ws.getColumn(1).width = 72;
  ws.getCell("A1").value = "Excluded from AWS monthly estimate";
  ws.getCell("A1").font = { bold: true, size: 12 };
  EXCLUDED.forEach((t, i) => {
    ws.getCell(`A${i + 3}`).value = `• ${t}`;
  });
}
addTableSheet(wb, "Production Env", ENV_VARS, [28, 48, 12]);
addTableSheet(wb, "Deploy Checklist", DEPLOY_CHECKLIST, [8, 52, 14]);
addTableSheet(wb, "Monitoring", MONITORING, [18, 22, 40]);

await wb.xlsx.writeFile(OUT);
console.log(`Wrote ${OUT}`);
console.log(`Sheets: ${wb.worksheets.map((s) => s.name).join(", ")}`);
console.log(`Total: ~$${totalUsd} USD / ~₹${totalUsd * FX} INR per month`);
