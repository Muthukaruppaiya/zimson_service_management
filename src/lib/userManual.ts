import type { ModuleKey, UserRole } from "../types/user";

/** `**text**` inside steps / notes renders bold (button and menu names). */
export type ManualTopic = {
  id: string;
  title: string;
  /** Hidden when the signed-in user cannot open this module. `null` = always shown. */
  module: ModuleKey | null;
  menu: string;
  /** In-app route for the "Open" button. */
  path?: string;
  steps: string[];
  notes?: string[];
};

export type ManualGroup = { title: string; topics: string[] };

export type RoleManual = {
  role: UserRole;
  label: string;
  summary: string;
  groups: ManualGroup[];
};

export const MANUAL_TOPICS: Record<string, ManualTopic> = {
  // ── Common ──
  login: {
    id: "login",
    title: "Login and dashboard",
    module: null,
    menu: "Login page → **Dashboard**",
    path: "/",
    steps: [
      "Enter **Email / Employee code** and **Password** → **Sign in**.",
      "If asked, select your **Store / HO**.",
      "Dashboard shows your **action queue** — click a card to open that work.",
      "Use **Quick find** (top bar) to search SRF / invoice / customer.",
      "Forgot password → **Forgot password?** on login page → reset link by email.",
    ],
  },

  // ── Store: service ──
  quickBill: {
    id: "quickBill",
    title: "Quick Bill",
    module: "service",
    menu: "Service → **Quick bill** → **New quick bill**",
    path: "/service/quick-bill",
    steps: [
      "Select **B2C / B2B**.",
      "Enter customer **mobile number** (new customer → register + OTP).",
      "Select **Brand → Family → Model**, enter **Serial number**.",
      "Select **Nature of repair**.",
      "Add spares (**Add by scan** / pick), service charge, or **Add charge line**.",
      "B2C: select **Customer state** (GST auto).",
      "Select **Payment methods** → enter amounts.",
      "Click **Send OTP to primary (mobile / email)** → enter customer OTP.",
      "Bill saves → **Print invoice**.",
    ],
    notes: ["Cash per bill below **₹2,00,000**.", "Old bills: **Quick bill history** tab."],
  },
  srfBook: {
    id: "srfBook",
    title: "SRF booking",
    module: "service",
    menu: "Service → **SRF** → **Book SRF**",
    path: "/service/srf",
    steps: [
      "**Customer:** select B2C / B2B → mobile → email + address → verify OTP if unverified → **Next**.",
      "**Watch:** Brand → Family → Model → **Serial number** → **Nature of repair** → remarks.",
      "Select **Repair routing**: **Send to CSC** or **Repair at in-store** → **Generate QR**.",
      "**Photos:** scan QR → upload minimum **4 photos** → **Refresh status** → **Next**.",
      "**Estimate:** complaint, package (optional), **Estimate amount**, **Advance**, delivery date, condition, suggested repairs.",
      "Click **Send OTP** → enter customer OTP → **Verify and proceed**.",
      "Click **Create SRF** → **Print SRF document** (+ payment receipt if advance).",
    ],
    notes: ["Advance cannot be more than estimate."],
  },
  srfHistory: {
    id: "srfHistory",
    title: "SRF history / reprint",
    module: "service",
    menu: "Service → **SRF** → **SRF history** / **SRF master**",
    path: "/service/srf-register",
    steps: [
      "Search by **SRF no. / mobile / serial**.",
      "Open SRF → **Trace** to see full movement.",
      "Reprint SRF / receipt, or resend tracking / approval WhatsApp.",
    ],
  },
  storeAssign: {
    id: "storeAssign",
    title: "Store assign (in-store repair + approvals)",
    module: "service",
    menu: "Service → **Store assign**",
    path: "/service/store-assign",
    steps: [
      "**Pending assign** → select **Technician** → **Assign repair**.",
      "After repair → record spares → **Send to billing**.",
      "Re-estimate needed → enter amount → **Send to customer**.",
      "Customer wants HO repair → **Send to dispatch**.",
    ],
  },
  storeDispatch: {
    id: "storeDispatch",
    title: "Store outward to HO (create TD)",
    module: "service",
    menu: "Logistics → **Store dispatch** → **Outward SRF**",
    path: "/service/store-dispatch",
    steps: [
      "Tick SRFs (or **Scan SRF barcode**).",
      "Click **Create internal transfer & mark in transit**.",
      "Click **Print transfer copy** → **Done**.",
      "Next: hand over to delivery agent (**Store delivery**).",
    ],
  },
  storeDeliverySend: {
    id: "storeDeliverySend",
    title: "Hand over to delivery agent (Store → HO)",
    module: "service",
    menu: "Logistics → **Store delivery** → **Handoff** → **Send to centralized service centre (CSC)**",
    path: "/service/delivery-handoff",
    steps: [
      "**Step 1** — select **Delivery agent**.",
      "**Step 2** — check transfers (TD no.) loaded automatically.",
      "**Step 3** — click **Send OTP** (to agent's mobile).",
      "Enter OTP told by agent → verify.",
      "Give watches + TD copy to agent.",
    ],
  },
  storeDeliveryReceive: {
    id: "storeDeliveryReceive",
    title: "Receive from delivery agent (HO → Store)",
    module: "service",
    menu: "Logistics → **Store delivery** → **Handoff** → **Receive at Store**",
    path: "/service/delivery-handoff",
    steps: [
      "Select **Delivery agent**.",
      "Check transfers carried.",
      "Click **Send OTP** → enter agent's OTP → verify.",
      "Next: **Store dispatch → Inward SRF**.",
    ],
  },
  storeInward: {
    id: "storeInward",
    title: "Store inward + QC",
    module: "service",
    menu: "Logistics → **Store dispatch** → **Inward SRF**",
    path: "/service/store-dispatch?tab=inward",
    steps: [
      "Select transfer (or **Scan TD/DC barcode**).",
      "Click **Review watches & inward**.",
      "Tick only watches that **pass QC** → **Inward selected**.",
      "QC failed → **Send back to HO for re-repair** or **Keep in inward pending**.",
      "Click **Print inward receipt**.",
    ],
  },
  storeBilling: {
    id: "storeBilling",
    title: "Store final billing + handover",
    module: "service",
    menu: "Billing → **Store billing**",
    path: "/service/store-billing",
    steps: [
      "Search / **Scan SRF barcode** → **Select & continue**.",
      "Optional: handover photo (**Generate upload link**).",
      "Select **B2C / B2B** and **Service warranty**.",
      "Check **Service lines** (**Add line item** if needed) — advance deducted automatically.",
      "Enter **Payment** (split if needed).",
      "Click **Send OTP to primary (mobile / email)** → enter customer OTP.",
      "**Print invoice** → hand over watch → **Done — next SRF**.",
    ],
    notes: [
      "Returned without repair: if advance paid → **Create store credit** → OTP → hand over.",
      "Reprint: **Store billing history** → **Print invoice**.",
    ],
  },
  storeBrandCredit: {
    id: "storeBrandCredit",
    title: "Brand credit notes (store)",
    module: "service",
    menu: "Service → **Brand credit notes**",
    path: "/service/brand-credit-notes",
    steps: ["Select brand + SRF.", "Enter credit details → save.", "Print / download credit note."],
  },
  customerMaster: {
    id: "customerMaster",
    title: "Customer master",
    module: "service",
    menu: "Master Data → **Customer master**",
    path: "/service/customers/master",
    steps: [
      "**All customers** — search, view, edit (**Save changes**).",
      "**Create customer** — fill details → verify OTP.",
      "**Bulk import** — download template → fill → upload → import.",
    ],
  },
  watchInventory: {
    id: "watchInventory",
    title: "Watch inventory",
    module: "service",
    menu: "Inventory → **Watch inventory**",
    path: "/service/watch-inventory",
    steps: ["See all watches currently at your store / HO.", "Filter by status / brand → open SRF."],
  },
  storeStock: {
    id: "storeStock",
    title: "Store stock (spares)",
    module: "inventory",
    menu: "Inventory → **Store stock** / **Stock & prices**",
    path: "/inventory/stock-prices",
    steps: ["Search spare by name / code / EAN.", "Check quantity and selling price."],
  },
  stockAdjust: {
    id: "stockAdjust",
    title: "Stock adjustment",
    module: "inventory",
    menu: "Inventory → **Stock & prices** → **Stock adjustment**",
    path: "/inventory/stock-adjustment",
    steps: ["Select location and spare.", "Enter new quantity + reason.", "Click **Save stock**."],
  },
  storeReports: {
    id: "storeReports",
    title: "Service reports",
    module: "reports",
    menu: "Reports → **Watch status** / **Stock** / **Technician**",
    path: "/reports/watch-not-returned",
    steps: [
      "**Watch status** — Not returned, Aging, Unassigned, Pending.",
      "**Stock** — Stock in hand, Transfer.",
      "**Technician** — Assigned watches, Repaired history.",
      "Select dates / filters → export or print.",
    ],
  },

  // ── HO clerk (front desk) ──
  hoDeliveryReceive: {
    id: "hoDeliveryReceive",
    title: "Receive from delivery agent (Store → HO)",
    module: "service_centre",
    menu: "Logistics → **HO delivery** → **Handoff** → **Receive at HO**",
    path: "/service-centre/delivery-handoff",
    steps: [
      "Select **Delivery agent**.",
      "Check transfers carried by agent.",
      "Click **Send OTP** → enter agent's OTP → verify.",
      "Status → **Waiting for HO inward**.",
    ],
  },
  hoInward: {
    id: "hoInward",
    title: "HO inward",
    module: "service_centre",
    menu: "Logistics → **HO inward / outward** → **Internal inward (Store to HO)**",
    path: "/service-centre/logistics",
    steps: [
      "Select transfer (or **Scan DC barcode**).",
      "Click **Review watches & inward**.",
      "Untick any watch not received properly.",
      "Click **Inward selected** → **Print inward receipt**.",
    ],
  },
  hoOutward: {
    id: "hoOutward",
    title: "HO outward to store (create TD)",
    module: "service_centre",
    menu: "Logistics → **HO inward / outward** → **Internal outward (HO to Store)** → **Create internal outward**",
    path: "/service-centre/logistics",
    steps: [
      "Tick repaired SRFs (or **Scan SRF barcode**).",
      "Click **Generate internal outward & dispatch**.",
      "**Print TD copy** (+ **Create e-way bill** if shown).",
    ],
  },
  hoSendBrand: {
    id: "hoSendBrand",
    title: "Send watch to brand",
    module: "service_centre",
    menu: "Logistics → **HO inward / outward** → **Send to brand**",
    path: "/service-centre/logistics",
    steps: [
      "Select SRFs approved for brand.",
      "Enter **Dispatch reference / AWB** and **Dispatch remark**.",
      "Dispatch → print documents.",
    ],
  },
  hoDeliverySend: {
    id: "hoDeliverySend",
    title: "Hand over to delivery agent (HO → Store)",
    module: "service_centre",
    menu: "Logistics → **HO delivery** → **Handoff** → **Send to Store**",
    path: "/service-centre/delivery-handoff",
    steps: [
      "Select **Delivery agent**.",
      "Check pending transfers.",
      "Click **Send OTP** → enter agent's OTP → verify.",
      "Give watches + TD copy to agent.",
    ],
  },
  hoLogisticsHistory: {
    id: "hoLogisticsHistory",
    title: "Inward / outward and agent history",
    module: "service_centre",
    menu: "Logistics → **HO inward / outward** → **DC / ODC history** · **HO delivery** → **Agent history**",
    path: "/service-centre/logistics-history",
    steps: ["Search by DC / TD no. or date.", "Reprint DC / TD / inward receipt."],
  },

  // ── Supervisor ──
  scAssign: {
    id: "scAssign",
    title: "Assign technician",
    module: "service_centre",
    menu: "Supervision → **Assigning** → **Assign**",
    path: "/service-centre/supervisor",
    steps: [
      "Open SRF marked **Awaiting technician**.",
      "Select **Technician** → **Assign**.",
      "Click **Print technician sheet**.",
    ],
  },
  scActions: {
    id: "scActions",
    title: "Supervisor decisions",
    module: "service_centre",
    menu: "Supervision → **Assigning** → open SRF",
    path: "/service-centre/supervisor",
    steps: [
      "**Mark repaired** — add used spares → save → goes to outward.",
      "**Need re-estimate** — enter new amount → **Send to customer**.",
      "**Proceed** — after customer accepts re-estimate.",
      "**Approve & send to brand** → later **Mark received from brand**.",
      "**Cannot repair — return to store** — select reason → confirm.",
      "**Send to outward** — move finished SRF to HO outward.",
    ],
  },
  scReestimate: {
    id: "scReestimate",
    title: "Re-estimate approvals",
    module: "service_centre",
    menu: "Supervision → **Assigning** → **Re-estimate approvals**",
    path: "/service-centre/supervisor/reestimate-sender",
    steps: ["Check pending re-estimates.", "Resend to customer or follow up.", "Approved → **Proceed** on SRF."],
  },
  scCreditNotes: {
    id: "scCreditNotes",
    title: "HO credit notes",
    module: "service_centre",
    menu: "Supervision → **HO credit notes**",
    path: "/service-centre/brand-credit-notes",
    steps: ["Select brand + SRF.", "Enter credit details → save.", "Print credit note."],
  },
  scSrfHistory: {
    id: "scSrfHistory",
    title: "SRF history (HO)",
    module: "service_centre",
    menu: "Supervision → **SRF history**",
    path: "/service-centre/srf-history",
    steps: ["Search SRF.", "Open → view repair timeline, spares, technician."],
  },
  technicianMaster: {
    id: "technicianMaster",
    title: "Technician master",
    module: "service_centre",
    menu: "Master Data → **Technician master**",
    path: "/service-centre/technicians-master",
    steps: ["Click **Create technician** → name, code, mobile → save.", "Edit / deactivate from list."],
  },
  onlineStore: {
    id: "onlineStore",
    title: "Inter-HO online orders",
    module: "service_centre",
    menu: "Online Store → **Inter-HO online orders**",
    path: "/service-centre/online-store",
    steps: [
      "Open order → **Create invoice**.",
      "**Create e-way bill** if needed → **Mark outward dispatch**.",
      "Receiving HO → **Mark inward receive**.",
    ],
  },

  // ── Technician ──
  techWorkbench: {
    id: "techWorkbench",
    title: "Technician workbench",
    module: null,
    menu: "Dashboard → **My Workbench**",
    path: "/",
    steps: [
      "Open assigned SRF.",
      "Click **Estimate OK — proceed with repair** (or **Need re-estimate**).",
      "Enter spares used (e.g. **Glass - 1**) → **Submit spares slip**.",
      "Click **Repair done — send to outward queue**.",
    ],
  },

  // ── Delivery agent ──
  deliveryAgent: {
    id: "deliveryAgent",
    title: "Delivery agent handoff",
    module: null,
    menu: "No app login needed — OTP comes to your registered mobile / email",
    steps: [
      "**Pickup at store:** staff selects you → you receive **OTP** → tell OTP to staff.",
      "Collect watches + TD copy.",
      "**Drop at HO:** HO clerk selects you → you receive **OTP** → tell OTP to clerk.",
      "**Pickup at HO:** clerk selects you → OTP → collect watches + TD copy.",
      "**Drop at store:** store staff selects you → OTP → hand over.",
    ],
    notes: ["Share OTP only with Zimson staff at handover.", "Mobile number must be updated in User master."],
  },

  // ── Purchase / inventory ──
  spares: {
    id: "spares",
    title: "Spares master",
    module: "inventory",
    menu: "Inventory → **Spares**",
    path: "/inventory/spares",
    steps: [
      "**All spares** → **Add spare** → code, name, brand, HSN, EAN, price → **Save spare**.",
      "Set price → **Save price**.",
      "**Bulk import** → template → upload → validate → import.",
      "**HSN master** — add / edit HSN + GST rate.",
    ],
  },
  servicePackages: {
    id: "servicePackages",
    title: "Service packages",
    module: "inventory",
    menu: "Inventory → **Service packages**",
    path: "/inventory/service-packages",
    steps: [
      "**Create package** → name, type, price.",
      "**Add spare** lines → save.",
      "**Package types** — add new type.",
    ],
  },
  stockPrices: {
    id: "stockPrices",
    title: "Stock & prices",
    module: "inventory",
    menu: "Inventory → **Stock & prices**",
    path: "/inventory/stock-prices",
    steps: ["Filter by location / brand.", "Check stock and price per spare.", "Export if needed."],
  },
  suppliers: {
    id: "suppliers",
    title: "Supplier master",
    module: "inventory",
    menu: "Master Data → **Supplier master**",
    path: "/inventory/suppliers",
    steps: [
      "**Create supplier** → GSTIN (auto-fill) → contact, address → save.",
      "Same GSTIN, another location → open supplier → **add branch**.",
      "**Bulk import** → template → upload → import.",
    ],
  },
  brands: {
    id: "brands",
    title: "Brand master",
    module: "inventory",
    menu: "Master Data → **Brand master**",
    path: "/inventory/brands",
    steps: ["**All brands** → add / edit → **Save brand**.", "**Bulk import** → template → upload."],
  },
  purchaseOrder: {
    id: "purchaseOrder",
    title: "Purchase order",
    module: "inventory",
    menu: "Purchase → **Purchase orders** → **Create PO**",
    path: "/inventory/purchase-orders",
    steps: [
      "Select **Supplier** (+ **Branch** if multiple).",
      "Add spares, quantity, rate.",
      "Click **Create PO** → print / send.",
      "History: **PO history** tab.",
    ],
  },
  voucher: {
    id: "voucher",
    title: "Purchase voucher (without PO)",
    module: "inventory",
    menu: "Purchase → **Vouchers** → **Create voucher**",
    path: "/inventory/vouchers",
    steps: ["Select supplier + branch.", "Add spares, qty, rate, invoice no.", "Click **Create voucher**.", "Then **Post GRN** from **Voucher history**."],
  },
  grn: {
    id: "grn",
    title: "GRN (goods received)",
    module: "inventory",
    menu: "Purchase → **GRN** → **Create GRN**",
    path: "/inventory/po-inward",
    steps: [
      "Select PO / voucher (or standalone → supplier + branch).",
      "Enter received quantity, supplier invoice no. + date.",
      "Click **Post GRN** → print.",
    ],
  },
  grnReturn: {
    id: "grnReturn",
    title: "GRN return (purchase return)",
    module: "inventory",
    menu: "Purchase → **GRN returns** → **Create GRN return**",
    path: "/inventory/purchase-return",
    steps: ["Select GRN / supplier.", "Enter return qty + reason.", "Click **Post Spare Return** → print."],
  },
  transfer: {
    id: "transfer",
    title: "Spare transfer HO → Store",
    module: "inventory",
    menu: "Purchase → **Transfers** → **Create transfer**",
    path: "/inventory/ho-transfer",
    steps: ["Select store.", "Add spares + quantity.", "Click **Transfer to store** → print.", "History: **Transfer history** tab."],
  },

  // ── Accounts ──
  invoices: {
    id: "invoices",
    title: "Invoices & payments",
    module: "accounts",
    menu: "Accounts → **Invoices & payments**",
    path: "/accounts/invoice-history",
    steps: [
      "**Invoice history** — search / filter → preview / print / resend.",
      "Open invoice → **Record payment** for balance.",
      "**Payment ledger** — all receipts by date / mode.",
    ],
  },
  creditNotes: {
    id: "creditNotes",
    title: "Credit notes",
    module: "accounts",
    menu: "Accounts → **Credit notes**",
    path: "/accounts/brand-credit-history",
    steps: ["**Credit note history** — search / print.", "**Brand credit notes** — create new brand credit note."],
  },
  accountsSetup: {
    id: "accountsSetup",
    title: "Accounts setup",
    module: "accounts",
    menu: "Accounts → **Accounts setup**",
    path: "/accounts/setup",
    steps: ["Set ledgers / payment modes.", "Click **Save accounts setup**."],
  },
  salesReports: {
    id: "salesReports",
    title: "Sales & GST reports",
    module: "accounts",
    menu: "Reports → **Sales & GST**",
    path: "/accounts/reports/revenue",
    steps: [
      "Tabs: **Revenue**, **Summary sale**, **HSN purchase**, **SR returned**.",
      "Select date range / store → view → export.",
    ],
  },
  hoBilling: {
    id: "hoBilling",
    title: "HO billing",
    module: "service",
    menu: "Billing → **HO billing**",
    path: "/service/billing",
    steps: ["Select customer / SRF.", "Add lines (**Add line**).", "Click **Record bill** → print invoice."],
  },
  analytics: {
    id: "analytics",
    title: "BI dashboard",
    module: "analytics",
    menu: "Analytics → **BI dashboard** / **Service outcomes** / **Brand credit history**",
    path: "/analytics",
    steps: ["Select date preset / store.", "Click chart to drill down.", "Export table if needed."],
  },

  // ── Admin ──
  users: {
    id: "users",
    title: "User master",
    module: "users",
    menu: "Master Data → **User master**",
    path: "/users/list",
    steps: [
      "**Create user** → name, email, mobile, **Role**, region / store.",
      "Optional: customise **module access**.",
      "**All users** → edit → **Save Changes** / disable login.",
      "Delivery agent: role **Delivery Agent** + mobile + email.",
    ],
  },
  regions: {
    id: "regions",
    title: "Regions & stores",
    module: "regions",
    menu: "Settings → **Regions & stores**",
    path: "/regions",
    steps: ["Add / edit region (HO).", "**Add Store** / **Add Warehouse** under region.", "Set address, GSTIN, codes → save."],
  },
  settingsTax: {
    id: "settingsTax",
    title: "Tax & e-invoice",
    module: "settings",
    menu: "Settings → **Tax & e-invoice**",
    path: "/settings/tax",
    steps: [
      "**Tax & billing** — GST / billing defaults → **Save settings**.",
      "**E-invoice & e-way** — portal credentials.",
      "**Brand consignees** — brand e-way addresses.",
    ],
  },
  settingsIntegrations: {
    id: "settingsIntegrations",
    title: "Integrations",
    module: "settings",
    menu: "Settings → **Integrations**",
    path: "/settings/messaging",
    steps: ["**SMS, email & WhatsApp** — provider keys → save.", "**Razorpay** — keys → **Save Razorpay settings**."],
  },
  customization: {
    id: "customization",
    title: "Customization",
    module: "settings",
    menu: "Settings → **Customization**",
    path: "/settings/document-templates",
    steps: [
      "**Document templates** — logo (**Upload logo from local**) → **Save branding** / **Save all template changes**.",
      "**Custom fields** — **+ Add field** for forms.",
    ],
  },
  activeSessions: {
    id: "activeSessions",
    title: "Logged-in users",
    module: "settings",
    menu: "Settings → **Logged-in users**",
    path: "/settings/active-sessions",
    steps: ["See who is logged in.", "Force logout a session if needed."],
  },
};

const STORE_SRF_FLOW: ManualGroup = {
  title: "SRF flow — store side",
  topics: ["srfBook", "storeAssign", "storeDispatch", "storeDeliverySend", "storeDeliveryReceive", "storeInward", "storeBilling", "srfHistory"],
};

const HO_LOGISTICS: ManualGroup = {
  title: "Watch logistics — HO",
  topics: ["hoDeliveryReceive", "hoInward", "hoOutward", "hoSendBrand", "hoDeliverySend", "hoLogisticsHistory"],
};

const SUPERVISION: ManualGroup = {
  title: "Supervision",
  topics: ["scAssign", "scActions", "scReestimate", "scCreditNotes", "scSrfHistory", "technicianMaster", "onlineStore"],
};

const PURCHASE: ManualGroup = {
  title: "Purchase",
  topics: ["purchaseOrder", "voucher", "grn", "grnReturn", "transfer"],
};

export const ROLE_MANUALS: RoleManual[] = [
  {
    role: "store_user",
    label: "Store User",
    summary: "Quick bill, SRF booking, dispatch to HO, delivery agent handoff, store billing.",
    groups: [
      { title: "Start", topics: ["login"] },
      { title: "Daily billing", topics: ["quickBill"] },
      STORE_SRF_FLOW,
      { title: "Other", topics: ["storeBrandCredit", "customerMaster", "watchInventory", "storeStock", "storeReports"] },
    ],
  },
  {
    role: "store_manager",
    label: "Store Manager",
    summary: "All store user work plus stock adjustment and store reports.",
    groups: [
      { title: "Start", topics: ["login"] },
      { title: "Daily billing", topics: ["quickBill"] },
      STORE_SRF_FLOW,
      { title: "Stock", topics: ["storeStock", "stockAdjust"] },
      { title: "Other", topics: ["storeBrandCredit", "customerMaster", "watchInventory", "storeReports"] },
    ],
  },
  {
    role: "store_accounts",
    label: "Store Accounts",
    summary: "Store billing, invoices, payments and reports.",
    groups: [
      { title: "Start", topics: ["login"] },
      { title: "Billing", topics: ["quickBill", "storeBilling", "srfHistory", "storeBrandCredit"] },
      { title: "Accounts", topics: ["invoices", "creditNotes", "accountsSetup", "salesReports"] },
      { title: "Other", topics: ["customerMaster", "storeReports", "customization"] },
    ],
  },
  {
    role: "service_centre_clerk",
    label: "Service Centre Clerk (Front Desk)",
    summary: "HO front desk: receive from delivery agent, inward, outward, send back to store.",
    groups: [{ title: "Start", topics: ["login"] }, HO_LOGISTICS],
  },
  {
    role: "service_centre_supervisor",
    label: "Service Centre Supervisor",
    summary: "Assign technicians, repair decisions, re-estimates, brand / credit notes.",
    groups: [
      { title: "Start", topics: ["login"] },
      SUPERVISION,
      { title: "Stock & reports", topics: ["stockPrices", "storeReports", "invoices"] },
    ],
  },
  {
    role: "technician",
    label: "Technician",
    summary: "Repair assigned watches and record spares.",
    groups: [{ title: "Work", topics: ["login", "techWorkbench"] }],
  },
  {
    role: "delivery_boy",
    label: "Delivery Agent",
    summary: "Carries watches Store ↔ HO. Confirms each handover with OTP.",
    groups: [{ title: "Handoff", topics: ["deliveryAgent"] }],
  },
  {
    role: "ho_manager",
    label: "HO Manager",
    summary: "Supervision, HO delivery, purchase, stock, reports and approvals.",
    groups: [
      { title: "Start", topics: ["login", "analytics"] },
      SUPERVISION,
      { title: "Watch logistics", topics: ["hoDeliveryReceive", "hoDeliverySend"] },
      PURCHASE,
      { title: "Inventory & masters", topics: ["stockPrices", "stockAdjust", "spares", "servicePackages", "suppliers", "brands"] },
      { title: "Accounts & reports", topics: ["invoices", "salesReports", "storeReports", "settingsTax"] },
    ],
  },
  {
    role: "ho_accounts",
    label: "HO Accounts",
    summary: "HO billing, invoices, payments, credit notes and GST reports.",
    groups: [
      { title: "Start", topics: ["login"] },
      { title: "Billing", topics: ["hoBilling", "invoices", "creditNotes", "accountsSetup"] },
      { title: "Reports", topics: ["salesReports", "storeReports", "stockPrices"] },
      { title: "Settings", topics: ["settingsTax", "customization"] },
    ],
  },
  {
    role: "ho_purchase",
    label: "HO Purchase",
    summary: "Spares, suppliers, purchase orders, GRN and transfers to stores.",
    groups: [
      { title: "Start", topics: ["login"] },
      { title: "Masters", topics: ["spares", "suppliers", "brands", "servicePackages"] },
      PURCHASE,
      { title: "Stock", topics: ["stockPrices", "stockAdjust"] },
    ],
  },
  {
    role: "admin",
    label: "Admin (HO)",
    summary: "Full access within the region. Use the role selector to view each team's steps.",
    groups: [
      { title: "Start", topics: ["login", "analytics"] },
      { title: "Setup", topics: ["users", "regions", "settingsTax", "customization"] },
      { title: "Masters", topics: ["customerMaster", "suppliers", "brands", "spares", "servicePackages", "technicianMaster"] },
      { title: "Accounts", topics: ["invoices", "creditNotes", "accountsSetup", "salesReports", "hoBilling"] },
    ],
  },
  {
    role: "super_admin",
    label: "Super Admin",
    summary: "Full system access. Use the role selector to view each team's steps.",
    groups: [
      { title: "Start", topics: ["login", "analytics"] },
      { title: "Setup", topics: ["users", "regions", "settingsTax", "settingsIntegrations", "customization", "activeSessions"] },
      { title: "Masters", topics: ["customerMaster", "suppliers", "brands", "spares", "servicePackages", "technicianMaster"] },
      { title: "Accounts", topics: ["invoices", "creditNotes", "accountsSetup", "salesReports", "hoBilling"] },
    ],
  },
];

export function roleManual(role: string): RoleManual | undefined {
  return ROLE_MANUALS.find((m) => m.role === role);
}

/** Full SRF journey across roles — shown at the top of every manual. */
const STORE: UserRole[] = ["store_user", "store_manager"];
const CLERK: UserRole[] = ["service_centre_clerk", "delivery_boy"];
const STORE_AGENT: UserRole[] = [...STORE, "delivery_boy"];

export const SRF_JOURNEY: { step: string; who: string; menu: string; roles: UserRole[] }[] = [
  { step: "Book SRF", who: "Store User", menu: "Service → SRF → Book SRF", roles: STORE },
  { step: "Create transfer (TD)", who: "Store User", menu: "Logistics → Store dispatch → Outward SRF", roles: STORE },
  { step: "Hand over to delivery agent (OTP)", who: "Store User + Agent", menu: "Logistics → Store delivery → Send to CSC", roles: STORE_AGENT },
  { step: "Receive from delivery agent (OTP)", who: "SC Clerk + Agent", menu: "Logistics → HO delivery → Receive at HO", roles: [...CLERK, "ho_manager"] },
  { step: "HO inward", who: "SC Clerk", menu: "Logistics → HO inward / outward → Internal inward", roles: ["service_centre_clerk"] },
  { step: "Assign technician", who: "SC Supervisor", menu: "Supervision → Assigning → Assign", roles: ["service_centre_supervisor", "ho_manager"] },
  { step: "Repair + spares", who: "Technician", menu: "Dashboard → My Workbench", roles: ["technician"] },
  { step: "HO outward (TD)", who: "SC Clerk", menu: "Logistics → HO inward / outward → Internal outward", roles: ["service_centre_clerk"] },
  { step: "Hand over to delivery agent (OTP)", who: "SC Clerk + Agent", menu: "Logistics → HO delivery → Send to Store", roles: [...CLERK, "ho_manager"] },
  { step: "Receive from delivery agent (OTP)", who: "Store User + Agent", menu: "Logistics → Store delivery → Receive at Store", roles: STORE_AGENT },
  { step: "Store inward + QC", who: "Store User", menu: "Logistics → Store dispatch → Inward SRF", roles: STORE },
  { step: "Final bill + handover (OTP)", who: "Store User", menu: "Billing → Store billing", roles: [...STORE, "store_accounts"] },
];
