import { NavLink } from "react-router-dom";

const baseNavItems: Array<{ to: string; label: string }> = [
  { to: "/service", label: "Home" },
  { to: "/service/quick-bill", label: "Quick bill" },
  { to: "/service/quick-bill-history", label: "Quick bill history" },
  { to: "/service/srf", label: "New booking" },
  { to: "/service/srf-register", label: "Booking list" },
  { to: "/service/srf-master", label: "SRF master" },
  { to: "/service/watch-inventory", label: "Watch inventory" },
  { to: "/service/customers/master", label: "Customer master" },
  { to: "/service/store-assign", label: "Store assign" },
  { to: "/service/store-dispatch", label: "Store dispatch" },
  { to: "/service/store-logistics-history", label: "Inward & outward history" },
  { to: "/service/store-billing", label: "Store billing" },
  { to: "/service/store-billing-master", label: "Store billing master" },
];

type ServiceNavBarProps = {
  includeServiceCentre?: boolean;
};

export function ServiceNavBar({ includeServiceCentre = false }: ServiceNavBarProps) {
  const navItems = includeServiceCentre
    ? [...baseNavItems, { to: "/service-centre", label: "Service centre" }]
    : baseNavItems;

  return (
    <div className="mb-6 overflow-x-auto rounded-2xl border border-zimson-200/80 bg-zimson-50/60 p-2">
      <nav className="flex min-w-max items-center gap-2" aria-label="Service module sections">
        {navItems.map((item) => (
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
            end={item.to === "/service"}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
