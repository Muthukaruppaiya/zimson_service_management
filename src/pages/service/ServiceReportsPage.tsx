import { useEffect, useMemo, useState } from "react";
import { FormPageShell } from "../../components/layout/FormPageShell";
import { ReportDataTable } from "../../components/accounts/report/ReportDataTable";
import { Card } from "../../components/ui/Card";
import { apiJson } from "../../lib/api";
import type { QuickBillHistoryRow } from "../../types/quickBill";
import type { SrfJob } from "../../types/srfJob";
import { useSrfJobs } from "../../context/SrfJobsContext";

type ReportKey = "stock_in_hand" | "watch_not_returned" | "aging" | "pending" | "transfer";

type ReportDef = {
  key: ReportKey;
  label: string;
  description: string;
  columns: string[];
};

const REPORTS: ReportDef[] = [
  {
    key: "stock_in_hand",
    label: "Stock in Hand",
    description: "All service watches currently in custody (open SRFs).",
    columns: ["SR No", "Customer", "Watch", "Serial", "Current Status", "Current Location", "Age (days)", "Region", "Store"],
  },
  {
    key: "watch_not_returned",
    label: "Watch Not Returned to Store",
    description: "Watches outwarded from service centre but not received back at store yet.",
    columns: ["SR No", "Customer", "Watch", "Outward DC", "Dispatched To Store At", "Pending Days", "Current Status", "Destination Store"],
  },
  {
    key: "aging",
    label: "Aging Report",
    description: "Open SRFs with aging buckets by created date.",
    columns: ["SR No", "Customer", "Watch", "Status", "Created At", "Age (days)", "Aging Bucket", "Region", "Store"],
  },
  {
    key: "pending",
    label: "Pending Report",
    description: "SRFs in pending workflow statuses.",
    columns: ["SR No", "Customer", "Watch", "Serial", "Pending Stage", "Age (days)", "Region", "Store"],
  },
  {
    key: "transfer",
    label: "Transfer Report",
    description: "Inter-store / store-service-centre movement references.",
    columns: ["SR No", "Customer", "Watch", "Transfer Ref", "Inbound DC", "Outward DC", "Status", "From", "To", "Age (days)"],
  },
];

const PENDING_STATUSES = new Set<SrfJob["status"]>([
  "draft",
  "photo_pending",
  "at_store",
  "store_self_pending",
  "store_self_assigned",
  "store_self_working",
  "in_transit_sc",
  "received_at_sc",
  "sent_to_other_ho",
  "assigned",
  "estimate_ok",
  "reestimate_required",
  "inter_ho_reestimate_pending_sender",
  "inter_ho_brand_estimate_pending_sender",
  "brand_outward_pending",
  "brand_dispatch_pending",
  "sent_to_brand",
  "brand_estimate_pending",
  "brand_estimate_customer_pending",
  "brand_approved",
  "brand_repair_in_progress",
  "received_from_brand",
  "ready_for_outward",
  "dispatched_to_store",
  "received_at_store",
]);

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
  return d.toLocaleString();
}

function watchLabel(job: SrfJob): string {
  return [job.watchBrand, job.watchFamily, job.watchModel].filter(Boolean).join(" ");
}

function locationLabel(job: SrfJob): string {
  const s = job.status;
  if (s === "sent_to_other_ho") return "Other HO";
  if (s === "in_transit_sc" || s === "dispatched_to_store" || s === "ready_for_outward") return "In Transit";
  if (
    s === "received_at_sc" ||
    s === "assigned" ||
    s === "estimate_ok" ||
    s === "reestimate_required" ||
    s === "brand_dispatch_pending" ||
    s === "sent_to_brand" ||
    s === "brand_estimate_pending" ||
    s === "brand_repair_in_progress" ||
    s === "received_from_brand"
  ) {
    return "Service Centre";
  }
  return "Store";
}

function agingBucket(days: number): string {
  if (days <= 2) return "0-2 days";
  if (days <= 7) return "3-7 days";
  if (days <= 15) return "8-15 days";
  if (days <= 30) return "16-30 days";
  return "30+ days";
}

function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [
    columns.map((c) => esc(c)).join(","),
    ...rows.map((row) => columns.map((c) => esc(row[c])).join(",")),
  ];
  return lines.join("\n");
}

function downloadCsv(filename: string, columns: string[], rows: Record<string, unknown>[]) {
  const blob = new Blob([toCsv(columns, rows)], { type: "text/csv;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

export function ServiceReportsPage() {
  const { jobs, refreshJobs } = useSrfJobs();
  const [selectedReport, setSelectedReport] = useState<ReportKey>("stock_in_hand");
  const [quickBills, setQuickBills] = useState<QuickBillHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        await refreshJobs();
        const qb = await apiJson<{ bills: QuickBillHistoryRow[] }>("/api/service/quick-bills?limit=1000");
        if (!cancelled) setQuickBills(qb.bills ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load report data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [refreshJobs]);

  const openJobs = useMemo(
    () => jobs.filter((j) => j.status !== "closed" && j.status !== "cancelled"),
    [jobs],
  );

  const rowsByReport = useMemo<Record<ReportKey, Record<string, unknown>[]>>(() => {
    const stockInHand = openJobs
      .map((j) => {
        const age = daysSince(j.createdAt);
        return {
          "SR No": j.reference,
          Customer: j.customerName,
          Watch: watchLabel(j),
          Serial: j.serial || "—",
          "Current Status": j.status,
          "Current Location": locationLabel(j),
          "Age (days)": age,
          Region: j.regionName || j.regionId,
          Store: j.storeName || j.storeId,
        };
      })
      .sort((a, b) => Number(b["Age (days)"]) - Number(a["Age (days)"]));

    const notReturned = jobs
      .filter(
        (j) =>
          Boolean(j.dispatchedToStoreAt) &&
          !j.receivedBackAtStoreAt &&
          j.status !== "closed" &&
          j.status !== "cancelled",
      )
      .map((j) => ({
        "SR No": j.reference,
        Customer: j.customerName,
        Watch: watchLabel(j),
        "Outward DC": j.outwardDcNumber || "—",
        "Dispatched To Store At": formatDateTime(j.dispatchedToStoreAt),
        "Pending Days": daysSince(j.dispatchedToStoreAt),
        "Current Status": j.status,
        "Destination Store": j.destinationStoreId || j.storeName || "—",
      }))
      .sort((a, b) => Number(b["Pending Days"]) - Number(a["Pending Days"]));

    const aging = openJobs
      .map((j) => {
        const age = daysSince(j.createdAt);
        return {
          "SR No": j.reference,
          Customer: j.customerName,
          Watch: watchLabel(j),
          Status: j.status,
          "Created At": formatDateTime(j.createdAt),
          "Age (days)": age,
          "Aging Bucket": agingBucket(age),
          Region: j.regionName || j.regionId,
          Store: j.storeName || j.storeId,
        };
      })
      .sort((a, b) => Number(b["Age (days)"]) - Number(a["Age (days)"]));

    const pending = openJobs
      .filter((j) => PENDING_STATUSES.has(j.status))
      .map((j) => ({
        "SR No": j.reference,
        Customer: j.customerName,
        Watch: watchLabel(j),
        Serial: j.serial || "—",
        "Pending Stage": j.status,
        "Age (days)": daysSince(j.createdAt),
        Region: j.regionName || j.regionId,
        Store: j.storeName || j.storeId,
      }))
      .sort((a, b) => Number(b["Age (days)"]) - Number(a["Age (days)"]));

    const transfer = jobs
      .filter(
        (j) =>
          Boolean(j.dcNumber) ||
          Boolean(j.outwardDcNumber) ||
          Boolean(j.transferSourceReference) ||
          j.status === "in_transit_sc" ||
          j.status === "dispatched_to_store" ||
          j.status === "sent_to_other_ho",
      )
      .map((j) => ({
        "SR No": j.reference,
        Customer: j.customerName,
        Watch: watchLabel(j),
        "Transfer Ref": j.transferSourceReference || "—",
        "Inbound DC": j.dcNumber || "—",
        "Outward DC": j.outwardDcNumber || "—",
        Status: j.status,
        From: j.transferSourceRegionId || j.regionName || j.regionId,
        To: j.transferTargetRegionId || j.destinationStoreId || j.storeName || "—",
        "Age (days)": daysSince(j.createdAt),
      }))
      .sort((a, b) => Number(b["Age (days)"]) - Number(a["Age (days)"]));

    return {
      stock_in_hand: stockInHand,
      watch_not_returned: notReturned,
      aging,
      pending,
      transfer,
    };
  }, [jobs, openJobs]);

  const selectedDef = REPORTS.find((r) => r.key === selectedReport)!;
  const selectedRows = rowsByReport[selectedReport] ?? [];

  const kpis = useMemo(
    () => ({
      openSrf: openJobs.length,
      notReturned: rowsByReport.watch_not_returned.length,
      pending: rowsByReport.pending.length,
      quickBills: quickBills.length,
    }),
    [openJobs.length, rowsByReport.watch_not_returned.length, rowsByReport.pending.length, quickBills.length],
  );

  return (
    <FormPageShell
      breadcrumb="Reports"
      title="Service reports"
      actions={
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              downloadCsv(
                `${selectedReport}_${new Date().toISOString().slice(0, 10)}.csv`,
                selectedDef.columns,
                selectedRows,
              )
            }
            className="rounded-lg border border-rlx-gold/60 bg-white px-3 py-1.5 text-xs font-semibold text-rlx-green hover:bg-rlx-green-light"
            disabled={selectedRows.length === 0}
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => void refreshJobs()}
            className="rounded-lg border border-rlx-gold/60 bg-white px-3 py-1.5 text-xs font-semibold text-rlx-green hover:bg-rlx-green-light"
          >
            Refresh
          </button>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Open SRFs">
          <p className="text-lg font-semibold text-rlx-green">{kpis.openSrf}</p>
        </Card>
        <Card title="Not Returned">
          <p className="text-lg font-semibold text-amber-700">{kpis.notReturned}</p>
        </Card>
        <Card title="Pending Jobs">
          <p className="text-lg font-semibold text-indigo-700">{kpis.pending}</p>
        </Card>
        <Card title="Quick Bills (history)">
          <p className="text-lg font-semibold text-stone-700">{kpis.quickBills}</p>
        </Card>
      </div>

      <Card title="Report selector" className="mt-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {REPORTS.map((rep) => (
            <button
              key={rep.key}
              type="button"
              onClick={() => setSelectedReport(rep.key)}
              className={`rounded-lg border px-3 py-2 text-left text-xs font-medium transition ${
                selectedReport === rep.key
                  ? "border-rlx-gold bg-rlx-green-light text-rlx-green"
                  : "border-rlx-rule bg-white text-stone-700 hover:bg-stone-50"
              }`}
            >
              <div className="font-semibold">{rep.label}</div>
              <div className="mt-1 text-[11px] opacity-90">{rep.description}</div>
            </button>
          ))}
        </div>
      </Card>

      {error ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="mt-3">
        {loading ? (
          <p className="rounded-lg border border-rlx-rule bg-white px-3 py-5 text-sm text-stone-600">
            Loading report data...
          </p>
        ) : (
          <ReportDataTable
            title={selectedDef.label}
            columns={selectedDef.columns}
            rows={selectedRows}
            emptyMessage="No rows for this report."
          />
        )}
      </div>
    </FormPageShell>
  );
}

