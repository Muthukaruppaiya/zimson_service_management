import type { Express, NextFunction, Request, Response } from "express";
import { persistUploadedFile } from "./storage/fileStorage";
import { categoryForQuickBillAttachment } from "./storage/config";
import { createMemoryUpload } from "./storage/multerMemory";
import type { Pool, PoolClient } from "pg";
import type { DemoUser } from "../src/types/user";
import { normalizePaymentForTotal, type AdvancePaymentDetails } from "../src/lib/paymentModes";
import {
  validateQuickBillAttachmentFile,
  WATCH_ATTACHMENT_MAX_BYTES,
} from "../src/lib/watchAttachmentUpload";
import {
  isUnlimitedServiceChargeRole,
  STORE_SERVICE_CHARGE_MAX_INR,
} from "../src/lib/serviceChargeLimits";
import { validateCustomerB2bGstin } from "../src/lib/zimsonCompanyGst";
import {
  parseStateCodeFromText,
  resolveCustomerSupplyStateCode,
  resolveSellerStateCode,
  stateCodeLabel,
} from "../src/lib/gstSupply";
import { computeServiceBillGst } from "../src/lib/serviceBillGst";
import { customerPayableInr } from "../src/lib/quickBillPayable";
import {
  allowsZeroBillTotal,
  billableLineAmount,
  billableServiceChargeInr,
} from "../src/lib/natureOfRepair";
import { appendStockHistory } from "./db/stockHistory";
import { allocateStoreInvoiceNumber } from "./storeInvoiceNumber";
import { loadSpareGstById } from "./hsnGstRates";
import { phoneLast10 } from "./messaging/customerContact";
import { finalizeQuickBillCaptureSession } from "./quickBillCaptureRoutes";
import { registerWatchCatalogRoutes } from "./watchCatalogRoutes";
import { edocEnabled, tryGenerateEinvoiceForQuickBill } from "./mastersIndiaEdoc";

type Authed = Request & { userId: string };

const qbUpload = createMemoryUpload(WATCH_ATTACHMENT_MAX_BYTES);

const WARRANTY_VALUES = new Set(["unspecified", "none", "under_warranty", "extended"]);

function actorCanAccessQuickBillRow(actor: DemoUser, billRegionId: string, billStoreId: string | null): boolean {
  if (actor.role === "super_admin" || actor.role === "admin") return true;
  if (
    actor.role === "admin" ||
    actor.role === "ho_manager" ||
    actor.role === "ho_purchase" ||
    actor.role === "ho_accounts" ||
    actor.role === "ho_manager" ||
    actor.role === "service_centre_clerk" ||
    actor.role === "service_centre_supervisor" ||
    actor.role === "service_centre_clerk" ||
    actor.role === "service_centre_clerk" ||
    actor.role === "technician"
  ) {
    return Boolean(actor.regionId && actor.regionId === billRegionId);
  }
  if (
    actor.role === "store_user" ||
    actor.role === "store_user" ||
    actor.role === "store_manager" ||
    actor.role === "store_accounts"
  ) {
    return Boolean(
      actor.regionId && actor.storeId && actor.regionId === billRegionId && actor.storeId === billStoreId,
    );
  }
  return false;
}

async function loadQuickBillInvoiceById(db: Pool | PoolClient, billId: string) {
  const detail = await db.query(
    `SELECT qb.id,
            qb.bill_number AS "billNumber",
            COALESCE(qb.invoice_number, qb.bill_number) AS "invoiceNumber",
            qb.created_at AS "createdAt",
            qb.region_id AS "regionId",
            r.name AS "regionName",
            qb.store_id AS "storeId",
            s.name AS "storeName",
            qb.customer_type AS "customerType",
            qb.customer_id AS "customerId",
            qb.customer_code AS "customerCode",
            qb.customer_name AS "customerName",
            qb.phone,
            qb.email,
            qb.company,
            qb.gst,
            qb.pan,
            qb.address,
            qb.city,
            qb.customer_billing_state AS "customerBillingState",
            qb.watch_brand AS "watchBrand",
            qb.watch_family AS "watchFamily",
            qb.watch_model AS "watchModel",
            qb.watch_ref AS "watchRef",
            qb.watch_remark AS "watchRemark",
            qb.case_type AS "caseType",
            qb.strap_chain_type AS "strapChainType",
            qb.nature_of_repair AS "natureOfRepair",
            qb.chain_count AS "chainCount",
            qb.customer_remarks AS "customerRemarks",
            qb.warranty_status AS "warrantyStatus",
            qb.watch_document_path AS "watchDocumentPath",
            qb.watch_image_path AS "watchImagePath",
            qb.technician_id AS "technicianId",
            qb.technician_name AS "technicianName",
            qb.payment_mode AS "paymentMode",
            qb.notes,
            qb.total_inr::float8 AS "totalInr",
            qb.payment_details AS "paymentDetails",
            qb.edoc_irn AS "edocIrn",
            qb.edoc_ack_no AS "edocAckNo",
            qb.edoc_qr AS "edocQr",
            qb.edoc_status AS "edocStatus",
            qb.edoc_error AS "edocError"
     FROM quick_bills qb
     LEFT JOIN regions r ON r.id = qb.region_id
     LEFT JOIN stores s ON s.id = qb.store_id
     WHERE qb.id = $1::uuid`,
    [billId],
  );
  if (detail.rowCount === 0) return null;

  const { rows: lineRows } = await db.query(
    `SELECT line_no AS "lineNo",
            description,
            amount_inr::float8 AS "amountInr",
            spare_id AS "spareId",
            qty::float8 AS qty
     FROM quick_bill_lines
     WHERE quick_bill_id = $1::uuid
     ORDER BY line_no`,
    [billId],
  );

  const head = detail.rows[0] as Record<string, unknown>;
  const createdAt =
    head.createdAt instanceof Date
      ? (head.createdAt as Date).toISOString()
      : new Date(String(head.createdAt)).toISOString();
  const pdRaw = head.paymentDetails;
  const paymentDetailsParsed: AdvancePaymentDetails | null =
    pdRaw && typeof pdRaw === "object" && !Array.isArray(pdRaw) ? (pdRaw as AdvancePaymentDetails) : null;

  return {
    id: head.id,
    billNumber: head.billNumber,
    invoiceNumber: head.invoiceNumber as string,
    createdAt,
    regionId: head.regionId,
    regionName: head.regionName ?? null,
    storeId: head.storeId ?? null,
    storeName: head.storeName ?? null,
    customerType: head.customerType,
    customerId: head.customerId ?? null,
    customerCode: head.customerCode ?? null,
    customerName: head.customerName ?? null,
    phone: head.phone ?? null,
    email: head.email ?? null,
    company: head.company ?? null,
    gst: head.gst ?? null,
    pan: head.pan ?? null,
    address: (head.address as string | null) ?? null,
    city: (head.city as string | null) ?? null,
    customerBillingState: (head.customerBillingState as string | null) ?? null,
    watchBrand: head.watchBrand,
    watchFamily: (head.watchFamily as string | null) ?? "",
    watchModel: head.watchModel,
    watchRef: head.watchRef ?? null,
    watchRemark: head.watchRemark ?? "",
    caseType: (head.caseType as string | null) ?? "",
    strapChainType: (head.strapChainType as string | null) ?? "",
    natureOfRepair: (head.natureOfRepair as string | null) ?? "",
    chainCount: (head.chainCount as string | null) ?? "",
    customerRemarks: (head.customerRemarks as string | null) ?? "",
    warrantyStatus: head.warrantyStatus ?? "unspecified",
    watchDocumentPath: head.watchDocumentPath ?? null,
    watchImagePath: head.watchImagePath ?? null,
    technicianId: head.technicianId ?? null,
    technicianName: head.technicianName ?? null,
    paymentMode: head.paymentMode,
    paymentDetails: paymentDetailsParsed && Object.keys(paymentDetailsParsed).length > 0 ? paymentDetailsParsed : null,
    notes: head.notes ?? "",
    totalInr: Number(head.totalInr),
    lines: lineRows.map((r) => ({
      lineNo: r.lineNo as number,
      description: r.description as string,
      amountInr: Number(r.amountInr),
      spareId: (r.spareId as string | null) ?? null,
      qty: Number(r.qty),
    })),
    edocIrn: (head.edocIrn as string | null) ?? null,
    edocAckNo: (head.edocAckNo as string | null) ?? null,
    edocQr: (head.edocQr as string | null) ?? null,
    edocStatus: (head.edocStatus as string | null) ?? null,
    edocError: (head.edocError as string | null) ?? null,
  };
}

function makeAlphaNumCode(input: string, fallback: string): string {
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (cleaned.slice(0, 3) || fallback).padEnd(3, "X");
}

async function nextQuickBillNumber(
  client: PoolClient,
  regionId: string,
  storeId?: string | null,
): Promise<string> {
  const yy = String(new Date().getFullYear()).slice(-2);

  let scopeCode: string;
  if (storeId) {
    // Use the store's configured invoice code (same as used in invoice_number)
    const { rows: st } = await client.query<{ invoice_number_store_code: string | null; name: string }>(
      `SELECT invoice_number_store_code, name FROM stores WHERE id = $1::text`,
      [storeId],
    );
    const rawCode = st[0]?.invoice_number_store_code?.trim() || "";
    scopeCode = (
      rawCode ||
      String(st[0]?.name ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) ||
      "STR"
    ).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  } else {
    scopeCode = makeAlphaNumCode(regionId, "RGN");
  }

  const seq = await client.query<{ last_value: number }>(
    `INSERT INTO number_sequences (prefix, scope_code, year_2, last_value)
     VALUES ($1, $2, $3, 1)
     ON CONFLICT (prefix, scope_code, year_2)
     DO UPDATE SET last_value = number_sequences.last_value + 1
     RETURNING last_value`,
    ["QB", scopeCode, yy],
  );
  const num = String(seq.rows[0]!.last_value).padStart(3, "0");
  return `QB${yy}${scopeCode}${num}`;
}

function isValidGst(gst: string): boolean {
  const g = gst.trim().toUpperCase().replace(/\s/g, "");
  return g.length === 15 && /^[0-9A-Z]+$/.test(g);
}

function isValidPan(pan: string): boolean {
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(pan.trim());
}

export function registerQuickBillRoutes(
  app: Express,
  pool: Pool,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
  getUserById: (id: string) => DemoUser | null,
): void {
  app.get("/api/service/watch-models", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    const brand = String(req.query.brand ?? "").trim();
    if (!brand) {
      res.status(400).json({ error: "brand query parameter is required." });
      return;
    }
    const brandNorm = brand.trim().toLowerCase();
    try {
      const { rows } = await pool.query<{
        id: string;
        brand: string;
        model: string;
        refHint: string | null;
      }>(
        `SELECT id::text AS id,
                brand,
                model,
                ref_hint AS "refHint"
         FROM watch_models_catalog
         WHERE brand_norm = $1
         ORDER BY model ASC`,
        [brandNorm],
      );
      res.json({ models: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not load watch models." });
    }
  });

  app.get("/api/service/watch-families", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    const brand = String(req.query.brand ?? "").trim();
    if (!brand) {
      res.status(400).json({ error: "brand query parameter is required." });
      return;
    }
    const brandNorm = brand.trim().toLowerCase();
    try {
      const { rows } = await pool.query<{
        id: string;
        brand: string;
        family: string;
      }>(
        `SELECT id::text AS id,
                brand,
                family
         FROM watch_families_catalog
         WHERE brand_norm = $1
         ORDER BY family ASC`,
        [brandNorm],
      );
      res.json({ families: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not load watch families." });
    }
  });

  app.post("/api/service/watch-families", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    const brand = String(req.body?.brand ?? "").trim();
    const family = String(req.body?.family ?? "").trim();
    if (!brand || !family) {
      res.status(400).json({ error: "brand and family are required." });
      return;
    }
    if (family.length > 200 || brand.length > 200) {
      res.status(400).json({ error: "brand or family is too long." });
      return;
    }
    const brandNorm = brand.toLowerCase();
    const familyNorm = family.toLowerCase();
    try {
      const ins = await pool.query<{ id: string }>(
        `INSERT INTO watch_families_catalog (brand, family, brand_norm, family_norm, created_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (brand_norm, family_norm) DO NOTHING
         RETURNING id::text AS id`,
        [brand, family, brandNorm, familyNorm, actor.id],
      );
      let id = ins.rows[0]?.id as string | undefined;
      if (!id) {
        const sel = await pool.query<{ id: string }>(
          `SELECT id::text AS id FROM watch_families_catalog WHERE brand_norm = $1 AND family_norm = $2`,
          [brandNorm, familyNorm],
        );
        id = sel.rows[0]?.id;
      }
      res.json({ ok: true, id: id ?? null, wasNew: Boolean(ins.rows[0]) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not save watch family." });
    }
  });

  app.post("/api/service/watch-models", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    const brand = String(req.body?.brand ?? "").trim();
    const model = String(req.body?.model ?? "").trim();
    const refHintRaw = req.body?.refHint;
    const refHint =
      refHintRaw == null || String(refHintRaw).trim() === "" ? null : String(refHintRaw).trim();
    if (!brand || !model) {
      res.status(400).json({ error: "brand and model are required." });
      return;
    }
    if (model.length > 300 || brand.length > 200) {
      res.status(400).json({ error: "brand or model is too long." });
      return;
    }
    const b = brand;
    const m = model;
    const brandNorm = b.toLowerCase();
    const modelNorm = m.toLowerCase();
    try {
      const ins = await pool.query<{ id: string }>(
        `INSERT INTO watch_models_catalog (brand, model, brand_norm, model_norm, ref_hint, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (brand_norm, model_norm) DO NOTHING
         RETURNING id::text AS id`,
        [b, m, brandNorm, modelNorm, refHint, actor.id],
      );
      let id = ins.rows[0]?.id as string | undefined;
      if (!id) {
        const sel = await pool.query<{ id: string }>(
          `SELECT id::text AS id FROM watch_models_catalog WHERE brand_norm = $1 AND model_norm = $2`,
          [brandNorm, modelNorm],
        );
        id = sel.rows[0]?.id;
      }
      res.json({ ok: true, id: id ?? null, wasNew: Boolean(ins.rows[0]) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not save watch model." });
    }
  });

  registerWatchCatalogRoutes(app, pool, requireAuth, getUserById);

  app.post("/api/service/quick-bill-attachments", requireAuth, qbUpload.single("file"), async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    const f = (req as Request & { file?: Express.Multer.File }).file;
    if (!f?.buffer?.length) {
      res.status(400).json({ error: "file field is required." });
      return;
    }
    const kindRaw = String(req.body?.kind ?? "").trim();
    if (kindRaw !== "doc" && kindRaw !== "img") {
      res.status(400).json({ error: "kind must be doc or img." });
      return;
    }
    const validationError = validateQuickBillAttachmentFile(f, kindRaw);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }
    try {
      const storagePath = await persistUploadedFile({
        category: categoryForQuickBillAttachment(kindRaw),
        buffer: f.buffer,
        originalName: f.originalname || (kindRaw === "doc" ? "document.pdf" : "image.jpg"),
        mime: f.mimetype || "application/octet-stream",
        fallbackExt: kindRaw === "doc" ? ".pdf" : ".jpg",
      });
      res.json({ url: `/${storagePath}` });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not save attachment." });
    }
  });

  app.get("/api/service/quick-bills", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }

    const limitRaw = Number(req.query.limit ?? 50);
    const limit = Math.min(100, Math.max(1, Number.isNaN(limitRaw) ? 50 : limitRaw));
    const regionIdQ = String(req.query.regionId ?? "").trim();

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (actor.role === "super_admin" || actor.role === "admin") {
      if (regionIdQ) {
        params.push(regionIdQ);
        conditions.push(`qb.region_id = $${params.length}::text`);
      }
    } else if (
      actor.role === "admin" ||
      actor.role === "ho_manager" ||
      actor.role === "ho_purchase" ||
      actor.role === "ho_accounts" ||
      actor.role === "ho_manager" ||
      actor.role === "service_centre_clerk" ||
      actor.role === "service_centre_supervisor" ||
      actor.role === "service_centre_clerk" ||
      actor.role === "service_centre_clerk" ||
      actor.role === "technician"
    ) {
      if (!actor.regionId) {
        res.json({ bills: [] });
        return;
      }
      params.push(actor.regionId);
      conditions.push(`qb.region_id = $${params.length}::text`);
    } else if (
      actor.role === "store_user" ||
      actor.role === "store_user" ||
      actor.role === "store_manager" ||
      actor.role === "store_accounts"
    ) {
      if (!actor.regionId || !actor.storeId) {
        res.json({ bills: [] });
        return;
      }
      params.push(actor.regionId, actor.storeId);
      conditions.push(`qb.region_id = $${params.length - 1}::text AND qb.store_id = $${params.length}::text`);
    } else {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(limit);

    try {
      const { rows } = await pool.query(
        `SELECT qb.id,
                qb.bill_number AS "billNumber",
                COALESCE(qb.invoice_number, qb.bill_number) AS "invoiceNumber",
                qb.created_at AS "createdAt",
                qb.region_id AS "regionId",
                r.name AS "regionName",
                qb.store_id AS "storeId",
                s.name AS "storeName",
                qb.customer_type AS "customerType",
                qb.customer_name AS "customerName",
                qb.phone,
                qb.email,
                qb.company,
                qb.gst,
                qb.pan,
                qb.address,
                qb.city,
                qb.watch_brand AS "watchBrand",
                qb.watch_model AS "watchModel",
                qb.watch_ref AS "watchRef",
                qb.watch_remark AS "watchRemark",
                qb.warranty_status AS "warrantyStatus",
                qb.technician_name AS "technicianName",
                qb.payment_mode AS "paymentMode",
                qb.notes,
                qb.total_inr::float8 AS "totalInr",
                qb.created_by AS "createdBy"
         FROM quick_bills qb
         LEFT JOIN regions r ON r.id = qb.region_id
         LEFT JOIN stores s ON s.id = qb.store_id
         ${where}
         ORDER BY qb.created_at DESC
         LIMIT $${params.length}`,
        params,
      );
      const bills = rows.map((row) => {
        const r = row as Record<string, unknown>;
        const createdAt =
          r.createdAt instanceof Date
            ? (r.createdAt as Date).toISOString()
            : new Date(String(r.createdAt)).toISOString();
        return {
          id: r.id,
          billNumber: r.billNumber,
          invoiceNumber: r.invoiceNumber as string,
          createdAt,
          regionId: r.regionId,
          regionName: r.regionName ?? null,
          storeId: r.storeId ?? null,
          storeName: r.storeName ?? null,
          customerType: r.customerType,
          customerName: r.customerName ?? null,
          phone: r.phone ?? null,
          email: r.email ?? null,
          company: r.company ?? null,
          gst: r.gst ?? null,
          pan: r.pan ?? null,
          address: (r.address as string | null) ?? null,
          city: (r.city as string | null) ?? null,
          watchBrand: r.watchBrand,
          watchModel: r.watchModel,
          watchRef: r.watchRef ?? null,
          watchRemark: r.watchRemark ?? "",
          warrantyStatus: r.warrantyStatus ?? "unspecified",
          technicianName: r.technicianName ?? null,
          paymentMode: r.paymentMode,
          notes: r.notes ?? "",
          totalInr: Number(r.totalInr),
          createdBy: r.createdBy,
        };
      });
      res.json({ bills });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not load quick bill history." });
    }
  });

  app.get("/api/service/quick-bills/:billId", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    const billId = String(req.params.billId ?? "").trim();
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(billId)) {
      res.status(400).json({ error: "Invalid bill id." });
      return;
    }
    try {
      const head = await pool.query<{ regionId: string; storeId: string | null }>(
        `SELECT region_id AS "regionId", store_id AS "storeId" FROM quick_bills WHERE id = $1::uuid`,
        [billId],
      );
      if (head.rowCount === 0) {
        res.status(404).json({ error: "Quick bill not found." });
        return;
      }
      const r = head.rows[0]!;
      if (!actorCanAccessQuickBillRow(actor, r.regionId, r.storeId)) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
      const invoice = await loadQuickBillInvoiceById(pool, billId);
      if (!invoice) {
        res.status(404).json({ error: "Quick bill not found." });
        return;
      }
      res.json({ invoice });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not load quick bill." });
    }
  });

  app.post("/api/service/quick-bills", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }

    let regionId = actor.regionId ?? "";
    let storeId: string | null = actor.storeId ?? null;
    if (actor.role === "super_admin" || actor.role === "admin") {
      regionId = String(req.body?.regionId ?? "").trim() || regionId;
      const sid = req.body?.storeId;
      storeId = sid == null || sid === "" ? null : String(sid);
    }

    if (!regionId) {
      res.status(400).json({ error: "regionId is required (select a region for super admin accounts)." });
      return;
    }

    if (actor.role === "admin" && actor.regionId !== regionId) {
      res.status(403).json({ error: "Cannot post quick bill outside your region." });
      return;
    }
    if (actor.role === "store_user") {
      if (actor.regionId !== regionId || actor.storeId !== storeId) {
        res.status(403).json({ error: "Store user can only bill for their own store." });
        return;
      }
    }
    if (
      (actor.role === "service_centre_clerk" ||
        actor.role === "service_centre_supervisor" ||
        actor.role === "service_centre_clerk" ||
        actor.role === "service_centre_clerk" ||
        actor.role === "technician") &&
      actor.regionId !== regionId
    ) {
      res.status(403).json({ error: "Cannot post quick bill outside your service centre region." });
      return;
    }

    const customerType = String(req.body?.customerType ?? "").toUpperCase() === "B2B" ? "B2B" : "B2C";
    const customerName = String(req.body?.customerName ?? "").trim() || null;
    const phone = String(req.body?.phone ?? "").trim() || null;
    const email = String(req.body?.email ?? "").trim() || null;
    const company = String(req.body?.company ?? "").trim() || null;
    const gst = String(req.body?.gst ?? "").trim().toUpperCase() || null;
    const pan = String(req.body?.pan ?? "").trim().toUpperCase() || null;
    const address = String(req.body?.address ?? "").trim() || null;
    const city = String(req.body?.city ?? "").trim() || null;
    const customerIdRaw = req.body?.customerId;
    const customerId =
      customerIdRaw == null || String(customerIdRaw).trim() === "" ? null : String(customerIdRaw).trim();
    const customerCode = String(req.body?.customerCode ?? "").trim() || null;

    if (customerType === "B2B") {
      if (!company) {
        res.status(400).json({ error: "B2B: company name is required." });
        return;
      }
      if (!gst || !isValidGst(gst)) {
        res.status(400).json({ error: "B2B: valid 15-character GSTIN is required." });
        return;
      }
      const zimsonGstErr = validateCustomerB2bGstin(gst);
      if (zimsonGstErr) {
        res.status(400).json({ error: zimsonGstErr });
        return;
      }
      if (!pan || !isValidPan(pan)) {
        res.status(400).json({ error: "B2B: valid PAN is required." });
        return;
      }
      if (!customerName || !phone) {
        res.status(400).json({ error: "B2B: contact name and phone are required." });
        return;
      }
    }

    const customerPhoneLast10 = phoneLast10(phone ?? "");
    if (customerPhoneLast10.length !== 10) {
      res.status(400).json({ error: "Valid 10-digit customer mobile number is required." });
      return;
    }

    const watchBrand = String(req.body?.watchBrand ?? "").trim();
    const watchFamily = String(req.body?.watchFamily ?? "").trim();
    const watchModel = String(req.body?.watchModel ?? "").trim();
    const watchRefRaw = req.body?.watchRef;
    const watchRef =
      watchRefRaw == null || String(watchRefRaw).trim() === "" ? null : String(watchRefRaw).trim();
    if (!watchBrand || !watchFamily || !watchModel) {
      res.status(400).json({ error: "watchBrand, watchFamily, and watchModel are required." });
      return;
    }

    const persistNewWatchModel = Boolean(req.body?.persistNewWatchModel);
    const persistNewWatchFamily = Boolean(req.body?.persistNewWatchFamily);

    const watchRemark = String(req.body?.watchRemark ?? "").trim();
    const caseType = String(req.body?.caseType ?? "").trim();
    const strapChainType = String(req.body?.strapChainType ?? "").trim();
    const natureOfRepair = String(req.body?.natureOfRepair ?? "").trim();
    const chainCount = String(req.body?.chainCount ?? "").trim();
    const customerRemarks = String(req.body?.customerRemarks ?? "").trim();
    const warrantyStatusRaw = String(req.body?.warrantyStatus ?? "unspecified").trim();
    const unlimitedCharges = isUnlimitedServiceChargeRole(actor.role);
    const warrantyStatus = WARRANTY_VALUES.has(warrantyStatusRaw) ? warrantyStatusRaw : "unspecified";
    const docPathRaw = req.body?.watchDocumentPath;
    const imgPathRaw = req.body?.watchImagePath;
    const watchDocumentPath =
      docPathRaw == null || String(docPathRaw).trim() === "" ? null : String(docPathRaw).trim();
    const watchImagePath =
      imgPathRaw == null || String(imgPathRaw).trim() === "" ? null : String(imgPathRaw).trim();

    const technicianIdRaw = req.body?.technicianId;
    const technicianId =
      technicianIdRaw == null || String(technicianIdRaw).trim() === ""
        ? null
        : String(technicianIdRaw).trim();
    const technicianNameRaw = req.body?.technicianName;
    const technicianName =
      technicianNameRaw == null || String(technicianNameRaw).trim() === ""
        ? null
        : String(technicianNameRaw).trim();

    const notes = String(req.body?.notes ?? "").trim();
    const serviceChargeInrEarly = Number(req.body?.serviceChargeInr ?? 0);
    const hasServiceChargeOnly =
      Number.isFinite(serviceChargeInrEarly) && serviceChargeInrEarly > 0;
    const rawLines = req.body?.lines;
    if (!Array.isArray(rawLines)) {
      res.status(400).json({ error: "lines must be an array." });
      return;
    }
    if (rawLines.length === 0 && !hasServiceChargeOnly) {
      res.status(400).json({
        error: "Add at least one line item or a service / repair charge.",
      });
      return;
    }
    if (rawLines.length > 60) {
      res.status(400).json({ error: "Too many line items." });
      return;
    }

    if (actor.role === "admin" && !storeId) {
      res.status(400).json({
        error: "Select a billing store before saving the quick bill.",
      });
      return;
    }

    type NormLine = { lineNo: number; description: string; amountInr: number; spareId: string | null; qty: number };
    const lines: NormLine[] = [];
    let sum = 0;
    let lineNo = 0;
    for (const row of rawLines) {
      lineNo += 1;
      const description = String((row as { description?: string }).description ?? "").trim();
      const amountInr = Number((row as { amount?: unknown }).amount);
      const spareRaw = (row as { spareId?: unknown }).spareId;
      const spareId =
        spareRaw == null || String(spareRaw).trim() === "" ? null : String(spareRaw).trim();
      const qtyRaw = (row as { qty?: unknown }).qty;
      const qty =
        qtyRaw === undefined || qtyRaw === null || String(qtyRaw).trim() === ""
          ? 1
          : Number(qtyRaw);
      if (!description || Number.isNaN(amountInr) || amountInr < 0) {
        res.status(400).json({ error: `Line ${lineNo}: description and non-negative amount are required.` });
        return;
      }
      if (!spareId && !unlimitedCharges && amountInr > STORE_SERVICE_CHARGE_MAX_INR) {
        res.status(400).json({
          error: `Line ${lineNo}: charge cannot exceed ₹${STORE_SERVICE_CHARGE_MAX_INR.toLocaleString("en-IN")} unless entered by an administrator.`,
        });
        return;
      }
      if (description.length > 2000) {
        res.status(400).json({ error: `Line ${lineNo}: description is too long.` });
        return;
      }
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (spareId && !uuidRe.test(spareId)) {
        res.status(400).json({ error: `Line ${lineNo}: invalid spareId.` });
        return;
      }
      if (spareId && (Number.isNaN(qty) || qty <= 0)) {
        res.status(400).json({ error: `Line ${lineNo}: spare lines need a positive qty.` });
        return;
      }
      lines.push({
        lineNo,
        description,
        amountInr,
        spareId,
        qty: spareId ? qty : 1,
      });
      sum += billableLineAmount(natureOfRepair, amountInr, spareId);
    }

    const serviceChargeInr = Number(req.body?.serviceChargeInr ?? 0);
    if (
      Number.isFinite(serviceChargeInr) &&
      serviceChargeInr > STORE_SERVICE_CHARGE_MAX_INR &&
      !unlimitedCharges
    ) {
      res.status(400).json({
        error: `Service / repair charge cannot exceed ₹${STORE_SERVICE_CHARGE_MAX_INR.toLocaleString("en-IN")} unless entered by an administrator.`,
      });
      return;
    }
    const serviceChargeBillable = billableServiceChargeInr(
      natureOfRepair,
      Number.isFinite(serviceChargeInr) ? serviceChargeInr : 0,
    );
    if (serviceChargeBillable > 0) {
      lineNo += 1;
      const rounded = Math.round(serviceChargeBillable * 100) / 100;
      lines.push({
        lineNo,
        description: "Service / repair charge",
        amountInr: rounded,
        spareId: null,
        qty: 1,
      });
      sum += rounded;
    }

    const subtotalInr = Math.round(sum * 100) / 100;
    if (subtotalInr <= 0 && !allowsZeroBillTotal(natureOfRepair)) {
      res.status(400).json({ error: "Total amount must be greater than zero." });
      return;
    }

    const customerBillingStateRaw = String(req.body?.customerBillingState ?? "").trim() || null;
    const parsedStateCode = parseStateCodeFromText(
      customerBillingStateRaw,
      address,
      city,
    );
    const customerBillingState =
      customerBillingStateRaw ||
      (parsedStateCode ? stateCodeLabel(parsedStateCode) : null);

    const taxRes = await pool.query<{
      gst_rate_percent: string;
      cgst_rate_percent: string;
      sgst_rate_percent: string;
      igst_rate_percent: string;
      default_sac_hsn: string;
      prices_tax_inclusive: boolean;
      invoice_store_gstin: string;
    }>(
      `SELECT gst_rate_percent::text, cgst_rate_percent::text, sgst_rate_percent::text,
              igst_rate_percent::text, default_sac_hsn, prices_tax_inclusive, invoice_store_gstin
       FROM service_tax_settings WHERE id = 1`,
    );
    const taxRow = taxRes.rows[0];
    const configuredGst = Number(taxRow?.gst_rate_percent ?? 18);
    const defaultSacHsn = String(taxRow?.default_sac_hsn ?? "9987").trim() || "9987";
    const pricesTaxInclusive = Boolean(taxRow?.prices_tax_inclusive);

    let storeGstin = "";
    if (storeId) {
      const st = await pool.query<{ invoice_gstin: string | null }>(
        `SELECT invoice_gstin FROM stores WHERE id = $1::text`,
        [storeId],
      );
      storeGstin = String(st.rows[0]?.invoice_gstin ?? "").trim();
    }
    if (!storeGstin) storeGstin = String(taxRow?.invoice_store_gstin ?? "").trim();

    const sellerStateCode = resolveSellerStateCode(storeGstin);
    const customerStateCode = resolveCustomerSupplyStateCode({
      customerType,
      customerGstin: gst,
      billingStateName: customerBillingState,
      addressText: address,
      cityText: city,
      sellerStateCode,
    });

    const spareIds = [...new Set(lines.map((l) => l.spareId).filter(Boolean))] as string[];
    const hsnBySpareId = new Map<string, string>();
    const gstBySpareId = await loadSpareGstById(pool);
    if (spareIds.length > 0) {
      const hsnRes = await pool.query<{ id: string; hsn: string | null }>(
        `SELECT id::text, hsn FROM spares WHERE id = ANY($1::uuid[])`,
        [spareIds],
      );
      for (const row of hsnRes.rows) {
        const h = String(row.hsn ?? "").trim();
        if (h) hsnBySpareId.set(row.id, h);
      }
    }

    const gstResult = computeServiceBillGst({
      lines: lines.map((ln) => ({
        amountInr: billableLineAmount(natureOfRepair, ln.amountInr, ln.spareId),
        spareId: ln.spareId,
        hsnSac: ln.spareId ? hsnBySpareId.get(ln.spareId) ?? null : defaultSacHsn,
      })),
      defaultHsnSac: defaultSacHsn,
      spareHsnLookup: (id) => hsnBySpareId.get(id) ?? null,
      spareGstLookup: (id) => gstBySpareId.get(id) ?? null,
      defaultSacGstPercent: configuredGst,
      pricesTaxInclusive,
      natureOfRepair,
      sellerStateCode,
      customerStateCode,
      billTotalInr: subtotalInr,
    });

    const totalInr = customerPayableInr(
      subtotalInr,
      gstResult.totalTax,
      pricesTaxInclusive,
    );

    const paymentNorm = normalizePaymentForTotal(
      totalInr,
      String(req.body?.paymentMode ?? "Cash"),
      req.body?.paymentDetails,
    );
    if (!paymentNorm.ok) {
      res.status(400).json({ error: paymentNorm.error });
      return;
    }
    const paymentMode = paymentNorm.value.paymentMode;
    const paymentDetailsToStore: AdvancePaymentDetails = paymentNorm.value.paymentDetails;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // bill_number = QB reference: QB26CHN01001 (store-scoped) or QB26REG001 (region-scoped)
      // invoice_number = formatted store invoice number: CHN0126-27001 (shared sequence with SRF)
      const billNumber = await nextQuickBillNumber(client, regionId, storeId);
      const invoiceNumber = storeId
        ? await allocateStoreInvoiceNumber(client, storeId)
        : billNumber;

      if (storeId) {
        const storeCheck = await client.query(
          `SELECT 1 AS ok FROM stores WHERE id = $1::text AND region_id = $2::text`,
          [storeId, regionId],
        );
        if (storeCheck.rowCount === 0) {
          await client.query("ROLLBACK");
          res.status(400).json({ error: "storeId is not valid for the selected region." });
          return;
        }
      }

      const ins = await client.query(
        `INSERT INTO quick_bills (
           bill_number, invoice_number, region_id, store_id, customer_type, customer_id, customer_code,
           customer_name, phone, email,
           company, gst, pan, address, city, customer_billing_state, watch_brand, watch_family, watch_model, watch_ref, technician_id, technician_name,
           payment_mode, notes, watch_remark, case_type, strap_chain_type, nature_of_repair, chain_count, customer_remarks,
           warranty_status, watch_document_path, watch_image_path,
           total_inr, payment_details, created_by
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35::jsonb, $36)
         RETURNING id, created_at`,
        [
          billNumber,
          invoiceNumber,
          regionId,
          storeId,
          customerType,
          customerId,
          customerCode,
          customerName,
          phone,
          email,
          company,
          gst,
          pan,
          address,
          city,
          customerBillingState,
          watchBrand,
          watchFamily,
          watchModel,
          watchRef,
          technicianId,
          technicianName,
          paymentMode,
          notes,
          watchRemark,
          caseType,
          strapChainType,
          natureOfRepair,
          chainCount,
          customerRemarks,
          warrantyStatus,
          watchDocumentPath,
          watchImagePath,
          totalInr,
          JSON.stringify(paymentDetailsToStore),
          actor.id,
        ],
      );
      const billId = ins.rows[0].id as string;

      const captureSessionId = String(req.body?.captureSessionId ?? "").trim();
      if (captureSessionId) {
        await finalizeQuickBillCaptureSession(client, captureSessionId, billId);
      }

      for (const ln of lines) {
        await client.query(
          `INSERT INTO quick_bill_lines (quick_bill_id, line_no, description, amount_inr, spare_id, qty)
           VALUES ($1::uuid, $2, $3, $4, $5::uuid, $6)`,
          [billId, ln.lineNo, ln.description, ln.amountInr, ln.spareId, ln.qty],
        );
      }

      const spareUsage = new Map<string, number>();
      for (const ln of lines) {
        if (!ln.spareId) continue;
        spareUsage.set(ln.spareId, Number(spareUsage.get(ln.spareId) ?? 0) + Number(ln.qty));
      }
      if (spareUsage.size > 0) {
        const locationType: "HO" | "STORE" = storeId ? "STORE" : "HO";
        const locationKey = storeId ? `STORE:${regionId}:${storeId}` : `HO:${regionId}`;
        for (const [spareId, qty] of spareUsage.entries()) {
          const stock = await client.query<{ quantity: number }>(
            `SELECT quantity::float8 AS quantity
             FROM spare_stock
             WHERE spare_id = $1::uuid AND location_key = $2
             FOR UPDATE`,
            [spareId, locationKey],
          );
          const available = Number(stock.rows[0]?.quantity ?? 0);
          if (available < qty) {
            await client.query("ROLLBACK");
            res.status(400).json({
              error: `Insufficient stock for quick bill spare. Available ${available}, required ${qty}.`,
            });
            return;
          }
          await client.query(
            `UPDATE spare_stock
             SET quantity = quantity - $3, updated_at = now()
             WHERE spare_id = $1::uuid AND location_key = $2`,
            [spareId, locationKey, qty],
          );
          const bal = await client.query<{ quantity: number }>(
            `SELECT quantity::float8 AS quantity
             FROM spare_stock
             WHERE spare_id = $1::uuid AND location_key = $2`,
            [spareId, locationKey],
          );
          await appendStockHistory(client, {
            spareId,
            eventType: "TRANSFER_OUT",
            locationKey,
            locationType,
            regionId,
            storeId,
            quantityChange: -qty,
            balanceAfter: Number(bal.rows[0]?.quantity ?? 0),
            referenceType: "MANUAL",
            referenceNumber: billNumber,
            note: `Quick bill spare usage (${billNumber}).`,
            createdBy: actor.id,
          });
        }
      }

      if (persistNewWatchFamily) {
        const b = watchBrand.trim();
        const f = watchFamily.trim();
        if (b && f) {
          await client.query(
            `INSERT INTO watch_families_catalog (brand, family, brand_norm, family_norm, created_by)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (brand_norm, family_norm) DO NOTHING`,
            [b, f, b.toLowerCase(), f.toLowerCase(), actor.id],
          );
        }
      }

      if (persistNewWatchModel) {
        const b = watchBrand.trim();
        const m = watchModel.trim();
        const brandNorm = b.toLowerCase();
        const modelNorm = m.toLowerCase();
        if (b && m) {
          await client.query(
            `INSERT INTO watch_models_catalog (brand, model, brand_norm, model_norm, ref_hint, created_by)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (brand_norm, model_norm) DO NOTHING`,
            [b, m, brandNorm, modelNorm, watchRef, actor.id],
          );
        }
      }

      await client.query("COMMIT");

      const invoice = await loadQuickBillInvoiceById(pool, billId);
      if (!invoice) {
        res.status(500).json({ error: "Could not load saved quick bill." });
        return;
      }
      let edoc = null;
      if (edocEnabled() && customerType === "B2B") {
        edoc = await tryGenerateEinvoiceForQuickBill(pool, billId);
      }
      res.json({ invoice, edoc });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(e);
      const message =
        e instanceof Error && e.message.trim()
          ? e.message.trim()
          : "Could not save quick bill.";
      res.status(400).json({ error: message });
    } finally {
      client.release();
    }
  });
}
