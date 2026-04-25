import { NavLink } from "react-router-dom";

const navItems: Array<{ to: string; label: string }> = [
  { to: "/service", label: "Home" },
  { to: "/service/quick-bill", label: "Quick bill" },
  { to: "/service/quick-bill-history", label: "Quick bill history" },
  { to: "/service/srf", label: "New booking" },
  { to: "/service/srf-register", label: "Booking list" },
  { to: "/service/watch-inventory", label: "Watch inventory" },
  { to: "/service/customers/master", label: "Customer master" },
  { to: "/service/store-dispatch", label: "Store dispatch" },
  { to: "/service/store-billing", label: "Store billing" },
];

export function ServiceNavBar() {
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
