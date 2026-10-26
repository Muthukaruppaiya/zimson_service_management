import type { Express, NextFunction, Request, Response } from "express";
import multer from "multer";
import type { Pool } from "pg";
import type { DemoUser } from "../src/types/user";
import type { WarrantyClaimStatus, WarrantyPurchaseClaim } from "../src/types/warrantyClaim";
import { SRF_CUSTOMER_PHOTO_MAX_BYTES } from "../src/lib/srfPhotoLimits";
import { validateSrfDocumentUpload } from "../src/lib/srfCustomerPhotoUpload";
import { persistUploadedFile } from "./storage/fileStorage";
import { createMemoryUpload } from "./storage/multerMemory";

type Authed = Request & { userId: string };

type InAppNotifier = (
  userIds: string[],
  payload: { title: string; message: string; category: "inventory_pr" | "service_dc" | "service_srf" },
) => Promise<void>;

const SUBMIT_ROLES = new Set(["store_user", "store_manager", "store_accounts", "admin", "super_admin"]);
const REVIEW_ROLES = new Set(["admin", "super_admin"]);

const upload = createMemoryUpload(SRF_CUSTOMER_PHOTO_MAX_BYTES);

function claimUpload(req: Request, res: Response, next: NextFunction) {
  upload.single("file")(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({
          error: `File is too large. Maximum size is ${Math.round(SRF_CUSTOMER_PHOTO_MAX_BYTES / (1024 * 1024))} MB.`,
        });
        return;
      }
      res.status(400).json({ error: err instanceof Error ? err.message : "Upload failed." });
      return;
    }
    next();
  });
}

function phoneLast10(phone: string): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function isYmd(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00`).getTime());
}

function addMonthsYmd(ymd: string, months: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1 + months, d!));
  return dt.toISOString().slice(0, 10);
}

const CLAIM_SELECT = `
  SELECT c.id,
         c.claim_number AS "claimNumber",
         c.region_id AS "regionId",
         r.name AS "regionName",
         c.store_id AS "storeId",
         s.name AS "storeName",
         c.customer_name AS "customerName",
         c.phone,
         c.watch_brand AS "watchBrand",
         c.watch_model AS "watchModel",
         c.serial,
         c.purchase_invoice_number AS "purchaseInvoiceNumber",
         c.purchase_date::text AS "purchaseDate",
         c.purchased_from AS "purchasedFrom",
         c.purchase_amount_inr::float8 AS "purchaseAmountInr",
         c.warranty_months AS "warrantyMonths",
         c.warranty_till_date::text AS "warrantyTillDate",
         c.invoice_file_path AS "invoiceFilePath",
         c.invoice_file_name AS "invoiceFileName",
         c.invoice_file_mime AS "invoiceFileMime",
         c.remarks,
         c.status,
         c.review_note AS "reviewNote",
         c.submitted_by AS "submittedBy",
         su.display_name AS "submittedByName",
         c.submitted_at AS "submittedAt",
         c.reviewed_by AS "reviewedBy",
         ru.display_name AS "reviewedByName",
         c.reviewed_at AS "reviewedAt"
  FROM warranty_purchase_claims c
  LEFT JOIN regions r ON r.id = c.region_id
  LEFT JOIN stores s ON s.id = c.store_id
  LEFT JOIN app_users su ON su.id = c.submitted_by
  LEFT JOIN app_users ru ON ru.id = c.reviewed_by
`;

export function registerWarrantyPurchaseClaimRoutes(
  app: Express,
  pool: Pool,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
  getUserById: (id: string) => DemoUser | null,
  allUsers: () => DemoUser[],
  pushInApp?: InAppNotifier,
): void {
  app.get("/api/service/warranty-claims", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    if (!SUBMIT_ROLES.has(actor.role)) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
    const status = String(req.query.status ?? "").trim().toUpperCase();
    const where: string[] = [];
    const params: unknown[] = [];
    if (status === "PENDING" || status === "APPROVED" || status === "REJECTED") {
      params.push(status);
      where.push(`c.status = $${params.length}`);
    }
    if (!REVIEW_ROLES.has(actor.role)) {
      if (actor.storeId) {
        params.push(actor.storeId);
        where.push(`c.store_id = $${params.length}`);
      } else {
        params.push(actor.id);
        where.push(`c.submitted_by = $${params.length}`);
      }
    }
    try {
      const { rows } = await pool.query<WarrantyPurchaseClaim>(
        `${CLAIM_SELECT}
         ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
         ORDER BY CASE c.status WHEN 'PENDING' THEN 0 ELSE 1 END, c.submitted_at DESC
         LIMIT 300`,
        params,
      );
      res.json({ claims: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not load warranty claims." });
    }
  });

  app.post("/api/service/warranty-claims", requireAuth, claimUpload, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    if (!SUBMIT_ROLES.has(actor.role)) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const customerName = String(body.customerName ?? "").trim().slice(0, 200);
    const phone = phoneLast10(String(body.phone ?? ""));
    const watchBrand = String(body.watchBrand ?? "").trim().slice(0, 120);
    const watchModel = String(body.watchModel ?? "").trim().slice(0, 160);
    const serial = String(body.serial ?? "").trim().slice(0, 120);
    const purchaseInvoiceNumber = String(body.purchaseInvoiceNumber ?? "").trim().slice(0, 64);
    const purchaseDate = String(body.purchaseDate ?? "").trim();
    const purchasedFrom = String(body.purchasedFrom ?? "").trim().slice(0, 200);
    const amountRaw = String(body.purchaseAmountInr ?? "").trim();
    const purchaseAmountInr = amountRaw ? Number(amountRaw) : null;
    const warrantyMonths = Math.round(Number(body.warrantyMonths ?? 0));
    const remarks = String(body.remarks ?? "").trim().slice(0, 2000);

    if (!customerName) return void res.status(400).json({ error: "Customer name is required." });
    if (phone.length !== 10) return void res.status(400).json({ error: "Enter a valid 10-digit customer mobile." });
    if (!watchBrand) return void res.status(400).json({ error: "Watch brand is required." });
    if (!watchModel) return void res.status(400).json({ error: "Watch model is required." });
    if (!purchaseInvoiceNumber) return void res.status(400).json({ error: "Purchase invoice number is required." });
    if (!isYmd(purchaseDate)) return void res.status(400).json({ error: "Enter a valid purchase date." });
    if (purchaseDate > new Date().toISOString().slice(0, 10)) {
      return void res.status(400).json({ error: "Purchase date cannot be in the future." });
    }
    if (!purchasedFrom) return void res.status(400).json({ error: "Purchased from (store / dealer) is required." });
    if (purchaseAmountInr != null && (!Number.isFinite(purchaseAmountInr) || purchaseAmountInr < 0)) {
      return void res.status(400).json({ error: "Enter a valid purchase amount." });
    }
    if (!Number.isInteger(warrantyMonths) || warrantyMonths < 1 || warrantyMonths > 120) {
      return void res.status(400).json({ error: "Warranty period must be between 1 and 120 months." });
    }
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) return void res.status(400).json({ error: "Upload the purchase invoice (PDF or image)." });
    const fileErr = validateSrfDocumentUpload(file);
    if (fileErr) return void res.status(400).json({ error: fileErr });

    const warrantyTillDate = addMonthsYmd(purchaseDate, warrantyMonths);
    if (warrantyTillDate < new Date().toISOString().slice(0, 10)) {
      return void res.status(400).json({ error: `Warranty already ended on ${warrantyTillDate}.` });
    }

    try {
      const dup = await pool.query<{ claim_number: string; status: string }>(
        `SELECT claim_number, status FROM warranty_purchase_claims
         WHERE LOWER(purchase_invoice_number) = LOWER($1) AND phone = $2 AND status <> 'REJECTED'
         LIMIT 1`,
        [purchaseInvoiceNumber, phone],
      );
      if (dup.rows[0]) {
        res.status(400).json({
          error: `Invoice ${purchaseInvoiceNumber} is already submitted as ${dup.rows[0].claim_number} (${dup.rows[0].status.toLowerCase()}).`,
        });
        return;
      }

      const filePath = await persistUploadedFile({
        category: "customer-documents",
        buffer: file.buffer,
        originalName: file.originalname || "purchase-invoice.pdf",
        mime: file.mimetype || "application/octet-stream",
        fallbackExt: ".pdf",
      });
      const seq = await pool.query<{ n: string }>(`SELECT nextval('warranty_purchase_claim_seq')::text AS n`);
      const claimNumber = `WPC-${String(seq.rows[0]?.n ?? "1").padStart(6, "0")}`;
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO warranty_purchase_claims (
           claim_number, region_id, store_id, customer_name, phone, watch_brand, watch_model, serial,
           purchase_invoice_number, purchase_date, purchased_from, purchase_amount_inr,
           warranty_months, warranty_till_date, invoice_file_path, invoice_file_name, invoice_file_mime,
           remarks, submitted_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::date, $11, $12, $13, $14::date, $15, $16, $17, $18, $19)
         RETURNING id`,
        [
          claimNumber,
          actor.regionId ?? null,
          actor.storeId ?? null,
          customerName,
          phone,
          watchBrand,
          watchModel,
          serial,
          purchaseInvoiceNumber,
          purchaseDate,
          purchasedFrom,
          purchaseAmountInr,
          warrantyMonths,
          warrantyTillDate,
          filePath,
          (file.originalname || "").slice(0, 255) || null,
          (file.mimetype || "").slice(0, 120) || null,
          remarks,
          actor.id,
        ],
      );
      const created = await pool.query<WarrantyPurchaseClaim>(`${CLAIM_SELECT} WHERE c.id = $1::uuid`, [rows[0]!.id]);

      if (pushInApp) {
        const reviewers = allUsers().filter((u) => REVIEW_ROLES.has(u.role) && u.id !== actor.id);
        void pushInApp(
          reviewers.map((u) => u.id),
          {
            title: "Warranty claim awaiting review",
            message: `${claimNumber} · ${customerName} · ${watchBrand} ${watchModel} · Inv. ${purchaseInvoiceNumber}`,
            category: "service_srf",
          },
        ).catch(() => {});
      }
      res.status(201).json({ claim: created.rows[0] });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not submit warranty claim." });
    }
  });

  async function review(req: Request, res: Response, decision: Exclude<WarrantyClaimStatus, "PENDING">) {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    if (!REVIEW_ROLES.has(actor.role)) {
      res.status(403).json({ error: "Only back office (admin) can review warranty claims." });
      return;
    }
    const id = String(req.params.id ?? "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      res.status(400).json({ error: "Invalid claim." });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const note = String(body.note ?? "").trim().slice(0, 2000);
    const tillRaw = String(body.warrantyTillDate ?? "").trim();
    if (decision === "REJECTED" && !note) {
      res.status(400).json({ error: "Enter the reason for rejection." });
      return;
    }
    if (decision === "APPROVED" && tillRaw && !isYmd(tillRaw)) {
      res.status(400).json({ error: "Enter a valid warranty end date." });
      return;
    }
    try {
      const { rows } = await pool.query<{ id: string; claim_number: string; submitted_by: string | null; customer_name: string }>(
        `UPDATE warranty_purchase_claims
         SET status = $2::text,
             review_note = $3::text,
             warranty_till_date = CASE WHEN $2::text = 'APPROVED' AND $4::text <> '' THEN $4::text::date ELSE warranty_till_date END,
             reviewed_by = $5,
             reviewed_at = now()
         WHERE id = $1::uuid AND status = 'PENDING'
         RETURNING id, claim_number, submitted_by, customer_name`,
        [id, decision, note, tillRaw, actor.id],
      );
      const row = rows[0];
      if (!row) {
        res.status(400).json({ error: "Claim not found or already reviewed." });
        return;
      }
      const updated = await pool.query<WarrantyPurchaseClaim>(`${CLAIM_SELECT} WHERE c.id = $1::uuid`, [row.id]);
      if (pushInApp && row.submitted_by) {
        void pushInApp([row.submitted_by], {
          title: decision === "APPROVED" ? "Warranty claim approved" : "Warranty claim rejected",
          message:
            decision === "APPROVED"
              ? `${row.claim_number} · ${row.customer_name}: approved. Book the SRF as Warranty — non chargeable.`
              : `${row.claim_number} · ${row.customer_name}: rejected — ${note}`,
          category: "service_srf",
        }).catch(() => {});
      }
      res.json({ claim: updated.rows[0] });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not update warranty claim." });
    }
  }

  app.post("/api/service/warranty-claims/:id/approve", requireAuth, (req, res) => void review(req, res, "APPROVED"));
  app.post("/api/service/warranty-claims/:id/reject", requireAuth, (req, res) => void review(req, res, "REJECTED"));
}
