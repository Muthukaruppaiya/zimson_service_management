import { apiJson } from "./api";
import { captureInvoicePdfFromPage, ensureApplicationPdfBlob } from "./captureInvoicePdf";

export type SendInvoiceWhatsAppParams = {
  phone: string;
  customerName: string;
  invoiceNumber: string;
  pdfFilename?: string;
  /** When omitted, captures `.service-invoice-print-root` from the current page. */
  pdfBlob?: Blob;
};

export type SendInvoiceWhatsAppResult = {
  messageId: string | null;
  dryRun?: boolean;
  detail?: string;
  savedPdfPath?: string | null;
  localViewUrl?: string | null;
};

export async function sendInvoiceWhatsApp(
  params: SendInvoiceWhatsAppParams,
): Promise<SendInvoiceWhatsAppResult> {
  const rawBlob = params.pdfBlob ?? (await captureInvoicePdfFromPage());
  const blob = ensureApplicationPdfBlob(rawBlob);

  const filename =
    params.pdfFilename?.trim() ||
    `Zimson-Invoice-${params.invoiceNumber.replace(/[^\w.-]+/g, "_")}.pdf`;

  const form = new FormData();
  form.append("phone", params.phone.replace(/\D/g, "").slice(-10));
  form.append("customerName", params.customerName.trim() || "Customer");
  form.append("invoiceNumber", params.invoiceNumber.trim());
  form.append("documentFilename", filename);
  form.append("document", blob, filename);

  const out = await apiJson<{
    ok: boolean;
    messageId: string | null;
    dryRun?: boolean;
    message?: string;
    savedPdfPath?: string | null;
    localViewUrl?: string | null;
  }>("/api/messaging/whatsapp/invoice", {
    method: "POST",
    body: form,
  });

  if (out.dryRun) {
    return {
      messageId: null,
      dryRun: true,
      detail: out.message ?? "Dry run — PDF saved; WhatsApp not sent.",
      savedPdfPath: out.savedPdfPath ?? null,
      localViewUrl: out.localViewUrl ?? null,
    };
  }

  return { messageId: out.messageId ?? null, dryRun: false };
}

export async function fetchWhatsAppMessagingStatus(): Promise<{
  configured: boolean;
  publicBaseUrl: string | null;
}> {
  return apiJson("/api/messaging/whatsapp/status");
}
