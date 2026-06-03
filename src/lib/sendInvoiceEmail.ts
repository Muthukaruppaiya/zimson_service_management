import { apiJson } from "./api";
import { captureInvoicePdfFromPage, ensureApplicationPdfBlob } from "./captureInvoicePdf";

export type SendInvoiceEmailParams = {
  email: string;
  customerName: string;
  invoiceNumber: string;
  totalInr?: number | null;
  pdfFilename?: string;
  pdfBlob?: Blob;
};

export type SendInvoiceEmailResult = {
  emailSent: boolean;
};

export async function sendInvoiceEmail(params: SendInvoiceEmailParams): Promise<SendInvoiceEmailResult> {
  const rawBlob = params.pdfBlob ?? (await captureInvoicePdfFromPage());
  const blob = ensureApplicationPdfBlob(rawBlob);
  const filename =
    params.pdfFilename?.trim() ||
    `Zimson-Invoice-${params.invoiceNumber.replace(/[^\w.-]+/g, "_")}.pdf`;

  const form = new FormData();
  form.append("email", params.email.trim().toLowerCase());
  form.append("customerName", params.customerName.trim() || "Customer");
  form.append("invoiceNumber", params.invoiceNumber.trim());
  if (params.totalInr != null && Number.isFinite(params.totalInr)) {
    form.append("totalInr", String(params.totalInr));
  }
  form.append("documentFilename", filename);
  form.append("document", blob, filename);

  await apiJson<{ ok: boolean; emailSent?: boolean }>("/api/messaging/email/invoice", {
    method: "POST",
    body: form,
  });

  return { emailSent: true };
}
