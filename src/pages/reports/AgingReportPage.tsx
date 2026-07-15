import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { FilterField } from "../../components/ui/FilterField";
import { PageHeader } from "../../components/ui/PageHeader";
import { useRegions } from "../../context/RegionsContext";
import { useSrfJobs } from "../../context/SrfJobsContext";
import { ApiError, apiJson } from "../../lib/api";
import type { SparePart, SpareStockRow } from "../../types/spare";
import type { SrfJob } from "../../types/srfJob";
import { downloadCsv, useServiceReportRows } from "./serviceReportUtils";

type OverviewRow = {
  spare: SparePart;
  stock: SpareStockRow[];
};

type StockHistoryRow = {
  id: string;
  eventType: string;
  locationType: "HO" | "STORE" | null;
  regionId: string | null;
  storeId: string | null;
  quantityChange: number | null;
  balanceAfter: number | null;
  referenceType: string | null;
  referenceNumber: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
  regionName?: string | null;
  storeName?: string | null;
};

type InvAgingLine = {
  spareId: string;
  sku: string;
  name: string;
  category: string;
  qty: number;
  lastMovementAt: string | null;
  ageDays: number;
  bucket: string;
};

type TimelineEvent = { at: string; label: string; detail?: string };

const SRF_CSV = ["SR No", "Customer", "Phone", "Watch", "Serial", "Status", "Created At", "Age (days)", "Aging Bucket", "Region", "Store"];
const INV_CSV = ["SKU", "Item", "Category", "Stock Qty", "Last Movement", "Age (days)", "Aging Bucket"];

const BUCKETS = ["ALL", "0-7 days", "8-15 days", "16-30 days", "31-60 days", "60+ days"] as const;

const btnIcon =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center border border-rlx-gold/60 bg-white text-rlx-green transition hover:border-rlx-gold hover:bg-rlx-green-light";
const modalIconGhost =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center border border-white/30 bg-white/10 text-white transition hover:bg-white/20";

function daysSince(iso?: string | null): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24)));
}

function agingBucket(days: number): string {
  if (days <= 7) return "0-7 days";
  if (days <= 15) return "8-15 days";
  if (days <= 30) return "16-30 days";
  if (days <= 60) return "31-60 days";
  return "60+ days";
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

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

function bucketChipClass(bucket: string): string {
  if (bucket === "60+ days" || bucket === "31-60 days") return "bg-rose-50 text-rose-800 ring-rose-300/70";
  if (bucket === "16-30 days") return "bg-amber-50 text-amber-950 ring-amber-300/70";
  if (bucket === "8-15 days") return "bg-sky-50 text-sky-900 ring-sky-300/70";
  return "bg-emerald-50 text-emerald-900 ring-emerald-300/70";
}

function eventLabel(eventType: string) {
  if (eventType === "SPARE_CREATED") return "Spare created";
  if (eventType === "MANUAL_STOCK_SET") return "Manual stock update";
  if (eventType === "PURCHASE_IN") return "Purchase inward";
  if (eventType === "TRANSFER_OUT") return "Transfer out";
  if (eventType === "TRANSFER_IN") return "Transfer in";
  return eventType;
}

function buildSrfTimeline(job: SrfJob): TimelineEvent[] {
  const events: TimelineEvent[] = [
    { at: job.createdAt, label: "SRF created", detail: job.createdBy ? `By ${job.createdBy}` : undefined },
    {
      at: job.dispatchedToScAt ?? "",
      label: "Dispatched to service centre",
      detail: job.dcNumber ? `DC ${job.dcNumber}` : undefined,
    },
    { at: job.inwardAt ?? "", label: "Received at service centre" },
    { at: job.assignedAt ?? "", label: "Technician assigned" },
    { at: job.estimateOkAt ?? "", label: "Estimate approved" },
    { at: job.brandSentAt ?? "", label: "Sent to brand" },
    { at: job.brandEstimateReceivedAt ?? "", label: "Brand estimate received" },
    { at: job.brandCreditNoteApprovedAt ?? "", label: "Brand credit note approved" },
    { at: job.completedAtSc ?? "", label: "Repair completed at SC" },
    { at: job.readyForOutwardAt ?? "", label: "Ready for outward" },
    {
      at: job.dispatchedToStoreAt ?? "",
      label: "Dispatched to store",
      detail: job.outwardDcNumber ? `ODC ${job.outwardDcNumber}` : undefined,
    },
    { at: job.receivedBackAtStoreAt ?? "", label: "Received at store" },
    { at: job.closedAt ?? "", label: "SRF closed" },
  ];
  return events
    .filter((e) => e.at)
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
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

export function AgingReportPage() {
  const { jobs } = useSrfJobs();
  const { regions } = useRegions();
  const { loading, error, kpis, refreshAll } = useServiceReportRows();

  const [invLines, setInvLines] = useState<InvAgingLine[]>([]);
  const [invLoading, setInvLoading] = useState(false);
  const [invError, setInvError] = useState<string | null>(null);

  const [srfQuery, setSrfQuery] = useState("");
  const [srfRegionId, setSrfRegionId] = useState("");
  const [srfBucket, setSrfBucket] = useState<(typeof BUCKETS)[number]>("ALL");
  const [srfMinAge, setSrfMinAge] = useState("");

  const [invQuery, setInvQuery] = useState("");
  const [invCategory, setInvCategory] = useState("");
  const [invBucket, setInvBucket] = useState<(typeof BUCKETS)[number]>("ALL");
  const [invMinAge, setInvMinAge] = useState("");

  const [srfDetail, setSrfDetail] = useState<SrfJob | null>(null);
  const [invDetail, setInvDetail] = useState<InvAgingLine | null>(null);
  const [invHistory, setInvHistory] = useState<StockHistoryRow[]>([]);
  const [invHistoryLoading, setInvHistoryLoading] = useState(false);
  const [invHistoryError, setInvHistoryError] = useState<string | null>(null);

  const storeNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of regions) {
      for (const s of r.stores) m.set(s.id, s.name);
    }
    return m;
  }, [regions]);

  const regionNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of regions) m.set(r.id, r.name);
    return m;
  }, [regions]);

  const loadInventory = useCallback(async () => {
    setInvLoading(true);
    setInvError(null);
    try {
      const data = await apiJson<{ rows: OverviewRow[] }>("/api/inventory/stock-price-overview");
      const lines: InvAgingLine[] = [];
      for (const row of data.rows ?? []) {
        const qty = (row.stock ?? []).reduce((sum, s) => sum + Number(s.quantity ?? 0), 0);
        if (qty <= 0) continue;
        let last = row.spare.createdAt;
        for (const s of row.stock ?? []) {
          if (s.updatedAt && new Date(s.updatedAt).getTime() > new Date(last).getTime()) last = s.updatedAt;
        }
        const ageDays = daysSince(last);
        lines.push({
          spareId: row.spare.id,
          sku: row.spare.sku,
          name: row.spare.name,
          category: row.spare.category || "—",
          qty,
          lastMovementAt: last || null,
          ageDays,
          bucket: agingBucket(ageDays),
        });
      }
      lines.sort((a, b) => b.ageDays - a.ageDays);
      setInvLines(lines);
    } catch (e) {
      setInvLines([]);
      setInvError(e instanceof ApiError ? e.message : "Could not load inventory aging.");
    } finally {
      setInvLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInventory();
  }, [loadInventory]);

  const openJobs = useMemo(
    () =>
      jobs
        .filter((j) => j.status !== "closed" && j.status !== "cancelled")
        .map((j) => {
          const ageDays = daysSince(j.createdAt);
          return { job: j, ageDays, bucket: agingBucket(ageDays) };
        })
        .sort((a, b) => b.ageDays - a.ageDays),
    [jobs],
  );

  const filteredSrf = useMemo(() => {
    const q = srfQuery.trim().toLowerCase();
    const minAge = Number(srfMinAge);
    const hasMin = Number.isFinite(minAge) && srfMinAge.trim() !== "";
    return openJobs.filter(({ job, ageDays, bucket }) => {
      if (srfRegionId && job.regionId !== srfRegionId) return false;
      if (srfBucket !== "ALL" && bucket !== srfBucket) return false;
      if (hasMin && ageDays < minAge) return false;
      if (q) {
        const hay = `${job.reference} ${job.customerName} ${job.phone} ${watchLabel(job)} ${job.serial} ${job.status} ${job.regionName ?? ""} ${job.storeName ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [openJobs, srfQuery, srfRegionId, srfBucket, srfMinAge]);

  const invCategories = useMemo(() => {
    const set = new Set<string>();
    for (const line of invLines) {
      if (line.category && line.category !== "—") set.add(line.category);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [invLines]);

  const filteredInv = useMemo(() => {
    const q = invQuery.trim().toLowerCase();
    const minAge = Number(invMinAge);
    const hasMin = Number.isFinite(minAge) && invMinAge.trim() !== "";
    return invLines.filter((line) => {
      if (invCategory && line.category !== invCategory) return false;
      if (invBucket !== "ALL" && line.bucket !== invBucket) return false;
      if (hasMin && line.ageDays < minAge) return false;
      if (q) {
        const hay = `${line.sku} ${line.name} ${line.category}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [invLines, invQuery, invCategory, invBucket, invMinAge]);

  async function openInvDetail(line: InvAgingLine) {
    setInvDetail(line);
    setInvHistoryLoading(true);
    setInvHistoryError(null);
    try {
      const data = await apiJson<{ history: StockHistoryRow[] }>(
        `/api/catalog/spares/${encodeURIComponent(line.spareId)}/stock-history?limit=200`,
      );
      setInvHistory(data.history ?? []);
    } catch (e) {
      setInvHistory([]);
      setInvHistoryError(e instanceof ApiError ? e.message : "Could not load stock history.");
    } finally {
      setInvHistoryLoading(false);
    }
  }

  const srfCsv = useMemo(
    () =>
      filteredSrf.map(({ job, ageDays, bucket }) => ({
        "SR No": job.reference,
        Customer: job.customerName,
        Phone: job.phone,
        Watch: watchLabel(job),
        Serial: job.serial || "—",
        Status: statusLabel(job.status),
        "Created At": formatDateTime(job.createdAt),
        "Age (days)": ageDays,
        "Aging Bucket": bucket,
        Region: job.regionName || job.regionId,
        Store: job.storeName || job.storeId,
      })),
    [filteredSrf],
  );

  const invCsv = useMemo(
    () =>
      filteredInv.map((line) => ({
        SKU: line.sku,
        Item: line.name,
        Category: line.category,
        "Stock Qty": line.qty,
        "Last Movement": formatDateTime(line.lastMovementAt),
        "Age (days)": line.ageDays,
        "Aging Bucket": line.bucket,
      })),
    [filteredInv],
  );

  function exportAll() {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`aging_srf_${stamp}.csv`, SRF_CSV, srfCsv);
    if (invCsv.length > 0) downloadCsv(`aging_inventory_${stamp}.csv`, INV_CSV, invCsv);
  }

  const srfTimeline = srfDetail ? buildSrfTimeline(srfDetail) : [];

  return (
    <div className="ui-page-bleed px-3 font-sans text-rlx-ink sm:px-4 md:px-5">
      <PageHeader
        title="Aging report"
        description="Aging view of open SRFs by days and bucket, plus inventory item aging."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={exportAll}
              className="inline-flex border border-rlx-rule bg-white px-4 py-2.5 text-sm font-semibold text-rlx-green transition hover:border-rlx-green hover:bg-rlx-green-light disabled:opacity-40"
              disabled={filteredSrf.length === 0 && filteredInv.length === 0}
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => {
                void refreshAll();
                void loadInventory();
              }}
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
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white">Inventory lines</p>
          </div>
          <p className="px-3 py-3 text-lg font-semibold text-rlx-ink">{filteredInv.length}</p>
        </div>
      </div>

      {error ? (
        <p className="mb-4 border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
      ) : null}

      {/* ── Inventory aging ─────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-rlx-ink-muted">
          Inventory item aging
        </h2>

        <div className="mb-4 border border-rlx-rule bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rlx-rule bg-rlx-bg px-3 py-2.5 sm:px-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-rlx-ink-muted">Filters</p>
            <button
              type="button"
              onClick={() => {
                setInvQuery("");
                setInvCategory("");
                setInvBucket("ALL");
                setInvMinAge("");
              }}
              className="ui-btn-secondary"
            >
              Reset
            </button>
          </div>
          <div className="ui-filter-grid p-3 sm:p-4">
            <FilterField label="Search" htmlFor="aging-inv-q" className="ui-filter-span-2-sm min-w-0">
              <input
                id="aging-inv-q"
                className="ui-field"
                value={invQuery}
                onChange={(e) => setInvQuery(e.target.value)}
                placeholder="SKU, item, category…"
              />
            </FilterField>
            <FilterField label="Category" htmlFor="aging-inv-cat" className="min-w-0">
              <select
                id="aging-inv-cat"
                className="ui-field"
                value={invCategory}
                onChange={(e) => setInvCategory(e.target.value)}
              >
                <option value="">All categories</option>
                {invCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Aging bucket" htmlFor="aging-inv-bucket" className="min-w-0">
              <select
                id="aging-inv-bucket"
                className="ui-field"
                value={invBucket}
                onChange={(e) => setInvBucket(e.target.value as (typeof BUCKETS)[number])}
              >
                {BUCKETS.map((b) => (
                  <option key={b} value={b}>
                    {b === "ALL" ? "All buckets" : b}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Min age (days)" htmlFor="aging-inv-min" className="min-w-0">
              <input
                id="aging-inv-min"
                type="number"
                min={0}
                className="ui-field"
                value={invMinAge}
                onChange={(e) => setInvMinAge(e.target.value)}
                placeholder="e.g. 15"
              />
            </FilterField>
          </div>
        </div>

        {invError ? (
          <p className="mb-3 border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{invError}</p>
        ) : null}

        {invLoading ? (
          <p className="text-sm text-rlx-ink-muted">Loading inventory aging…</p>
        ) : filteredInv.length === 0 ? (
          <p className="border border-rlx-rule bg-white px-4 py-8 text-center text-sm text-rlx-ink-muted">
            No inventory stock aging rows.
          </p>
        ) : (
          <div className="ui-table-scroll border border-rlx-rule bg-white shadow-sm">
            <table className="ui-table-dense w-full min-w-[40rem] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-rlx-green text-[11px] font-semibold uppercase tracking-[0.14em] text-white">
                <tr className="border-b-2 border-rlx-gold">
                  <th className="whitespace-nowrap px-3 py-3 text-left font-semibold">SKU</th>
                  <th className="min-w-[12rem] px-3 py-3 text-left font-semibold">Item</th>
                  <th className="whitespace-nowrap px-3 py-3 text-right font-semibold">Qty</th>
                  <th className="whitespace-nowrap px-3 py-3 text-right font-semibold">Age</th>
                  <th className="whitespace-nowrap px-3 py-3 text-left font-semibold">Bucket</th>
                  <th className="whitespace-nowrap px-3 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredInv.map((line, idx) => (
                  <tr
                    key={line.spareId}
                    onClick={() => void openInvDetail(line)}
                    className={`cursor-pointer border-b border-rlx-rule transition-colors hover:bg-rlx-green-light ${
                      idx % 2 === 1 ? "bg-rlx-bg" : "bg-white"
                    }`}
                  >
                    <td className="align-middle px-3 py-3">
                      <span className="font-mono text-sm font-semibold text-rlx-green">{line.sku}</span>
                    </td>
                    <td className="align-middle px-3 py-3">
                      <span className="block break-words text-sm font-medium text-rlx-ink">{line.name}</span>
                      <span className="block text-xs text-rlx-ink-muted">{line.category}</span>
                    </td>
                    <td className="align-middle px-3 py-3 text-right text-sm font-semibold tabular-nums text-rlx-green">
                      {line.qty.toLocaleString()}
                    </td>
                    <td className="align-middle px-3 py-3 text-right text-sm font-semibold tabular-nums">{line.ageDays}d</td>
                    <td className="align-middle px-3 py-3">
                      <span
                        className={`inline-flex rounded px-2 py-1 text-xs font-semibold ring-1 ring-inset ${bucketChipClass(line.bucket)}`}
                      >
                        {line.bucket}
                      </span>
                    </td>
                    <td className="align-middle px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          className={btnIcon}
                          title="Details & history"
                          aria-label="Details and history"
                          onClick={() => void openInvDetail(line)}
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
        )}
        {!invLoading && filteredInv.length > 0 ? (
          <p className="mt-2 text-sm text-rlx-ink-muted">
            {filteredInv.length} of {invLines.length} inventory line(s)
          </p>
        ) : null}
      </section>

      {/* ── SRF aging ───────────────────────────────────────────── */}
      <section className="mb-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-rlx-ink-muted">SRF aging</h2>

        <div className="mb-4 border border-rlx-rule bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rlx-rule bg-rlx-bg px-3 py-2.5 sm:px-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-rlx-ink-muted">Filters</p>
            <button
              type="button"
              onClick={() => {
                setSrfQuery("");
                setSrfRegionId("");
                setSrfBucket("ALL");
                setSrfMinAge("");
              }}
              className="ui-btn-secondary"
            >
              Reset
            </button>
          </div>
          <div className="ui-filter-grid p-3 sm:p-4">
            <FilterField label="Search" htmlFor="aging-srf-q" className="ui-filter-span-2-sm min-w-0">
              <input
                id="aging-srf-q"
                className="ui-field"
                value={srfQuery}
                onChange={(e) => setSrfQuery(e.target.value)}
                placeholder="SRF, customer, phone, watch…"
              />
            </FilterField>
            <FilterField label="Region" htmlFor="aging-srf-region" className="min-w-0">
              <select
                id="aging-srf-region"
                className="ui-field"
                value={srfRegionId}
                onChange={(e) => setSrfRegionId(e.target.value)}
              >
                <option value="">All regions</option>
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Aging bucket" htmlFor="aging-srf-bucket" className="min-w-0">
              <select
                id="aging-srf-bucket"
                className="ui-field"
                value={srfBucket}
                onChange={(e) => setSrfBucket(e.target.value as (typeof BUCKETS)[number])}
              >
                {BUCKETS.map((b) => (
                  <option key={b} value={b}>
                    {b === "ALL" ? "All buckets" : b}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Min age (days)" htmlFor="aging-srf-min" className="min-w-0">
              <input
                id="aging-srf-min"
                type="number"
                min={0}
                className="ui-field"
                value={srfMinAge}
                onChange={(e) => setSrfMinAge(e.target.value)}
                placeholder="e.g. 7"
              />
            </FilterField>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-rlx-ink-muted">Loading SRF aging…</p>
        ) : filteredSrf.length === 0 ? (
          <p className="border border-rlx-rule bg-white px-4 py-8 text-center text-sm text-rlx-ink-muted">
            No open SRFs match the current filters.
          </p>
        ) : (
          <div className="ui-table-scroll border border-rlx-rule bg-white shadow-sm">
            <table className="ui-table-dense w-full min-w-[48rem] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-rlx-green text-[11px] font-semibold uppercase tracking-[0.14em] text-white">
                <tr className="border-b-2 border-rlx-gold">
                  <th className="whitespace-nowrap px-3 py-3 text-left font-semibold">SRF</th>
                  <th className="min-w-[10rem] px-3 py-3 text-left font-semibold">Customer</th>
                  <th className="min-w-[10rem] px-3 py-3 text-left font-semibold">Watch</th>
                  <th className="min-w-[8rem] px-3 py-3 text-left font-semibold">Status</th>
                  <th className="whitespace-nowrap px-3 py-3 text-right font-semibold">Age</th>
                  <th className="whitespace-nowrap px-3 py-3 text-left font-semibold">Bucket</th>
                  <th className="whitespace-nowrap px-3 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSrf.map(({ job, ageDays, bucket }, idx) => (
                  <tr
                    key={job.id}
                    onClick={() => setSrfDetail(job)}
                    className={`cursor-pointer border-b border-rlx-rule transition-colors hover:bg-rlx-green-light ${
                      idx % 2 === 1 ? "bg-rlx-bg" : "bg-white"
                    }`}
                  >
                    <td className="align-middle px-3 py-3">
                      <span className="block font-mono text-sm font-semibold text-rlx-green">{job.reference}</span>
                      <span className="block text-xs text-rlx-ink-muted">{job.regionName || job.regionId}</span>
                    </td>
                    <td className="align-middle px-3 py-3">
                      <span className="block break-words text-sm font-medium text-rlx-ink">{job.customerName}</span>
                      <span className="block text-xs text-rlx-ink-muted">{job.phone}</span>
                    </td>
                    <td className="align-middle px-3 py-3">
                      <span className="block break-words text-sm text-rlx-ink">{watchLabel(job)}</span>
                      <span className="block font-mono text-xs text-rlx-ink-muted">{job.serial || "—"}</span>
                    </td>
                    <td className="align-middle px-3 py-3">
                      <span className="block break-words text-xs font-medium capitalize text-rlx-ink">
                        {statusLabel(job.status)}
                      </span>
                    </td>
                    <td className="align-middle px-3 py-3 text-right text-sm font-semibold tabular-nums">{ageDays}d</td>
                    <td className="align-middle px-3 py-3">
                      <span
                        className={`inline-flex rounded px-2 py-1 text-xs font-semibold ring-1 ring-inset ${bucketChipClass(bucket)}`}
                      >
                        {bucket}
                      </span>
                    </td>
                    <td className="align-middle px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          className={btnIcon}
                          title="Details & history"
                          aria-label="Details and history"
                          onClick={() => setSrfDetail(job)}
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
        )}
        {!loading && filteredSrf.length > 0 ? (
          <p className="mt-2 text-sm text-rlx-ink-muted">
            {filteredSrf.length} of {openJobs.length} open SRF(s)
          </p>
        ) : null}
      </section>

      {/* ── Inventory detail modal ──────────────────────────────── */}
      {invDetail ? (
        <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-rlx-ink/70 p-0 backdrop-blur-sm sm:items-center sm:p-3 md:p-5">
          <div className="flex h-[100dvh] w-full max-w-[96rem] flex-col overflow-hidden bg-white shadow-[0_32px_80px_-20px_rgba(0,0,0,0.5)] sm:h-[min(96dvh,56rem)] sm:max-h-[96dvh]">
            <div className="flex shrink-0 items-center justify-between gap-3 bg-rlx-green px-4 py-3 sm:px-6">
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-semibold uppercase tracking-[0.35em] text-rlx-gold">Inventory aging</p>
                <h3 className="truncate font-mono text-base font-semibold text-white sm:text-lg">{invDetail.sku}</h3>
                <p className="mt-0.5 truncate text-xs text-white/65 sm:text-sm">
                  {invDetail.name} · {invDetail.ageDays}d · {invDetail.bucket}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setInvDetail(null);
                  setInvHistory([]);
                }}
                className={modalIconGhost}
                title="Close"
                aria-label="Close"
              >
                <IconClose />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
              <div className="shrink-0 border-b border-rlx-rule p-4 sm:p-5 lg:w-[22rem] lg:overflow-y-auto lg:border-b-0 lg:border-r">
                <div className="overflow-hidden border border-rlx-rule">
                  <table className="w-full text-left">
                    <tbody className="odd:[&>tr]:bg-white even:[&>tr]:bg-rlx-bg">
                      <DetailRow label="SKU" value={<span className="font-mono font-semibold text-rlx-green">{invDetail.sku}</span>} />
                      <DetailRow label="Item" value={invDetail.name} />
                      <DetailRow label="Category" value={invDetail.category} />
                      <DetailRow label="Stock qty" value={<span className="font-semibold text-rlx-green">{invDetail.qty.toLocaleString()}</span>} />
                      <DetailRow label="Last movement" value={formatDateTime(invDetail.lastMovementAt)} />
                      <DetailRow label="Age" value={`${invDetail.ageDays} day(s)`} />
                      <DetailRow label="Bucket" value={invDetail.bucket} />
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="flex min-h-0 min-w-0 flex-1 flex-col p-4 sm:p-5">
                <h4 className="mb-3 shrink-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-rlx-ink-muted">
                  Full stock history
                </h4>
                {invHistoryError ? (
                  <p className="mb-3 border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{invHistoryError}</p>
                ) : null}
                {invHistoryLoading ? (
                  <p className="text-sm text-rlx-ink-muted">Loading history…</p>
                ) : invHistory.length === 0 ? (
                  <p className="border border-rlx-rule bg-rlx-bg px-3 py-6 text-center text-sm text-rlx-ink-muted">
                    No stock history found.
                  </p>
                ) : (
                  <div className="min-h-0 flex-1 overflow-auto border border-rlx-rule">
                    <table className="w-full table-fixed text-left text-sm">
                      <colgroup>
                        <col className="w-[8.5rem]" />
                        <col className="w-[9.5rem]" />
                        <col />
                        <col className="w-[5rem]" />
                        <col className="w-[5rem]" />
                        <col className="w-[9rem]" />
                      </colgroup>
                      <thead className="sticky top-0 z-10 bg-rlx-bg text-[11px] font-semibold uppercase tracking-[0.12em] text-rlx-ink-muted">
                        <tr className="border-b border-rlx-rule">
                          <th className="px-3 py-2.5 text-left">When</th>
                          <th className="px-3 py-2.5 text-left">Event</th>
                          <th className="px-3 py-2.5 text-left">Place</th>
                          <th className="px-3 py-2.5 text-right">Change</th>
                          <th className="px-3 py-2.5 text-right">Balance</th>
                          <th className="px-3 py-2.5 text-left">Reference</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invHistory.map((h, idx) => {
                          const place =
                            h.locationType === "STORE"
                              ? h.storeName ?? storeNameById.get(h.storeId ?? "") ?? "Store"
                              : h.locationType === "HO"
                                ? h.regionName ?? regionNameById.get(h.regionId ?? "") ?? "HO"
                                : "Master";
                          const change = h.quantityChange;
                          return (
                            <tr key={h.id} className={`border-b border-rlx-rule ${idx % 2 === 1 ? "bg-rlx-bg" : "bg-white"}`}>
                              <td className="px-3 py-2.5 align-top text-xs text-rlx-ink-muted">{formatDateTime(h.createdAt)}</td>
                              <td className="px-3 py-2.5 align-top text-sm">{eventLabel(h.eventType)}</td>
                              <td className="break-words px-3 py-2.5 align-top text-sm">
                                <span className="block">{place}</span>
                                {h.note ? <span className="mt-0.5 block text-xs text-rlx-ink-muted">{h.note}</span> : null}
                              </td>
                              <td
                                className={`px-3 py-2.5 align-top text-right text-sm font-semibold tabular-nums ${
                                  change == null ? "text-rlx-ink-muted" : change < 0 ? "text-rose-700" : "text-emerald-700"
                                }`}
                              >
                                {change == null ? "—" : change.toLocaleString()}
                              </td>
                              <td className="px-3 py-2.5 align-top text-right text-sm font-semibold tabular-nums">
                                {h.balanceAfter == null ? "—" : h.balanceAfter.toLocaleString()}
                              </td>
                              <td className="break-words px-3 py-2.5 align-top text-xs text-rlx-ink-muted">
                                {h.referenceType && h.referenceNumber
                                  ? `${h.referenceType} ${h.referenceNumber}`
                                  : h.createdBy
                                    ? `By ${h.createdBy}`
                                    : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── SRF detail modal ────────────────────────────────────── */}
      {srfDetail ? (
        <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-rlx-ink/70 p-0 backdrop-blur-sm sm:items-center sm:p-3 md:p-5">
          <div className="flex h-[100dvh] w-full max-w-[96rem] flex-col overflow-hidden bg-white shadow-[0_32px_80px_-20px_rgba(0,0,0,0.5)] sm:h-[min(96dvh,56rem)] sm:max-h-[96dvh]">
            <div className="flex shrink-0 items-center justify-between gap-3 bg-rlx-green px-4 py-3 sm:px-6">
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-semibold uppercase tracking-[0.35em] text-rlx-gold">SRF aging</p>
                <h3 className="truncate font-mono text-base font-semibold text-white sm:text-lg">{srfDetail.reference}</h3>
                <p className="mt-0.5 truncate text-xs text-white/65 sm:text-sm">
                  {srfDetail.customerName} · {watchLabel(srfDetail)} · {daysSince(srfDetail.createdAt)}d ·{" "}
                  {agingBucket(daysSince(srfDetail.createdAt))}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Link
                  to={`/service/srf-register?q=${encodeURIComponent(srfDetail.reference)}`}
                  className="inline-flex border border-white/30 bg-white/10 px-3 py-2 text-xs font-semibold text-white no-underline transition hover:bg-white/20"
                >
                  Open SRF
                </Link>
                <button
                  type="button"
                  onClick={() => setSrfDetail(null)}
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
                        value={<span className="font-mono font-semibold text-rlx-green">{srfDetail.reference}</span>}
                      />
                      <DetailRow label="Status" value={<span className="capitalize">{statusLabel(srfDetail.status)}</span>} />
                      <DetailRow label="Customer" value={srfDetail.customerName} />
                      <DetailRow label="Phone" value={<span className="font-mono">{srfDetail.phone || "—"}</span>} />
                      <DetailRow label="Watch" value={watchLabel(srfDetail)} />
                      <DetailRow label="Serial" value={<span className="font-mono">{srfDetail.serial || "—"}</span>} />
                      <DetailRow label="Region" value={srfDetail.regionName || srfDetail.regionId || "—"} />
                      <DetailRow label="Store" value={srfDetail.storeName || srfDetail.storeId || "—"} />
                      <DetailRow label="Created" value={formatDateTime(srfDetail.createdAt)} />
                      <DetailRow label="Age" value={`${daysSince(srfDetail.createdAt)} day(s)`} />
                      <DetailRow label="Bucket" value={agingBucket(daysSince(srfDetail.createdAt))} />
                      <DetailRow label="Complaint" value={srfDetail.complaint || "—"} />
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="flex min-h-0 min-w-0 flex-1 flex-col p-4 sm:p-5">
                <h4 className="mb-3 shrink-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-rlx-ink-muted">
                  Full movement history
                </h4>
                {srfTimeline.length === 0 ? (
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
                        {srfTimeline.map((ev, idx) => (
                          <tr
                            key={`${ev.label}-${ev.at}`}
                            className={`border-b border-rlx-rule ${idx % 2 === 1 ? "bg-rlx-bg" : "bg-white"}`}
                          >
                            <td className="px-3 py-2.5 align-top text-xs text-rlx-ink-muted">{formatDateTime(ev.at)}</td>
                            <td className="px-3 py-2.5 align-top text-sm font-medium">{ev.label}</td>
                            <td className="break-words px-3 py-2.5 align-top text-sm text-rlx-ink-muted">{ev.detail || "—"}</td>
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
