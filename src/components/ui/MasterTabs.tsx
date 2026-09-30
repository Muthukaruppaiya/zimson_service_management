import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import type { UserRole } from "../../types/user";

export type MasterTab = {
  to: string;
  label: string;
  roles?: UserRole[];
  excludeRoles?: UserRole[];
  /** Extra paths that also mark this tab active (e.g. edit pages). */
  match?: RegExp[];
};

/** Top tab bar that groups a master's list / create / bulk import pages under one sidebar entry. */
export function MasterTabs({ tabs }: { tabs: MasterTab[] }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const visible = tabs.filter(
    (t) =>
      (!t.roles || t.roles.length === 0 || (user && t.roles.includes(user.role))) &&
      !(user && t.excludeRoles?.includes(user.role)),
  );
  if (visible.length < 2) return null;
  return (
    <div className="mb-5 overflow-x-auto border-b border-rlx-rule print:hidden">
      <nav className="flex min-w-max items-end gap-1" aria-label="Section tabs">
        {visible.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end
            className={({ isActive }) => {
              const active = isActive || (t.match ?? []).some((re) => re.test(pathname));
              return `-mb-px border-b-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-widest transition ${
                active
                  ? "border-rlx-green text-rlx-green"
                  : "border-transparent text-stone-500 hover:border-stone-300 hover:text-stone-800"
              }`;
            }}
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

const HO_ADMIN: UserRole[] = ["super_admin", "admin"];
const HO_PURCHASE: UserRole[] = ["super_admin", "admin", "ho_manager", "ho_purchase"];

export const SUPPLIER_TABS: MasterTab[] = [
  { to: "/inventory/suppliers", label: "All suppliers" },
  { to: "/inventory/suppliers/new", label: "Create supplier", roles: HO_PURCHASE, match: [/^\/inventory\/suppliers\/[^/]+\/edit/] },
  { to: "/inventory/suppliers/bulk-import", label: "Bulk import", roles: HO_PURCHASE },
];

export const CUSTOMER_TABS: MasterTab[] = [
  { to: "/service/customers/master", label: "All customers" },
  { to: "/service/billing/register", label: "Create customer" },
  { to: "/service/customers/bulk-import", label: "Bulk import" },
  { to: "/service/customers/admin-verify", label: "Verify (no OTP)", roles: HO_ADMIN },
];

export const USER_TABS: MasterTab[] = [
  { to: "/users/list", label: "All users" },
  { to: "/users", label: "Create user" },
];

export const BRAND_TABS: MasterTab[] = [
  { to: "/inventory/brands", label: "All brands" },
  { to: "/inventory/brands/bulk-import", label: "Bulk import", roles: HO_ADMIN },
];

export const SERVICE_PACKAGE_TABS: MasterTab[] = [
  { to: "/inventory/service-packages", label: "All packages" },
  { to: "/inventory/service-packages/new", label: "Create package", roles: HO_ADMIN, match: [/^\/inventory\/service-packages\/[^/]+\/edit/] },
  { to: "/inventory/service-package-types", label: "Package types", roles: ["super_admin"] },
];

export const SPARE_TABS: MasterTab[] = [
  { to: "/inventory/spares", label: "All spares" },
  { to: "/inventory/bulk-import", label: "Bulk import", roles: HO_PURCHASE },
  { to: "/inventory/hsn-master", label: "HSN master", roles: HO_ADMIN },
];

export const STORE_DISPATCH_TABS: MasterTab[] = [
  { to: "/service/store-dispatch", label: "Dispatch" },
  { to: "/service/store-logistics-history", label: "Inward & outward history" },
];

export const STORE_DELIVERY_TABS: MasterTab[] = [
  { to: "/service/delivery-handoff", label: "Handoff" },
  { to: "/service/delivery-boy-history", label: "Agent history" },
];

export const HO_LOGISTICS_TABS: MasterTab[] = [
  { to: "/service-centre/logistics", label: "Inward / outward" },
  { to: "/service-centre/logistics-history", label: "DC / ODC history" },
];

export const HO_DELIVERY_TABS: MasterTab[] = [
  { to: "/service-centre/delivery-handoff", label: "Handoff" },
  { to: "/service-centre/delivery-boy-history", label: "Agent history" },
];

const SUPER: UserRole[] = ["super_admin"];

export const PURCHASE_TAB_GROUPS: MasterTab[][] = [
  [
    { to: "/inventory/purchase-requests", label: "Create PR" },
    { to: "/inventory/pr-history", label: "PR history" },
  ],
  [
    { to: "/inventory/purchase-orders", label: "Create PO" },
    { to: "/inventory/po-history", label: "PO history" },
  ],
  [
    { to: "/inventory/vouchers", label: "Create voucher" },
    { to: "/inventory/voucher-history", label: "Voucher history" },
  ],
  [
    { to: "/inventory/po-inward", label: "Create GRN" },
    { to: "/inventory/grn-history", label: "GRN history" },
  ],
  [
    { to: "/inventory/purchase-return", label: "Create GRN return" },
    { to: "/inventory/purchase-return-history", label: "GRN return history" },
  ],
  [
    { to: "/inventory/ho-transfer", label: "Create transfer" },
    { to: "/inventory/transfer-history", label: "Transfer history" },
  ],
];

export const REPORT_TAB_GROUPS: MasterTab[][] = [
  [
    { to: "/accounts/reports/revenue", label: "Revenue" },
    { to: "/accounts/reports/summary-sale", label: "Summary sale" },
    { to: "/accounts/reports/hsn-purchase", label: "HSN purchase" },
    { to: "/accounts/reports/sr-returned", label: "SR returned" },
  ],
  [
    { to: "/reports/watch-not-returned", label: "Not returned" },
    { to: "/reports/aging", label: "Aging" },
    { to: "/reports/unassigned-watches", label: "Unassigned" },
    { to: "/reports/pending", label: "Pending" },
  ],
  [
    { to: "/reports/stock-in-hand", label: "Stock in hand" },
    { to: "/reports/transfer", label: "Transfer" },
  ],
  [
    { to: "/reports/technician-assign-watch", label: "Assigned watches" },
    { to: "/reports/technician-repaired-history", label: "Repaired history" },
  ],
];

export const SETTINGS_TAB_GROUPS: MasterTab[][] = [
  [
    { to: "/settings/tax", label: "Tax & billing" },
    { to: "/settings/edoc", label: "E-invoice & e-way", roles: SUPER },
    { to: "/settings/brand-eway-consignees", label: "Brand consignees", roles: HO_ADMIN },
  ],
  [
    { to: "/settings/messaging", label: "SMS, email & WhatsApp", roles: SUPER },
    { to: "/settings/razorpay", label: "Razorpay", roles: SUPER },
  ],
  [
    { to: "/settings/document-templates", label: "Document templates" },
    { to: "/settings/custom-fields", label: "Custom fields", roles: HO_ADMIN },
  ],
];

export const SERVICE_TAB_GROUPS: MasterTab[][] = [
  [
    { to: "/service/quick-bill", label: "New quick bill" },
    { to: "/service/quick-bill-history", label: "Quick bill history" },
  ],
  [
    { to: "/service/srf", label: "Book SRF" },
    { to: "/service/srf-register", label: "SRF history" },
    { to: "/service/srf-master", label: "SRF master" },
  ],
];

export const OTHER_TAB_GROUPS: MasterTab[][] = [
  [
    { to: "/inventory/stock-prices", label: "Stock & prices" },
    { to: "/inventory/stock-adjustment", label: "Stock adjustment", excludeRoles: ["service_centre_supervisor", "store_user"] },
  ],
  [
    { to: "/accounts/invoice-history", label: "Invoice history" },
    { to: "/accounts/ledger", label: "Payment ledger" },
  ],
  [
    { to: "/accounts/brand-credit-history", label: "Credit note history" },
    { to: "/accounts/brand-credit-notes", label: "Brand credit notes", roles: ["super_admin", "admin", "ho_accounts"] },
  ],
  [
    { to: "/service-centre/supervisor", label: "Assign", match: [/^\/service-centre\/supervisor\/srf\//] },
    { to: "/service-centre/supervisor/reestimate-sender", label: "Re-estimate approvals" },
  ],
];

const TAB_GROUPS: MasterTab[][] = [
  ...OTHER_TAB_GROUPS,
  ...SERVICE_TAB_GROUPS,
  ...PURCHASE_TAB_GROUPS,
  ...REPORT_TAB_GROUPS,
  ...SETTINGS_TAB_GROUPS,
  STORE_DISPATCH_TABS,
  STORE_DELIVERY_TABS,
  HO_LOGISTICS_TABS,
  HO_DELIVERY_TABS,
  SUPPLIER_TABS,
  CUSTOMER_TABS,
  USER_TABS,
  BRAND_TABS,
  SERVICE_PACKAGE_TABS,
  SPARE_TABS,
];

function tabMatches(t: MasterTab, pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return path === t.to || (t.match ?? []).some((re) => re.test(path));
}

/** Shows the tab bar for whichever master the current page belongs to. */
export function RouteMasterTabs() {
  const { pathname } = useLocation();
  const group = TAB_GROUPS.find((tabs) => tabs.some((t) => tabMatches(t, pathname)));
  return group ? <MasterTabs tabs={group} /> : null;
}
