import { NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { isInventoryStockPricesViewOnly } from "../../lib/inventoryAccess";
import { ENABLE_PR_FLOW } from "../../lib/inventoryFeatureFlags";

const navItems: Array<{ to: string; label: string }> = [
  { to: "/inventory", label: "Home" },
  { to: "/inventory/spares", label: "Spares" },
  { to: "/inventory/bulk-import", label: "Bulk import" },
  { to: "/inventory/brands", label: "Brands" },
  { to: "/inventory/brands/bulk-import", label: "Brand import" },
  { to: "/inventory/hsn-master", label: "HSN master" },
  { to: "/inventory/service-packages", label: "Service packages" },
  { to: "/inventory/service-packages/new", label: "Add package" },
  { to: "/inventory/store-stock", label: "Store stock" },
  { to: "/inventory/stock-adjustment", label: "Stock adjustment" },
  { to: "/inventory/stock-prices", label: "Stock & prices" },
  ...(ENABLE_PR_FLOW
    ? [
        { to: "/inventory/purchase-requests", label: "New PR" },
        { to: "/inventory/pr-history", label: "PR History" },
      ]
    : []),
  { to: "/inventory/suppliers", label: "Supplier Master" },
  { to: "/inventory/suppliers/new", label: "Add Supplier" },
  { to: "/inventory/suppliers/bulk-import", label: "Supplier import" },
  { to: "/inventory/purchase-orders", label: "New PO" },
  { to: "/inventory/po-history", label: "PO History" },
  { to: "/inventory/po-inward", label: "Post GRN" },
  { to: "/inventory/grn-history", label: "GRN History" },
  { to: "/inventory/purchase-return", label: "Spare return" },
  { to: "/inventory/purchase-return-history", label: "Return History" },
  { to: "/inventory/ho-transfer", label: "HO transfer" },
  ...(ENABLE_PR_FLOW ? [{ to: "/inventory/allocation-review", label: "Allocation" }] : []),
  { to: "/inventory/spare-price-fixing", label: "Price fixing" },
];

export function InventoryNavBar() {
  const { user } = useAuth();
  const viewOnly = isInventoryStockPricesViewOnly(user);
  const items = viewOnly ? navItems.filter((i) => i.to === "/inventory/stock-prices") : navItems;

  return (
    <div className="mb-6 overflow-x-auto rounded-2xl border border-zimson-200/80 bg-zimson-50/60 p-2">
      <nav className="flex min-w-max items-center gap-2" aria-label="Inventory module sections">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `rounded-xl px-3 py-2 text-xs font-semibold transition ${
                isActive
                  ? "bg-zimson-700 text-white shadow-sm"
                  : "bg-white text-zimson-900 ring-1 ring-zimson-200 hover:bg-zimson-100"
              }`
            }
            end={item.to === "/inventory"}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
