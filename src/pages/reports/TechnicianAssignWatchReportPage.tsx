import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FilterField } from "../../components/ui/FilterField";
import { PageHeader } from "../../components/ui/PageHeader";
import { useRegions } from "../../context/RegionsContext";
import { useSrfJobs } from "../../context/SrfJobsContext";
import { downloadCsv, useServiceReportRows } from "./serviceReportUtils";
import {
  ASSIGN_CSV_COLUMNS,
  assignAgingBucket,
  daysSince,
  formatDateTime,
  isTechnicianAssignActive,
  repairRouteLabel,
  statusLabel,
  technicianDisplay,
  useTechnicianDirectory,
  watchLabel,
} from "./technicianReportUtils";

const BUCKETS = ["ALL", "0-3 days", "4-7 days", "8-14 days", "15-30 days", "30+ days"] as const;

function bucketChipClass(bucket: string): string {
  if (bucket === "30+ days" || bucket === "15-30 days") return "bg-rose-50 text-rose-800 ring-rose-300/70";
  if (bucket === "8-14 days") return "bg-amber-50 text-amber-950 ring-amber-300/70";
  if (bucket === "4-7 days") return "bg-sky-50 text-sky-900 ring-sky-300/70";
  return "bg-emerald-50 text-emerald-900 ring-emerald-300/70";
}

export function TechnicianAssignWatchReportPage() {
  const { jobs } = useSrfJobs();
  const { regions } = useRegions();
  const { loading, error, refreshAll } = useServiceReportRows();
  const { technicians, techById, loading: techLoading, error: techError, refresh: refreshTech } =
    useTechnicianDirectory();

  const [query, setQuery] = useState("");
  const [regionId, setRegionId] = useState("");
  const [technicianId, setTechnicianId] = useState("");
  const [bucket, setBucket] = useState<(typeof BUCKETS)[number]>("ALL");
  const [minDays, setMinDays] = useState("");

  const assignedRows = useMemo(
    () =>
      jobs
        .filter(isTechnicianAssignActive)
        .map((job) => {
          const assignDays = daysSince(job.assignedAt ?? job.inwardAt ?? job.createdAt);
          return { job, assignDays, bucket: assignAgingBucket(assignDays) };
        })
        .sort((a, b) => b.assignDays - a.assignDays),
    [jobs],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const min = Number(minDays);
    const hasMin = Number.isFinite(min) && minDays.trim() !== "";
    return assignedRows.filter(({ job, assignDays, bucket: rowBucket }) => {
      if (regionId && job.regionId !== regionId) return false;
      if (technicianId && job.assignedTechnicianId !== technicianId) return false;
      if (bucket !== "ALL" && rowBucket !== bucket) return false;
      if (hasMin && assignDays < min) return false;
      if (q) {
        const tech = technicianDisplay(job.assignedTechnicianId, techById);
        const hay =
          `${job.reference} ${job.customerName} ${job.phone} ${watchLabel(job)} ${job.serial} ${tech.name} ${job.status}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [assignedRows, query, regionId, technicianId, bucket, minDays, techById]);

  const csvRows = useMemo(
    () =>
      filtered.map(({ job, assignDays, bucket: rowBucket }) => {
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
          "Days Since Assign": assignDays,
          "Aging Bucket": rowBucket,
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
    for (const { job } of assignedRows) {
      const id = job.assignedTechnicianId ?? "";
      byTech.set(id, (byTech.get(id) ?? 0) + 1);
    }
    const overdue = assignedRows.filter((r) => r.assignDays >= 8).length;
    return {
      total: assignedRows.length,
      technicians: byTech.size,
      overdue,
      filtered: filtered.length,
    };
  }, [assignedRows, filtered.length]);

  function refreshPage() {
    void refreshAll();
    void refreshTech();
  }

  return (
    <div className="ui-page-bleed px-3 font-sans text-rlx-ink sm:px-4 md:px-5">
      <PageHeader
        title="Technician assign watch report"
        description="Tracking report — watches currently assigned to technicians and aging since assignment."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              to="/reports/technician-repaired-history"
              className="inline-flex border border-rlx-gold/60 bg-white px-4 py-2.5 text-sm font-semibold text-rlx-green transition hover:bg-rlx-green-light"
            >
              Repaired history →
            </Link>
            <button
              type="button"
              onClick={() =>
                downloadCsv(
                  `technician_assign_watch_${new Date().toISOString().slice(0, 10)}.csv`,
                  ASSIGN_CSV_COLUMNS,
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
          { label: "Assigned watches", value: kpis.total },
          { label: "Technicians active", value: kpis.technicians },
          { label: "8+ days on bench", value: kpis.overdue, warn: true },
          { label: "Filtered rows", value: kpis.filtered },
        ].map((kpi) => (
          <div key={kpi.label} className="border border-rlx-rule bg-white shadow-sm">
            <div className="border-b-2 border-rlx-gold bg-rlx-green px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white">{kpi.label}</p>
            </div>
            <p className={`px-3 py-3 text-lg font-semibold ${kpi.warn ? "text-amber-700" : "text-rlx-green"}`}>
              {kpi.value}
            </p>
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
        <FilterField label="Aging bucket">
          <select
            className="w-full rounded-lg border border-rlx-rule px-3 py-2 text-sm"
            value={bucket}
            onChange={(e) => setBucket(e.target.value as (typeof BUCKETS)[number])}
          >
            {BUCKETS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Min days since assign">
          <input
            type="number"
            min={0}
            className="w-full rounded-lg border border-rlx-rule px-3 py-2 text-sm"
            value={minDays}
            onChange={(e) => setMinDays(e.target.value)}
            placeholder="e.g. 7"
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
              {ASSIGN_CSV_COLUMNS.map((col) => (
                <th key={col} className="px-3 py-2.5">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading || techLoading ? (
              <tr>
                <td colSpan={ASSIGN_CSV_COLUMNS.length} className="px-3 py-8 text-center text-stone-500">
                  Loading report…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={ASSIGN_CSV_COLUMNS.length} className="px-3 py-8 text-center text-stone-500">
                  No watches currently assigned to technicians.
                </td>
              </tr>
            ) : (
              filtered.map(({ job, assignDays, bucket: rowBucket }) => {
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
                    <td className="px-3 py-2 tabular-nums font-semibold">{assignDays}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${bucketChipClass(rowBucket)}`}>
                        {rowBucket}
                      </span>
                    </td>
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
