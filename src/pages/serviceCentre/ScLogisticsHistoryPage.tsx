import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { EwayBillModal } from "../../components/service/EwayBillModal";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useRegions } from "../../context/RegionsContext";
import { useSrfJobs } from "../../context/SrfJobsContext";
import { apiJson } from "../../lib/api";
import {
  challanShowEwayHistoryRetry,
  formatEwayEdocMessage,
  renderChallanEwayStatus,
  type EdocUiResult,
} from "../../lib/edocResultMessage";
import type { TransferFlow } from "../../lib/transferDocumentKind";
import { jobVisibleToServiceCentre } from "../../lib/srfAccess";
import { printBrandDispatchDocument } from "../../lib/serviceDocuments";
import { printDeliveryChallanById } from "../../lib/printDeliveryChallanById";
import type { SrfJob } from "../../types/srfJob";

type DeliveryChallanHistoryRow = {
  id: string;
  dcNumber: string;
  createdAt: string;
  flow: TransferFlow;
  needsEway: boolean;
  srfReferences: string[];
  edocEwayBillNo?: string | null;
  edocEwayValidUpto?: string | null;
  edocStatus?: string | null;
  edocError?: string | null;
};

type HistoryModule = "dcOdc" | "eway" | "brand";

const actionBtn =
  "rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-950 transition hover:bg-amber-100 disabled:opacity-50";

const moduleBtn = (active: boolean) =>
  `rounded-lg border px-3 py-1.5 text-xs font-semibold ${
    active
      ? "border-rlx-green bg-rlx-green text-white"
      : "border-rlx-gold bg-rlx-green-light text-rlx-green hover:bg-rlx-green-light/80"
  }`;

export function ScLogisticsHistoryPage() {
  const { user } = useAuth();
  const { regions } = useRegions();
  const { jobs, refreshJobs } = useSrfJobs();
  const [historyModule, setHistoryModule] = useState<HistoryModule>("dcOdc");
  const [selectedJob, setSelectedJob] = useState<SrfJob | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "waiting_inward" | "after_inward" | "outward_done">("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [dcRows, setDcRows] = useState<DeliveryChallanHistoryRow[]>([]);
  const [dcLoading, setDcLoading] = useState(false);
  const [dcMsg, setDcMsg] = useState<string | null>(null);
  const [brandMsg, setBrandMsg] = useState<string | null>(null);
  const [edocEnabled, setEdocEnabled] = useState(false);
  const [ewayDcId, setEwayDcId] = useState<string | null>(null);
  const [ewayBrandJobId, setEwayBrandJobId] = useState<string | null>(null);
  const [ewayBusyId, setEwayBusyId] = useState<string | null>(null);
  const pageSize = 10;

  const storeById = useMemo(() => {
    const m = new Map<string, { regionName: string; storeName: string }>();
    for (const r of regions) {
      for (const s of r.stores) m.set(s.id, { regionName: r.name, storeName: s.name });
    }
    return m;
  }, [regions]);

  const allVisibleJobs = useMemo(() => {
    if (!user) return [];
    return jobs.filter((j) => jobVisibleToServiceCentre(j, user));
  }, [jobs, user]);

  const dcByNumber = useMemo(() => {
    const m = new Map<string, DeliveryChallanHistoryRow>();
    for (const row of dcRows) m.set(row.dcNumber, row);
    return m;
  }, [dcRows]);

  const dcOdcHistoryRows = useMemo(() => {
    return allVisibleJobs
      .filter((j) => !!j.dcNumber || !!j.outwardDcNumber)
      .map((j) => {
        let lifecycle: "waiting_inward" | "after_inward" | "outward_done" = "after_inward";
        if (j.status === "in_transit_sc") lifecycle = "waiting_inward";
        else if (j.outwardDcNumber || j.dispatchedToStoreAt || j.status === "dispatched_to_store") lifecycle = "outward_done";
        return { ...j, lifecycle };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [allVisibleJobs]);

  const sendToBrandHistoryRows = useMemo(() => {
    if (!user) return [];
    const historyStatuses: ReadonlySet<SrfJob["status"]> = new Set([
      "brand_dispatch_pending",
      "sent_to_brand",
      "brand_estimate_pending",
      "brand_estimate_customer_pending",
      "brand_estimate_customer_accepted",
      "brand_approved",
      "brand_repair_in_progress",
      "received_from_brand",
      "brand_credit_note_pending",
      "brand_credit_note_active",
    ]);
    return allVisibleJobs
      .filter((j) => historyStatuses.has(j.status) || !!j.brandDispatchRef || !!j.brandDispatchClerkAt)
      .sort((a, b) => {
        const bTs = new Date(b.brandDispatchClerkAt ?? b.brandSentAt ?? b.createdAt).getTime();
        const aTs = new Date(a.brandDispatchClerkAt ?? a.brandSentAt ?? a.createdAt).getTime();
        return bTs - aTs;
      });
  }, [allVisibleJobs, user]);

  const filteredRows = useMemo(() => {
    const from = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null;
    const to = toDate ? new Date(`${toDate}T23:59:59`).getTime() : null;
    return dcOdcHistoryRows.filter((j) => {
      if (statusFilter !== "all" && j.lifecycle !== statusFilter) return false;
      const ts = new Date(j.createdAt).getTime();
      if (from != null && ts < from) return false;
      if (to != null && ts > to) return false;
      return true;
    });
  }, [dcOdcHistoryRows, statusFilter, fromDate, toDate]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(historyPage, totalPages);
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage]);

  const loadDcHistory = useCallback(async () => {
    if (!user) return;
    setDcLoading(true);
    try {
      const out = await apiJson<{ rows: DeliveryChallanHistoryRow[] }>("/api/service/delivery-challans/history");
      setDcRows(out.rows);
    } catch {
      setDcRows([]);
    } finally {
      setDcLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadDcHistory();
  }, [loadDcHistory]);

  useEffect(() => {
    let cancelled = false;
    void apiJson<{ enabled?: boolean }>("/api/edoc/status")
      .then((d) => {
        if (!cancelled) setEdocEnabled(Boolean(d.enabled));
      })
      .catch(() => {
        if (!cancelled) setEdocEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function dcCanRetry(row: DeliveryChallanHistoryRow): boolean {
    return challanShowEwayHistoryRetry(edocEnabled, row.edocEwayBillNo);
  }

  function ewayActionLabel(row: DeliveryChallanHistoryRow): string {
    if (row.edocStatus === "FAILED" || row.edocStatus === "SKIPPED") return "Retry e-way bill";
    return "Create e-way bill";
  }

  function onEwaySuccess(edoc: EdocUiResult) {
    setDcMsg(formatEwayEdocMessage(edoc) ?? (edoc?.ok ? "E-way bill generated." : "Could not generate e-way bill."));
    void loadDcHistory();
  }

  function onBrandEwaySuccess(edoc: EdocUiResult) {
    setBrandMsg(formatEwayEdocMessage(edoc) ?? (edoc?.ok ? "E-way bill generated." : "Could not generate e-way bill."));
    void refreshJobs();
  }

  function renderEwayCell(challan?: DeliveryChallanHistoryRow | null, dcKey?: string) {
    if (!challan) {
      return <span className="text-stone-400">—</span>;
    }
    const status = renderChallanEwayStatus(challan);
    return (
      <div className="flex flex-col items-start gap-1">
        <span className={`text-[10px] font-semibold uppercase ${status.className}`} title={status.title}>
          {status.label}
        </span>
        {dcCanRetry(challan) ? (
          <button
            type="button"
            disabled={ewayBusyId === (dcKey ?? challan.id)}
            onClick={(e) => {
              e.stopPropagation();
              setEwayBusyId(dcKey ?? challan.id);
              setEwayDcId(challan.id);
            }}
            className={actionBtn}
          >
            {ewayBusyId === (dcKey ?? challan.id) ? "…" : ewayActionLabel(challan)}
          </button>
        ) : null}
      </div>
    );
  }

  function switchModule(next: HistoryModule) {
    setHistoryModule(next);
    setHistoryPage(1);
    setDcMsg(null);
    setBrandMsg(null);
  }

  return (
    <div>
      <PageHeader
        title="Logistics history"
        description="DC / ODC lifecycle, delivery challans with e-way, and send-to-brand dispatch records."
        actions={
          <Link
            to="/service-centre/logistics"
            className="inline-flex rounded-xl border border-rlx-gold bg-white px-4 py-2.5 text-sm font-semibold text-rlx-green shadow-sm transition hover:bg-rlx-green-light"
          >
            Back to logistics
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2 rounded-xl border border-rlx-rule/70 bg-white p-2">
        <button type="button" onClick={() => switchModule("dcOdc")} className={moduleBtn(historyModule === "dcOdc")}>
          DC / ODC history ({dcOdcHistoryRows.length})
        </button>
        <button type="button" onClick={() => switchModule("eway")} className={moduleBtn(historyModule === "eway")}>
          Delivery challans & e-way ({dcRows.length})
        </button>
        <button type="button" onClick={() => switchModule("brand")} className={moduleBtn(historyModule === "brand")}>
          Send to brand ({sendToBrandHistoryRows.length})
        </button>
      </div>

      {historyModule === "eway" ? (
        <Card title={`Delivery challans & e-way (${dcRows.length})`} subtitle="">
          {!edocEnabled ? (
            <p className="text-sm text-stone-600">E-doc is not enabled. Enable it in settings to create or retry e-way bills.</p>
          ) : null}
          {dcMsg ? (
            <p className="mb-3 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-950 ring-1 ring-sky-200">{dcMsg}</p>
          ) : null}
          {dcLoading ? (
            <div className="min-h-[2rem]" aria-hidden />
          ) : dcRows.length === 0 ? (
            <div className="min-h-[2rem]" aria-hidden />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-zimson-200/80">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-zimson-200 bg-zimson-50/80 text-xs font-semibold uppercase tracking-wide text-stone-600">
                  <tr>
                    <th className="px-3 py-2">DC</th>
                    <th className="px-3 py-2">Created</th>
                    <th className="px-3 py-2">SRF</th>
                    <th className="px-3 py-2">E-way</th>
                    <th className="px-3 py-2 text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {dcRows.map((row) => (
                    <tr key={row.id} className="border-b border-zimson-100 last:border-0">
                      <td className="px-3 py-2 font-mono text-xs font-semibold text-zimson-900">{row.dcNumber}</td>
                      <td className="px-3 py-2 text-xs text-stone-600">{new Date(row.createdAt).toLocaleString()}</td>
                      <td className="px-3 py-2 font-mono text-xs text-stone-700">
                        {row.srfReferences.join(", ") || "—"}
                      </td>
                      <td className="px-3 py-2 text-[10px] font-semibold uppercase">
                        {(() => {
                          const status = renderChallanEwayStatus(row);
                          return (
                            <span className={status.className} title={status.title}>
                              {status.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {dcCanRetry(row) ? (
                          <button
                            type="button"
                            disabled={ewayBusyId === row.id}
                            onClick={() => {
                              setEwayBusyId(row.id);
                              setEwayDcId(row.id);
                            }}
                            className={actionBtn}
                          >
                            {ewayBusyId === row.id ? "…" : ewayActionLabel(row)}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      {historyModule === "dcOdc" ? (
        <Card title={`DC / ODC history (${filteredRows.length})`}>
          {dcMsg ? (
            <p className="mb-3 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-950 ring-1 ring-sky-200">{dcMsg}</p>
          ) : null}
          <div className="mb-4 grid gap-2 md:grid-cols-4">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as typeof statusFilter);
                setHistoryPage(1);
              }}
              className="rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm"
            >
              <option value="all">All statuses</option>
              <option value="waiting_inward">Waiting for inward</option>
              <option value="after_inward">After inward</option>
              <option value="outward_done">Outward done</option>
            </select>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setHistoryPage(1);
              }}
              className="rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setHistoryPage(1);
              }}
              className="rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => {
                setStatusFilter("all");
                setFromDate("");
                setToDate("");
                setHistoryPage(1);
              }}
              className="rounded-xl border border-zimson-300 px-3 py-2 text-sm font-semibold text-zimson-900 hover:bg-zimson-50"
            >
              All / Reset
            </button>
          </div>
          {filteredRows.length === 0 ? (
            <div className="min-h-[2rem]" aria-hidden />
          ) : (
            <div className="space-y-3">
              <div className="overflow-x-auto rounded-xl border border-zimson-200/80">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-zimson-200 bg-zimson-50/80 text-xs font-semibold uppercase tracking-wide text-stone-600">
                    <tr>
                      <th className="px-3 py-2">Lifecycle status</th>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">SRF</th>
                      <th className="px-3 py-2">DC</th>
                      <th className="px-3 py-2">ODC</th>
                      <th className="px-3 py-2">Inward DC e-way</th>
                      <th className="px-3 py-2">Outward ODC e-way</th>
                      <th className="px-3 py-2">Customer</th>
                      <th className="px-3 py-2">Store</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.map((j) => (
                      <tr
                        key={`history-${j.id}`}
                        onClick={() => setSelectedJob(j)}
                        className="cursor-pointer border-b border-zimson-100 hover:bg-zimson-50/60 last:border-0"
                      >
                        <td className="px-3 py-2">
                          {j.lifecycle === "waiting_inward" ? (
                            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
                              Waiting for inward
                            </span>
                          ) : j.lifecycle === "after_inward" ? (
                            <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-900">
                              After inward
                            </span>
                          ) : (
                            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-900">
                              Outward done
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-stone-600">{new Date(j.createdAt).toLocaleString()}</td>
                        <td className="px-3 py-2 font-mono text-xs font-semibold text-zimson-900">{j.reference}</td>
                        <td className="px-3 py-2 font-mono text-xs text-zimson-900">{j.dcNumber ?? "-"}</td>
                        <td className="px-3 py-2 font-mono text-xs text-zimson-900">{j.outwardDcNumber ?? "-"}</td>
                        <td className="px-3 py-2">
                          {j.dcNumber ? renderEwayCell(dcByNumber.get(j.dcNumber), `in-${j.id}-${j.dcNumber}`) : "—"}
                        </td>
                        <td className="px-3 py-2">
                          {j.outwardDcNumber
                            ? renderEwayCell(dcByNumber.get(j.outwardDcNumber), `out-${j.id}-${j.outwardDcNumber}`)
                            : "—"}
                        </td>
                        <td className="px-3 py-2">{j.customerName}</td>
                        <td className="px-3 py-2 text-xs text-stone-600">
                          {(() => {
                            if (j.requiresLocalConversion && j.transferTargetRegionId) {
                              const reg = regions.find((r) => r.id === j.transferTargetRegionId);
                              return `HO: ${reg?.name ?? j.transferTargetRegionId}`;
                            }
                            const destId = j.destinationStoreId || j.transferSourceStoreId || j.storeId;
                            const loc = storeById.get(destId);
                            return loc ? (loc.regionName ? `HO: ${loc.regionName} · ` : "") + `Store: ${loc.storeName}` : destId;
                          })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-stone-600">
                  Showing page {currentPage} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                    className="rounded-lg border border-zimson-300 px-3 py-1.5 text-xs font-semibold text-zimson-900 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setHistoryPage((p) => Math.min(totalPages, p + 1))}
                    className="rounded-lg border border-zimson-300 px-3 py-1.5 text-xs font-semibold text-zimson-900 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </Card>
      ) : null}

      {historyModule === "brand" ? (
        <Card title={`Send to brand (${sendToBrandHistoryRows.length})`}>
          {brandMsg ? (
            <p className="mb-3 rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-950 ring-1 ring-violet-200">{brandMsg}</p>
          ) : null}
          {sendToBrandHistoryRows.length === 0 ? (
            <p className="text-sm text-stone-600">No send-to-brand history yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-violet-100">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-violet-300 bg-violet-50 text-xs font-semibold uppercase tracking-wide text-violet-900">
                  <tr>
                    <th className="px-3 py-2">Logged at</th>
                    <th className="px-3 py-2">SRF</th>
                    <th className="px-3 py-2">Watch / customer</th>
                    <th className="px-3 py-2">Dispatch ref</th>
                      <th className="px-3 py-2">Dispatch note</th>
                      <th className="px-3 py-2">Brand ODC</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2 text-center">E-way</th>
                  </tr>
                </thead>
                <tbody>
                  {sendToBrandHistoryRows.map((j) => (
                    <tr key={`brand-h-${j.id}`} className="border-b border-violet-100 last:border-0">
                      <td className="px-3 py-2 text-xs text-stone-600">
                        {new Date(j.brandDispatchClerkAt ?? j.brandSentAt ?? j.createdAt).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs font-semibold text-violet-950">{j.reference}</td>
                      <td className="px-3 py-2 text-stone-700">
                        {j.watchBrand} {j.watchModel}
                        <span className="mt-0.5 block text-xs text-stone-500">{j.customerName}</span>
                      </td>
                      <td className="px-3 py-2 text-xs font-semibold text-violet-900">
                        {j.brandDispatchRef?.trim() || "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-stone-600">
                        {j.brandDispatchClerkNote?.trim() || j.brandDispatchNote?.trim() || "—"}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-violet-900">{j.brandOdcNumber ?? "—"}</td>
                      <td className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-violet-800">
                        {j.status.replaceAll("_", " ")}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {j.edocEwayBillNo?.trim() ? (
                          <span className="text-[10px] font-semibold uppercase text-emerald-700">EWB {j.edocEwayBillNo}</span>
                        ) : edocEnabled ? (
                          <button
                            type="button"
                            onClick={() => setEwayBrandJobId(j.id)}
                            className="rounded-lg border border-violet-300 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-900 hover:bg-violet-100"
                          >
                            Create e-way bill
                          </button>
                        ) : (
                          <span className="text-xs text-stone-500">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      {selectedJob ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-stone-900">SRF details - {selectedJob.reference}</h3>
                <p className="text-sm text-stone-600">{new Date(selectedJob.createdAt).toLocaleString()}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedJob(null)}
                className="rounded-lg border px-3 py-1.5 text-sm"
              >
                Close
              </button>
            </div>
            <div className="overflow-x-auto rounded-xl border border-zimson-200/80">
              <table className="min-w-full text-left text-sm">
                <tbody>
                  <tr className="border-b border-zimson-100">
                    <th className="w-56 bg-zimson-50/70 px-3 py-2">Status</th>
                    <td className="px-3 py-2">{selectedJob.status.replace(/_/g, " ")}</td>
                  </tr>
                  <tr className="border-b border-zimson-100">
                    <th className="bg-zimson-50/70 px-3 py-2">Customer</th>
                    <td className="px-3 py-2">
                      {selectedJob.customerName} ({selectedJob.phone})
                    </td>
                  </tr>
                  <tr className="border-b border-zimson-100">
                    <th className="bg-zimson-50/70 px-3 py-2">Watch</th>
                    <td className="px-3 py-2">
                      {selectedJob.watchBrand} {selectedJob.watchModel} · {selectedJob.serial}
                    </td>
                  </tr>
                  <tr className="border-b border-zimson-100">
                    <th className="bg-zimson-50/70 px-3 py-2">DC / ODC</th>
                    <td className="px-3 py-2">
                      DC: {selectedJob.dcNumber ?? "-"} · ODC: {selectedJob.outwardDcNumber ?? "-"}
                    </td>
                  </tr>
                  <tr className="border-b border-zimson-100">
                    <th className="bg-zimson-50/70 px-3 py-2">Region / Store</th>
                    <td className="px-3 py-2">
                      HO: {selectedJob.regionName ?? selectedJob.regionId} · Store:{" "}
                      {storeById.get(selectedJob.storeId)?.storeName ?? selectedJob.storeId}
                    </td>
                  </tr>
                  <tr className="border-b border-zimson-100">
                    <th className="bg-zimson-50/70 px-3 py-2">Timeline</th>
                    <td className="px-3 py-2 text-xs text-stone-700">
                      Dispatched to SC:{" "}
                      {selectedJob.dispatchedToScAt ? new Date(selectedJob.dispatchedToScAt).toLocaleString() : "-"}
                      <br />
                      SC inward: {selectedJob.inwardAt ? new Date(selectedJob.inwardAt).toLocaleString() : "-"}
                      <br />
                      Dispatched to store:{" "}
                      {selectedJob.dispatchedToStoreAt ? new Date(selectedJob.dispatchedToStoreAt).toLocaleString() : "-"}
                      <br />
                      Store inward:{" "}
                      {selectedJob.receivedBackAtStoreAt
                        ? new Date(selectedJob.receivedBackAtStoreAt).toLocaleString()
                        : "-"}
                    </td>
                  </tr>
                  <tr>
                    <th className="bg-zimson-50/70 px-3 py-2">Complaint</th>
                    <td className="px-3 py-2">{selectedJob.complaint || "-"}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {ewayDcId ? (
        <EwayBillModal
          open={Boolean(ewayDcId)}
          kind="challan"
          resourceId={ewayDcId}
          onClose={() => {
            setEwayDcId(null);
            setEwayBusyId(null);
          }}
          onSuccess={(edoc) => {
            onEwaySuccess(edoc);
          }}
          onPrintDocument={() => {
            void printDeliveryChallanById(ewayDcId, jobs, {
              preparedBy: user?.displayName?.trim() || user?.email?.trim(),
            });
          }}
        />
      ) : null}

      {ewayBrandJobId ? (
        <EwayBillModal
          open
          kind="brand"
          resourceId={ewayBrandJobId}
          onClose={() => setEwayBrandJobId(null)}
          onSuccess={onBrandEwaySuccess}
          onPrintDocument={() => {
            const job = jobs.find((j) => j.id === ewayBrandJobId);
            if (job) printBrandDispatchDocument(job);
          }}
        />
      ) : null}
    </div>
  );
}
