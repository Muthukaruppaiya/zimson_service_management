import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { SrfTraceModal } from "../../components/service/SrfTraceModal";
import { FilterField } from "../../components/ui/FilterField";
import { useAuth } from "../../context/AuthContext";
import { useRegions } from "../../context/RegionsContext";
import { useSrfJobs } from "../../context/SrfJobsContext";
import { printEstimateDocument, printSrfDocument, srfPrintStoreFromSeed } from "../../lib/serviceDocuments";
import { repairRouteLabel } from "../../lib/srfRepairRoute";
import { jobVisibleToServiceCentre, shouldShowInSupervisorSrfList } from "../../lib/srfAccess";
import type { SrfJob, SrfJobStatus } from "../../types/srfJob";
import { uiPageTitleOnDarkClass } from "../../lib/pageTypography";

const statusCls: Record<string, string> = {
  received_at_sc: "bg-violet-100 text-violet-700",
  sent_to_other_ho: "bg-indigo-100 text-indigo-700",
  assigned: "bg-indigo-100 text-indigo-700",
  estimate_ok: "bg-amber-100 text-amber-700",
  reestimate_required: "bg-rose-100 text-rose-700",
  ready_for_outward: "bg-cyan-100 text-cyan-700",
  dispatched_to_store: "bg-orange-100 text-orange-700",
  received_at_store: "bg-emerald-100 text-emerald-700",
  closed: "bg-emerald-200 text-emerald-900",
  cancelled: "bg-stone-200 text-stone-600",
};

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

function regionName(regions: SeedRegion[], id: string | null | undefined): string {
  if (!id) return "—";
  return regions.find((r) => r.id === id)?.name ?? id;
}

const btnAction =
  "inline-flex items-center justify-center border border-rlx-gold/60 bg-white px-2 py-1 text-[10px] font-semibold text-rlx-green hover:bg-rlx-green-light";

export function ScSrfHistoryPage() {
  const { user } = useAuth();
  const { jobs } = useSrfJobs();
  const { regions } = useRegions();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"ALL" | SrfJobStatus>("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [traceId, setTraceId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const visible = useMemo(() => {
    if (!user) return [];
    const scoped = jobs.filter((j) => jobVisibleToServiceCentre(j, user));
    return scoped.filter((j) => shouldShowInSupervisorSrfList(j, scoped));
  }, [jobs, user]);

  const statusOptions = useMemo(
    () => Array.from(new Set(visible.map((j) => j.status))).sort(),
    [visible],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const from = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null;
    const to = toDate ? new Date(`${toDate}T23:59:59`).getTime() : null;
    return visible
      .filter((j) => (status === "ALL" ? true : j.status === status))
      .filter((j) => {
        const ts = new Date(j.updatedAt || j.createdAt).getTime();
        if (from != null && ts < from) return false;
        if (to != null && ts > to) return false;
        return true;
      })
      .filter((j) => {
        if (!q) return true;
        return (
          j.reference.toLowerCase().includes(q) ||
          j.customerName.toLowerCase().includes(q) ||
          j.phone.toLowerCase().includes(q) ||
          `${j.watchBrand} ${j.watchModel}`.toLowerCase().includes(q) ||
          (j.hoSparesBillRef ?? "").toLowerCase().includes(q) ||
          (j.technicianName ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
  }, [visible, query, status, fromDate, toDate]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, currentPage]);

  useEffect(() => {
    setPage(1);
  }, [query, status, fromDate, toDate]);

  function printStoreForJob(j: SrfJob) {
    const store = regions.flatMap((r) => r.stores).find((s) => s.id === j.storeId);
    return store ? srfPrintStoreFromSeed(store) : undefined;
  }

  function srfPrintInput(j: SrfJob): Parameters<typeof printSrfDocument>[0] {
    return {
      reference: j.reference,
      customerName: j.customerName,
      phone: j.phone,
      company: j.company,
      watchBrand: j.watchBrand,
      watchFamily: j.watchFamily,
      watchModel: j.watchModel,
      serial: j.serial,
      complaint: j.complaint || "-",
      estimateTotalInr: Number(j.estimateTotalInr ?? 0),
      estimatedFinishDate: j.estimatedFinishDate ?? null,
      advanceInr: Number(j.advanceInr ?? 0),
      advancePaymentMode: j.advancePaymentMode,
      advancePaymentDetails: j.advancePaymentDetails ?? null,
      bookingDate: j.createdAt,
      repairRoute: j.repairRoute,
      natureOfRepair: j.repairRoute ? repairRouteLabel(j.repairRoute) : undefined,
      modelNumber: j.serial,
      storeInfo: printStoreForJob(j),
    };
  }

  return (
    <div className="ui-page-bleed relative font-sans text-rlx-ink">
      <div className="min-h-0 bg-rlx-bg">
        <div className="bg-rlx-green px-4 py-5 md:px-6 md:py-6">
          <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.4em] text-rlx-gold">
            Service Centre · SRF History
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className={uiPageTitleOnDarkClass}>HO / SC SRF history</h1>
              <p className="mt-1 max-w-2xl text-xs text-white/70">
                All SRF jobs handled at your service centre — assignments, inter-HO transfers, brand desk, and billing refs.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                to="/service-centre/supervisor"
                className="no-underline inline-flex items-center justify-center border border-white/30 bg-white/10 px-3.5 py-2 text-[11px] font-semibold tracking-wide text-white hover:bg-white/20"
              >
                Back to supervisor
              </Link>
              <Link
                to="/service-centre"
                className="no-underline inline-flex items-center justify-center bg-rlx-gold px-3.5 py-2 text-[11px] font-semibold tracking-wide text-rlx-green-deep hover:bg-rlx-gold-dark"
              >
                Service centre home
              </Link>
            </div>
          </div>
        </div>

        <div className="px-4 py-4 md:px-6 md:py-5">
          <div className="ui-filter-grid mb-4">
            <FilterField label="Search" htmlFor="sc-srf-hist-q" className="ui-filter-span-2-sm min-w-0">
              <input
                id="sc-srf-hist-q"
                className="ui-field"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="SRF, customer, technician, invoice ref…"
              />
            </FilterField>
            <FilterField label="Status" htmlFor="sc-srf-hist-status">
              <select
                id="sc-srf-hist-status"
                className="ui-field"
                value={status}
                onChange={(e) => setStatus(e.target.value as "ALL" | SrfJobStatus)}
              >
                <option value="ALL">All status</option>
                {statusOptions.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="From" htmlFor="sc-srf-hist-from">
              <input id="sc-srf-hist-from" type="date" className="ui-field" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </FilterField>
            <FilterField label="To" htmlFor="sc-srf-hist-to">
              <input id="sc-srf-hist-to" type="date" className="ui-field" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </FilterField>
          </div>

          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-rlx-ink-muted">
            {rows.length} record{rows.length === 1 ? "" : "s"}
          </p>

          {rows.length === 0 ? (
            <div className="border border-rlx-rule bg-white px-5 py-10 text-center text-sm text-rlx-ink-muted">
              No SRF jobs match the current filters for your HO / service centre.
            </div>
          ) : (
            <div className="ui-table-scroll border border-rlx-rule bg-white shadow-sm">
              <table className="ui-table-dense w-full min-w-[56rem] text-left text-sm">
                <thead className="sticky top-0 z-10 bg-rlx-green text-[9px] font-semibold uppercase tracking-[0.2em] text-white">
                  <tr>
                    <th>Updated</th>
                    <th>SRF</th>
                    <th>Status</th>
                    <th>Route</th>
                    <th>Repair HO</th>
                    <th>Sender HO</th>
                    <th>Customer</th>
                    <th>Technician</th>
                    <th className="text-right">Estimate</th>
                    <th>Invoice</th>
                    <th>Actions</th>
                  </tr>
                  <tr aria-hidden>
                    <td colSpan={11} className="h-[2px] bg-rlx-gold p-0" />
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((j, idx) => (
                    <tr key={j.id} className={`border-b border-rlx-rule ${idx % 2 ? "bg-rlx-bg" : "bg-white"}`}>
                      <td className="whitespace-nowrap text-xs text-rlx-ink-muted">
                        {new Date(j.updatedAt || j.createdAt).toLocaleString()}
                      </td>
                      <td className="font-mono text-[11px] font-semibold text-rlx-green">{j.reference}</td>
                      <td>
                        <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold uppercase ${statusCls[j.status] ?? "bg-stone-100 text-stone-700"}`}>
                          {statusLabel(j.status)}
                        </span>
                      </td>
                      <td className="text-xs">{repairRouteLabel(j.repairRoute)}</td>
                      <td className="text-xs">{regionName(regions, j.regionId)}</td>
                      <td className="text-xs">{regionName(regions, j.transferSourceRegionId)}</td>
                      <td>
                        <div className="font-medium">{j.customerName}</div>
                        <div className="text-[10px] text-rlx-ink-muted">{j.phone}</div>
                      </td>
                      <td className="text-xs">{j.technicianName?.trim() || "—"}</td>
                      <td className="whitespace-nowrap text-right font-medium">
                        {j.estimateTotalInr != null
                          ? j.estimateTotalInr.toLocaleString(undefined, { style: "currency", currency: "INR" })
                          : "—"}
                      </td>
                      <td className="font-mono text-[10px]">{j.hoSparesBillRef?.trim() || j.invoiceNumber?.trim() || "—"}</td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          <button type="button" className={btnAction} onClick={() => setTraceId(j.id)}>
                            Trace
                          </button>
                          <Link to={`/service-centre/supervisor/srf/${j.id}`} className={`${btnAction} no-underline`}>
                            Open
                          </Link>
                          <button type="button" className={btnAction} onClick={() => printSrfDocument(srfPrintInput(j))}>
                            SRF
                          </button>
                          {j.estimateTotalInr != null ? (
                            <button type="button" className={btnAction} onClick={() => printEstimateDocument(j)}>
                              Est.
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 ? (
            <div className="mt-4 flex items-center justify-between gap-3 text-xs">
              <span className="text-rlx-ink-muted">
                Page {currentPage} of {totalPages}
              </span>
              <div className="flex gap-2">
                <button type="button" className="ui-btn-secondary" disabled={currentPage <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </button>
                <button type="button" className="ui-btn-secondary" disabled={currentPage >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {traceId ? <SrfTraceModal srfId={traceId} onClose={() => setTraceId(null)} /> : null}
    </div>
  );
}
