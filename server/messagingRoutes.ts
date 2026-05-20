import type { Express, NextFunction, Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import {
  getMessagingPublicBaseUrl,
  isWhatsAppConfigured,
  isWhatsAppInvoiceDryRun,
} from "./messaging/config";
import {
  getWhatsAppInvoiceSendMode,
  sendInvoiceWhatsApp,
} from "./messaging/qikchatWhatsApp";
import { shouldUseWorkDriveForInvoicePdf, uploadInvoicePdfToWorkDrive } from "./messaging/qikberryWorkDrive";

const INVOICE_PDF_DIR = path.join(process.cwd(), "uploads", "invoice-pdf");

const invoicePdfUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      try {
        fs.mkdirSync(INVOICE_PDF_DIR, { recursive: true });
      } catch {
        /* ignore */
      }
      cb(null, INVOICE_PDF_DIR);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase() === ".pdf" ? ".pdf" : ".pdf";
      cb(null, `inv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`);
    },
  }),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype === "application/pdf" ||
      file.originalname?.toLowerCase().endsWith(".pdf");
    if (ok) cb(null, true);
    else cb(new Error("Only PDF files are allowed."));
  },
});

function phoneLast10(v: string): string {
  const digits = v.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/** When API is reached via ngrok/cloudflare tunnel, build HTTPS base from proxy headers. */
function getPublicBaseFromRequest(req: Request): string | null {
  const proto = req.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const host = req.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (proto === "https" && host) {
    return `https://${host}`;
  }
  return null;
}

function resolvePublicDocumentUrl(relativePath: string, req?: Request): string {
  const rel = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
  const base =
    getMessagingPublicBaseUrl() || (req ? getPublicBaseFromRequest(req) : null) || "";
  if (!base) {
    throw new Error(
      "MESSAGING_PUBLIC_BASE_URL is not set. For local testing set WHATSAPP_INVOICE_DRY_RUN=true (PDF only, no WhatsApp), or run: ngrok http 4000 and add the https URL to .env.",
    );
  }
  return `${base.replace(/\/$/, "")}${rel}`;
}

export function registerMessagingRoutes(
  app: Express,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
): void {
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
        let savedRelativePath: string | null = null;
        if (file) {
          savedRelativePath = `/uploads/invoice-pdf/${file.filename}`;
          if (!documentFilename) {
            documentFilename = file.originalname || `Zimson-Invoice-${invoiceNumber}.pdf`;
          }
        }

        if (!documentUrl && !savedRelativePath) {
          res.status(400).json({
            error: "Upload the invoice PDF (document field) or provide documentUrl.",
          });
          return;
        }

        if (isWhatsAppInvoiceDryRun()) {
          const port = Number(process.env.PORT) || 4000;
          const localViewUrl = savedRelativePath
            ? `http://127.0.0.1:${port}${savedRelativePath}`
            : null;
          res.json({
            ok: true,
            dryRun: true,
            messageId: null,
            savedPdfPath: savedRelativePath,
            localViewUrl,
            message:
              "Dry run: PDF saved on this PC’s API server (uploads/invoice-pdf). WhatsApp was not called. Set WHATSAPP_INVOICE_DRY_RUN=false to send for real (Work Drive or MESSAGING_PUBLIC_BASE_URL).",
          });
          return;
        }

        if (!documentUrl && savedRelativePath) {
          const publicBase = getMessagingPublicBaseUrl() || getPublicBaseFromRequest(req);
          if (publicBase) {
            documentUrl = resolvePublicDocumentUrl(savedRelativePath, req);
          } else if (shouldUseWorkDriveForInvoicePdf() && file?.path) {
            documentUrl = await uploadInvoicePdfToWorkDrive(
              file.path,
              documentFilename || `Zimson-Invoice-${invoiceNumber}.pdf`,
            );
          } else {
            throw new Error(
              "Set MESSAGING_PUBLIC_BASE_URL to a public HTTPS base (ngrok https → port 4000, or production API URL). Qikchat downloads the PDF from that link per Media Messages API — see https://qikchat.gitbook.io/apidocs/reference/api-reference/media-messages",
            );
          }
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
}
