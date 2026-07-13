import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { ServiceInvoiceTemplate } from "./ServiceInvoiceTemplate";
import { SendInvoiceEmailButton } from "./SendInvoiceEmailButton";
import { SendInvoiceWhatsAppButton } from "./SendInvoiceWhatsAppButton";
import {
  IconDownload,
  IconEmail,
  IconGstEinvoice,
  IconSpinner,
  IconWhatsApp,
  invoicePreviewIconBtn,
} from "./invoicePreviewIcons";
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
  layout?: "modal" | "inline" | "icons";
  /** Extra icon buttons shown before download/email/WhatsApp (preview, print, etc.) */
  leadingActions?: ReactNode;
  /** Extra icon buttons shown after download/email/WhatsApp (e-invoice, close, etc.) */
  trailingActions?: ReactNode;
};

const iconDownload = `${invoicePreviewIconBtn} rounded-xl border border-[#c9a227]/45 bg-white text-[#1b3a8f] shadow-sm transition hover:-translate-y-0.5 hover:bg-[#f8faff] hover:shadow-md`;
const iconEmail = `${invoicePreviewIconBtn} rounded-xl border border-sky-300/80 bg-sky-700 text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-sky-800 hover:shadow-md`;
const iconWhatsApp = `${invoicePreviewIconBtn} rounded-xl border border-emerald-300/80 bg-emerald-600 text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-md`;

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
  leadingActions,
  trailingActions,
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

  const downloadButton =
    layout === "icons" ? (
      <button
        type="button"
        disabled={downloadBusy || !invoiceNumber}
        onClick={() => void handleDownloadPdf()}
        className={iconDownload}
        aria-label="Download PDF"
        title="Download PDF"
      >
        {downloadBusy ? <IconSpinner /> : <IconDownload />}
      </button>
    ) : (
      <button
        type="button"
        disabled={downloadBusy || !invoiceNumber}
        onClick={() => void handleDownloadPdf()}
        className={
          layout === "inline"
            ? `${btnInline} border-[#1b3a8f]/30 bg-white text-[#1b3a8f] hover:bg-[#f8faff]`
            : `${btnModal} border border-[#1b3a8f]/30 bg-white text-[#1b3a8f] hover:bg-[#f8faff]`
        }
      >
        {downloadBusy ? "Preparing PDF…" : "Download PDF"}
      </button>
    );

  const emailButton = (
    <SendInvoiceEmailButton
      email={email}
      customerName={customerName}
      invoiceNumber={invoiceNumber}
      totalInr={invoiceVm.netPayable ?? invoiceVm.totalAmount}
      resolvePdfBlob={resolvePdfBlob}
      label="Resend email (PDF)"
      busyLabel="Sending…"
      iconOnly={layout === "icons"}
      className={
        layout === "icons"
          ? iconEmail
          : layout === "inline"
            ? `${btnInline} border-sky-400 bg-sky-600 text-white hover:bg-sky-700`
            : `${btnModal} border border-sky-500 bg-sky-600 text-white hover:bg-sky-700`
      }
      onResult={(msg) => onResult?.(msg)}
    />
  );

  const whatsAppButton = (
    <SendInvoiceWhatsAppButton
      phone={phone}
      customerName={customerName}
      invoiceNumber={invoiceNumber}
      resolvePdfBlob={resolvePdfBlob}
      label="Resend WhatsApp (PDF)"
      busyLabel="Sending…"
      iconOnly={layout === "icons"}
      className={
        layout === "icons"
          ? iconWhatsApp
          : layout === "inline"
            ? `${btnInline} border-emerald-400 bg-emerald-600 text-white hover:bg-emerald-700`
            : `${btnModal} border border-emerald-500 bg-emerald-600 text-white hover:bg-emerald-700`
      }
      onResult={(msg) => onResult?.(msg)}
    />
  );

  return (
    <>
      <div className="pointer-events-none fixed -left-[12000px] top-0 opacity-0" aria-hidden>
        <ServiceInvoiceTemplate data={invoiceVm} idPrefix={idPrefix} />
      </div>
      <div
        className={
          layout === "icons"
            ? "flex flex-wrap items-center justify-center gap-2"
            : layout === "inline"
              ? "flex flex-wrap items-center gap-2"
              : "flex flex-col gap-2 sm:flex-row sm:flex-wrap"
        }
      >
        {leadingActions}
        {downloadButton}
        {emailButton}
        {whatsAppButton}
        {trailingActions}
      </div>
    </>
  );
}

export function canResendClosedSrfInvoice(job: { status: string; invoiceNumber?: string | null }): boolean {
  return job.status === "closed" && Boolean(String(job.invoiceNumber ?? "").trim());
}

export { IconGstEinvoice, IconSpinner, invoicePreviewIconBtn };
