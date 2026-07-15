import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { FilterField } from "../../components/ui/FilterField";
import { PageHeader } from "../../components/ui/PageHeader";
import { useRegions } from "../../context/RegionsContext";
import { useSrfJobs } from "../../context/SrfJobsContext";
import type { SrfJob, SrfJobStatus } from "../../types/srfJob";
import { downloadCsv, useServiceReportRows } from "./serviceReportUtils";

const CSV_COLUMNS = [
  "SR No",
  "Customer",
  "Phone",
  "Watch",
  "Serial",
  "Transfer Ref",
  "Inbound DC",
  "Outward DC",
  "Status",
  "From",
  "To",
  "Age (days)",
  "Created At",
];

const STATUS_LABELS: Record<string, string> = {
  in_transit_sc: "In transit to SC",
  awaiting_sc_inward: "Awaiting SC inward",
  received_at_sc: "Received at SC",
  sent_to_other_ho: "Sent to other HO",
  ready_for_outward: "Ready for outward",
  pending_store_transit: "Pending store transit",
  dispatched_to_store: "Dispatched to store",
  awaiting_store_inward: "Store inward pending",
  received_at_store: "Received at store",
  brand_credit_note_active: "Brand credit note active",
  brand_estimate_pending: "Brand estimate pending",
  closed: "Closed",
  cancelled: "Cancelled",
};

const btnIcon =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center border border-rlx-gold/60 bg-white text-rlx-green transition hover:border-rlx-gold hover:bg-rlx-green-light";
const modalIconGhost =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center border border-white/30 bg-white/10 text-white transition hover:bg-white/20";

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

function daysSince(iso?: string | null): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24)));
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function watchLabel(job: SrfJob): string {
  return [job.watchBrand, job.watchFamily, job.watchModel].filter(Boolean).join(" ");
}

function isTransferJob(j: SrfJob): boolean {
  return (
    Boolean(j.dcNumber) ||
    Boolean(j.outwardDcNumber) ||
    Boolean(j.transferSourceReference) ||
    j.status === "in_transit_sc" ||
    j.status === "dispatched_to_store" ||
    j.status === "sent_to_other_ho" ||
    j.status === "pending_ho_transit" ||
    j.status === "pending_store_transit" ||
    j.status === "awaiting_sc_inward" ||
    j.status === "awaiting_store_inward"
  );
}

type TimelineEvent = { at: string; label: string; detail?: string };

function buildTimeline(job: SrfJob): TimelineEvent[] {
  const events: TimelineEvent[] = [
    { at: job.createdAt, label: "SRF created", detail: job.createdBy ? `By ${job.createdBy}` : undefined },
    {
      at: job.dispatchedToScAt ?? "",
      label: "Dispatched to service centre",
      detail: job.dcNumber ? `Inbound DC ${job.dcNumber}` : undefined,
    },
    { at: job.inwardAt ?? "", label: "Received at service centre" },
    { at: job.assignedAt ?? "", label: "Technician assigned" },
    { at: job.estimateOkAt ?? "", label: "Estimate approved" },
    {
      at: job.brandSentAt ?? "",
      label: "Sent to brand / other HO",
      detail: job.transferSourceReference || job.brandOdcNumber || undefined,
    },
    { at: job.completedAtSc ?? "", label: "Repair completed at SC" },
    { at: job.readyForOutwardAt ?? "", label: "Ready for outward" },
    {
      at: job.dispatchedToStoreAt ?? "",
      label: "Dispatched to store",
      detail: job.outwardDcNumber ? `Outward DC ${job.outwardDcNumber}` : undefined,
    },
    { at: job.receivedBackAtStoreAt ?? "", label: "Received at store" },
    { at: job.closedAt ?? "", label: "SRF closed" },
  ];
  return events
    .filter((e) => e.at)
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

function ageChipClass(days: number): string {
  if (days >= 15) return "bg-rose-50 text-rose-800 ring-rose-300/70";
  if (days >= 7) return "bg-amber-50 text-amber-950 ring-amber-300/70";
  return "bg-sky-50 text-sky-900 ring-sky-300/70";
}

function IconDetails({ className = "h-[1.125rem] w-[1.125rem]" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
      />
    </svg>
  );
}

function IconClose({ className = "h-[1.125rem] w-[1.125rem]" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <tr className="border-b border-rlx-rule">
      <th className="w-40 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.12em] text-rlx-ink-muted align-top">
        {label}
      </th>
      <td className="px-3 py-2.5 text-sm text-rlx-ink">{value}</td>
    </tr>
  );
}

export function TransferReportPage() {
  const { jobs } = useSrfJobs();
  const { regions } = useRegions();
  const { loading, error, kpis, refreshAll } = useServiceReportRows();

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"ALL" | SrfJobStatus>("ALL");
  const [regionId, setRegionId] = useState("");
  const [leg, setLeg] = useState<"ALL" | "INBOUND" | "OUTWARD" | "INTER_HO">("ALL");
  const [minAge, setMinAge] = useState("");
  const [detail, setDetail] = useState<SrfJob | null>(null);

  const regionNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of regions) m.set(r.id, r.name);
    return m;
  }, [regions]);

  const storeNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of regions) {
      for (const s of r.stores) m.set(s.id, s.name);
    }
    return m;
  }, [regions]);

  function resolveRegion(id: string | null | undefined, fallback?: string | null): string {
    if (id && regionNameById.has(id)) return regionNameById.get(id)!;
    if (fallback) return fallback;
    return id || "—";
  }

  function resolveStore(id: string | null | undefined, fallback?: string | null): string {
    if (id && storeNameById.has(id)) return storeNameById.get(id)!;
    if (fallback) return fallback;
    return id || "—";
  }

  function fromLabel(j: SrfJob): string {
    if (j.transferSourceRegionId) return resolveRegion(j.transferSourceRegionId);
    if (j.transferSourceStoreId) return resolveStore(j.transferSourceStoreId);
    return resolveRegion(j.regionId, j.regionName);
  }

  function toLabel(j: SrfJob): string {
    if (j.transferTargetRegionId) return resolveRegion(j.transferTargetRegionId);
    if (j.transferTargetStoreId) return resolveStore(j.transferTargetStoreId);
    if (j.destinationStoreId) return resolveStore(j.destinationStoreId, j.storeName);
    return resolveStore(j.storeId, j.storeName);
  }

  const transferJobs = useMemo(
    () =>
      jobs
        .filter(isTransferJob)
        .map((j) => ({ job: j, ageDays: daysSince(j.createdAt) }))
        .sort((a, b) => b.ageDays - a.ageDays),
    [jobs],
  );

  const statusOptions = useMemo(() => {
    const set = new Set<SrfJobStatus>();
    for (const { job } of transferJobs) set.add(job.status);
    return Array.from(set).sort((a, b) => statusLabel(a).localeCompare(statusLabel(b)));
  }, [transferJobs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const minDays = Number(minAge);
    const hasMin = Number.isFinite(minDays) && minAge.trim() !== "";

    return transferJobs.filter(({ job, ageDays }) => {
      if (status !== "ALL" && job.status !== status) return false;
      if (regionId) {
        const related =
          job.regionId === regionId ||
          job.transferSourceRegionId === regionId ||
          job.transferTargetRegionId === regionId;
        if (!related) return false;
      }
      if (leg === "INBOUND" && !job.dcNumber && job.status !== "in_transit_sc" && job.status !== "awaiting_sc_inward") {
        return false;
      }
      if (
        leg === "OUTWARD" &&
        !job.outwardDcNumber &&
        job.status !== "dispatched_to_store" &&
        job.status !== "awaiting_store_inward" &&
        job.status !== "ready_for_outward"
      ) {
        return false;
      }
      if (
        leg === "INTER_HO" &&
        !job.transferSourceReference &&
        job.status !== "sent_to_other_ho" &&
        !job.transferSourceRegionId &&
        !job.transferTargetRegionId
      ) {
        return false;
      }
      if (hasMin && ageDays < minDays) return false;
      if (q) {
        const hay =
          `${job.reference} ${job.customerName} ${job.phone} ${watchLabel(job)} ${job.serial} ${job.dcNumber ?? ""} ${job.outwardDcNumber ?? ""} ${job.transferSourceReference ?? ""} ${fromLabel(job)} ${toLabel(job)} ${job.status}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // fromLabel/toLabel depend on maps; intentional
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transferJobs, query, status, regionId, leg, minAge, regionNameById, storeNameById]);

  function resetFilters() {
    setQuery("");
    setStatus("ALL");
    setRegionId("");
    setLeg("ALL");
    setMinAge("");
  }

  const csvRows = useMemo(
    () =>
      filtered.map(({ job, ageDays }) => ({
        "SR No": job.reference,
        Customer: job.customerName,
        Phone: job.phone,
        Watch: watchLabel(job),
        Serial: job.serial || "—",
        "Transfer Ref": job.transferSourceReference || "—",
        "Inbound DC": job.dcNumber || "—",
        "Outward DC": job.outwardDcNumber || "—",
        Status: statusLabel(job.status),
        From: fromLabel(job),
        To: toLabel(job),
        "Age (days)": ageDays,
        "Created At": formatDateTime(job.createdAt),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, regionNameById, storeNameById],
  );

  const timeline = detail ? buildTimeline(detail) : [];

  return (
    <div className="ui-page-bleed px-3 font-sans text-rlx-ink sm:px-4 md:px-5">
      <PageHeader
        title="Transfer report"
        description="Transfer lifecycle summary for SRFs moved between locations."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => downloadCsv(`transfer_${new Date().toISOString().slice(0, 10)}.csv`, CSV_COLUMNS, csvRows)}
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

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="border border-rlx-rule bg-white shadow-sm">
          <div className="border-b-2 border-rlx-gold bg-rlx-green px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white">Open SRFs</p>
          </div>
          <p className="px-3 py-3 text-lg font-semibold text-rlx-green">{kpis.openSrf}</p>
        </div>
        <div className="border border-rlx-rule bg-white shadow-sm">
          <div className="border-b-2 border-rlx-gold bg-rlx-green px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white">Not returned</p>
          </div>
          <p className="px-3 py-3 text-lg font-semibold text-amber-700">{kpis.notReturned}</p>
        </div>
        <div className="border border-rlx-rule bg-white shadow-sm">
          <div className="border-b-2 border-rlx-gold bg-rlx-green px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white">Pending jobs</p>
          </div>
          <p className="px-3 py-3 text-lg font-semibold text-rlx-green">{kpis.pending}</p>
        </div>
        <div className="border border-rlx-rule bg-white shadow-sm">
          <div className="border-b-2 border-rlx-gold bg-rlx-green px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white">Transfers</p>
          </div>
          <p className="px-3 py-3 text-lg font-semibold text-rlx-ink">{filtered.length}</p>
        </div>
      </div>

      <section className="mb-5 border border-rlx-rule bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rlx-rule bg-rlx-bg px-3 py-2.5 sm:px-4">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-rlx-ink-muted">Filters</h2>
          <button type="button" onClick={resetFilters} className="ui-btn-secondary">
            Reset
          </button>
        </div>
        <div className="ui-filter-grid p-3 sm:p-4">
          <FilterField label="Search" htmlFor="xfer-q" className="ui-filter-span-2-sm min-w-0">
            <input
              id="xfer-q"
              className="ui-field"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="SRF, customer, DC, transfer ref…"
            />
          </FilterField>
          <FilterField label="Status" htmlFor="xfer-status" className="min-w-0">
            <select
              id="xfer-status"
              className="ui-field"
              value={status}
              onChange={(e) => setStatus(e.target.value as "ALL" | SrfJobStatus)}
            >
              <option value="ALL">All statuses</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Leg" htmlFor="xfer-leg" className="min-w-0">
            <select
              id="xfer-leg"
              className="ui-field"
              value={leg}
              onChange={(e) => setLeg(e.target.value as typeof leg)}
            >
              <option value="ALL">All legs</option>
              <option value="INBOUND">Inbound (store → SC)</option>
              <option value="OUTWARD">Outward (SC → store)</option>
              <option value="INTER_HO">Inter-HO</option>
            </select>
          </FilterField>
          <FilterField label="Region" htmlFor="xfer-region" className="min-w-0">
            <select
              id="xfer-region"
              className="ui-field"
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
          <FilterField label="Min age (days)" htmlFor="xfer-min-age" className="min-w-0">
            <input
              id="xfer-min-age"
              type="number"
              min={0}
              className="ui-field"
              value={minAge}
              onChange={(e) => setMinAge(e.target.value)}
              placeholder="e.g. 7"
            />
          </FilterField>
        </div>
      </section>

      {error ? (
        <p className="mb-4 border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
      ) : null}

      {loading ? (
        <p className="text-sm text-rlx-ink-muted">Loading transfer data…</p>
      ) : filtered.length === 0 ? (
        <p className="border border-rlx-rule bg-white px-4 py-8 text-center text-sm text-rlx-ink-muted">
          No transfers match the current filters.
        </p>
      ) : (
        <>
          <p className="mb-2 text-xs text-rlx-ink-muted md:hidden">Swipe horizontally to see more columns →</p>
          <div className="ui-table-scroll border border-rlx-rule bg-white shadow-sm">
            <table className="ui-table-dense w-full min-w-[48rem] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-rlx-green text-[11px] font-semibold uppercase tracking-[0.14em] text-white">
                <tr className="border-b-2 border-rlx-gold">
                  <th className="whitespace-nowrap px-3 py-3 text-left font-semibold">SRF</th>
                  <th className="min-w-[10rem] px-3 py-3 text-left font-semibold">Customer</th>
                  <th className="min-w-[9rem] px-3 py-3 text-left font-semibold">Route</th>
                  <th className="whitespace-nowrap px-3 py-3 text-left font-semibold">DCs</th>
                  <th className="min-w-[8rem] px-3 py-3 text-left font-semibold">Status</th>
                  <th className="whitespace-nowrap px-3 py-3 text-right font-semibold">Age</th>
                  <th className="whitespace-nowrap px-3 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ job, ageDays }, idx) => (
                  <tr
                    key={job.id}
                    onClick={() => setDetail(job)}
                    className={`cursor-pointer border-b border-rlx-rule transition-colors hover:bg-rlx-green-light ${
                      idx % 2 === 1 ? "bg-rlx-bg" : "bg-white"
                    }`}
                  >
                    <td className="align-middle px-3 py-3">
                      <span className="block whitespace-nowrap font-mono text-sm font-semibold text-rlx-green">
                        {job.reference}
                      </span>
                      {job.transferSourceReference ? (
                        <span className="block font-mono text-xs text-rlx-ink-muted">{job.transferSourceReference}</span>
                      ) : null}
                    </td>
                    <td className="align-middle px-3 py-3">
                      <span className="block break-words text-sm font-medium leading-snug text-rlx-ink">
                        {job.customerName}
                      </span>
                      <span className="block break-words text-xs leading-snug text-rlx-ink-muted">{watchLabel(job)}</span>
                    </td>
                    <td className="align-middle px-3 py-3">
                      <span className="block break-words text-sm leading-snug text-rlx-ink">{fromLabel(job)}</span>
                      <span className="block break-words text-xs leading-snug text-rlx-ink-muted">→ {toLabel(job)}</span>
                    </td>
                    <td className="align-middle px-3 py-3">
                      <span className="block font-mono text-xs text-rlx-ink">In: {job.dcNumber || "—"}</span>
                      <span className="block font-mono text-xs text-rlx-ink-muted">Out: {job.outwardDcNumber || "—"}</span>
                    </td>
                    <td className="align-middle px-3 py-3">
                      <span className="inline-flex max-w-[11rem] rounded px-2 py-1 text-xs font-semibold leading-snug ring-1 ring-inset bg-rlx-bg text-rlx-ink ring-rlx-rule">
                        {statusLabel(job.status)}
                      </span>
                    </td>
                    <td className="align-middle px-3 py-3 text-right">
                      <span
                        className={`inline-flex min-w-[3.5rem] items-center justify-center rounded px-2 py-1 text-xs font-semibold tabular-nums ring-1 ring-inset ${ageChipClass(ageDays)}`}
                      >
                        {ageDays}d
                      </span>
                    </td>
                    <td className="align-middle px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => setDetail(job)}
                          className={btnIcon}
                          title="Details & history"
                          aria-label="Details and history"
                        >
                          <IconDetails />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-rlx-ink-muted">
            {filtered.length} of {transferJobs.length} transfer(s)
          </p>
        </>
      )}

      {detail ? (
        <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-rlx-ink/70 p-0 backdrop-blur-sm sm:items-center sm:p-3 md:p-5">
          <div className="flex h-[100dvh] w-full max-w-[96rem] flex-col overflow-hidden bg-white shadow-[0_32px_80px_-20px_rgba(0,0,0,0.5)] sm:h-[min(96dvh,56rem)] sm:max-h-[96dvh]">
            <div className="flex shrink-0 items-center justify-between gap-3 bg-rlx-green px-4 py-3 sm:px-6">
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-semibold uppercase tracking-[0.35em] text-rlx-gold">Transfer details</p>
                <h3 className="truncate font-mono text-base font-semibold text-white sm:text-lg">{detail.reference}</h3>
                <p className="mt-0.5 truncate text-xs text-white/65 sm:text-sm">
                  {fromLabel(detail)} → {toLabel(detail)} · {statusLabel(detail.status)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Link
                  to={`/service/srf-register?q=${encodeURIComponent(detail.reference)}`}
                  className="inline-flex border border-white/30 bg-white/10 px-3 py-2 text-xs font-semibold text-white no-underline transition hover:bg-white/20"
                >
                  Open SRF
                </Link>
                <button
                  type="button"
                  onClick={() => setDetail(null)}
                  className={modalIconGhost}
                  title="Close"
                  aria-label="Close"
                >
                  <IconClose />
                </button>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
              <div className="shrink-0 border-b border-rlx-rule p-4 sm:p-5 lg:w-[24rem] lg:overflow-y-auto lg:border-b-0 lg:border-r">
                <div className="overflow-hidden border border-rlx-rule">
                  <table className="w-full text-left">
                    <tbody className="odd:[&>tr]:bg-white even:[&>tr]:bg-rlx-bg">
                      <DetailRow
                        label="SRF"
                        value={<span className="font-mono font-semibold text-rlx-green">{detail.reference}</span>}
                      />
                      <DetailRow label="Status" value={statusLabel(detail.status)} />
                      <DetailRow label="Customer" value={detail.customerName} />
                      <DetailRow label="Phone" value={<span className="font-mono">{detail.phone || "—"}</span>} />
                      <DetailRow label="Watch" value={watchLabel(detail)} />
                      <DetailRow label="Serial" value={<span className="font-mono">{detail.serial || "—"}</span>} />
                      <DetailRow label="From" value={fromLabel(detail)} />
                      <DetailRow label="To" value={toLabel(detail)} />
                      <DetailRow
                        label="Transfer ref"
                        value={<span className="font-mono">{detail.transferSourceReference || "—"}</span>}
                      />
                      <DetailRow label="Inbound DC" value={<span className="font-mono">{detail.dcNumber || "—"}</span>} />
                      <DetailRow
                        label="Outward DC"
                        value={<span className="font-mono">{detail.outwardDcNumber || "—"}</span>}
                      />
                      <DetailRow label="Dispatched to SC" value={formatDateTime(detail.dispatchedToScAt)} />
                      <DetailRow label="SC inward" value={formatDateTime(detail.inwardAt)} />
                      <DetailRow label="Dispatched to store" value={formatDateTime(detail.dispatchedToStoreAt)} />
                      <DetailRow label="Store received" value={formatDateTime(detail.receivedBackAtStoreAt)} />
                      <DetailRow label="Age" value={`${daysSince(detail.createdAt)} day(s)`} />
                      <DetailRow label="Complaint" value={detail.complaint || "—"} />
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex min-h-0 min-w-0 flex-1 flex-col p-4 sm:p-5">
                <h4 className="mb-3 shrink-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-rlx-ink-muted">
                  Full transfer history
                </h4>
                {timeline.length === 0 ? (
                  <p className="border border-rlx-rule bg-rlx-bg px-3 py-6 text-center text-sm text-rlx-ink-muted">
                    No timeline events recorded.
                  </p>
                ) : (
                  <div className="min-h-0 flex-1 overflow-auto border border-rlx-rule">
                    <table className="w-full table-fixed text-left text-sm">
                      <colgroup>
                        <col className="w-[11rem]" />
                        <col className="w-[14rem]" />
                        <col />
                      </colgroup>
                      <thead className="sticky top-0 z-10 bg-rlx-bg text-[11px] font-semibold uppercase tracking-[0.12em] text-rlx-ink-muted">
                        <tr className="border-b border-rlx-rule">
                          <th className="px-3 py-2.5 text-left">When</th>
                          <th className="px-3 py-2.5 text-left">Event</th>
                          <th className="px-3 py-2.5 text-left">Detail</th>
                        </tr>
                      </thead>
                      <tbody>
                        {timeline.map((ev, idx) => (
                          <tr
                            key={`${ev.label}-${ev.at}`}
                            className={`border-b border-rlx-rule ${idx % 2 === 1 ? "bg-rlx-bg" : "bg-white"}`}
                          >
                            <td className="px-3 py-2.5 align-top text-xs text-rlx-ink-muted">{formatDateTime(ev.at)}</td>
                            <td className="px-3 py-2.5 align-top text-sm font-medium">{ev.label}</td>
                            <td className="break-words px-3 py-2.5 align-top text-sm text-rlx-ink-muted">
                              {ev.detail || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
