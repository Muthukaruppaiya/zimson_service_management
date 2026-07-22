import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BrandSendDetailsModal } from "../../components/service/BrandSendDetailsModal";
import { EwayBillModal } from "../../components/service/EwayBillModal";
import { AppModal, AppModalDetailGrid, AppModalDetailRow } from "../../components/ui/AppModal";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { modalBtnGold, modalBtnPrimary, modalBtnSecondary, modalFooterClass } from "../../lib/appModalStyles";
import { useAuth } from "../../context/AuthContext";
import { useSrfJobs } from "../../context/SrfJobsContext";
import { apiJson } from "../../lib/api";
import {
  challanShowEwayHistoryRetry,
  formatEwayEdocMessage,
  renderChallanEwayStatus,
  type EdocUiResult,
} from "../../lib/edocResultMessage";
import type { TransferFlow } from "../../lib/transferDocumentKind";
import { documentNeedsEway } from "../../lib/ewayBill";
import { resolveEwayDocumentUrl } from "../../lib/einvoicePortal";
import { displaySrfReference, normalizeSrfReferenceList } from "../../lib/srfReference";
import { jobVisibleToServiceCentre } from "../../lib/srfAccess";
import { printDeliveryChallanById } from "../../lib/printDeliveryChallanById";
import type { SrfJob } from "../../types/srfJob";

type DeliveryChallanHistoryRow = {
  id: string;
  dcNumber: string;
  createdAt: string;
  flow: TransferFlow;
  printKind?: "dc" | "transfer";
  direction?: "inward" | "outward";
  documentSeries?: "DC" | "TD";
  needsEway: boolean;
  transferTypeLabel?: string;
  fromName?: string;
  toName?: string;
  routeLabel?: string;
  srfReferences: string[];
  srfCount?: number;
  srfLineCount?: number;
  edocEwayBillNo?: string | null;
  edocEwayValidUpto?: string | null;
  edocEwayPdfUrl?: string | null;
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
  const { jobs, refreshJobs } = useSrfJobs();
  const [historyModule, setHistoryModule] = useState<HistoryModule>("dcOdc");
  const [brandDetailsJob, setBrandDetailsJob] = useState<SrfJob | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "inward" | "outward">("all");
  const [selectedDoc, setSelectedDoc] = useState<DeliveryChallanHistoryRow | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [dcRows, setDcRows] = useState<DeliveryChallanHistoryRow[]>([]);
  const [dcLoading, setDcLoading] = useState(false);
  const [dcMsg, setDcMsg] = useState<string | null>(null);
  const [brandMsg, setBrandMsg] = useState<string | null>(null);
  const [edocEnabled, setEdocEnabled] = useState(false);
  const [ewayDcId, setEwayDcId] = useState<string | null>(null);
  const [ewayBusyId, setEwayBusyId] = useState<string | null>(null);
  const pageSize = 10;

  const allVisibleJobs = useMemo(() => {
    if (!user) return [];
    return jobs.filter((j) => jobVisibleToServiceCentre(j, user));
  }, [jobs, user]);

  const dcByNumber = useMemo(() => {
    const m = new Map<string, DeliveryChallanHistoryRow>();
    for (const row of dcRows) m.set(row.dcNumber, row);
    return m;
  }, [dcRows]);

  const liveJobs = useMemo(
    () => allVisibleJobs.filter((j) => !/-ARCH-/i.test(j.reference)),
    [allVisibleJobs],
  );

  /** One row per delivery document (not per SRF) — avoids collapsed/duplicate history. */
  const documentHistoryRows = useMemo(() => {
    return dcRows.map((row) => {
      let refs = normalizeSrfReferenceList(row.srfReferences ?? []);
      if (refs.length === 0) {
        refs = normalizeSrfReferenceList(
          liveJobs
            .filter((j) => j.dcNumber === row.dcNumber || j.outwardDcNumber === row.dcNumber)
            .map((j) => displaySrfReference(j.reference, j.transferSourceReference)),
        );
      }
      const srfCount = Math.max(row.srfLineCount ?? 0, row.srfCount ?? 0, refs.length);
      return {
        ...row,
        srfReferences: refs,
        srfCount,
      };
    });
  }, [dcRows, liveJobs]);

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
    return liveJobs
      .filter((j) => historyStatuses.has(j.status) || !!j.brandDispatchRef || !!j.brandDispatchClerkAt)
      .sort((a, b) => {
        const bTs = new Date(b.brandDispatchClerkAt ?? b.brandSentAt ?? b.createdAt).getTime();
        const aTs = new Date(a.brandDispatchClerkAt ?? a.brandSentAt ?? a.createdAt).getTime();
        return bTs - aTs;
      });
  }, [liveJobs, user]);

  const filteredDocRows = useMemo(() => {
    const from = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null;
    const to = toDate ? new Date(`${toDate}T23:59:59`).getTime() : null;
    return documentHistoryRows.filter((row) => {
      const direction = row.direction ?? (row.flow === "store_to_ho" ? "inward" : "outward");
      if (statusFilter === "inward" && direction !== "inward") return false;
      if (statusFilter === "outward" && direction !== "outward") return false;
      const ts = new Date(row.createdAt).getTime();
      if (from != null && ts < from) return false;
      if (to != null && ts > to) return false;
      return true;
    });
  }, [documentHistoryRows, statusFilter, fromDate, toDate]);

  const totalPages = Math.max(1, Math.ceil(filteredDocRows.length / pageSize));
  const currentPage = Math.min(historyPage, totalPages);
  const pagedDocRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredDocRows.slice(start, start + pageSize);
  }, [filteredDocRows, currentPage]);

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
    const reload = () => {
      if (document.visibilityState === "visible") void loadDcHistory();
    };
    document.addEventListener("visibilitychange", reload);
    return () => document.removeEventListener("visibilitychange", reload);
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

  function dcDirection(row: DeliveryChallanHistoryRow): "inward" | "outward" {
    if (row.direction === "inward" || row.direction === "outward") return row.direction;
    return row.flow === "store_to_ho" ? "inward" : "outward";
  }

  function transferTypeLabel(row: DeliveryChallanHistoryRow): string {
    if (row.transferTypeLabel?.trim()) return row.transferTypeLabel;
    if (row.flow === "store_to_ho") return "Store → HO";
    if (row.flow === "ho_to_store") return "HO → Store";
    if (row.flow === "ho_to_ho_dispatch") return "HO → HO (send)";
    if (row.flow === "ho_to_ho_return") return "HO → HO (return)";
    return dcDirection(row) === "inward" ? "Inward" : "Outward";
  }

  function routeLabel(row: DeliveryChallanHistoryRow): string {
    if (row.routeLabel?.trim()) return row.routeLabel;
    const from = row.fromName?.trim() || "—";
    const to = row.toName?.trim() || "—";
    return `${from} → ${to}`;
  }

  function formatDcDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function formatDcTime(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  }

  function resolveEwayPdf(row: DeliveryChallanHistoryRow): string | null {
    return resolveEwayDocumentUrl({ pdfUrl: row.edocEwayPdfUrl });
  }

  function dcCanRetry(row: DeliveryChallanHistoryRow): boolean {
    // Store ↔ HO (TD / inward): no e-way. HO ↔ HO (DC): e-way required.
    if (dcDirection(row) === "inward") return false;
    if (!documentNeedsEway({ flow: row.flow, documentNumber: row.dcNumber, printKind: row.printKind })) {
      return false;
    }
    if (String(row.edocEwayBillNo ?? "").trim()) return false;
    return challanShowEwayHistoryRetry(edocEnabled, row.edocEwayBillNo, true);
  }

  function ewayActionLabel(row: DeliveryChallanHistoryRow): string {
    if (row.edocStatus === "FAILED" || row.edocStatus === "SKIPPED") return "Retry e-way bill";
    return "Create e-way bill";
  }

  function onEwaySuccess(edoc: EdocUiResult) {
    setDcMsg(formatEwayEdocMessage(edoc) ?? (edoc?.ok ? "E-way bill generated." : "Could not generate e-way bill."));
    void loadDcHistory();
  }

  /**
   * E-way create/retry is only for outward ODC (HO → store / HO → HO).
   * Inward DC (store → HO) never offers create — show N/A or existing bill only.
   */
  function renderEwayCell(
    challan?: DeliveryChallanHistoryRow | null,
    dcKey?: string,
    allowCreate = false,
  ) {
    if (!challan) {
      return <span className="text-stone-400">—</span>;
    }
    const hasBill = Boolean(challan.edocEwayBillNo?.trim());
    if (!allowCreate) {
      if (!hasBill) {
        return (
          <span className="text-xs text-stone-400" title="E-way not required for store ↔ HO (TD)">
            N/A
          </span>
        );
      }
      const status = renderChallanEwayStatus(challan);
      return (
        <span className={`text-[10px] font-semibold uppercase ${status.className}`} title={status.title}>
          {status.label}
        </span>
      );
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
          DC / ODC history ({documentHistoryRows.length})
        </button>
        <button type="button" onClick={() => switchModule("eway")} className={moduleBtn(historyModule === "eway")}>
          Delivery challans & e-way ({documentHistoryRows.length})
        </button>
        <button type="button" onClick={() => switchModule("brand")} className={moduleBtn(historyModule === "brand")}>
          Send to brand ({sendToBrandHistoryRows.length})
        </button>
      </div>

      {historyModule === "eway" ? (
        <Card title={`Delivery challans & e-way (${documentHistoryRows.length})`}>
          <p className="mb-3 text-xs text-stone-600">
            E-way applies only to HO → HO (DC). Store ↔ HO (TD) shows N/A.
          </p>
          {!edocEnabled ? (
            <p className="mb-3 text-sm text-stone-600">E-doc is not enabled. Enable it in settings to create or retry e-way bills.</p>
          ) : null}
          {dcMsg ? (
            <p className="mb-3 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-950 ring-1 ring-sky-200">{dcMsg}</p>
          ) : null}
          {dcLoading ? (
            <p className="text-sm text-stone-500">Loading…</p>
          ) : documentHistoryRows.length === 0 ? (
            <p className="text-sm text-stone-500">No delivery documents yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-zimson-200/80">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-zimson-200 bg-zimson-50/80 text-xs font-semibold uppercase tracking-wide text-stone-600">
                  <tr>
                    <th className="px-3 py-2">Document</th>
                    <th className="px-3 py-2">When</th>
                    <th className="px-3 py-2">Transfer type</th>
                    <th className="px-3 py-2">Route (from → to)</th>
                    <th className="px-3 py-2">SRFs</th>
                    <th className="px-3 py-2">E-way</th>
                    <th className="px-3 py-2 text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {documentHistoryRows.map((row) => {
                    const series = row.documentSeries ?? (/^DC/i.test(row.dcNumber) ? "DC" : "TD");
                    const needsEway = documentNeedsEway({
                      flow: row.flow,
                      documentNumber: row.dcNumber,
                      printKind: row.printKind,
                    });
                    const srfCount = row.srfCount ?? row.srfReferences.length;
                    return (
                      <tr key={row.id} className="border-b border-zimson-100 last:border-0">
                        <td className="px-3 py-2">
                          <span className="font-mono text-xs font-semibold text-zimson-900">{row.dcNumber}</span>
                          <span
                            className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                              series === "DC" ? "bg-sky-100 text-sky-900" : "bg-stone-100 text-stone-700"
                            }`}
                          >
                            {series}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-stone-700">
                          <span className="block font-medium">{formatDcDate(row.createdAt)}</span>
                          <span className="text-stone-500">{formatDcTime(row.createdAt)}</span>
                        </td>
                        <td className="px-3 py-2 text-xs font-semibold text-stone-800">{transferTypeLabel(row)}</td>
                        <td className="px-3 py-2 text-xs text-stone-700">{routeLabel(row)}</td>
                        <td className="px-3 py-2 font-mono text-xs text-stone-700">
                          <span className="mb-0.5 block text-[10px] font-semibold text-stone-500">
                            {srfCount} SRF{srfCount === 1 ? "" : "s"}
                          </span>
                          <span className="block max-w-xs whitespace-normal break-all">
                            {row.srfReferences.join(", ") || "—"}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {!needsEway ? (
                            <span className="text-xs text-stone-400">N/A</span>
                          ) : (
                            renderEwayCell(row, `eway-${row.id}`, true)
                          )}
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
                          ) : (
                            <button type="button" className={actionBtn} onClick={() => setSelectedDoc(row)}>
                              Details
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      {historyModule === "dcOdc" ? (
        <Card title={`DC / ODC history (${filteredDocRows.length})`}>
          <p className="mb-3 text-xs text-stone-600">
            <strong>TD</strong> = store ↔ HO (no e-way). <strong>DC</strong> = HO ↔ HO (e-way required). Each row is one
            document. Shows transfers you sent or received at your HO.
          </p>
          {dcMsg ? (
            <p className="mb-3 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-950 ring-1 ring-sky-200">{dcMsg}</p>
          ) : null}
          <div className="mb-4 grid gap-2 md:grid-cols-5">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as typeof statusFilter);
                setHistoryPage(1);
              }}
              className="rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm"
            >
              <option value="all">All transfers</option>
              <option value="inward">Store → HO only</option>
              <option value="outward">Outward (HO → Store / HO → HO)</option>
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
              Reset filters
            </button>
            <button
              type="button"
              disabled={dcLoading}
              onClick={() => void loadDcHistory()}
              className="rounded-xl border border-rlx-gold bg-rlx-green-light px-3 py-2 text-sm font-semibold text-rlx-green hover:bg-rlx-green-light/80 disabled:opacity-50"
            >
              {dcLoading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
          {dcLoading ? (
            <p className="text-sm text-stone-500">Loading documents…</p>
          ) : filteredDocRows.length === 0 ? (
            <p className="text-sm text-stone-500">No transfer documents in this filter.</p>
          ) : (
            <div className="space-y-3">
              <div className="overflow-x-auto rounded-xl border border-zimson-200/80">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-zimson-200 bg-zimson-50/80 text-xs font-semibold uppercase tracking-wide text-stone-600">
                    <tr>
                      <th className="px-3 py-2">Document</th>
                      <th className="px-3 py-2">When</th>
                      <th className="px-3 py-2">Transfer type</th>
                      <th className="px-3 py-2">Route (from → to)</th>
                      <th className="px-3 py-2">SRFs</th>
                      <th className="px-3 py-2">E-way</th>
                      <th className="px-3 py-2 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedDocRows.map((row) => {
                      const series = row.documentSeries ?? (/^DC/i.test(row.dcNumber) ? "DC" : "TD");
                      const needsEway = documentNeedsEway({
                        flow: row.flow,
                        documentNumber: row.dcNumber,
                        printKind: row.printKind,
                      });
                      const srfCount = row.srfCount ?? row.srfReferences.length;
                      return (
                        <tr
                          key={`doc-${row.id}`}
                          onClick={() => setSelectedDoc(row)}
                          className="cursor-pointer border-b border-zimson-100 hover:bg-zimson-50/60 last:border-0"
                        >
                          <td className="px-3 py-2">
                            <span className="font-mono text-xs font-semibold text-zimson-900">{row.dcNumber}</span>
                            <span
                              className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                                series === "DC" ? "bg-sky-100 text-sky-900" : "bg-stone-100 text-stone-700"
                              }`}
                            >
                              {series}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-stone-700">
                            <span className="block font-medium">{formatDcDate(row.createdAt)}</span>
                            <span className="text-stone-500">{formatDcTime(row.createdAt)}</span>
                          </td>
                          <td className="px-3 py-2 text-xs font-semibold text-stone-800">{transferTypeLabel(row)}</td>
                          <td className="px-3 py-2 text-xs text-stone-700">{routeLabel(row)}</td>
                          <td className="px-3 py-2 font-mono text-xs text-stone-700">
                            <span className="mb-0.5 block text-[10px] font-semibold text-stone-500">
                              {srfCount} SRF{srfCount === 1 ? "" : "s"}
                            </span>
                            <span className="block max-w-xs whitespace-normal break-all">
                              {row.srfReferences.join(", ") || "—"}
                            </span>
                          </td>
                          <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                            {!needsEway ? (
                              <span className="text-xs text-stone-400" title="E-way not required for store ↔ HO (TD)">
                                N/A
                              </span>
                            ) : (
                              renderEwayCell(row, `doc-${row.id}`, true)
                            )}
                          </td>
                          <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className={actionBtn}
                              onClick={() => setSelectedDoc(row)}
                            >
                              Details
                            </button>
                          </td>
                        </tr>
                      );
                    })}
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
                      <th className="px-3 py-2 text-center">Action</th>
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
                        <button
                          type="button"
                          onClick={() => setBrandDetailsJob(j)}
                          className={actionBtn}
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      {selectedDoc ? (
        <AppModal
          open
          onClose={() => setSelectedDoc(null)}
          eyebrow="Logistics"
          title="Transfer document"
          subtitle={selectedDoc.dcNumber}
          description={`${transferTypeLabel(selectedDoc)} · ${routeLabel(selectedDoc)}`}
          size="lg"
          footer={
            <div className={modalFooterClass}>
              <button
                type="button"
                className={modalBtnGold}
                onClick={() => {
                  void printDeliveryChallanById(selectedDoc.id, liveJobs, {
                    preparedBy: user?.displayName?.trim() || user?.email?.trim(),
                  });
                }}
              >
                Print {selectedDoc.documentSeries ?? (/^DC/i.test(selectedDoc.dcNumber) ? "DC" : "TD")}
              </button>
              {dcCanRetry(selectedDoc) ? (
                <button
                  type="button"
                  className={modalBtnPrimary}
                  onClick={() => {
                    setEwayBusyId(selectedDoc.id);
                    setEwayDcId(selectedDoc.id);
                  }}
                >
                  {ewayActionLabel(selectedDoc)}
                </button>
              ) : null}
              {resolveEwayPdf(selectedDoc) ? (
                <a
                  href={resolveEwayPdf(selectedDoc)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${modalBtnSecondary} no-underline`}
                >
                  Open e-way PDF
                </a>
              ) : null}
              <button type="button" className={modalBtnSecondary} onClick={() => setSelectedDoc(null)}>
                Done
              </button>
            </div>
          }
        >
          <AppModalDetailGrid>
            <AppModalDetailRow label="Date">
              {formatDcDate(selectedDoc.createdAt)} {formatDcTime(selectedDoc.createdAt)}
            </AppModalDetailRow>
            <AppModalDetailRow label="Route">{routeLabel(selectedDoc)}</AppModalDetailRow>
            <AppModalDetailRow label="Type">
              <span className="font-semibold text-zimson-900">{transferTypeLabel(selectedDoc)}</span>
            </AppModalDetailRow>
            <AppModalDetailRow label="SRFs">
              <span className="font-mono text-xs">
                {(selectedDoc.srfCount ?? selectedDoc.srfReferences.length)} —{" "}
                {selectedDoc.srfReferences.join(", ") || "—"}
              </span>
            </AppModalDetailRow>
            <AppModalDetailRow label="E-way" last>
              {selectedDoc.edocEwayBillNo?.trim() ? (
                <span className="font-mono font-semibold text-emerald-800">{selectedDoc.edocEwayBillNo}</span>
              ) : documentNeedsEway({
                  flow: selectedDoc.flow,
                  documentNumber: selectedDoc.dcNumber,
                  printKind: selectedDoc.printKind,
                }) ? (
                <span className="font-semibold text-rlx-gold-dark">Pending</span>
              ) : (
                <span className="text-slate-500">N/A (store ↔ HO)</span>
              )}
            </AppModalDetailRow>
          </AppModalDetailGrid>
        </AppModal>
      ) : null}

      {brandDetailsJob ? (
        <BrandSendDetailsModal
          job={brandDetailsJob}
          onClose={() => setBrandDetailsJob(null)}
          onEwayUpdated={() => {
            void refreshJobs();
          }}
          transferDcLabel={
            brandDetailsJob.dcNumber?.trim() ||
            brandDetailsJob.outwardDcNumber?.trim() ||
            null
          }
          onPrintTransferDc={
            brandDetailsJob.dcNumber && dcByNumber.get(brandDetailsJob.dcNumber)
              ? () => {
                  const dc = dcByNumber.get(brandDetailsJob.dcNumber!)!;
                  void printDeliveryChallanById(dc.id, jobs, {
                    preparedBy: user?.displayName?.trim() || user?.email?.trim(),
                  });
                }
              : brandDetailsJob.outwardDcNumber && dcByNumber.get(brandDetailsJob.outwardDcNumber)
                ? () => {
                    const dc = dcByNumber.get(brandDetailsJob.outwardDcNumber!)!;
                    void printDeliveryChallanById(dc.id, jobs, {
                      preparedBy: user?.displayName?.trim() || user?.email?.trim(),
                    });
                  }
                : undefined
          }
          transferEwayBillNo={
            (brandDetailsJob.dcNumber && dcByNumber.get(brandDetailsJob.dcNumber)?.edocEwayBillNo) ||
            (brandDetailsJob.outwardDcNumber &&
              dcByNumber.get(brandDetailsJob.outwardDcNumber)?.edocEwayBillNo) ||
            null
          }
          transferEwayValidUpto={
            (brandDetailsJob.dcNumber && dcByNumber.get(brandDetailsJob.dcNumber)?.edocEwayValidUpto) ||
            (brandDetailsJob.outwardDcNumber &&
              dcByNumber.get(brandDetailsJob.outwardDcNumber)?.edocEwayValidUpto) ||
            null
          }
          transferEwayPdfUrl={
            (brandDetailsJob.dcNumber && dcByNumber.get(brandDetailsJob.dcNumber)?.edocEwayPdfUrl) ||
            (brandDetailsJob.outwardDcNumber &&
              dcByNumber.get(brandDetailsJob.outwardDcNumber)?.edocEwayPdfUrl) ||
            null
          }
        />
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
    </div>
  );
}
