import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ServiceBreadcrumb } from "../../components/service/ServiceBreadcrumb";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useSrfJobs } from "../../context/SrfJobsContext";
import { jobVisibleToStoreUser } from "../../lib/srfAccess";

export function StoreBillingMasterPage() {
  const { user } = useAuth();
  const { jobs } = useSrfJobs();
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const recentClosedBilling = useMemo(() => {
    if (!user) return [];
    return jobs
      .filter((j) => j.status === "closed" && jobVisibleToStoreUser(j, user))
      .sort((a, b) => String(b.closedAt ?? b.updatedAt ?? "").localeCompare(String(a.closedAt ?? a.updatedAt ?? "")));
  }, [jobs, user]);
  const totalPages = Math.max(1, Math.ceil(recentClosedBilling.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return recentClosedBilling.slice(start, start + pageSize);
  }, [recentClosedBilling, currentPage]);

  if (!user) return null;

  return (
    <div>
      <ServiceBreadcrumb current="Store billing master" />
      <PageHeader
        title="Store billing master"
        description="All store billing completed SRFs (newest first)."
        actions={
          <Link
            to="/service/store-billing"
            className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
          >
            Back to store billing
          </Link>
        }
      />

      <Card title="Store billing history" subtitle="SRFs already closed after customer collection (newest first)">
        {recentClosedBilling.length === 0 ? (
          <p className="text-sm text-stone-600">No closed SRFs in your visible scope yet.</p>
        ) : (
          <>
            <div className="max-h-[560px] overflow-auto rounded-xl border border-zimson-200/80">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 border-b border-zimson-200 bg-zimson-50/95 text-xs font-semibold uppercase text-stone-600">
                  <tr>
                    <th className="px-3 py-2">SRF</th>
                    <th className="px-3 py-2">Customer</th>
                    <th className="px-3 py-2">Watch</th>
                    <th className="px-3 py-2">Closed</th>
                    <th className="px-3 py-2 text-right">Estimate</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((j) => (
                    <tr key={j.id} className="border-b border-zimson-100 last:border-0">
                      <td className="px-3 py-2 font-mono text-xs font-semibold text-zimson-900">{j.reference}</td>
                      <td className="px-3 py-2 text-stone-800">{j.customerName}</td>
                      <td className="px-3 py-2 text-stone-700">
                        {j.watchBrand} {j.watchModel}
                      </td>
                      <td className="px-3 py-2 text-xs text-stone-600">
                        {j.closedAt ? new Date(j.closedAt).toLocaleString() : "-"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-stone-900">
                        {Number(j.estimateTotalInr ?? 0).toLocaleString(undefined, { style: "currency", currency: "INR" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs text-stone-600">Showing page {currentPage} of {totalPages}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-zimson-300 px-3 py-1.5 text-xs font-semibold text-zimson-900 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-lg border border-zimson-300 px-3 py-1.5 text-xs font-semibold text-zimson-900 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
