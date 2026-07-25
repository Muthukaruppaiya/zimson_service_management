import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FilterField } from "../../components/ui/FilterField";
import { PageHeader } from "../../components/ui/PageHeader";
import { useRegions } from "../../context/RegionsContext";
import { useSrfJobs } from "../../context/SrfJobsContext";
import { downloadCsv, useServiceReportRows } from "./serviceReportUtils";
import {
  REPAIRED_CSV_COLUMNS,
  formatDateTime,
  isTechnicianRepairedHistory,
  repairRouteLabel,
  statusLabel,
  technicianDisplay,
  useTechnicianDirectory,
  watchLabel,
} from "./technicianReportUtils";

export function TechnicianRepairedHistoryReportPage() {
  const { jobs } = useSrfJobs();
  const { regions } = useRegions();
  const { loading, error, refreshAll } = useServiceReportRows();
  const { technicians, techById, loading: techLoading, error: techError, refresh: refreshTech } =
    useTechnicianDirectory();

  const [query, setQuery] = useState("");
  const [regionId, setRegionId] = useState("");
  const [technicianId, setTechnicianId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const repairedRows = useMemo(
    () =>
      jobs
        .filter(isTechnicianRepairedHistory)
        .map((job) => {
          const repairedAt = job.completedAtSc!;
          const repairToCompleteDays = Math.max(
            0,
            Math.floor(
              (new Date(repairedAt).getTime() -
                new Date(job.assignedAt ?? job.inwardAt ?? job.createdAt).getTime()) /
                (1000 * 60 * 60 * 24),
            ),
          );
          return { job, repairedAt, repairToCompleteDays };
        })
        .sort((a, b) => new Date(b.repairedAt).getTime() - new Date(a.repairedAt).getTime()),
    [jobs],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const fromMs = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null;
    const toMs = toDate ? new Date(`${toDate}T23:59:59`).getTime() : null;
    return repairedRows.filter(({ job, repairedAt }) => {
      if (regionId && job.regionId !== regionId) return false;
      if (technicianId && job.assignedTechnicianId !== technicianId) return false;
      const repairedMs = new Date(repairedAt).getTime();
      if (fromMs !== null && repairedMs < fromMs) return false;
      if (toMs !== null && repairedMs > toMs) return false;
      if (q) {
        const tech = technicianDisplay(job.assignedTechnicianId, techById);
        const hay =
          `${job.reference} ${job.customerName} ${job.phone} ${watchLabel(job)} ${job.serial} ${tech.name} ${job.status}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [repairedRows, query, regionId, technicianId, fromDate, toDate, techById]);

  const csvRows = useMemo(
    () =>
      filtered.map(({ job, repairedAt, repairToCompleteDays }) => {
        const tech = technicianDisplay(job.assignedTechnicianId, techById);
        return {
          "SR No": job.reference,
          Customer: job.customerName,
          Phone: job.phone,
          Watch: watchLabel(job),
          Serial: job.serial || "—",
          Technician: tech.name,
          Grade: tech.grade,
          "Assigned At": formatDateTime(job.assignedAt),
          "Repaired At": formatDateTime(repairedAt),
          "Turnaround (days)": repairToCompleteDays,
          Status: statusLabel(job.status),
          "Repair Route": repairRouteLabel(job),
          Region: job.regionName || job.regionId,
          Store: job.storeName || job.storeId,
        };
      }),
    [filtered, techById],
  );

  const kpis = useMemo(() => {
    const byTech = new Map<string, number>();
    let totalTurnaround = 0;
    for (const { job, repairToCompleteDays } of filtered) {
      const id = job.assignedTechnicianId ?? "";
      byTech.set(id, (byTech.get(id) ?? 0) + 1);
      totalTurnaround += repairToCompleteDays;
    }
    const avg =
      filtered.length > 0 ? Math.round((totalTurnaround / filtered.length) * 10) / 10 : 0;
    return {
      total: repairedRows.length,
      filtered: filtered.length,
      technicians: byTech.size,
      avgTurnaround: avg,
    };
  }, [repairedRows.length, filtered]);

  function refreshPage() {
    void refreshAll();
    void refreshTech();
  }

  return (
    <div className="ui-page-bleed px-3 font-sans text-rlx-ink sm:px-4 md:px-5">
      <PageHeader
        title="Technician repaired watch history"
        description="History of watches marked repair-complete by assigned technicians."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              to="/reports/technician-assign-watch"
              className="inline-flex border border-rlx-gold/60 bg-white px-4 py-2.5 text-sm font-semibold text-rlx-green transition hover:bg-rlx-green-light"
            >
              ← Assign tracking
            </Link>
            <button
              type="button"
              onClick={() =>
                downloadCsv(
                  `technician_repaired_history_${new Date().toISOString().slice(0, 10)}.csv`,
                  REPAIRED_CSV_COLUMNS,
                  csvRows,
                )
              }
              className="inline-flex border border-rlx-rule bg-white px-4 py-2.5 text-sm font-semibold text-rlx-green transition hover:border-rlx-green hover:bg-rlx-green-light disabled:opacity-40"
              disabled={filtered.length === 0}
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={refreshPage}
              className="inline-flex border border-rlx-rule bg-white px-4 py-2.5 text-sm font-semibold text-rlx-green transition hover:border-rlx-green hover:bg-rlx-green-light"
            >
              Refresh
            </button>
          </div>
        }
      />

      <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-rlx-gold-dark">
        Tracking &amp; aging
      </p>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total repaired", value: kpis.total },
          { label: "Filtered rows", value: kpis.filtered },
          { label: "Technicians", value: kpis.technicians },
          { label: "Avg turnaround (days)", value: kpis.avgTurnaround },
        ].map((kpi) => (
          <div key={kpi.label} className="border border-rlx-rule bg-white shadow-sm">
            <div className="border-b-2 border-rlx-gold bg-rlx-green px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white">{kpi.label}</p>
            </div>
            <p className="px-3 py-3 text-lg font-semibold text-rlx-green">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 grid gap-3 rounded-xl border border-rlx-rule bg-white p-4 shadow-sm md:grid-cols-2 lg:grid-cols-5">
        <FilterField label="Search">
          <input
            className="w-full rounded-lg border border-rlx-rule px-3 py-2 text-sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="SRF, customer, watch, technician…"
          />
        </FilterField>
        <FilterField label="Region">
          <select
            className="w-full rounded-lg border border-rlx-rule px-3 py-2 text-sm"
            value={regionId}
            onChange={(e) => setRegionId(e.target.value)}
          >
            <option value="">All regions</option>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Technician">
          <select
            className="w-full rounded-lg border border-rlx-rule px-3 py-2 text-sm"
            value={technicianId}
            onChange={(e) => setTechnicianId(e.target.value)}
          >
            <option value="">All technicians</option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.fullName} ({t.grade})
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Repaired from">
          <input
            type="date"
            className="w-full rounded-lg border border-rlx-rule px-3 py-2 text-sm"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </FilterField>
        <FilterField label="Repaired to">
          <input
            type="date"
            className="w-full rounded-lg border border-rlx-rule px-3 py-2 text-sm"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </FilterField>
      </div>

      {error || techError ? (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error ?? techError}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-rlx-rule bg-white shadow-sm">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead>
            <tr className="border-b border-rlx-rule bg-rlx-green text-[10px] font-semibold uppercase tracking-[0.14em] text-white">
              {REPAIRED_CSV_COLUMNS.map((col) => (
                <th key={col} className="px-3 py-2.5">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading || techLoading ? (
              <tr>
                <td colSpan={REPAIRED_CSV_COLUMNS.length} className="px-3 py-8 text-center text-stone-500">
                  Loading report…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={REPAIRED_CSV_COLUMNS.length} className="px-3 py-8 text-center text-stone-500">
                  No repaired watch history for the selected filters.
                </td>
              </tr>
            ) : (
              filtered.map(({ job, repairedAt, repairToCompleteDays }) => {
                const tech = technicianDisplay(job.assignedTechnicianId, techById);
                return (
                  <tr key={job.id} className="border-b border-rlx-rule/60 hover:bg-rlx-green-light/20">
                    <td className="px-3 py-2 font-mono text-xs font-semibold">{job.reference}</td>
                    <td className="px-3 py-2">{job.customerName}</td>
                    <td className="px-3 py-2">{job.phone}</td>
                    <td className="px-3 py-2">{watchLabel(job)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{job.serial || "—"}</td>
                    <td className="px-3 py-2 font-medium">{tech.name}</td>
                    <td className="px-3 py-2">{tech.grade}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(job.assignedAt)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(repairedAt)}</td>
                    <td className="px-3 py-2 tabular-nums font-semibold">{repairToCompleteDays}</td>
                    <td className="px-3 py-2 capitalize">{statusLabel(job.status)}</td>
                    <td className="px-3 py-2">{repairRouteLabel(job)}</td>
                    <td className="px-3 py-2">{job.regionName || job.regionId}</td>
                    <td className="px-3 py-2">{job.storeName || job.storeId}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
