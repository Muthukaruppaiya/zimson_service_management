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
import { ResendClosedSrfInvoiceActions } from "../../components/service/ResendClosedSrfInvoiceActions";
import { useCustomers } from "../../context/CustomersContext";
import { useSpares } from "../../context/SparesContext";
import { phoneLast10 } from "../../lib/customerLookup";
import { printServiceInvoice } from "../../lib/printServiceInvoice";
import { isArchivedSrfJob, jobVisibleToStoreUser } from "../../lib/srfAccess";
import { buildStoreBillingInvoiceFromClosedJob } from "../../lib/storeBillingAmounts";
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

const actionBtn =
  "rounded-lg border px-2 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

export function StoreBillingMasterPage() {
  const { user } = useAuth();
  const { regions } = useRegions();
  const { jobs, refreshJobs } = useSrfJobs();
  const [page, setPage] = useState(1);
  const [traceId, setTraceId] = useState<string | null>(null);
  const [serviceTaxSettings, setServiceTaxSettings] = useState<ServiceTaxSettings | null>(null);
  const [printInvoiceVm, setPrintInvoiceVm] = useState<ServiceInvoiceViewModel | null>(null);
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
      defaultHsnSac: serviceTaxSettings?.defaultSacHsn?.trim() || "9987",
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
                      <th className="px-3 py-2 text-right">Estimate</th>
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
                          {Number(j.estimateTotalInr ?? 0).toLocaleString(undefined, {
                            style: "currency",
                            currency: "INR",
                          })}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setTraceId(j.id)}
                              className={`${actionBtn} border-indigo-300 bg-indigo-50 text-indigo-900 hover:bg-indigo-100`}
                            >
                              View details
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePrintInvoice(j)}
                              disabled={!!printInvoiceVm}
                              className={`${actionBtn} border-zimson-400 bg-zimson-600 text-white hover:bg-zimson-700`}
                            >
                              Print invoice
                            </button>
                            {srfNeedsEinvoiceRetry(j, edocEnabled) ? (
                              <button
                                type="button"
                                disabled={edocBusyId === j.id}
                                onClick={() => void retryEinvoice(j)}
                                className={`${actionBtn} border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100`}
                              >
                                {edocBusyId === j.id ? "…" : "Retry e-invoice"}
                              </button>
                            ) : srfCanGenerateEinvoice(j, edocEnabled) ? (
                              <button
                                type="button"
                                disabled={edocBusyId === j.id}
                                onClick={() => void retryEinvoice(j)}
                                className={`${actionBtn} border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100`}
                              >
                                {edocBusyId === j.id ? "…" : "Generate e-invoice"}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => handleResendInvoice(j)}
                              className={`${actionBtn} border-zimson-300 bg-white text-zimson-900 hover:bg-zimson-50`}
                            >
                              Resend invoice
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

      {resendJob ? (
        <ProcessSuccessModal
          open
          title="Resend invoice"
          description={`Invoice ${resendJob.invoiceNumber ?? ""} · SRF ${resendJob.reference}`}
          onBackdropClick={() => {
            setResendJob(null);
            setResendNote(null);
          }}
          actions={
            <>
              <button
                type="button"
                className="inline-flex w-full min-w-0 items-center justify-center rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700 sm:w-auto"
                onClick={() => {
                  const vm = invoiceVmForJob(resendJob);
                  setPrintInvoiceVm(vm);
                  window.setTimeout(() => {
                    printServiceInvoice();
                    window.setTimeout(() => setPrintInvoiceVm(null), 500);
                  }, 80);
                }}
              >
                Print invoice
              </button>
              <ResendClosedSrfInvoiceActions
                job={resendJob}
                customer={resendCustomer}
                customerEmail={resendCustomer?.email?.trim() ?? ""}
                taxSettings={serviceTaxSettings}
                storeInvoice={storeInvoiceForPrint}
                generatedBy={user?.displayName?.trim() || user?.email?.trim() || user?.id || null}
                spareHsnLookup={spareHsnLookup}
                spareGstLookup={spareGstLookup}
                onResult={setResendNote}
              />
              {srfNeedsEinvoiceRetry(resendJob, edocEnabled) || srfCanGenerateEinvoice(resendJob, edocEnabled) ? (
                <button
                  type="button"
                  className="inline-flex w-full min-w-0 items-center justify-center rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-950 shadow-sm transition hover:bg-amber-100 disabled:opacity-50 sm:w-auto"
                  disabled={edocBusyId === resendJob.id}
                  onClick={() => void retryEinvoice(resendJob)}
                >
                  {edocBusyId === resendJob.id
                    ? "Generating…"
                    : srfNeedsEinvoiceRetry(resendJob, edocEnabled)
                      ? "Retry e-invoice"
                      : "Generate e-invoice"}
                </button>
              ) : null}
              <button
                type="button"
                className="inline-flex w-full min-w-0 items-center justify-center rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 shadow-sm transition hover:bg-stone-50 sm:w-auto"
                onClick={() => {
                  setResendJob(null);
                  setResendNote(null);
                }}
              >
                Close
              </button>
            </>
          }
        >
          {resendJob.customerKind === "B2B" && edocEnabled && !resendJob.edocIrn?.trim() ? (
            <div
              className={`mb-3 rounded-lg px-3 py-2 text-xs ${
                resendJob.edocStatus === "FAILED"
                  ? "bg-amber-50 text-amber-950 ring-1 ring-amber-200"
                  : "bg-stone-50 text-stone-700 ring-1 ring-stone-200"
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
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-950 ring-1 ring-emerald-200/80">
              {resendNote}
            </p>
          ) : (
            <p className="text-sm text-stone-700">
              Send the tax invoice as a PDF on WhatsApp and email, or download a copy for the customer.
            </p>
          )}
        </ProcessSuccessModal>
      ) : null}

      {traceId ? <SrfTraceModal srfId={traceId} onClose={() => setTraceId(null)} /> : null}
    </div>
  );
}
