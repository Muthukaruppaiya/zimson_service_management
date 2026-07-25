import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FilterField } from "../../components/ui/FilterField";
import { PageHeader } from "../../components/ui/PageHeader";
import { useRegions } from "../../context/RegionsContext";
import { useSrfJobs } from "../../context/SrfJobsContext";
import type { SrfJobStatus } from "../../types/srfJob";
import { downloadCsv, useServiceReportRows } from "./serviceReportUtils";
import {
  UNASSIGNED_CSV_COLUMNS,
  assignAgingBucket,
  daysSince,
  formatDateTime,
  isUnassignedWatch,
  repairRouteLabel,
  unassignedStatusLabel,
  watchLabel,
} from "./technicianReportUtils";

const BUCKETS = ["ALL", "0-3 days", "4-7 days", "8-14 days", "15-30 days", "30+ days"] as const;

const STAGE_OPTIONS: Array<{ value: "ALL" | SrfJobStatus; label: string }> = [
  { value: "ALL", label: "All unassigned" },
  { value: "received_at_sc", label: "HO received — pending assign" },
  { value: "store_self_pending", label: "In-store — pending assign" },
];

function bucketChipClass(bucket: string): string {
  if (bucket === "30+ days" || bucket === "15-30 days") return "bg-rose-50 text-rose-800 ring-rose-300/70";
  if (bucket === "8-14 days") return "bg-amber-50 text-amber-950 ring-amber-300/70";
  if (bucket === "4-7 days") return "bg-sky-50 text-sky-900 ring-sky-300/70";
  return "bg-emerald-50 text-emerald-900 ring-emerald-300/70";
}

function inwardAt(job: { inwardAt?: string | null; createdAt: string }): string {
  return job.inwardAt ?? job.createdAt;
}

export function UnassignedWatchReportPage() {
  const { jobs } = useSrfJobs();
  const { regions } = useRegions();
  const { loading, error, refreshAll } = useServiceReportRows();

  const [query, setQuery] = useState("");
  const [regionId, setRegionId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [stage, setStage] = useState<(typeof STAGE_OPTIONS)[number]["value"]>("ALL");
  const [bucket, setBucket] = useState<(typeof BUCKETS)[number]>("ALL");
  const [minDays, setMinDays] = useState("");

  const unassignedRows = useMemo(
    () =>
      jobs
        .filter(isUnassignedWatch)
        .map((job) => {
          const receivedIso = inwardAt(job);
          const waitDays = daysSince(receivedIso);
          return { job, waitDays, bucket: assignAgingBucket(waitDays), receivedIso };
        })
        .sort((a, b) => b.waitDays - a.waitDays),
    [jobs],
  );

  const storeOptions = useMemo(() => {
    const opts: { id: string; name: string }[] = [];
    for (const r of regions) {
      if (regionId && r.id !== regionId) continue;
      for (const s of r.stores) opts.push({ id: s.id, name: s.name });
    }
    return opts.sort((a, b) => a.name.localeCompare(b.name));
  }, [regions, regionId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const min = Number(minDays);
    const hasMin = Number.isFinite(min) && minDays.trim() !== "";
    return unassignedRows.filter(({ job, waitDays, bucket: rowBucket }) => {
      if (regionId && job.regionId !== regionId) return false;
      if (storeId && job.storeId !== storeId) return false;
      if (stage !== "ALL" && job.status !== stage) return false;
      if (bucket !== "ALL" && rowBucket !== bucket) return false;
      if (hasMin && waitDays < min) return false;
      if (q) {
        const hay =
          `${job.reference} ${job.customerName} ${job.phone} ${watchLabel(job)} ${job.serial} ${unassignedStatusLabel(job)} ${job.regionName ?? ""} ${job.storeName ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [unassignedRows, query, regionId, storeId, stage, bucket, minDays]);

  const csvRows = useMemo(
    () =>
      filtered.map(({ job, waitDays, bucket: rowBucket, receivedIso }) => ({
        "SR No": job.reference,
        Customer: job.customerName,
        Phone: job.phone,
        Watch: watchLabel(job),
        Serial: job.serial || "—",
        "Unassigned Status": unassignedStatusLabel(job),
        "Received At": formatDateTime(receivedIso),
        "Days Since Inward": waitDays,
        "Aging Bucket": rowBucket,
        "Repair Route": repairRouteLabel(job),
        Region: job.regionName || job.regionId,
        Store: job.storeName || job.storeId,
        "Inbound DC": job.dcNumber || "—",
      })),
    [filtered],
  );

  const kpis = useMemo(() => {
    const ho = unassignedRows.filter((r) => r.job.status === "received_at_sc").length;
    const store = unassignedRows.filter((r) => r.job.status === "store_self_pending").length;
    const overdue = unassignedRows.filter((r) => r.waitDays >= 3).length;
    return {
      total: unassignedRows.length,
      ho,
      store,
      overdue,
      filtered: filtered.length,
    };
  }, [unassignedRows, filtered.length]);

  return (
    <div className="ui-page-bleed px-3 font-sans text-rlx-ink sm:px-4 md:px-5">
      <PageHeader
        title="Unassigned watch report"
        description="Watches inwarded at HO or store but not yet assigned to a technician."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              to="/reports/technician-assign-watch"
              className="inline-flex border border-rlx-gold/60 bg-white px-4 py-2.5 text-sm font-semibold text-rlx-green transition hover:bg-rlx-green-light"
            >
              Assigned watches →
            </Link>
            <button
              type="button"
              onClick={() =>
                downloadCsv(
                  `unassigned_watches_${new Date().toISOString().slice(0, 10)}.csv`,
                  UNASSIGNED_CSV_COLUMNS,
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
              onClick={() => void refreshAll()}
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

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Unassigned total", value: kpis.total },
          { label: "HO — pending assign", value: kpis.ho },
          { label: "Store — pending assign", value: kpis.store },
          { label: "3+ days waiting", value: kpis.overdue, warn: true },
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

      <div className="mb-4 grid gap-3 rounded-xl border border-rlx-rule bg-white p-4 shadow-sm md:grid-cols-2 lg:grid-cols-6">
        <FilterField label="Search">
          <input
            className="w-full rounded-lg border border-rlx-rule px-3 py-2 text-sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="SRF, customer, watch…"
          />
        </FilterField>
        <FilterField label="Region">
          <select
            className="w-full rounded-lg border border-rlx-rule px-3 py-2 text-sm"
            value={regionId}
            onChange={(e) => {
              setRegionId(e.target.value);
              setStoreId("");
            }}
          >
            <option value="">All regions</option>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Store">
          <select
            className="w-full rounded-lg border border-rlx-rule px-3 py-2 text-sm"
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
          >
            <option value="">All stores</option>
            {storeOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Stage">
          <select
            className="w-full rounded-lg border border-rlx-rule px-3 py-2 text-sm"
            value={stage}
            onChange={(e) => setStage(e.target.value as (typeof STAGE_OPTIONS)[number]["value"])}
          >
            {STAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
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
        <FilterField label="Min days waiting">
          <input
            type="number"
            min={0}
            className="w-full rounded-lg border border-rlx-rule px-3 py-2 text-sm"
            value={minDays}
            onChange={(e) => setMinDays(e.target.value)}
            placeholder="e.g. 3"
          />
        </FilterField>
      </div>

      {error ? (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-rlx-rule bg-white shadow-sm">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead>
            <tr className="border-b border-rlx-rule bg-rlx-green text-[10px] font-semibold uppercase tracking-[0.14em] text-white">
              {UNASSIGNED_CSV_COLUMNS.map((col) => (
                <th key={col} className="px-3 py-2.5">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={UNASSIGNED_CSV_COLUMNS.length} className="px-3 py-8 text-center text-stone-500">
                  Loading report…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={UNASSIGNED_CSV_COLUMNS.length} className="px-3 py-8 text-center text-stone-500">
                  No unassigned watches for the selected filters.
                </td>
              </tr>
            ) : (
              filtered.map(({ job, waitDays, bucket: rowBucket, receivedIso }) => (
                <tr key={job.id} className="border-b border-rlx-rule/60 hover:bg-rlx-green-light/20">
                  <td className="px-3 py-2 font-mono text-xs font-semibold">{job.reference}</td>
                  <td className="px-3 py-2">{job.customerName}</td>
                  <td className="px-3 py-2">{job.phone}</td>
                  <td className="px-3 py-2">{watchLabel(job)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{job.serial || "—"}</td>
                  <td className="px-3 py-2 text-xs font-medium text-zimson-800">{unassignedStatusLabel(job)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(receivedIso)}</td>
                  <td className="px-3 py-2 tabular-nums font-semibold">{waitDays}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${bucketChipClass(rowBucket)}`}
                    >
                      {rowBucket}
                    </span>
                  </td>
                  <td className="px-3 py-2">{repairRouteLabel(job)}</td>
                  <td className="px-3 py-2">{job.regionName || job.regionId}</td>
                  <td className="px-3 py-2">{job.storeName || job.storeId}</td>
                  <td className="px-3 py-2 font-mono text-xs">{job.dcNumber || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
