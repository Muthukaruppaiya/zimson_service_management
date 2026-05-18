/**
 * Generates UAT1 user manual (.docx) — open in Microsoft Word.
 * Run: node scripts/generate-uat1-manual.mjs
 */
import fs from "fs";
import path from "path";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  PageBreak,
} from "docx";

const OUT = path.join(process.cwd(), "docs", "UAT1-Zimson-Service-Management-User-Manual.docx");

function h1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text, bold: true })] });
}
function h2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text, bold: true })] });
}
function h3(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text, bold: true })] });
}
function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, ...opts })],
  });
}
function bullet(text) {
  return new Paragraph({
    spacing: { after: 80 },
    bullet: { level: 0 },
    children: [new TextRun(text)],
  });
}
function numbered(text) {
  return new Paragraph({
    spacing: { after: 80 },
    numbering: { reference: "uat-num", level: 0 },
    children: [new TextRun(text)],
  });
}
function pb() {
  return new Paragraph({ children: [new PageBreak()] });
}

function roleTable() {
  const headers = ["Role", "Typical user", "Main modules"];
  const rows = [
    ["Super Admin", "IT / HQ", "All modules"],
    ["Admin (HO)", "Regional or national admin", "Service, SC, inventory, regions, users, settings"],
    ["HO Manager", "Head office manager", "Inventory, service centre, accounts, settings"],
    ["HO Accounts", "HO finance", "Inventory, service, accounts, settings"],
    ["HO Purchase", "Procurement", "Inventory (purchase)"],
    ["SC Clerk", "Service centre logistics", "Service centre — inward/outward DC"],
    ["SC Supervisor", "Service centre supervisor", "Assign technicians, inter-HO, stock view"],
    ["Store User / Manager", "Retail store staff", "SRF booking, dispatch, billing"],
    ["Store Accounts", "Store billing", "Service, accounts"],
    ["Technician", "Repair technician", "Technician workbench (via dashboard link)"],
  ];
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: headers.map(
          (t) =>
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: t, bold: true })] })],
            }),
        ),
      }),
      ...rows.map(
        (r) =>
          new TableRow({
            children: r.map(
              (t) =>
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun(t)] })],
                }),
            ),
          }),
      ),
    ],
  });
}

const children = [
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [
      new TextRun({ text: "ZIMSON SERVICE MANAGEMENT", bold: true, size: 32 }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 },
    children: [
      new TextRun({ text: "UAT 1 — User Manual", bold: true, size: 28 }),
      new TextRun({ text: "\n(Region setup through SRF lifecycle)", size: 24 }),
    ],
  }),
  p("Document version: UAT 1.0"),
  p("Prepared for: User Acceptance Testing"),
  p(`Generated: ${new Date().toLocaleDateString("en-IN", { dateStyle: "long" })}`),
  p("Application: Zimson Service Management (Wireframe build)"),
  pb(),

  h1("1. Purpose of this manual"),
  p(
    "This manual describes end-to-end procedures for UAT 1, in the order you should configure and test the system: from creating regions and stores, through users and inventory, to Service Request Form (SRF) booking, logistics, service-centre repair, and billing.",
  ),
  p("Use it together with the UAT test checklist in Section 12."),

  h1("2. Access and login"),
  h2("2.1 Application URL"),
  bullet("Internal app: open the URL provided by your project team (development: typically http://localhost:5173 with API on port 3001)."),
  bullet("Public (no login): Customer SRF tracking — /track ; Customer photo upload — /service/srf-capture (via QR from booking)."),
  h2("2.2 Login"),
  numbered("Open /login."),
  numbered("Enter employee code / username and password issued by Super Admin or Admin."),
  numbered("After login, the left sidebar shows only modules your role is allowed to access."),
  numbered("Regional Admin users see data scoped to their assigned region."),

  h1("3. User roles (summary)"),
  roleTable(),
  p("Note: Super Admin and Admin can override module access per user on the Users list → Edit → Custom modules."),

  pb(),
  h1("4. Master data setup (configure first)"),
  p("Complete these steps before store SRF testing. Order matters for numbering and GST on documents."),

  h2("4.1 Regions, stores and warehouses"),
  p("Menu: Settings → Regions & stores  |  Route: /regions"),
  p("Who: Super Admin, Admin."),
  h3("Create a region"),
  numbered("Click Add region (or equivalent)."),
  numbered("Enter Region / Office name (e.g. Chennai Regional Office)."),
  numbered("Enter Region code (e.g. CHN, CBE) — used in SRF and document numbering."),
  numbered("Optional: GST, PAN, email, phone."),
  numbered("Enter office address; PIN code can auto-fill city, district, state (India Post API)."),
  numbered("Save region."),
  h3("Add stores under a region"),
  numbered("Expand the region and add Store."),
  numbered("Store name, invoice display name, tagline, invoice address and phone."),
  numbered("Invoice number store code (e.g. CBE01) — used on store→HO transfer (DC) numbers."),
  numbered("Map store to region; save."),
  h3("Warehouses (if used)"),
  numbered("Add warehouse under region for HO stock locations where applicable."),
  p("UAT check: Each test store has a unique store code; region code matches expected SRF prefix."),

  h2("4.2 Brands (watch brands)"),
  p("Menu: Settings → Brand  |  Route: /inventory/brands"),
  numbered("Create brands used in SRF booking and spare catalog."),
  numbered("Ensure brands appear in SRF booking Step 2 (Watch)."),

  h2("4.3 Tax and billing settings"),
  p("Menu: Settings → Tax & billing  |  Route: /settings/tax"),
  numbered("Configure GST rates and billing rules as required for HO and store invoices."),

  h2("4.4 Document templates"),
  p("Menu: Settings → Document templates  |  Route: /settings/document-templates"),
  numbered("Review/update print templates for SRF, estimate, DC/ODC, assignment slip, etc."),

  h2("4.5 Accounts setup"),
  p("Menu: Accounts → Accounts setup  |  Route: /accounts/setup"),
  p("Who: roles with Accounts module."),
  numbered("Configure chart of accounts / billing account mapping per your deployment."),

  h2("4.6 Supplier master"),
  p("Menu: Master Data → Supplier Master / Add Supplier  |  Routes: /inventory/suppliers"),
  numbered("Create suppliers for purchase orders and GRN."),

  h2("4.7 Spare parts catalog"),
  p("Menu: Inventory → Spares  |  Route: /inventory/spares"),
  numbered("Add spare parts (code, name, brand, category)."),
  numbered("Optional: Bulk import via /inventory/bulk-import."),
  numbered("Fix prices: Inventory → Spare price fixing."),
  numbered("View stock: Inventory → Stock & prices (supervisor: view-only)."),

  h2("4.8 Technicians"),
  p("Menu: Master Data → Technician creation/list  |  Route: /service-centre/technicians-master"),
  p("Who: SC Supervisor, HO Manager."),
  numbered("Create technician profiles (name, grade, region)."),
  numbered("Link technician to user account when technician role login is required."),

  h2("4.9 User creation"),
  p("Menu: Master Data → Users creation  |  Route: /users"),
  p("Who: Super Admin, Admin only."),
  numbered("Create user: display name, email, employee code, password."),
  numbered("Select role (Store User, SC Clerk, SC Supervisor, etc.)."),
  numbered("Assign region and store(s) for store roles."),
  numbered("Optional: enable Custom modules on Users list → Edit to grant extra screens."),
  p("Menu: Users list  |  Route: /users/list — edit, deactivate, module overrides."),

  h2("4.10 Customer master"),
  p("Menu: Master Data → Customer master  |  Route: /service/customers/master"),
  numbered("Search and maintain customers created during SRF or billing."),

  pb(),
  h1("5. Store operations — SRF booking"),
  p("Primary menu: Service → SRF booking  |  Route: /service/srf"),

  h2("5.1 SRF booking wizard (5 steps)"),
  p("Steps: Customer → Watch → Photos → Estimate + OTP → Review."),
  h3("Step 1 — Customer"),
  numbered("Choose B2C or B2B."),
  numbered("Enter or search customer (phone); register new customer if needed (/service/srf/new-customer)."),
  numbered("Capture address; B2B: company, GST, PAN where required."),
  h3("Step 2 — Watch"),
  numbered("Select brand and model (from catalog or custom)."),
  numbered("Enter serial number and complaint."),
  numbered("Handover store defaults to login store (configurable)."),
  h3("Step 3 — Photos"),
  numbered("Capture watch photos in-store or send customer QR link for remote upload."),
  numbered("QR opens public page /service/srf-capture?token=…"),
  h3("Step 4 — Estimate + OTP"),
  numbered("Enter estimate amount, expected finish date, advance payment (cash denominations or other modes)."),
  numbered("Customer OTP verification (demo OTP in test environment)."),
  h3("Step 5 — Review"),
  numbered("Confirm and submit — system assigns SRF reference (e.g. SRF26CBE0101004)."),
  numbered("Print SRF document and estimate from success screen."),

  h2("5.2 After booking — store status"),
  bullet("SRF status: at_store — watch remains at store until dispatched to HO."),
  bullet("SRF history: Service → SRF history (/service/srf-register)."),
  bullet("SRF master table: Service → SRF master table (/service/srf-master)."),

  h2("5.3 Quick bill (optional)"),
  p("Service → Quick bill — fast counter sale without full SRF repair flow."),
  p("Quick bill history: /service/quick-bill-history."),

  h2("5.4 Store dispatch (Store → HO)"),
  p("Menu: Logistics → Store dispatch  |  Route: /service/store-dispatch"),
  numbered("Outward: select SRFs in status at_store; create dispatch to service centre."),
  numbered("System generates internal transfer number (DC) using store invoice code."),
  numbered("Acknowledgment popup: Print transfer copy / Done."),
  numbered("Inward (return): scan DC when HO sends watch back; confirm received at store."),

  h2("5.5 Store billing"),
  p("Service → Store billing — close/bill customer when repair returned."),
  p("Store billing history: /service/store-billing-master."),

  h2("5.6 Customer portal (no login)"),
  bullet("Tracking: /track — customer enters SRF reference or phone."),
  bullet("Shows status timeline; inter-HO may show root reference for archived chains."),

  pb(),
  h1("6. Service centre operations"),

  h2("6.1 Logistics — inward and outward"),
  p("Menu: Logistics → Internal inward / Internal outward  |  Route: /service-centre/logistics"),
  p("Who: SC Clerk."),
  h3("Inward (Store → HO)"),
  numbered("Tab: Inward — scan or enter DC number from store dispatch."),
  numbered("Confirm receipt — SRF moves to received_at_sc at HO."),
  h3("Outward (HO → Store)"),
  numbered("Tab: Outward — dispatch repaired SRFs back to store (ODC/DC per rules)."),
  numbered("Inter-HO transfers use DC series; labels shown as DC number or ODC number as applicable."),
  p("History: Logistics → DC / ODC history (/service-centre/logistics-history)."),

  h2("6.2 Supervisor — assign technicians"),
  p("Menu: Supervision → Assigning  |  Routes: /service-centre/supervisor and /service-centre/supervisor/srf/:id"),
  p("Who: SC Supervisor, HO Manager."),
  h3("Supervisor SRF list"),
  numbered("Scan SRF barcode/reference and press Enter to open detail."),
  numbered("List shows active SRFs only — archived (-ARCH-) rows hidden."),
  numbered("Inter-HO: shows Sender/root reference and Local repair SRF label when applicable."),
  numbered("Actions: Details | Convert to local SRF | Open local SRF | Open SRF."),
  h3("Convert to local SRF (inter-HO repair HO)"),
  numbered("When inbound inter-HO SRF has requires local conversion, click Convert to local SRF."),
  numbered("System archives source row (reference gets -ARCH- suffix) and creates new local SRF at repair HO."),
  numbered("Success popup: Open local SRF — navigates to new reference for assignment."),
  p("Parallel tracking: Sender/root booking ref tracks return journey; local SRF is where repair work happens."),
  h3("Assignment"),
  numbered("Select technician and Assign — acknowledgment with print assignment slip."),
  h3("Supervisor decision queue"),
  numbered("Mark repaired, request re-estimate, transfer to other HO, send to brand, etc."),
  h3("Transferred to other HO"),
  numbered("Sender HO sees watches at repair HO; Open local SRF when repair HO already converted."),
  numbered("Opening archived URL auto-redirects to live local SRF when found."),

  h2("6.3 Technician workbench"),
  p("Route: /service-centre/technician"),
  numbered("Technician sees assigned SRFs only."),
  numbered("Update repair progress per workflow (estimate, spares, completion)."),

  h2("6.4 Inter-HO repair invoice"),
  p("From supervisor or billing: /service-centre/inter-ho-invoice?srfId=…"),
  numbered("Repair HO bills sender HO before return dispatch when status ready_for_outward."),

  h2("6.5 HO billing"),
  p("Service → HO billing (/service/billing) — create service invoices as per role access."),

  h2("6.6 Online store (inter-HO orders)"),
  p("Menu: Online Store → Inter-HO online orders  |  Route: /service-centre/online-store"),
  p("Who: SC Supervisor, HO Manager."),

  pb(),
  h1("7. Inventory and procurement (supporting SRF)"),
  h2("7.1 Purchase request (PR)"),
  p("Inventory → New PR; PR History."),
  h2("7.2 Purchase order (PO)"),
  p("Inventory → New PO; PO History."),
  h2("7.3 GRN (inward stock)"),
  p("Inventory → Post GRN; GRN History."),
  h2("7.4 Stock adjustment and store stock"),
  p("Stock adjustment; Store stock screens for HO/store quantities."),
  p("Spares used on repair are deducted from HO stock when supervisor completes repair with spares slip."),

  pb(),
  h1("8. SRF status lifecycle (reference)"),
  p("Typical happy path:"),
  bullet("draft / photo_pending → at_store → in_transit_sc → received_at_sc → assigned → estimate_ok → ready_for_outward → dispatched_to_store → received_at_store → closed"),
  p("Inter-HO branch:"),
  bullet("sent_to_other_ho (sender) → received_at_sc + requires local conversion (repair HO) → convert to local → new local received_at_sc → … repair … → return dispatch"),
  p("Brand repair branch:"),
  bullet("sent_to_brand → brand_estimate_pending → brand_approved → brand_repair_in_progress → received_from_brand → …"),
  p("Exception statuses: reestimate_required, customer_rejected, cancelled."),

  h1("9. Document and numbering reference"),
  bullet("SRF reference: region-scoped series (e.g. SRF26CHN001001)."),
  bullet("Store → HO dispatch: DC with store invoice code (e.g. CBE01), labelled Internal transfer number in UI."),
  bullet("HO → Store return: ODC or DC per logistics rules."),
  bullet("Inter-HO HO → HO: DC series with region code."),
  bullet("Archived internal rows: reference suffix -ARCH-{id} — not customer-facing."),

  h1("10. Screens and routes quick reference"),
  bullet("Regions: /regions"),
  bullet("Users: /users, /users/list"),
  bullet("SRF booking: /service/srf"),
  bullet("SRF register: /service/srf-register"),
  bullet("Store dispatch: /service/store-dispatch"),
  bullet("SC logistics: /service-centre/logistics"),
  bullet("SC supervisor: /service-centre/supervisor"),
  bullet("Technician: /service-centre/technician"),
  bullet("Customer track: /track"),
  bullet("Photo capture: /service/srf-capture"),

  pb(),
  h1("11. UAT 1 — recommended test sequence"),
  numbered("Create region CHN + store CHN01; region CBE + store CBE01 (Super Admin)."),
  numbered("Create brands, spares with prices, two technicians, users (store, clerk, supervisor)."),
  numbered("Store user: complete SRF booking with photos and advance."),
  numbered("Store dispatch outward DC to HO; SC clerk inward at CHN HO."),
  numbered("Supervisor: convert inter-HO SRF if applicable; assign technician; complete repair with spares."),
  numbered("SC outward to store; store inward; store billing close."),
  numbered("Customer /track shows updated status."),
  numbered("Optional: transfer to other HO (CBE→CHN), convert local, repair HO invoice, return dispatch."),
  numbered("Verify SRF list hides ARCH duplicates; Open local SRF works from list and popup."),

  h1("12. UAT sign-off checklist"),
  p("Tester name: _________________________   Role: _________________________   Date: __________"),
  p("Region / store setup complete and correct codes used:  ☐ Pass  ☐ Fail  Notes: __________"),
  p("Users created with correct role and scope:  ☐ Pass  ☐ Fail"),
  p("SRF booking end-to-end with print:  ☐ Pass  ☐ Fail"),
  p("Store dispatch + SC inward:  ☐ Pass  ☐ Fail"),
  p("Supervisor assign + repair complete:  ☐ Pass  ☐ Fail"),
  p("Return to store + store billing:  ☐ Pass  ☐ Fail"),
  p("Inter-HO convert + local SRF (if in scope):  ☐ Pass  ☐ Fail  ☐ N/A"),
  p("Customer tracking page:  ☐ Pass  ☐ Fail"),
  p("Inventory spare deduction on repair:  ☐ Pass  ☐ Fail  ☐ N/A"),

  h1("13. Support and defects"),
  p("Log UAT defects with: steps to reproduce, user role, SRF reference, screenshot, expected vs actual."),
  p("For inter-HO issues, note both Sender/root reference and Local repair SRF reference."),

  p("— End of UAT 1 User Manual —"),
];

const doc = new Document({
  numbering: {
    config: [
      {
        reference: "uat-num",
        levels: [
          {
            level: 0,
            format: "decimal",
            text: "%1.",
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          },
        ],
      },
    ],
  },
  sections: [{ properties: {}, children }],
});

fs.mkdirSync(path.dirname(OUT), { recursive: true });
const buffer = await Packer.toBuffer(doc);
fs.writeFileSync(OUT, buffer);
console.log("Written:", OUT);
