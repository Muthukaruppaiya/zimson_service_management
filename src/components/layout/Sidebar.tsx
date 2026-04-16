import { useMemo } from "react";
import { NavLink } from "react-router-dom";
import { canAccessModule } from "../../config/moduleAccess";
import { useAuth } from "../../context/AuthContext";
import { mainNav } from "../../navigation";

function NavIcon({ name }: { name: string }) {
  const common = "h-5 w-5 shrink-0 stroke-[1.75]";
  switch (name) {
    case "dashboard":
      return (
        <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      );
    case "service":
      return (
        <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case "regions":
      return (
        <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    case "users":
      return (
        <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      );
    case "serviceCentre":
      return (
        <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    case "inventory":
      return (
        <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      );
    default:
      return null;
  }
}

const iconFor = (to: string) => {
  if (to === "/") return "dashboard";
  if (to === "/service") return "service";
  if (to === "/service-centre") return "serviceCentre";
  if (to === "/inventory") return "inventory";
  if (to === "/regions") return "regions";
  return "users";
};

export function Sidebar() {
  const { user } = useAuth();

  const items = useMemo(() => {
    if (!user) return [];
    return mainNav.filter((item) => canAccessModule(user.role, item.module));
  }, [user]);

  return (
    <aside className="hidden w-64 shrink-0 border-r border-zimson-300/60 bg-gradient-to-b from-zimson-50 to-zimson-100 md:flex md:flex-col">
      <div className="flex h-16 items-center gap-2 border-b border-zimson-300/50 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zimson-500 text-sm font-bold text-white shadow-sm">
          Z
        </div>
        <div>
          <p className="text-sm font-semibold tracking-tight text-stone-900">Zimson</p>
          <p className="text-xs text-stone-600">Service management</p>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Main">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              [
                "flex items-start gap-3 rounded-xl px-3 py-2.5 text-left transition",
                isActive
                  ? "bg-white text-stone-900 shadow-sm ring-1 ring-zimson-300/80"
                  : "text-stone-700 hover:bg-white/70 hover:text-stone-900",
              ].join(" ")
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={
                    isActive ? "mt-0.5 text-zimson-800" : "mt-0.5 text-zimson-700"
                  }
                >
                  <NavIcon name={iconFor(item.to)} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-medium">{item.label}</span>
                    {item.badge ? (
                      <span className="rounded-full bg-zimson-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zimson-800">
                        {item.badge}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-xs text-stone-500">
                    {item.description}
                  </span>
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-zimson-300/50 p-4 text-xs text-stone-500">
        React · Tailwind · Demo auth (Node + Postgres later)
      </div>
    </aside>
  );
}
