import { useMemo } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { canAccessModule } from "../../config/moduleAccess";
import { useAuth } from "../../context/AuthContext";
import { mainNav } from "../../navigation";

function roleLabel(role: string) {
  switch (role) {
    case "super_admin":
      return "Super Admin";
    case "regional_admin":
      return "Regional Admin";
    case "store_user":
      return "Store user";
    case "service_centre_clerk":
      return "SC inward";
    case "service_centre_supervisor":
      return "SC supervisor";
    case "technician":
      return "Technician";
    default:
      return role;
  }
}

export function TopBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const items = useMemo(() => {
    if (!user) return [];
    return mainNav.filter((item) => canAccessModule(user.role, item.module));
  }, [user]);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <header className="sticky top-0 z-10 border-b border-zimson-300/60 bg-zimson-50/95 backdrop-blur">
      <div className="flex h-14 items-center justify-between gap-4 px-4 md:px-8">
        <div className="flex min-w-0 items-center gap-3 md:hidden">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zimson-500 text-xs font-bold text-white">
            Z
          </div>
          <span className="truncate text-sm font-semibold text-stone-900">Zimson</span>
        </div>
        <div className="hidden flex-1 md:block" />
        <nav
          className="flex gap-1 overflow-x-auto pb-0.5 md:hidden"
          aria-label="Mobile main"
        >
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                [
                  "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium",
                  isActive
                    ? "bg-zimson-500 text-white shadow-sm"
                    : "bg-white/80 text-stone-700 ring-1 ring-zimson-300/60",
                ].join(" ")
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <div className="hidden max-w-[200px] flex-col items-end text-right sm:flex">
                <span className="truncate text-xs font-semibold text-stone-900">
                  {user.displayName}
                </span>
                <span className="text-[10px] font-medium uppercase tracking-wide text-zimson-800">
                  {roleLabel(user.role)}
                </span>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-xl border border-zimson-400/80 bg-white px-3 py-1.5 text-xs font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
              >
                Sign out
              </button>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
