import { useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { NavLayoutProvider, useNavLayout } from "../../context/NavLayoutContext";
import { useScrollReveal } from "../../hooks/useScrollReveal";
import { SessionLoginAlertModal } from "../auth/SessionLoginAlertModal";
import { RouteMasterTabs } from "../ui/MasterTabs";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

function AppShellInner() {
  const { navOpen, closeNav } = useNavLayout();
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useScrollReveal(mainRef, pathname);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    el.classList.remove("app-route-enter");
    void el.offsetWidth;
    el.classList.add("app-route-enter");
    mainRef.current?.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);

  return (
    <div className="app-shell flex h-dvh min-h-0 bg-rlx-bg leading-normal">
      <SessionLoginAlertModal />
      {navOpen ? (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-stone-900/50 print:hidden"
          onClick={closeNav}
        />
      ) : null}
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TopBar />
        <main
          ref={mainRef}
          className="app-main relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-rlx-bg p-2 sm:p-3 md:p-4 print:p-2"
        >
          <div ref={contentRef} className="app-main-content w-full min-w-0 max-w-none">
            <RouteMasterTabs />
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

export function AppShell() {
  return (
    <NavLayoutProvider>
      <AppShellInner />
    </NavLayoutProvider>
  );
}
