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
import { apiJson } from "../../lib/api";
import { printServiceInvoice } from "../../lib/printServiceInvoice";
import { isArchivedSrfJob, jobVisibleToStoreUser } from "../../lib/srfAccess";
import { buildStoreBillingInvoiceFromClosedJob } from "../../lib/storeBillingAmounts";
import type { ServiceInvoiceViewModel } from "../../types/serviceInvoice";
import type { ServiceTaxSettings } from "../../types/serviceTaxSettings";
import type { SrfJob } from "../../types/srfJob";
import { seedStoreToInvoiceProfile } from "../../types/storeInvoice";

const actionBtn =
  "rounded-lg border px-2 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

export function StoreBillingMasterPage() {
  const { user } = useAuth();
  const { regions } = useRegions();
  const { jobs } = useSrfJobs();
  const [page, setPage] = useState(1);
  const [traceId, setTraceId] = useState<string | null>(null);
  const [serviceTaxSettings, setServiceTaxSettings] = useState<ServiceTaxSettings | null>(null);
  const [printInvoiceVm, setPrintInvoiceVm] = useState<ServiceInvoiceViewModel | null>(null);
  const [resendVm, setResendVm] = useState<ServiceInvoiceViewModel | null>(null);
  const [resendNote, setResendNote] = useState<string | null>(null);
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

  function invoiceVmForJob(job: SrfJob): ServiceInvoiceViewModel {
    return buildStoreBillingInvoiceFromClosedJob(job, {
      taxSettings: serviceTaxSettings,
      storeInvoice: storeInvoiceForPrint,
      generatedBy: user?.displayName?.trim() || user?.email?.trim() || user?.id || null,
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
    setResendVm(invoiceVmForJob(job));
  }

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
      <div className={printInvoiceVm || resendVm ? "print:hidden" : undefined}>
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

      {resendVm ? (
        <ProcessSuccessModal
          open
          title="Resend invoice"
          description={`Invoice ${resendVm.invoiceNumber} · SRF ${resendVm.serviceReference ?? ""}`}
          onBackdropClick={() => setResendVm(null)}
          actions={
            <>
              <button
                type="button"
                className="inline-flex w-full min-w-0 items-center justify-center rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700 sm:w-auto"
                onClick={() => {
                  setPrintInvoiceVm(resendVm);
                  window.setTimeout(() => {
                    printServiceInvoice();
                    window.setTimeout(() => setPrintInvoiceVm(null), 500);
                  }, 80);
                }}
              >
                Print invoice
              </button>
              <button
                type="button"
                className="inline-flex w-full min-w-0 items-center justify-center rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50 sm:w-auto"
                onClick={() =>
                  setResendNote(
                    "Sending the invoice to the customer by email, SMS, or WhatsApp is not wired yet — this will be added in a future update.",
                  )
                }
              >
                Send to customer
              </button>
              <button
                type="button"
                className="inline-flex w-full min-w-0 items-center justify-center rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 shadow-sm transition hover:bg-stone-50 sm:w-auto"
                onClick={() => setResendVm(null)}
              >
                Close
              </button>
            </>
          }
        >
          {resendNote ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-950 ring-1 ring-amber-200/80">
              {resendNote}
            </p>
          ) : (
            <p className="text-sm text-stone-700">
              Re-send or print the tax invoice for this closed SRF. Customer delivery channels will be enabled in a
              future update.
            </p>
          )}
        </ProcessSuccessModal>
      ) : null}

      {traceId ? <SrfTraceModal srfId={traceId} onClose={() => setTraceId(null)} /> : null}
    </div>
  );
}
