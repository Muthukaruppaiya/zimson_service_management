import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { loadRecentLookups, type RecentLookup } from "../../lib/dashboardRecentLookups";

function kindLabel(kind: string, query: string): string {
  if (kind === "SRF") return `SRF: ${query}`;
  if (kind === "DC" || kind === "ODC") return `Transfer: ${query}`;
  if (kind === "QB") return `Quick bill: ${query}`;
  if (query.includes("@") || /^\+?\d/.test(query)) return `Customer: ${query}`;
  return `Serial #: ${query}`;
}

export function DashboardRecentLookups() {
  const [rows, setRows] = useState<RecentLookup[]>([]);

  const refresh = useCallback(() => {
    setRows(loadRecentLookups());
  }, []);

  useEffect(() => {
    refresh();
    const onStorage = () => refresh();
    window.addEventListener("dashboard-recent-lookups", onStorage);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("dashboard-recent-lookups", onStorage);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh]);

  return (
    <section className="overflow-hidden rounded-lg border border-[#e5e8ef] bg-white">
      <div className="border-b border-[#e5e8ef] px-3 py-2.5 md:px-4">
        <h2 className="text-sm font-bold text-[#111827]">Recent Universal Lookups</h2>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-[#6B7280]">
            Recent searches appear here after you open a result.
          </p>
        ) : (
          <ul className="divide-y divide-[#e5e8ef]">
            {rows.map((row) => (
              <li key={row.id}>
                <Link
                  to={row.to}
                  className="block px-3 py-2.5 text-xs text-[#374151] transition hover:bg-[#f9fafb] md:px-4"
                >
                  {kindLabel(row.kind, row.query)}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
