import type { Request } from "express";
import type { Pool } from "pg";
import { buildSrfPdfBuffer } from "./srfDocumentPdf";
import { loadSrfCustomerDocumentPdf } from "./loadSrfCustomerDocument";
import { loadSrfPrintData, srfDocumentDisplayFilename } from "./loadSrfPrintData";
import { makeSrfPdfStorageFilename } from "./srfPdfPublicUrl";
import { resolveWhatsAppSrfDocumentUrl, saveSrfPdfToStorage } from "./srfPdfDelivery";

export type PublishedSrfDocument = {
  documentUrl: string;
  documentFilename: string;
  storageFilename: string;
  source: "customer_upload" | "generated";
};

async function publishPdfBufferForWhatsApp(
  req: Request,
  pdfBuffer: Buffer,
  documentFilename: string,
  source: PublishedSrfDocument["source"],
): Promise<PublishedSrfDocument> {
  const storageFilename = makeSrfPdfStorageFilename();
  const filePath = await saveSrfPdfToStorage(pdfBuffer, storageFilename);
  const documentUrl = await resolveWhatsAppSrfDocumentUrl(req, filePath, storageFilename, documentFilename);
  return { documentUrl, documentFilename, storageFilename, source };
}

export type PublishSrfDocumentOptions = {
  /**
   * When true, a customer-uploaded PDF in the document slot is preferred over the
   * generated acknowledgment. Default false: SRF booking / tracking notifications must
   * always send the SRF ACKNOWLEDGMENT document — never the customer's uploaded file
   * (which may be a purchase invoice / warranty card, not the SRF). The tax invoice is
   * only sent from the billing flow.
   */
  preferCustomerUpload?: boolean;
};

/**
 * Publishes a public HTTPS PDF for the customer_link WhatsApp template.
 * By default always generates the SRF acknowledgment PDF (correct document for SRF booking).
 */
export async function publishSrfDocumentForWhatsApp(
  req: Request,
  pool: Pool,
  srfId: string,
  options: PublishSrfDocumentOptions = {},
): Promise<PublishedSrfDocument> {
  const printData = await loadSrfPrintData(pool, srfId);
  if (!printData) {
    throw new Error("SRF not found for document generation.");
  }
  const documentFilename = srfDocumentDisplayFilename(printData.reference);

  if (options.preferCustomerUpload) {
    const customerDoc = await loadSrfCustomerDocumentPdf(pool, srfId);
    if (customerDoc) {
      console.log("[messaging/whatsapp/srf] using customer-uploaded PDF for WhatsApp document header");
      return publishPdfBufferForWhatsApp(req, customerDoc.buffer, documentFilename, "customer_upload");
    }
  }

  const pdfBuffer = await buildSrfPdfBuffer(printData);
  if (pdfBuffer.length < 100) {
    throw new Error("Generated SRF PDF was empty.");
  }
  console.log("[messaging/whatsapp/srf] using generated SRF acknowledgment PDF");
  const out = await publishPdfBufferForWhatsApp(req, pdfBuffer, documentFilename, "generated");
  return out;
}
