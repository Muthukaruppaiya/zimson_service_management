import type { Request } from "express";
import type { Pool } from "pg";
import { buildSrfPdfBuffer } from "./srfDocumentPdf";
import { loadSrfCustomerDocumentPdf } from "./loadSrfCustomerDocument";
import { loadSrfPrintData, srfDocumentDisplayFilename } from "./loadSrfPrintData";
import { makeSrfPdfStorageFilename } from "./srfPdfPublicUrl";
import { resolveWhatsAppSrfDocumentUrl, saveSrfPdfToDisk } from "./srfPdfDelivery";

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
  const filePath = saveSrfPdfToDisk(pdfBuffer, storageFilename);
  const documentUrl = await resolveWhatsAppSrfDocumentUrl(req, filePath, storageFilename, documentFilename);
  return { documentUrl, documentFilename, storageFilename, source };
}

/**
 * Publishes a public HTTPS PDF for the customer_link WhatsApp template.
 * Prefers customer-uploaded PDF (document slot); otherwise generates acknowledgment PDF.
 */
export async function publishSrfDocumentForWhatsApp(
  req: Request,
  pool: Pool,
  srfId: string,
): Promise<PublishedSrfDocument> {
  const printData = await loadSrfPrintData(pool, srfId);
  if (!printData) {
    throw new Error("SRF not found for document generation.");
  }
  const documentFilename = srfDocumentDisplayFilename(printData.reference);

  const customerDoc = await loadSrfCustomerDocumentPdf(pool, srfId);
  if (customerDoc) {
    console.log("[messaging/whatsapp/srf] using customer-uploaded PDF for WhatsApp document header");
    return publishPdfBufferForWhatsApp(req, customerDoc.buffer, documentFilename, "customer_upload");
  }

  const pdfBuffer = await buildSrfPdfBuffer(printData);
  if (pdfBuffer.length < 100) {
    throw new Error("Generated SRF PDF was empty.");
  }
  console.log("[messaging/whatsapp/srf] using generated SRF acknowledgment PDF");
  const out = await publishPdfBufferForWhatsApp(req, pdfBuffer, documentFilename, "generated");
  return out;
}
