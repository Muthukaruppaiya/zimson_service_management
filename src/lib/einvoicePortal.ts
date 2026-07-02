/** Official NIC GST e-invoice portal (verify / search IRN). */
export const GST_EINVOICE_PORTAL_URL = "https://einvoice1.gst.gov.in/";
export const GST_EINVOICE_SEARCH_IRN_URL = "https://einvoice1.gst.gov.in/Others/SearchIRN";

/** IRP / Masters India e-invoice PDF when returned on generate. */
export function resolveEinvoiceDocumentUrl(args: {
  pdfUrl?: string | null;
}): string | null {
  const pdf = String(args.pdfUrl ?? "").trim();
  return /^https?:\/\//i.test(pdf) ? pdf : null;
}
