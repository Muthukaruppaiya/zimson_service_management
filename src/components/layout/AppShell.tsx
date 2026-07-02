import { Outlet } from "react-router-dom";
import { NavLayoutProvider, useNavLayout } from "../../context/NavLayoutContext";
import { SessionLoginAlertModal } from "../auth/SessionLoginAlertModal";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

function AppShellInner() {
  const { navOpen, closeNav } = useNavLayout();

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
        <main className="app-main min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-rlx-bg p-2 sm:p-3 md:p-4 print:p-2">
          <div className="app-main-content w-full min-w-0 max-w-none">
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
