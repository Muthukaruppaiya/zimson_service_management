import type { Express, NextFunction, Request, Response } from "express";
import path from "node:path";
import crypto from "node:crypto";
import {
  getMessagingPublicBaseUrl,
  isEmailConfigured,
  isWhatsAppConfigured,
  isWhatsAppInvoiceDryRun,
} from "./messaging/config";
import { isValidCustomerEmail } from "./messaging/customerContact";
import { sendCustomerInvoiceEmail } from "./messaging/invoiceEmail";
import {
  getWhatsAppInvoiceSendMode,
  sendInvoiceWhatsApp,
} from "./messaging/qikchatWhatsApp";
import {
  publicInvoicePdfApiPath,
  resolveInvoicePdfFilePath,
} from "./messaging/invoicePdfPublicUrl";
import { resolveSrfPdfFilePath } from "./messaging/srfPdfPublicUrl";
import { resolveWhatsAppInvoiceDocumentUrl } from "./messaging/invoicePdfDelivery";
import { createMemoryUpload } from "./storage/multerMemory";
import { categoryForInvoicePdf } from "./storage/config";
import { persistUploadedFile, readStoredFileBuffer } from "./storage/fileStorage";

const INVOICE_PDF_DIR = path.join(process.cwd(), "uploads", "Invoices");
const SRF_PDF_DIR = path.join(process.cwd(), "uploads", "srf");

function makeInvoicePdfFilename(): string {
  return `inv-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.pdf`;
}

const invoicePdfUpload = createMemoryUpload(12 * 1024 * 1024);

function phoneLast10(v: string): string {
  const digits = v.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function assertPdfFileBuffer(buf: Buffer): void {
  if (buf.length < 5 || buf.subarray(0, 4).toString("ascii") !== "%PDF") {
    throw new Error(
      "Uploaded file is not a valid PDF. Regenerate the invoice and send again (do not use an HTML page URL for WhatsApp).",
    );
  }
}

export function registerMessagingRoutes(
  app: Express,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
): void {
  /** No auth — used by cloudflared/WhatsApp to verify the tunnel reaches this API. */
  app.get("/api/messaging/public-ping", (_req, res) => {
    res.json({ ok: true, service: "zimson-api" });
  });

  /**
   * Public tax-invoice PDF for Qikchat/WhatsApp (must return application/pdf, not SPA HTML).
   * URL shape: {MESSAGING_PUBLIC_BASE_URL}/api/messaging/public-invoice-pdf/inv-….pdf
   */
  app.get("/api/messaging/public-invoice-pdf/:filename", async (req, res) => {
    const filenameParam = String(req.params.filename ?? "");
    const filePath = resolveInvoicePdfFilePath(INVOICE_PDF_DIR, filenameParam);
    if (filePath) {
      const name = path.basename(filePath);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${name}"`);
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.sendFile(filePath);
      return;
    }
    const base = path.basename(filenameParam);
    const buf = await readStoredFileBuffer(`api/media/Invoices/${base}`);
    if (buf?.length) {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${base}"`);
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.send(buf);
      return;
    }
    res.status(404).type("text/plain").send("Invoice PDF not found.");
  });

  /**
   * Public SRF acknowledgment PDF for Qikchat/WhatsApp (customer_link template document header).
   * URL shape: {MESSAGING_PUBLIC_BASE_URL}/api/messaging/public-srf-pdf/srf-….pdf
   */
  app.get("/api/messaging/public-srf-pdf/:filename", async (req, res) => {
    const filenameParam = String(req.params.filename ?? "");
    const filePath = resolveSrfPdfFilePath(SRF_PDF_DIR, filenameParam);
    if (filePath) {
      const name = path.basename(filePath);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${name}"`);
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.sendFile(filePath);
      return;
    }
    const base = path.basename(filenameParam);
    const buf = await readStoredFileBuffer(`api/media/srf/${base}`);
    if (buf?.length) {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${base}"`);
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.send(buf);
      return;
    }
    res.status(404).type("text/plain").send("SRF PDF not found.");
  });

  app.get("/api/messaging/email/status", requireAuth, (_req, res) => {
    res.json({ configured: isEmailConfigured() });
  });

  app.get("/api/messaging/whatsapp/status", requireAuth, (_req, res) => {
    res.json({
      configured: isWhatsAppConfigured(),
      publicBaseUrl: getMessagingPublicBaseUrl() || null,
      dryRun: isWhatsAppInvoiceDryRun(),
      invoiceMode: getWhatsAppInvoiceSendMode(),
      docs: "https://qikchat.gitbook.io/apidocs/reference/api-reference/media-messages",
      note:
        "QIKCHAT_API_KEY + public HTTPS PDF link. Template mode (default) for new customers; media mode only within 24h after customer reply.",
    });
  });

  app.post(
    "/api/messaging/whatsapp/invoice",
    requireAuth,
    (req, res, next) => {
      invoicePdfUpload.single("document")(req, res, (err: unknown) => {
        if (err) {
          const msg = err instanceof Error ? err.message : "Invalid upload.";
          res.status(400).json({ error: msg });
          return;
        }
        next();
      });
    },
    async (req, res) => {
      try {
        const body = req.body as Record<string, string | undefined>;
        const phone = phoneLast10(String(body.phone ?? ""));
        const customerName = String(body.customerName ?? "").trim();
        const invoiceNumber = String(body.invoiceNumber ?? "").trim();
        const documentUrlBody = String(body.documentUrl ?? "").trim();

        if (phone.length !== 10) {
          res.status(400).json({ error: "Valid 10-digit customer mobile is required." });
          return;
        }
        if (!invoiceNumber) {
          res.status(400).json({ error: "Invoice number is required." });
          return;
        }

        let documentUrl = documentUrlBody;
        let documentFilename = String(body.documentFilename ?? "").trim();

        const file = req.file;
        let savedApiPdfPath: string | null = null;
        let pdfFilename: string | null = null;
        let storagePath: string | null = null;
        if (file?.buffer?.length) {
          pdfFilename = makeInvoicePdfFilename();
          assertPdfFileBuffer(file.buffer);
          storagePath = await persistUploadedFile({
            category: categoryForInvoicePdf(),
            buffer: file.buffer,
            originalName: file.originalname || pdfFilename,
            mime: file.mimetype || "application/pdf",
            fallbackExt: ".pdf",
            fixedFilename: pdfFilename,
          });
          savedApiPdfPath = publicInvoicePdfApiPath(pdfFilename);
          if (!documentFilename) {
            documentFilename = file.originalname || `Zimson-Invoice-${invoiceNumber}.pdf`;
          }
        }

        if (!documentUrl && !savedApiPdfPath) {
          res.status(400).json({
            error: "Upload the invoice PDF (document field) or provide documentUrl.",
          });
          return;
        }

        const port = Number(process.env.PORT) || 4000;

        if (isWhatsAppInvoiceDryRun()) {
          const localViewUrl = pdfFilename
            ? `http://127.0.0.1:${port}${publicInvoicePdfApiPath(pdfFilename)}`
            : null;
          res.json({
            ok: true,
            dryRun: true,
            messageId: null,
            savedPdfPath: storagePath,
            localViewUrl,
            message:
              "Dry run: PDF saved (uploads/Invoices or S3 Invoices/). WhatsApp was not called. Set WHATSAPP_INVOICE_DRY_RUN=false to send for real.",
          });
          return;
        }

        if (!documentUrl && storagePath && pdfFilename) {
          documentUrl = await resolveWhatsAppInvoiceDocumentUrl(
            req,
            storagePath,
            pdfFilename,
            documentFilename || `Zimson-Invoice-${invoiceNumber}.pdf`,
          );
        }

        const messageId = await sendInvoiceWhatsApp({
          phone10: phone,
          customerName: customerName || "Customer",
          invoiceNumber,
          documentUrl,
          documentFilename: documentFilename || undefined,
        });

        res.json({ ok: true, messageId: messageId ?? null, dryRun: false });
      } catch (e) {
        console.error("[messaging/whatsapp/invoice]", e);
        res.status(502).json({
          error: e instanceof Error ? e.message : "Could not send invoice on WhatsApp.",
        });
      }
    },
  );

  app.post(
    "/api/messaging/email/invoice",
    requireAuth,
    (req, res, next) => {
      invoicePdfUpload.single("document")(req, res, (err: unknown) => {
        if (err) {
          const msg = err instanceof Error ? err.message : "Invalid upload.";
          res.status(400).json({ error: msg });
          return;
        }
        next();
      });
    },
    async (req, res) => {
      try {
        if (!isEmailConfigured()) {
          res.status(503).json({ error: "Email (SMTP) is not configured." });
          return;
        }

        const body = req.body as Record<string, string | undefined>;
        const toEmail = String(body.email ?? body.toEmail ?? "").trim().toLowerCase();
        const customerName = String(body.customerName ?? "").trim();
        const invoiceNumber = String(body.invoiceNumber ?? "").trim();
        const totalRaw = String(body.totalInr ?? "").trim();
        const totalInr = totalRaw ? Number.parseFloat(totalRaw) : null;

        if (!isValidCustomerEmail(toEmail)) {
          res.status(400).json({ error: "Valid customer email is required." });
          return;
        }
        if (!invoiceNumber) {
          res.status(400).json({ error: "Invoice number is required." });
          return;
        }

        const file = req.file;
        if (!file?.buffer?.length) {
          res.status(400).json({ error: "Upload the invoice PDF (document field)." });
          return;
        }

        const pdfBuffer = file.buffer;
        assertPdfFileBuffer(pdfBuffer);
        const documentFilename =
          String(body.documentFilename ?? "").trim() ||
          file.originalname ||
          `Zimson-Invoice-${invoiceNumber}.pdf`;

        await sendCustomerInvoiceEmail({
          toEmail,
          customerName: customerName || "Customer",
          invoiceNumber,
          totalInr: totalInr != null && Number.isFinite(totalInr) ? totalInr : null,
          pdfBuffer,
          pdfFilename: documentFilename,
        });

        res.json({ ok: true, emailSent: true });
      } catch (e) {
        console.error("[messaging/email/invoice]", e);
        res.status(502).json({
          error: e instanceof Error ? e.message : "Could not send invoice by email.",
        });
      }
    },
  );
}
