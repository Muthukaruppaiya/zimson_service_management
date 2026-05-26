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
    <div className="mb-4 overflow-x-auto border border-rlx-rule bg-rlx-bg p-1.5">
      <nav className="flex min-w-max items-center gap-1" aria-label="Service module sections">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide transition ${
                isActive
                  ? "bg-rlx-green text-white"
                  : "bg-white text-rlx-ink ring-1 ring-rlx-rule hover:bg-rlx-green-light"
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
