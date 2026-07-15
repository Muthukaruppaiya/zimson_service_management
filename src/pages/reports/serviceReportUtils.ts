import { useCallback, useEffect, useMemo, useState } from "react";
import { apiJson } from "../../lib/api";
import type { QuickBillHistoryRow } from "../../types/quickBill";
import type { SrfJob } from "../../types/srfJob";
import { useSrfJobs } from "../../context/SrfJobsContext";

export type ServiceReportKey =
  | "watch_not_returned"
  | "aging"
  | "pending"
  | "transfer";

export const SERVICE_REPORT_COLUMNS: Record<ServiceReportKey, string[]> = {
  watch_not_returned: ["SR No", "Customer", "Watch", "Outward DC", "Dispatched To Store At", "Pending Days", "Current Status", "Destination Store"],
  aging: ["SR No", "Customer", "Watch", "Status", "Created At", "Age (days)", "Aging Bucket", "Region", "Store"],
  pending: ["SR No", "Customer", "Watch", "Serial", "Pending Stage", "Age (days)", "Region", "Store"],
  transfer: ["SR No", "Customer", "Watch", "Transfer Ref", "Inbound DC", "Outward DC", "Status", "From", "To", "Age (days)"],
};

export const PENDING_STATUSES = new Set<SrfJob["status"]>([
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

function agingBucket(days: number): string {
  if (days <= 2) return "0-2 days";
  if (days <= 7) return "3-7 days";
  if (days <= 15) return "8-15 days";
  if (days <= 30) return "16-30 days";
  return "30+ days";
}

export function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [
    columns.map((c) => esc(c)).join(","),
    ...rows.map((row) => columns.map((c) => esc(row[c])).join(",")),
  ];
  return lines.join("\n");
}

export function downloadCsv(filename: string, columns: string[], rows: Record<string, unknown>[]) {
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

export function useServiceReportRows() {
  const { jobs, refreshJobs } = useSrfJobs();
  const [quickBills, setQuickBills] = useState<QuickBillHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await refreshJobs();
      const qb = await apiJson<{ bills: QuickBillHistoryRow[] }>("/api/service/quick-bills?limit=1000");
      setQuickBills(qb.bills ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load report data.");
    } finally {
      setLoading(false);
    }
  }, [refreshJobs]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const openJobs = useMemo(
    () => jobs.filter((j) => j.status !== "closed" && j.status !== "cancelled"),
    [jobs],
  );

  const rowsByReport = useMemo<Record<ServiceReportKey, Record<string, unknown>[]>>(() => {
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
      watch_not_returned: notReturned,
      aging,
      pending,
      transfer,
    };
  }, [jobs, openJobs]);

  const kpis = useMemo(
    () => ({
      openSrf: openJobs.length,
      notReturned: rowsByReport.watch_not_returned.length,
      pending: rowsByReport.pending.length,
      quickBills: quickBills.length,
    }),
    [openJobs.length, quickBills.length, rowsByReport.pending.length, rowsByReport.watch_not_returned.length],
  );

  return { loading, error, kpis, rowsByReport, refreshAll };
}

