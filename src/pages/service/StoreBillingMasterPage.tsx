import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ServiceBreadcrumb } from "../../components/service/ServiceBreadcrumb";
import { ServiceInvoiceTemplate } from "../../components/service/ServiceInvoiceTemplate";
import { SrfTraceModal } from "../../components/service/SrfTraceModal";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { ProcessSuccessModal } from "../../components/ui/ProcessSuccessModal";
import { useAuth } from "../../context/AuthContext";
import { useRegions } from "../../context/RegionsContext";
import { useSrfJobs } from "../../context/SrfJobsContext";
import { apiJson, ApiError } from "../../lib/api";
import { ESTIMATE_LABEL_APPROX, formatApproxEstimateCurrency } from "../../lib/formatInr";
import { ResendClosedSrfInvoiceActions, IconGstEinvoice, IconSpinner, invoicePreviewIconBtn } from "../../components/service/ResendClosedSrfInvoiceActions";
import { IconClose, IconPreview, IconPrint } from "../../components/service/invoicePreviewIcons";
import { useCustomers } from "../../context/CustomersContext";
import { useSpares } from "../../context/SparesContext";
import { phoneLast10 } from "../../lib/customerLookup";
import { printServiceInvoice } from "../../lib/printServiceInvoice";
import { isArchivedSrfJob, jobVisibleToStoreUser } from "../../lib/srfAccess";
import { buildStoreBillingInvoiceFromClosedJob } from "../../lib/storeBillingAmounts";
import { DEFAULT_SERVICE_SAC, formatPrintedHsnSac } from "../../lib/hsnGst";
import {
  formatEinvoiceEdocMessage,
  humanizeEinvoiceError,
  srfCanGenerateEinvoice,
  srfNeedsEinvoiceRetry,
} from "../../lib/edocResultMessage";
import type { QuickBillEdocInfo } from "../../types/quickBill";
import type { ServiceInvoiceViewModel } from "../../types/serviceInvoice";
import type { ServiceTaxSettings } from "../../types/serviceTaxSettings";
import type { SrfJob } from "../../types/srfJob";
import { seedStoreToInvoiceProfile } from "../../types/storeInvoice";

const iconBtn =
  "group relative inline-flex h-9 w-9 items-center justify-center rounded-xl border shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm";

const resendIconPreview = `${invoicePreviewIconBtn} rounded-xl border border-sky-200 bg-sky-50 text-sky-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-sky-100 hover:shadow-md`;
const resendIconPrint = `${invoicePreviewIconBtn} rounded-xl border border-[#1b3a8f]/40 bg-gradient-to-b from-[#1b3a8f] to-[#0c1c56] text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md`;
const resendIconEinvoice = `${invoicePreviewIconBtn} rounded-xl border border-amber-300 bg-amber-50 text-amber-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-amber-100 hover:shadow-md disabled:opacity-50`;
const resendIconClose = `${invoicePreviewIconBtn} rounded-xl border border-stone-200 bg-white text-stone-600 shadow-sm transition hover:-translate-y-0.5 hover:bg-stone-50 hover:shadow-md`;

type IconProps = { className?: string };

function DetailsIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4" />
      <path d="M9 7h6M9 11h6M9 15h3" />
      <circle cx="18" cy="6" r="3" />
    </svg>
  );
}

function PreviewIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function PrinterIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 9V3h12v6" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="7" rx="1" />
      <path d="M9 17h6" />
    </svg>
  );
}

function RetryIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v5h-5" />
    </svg>
  );
}

function ResendIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
    </svg>
  );
}

function SpinnerIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function ActionTooltip({ label }: { label: string }) {
  return (
    <span className="pointer-events-none absolute -top-8 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-md bg-zimson-900 px-2 py-1 text-[10px] font-semibold text-white opacity-0 shadow-lg transition group-hover:opacity-100">
      {label}
    </span>
  );
}

export function StoreBillingMasterPage() {
  const { user } = useAuth();
  const { regions } = useRegions();
  const { jobs, refreshJobs } = useSrfJobs();
  const [page, setPage] = useState(1);
  const [traceId, setTraceId] = useState<string | null>(null);
  const [serviceTaxSettings, setServiceTaxSettings] = useState<ServiceTaxSettings | null>(null);
  const [printInvoiceVm, setPrintInvoiceVm] = useState<ServiceInvoiceViewModel | null>(null);
  const [previewJob, setPreviewJob] = useState<SrfJob | null>(null);
  const [resendJob, setResendJob] = useState<SrfJob | null>(null);
  const { customers } = useCustomers();
  const { activeSpares } = useSpares();
  const [resendNote, setResendNote] = useState<string | null>(null);
  const [edocEnabled, setEdocEnabled] = useState(false);
  const [edocBusyId, setEdocBusyId] = useState<string | null>(null);
  const pageSize = 10;

  const currentUserStore = useMemo(() => {
    const sid = user?.storeId ?? "";
    if (!sid) return undefined;
    for (const r of regions) {
      const s = r.stores.find((x) => x.id === sid);
      if (s) return s;
    }
    return undefined;
  }, [regions, user?.storeId]);

  const storeInvoiceForPrint = useMemo(
    () => seedStoreToInvoiceProfile(currentUserStore),
    [currentUserStore],
  );

  useEffect(() => {
    if (!user) return;
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
  }, [user]);

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

  function invoiceVmForJob(job: SrfJob): ServiceInvoiceViewModel {
    const cust = customers.find((c) => phoneLast10(c.phone) === phoneLast10(job.phone)) ?? null;
    return buildStoreBillingInvoiceFromClosedJob(job, {
      taxSettings: serviceTaxSettings,
      storeInvoice: storeInvoiceForPrint,
      generatedBy: user?.displayName?.trim() || user?.email?.trim() || user?.id || null,
      customer: cust,
      defaultHsnSac: formatPrintedHsnSac(serviceTaxSettings?.defaultSacHsn?.trim() || DEFAULT_SERVICE_SAC),
      spareHsnLookup: (spareId) => activeSpares.find((s) => s.id === spareId)?.hsn?.trim() || null,
      spareGstLookup: (spareId) => activeSpares.find((s) => s.id === spareId)?.gstPercent ?? null,
    });
  }

  function handlePrintInvoice(job: SrfJob) {
    const vm = invoiceVmForJob(job);
    setPrintInvoiceVm(vm);
    window.setTimeout(() => {
      printServiceInvoice();
      window.setTimeout(() => setPrintInvoiceVm(null), 500);
    }, 80);
  }

  function handlePrintFromPreview() {
    const job = previewJob;
    setPreviewJob(null);
    if (job) window.setTimeout(() => handlePrintInvoice(job), 60);
  }

  function handleResendInvoice(job: SrfJob) {
    setResendNote(null);
    setResendJob(job);
  }

  async function retryEinvoice(job: SrfJob) {
    if (!srfNeedsEinvoiceRetry(job, edocEnabled) && !srfCanGenerateEinvoice(job, edocEnabled)) return;
    setEdocBusyId(job.id);
    setResendNote(null);
    try {
      const out = await apiJson<{ edoc: QuickBillEdocInfo }>(
        `/api/edoc/srf-jobs/${encodeURIComponent(job.id)}/generate-einvoice`,
        { method: "POST", json: {} },
      );
      const msg = formatEinvoiceEdocMessage(out.edoc);
      if (out.edoc?.ok) {
        setResendNote(msg ?? "E-invoice registered.");
      } else {
        setResendNote(
          `E-invoice failed: ${humanizeEinvoiceError(out.edoc?.error ?? out.edoc?.skipReason ?? msg)}`,
        );
      }
      await refreshJobs();
      if (resendJob?.id === job.id) {
        setResendJob((prev) =>
          prev && prev.id === job.id
            ? {
                ...prev,
                edocIrn: out.edoc?.irn ?? prev.edocIrn,
                edocStatus: out.edoc?.ok ? "SUCCESS" : out.edoc?.skipped ? "SKIPPED" : "FAILED",
                edocError: out.edoc?.error ?? out.edoc?.skipReason ?? prev.edocError,
              }
            : prev,
        );
      }
    } catch (e) {
      setResendNote(e instanceof ApiError ? e.message : "Could not retry e-invoice.");
    } finally {
      setEdocBusyId(null);
    }
  }

  const resendCustomer = useMemo(() => {
    if (!resendJob) return null;
    return customers.find((c) => phoneLast10(c.phone) === phoneLast10(resendJob.phone)) ?? null;
  }, [resendJob, customers]);

  const spareHsnLookup = useMemo(
    () => (spareId: string) => activeSpares.find((s) => s.id === spareId)?.hsn?.trim() || null,
    [activeSpares],
  );
  const spareGstLookup = useMemo(
    () => (spareId: string) => activeSpares.find((s) => s.id === spareId)?.gstPercent ?? null,
    [activeSpares],
  );

  const recentClosedBilling = useMemo(() => {
    if (!user) return [];
    return jobs
      .filter((j) => j.status === "closed" && !isArchivedSrfJob(j) && jobVisibleToStoreUser(j, user))
      .sort((a, b) => String(b.closedAt ?? b.updatedAt ?? "").localeCompare(String(a.closedAt ?? a.updatedAt ?? "")));
  }, [jobs, user]);

  const totalPages = Math.max(1, Math.ceil(recentClosedBilling.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return recentClosedBilling.slice(start, start + pageSize);
  }, [recentClosedBilling, currentPage]);

  if (!user) return null;

  return (
    <div>
      <div className={printInvoiceVm || resendJob ? "print:hidden" : undefined}>
        <ServiceBreadcrumb current="Store billing master" />
        <PageHeader
          title="Store billing master"
          description=""
          actions={
            <Link
              to="/service/store-billing"
              className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
            >
              Back to store billing
            </Link>
          }
        />

        <Card title="Store billing history" subtitle="">
          {resendNote && !resendJob ? (
            <p className="mb-3 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-950 ring-1 ring-sky-200">{resendNote}</p>
          ) : null}
          {recentClosedBilling.length === 0 ? (
            <p className="text-sm text-stone-600">No closed SRFs in your visible scope yet.</p>
          ) : (
            <>
              <div className="max-h-[560px] overflow-auto rounded-xl border border-zimson-200/80">
                <table className="min-w-full text-left text-sm">
                  <thead className="sticky top-0 border-b border-zimson-200 bg-zimson-50/95 text-xs font-semibold uppercase text-stone-600">
                    <tr>
                      <th className="px-3 py-2">SRF</th>
                      <th className="px-3 py-2">Customer</th>
                      <th className="px-3 py-2">Watch</th>
                      <th className="px-3 py-2">Closed</th>
                      {edocEnabled ? <th className="px-3 py-2">E-invoice</th> : null}
                      <th className="px-3 py-2 text-right">{ESTIMATE_LABEL_APPROX}</th>
                      <th className="min-w-[220px] px-3 py-2 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.map((j) => (
                      <tr key={j.id} className="border-b border-zimson-100 last:border-0">
                        <td className="px-3 py-2 font-mono text-xs font-semibold text-zimson-900">
                          <button
                            type="button"
                            onClick={() => setTraceId(j.id)}
                            className="hover:text-indigo-600 hover:underline"
                          >
                            {j.reference}
                          </button>
                          {j.invoiceNumber ? (
                            <p className="mt-0.5 font-sans text-[10px] font-normal text-stone-500">
                              Inv. {j.invoiceNumber}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-stone-800">{j.customerName}</td>
                        <td className="px-3 py-2 text-stone-700">
                          {j.watchBrand} {j.watchModel}
                        </td>
                        <td className="px-3 py-2 text-xs text-stone-600">
                          {j.closedAt ? new Date(j.closedAt).toLocaleString() : "-"}
                        </td>
                        {edocEnabled ? (
                          <td className="px-3 py-2 text-[10px] font-semibold uppercase">
                            {j.edocIrn?.trim() ? (
                              <span className="text-emerald-700">IRN issued</span>
                            ) : j.edocStatus === "SKIPPED" || j.customerKind === "B2C" ? (
                              <span className="text-stone-500">{j.customerKind === "B2C" ? "B2C" : "Skipped"}</span>
                            ) : j.edocStatus === "FAILED" ? (
                              <span className="text-rose-700">Failed</span>
                            ) : (
                              <span className="text-amber-700">Pending</span>
                            )}
                          </td>
                        ) : null}
                        <td className="px-3 py-2 text-right tabular-nums text-stone-900">
                          {formatApproxEstimateCurrency(Number(j.estimateTotalInr ?? 0))}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setTraceId(j.id)}
                              aria-label="View details"
                              title="View details"
                              className={`${iconBtn} border-indigo-200 bg-indigo-50 text-indigo-700 hover:border-indigo-300 hover:bg-indigo-100`}
                            >
                              <DetailsIcon />
                              <ActionTooltip label="View details" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setPreviewJob(j)}
                              aria-label="Preview invoice"
                              title="Preview invoice"
                              className={`${iconBtn} border-sky-200 bg-sky-50 text-sky-700 hover:border-sky-300 hover:bg-sky-100`}
                            >
                              <PreviewIcon />
                              <ActionTooltip label="Preview invoice" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePrintInvoice(j)}
                              disabled={!!printInvoiceVm}
                              aria-label="Print invoice"
                              title="Print invoice"
                              className={`${iconBtn} border-zimson-500 bg-gradient-to-b from-zimson-500 to-zimson-600 text-white hover:from-zimson-600 hover:to-zimson-700`}
                            >
                              <PrinterIcon />
                              <ActionTooltip label="Print invoice" />
                            </button>
                            {srfNeedsEinvoiceRetry(j, edocEnabled) || srfCanGenerateEinvoice(j, edocEnabled) ? (
                              <button
                                type="button"
                                disabled={edocBusyId === j.id}
                                onClick={() => void retryEinvoice(j)}
                                aria-label={srfNeedsEinvoiceRetry(j, edocEnabled) ? "Retry e-invoice" : "Generate e-invoice"}
                                title={srfNeedsEinvoiceRetry(j, edocEnabled) ? "Retry e-invoice" : "Generate e-invoice"}
                                className={`${iconBtn} border-amber-300 bg-amber-50 text-amber-700 hover:border-amber-400 hover:bg-amber-100`}
                              >
                                {edocBusyId === j.id ? <SpinnerIcon /> : <RetryIcon />}
                                <ActionTooltip label={srfNeedsEinvoiceRetry(j, edocEnabled) ? "Retry e-invoice" : "Generate e-invoice"} />
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => handleResendInvoice(j)}
                              aria-label="Resend invoice"
                              title="Resend invoice"
                              className={`${iconBtn} border-zimson-300 bg-white text-zimson-700 hover:border-zimson-400 hover:bg-zimson-50`}
                            >
                              <ResendIcon />
                              <ActionTooltip label="Resend invoice" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-xs text-stone-600">
                  Showing page {currentPage} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded-lg border border-zimson-300 px-3 py-1.5 text-xs font-semibold text-zimson-900 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="rounded-lg border border-zimson-300 px-3 py-1.5 text-xs font-semibold text-zimson-900 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>

      {printInvoiceVm ? (
        <div className="hidden print:block" aria-hidden>
          <ServiceInvoiceTemplate data={printInvoiceVm} idPrefix="srf-billing-history-print" />
        </div>
      ) : null}

      {previewJob ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#0c1c56]/70 p-4 backdrop-blur-sm print:hidden"
          onClick={() => setPreviewJob(null)}
        >
          <div
            className="my-6 w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-[#C9A227]/40 bg-gradient-to-r from-[#0c1c56] via-[#152a72] to-[#1b3a8f] px-4 py-3">
              <div className="flex items-center gap-2 text-white">
                <PreviewIcon className="h-4 w-4 text-[#e7c968]" />
                <span className="text-sm font-bold uppercase tracking-wide">Invoice preview</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrintFromPreview}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-inset ring-white/25 transition hover:bg-white/25"
                >
                  <PrinterIcon className="h-3.5 w-3.5" />
                  Printout
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewJob(null)}
                  aria-label="Close preview"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 text-white ring-1 ring-inset ring-white/25 transition hover:bg-white/25"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="max-h-[80vh] overflow-y-auto bg-stone-100 p-4">
              <ServiceInvoiceTemplate data={invoiceVmForJob(previewJob)} idPrefix="srf-billing-history-preview" />
            </div>
          </div>
        </div>
      ) : null}

      {resendJob ? (
        <ProcessSuccessModal
          open
          tone="premium"
          title="Resend invoice"
          description={`Invoice ${resendJob.invoiceNumber ?? ""} · SRF ${resendJob.reference}`}
          onBackdropClick={() => {
            setResendJob(null);
            setResendNote(null);
          }}
          actions={
            <ResendClosedSrfInvoiceActions
              layout="icons"
              job={resendJob}
              customer={resendCustomer}
              customerEmail={resendCustomer?.email?.trim() ?? ""}
              taxSettings={serviceTaxSettings}
              storeInvoice={storeInvoiceForPrint}
              generatedBy={user?.displayName?.trim() || user?.email?.trim() || user?.id || null}
              spareHsnLookup={spareHsnLookup}
              spareGstLookup={spareGstLookup}
              onResult={setResendNote}
              leadingActions={
                <>
                  <button
                    type="button"
                    className={resendIconPreview}
                    aria-label="Preview invoice"
                    title="Preview invoice"
                    onClick={() => {
                      const job = resendJob;
                      setResendJob(null);
                      setResendNote(null);
                      setPreviewJob(job);
                    }}
                  >
                    <IconPreview />
                  </button>
                  <button
                    type="button"
                    className={resendIconPrint}
                    aria-label="Print invoice"
                    title="Print invoice"
                    disabled={!!printInvoiceVm}
                    onClick={() => handlePrintInvoice(resendJob)}
                  >
                    <IconPrint />
                  </button>
                </>
              }
              trailingActions={
                <>
                  {srfNeedsEinvoiceRetry(resendJob, edocEnabled) || srfCanGenerateEinvoice(resendJob, edocEnabled) ? (
                    <button
                      type="button"
                      className={resendIconEinvoice}
                      aria-label={
                        srfNeedsEinvoiceRetry(resendJob, edocEnabled) ? "Retry e-invoice" : "Generate e-invoice"
                      }
                      title={
                        srfNeedsEinvoiceRetry(resendJob, edocEnabled) ? "Retry e-invoice" : "Generate e-invoice"
                      }
                      disabled={edocBusyId === resendJob.id}
                      onClick={() => void retryEinvoice(resendJob)}
                    >
                      {edocBusyId === resendJob.id ? <IconSpinner /> : <IconGstEinvoice />}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={resendIconClose}
                    aria-label="Close"
                    title="Close"
                    onClick={() => {
                      setResendJob(null);
                      setResendNote(null);
                    }}
                  >
                    <IconClose />
                  </button>
                </>
              }
            />
          }
        >
          {resendJob.customerKind === "B2B" && edocEnabled && !resendJob.edocIrn?.trim() ? (
            <div
              className={`mb-3 rounded-xl px-3 py-2.5 text-xs leading-relaxed ${
                resendJob.edocStatus === "FAILED"
                  ? "bg-amber-50 text-amber-950 ring-1 ring-amber-200"
                  : "bg-[#f8faff] text-[#1b3a8f] ring-1 ring-[#e2e8f5]"
              }`}
            >
              {resendJob.edocStatus === "FAILED" ? (
                <>
                  <strong>E-invoice not generated:</strong>{" "}
                  {humanizeEinvoiceError(resendJob.edocError)}
                </>
              ) : (
                <span>E-invoice not registered yet for this B2B invoice.</span>
              )}
            </div>
          ) : null}
          {resendNote ? (
            <p className="rounded-xl bg-emerald-50 px-3 py-2.5 text-xs leading-relaxed text-emerald-950 ring-1 ring-emerald-200/80">
              {resendNote}
            </p>
          ) : (
            <p className="text-sm leading-relaxed text-stone-700">
              Send the tax invoice as a PDF on WhatsApp and email, or download a copy for the customer.
            </p>
          )}
        </ProcessSuccessModal>
      ) : null}

      {traceId ? <SrfTraceModal srfId={traceId} onClose={() => setTraceId(null)} /> : null}
    </div>
  );
}
