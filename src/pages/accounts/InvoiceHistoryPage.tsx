import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ServiceInvoiceTemplate } from "../../components/service/ServiceInvoiceTemplate";
import { FilterField } from "../../components/ui/FilterField";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useCustomers } from "../../context/CustomersContext";
import { useRegions } from "../../context/RegionsContext";
import { useSpares } from "../../context/SparesContext";
import { useSrfJobs } from "../../context/SrfJobsContext";
import { apiJson, useApiMode } from "../../lib/api";
import { triggerBlobDownload } from "../../lib/captureInvoicePdf";
import {
  buildInvoiceVmFromHistoryRecord,
  invoiceHistoryPdfFilename,
} from "../../lib/invoiceHistoryPrint";
import { printServiceInvoice } from "../../lib/printServiceInvoice";
import { captureInvoicePdfFromViewModel } from "../../lib/renderInvoiceForPdf";
import type { ServiceInvoiceViewModel } from "../../types/serviceInvoice";
import type { ServiceTaxSettings } from "../../types/serviceTaxSettings";
import type {
  InvoicePaymentRecord,
  InvoicePaymentStatus,
  ServiceInvoiceRecord,
  ServiceInvoiceSourceType,
} from "../../types/serviceInvoiceRecord";
import type { EdocSettings } from "../../types/edocSettings";
import type { QuickBillEdocInfo } from "../../types/quickBill";
import { invoiceSourceLabel, paymentStatusLabel } from "../../types/serviceInvoiceRecord";

const PAYMENT_MODES = ["Cash", "Card", "UPI", "Bank transfer", "Cheque", "NEFT/RTGS"];

const statusCls: Record<InvoicePaymentStatus, string> = {
  paid: "bg-emerald-100 text-emerald-800",
  partial: "bg-amber-100 text-amber-900",
  unpaid: "bg-rose-100 text-rose-800",
};

const edocStatusCls: Record<string, string> = {
  SUCCESS: "bg-emerald-100 text-emerald-800",
  FAILED: "bg-rose-100 text-rose-800",
  SKIPPED: "bg-stone-100 text-stone-700",
};

function interHoEdocLabel(record: ServiceInvoiceRecord): string {
  if (record.edocIrn?.trim()) return "IRN issued";
  if (record.edocStatus === "FAILED") return "E-invoice failed";
  if (record.edocStatus === "SKIPPED") return "Skipped";
  return "Pending IRN";
}

function interHoNeedsEdoc(record: ServiceInvoiceRecord, edocEnabled: boolean): boolean {
  return (
    record.sourceType === "inter_ho_repair" &&
    edocEnabled &&
    !record.edocIrn?.trim() &&
    record.edocStatus !== "SKIPPED"
  );
}

export function InvoiceHistoryPage() {
  const apiMode = useApiMode();
  const { user } = useAuth();
  const { jobs } = useSrfJobs();
  const { regions } = useRegions();
  const { customers } = useCustomers();
  const { activeSpares } = useSpares();
  const [serviceTaxSettings, setServiceTaxSettings] = useState<ServiceTaxSettings | null>(null);
  const [rows, setRows] = useState<ServiceInvoiceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"ALL" | InvoicePaymentStatus>("ALL");
  const [sourceType, setSourceType] = useState<"ALL" | ServiceInvoiceSourceType>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ServiceInvoiceRecord | null>(null);
  const [payments, setPayments] = useState<InvoicePaymentRecord[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMode, setPayMode] = useState("Bank transfer");
  const [payNote, setPayNote] = useState("");
  const [payBusy, setPayBusy] = useState(false);
  const [payMsg, setPayMsg] = useState<string | null>(null);
  const [previewVm, setPreviewVm] = useState<ServiceInvoiceViewModel | null>(null);
  const [previewRecord, setPreviewRecord] = useState<ServiceInvoiceRecord | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);
  const [printMsg, setPrintMsg] = useState<string | null>(null);
  const [edocSettings, setEdocSettings] = useState<EdocSettings | null>(null);
  const [edocBusyId, setEdocBusyId] = useState<string | null>(null);
  const [edocMsg, setEdocMsg] = useState<string | null>(null);

  const edocEnabled = Boolean(edocSettings?.enabled);

  const printContext = useMemo(
    () => ({
      regions,
      spares: activeSpares,
      taxSettings: serviceTaxSettings,
      customers,
      generatedBy: user?.displayName?.trim() || user?.email?.trim() || null,
    }),
    [regions, activeSpares, serviceTaxSettings, customers, user],
  );

  useEffect(() => {
    if (!apiMode) return;
    let cancelled = false;
    void apiJson<{ settings: ServiceTaxSettings }>("/api/settings/tax")
      .then((d) => {
        if (!cancelled) setServiceTaxSettings(d.settings);
      })
      .catch(() => {
        if (!cancelled) setServiceTaxSettings(null);
      });
    return () => {
      cancelled = true;
    };
  }, [apiMode]);

  useEffect(() => {
    if (!apiMode) return;
    let cancelled = false;
    void apiJson<{ settings: EdocSettings }>("/api/settings/edoc")
      .then((d) => {
        if (!cancelled) setEdocSettings(d.settings);
      })
      .catch(() => {
        if (!cancelled) setEdocSettings(null);
      });
    return () => {
      cancelled = true;
    };
  }, [apiMode]);

  function resolveInvoiceVm(record: ServiceInvoiceRecord): ServiceInvoiceViewModel | null {
    const job = record.sourceId ? (jobs.find((j) => j.id === record.sourceId) ?? null) : null;
    return buildInvoiceVmFromHistoryRecord(record, { ...printContext, job });
  }

  async function downloadInvoicePdf(record: ServiceInvoiceRecord, fromPreview = false) {
    setPdfBusyId(record.id);
    setPrintMsg(null);
    try {
      if (fromPreview) {
        const { downloadServiceInvoicePdfFromPage } = await import("../../lib/captureInvoicePdf");
        await downloadServiceInvoicePdfFromPage(invoiceHistoryPdfFilename(record.invoiceNumber));
        return;
      }
      const vm = resolveInvoiceVm(record);
      if (!vm) {
        throw new Error("Could not build invoice layout. Ensure the linked SRF is loaded and try again.");
      }
      const blob = await captureInvoicePdfFromViewModel(vm, `inv-hist-${record.id.replace(/-/g, "").slice(0, 12)}`);
      triggerBlobDownload(blob, invoiceHistoryPdfFilename(record.invoiceNumber));
    } catch (e) {
      setPrintMsg(e instanceof Error ? e.message : "Could not download PDF.");
    } finally {
      setPdfBusyId(null);
    }
  }

  function openInvoicePreview(record: ServiceInvoiceRecord) {
    setPrintMsg(null);
    const vm = resolveInvoiceVm(record);
    if (!vm) {
      setPrintMsg("Could not build invoice preview. Ensure the linked SRF is loaded and try again.");
      return;
    }
    setPreviewVm(vm);
    setPreviewRecord(record);
    setPreviewOpen(true);
  }

  function printInvoice(record: ServiceInvoiceRecord) {
    setPrintMsg(null);
    const vm = resolveInvoiceVm(record);
    if (!vm) {
      setPrintMsg("Could not prepare invoice for print.");
      return;
    }
    setPreviewVm(vm);
    setPreviewRecord(record);
    setPreviewOpen(true);
    window.setTimeout(() => printServiceInvoice(), 120);
  }

  const loadList = useCallback(async () => {
    if (!apiMode) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ sync: "1", limit: "300" });
      if (status !== "ALL") params.set("status", status);
      if (sourceType !== "ALL") params.set("sourceType", sourceType);
      if (query.trim()) params.set("q", query.trim());
      const out = await apiJson<{ rows: ServiceInvoiceRecord[] }>(`/api/accounts/invoices?${params.toString()}`);
      setRows(out.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load invoices.");
    } finally {
      setLoading(false);
    }
  }, [apiMode, query, sourceType, status]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.invoiceNumber.toLowerCase().includes(q) ||
        r.customerName.toLowerCase().includes(q) ||
        (r.srfReference ?? "").toLowerCase().includes(q) ||
        (r.rootSrfReference ?? "").toLowerCase().includes(q),
    );
  }, [rows, query]);

  async function syncLegacy() {
    setSyncing(true);
    setError(null);
    try {
      await apiJson("/api/accounts/invoices/sync", { method: "POST" });
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  async function openDetail(id: string) {
    setSelectedId(id);
    setDetailLoading(true);
    setPayMsg(null);
    setPayAmount("");
    setPayNote("");
    try {
      const out = await apiJson<{ invoice: ServiceInvoiceRecord; payments: InvoicePaymentRecord[] }>(
        `/api/accounts/invoices/${encodeURIComponent(id)}`,
      );
      setDetail(out.invoice);
      setPayments(out.payments);
      if (out.invoice.balanceDueInr > 0) {
        setPayAmount(String(out.invoice.balanceDueInr));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load invoice detail.");
      setSelectedId(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function submitPayment() {
    if (!detail) return;
    const amount = Number.parseFloat(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setPayMsg("Enter a valid payment amount.");
      return;
    }
    setPayBusy(true);
    setPayMsg(null);
    try {
      const out = await apiJson<{ voucherRef: string }>(
        `/api/accounts/invoices/${encodeURIComponent(detail.id)}/payments`,
        {
          method: "POST",
          json: { amountInr: amount, paymentMode: payMode, narration: payNote.trim() || null },
        },
      );
      setPayMsg(`Payment recorded — voucher ${out.voucherRef}`);
      await openDetail(detail.id);
      await loadList();
    } catch (e) {
      setPayMsg(e instanceof Error ? e.message : "Payment failed.");
    } finally {
      setPayBusy(false);
    }
  }

  async function generateEdoc(record: ServiceInvoiceRecord) {
    setEdocBusyId(record.id);
    setEdocMsg(null);
    try {
      const out = await apiJson<{ ok: boolean; edoc: QuickBillEdocInfo; invoice: ServiceInvoiceRecord | null }>(
        `/api/accounts/invoices/${encodeURIComponent(record.id)}/generate-einvoice`,
        { method: "POST" },
      );
      if (out.invoice) {
        setDetail((prev) => (prev?.id === record.id ? out.invoice : prev));
        setRows((prev) => prev.map((r) => (r.id === record.id && out.invoice ? out.invoice! : r)));
      }
      if (out.edoc?.ok) {
        setEdocMsg(`E-invoice registered. IRN: ${out.edoc.irn ?? "—"}`);
      } else if (out.edoc?.skipped) {
        setEdocMsg(`E-invoice skipped: ${out.edoc.skipReason ?? "Not applicable."}`);
      } else {
        setEdocMsg(`E-invoice failed: ${out.edoc?.error ?? out.edoc?.skipReason ?? "IRP error."}`);
      }
      if (selectedId === record.id && out.invoice) {
        setDetail(out.invoice);
      }
      await loadList();
    } catch (e) {
      setEdocMsg(e instanceof Error ? e.message : "Could not generate e-invoice.");
    } finally {
      setEdocBusyId(null);
    }
  }

  return (
    <div className="ui-page-bleed font-sans text-rlx-ink">
      <div className="bg-rlx-bg px-4 py-4 md:px-6">
        <PageHeader
          title="Invoice history"
          description="SRF store billing and inter-HO repair invoices — payment status, root SRF reference, and ledger posting."
          actions={
            <div className="flex flex-wrap gap-2">
              <button type="button" className="ui-btn-secondary" disabled={syncing} onClick={() => void syncLegacy()}>
                {syncing ? "Syncing…" : "Sync from legacy"}
              </button>
              <Link to="/accounts/ledger" className="ui-btn-secondary no-underline">
                View ledger
              </Link>
              <Link to="/accounts/setup" className="ui-btn-secondary no-underline">
                Accounts setup
              </Link>
            </div>
          }
        />

        {error ? (
          <div className="mb-4 border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        ) : null}

        {printMsg ? (
          <div className="mb-4 border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-950">{printMsg}</div>
        ) : null}

        {edocMsg ? (
          <div className="mb-4 border-l-4 border-sky-500 bg-sky-50 px-4 py-3 text-sm text-sky-950">{edocMsg}</div>
        ) : null}

        <div className="ui-filter-grid mb-4">
          <FilterField label="Search" htmlFor="inv-hist-q" className="ui-filter-span-2-sm">
            <input id="inv-hist-q" className="ui-field" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Invoice no., customer, SRF…" />
          </FilterField>
          <FilterField label="Payment status" htmlFor="inv-hist-status">
            <select id="inv-hist-status" className="ui-field" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="ALL">All</option>
              <option value="unpaid">Unpaid</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
            </select>
          </FilterField>
          <FilterField label="Source" htmlFor="inv-hist-source">
            <select id="inv-hist-source" className="ui-field" value={sourceType} onChange={(e) => setSourceType(e.target.value as typeof sourceType)}>
              <option value="ALL">All SRF sources</option>
              <option value="srf_store">SRF store billing</option>
              <option value="inter_ho_repair">Inter-HO repair</option>
            </select>
          </FilterField>
          <div className="flex items-end">
            <button type="button" className="ui-btn-secondary" onClick={() => void loadList()}>
              Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-rlx-ink-muted">Loading invoices…</p>
        ) : filtered.length === 0 ? (
          <div className="border border-rlx-rule bg-white px-5 py-10 text-center text-sm text-rlx-ink-muted">
            No SRF invoices found. Use <strong>Sync from legacy</strong> to import closed store bills and inter-HO repair invoices.
          </div>
        ) : (
          <div className="ui-table-scroll border border-rlx-rule bg-white shadow-sm">
            <table className="ui-table-dense w-full min-w-[56rem] text-left text-sm">
              <thead className="bg-rlx-green text-[9px] font-semibold uppercase tracking-[0.2em] text-white">
                <tr>
                  <th>Date</th>
                  <th>Invoice</th>
                  <th>Source</th>
                  <th>Customer</th>
                  <th>Root SRF</th>
                  <th>Repair SRF</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Balance</th>
                  <th>Status</th>
                  {edocEnabled ? <th>E-invoice</th> : null}
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, idx) => (
                  <tr key={r.id} className={`border-b border-rlx-rule ${idx % 2 ? "bg-rlx-bg" : "bg-white"}`}>
                    <td className="whitespace-nowrap text-xs text-rlx-ink-muted">{new Date(r.createdAt).toLocaleDateString()}</td>
                    <td className="font-mono text-[11px] font-semibold text-rlx-green">{r.invoiceNumber}</td>
                    <td className="text-xs">{invoiceSourceLabel(r.sourceType)}</td>
                    <td>
                      <div className="font-medium">{r.customerName}</div>
                      {r.customerPhone ? <div className="text-[10px] text-rlx-ink-muted">{r.customerPhone}</div> : null}
                    </td>
                    <td className="font-mono text-[10px]">{r.rootSrfReference ?? "—"}</td>
                    <td className="font-mono text-[10px]">
                      {r.srfReference && r.srfReference !== r.rootSrfReference ? r.srfReference : "—"}
                    </td>
                    <td className="text-right font-medium">{r.totalInr.toLocaleString(undefined, { style: "currency", currency: "INR" })}</td>
                    <td className="text-right">{r.balanceDueInr.toLocaleString(undefined, { style: "currency", currency: "INR" })}</td>
                    <td>
                      <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold uppercase ${statusCls[r.paymentStatus]}`}>
                        {paymentStatusLabel(r.paymentStatus)}
                      </span>
                    </td>
                    {edocEnabled ? (
                      <td>
                        {r.sourceType === "inter_ho_repair" ? (
                          <span
                            className={`inline-block px-2 py-0.5 text-[10px] font-semibold uppercase ${
                              edocStatusCls[r.edocStatus ?? ""] ?? "bg-amber-100 text-amber-900"
                            }`}
                          >
                            {interHoEdocLabel(r)}
                          </span>
                        ) : (
                          <span className="text-[10px] text-rlx-ink-muted">—</span>
                        )}
                      </td>
                    ) : null}
                    <td>
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          className="ui-btn-secondary text-[10px]"
                          disabled={pdfBusyId === r.id}
                          onClick={() => void downloadInvoicePdf(r)}
                        >
                          {pdfBusyId === r.id ? "…" : "PDF"}
                        </button>
                        <button type="button" className="ui-btn-secondary text-[10px]" onClick={() => openInvoicePreview(r)}>
                          Preview
                        </button>
                        <button type="button" className="ui-btn-secondary text-[10px]" onClick={() => void openDetail(r.id)}>
                          Open
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedId ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-rlx-ink/70 p-0 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto bg-white shadow-xl">
            <div className="bg-rlx-green px-5 py-4">
              <p className="text-[9px] font-semibold uppercase tracking-[0.4em] text-rlx-gold">Invoice detail</p>
              <h3 className="text-lg font-semibold text-white">{detail?.invoiceNumber ?? "…"}</h3>
            </div>
            <div className="space-y-4 px-5 py-4">
              {detailLoading || !detail ? (
                <p className="text-sm text-rlx-ink-muted">Loading…</p>
              ) : (
                <>
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <dt className="text-rlx-ink-muted">Customer</dt>
                    <dd className="font-medium">{detail.customerName}</dd>
                    <dt className="text-rlx-ink-muted">Source</dt>
                    <dd>{invoiceSourceLabel(detail.sourceType)}</dd>
                    <dt className="text-rlx-ink-muted">Root SRF</dt>
                    <dd className="font-mono text-xs">{detail.rootSrfReference ?? detail.srfReference ?? "—"}</dd>
                    {detail.srfReference && detail.srfReference !== detail.rootSrfReference ? (
                      <>
                        <dt className="text-rlx-ink-muted">Repair SRF</dt>
                        <dd className="font-mono text-xs">{detail.srfReference}</dd>
                      </>
                    ) : null}
                    <dt className="text-rlx-ink-muted">Total</dt>
                    <dd>{detail.totalInr.toLocaleString(undefined, { style: "currency", currency: "INR" })}</dd>
                    <dt className="text-rlx-ink-muted">Paid</dt>
                    <dd>{detail.paidInr.toLocaleString(undefined, { style: "currency", currency: "INR" })}</dd>
                    <dt className="text-rlx-ink-muted">Balance due</dt>
                    <dd className="font-semibold text-rlx-green">
                      {detail.balanceDueInr.toLocaleString(undefined, { style: "currency", currency: "INR" })}
                    </dd>
                  </dl>

                  <div className="flex flex-wrap gap-2 border-t border-rlx-rule pt-4">
                    <button type="button" className="ui-btn-secondary text-xs" onClick={() => openInvoicePreview(detail)}>
                      Preview invoice
                    </button>
                    <button
                      type="button"
                      className="ui-btn-secondary text-xs"
                      disabled={pdfBusyId === detail.id}
                      onClick={() => void downloadInvoicePdf(detail)}
                    >
                      {pdfBusyId === detail.id ? "Preparing PDF…" : "Download PDF"}
                    </button>
                    <button type="button" className="ui-btn-secondary text-xs" onClick={() => printInvoice(detail)}>
                      Print
                    </button>
                    {detail.sourceType === "inter_ho_repair" && edocEnabled && !detail.edocIrn?.trim() ? (
                      <button
                        type="button"
                        className="ui-btn-secondary text-xs"
                        disabled={edocBusyId === detail.id}
                        onClick={() => void generateEdoc(detail)}
                      >
                        {edocBusyId === detail.id ? "Generating…" : "Generate e-invoice"}
                      </button>
                    ) : null}
                  </div>

                  {detail.sourceType === "inter_ho_repair" && edocEnabled ? (
                    <div
                      className={`rounded border px-3 py-2 text-xs ${
                        detail.edocIrn
                          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                          : detail.edocStatus === "FAILED"
                            ? "border-rose-200 bg-rose-50 text-rose-900"
                            : "border-amber-200 bg-amber-50 text-amber-950"
                      }`}
                    >
                      {detail.edocIrn ? (
                        <>
                          <strong>E-invoice registered.</strong> IRN:{" "}
                          <span className="font-mono break-all">{detail.edocIrn}</span>
                          {detail.edocAckNo ? <> · Ack: {detail.edocAckNo}</> : null}
                        </>
                      ) : detail.edocStatus === "SKIPPED" ? (
                        <>
                          <strong>E-invoice skipped:</strong> {detail.edocError ?? "Not applicable."}
                        </>
                      ) : (
                        <>
                          <strong>Mandatory GST e-invoice pending.</strong>{" "}
                          {detail.edocError ?? "Generate IRN before recording payment."}
                        </>
                      )}
                    </div>
                  ) : null}

                  {payments.length > 0 ? (
                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-rlx-ink-muted">Payments</p>
                      <ul className="space-y-2 text-xs">
                        {payments.map((p) => (
                          <li key={p.id} className="border border-rlx-rule bg-rlx-bg px-3 py-2">
                            <span className="font-mono font-semibold">{p.voucherRef}</span> · {p.paymentMode} ·{" "}
                            {p.amountInr.toLocaleString(undefined, { style: "currency", currency: "INR" })}
                            <div className="text-rlx-ink-muted">{new Date(p.postedAt).toLocaleString()}</div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {detail.balanceDueInr > 0.01 ? (
                    <div className="border-t border-rlx-rule pt-4">
                      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.25em] text-rlx-gold">Record payment</p>
                      {interHoNeedsEdoc(detail, edocEnabled) ? (
                        <p className="mb-3 text-xs text-rose-800">
                          Payment is blocked until GST e-invoice (IRN) is generated for this inter-HO invoice.
                        </p>
                      ) : null}
                      <div className="space-y-3">
                        <label className="block text-xs">
                          Amount (INR)
                          <input className="ui-field mt-1" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
                        </label>
                        <label className="block text-xs">
                          Mode
                          <select className="ui-field mt-1" value={payMode} onChange={(e) => setPayMode(e.target.value)}>
                            {PAYMENT_MODES.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block text-xs">
                          Note
                          <input className="ui-field mt-1" value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="Optional narration" />
                        </label>
                        {payMsg ? <p className="text-xs text-emerald-800">{payMsg}</p> : null}
                        <button
                          type="button"
                          className="w-full bg-rlx-gold px-4 py-2.5 text-sm font-semibold text-rlx-green-deep hover:bg-rlx-gold-dark disabled:opacity-50"
                          disabled={payBusy || interHoNeedsEdoc(detail, edocEnabled)}
                          onClick={() => void submitPayment()}
                        >
                          {payBusy ? "Posting…" : "Post payment to ledger"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-emerald-700">This invoice is fully paid.</p>
                  )}
                </>
              )}
            </div>
            <div className="border-t border-rlx-rule bg-rlx-bg px-5 py-3">
              <button type="button" className="ui-btn-secondary w-full" onClick={() => setSelectedId(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {previewOpen && previewVm && previewRecord ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-rlx-ink/70 p-0 sm:items-center sm:p-4 print:static print:inset-auto print:bg-white print:p-0">
          <div className="max-h-[94vh] w-full max-w-5xl overflow-y-auto bg-white shadow-xl print:max-h-none print:max-w-none print:shadow-none">
            <div className="sticky top-0 z-10 flex flex-col gap-3 bg-rlx-green px-4 py-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.4em] text-rlx-gold">Invoice preview</p>
                <h3 className="text-lg font-semibold text-white">{previewRecord.invoiceNumber}</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="bg-rlx-gold px-4 py-2 text-xs font-semibold text-rlx-green-deep" onClick={() => printServiceInvoice()}>
                  Print
                </button>
                <button
                  type="button"
                  className="border border-white/30 px-4 py-2 text-xs font-semibold text-white"
                  disabled={pdfBusyId === previewRecord.id}
                  onClick={() => void downloadInvoicePdf(previewRecord, true)}
                >
                  {pdfBusyId === previewRecord.id ? "Preparing…" : "Download PDF"}
                </button>
                <button
                  type="button"
                  className="border border-white/20 px-4 py-2 text-xs font-semibold text-white/80"
                  onClick={() => {
                    setPreviewOpen(false);
                    setPreviewVm(null);
                    setPreviewRecord(null);
                  }}
                >
                  Close
                </button>
              </div>
            </div>
            <div className="p-4 md:p-6">
              <ServiceInvoiceTemplate data={previewVm} idPrefix={`inv-hist-preview-${previewRecord.id.slice(0, 8)}`} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
