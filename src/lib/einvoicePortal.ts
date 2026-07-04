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

/**
 * Masters India often returns e-way PDF as a host path without scheme, e.g.
 * `sandb-api.mastersindia.co/api/v1/detailPrintPdf/...` — not a GST portal link.
 */
export function resolveEwayDocumentUrl(args: {
  pdfUrl?: string | null;
}): string | null {
  const pdf = String(args.pdfUrl ?? "").trim();
  if (!pdf) return null;
  if (/^https?:\/\//i.test(pdf)) return pdf;
  if (pdf.startsWith("//")) return `https:${pdf}`;
  if (/^[a-z0-9.-]+\.[a-z]{2,}\//i.test(pdf) || /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(pdf)) {
    return `https://${pdf}`;
  }
  return null;
}
