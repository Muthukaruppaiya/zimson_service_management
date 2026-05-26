import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppShell() {
  return (
    <div className="app-shell flex h-dvh min-h-0 bg-rlx-bg text-[0.75rem] leading-snug">
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
