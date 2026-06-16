import { useMemo, useState } from "react";
import { ServiceInvoiceTemplate } from "./ServiceInvoiceTemplate";
import { SendInvoiceEmailButton } from "./SendInvoiceEmailButton";
import { SendInvoiceWhatsAppButton } from "./SendInvoiceWhatsAppButton";
import { buildStoreBillingInvoiceFromClosedJob } from "../../lib/storeBillingAmounts";
import { captureInvoicePdfFromViewModel } from "../../lib/renderInvoiceForPdf";
import { triggerBlobDownload } from "../../lib/captureInvoicePdf";
import type { CustomerRecord } from "../../types/customer";
import type { ServiceTaxSettings } from "../../types/serviceTaxSettings";
import type { StoreInvoicePrintProfile } from "../../types/storeInvoice";
import type { SrfJob } from "../../types/srfJob";

type Props = {
  job: SrfJob;
  customer?: CustomerRecord | null;
  customerEmail?: string;
  taxSettings: ServiceTaxSettings | null;
  storeInvoice: StoreInvoicePrintProfile | null;
  generatedBy?: string | null;
  spareHsnLookup?: (spareId: string) => string | null | undefined;
  spareGstLookup?: (spareId: string) => number | null | undefined;
  onResult?: (message: string) => void;
  /** Compact buttons for trace modal header */
  layout?: "modal" | "inline";
};

export function ResendClosedSrfInvoiceActions({
  job,
  customer,
  customerEmail = "",
  taxSettings,
  storeInvoice,
  generatedBy,
  spareHsnLookup,
  spareGstLookup,
  onResult,
  layout = "modal",
}: Props) {
  const [downloadBusy, setDownloadBusy] = useState(false);
  const invoiceVm = useMemo(
    () =>
      buildStoreBillingInvoiceFromClosedJob(job, {
        taxSettings,
        storeInvoice,
        generatedBy,
        customer: customer ?? null,
        defaultHsnSac: taxSettings?.defaultSacHsn?.trim() || "9987",
        spareHsnLookup,
        spareGstLookup,
      }),
    [job, taxSettings, storeInvoice, generatedBy, customer, spareHsnLookup, spareGstLookup],
  );

  const idPrefix = `resend-inv-${job.id}`;
  const invoiceNumber = invoiceVm.invoiceNumber?.trim() || job.invoiceNumber?.trim() || "";
  const customerName = invoiceVm.billTo.name?.trim() || job.customerName?.trim() || "Customer";
  const phone = job.phone?.trim() || invoiceVm.billTo.phone?.trim() || "";
  const email = customerEmail.trim() || invoiceVm.billTo.email?.trim() || "";

  async function resolvePdfBlob(): Promise<Blob> {
    return captureInvoicePdfFromViewModel(invoiceVm, idPrefix);
  }

  async function handleDownloadPdf() {
    setDownloadBusy(true);
    try {
      const blob = await resolvePdfBlob();
      const filename = `Zimson-Invoice-${invoiceNumber.replace(/[^\w.-]+/g, "_")}.pdf`;
      triggerBlobDownload(blob, filename);
      onResult?.("Invoice PDF downloaded.");
    } catch (e) {
      onResult?.(e instanceof Error ? e.message : "Could not download invoice PDF.");
    } finally {
      setDownloadBusy(false);
    }
  }

  const btnInline =
    "rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50";
  const btnModal =
    "inline-flex w-full min-w-0 items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition disabled:opacity-50 sm:w-auto";

  return (
    <>
      <div className="pointer-events-none fixed -left-[12000px] top-0 opacity-0" aria-hidden>
        <ServiceInvoiceTemplate data={invoiceVm} idPrefix={idPrefix} />
      </div>
      <div className={layout === "inline" ? "flex flex-wrap items-center gap-2" : "flex flex-col gap-2 sm:flex-row sm:flex-wrap"}>
        <button
          type="button"
          disabled={downloadBusy || !invoiceNumber}
          onClick={() => void handleDownloadPdf()}
          className={
            layout === "inline"
              ? `${btnInline} border-zimson-300 bg-white text-zimson-900 hover:bg-zimson-50`
              : `${btnModal} border border-zimson-400 bg-white text-zimson-900 hover:bg-zimson-50`
          }
        >
          {downloadBusy ? "Preparing PDF…" : "Download PDF"}
        </button>
        <SendInvoiceEmailButton
          email={email}
          customerName={customerName}
          invoiceNumber={invoiceNumber}
          totalInr={invoiceVm.netPayable ?? invoiceVm.totalAmount}
          resolvePdfBlob={resolvePdfBlob}
          label="Resend email (PDF)"
          busyLabel="Sending…"
          className={
            layout === "inline"
              ? `${btnInline} border-sky-400 bg-sky-600 text-white hover:bg-sky-700`
              : `${btnModal} border border-sky-500 bg-sky-600 text-white hover:bg-sky-700`
          }
          onResult={(msg) => onResult?.(msg)}
        />
        <SendInvoiceWhatsAppButton
          phone={phone}
          customerName={customerName}
          invoiceNumber={invoiceNumber}
          resolvePdfBlob={resolvePdfBlob}
          label="Resend WhatsApp (PDF)"
          busyLabel="Sending…"
          className={
            layout === "inline"
              ? `${btnInline} border-emerald-400 bg-emerald-600 text-white hover:bg-emerald-700`
              : `${btnModal} border border-emerald-500 bg-emerald-600 text-white hover:bg-emerald-700`
          }
          onResult={(msg) => onResult?.(msg)}
        />
      </div>
    </>
  );
}

export function canResendClosedSrfInvoice(job: { status: string; invoiceNumber?: string | null }): boolean {
  return job.status === "closed" && Boolean(String(job.invoiceNumber ?? "").trim());
}
