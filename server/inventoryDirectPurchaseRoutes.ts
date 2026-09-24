import type { Express, NextFunction, Request, Response } from "express";
import type { Pool } from "pg";
import type { DemoUser } from "../src/types/user";
import { appendStockHistory } from "./db/stockHistory";
import { createMemoryUpload } from "./storage/multerMemory";
import { persistUploadedFile } from "./storage/fileStorage";
import path from "node:path";

const grnInvoiceUpload = createMemoryUpload(10 * 1024 * 1024);

type Authed = Request & { userId: string };

function canManageHoPurchase(actor: DemoUser | undefined | null): boolean {
  return (
    actor?.role === "super_admin" ||
    actor?.role === "admin" ||
    actor?.role === "ho_manager" ||
    actor?.role === "ho_purchase"
  );
}

function makeAlphaNumCode(input: string, fallback: string): string {
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (cleaned.slice(0, 3) || fallback).padEnd(3, "X");
}

async function nextDocNumber(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<{ last_value: number }> }> },
  prefix: string,
  suffix: string,
  scopeCode: string,
): Promise<string> {
  const yy = String(new Date().getFullYear()).slice(-2);
  const seq = await client.query(
    `INSERT INTO number_sequences (prefix, scope_code, year_2, last_value)
     VALUES ($1, $2, $3, 1001)
     ON CONFLICT (prefix, scope_code, year_2)
     DO UPDATE SET last_value = number_sequences.last_value + 1
     RETURNING last_value`,
    [prefix, scopeCode, yy],
  );
  const num = String(seq.rows[0]!.last_value).padStart(4, "0");
  return `${prefix}${yy}${scopeCode}${num}${suffix}`;
}

async function getPoSeries(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
): Promise<{ prefix: string; suffix: string }> {
  const { rows } = await client.query(
    `SELECT po_prefix AS prefix, po_suffix AS suffix FROM service_tax_settings WHERE id = 1`,
  );
  return {
    prefix: String(rows[0]?.prefix ?? "PO").trim() || "PO",
    suffix: String(rows[0]?.suffix ?? "").trim(),
  };
}

async function getGrnSeries(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
): Promise<{ prefix: string; suffix: string }> {
  const { rows } = await client.query(
    `SELECT grn_prefix AS prefix, grn_suffix AS suffix FROM service_tax_settings WHERE id = 1`,
  );
  return {
    prefix: String(rows[0]?.prefix ?? "GRN").trim() || "GRN",
    suffix: String(rows[0]?.suffix ?? "").trim(),
  };
}

function getVoucherSeries(): { prefix: string; suffix: string } {
  return { prefix: "VOU", suffix: "" };
}

function resolveRegionId(actor: DemoUser, requested: string): string | null {
  const regionId = requested.trim() || actor.regionId || "";
  if (!regionId) return null;
  if (actor.role === "super_admin") return regionId;
  if (actor.regionId && actor.regionId !== regionId) return null;
  return regionId;
}

export function registerInventoryDirectPurchaseRoutes(
  app: Express,
  pool: Pool,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
  getUserById: (id: string) => DemoUser | null,
): void {
  app.post("/api/inventory/pos/standalone", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    if (!canManageHoPurchase(actor)) {
      res.status(403).json({ error: "Only HO Purchase / HO Manager can create POs." });
      return;
    }
    const supplierId = String(req.body?.supplierId ?? "").trim();
    const notes = String(req.body?.notes ?? "").trim();
    const regionId = resolveRegionId(actor, String(req.body?.regionId ?? ""));
    const items = Array.isArray(req.body?.items)
      ? (req.body.items as Array<{
          spareId: string;
          qtyOrdered: number;
          unitPrice?: number;
          mrp?: number;
          gstRate?: number;
          cgstAmount?: number;
          sgstAmount?: number;
          igstAmount?: number;
          uom?: string;
          hsn?: string;
          brand?: string;
          partCode?: string;
          productName?: string;
        }>)
      : [];
    if (!supplierId || !regionId) {
      res.status(400).json({ error: "supplierId and regionId are required." });
      return;
    }
    if (items.length === 0) {
      res.status(400).json({ error: "At least one PO line is required." });
      return;
    }
    for (const it of items) {
      if (!it.spareId || Number.isNaN(Number(it.qtyOrdered)) || Number(it.qtyOrdered) <= 0) {
        res.status(400).json({ error: "Each line needs spareId and qtyOrdered > 0." });
        return;
      }
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const sup = await client.query("SELECT id FROM suppliers WHERE id = $1::uuid AND is_active = true", [supplierId]);
      if (sup.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Invalid or inactive supplier." });
        return;
      }
      const regionNameRes = await client.query<{ name: string }>("SELECT name FROM regions WHERE id = $1::text", [
        regionId,
      ]);
      if (regionNameRes.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Invalid region." });
        return;
      }
      const regionCode = makeAlphaNumCode(regionNameRes.rows[0]?.name ?? regionId, "REG");
      const poSeries = await getPoSeries(client);
      const poNumber = await nextDocNumber(client, poSeries.prefix, poSeries.suffix, regionCode);
      const insPo = await client.query<{ id: string }>(
        `INSERT INTO purchase_orders (po_number, supplier_id, pr_id, region_id, status, notes, created_by, modified_by)
         VALUES ($1, $2::uuid, NULL, $3, 'OPEN', $4, $5, $5)
         RETURNING id`,
        [poNumber, supplierId, regionId, notes, actor.id],
      );
      const poId = insPo.rows[0]!.id;
      for (const it of items) {
        const spare = await client.query(`SELECT id FROM spares WHERE id = $1::uuid`, [it.spareId]);
        if (spare.rowCount === 0) {
          await client.query("ROLLBACK");
          res.status(400).json({ error: "One or more spares were not found." });
          return;
        }
        await client.query(
          `INSERT INTO purchase_order_items (
             po_id, pr_item_id, spare_id, qty_ordered, unit_price,
             mrp, gst_rate, cgst_amount, sgst_amount, igst_amount, uom, hsn, brand,
             part_code, product_name,
             created_by, modified_by
           ) VALUES ($1::uuid, NULL, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15)`,
          [
            poId,
            it.spareId,
            Number(it.qtyOrdered),
            Number(it.unitPrice ?? 0) || 0,
            Number(it.mrp ?? 0) || 0,
            Number(it.gstRate ?? 0) || 0,
            Number(it.cgstAmount ?? 0) || 0,
            Number(it.sgstAmount ?? 0) || 0,
            Number(it.igstAmount ?? 0) || 0,
            String(it.uom ?? "Nos").trim() || "Nos",
            String(it.hsn ?? "").trim() || null,
            String(it.brand ?? "").trim() || null,
            String(it.partCode ?? "").trim() || null,
            String(it.productName ?? "").trim() || null,
            actor.id,
          ],
        );
      }
      await client.query("COMMIT");
      res.json({ ok: true, id: poId, poNumber });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(e);
      res.status(400).json({ error: "Could not create PO." });
    } finally {
      client.release();
    }
  });

  app.post("/api/inventory/vouchers", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    if (!canManageHoPurchase(actor)) {
      res.status(403).json({ error: "Only HO Purchase / HO Manager can create vouchers." });
      return;
    }
    const supplierId = String(req.body?.supplierId ?? "").trim();
    const notes = String(req.body?.notes ?? "").trim();
    const invoiceNumber = String(req.body?.invoiceNumber ?? "").trim();
    const invoiceDate = String(req.body?.invoiceDate ?? "").trim() || null;
    const regionId = resolveRegionId(actor, String(req.body?.regionId ?? ""));
    const items = Array.isArray(req.body?.items)
      ? (req.body.items as Array<{
          spareId: string;
          qtyOrdered: number;
          unitPrice?: number;
          mrp?: number;
          gstRate?: number;
          cgstAmount?: number;
          sgstAmount?: number;
          igstAmount?: number;
          uom?: string;
          hsn?: string;
          brand?: string;
          partCode?: string;
          productName?: string;
        }>)
      : [];
    if (!supplierId || !regionId) {
      res.status(400).json({ error: "supplierId and regionId are required." });
      return;
    }
    if (!invoiceNumber) {
      res.status(400).json({ error: "Invoice number is required." });
      return;
    }
    if (items.length === 0) {
      res.status(400).json({ error: "At least one voucher line is required." });
      return;
    }
    for (const it of items) {
      if (!it.spareId || Number.isNaN(Number(it.qtyOrdered)) || Number(it.qtyOrdered) <= 0) {
        res.status(400).json({ error: "Each line needs spareId and qtyOrdered > 0." });
        return;
      }
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const sup = await client.query("SELECT id FROM suppliers WHERE id = $1::uuid AND is_active = true", [supplierId]);
      if (sup.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Invalid or inactive supplier." });
        return;
      }
      const regionNameRes = await client.query<{ name: string }>("SELECT name FROM regions WHERE id = $1::text", [
        regionId,
      ]);
      if (regionNameRes.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Invalid region." });
        return;
      }
      const regionCode = makeAlphaNumCode(regionNameRes.rows[0]?.name ?? regionId, "REG");
      const voucherSeries = getVoucherSeries();
      const voucherNumber = await nextDocNumber(client, voucherSeries.prefix, voucherSeries.suffix, regionCode);
      const ins = await client.query<{ id: string }>(
        `INSERT INTO purchase_vouchers (
           voucher_number, supplier_id, region_id, invoice_number, invoice_date, status, notes, created_by, modified_by
         ) VALUES ($1, $2::uuid, $3, $4, $5, 'OPEN', $6, $7, $7)
         RETURNING id`,
        [voucherNumber, supplierId, regionId, invoiceNumber, invoiceDate, notes, actor.id],
      );
      const voucherId = ins.rows[0]!.id;
      for (const it of items) {
        const spare = await client.query(`SELECT id FROM spares WHERE id = $1::uuid`, [it.spareId]);
        if (spare.rowCount === 0) {
          await client.query("ROLLBACK");
          res.status(400).json({ error: "One or more spares were not found." });
          return;
        }
        await client.query(
          `INSERT INTO purchase_voucher_items (
             voucher_id, spare_id, qty_ordered, unit_price,
             mrp, gst_rate, cgst_amount, sgst_amount, igst_amount, uom, hsn, brand,
             part_code, product_name, created_by, modified_by
           ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15)`,
          [
            voucherId,
            it.spareId,
            Number(it.qtyOrdered),
            Number(it.unitPrice ?? 0) || 0,
            Number(it.mrp ?? 0) || 0,
            Number(it.gstRate ?? 0) || 0,
            Number(it.cgstAmount ?? 0) || 0,
            Number(it.sgstAmount ?? 0) || 0,
            Number(it.igstAmount ?? 0) || 0,
            String(it.uom ?? "Nos").trim() || "Nos",
            String(it.hsn ?? "").trim() || null,
            String(it.brand ?? "").trim() || null,
            String(it.partCode ?? "").trim() || null,
            String(it.productName ?? "").trim() || null,
            actor.id,
          ],
        );
      }
      await client.query("COMMIT");
      res.json({ ok: true, id: voucherId, voucherNumber });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(e);
      res.status(400).json({ error: "Could not create voucher." });
    } finally {
      client.release();
    }
  });

  app.get("/api/inventory/vouchers", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    if (!canManageHoPurchase(actor)) {
      res.status(403).json({ error: "Only HO users can view purchase vouchers." });
      return;
    }
    try {
      const params: unknown[] = [];
      let where = "";
      if ((actor.role === "admin" || actor.role === "ho_manager" || actor.role === "ho_purchase") && actor.regionId) {
        params.push(actor.regionId);
        where = "WHERE v.region_id = $1::text";
      }
      const { rows } = await pool.query(
        `SELECT v.id,
                v.voucher_number AS "voucherNumber",
                v.supplier_id AS "supplierId",
                s.name AS "supplierName",
                v.region_id AS "regionId",
                rg.name AS "regionName",
                v.invoice_number AS "invoiceNumber",
                v.invoice_date::text AS "invoiceDate",
                v.status,
                v.notes,
                v.created_at AS "createdAt",
                v.updated_at AS "updatedAt",
                COALESCE(
                  json_agg(
                    json_build_object(
                      'id', vi.id,
                      'spareId', vi.spare_id,
                      'qtyOrdered', vi.qty_ordered::float8,
                      'unitPrice', vi.unit_price::float8,
                      'receivedQty', vi.received_qty::float8,
                      'mrp', COALESCE(vi.mrp, 0)::float8,
                      'gstRate', COALESCE(vi.gst_rate, 0)::float8,
                      'cgstAmount', COALESCE(vi.cgst_amount, 0)::float8,
                      'sgstAmount', COALESCE(vi.sgst_amount, 0)::float8,
                      'igstAmount', COALESCE(vi.igst_amount, 0)::float8,
                      'uom', COALESCE(NULLIF(vi.uom, ''), 'Nos'),
                      'hsn', vi.hsn,
                      'brand', vi.brand,
                      'partCode', vi.part_code,
                      'productName', vi.product_name
                    )
                  ) FILTER (WHERE vi.id IS NOT NULL),
                  '[]'::json
                ) AS items
         FROM purchase_vouchers v
         JOIN suppliers s ON s.id = v.supplier_id
         JOIN regions rg ON rg.id = v.region_id
         LEFT JOIN purchase_voucher_items vi ON vi.voucher_id = v.id
         ${where}
         GROUP BY v.id, s.name, rg.name
         ORDER BY v.created_at DESC`,
        params,
      );
      res.json({ vouchers: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to load purchase vouchers." });
    }
  });

  app.post(
    "/api/inventory/grns/against-voucher",
    requireAuth,
    (req: Request, res: Response, next: NextFunction) => {
      const ct = req.headers["content-type"] ?? "";
      if (ct.includes("multipart/form-data")) {
        grnInvoiceUpload.single("invoiceFile")(req, res, next);
      } else {
        next();
      }
    },
    async (req: Request, res: Response) => {
      const actor = getUserById((req as Authed).userId);
      if (!actor) {
        res.status(401).json({ error: "Invalid session." });
        return;
      }
      if (!canManageHoPurchase(actor)) {
        res.status(403).json({ error: "Only HO Purchase / HO Manager can post GRN." });
        return;
      }
      const voucherId = String(req.body?.voucherId ?? "").trim();
      const notes = String(req.body?.notes ?? "").trim();
      const uploadFile = (req as Request & { file?: Express.Multer.File }).file;
      let invoiceFilePath: string | null = null;
      if (uploadFile?.buffer?.length) {
        const ext = path.extname(uploadFile.originalname || "").toLowerCase();
        const allowed = [".pdf", ".doc", ".docx"];
        if (!allowed.includes(ext)) {
          res.status(400).json({ error: "GRN document must be PDF or DOC. Images are not allowed." });
          return;
        }
        invoiceFilePath = await persistUploadedFile({
          category: "customer-documents",
          buffer: uploadFile.buffer,
          originalName: uploadFile.originalname || `grn-invoice${ext || ".pdf"}`,
          mime: uploadFile.mimetype || "application/octet-stream",
          fallbackExt: ext || ".pdf",
        });
      }
      let rawItems = req.body?.items;
      if (typeof rawItems === "string") {
        try {
          rawItems = JSON.parse(rawItems);
        } catch {
          rawItems = [];
        }
      }
      const items = Array.isArray(rawItems)
        ? (rawItems as Array<{
            voucherItemId: string;
            spareId: string;
            qtyReceived: number;
            costPrice?: number;
            gstRate?: number;
            taxAmount?: number;
          }>)
        : [];
      if (!voucherId) {
        res.status(400).json({ error: "voucherId is required." });
        return;
      }
      if (items.length === 0) {
        res.status(400).json({ error: "At least one inward line is required." });
        return;
      }
      for (const it of items) {
        if (
          !it.voucherItemId ||
          !it.spareId ||
          Number.isNaN(Number(it.qtyReceived)) ||
          Number(it.qtyReceived) <= 0
        ) {
          res.status(400).json({ error: "Each line needs voucherItemId, spareId and qtyReceived > 0." });
          return;
        }
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const voucherRes = await client.query<{
          id: string;
          voucher_number: string;
          supplier_id: string;
          region_id: string;
          status: string;
          invoice_number: string | null;
          invoice_date: string | null;
        }>(
          `SELECT id, voucher_number, supplier_id, region_id, status, invoice_number, invoice_date::text
           FROM purchase_vouchers
           WHERE id = $1::uuid
           FOR UPDATE`,
          [voucherId],
        );
        const voucher = voucherRes.rows[0];
        if (!voucher) {
          await client.query("ROLLBACK");
          res.status(404).json({ error: "Voucher not found." });
          return;
        }
        if (actor.role !== "super_admin" && actor.regionId && actor.regionId !== voucher.region_id) {
          await client.query("ROLLBACK");
          res.status(403).json({ error: "Voucher is outside your region." });
          return;
        }
        if (voucher.status === "CANCELLED" || voucher.status === "CLOSED") {
          await client.query("ROLLBACK");
          res.status(400).json({ error: `Cannot inward voucher in status ${voucher.status}.` });
          return;
        }

        const regionNameRes = await client.query<{ name: string }>(
          "SELECT name FROM regions WHERE id = $1::text",
          [voucher.region_id],
        );
        const regionCode = makeAlphaNumCode(regionNameRes.rows[0]?.name ?? voucher.region_id, "REG");
        const grnSeries = await getGrnSeries(client);
        const grnNumber = await nextDocNumber(client, grnSeries.prefix, grnSeries.suffix, regionCode);
        const ins = await client.query<{ id: string }>(
          `INSERT INTO grns (
             grn_number, po_id, voucher_id, supplier_id, region_id,
             invoice_number, invoice_date, mode, notes, invoice_file_path, created_by, modified_by
           ) VALUES ($1, NULL, $2::uuid, $3::uuid, $4, $5, $6, 'WITHOUT_BILL', $7, $8, $9, $9)
           RETURNING id`,
          [
            grnNumber,
            voucherId,
            voucher.supplier_id,
            voucher.region_id,
            voucher.invoice_number,
            voucher.invoice_date,
            notes,
            invoiceFilePath,
            actor.id,
          ],
        );
        const grnId = ins.rows[0]!.id;
        let moved = 0;

        for (const it of items) {
          const row = await client.query<{
            id: string;
            spare_id: string;
            qty_ordered: number;
            received_qty: number;
          }>(
            `SELECT id, spare_id, qty_ordered::float8, received_qty::float8
             FROM purchase_voucher_items
             WHERE id = $1::uuid AND voucher_id = $2::uuid
             FOR UPDATE`,
            [it.voucherItemId, voucherId],
          );
          const line = row.rows[0];
          if (!line) {
            await client.query("ROLLBACK");
            res.status(400).json({ error: "Voucher item does not belong to selected voucher." });
            return;
          }
          if (String(line.spare_id) !== it.spareId) {
            await client.query("ROLLBACK");
            res.status(400).json({ error: "Spare mismatch on voucher line." });
            return;
          }
          const qty = Number(it.qtyReceived);
          const remaining = Math.max(0, line.qty_ordered - line.received_qty);
          if (qty > remaining) {
            await client.query("ROLLBACK");
            res.status(400).json({ error: `Received qty exceeds pending qty for a line (pending ${remaining}).` });
            return;
          }
          const costPrice = Number(it.costPrice ?? 0) || 0;
          const gstRate = Number(it.gstRate ?? 18) || 18;
          const taxAmount = Number(it.taxAmount ?? 0) || 0;
          await client.query(
            `INSERT INTO grn_items (
               grn_id, po_item_id, voucher_item_id, spare_id, qty_received,
               cost_price, gst_rate, tax_amount, created_by, modified_by
             ) VALUES ($1::uuid, NULL, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $8)`,
            [grnId, it.voucherItemId, it.spareId, qty, costPrice, gstRate, taxAmount, actor.id],
          );
          if (costPrice > 0) {
            await client.query(`UPDATE spares SET cost_price_inr = $1, updated_at = now() WHERE id = $2::uuid`, [
              costPrice,
              it.spareId,
            ]);
          }
          await client.query(
            `UPDATE purchase_voucher_items
             SET received_qty = received_qty + $1, modified_by = $3
             WHERE id = $2::uuid`,
            [qty, it.voucherItemId, actor.id],
          );
          await client.query(
            `INSERT INTO spare_stock (spare_id, location_key, location_type, region_id, store_id, quantity)
             VALUES ($1::uuid, $2, 'HO', $3, NULL, $4)
             ON CONFLICT (spare_id, location_key)
             DO UPDATE SET quantity = spare_stock.quantity + EXCLUDED.quantity, updated_at = now()`,
            [it.spareId, `HO:${voucher.region_id}`, voucher.region_id, qty],
          );
          const hoAfter = await client.query<{ qty: number }>(
            `SELECT quantity::float8 AS qty FROM spare_stock WHERE spare_id = $1::uuid AND location_key = $2`,
            [it.spareId, `HO:${voucher.region_id}`],
          );
          await appendStockHistory(client, {
            spareId: it.spareId,
            eventType: "PURCHASE_IN",
            locationKey: `HO:${voucher.region_id}`,
            locationType: "HO",
            regionId: voucher.region_id,
            quantityChange: qty,
            balanceAfter: hoAfter.rows[0]?.qty ?? null,
            referenceType: "GRN",
            referenceNumber: grnNumber,
            note: `Purchase inward posted against voucher ${voucher.voucher_number}.`,
            createdBy: actor.id,
          });
          moved += qty;
        }

        const sum = await client.query<{ ordered: number; received: number }>(
          `SELECT COALESCE(SUM(qty_ordered), 0)::float8 AS ordered,
                  COALESCE(SUM(received_qty), 0)::float8 AS received
           FROM purchase_voucher_items
           WHERE voucher_id = $1::uuid`,
          [voucherId],
        );
        const ordered = sum.rows[0]?.ordered ?? 0;
        const received = sum.rows[0]?.received ?? 0;
        const nextStatus = received >= ordered && ordered > 0 ? "CLOSED" : received > 0 ? "PARTIAL" : "OPEN";
        await client.query(
          `UPDATE purchase_vouchers SET status = $1, modified_by = $2, updated_at = now() WHERE id = $3::uuid`,
          [nextStatus, actor.id, voucherId],
        );
        await client.query("COMMIT");
        res.json({
          ok: true,
          id: grnId,
          grnNumber,
          movedQty: moved,
          voucherStatus: nextStatus,
        });
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        console.error(e);
        res.status(400).json({ error: "Could not post GRN against voucher." });
      } finally {
        client.release();
      }
    },
  );

  app.get("/api/inventory/ho-stock", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    if (!canManageHoPurchase(actor)) {
      res.status(403).json({ error: "Only HO users can view HO stock for transfer." });
      return;
    }
    const regionId = resolveRegionId(actor, String(req.query.regionId ?? ""));
    if (!regionId) {
      res.status(400).json({ error: "regionId is required." });
      return;
    }
    try {
      const { rows } = await pool.query<{
        spareId: string;
        sku: string;
        name: string;
        qty: number;
      }>(
        `SELECT ss.spare_id AS "spareId",
                s.sku,
                s.name,
                ss.quantity::float8 AS qty
         FROM spare_stock ss
         JOIN spares s ON s.id = ss.spare_id
         WHERE ss.location_key = $1 AND ss.quantity > 0
         ORDER BY s.name`,
        [`HO:${regionId}`],
      );
      res.json({ rows, regionId });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not load HO stock." });
    }
  });

  app.post(
    "/api/inventory/grns/standalone",
    requireAuth,
    (req: Request, res: Response, next: NextFunction) => {
      const ct = req.headers["content-type"] ?? "";
      if (ct.includes("multipart/form-data")) {
        grnInvoiceUpload.single("invoiceFile")(req, res, next);
      } else {
        next();
      }
    },
    async (req: Request, res: Response) => {
      const actor = getUserById((req as Authed).userId);
      if (!actor) {
        res.status(401).json({ error: "Invalid session." });
        return;
      }
      if (!canManageHoPurchase(actor)) {
        res.status(403).json({ error: "Only HO Purchase / HO Manager can post GRN." });
        return;
      }
      const supplierId = String(req.body?.supplierId ?? "").trim();
      const regionId = resolveRegionId(actor, String(req.body?.regionId ?? ""));
      const mode = String(req.body?.mode ?? "").toUpperCase();
      const invoiceNumber = String(req.body?.invoiceNumber ?? "").trim() || null;
      const invoiceDate = String(req.body?.invoiceDate ?? "").trim() || null;
      const notes = String(req.body?.notes ?? "").trim();
      const uploadFile = (req as Request & { file?: Express.Multer.File }).file;
      let invoiceFilePath: string | null = null;
      if (uploadFile?.buffer?.length) {
        const ext = path.extname(uploadFile.originalname || "").toLowerCase();
        const allowed = [".pdf", ".doc", ".docx"];
        if (!allowed.includes(ext)) {
          res.status(400).json({ error: "GRN document must be PDF or DOC. Images are not allowed." });
          return;
        }
        invoiceFilePath = await persistUploadedFile({
          category: "customer-documents",
          buffer: uploadFile.buffer,
          originalName: uploadFile.originalname || `grn-invoice${ext || ".pdf"}`,
          mime: uploadFile.mimetype || "application/octet-stream",
          fallbackExt: ext || ".pdf",
        });
      }
      let rawItems = req.body?.items;
      if (typeof rawItems === "string") {
        try {
          rawItems = JSON.parse(rawItems);
        } catch {
          rawItems = [];
        }
      }
      const items = Array.isArray(rawItems)
        ? (rawItems as Array<{ spareId: string; qtyReceived: number; costPrice?: number; gstRate?: number; taxAmount?: number }>)
        : [];
      if (!supplierId || !regionId) {
        res.status(400).json({ error: "supplierId and regionId are required." });
        return;
      }
      if (mode !== "WITH_BILL" && mode !== "WITHOUT_BILL") {
        res.status(400).json({ error: "mode is required." });
        return;
      }
      if (mode === "WITH_BILL" && !invoiceNumber) {
        res.status(400).json({ error: "Invoice number is required for GRN against vendor invoice." });
        return;
      }
      if (items.length === 0) {
        res.status(400).json({ error: "At least one inward line is required." });
        return;
      }
      for (const it of items) {
        if (!it.spareId || Number.isNaN(Number(it.qtyReceived)) || Number(it.qtyReceived) <= 0) {
          res.status(400).json({ error: "Each line needs spareId and qtyReceived > 0." });
          return;
        }
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const sup = await client.query("SELECT id FROM suppliers WHERE id = $1::uuid AND is_active = true", [supplierId]);
        if (sup.rowCount === 0) {
          await client.query("ROLLBACK");
          res.status(400).json({ error: "Invalid or inactive supplier." });
          return;
        }
        const regionNameRes = await client.query<{ name: string }>("SELECT name FROM regions WHERE id = $1::text", [
          regionId,
        ]);
        if (regionNameRes.rowCount === 0) {
          await client.query("ROLLBACK");
          res.status(400).json({ error: "Invalid region." });
          return;
        }
        const regionCode = makeAlphaNumCode(regionNameRes.rows[0]?.name ?? regionId, "REG");
        const grnSeries = await getGrnSeries(client);
        const grnNumber = await nextDocNumber(client, grnSeries.prefix, grnSeries.suffix, regionCode);
        const ins = await client.query<{ id: string }>(
          `INSERT INTO grns (grn_number, po_id, supplier_id, region_id, invoice_number, invoice_date, mode, notes, invoice_file_path, created_by, modified_by)
           VALUES ($1, NULL, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $9)
           RETURNING id`,
          [grnNumber, supplierId, regionId, invoiceNumber, invoiceDate, mode, notes, invoiceFilePath, actor.id],
        );
        const grnId = ins.rows[0]!.id;
        let moved = 0;
        for (const it of items) {
          const spare = await client.query(`SELECT id FROM spares WHERE id = $1::uuid`, [it.spareId]);
          if (spare.rowCount === 0) {
            await client.query("ROLLBACK");
            res.status(400).json({ error: "One or more spares were not found." });
            return;
          }
          const qty = Number(it.qtyReceived);
          const costPrice = Number(it.costPrice ?? 0) || 0;
          const gstRate = Number(it.gstRate ?? 18) || 18;
          const taxAmount = Number(it.taxAmount ?? 0) || 0;
          await client.query(
            `INSERT INTO grn_items (grn_id, po_item_id, spare_id, qty_received, cost_price, gst_rate, tax_amount, created_by, modified_by)
             VALUES ($1::uuid, NULL, $2::uuid, $3, $4, $5, $6, $7, $7)`,
            [grnId, it.spareId, qty, costPrice, gstRate, taxAmount, actor.id],
          );
          if (costPrice > 0) {
            await client.query(`UPDATE spares SET cost_price_inr = $1, updated_at = now() WHERE id = $2::uuid`, [
              costPrice,
              it.spareId,
            ]);
          }
          await client.query(
            `INSERT INTO spare_stock (spare_id, location_key, location_type, region_id, store_id, quantity)
             VALUES ($1::uuid, $2, 'HO', $3, NULL, $4)
             ON CONFLICT (spare_id, location_key)
             DO UPDATE SET quantity = spare_stock.quantity + EXCLUDED.quantity, updated_at = now()`,
            [it.spareId, `HO:${regionId}`, regionId, qty],
          );
          const hoAfter = await client.query<{ qty: number }>(
            `SELECT quantity::float8 AS qty FROM spare_stock WHERE spare_id = $1::uuid AND location_key = $2`,
            [it.spareId, `HO:${regionId}`],
          );
          await appendStockHistory(client, {
            spareId: it.spareId,
            eventType: "PURCHASE_IN",
            locationKey: `HO:${regionId}`,
            locationType: "HO",
            regionId,
            quantityChange: qty,
            balanceAfter: hoAfter.rows[0]?.qty ?? null,
            referenceType: "GRN",
            referenceNumber: grnNumber,
            note: "Direct GRN .",
            createdBy: actor.id,
          });
          moved += qty;
        }
        await client.query("COMMIT");
        res.json({ ok: true, id: grnId, grnNumber, movedQty: moved, poStatus: null });
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        console.error(e);
        res.status(400).json({ error: "Could not post GRN." });
      } finally {
        client.release();
      }
    },
  );

  app.get("/api/inventory/grns/pending-transfer", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    if (!canManageHoPurchase(actor)) {
      res.status(403).json({ error: "Only HO users can transfer against GRN." });
      return;
    }
    const regionId = resolveRegionId(actor, String(req.query.regionId ?? ""));
    if (!regionId) {
      res.status(400).json({ error: "regionId is required." });
      return;
    }
    try {
      const { rows } = await pool.query(
        `SELECT g.id,
                g.grn_number AS "grnNumber",
                g.po_id AS "poId",
                po.po_number AS "poNumber",
                g.supplier_id AS "supplierId",
                s.name AS "supplierName",
                g.region_id AS "regionId",
                g.created_at AS "createdAt",
                COALESCE(
                  json_agg(
                    json_build_object(
                      'id', gi.id,
                      'spareId', gi.spare_id,
                      'sku', sp.sku,
                      'name', sp.name,
                      'qtyReceived', gi.qty_received::float8,
                      'qtyTransferred', COALESCE(gi.qty_transferred, 0)::float8,
                      'qtyReturned', COALESCE(gi.qty_returned, 0)::float8,
                      'qtyPending', GREATEST(gi.qty_received - COALESCE(gi.qty_transferred, 0) - COALESCE(gi.qty_returned, 0), 0)::float8,
                      'hoAvailable', COALESCE(ss.quantity, 0)::float8
                    )
                    ORDER BY sp.name
                  ) FILTER (WHERE gi.id IS NOT NULL),
                  '[]'::json
                ) AS items
         FROM grns g
         JOIN suppliers s ON s.id = g.supplier_id
         LEFT JOIN purchase_orders po ON po.id = g.po_id
         JOIN grn_items gi ON gi.grn_id = g.id
         JOIN spares sp ON sp.id = gi.spare_id
         LEFT JOIN spare_stock ss ON ss.spare_id = gi.spare_id AND ss.location_key = $2
         WHERE g.region_id = $1
           AND EXISTS (
             SELECT 1 FROM grn_items x
             WHERE x.grn_id = g.id
               AND (x.qty_received - COALESCE(x.qty_transferred, 0) - COALESCE(x.qty_returned, 0)) > 0
           )
         GROUP BY g.id, po.po_number, s.name
         ORDER BY g.created_at DESC`,
        [regionId, `HO:${regionId}`],
      );
      res.json({ grns: rows, regionId });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not load GRNs pending transfer." });
    }
  });

  app.post("/api/inventory/transfers/against-grn", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    if (!canManageHoPurchase(actor)) {
      res.status(403).json({ error: "Only HO Purchase / HO Manager can transfer from HO." });
      return;
    }
    const grnId = String(req.body?.grnId ?? "").trim();
    const storeId = String(req.body?.storeId ?? "").trim();
    const notes = String(req.body?.notes ?? "").trim();
    const items = Array.isArray(req.body?.items)
      ? (req.body.items as Array<{ grnItemId: string; qty: number }>)
      : [];
    if (!grnId || !storeId) {
      res.status(400).json({ error: "grnId and storeId are required." });
      return;
    }
    const selected = items
      .map((it) => ({ grnItemId: String(it.grnItemId ?? "").trim(), qty: Number(it.qty) }))
      .filter((it) => it.grnItemId && !Number.isNaN(it.qty) && it.qty > 0);
    if (selected.length === 0) {
      res.status(400).json({ error: "Check at least one spare and enter a quantity to transfer." });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const grn = await client.query<{
        id: string;
        grn_number: string;
        region_id: string;
      }>(`SELECT id, grn_number, region_id FROM grns WHERE id = $1::uuid FOR UPDATE`, [grnId]);
      if (grn.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "GRN not found." });
        return;
      }
      const regionId = resolveRegionId(actor, grn.rows[0]!.region_id);
      if (!regionId) {
        await client.query("ROLLBACK");
        res.status(403).json({ error: "GRN is outside your region." });
        return;
      }
      const store = await client.query<{ id: string; name: string }>(
        `SELECT id, name FROM stores WHERE id = $1::text AND region_id = $2::text`,
        [storeId, regionId],
      );
      if (store.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Store does not belong to the GRN region." });
        return;
      }
      const regionNameRes = await client.query<{ name: string }>("SELECT name FROM regions WHERE id = $1::text", [
        regionId,
      ]);
      const regionCode = makeAlphaNumCode(regionNameRes.rows[0]?.name ?? regionId, "REG");
      const transferNumber = await nextDocNumber(client, "TRF", "", regionCode);
      const hoKey = `HO:${regionId}`;
      const storeKey = `STORE:${regionId}:${storeId}`;
      let moved = 0;

      for (const line of selected) {
        const gi = await client.query<{
          id: string;
          spare_id: string;
          qty_received: number;
          qty_transferred: number;
          qty_returned: number;
        }>(
          `SELECT id, spare_id, qty_received::float8 AS qty_received,
                  COALESCE(qty_transferred, 0)::float8 AS qty_transferred,
                  COALESCE(qty_returned, 0)::float8 AS qty_returned
           FROM grn_items
           WHERE id = $1::uuid AND grn_id = $2::uuid
           FOR UPDATE`,
          [line.grnItemId, grnId],
        );
        if (gi.rowCount === 0) {
          await client.query("ROLLBACK");
          res.status(400).json({ error: "One or more GRN lines do not belong to this GRN." });
          return;
        }
        const pending = Math.max(0, gi.rows[0]!.qty_received - gi.rows[0]!.qty_transferred - gi.rows[0]!.qty_returned);
        if (line.qty > pending) {
          await client.query("ROLLBACK");
          res.status(400).json({ error: "Transfer qty exceeds remaining GRN qty on one or more lines." });
          return;
        }
        const ho = await client.query<{ qty: number }>(
          `SELECT quantity::float8 AS qty FROM spare_stock WHERE spare_id = $1::uuid AND location_key = $2 FOR UPDATE`,
          [gi.rows[0]!.spare_id, hoKey],
        );
        const available = ho.rows[0]?.qty ?? 0;
        if (line.qty > available) {
          await client.query("ROLLBACK");
          res.status(400).json({ error: "Requested quantity exceeds HO available stock for one or more lines." });
          return;
        }
        await client.query(
          `UPDATE grn_items SET qty_transferred = qty_transferred + $1 WHERE id = $2::uuid`,
          [line.qty, line.grnItemId],
        );
        await client.query(
          `UPDATE spare_stock SET quantity = GREATEST(quantity - $1, 0), updated_at = now()
           WHERE spare_id = $2::uuid AND location_key = $3`,
          [line.qty, gi.rows[0]!.spare_id, hoKey],
        );
        const hoAfter = await client.query<{ qty: number }>(
          `SELECT quantity::float8 AS qty FROM spare_stock WHERE spare_id = $1::uuid AND location_key = $2`,
          [gi.rows[0]!.spare_id, hoKey],
        );
        await client.query(
          `INSERT INTO spare_stock (spare_id, location_key, location_type, region_id, store_id, quantity)
           VALUES ($1::uuid, $2, 'STORE', $3, $4, $5)
           ON CONFLICT (spare_id, location_key)
           DO UPDATE SET quantity = spare_stock.quantity + EXCLUDED.quantity, updated_at = now()`,
          [gi.rows[0]!.spare_id, storeKey, regionId, storeId, line.qty],
        );
        const storeAfter = await client.query<{ qty: number }>(
          `SELECT quantity::float8 AS qty FROM spare_stock WHERE spare_id = $1::uuid AND location_key = $2`,
          [gi.rows[0]!.spare_id, storeKey],
        );
        const spareId = gi.rows[0]!.spare_id;
        await appendStockHistory(client, {
          spareId,
          eventType: "TRANSFER_OUT",
          locationKey: hoKey,
          locationType: "HO",
          regionId,
          quantityChange: -line.qty,
          balanceAfter: hoAfter.rows[0]?.qty ?? null,
          referenceType: "GRN",
          referenceNumber: `${grn.rows[0]!.grn_number} / ${transferNumber}`,
          note: notes || `Transferred against GRN ${grn.rows[0]!.grn_number} to ${store.rows[0]!.name}.`,
          createdBy: actor.id,
        });
        await appendStockHistory(client, {
          spareId,
          eventType: "TRANSFER_IN",
          locationKey: storeKey,
          locationType: "STORE",
          regionId,
          storeId,
          quantityChange: line.qty,
          balanceAfter: storeAfter.rows[0]?.qty ?? null,
          referenceType: "GRN",
          referenceNumber: `${grn.rows[0]!.grn_number} / ${transferNumber}`,
          note: notes || `Received against GRN ${grn.rows[0]!.grn_number} at ${store.rows[0]!.name}.`,
          createdBy: actor.id,
        });
        moved += line.qty;
      }

      await client.query("COMMIT");
      const remain = await pool.query<{ pending: number }>(
        `SELECT COALESCE(SUM(GREATEST(qty_received - COALESCE(qty_transferred, 0) - COALESCE(qty_returned, 0), 0)), 0)::float8 AS pending
         FROM grn_items WHERE grn_id = $1::uuid`,
        [grnId],
      );
      res.json({
        ok: true,
        transferNumber,
        movedQty: moved,
        storeName: store.rows[0]!.name,
        grnNumber: grn.rows[0]!.grn_number,
        remainingQty: remain.rows[0]?.pending ?? 0,
      });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(e);
      res.status(400).json({ error: "Could not transfer against GRN." });
    } finally {
      client.release();
    }
  });

  app.post("/api/inventory/transfers/ho-to-store", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    if (!canManageHoPurchase(actor)) {
      res.status(403).json({ error: "Only HO Purchase / HO Manager can transfer from HO." });
      return;
    }
    const regionId = resolveRegionId(actor, String(req.body?.regionId ?? ""));
    const storeId = String(req.body?.storeId ?? "").trim();
    const notes = String(req.body?.notes ?? "").trim();
    const grnId = String(req.body?.grnId ?? "").trim();
    const items = Array.isArray(req.body?.items)
      ? (req.body.items as Array<{ spareId: string; qty: number; grnItemId?: string }>)
      : [];
    if (!regionId || !storeId) {
      res.status(400).json({ error: "regionId and storeId are required." });
      return;
    }
    const selected = items
      .map((it) => ({
        spareId: String(it.spareId ?? "").trim(),
        qty: Number(it.qty),
        grnItemId: String(it.grnItemId ?? "").trim(),
      }))
      .filter((it) => it.spareId && !Number.isNaN(it.qty) && it.qty > 0);
    if (selected.length === 0) {
      res.status(400).json({ error: "Check at least one line and enter a quantity." });
      return;
    }
    if (selected.some((it) => it.grnItemId) && !grnId) {
      res.status(400).json({ error: "GRN is required when transferring GRN lines." });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const store = await client.query<{ id: string; name: string }>(
        `SELECT id, name FROM stores WHERE id = $1::text AND region_id = $2::text`,
        [storeId, regionId],
      );
      if (store.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Store does not belong to the selected region." });
        return;
      }
      let grnNumber: string | null = null;
      if (grnId) {
        const grn = await client.query<{ id: string; grn_number: string; region_id: string }>(
          `SELECT id, grn_number, region_id FROM grns WHERE id = $1::uuid FOR UPDATE`,
          [grnId],
        );
        if (grn.rowCount === 0) {
          await client.query("ROLLBACK");
          res.status(404).json({ error: "GRN not found." });
          return;
        }
        if (grn.rows[0]!.region_id !== regionId) {
          await client.query("ROLLBACK");
          res.status(400).json({ error: "GRN does not belong to the selected region." });
          return;
        }
        grnNumber = grn.rows[0]!.grn_number;
      }
      const regionNameRes = await client.query<{ name: string }>("SELECT name FROM regions WHERE id = $1::text", [
        regionId,
      ]);
      const regionCode = makeAlphaNumCode(regionNameRes.rows[0]?.name ?? regionId, "REG");
      const transferNumber = await nextDocNumber(client, "TRF", "", regionCode);
      const hoKey = `HO:${regionId}`;
      const storeKey = `STORE:${regionId}:${storeId}`;
      let moved = 0;

      for (const line of selected) {
        if (line.grnItemId) {
          const gi = await client.query<{
            spare_id: string;
            qty_received: number;
            qty_transferred: number;
            qty_returned: number;
          }>(
            `SELECT spare_id, qty_received::float8 AS qty_received,
                    COALESCE(qty_transferred, 0)::float8 AS qty_transferred,
                    COALESCE(qty_returned, 0)::float8 AS qty_returned
             FROM grn_items
             WHERE id = $1::uuid AND grn_id = $2::uuid
             FOR UPDATE`,
            [line.grnItemId, grnId],
          );
          if (gi.rowCount === 0) {
            await client.query("ROLLBACK");
            res.status(400).json({ error: "One or more GRN lines do not belong to this GRN." });
            return;
          }
          if (gi.rows[0]!.spare_id !== line.spareId) {
            await client.query("ROLLBACK");
            res.status(400).json({ error: "GRN line spare does not match." });
            return;
          }
          const pending = Math.max(0, gi.rows[0]!.qty_received - gi.rows[0]!.qty_transferred - gi.rows[0]!.qty_returned);
          if (line.qty > pending) {
            await client.query("ROLLBACK");
            res.status(400).json({ error: "Transfer qty exceeds remaining GRN qty on one or more lines." });
            return;
          }
          await client.query(`UPDATE grn_items SET qty_transferred = qty_transferred + $1 WHERE id = $2::uuid`, [
            line.qty,
            line.grnItemId,
          ]);
        }
        const ho = await client.query<{ qty: number }>(
          `SELECT quantity::float8 AS qty FROM spare_stock WHERE spare_id = $1::uuid AND location_key = $2 FOR UPDATE`,
          [line.spareId, hoKey],
        );
        const available = ho.rows[0]?.qty ?? 0;
        if (line.qty > available) {
          await client.query("ROLLBACK");
          res.status(400).json({ error: "Requested quantity exceeds HO available stock for one or more lines." });
          return;
        }
        await client.query(
          `UPDATE spare_stock SET quantity = GREATEST(quantity - $1, 0), updated_at = now()
           WHERE spare_id = $2::uuid AND location_key = $3`,
          [line.qty, line.spareId, hoKey],
        );
        const hoAfter = await client.query<{ qty: number }>(
          `SELECT quantity::float8 AS qty FROM spare_stock WHERE spare_id = $1::uuid AND location_key = $2`,
          [line.spareId, hoKey],
        );
        await client.query(
          `INSERT INTO spare_stock (spare_id, location_key, location_type, region_id, store_id, quantity)
           VALUES ($1::uuid, $2, 'STORE', $3, $4, $5)
           ON CONFLICT (spare_id, location_key)
           DO UPDATE SET quantity = spare_stock.quantity + EXCLUDED.quantity, updated_at = now()`,
          [line.spareId, storeKey, regionId, storeId, line.qty],
        );
        const storeAfter = await client.query<{ qty: number }>(
          `SELECT quantity::float8 AS qty FROM spare_stock WHERE spare_id = $1::uuid AND location_key = $2`,
          [line.spareId, storeKey],
        );
        const againstGrn = Boolean(line.grnItemId && grnNumber);
        const refType = againstGrn ? "GRN" : "TRANSFER";
        const refNumber = againstGrn ? `${grnNumber} / ${transferNumber}` : transferNumber;
        await appendStockHistory(client, {
          spareId: line.spareId,
          eventType: "TRANSFER_OUT",
          locationKey: hoKey,
          locationType: "HO",
          regionId,
          quantityChange: -line.qty,
          balanceAfter: hoAfter.rows[0]?.qty ?? null,
          referenceType: refType,
          referenceNumber: refNumber,
          note:
            notes ||
            (againstGrn
              ? `Transferred against GRN ${grnNumber} to ${store.rows[0]!.name}.`
              : `Transferred from HO to store ${store.rows[0]!.name}.`),
          createdBy: actor.id,
        });
        await appendStockHistory(client, {
          spareId: line.spareId,
          eventType: "TRANSFER_IN",
          locationKey: storeKey,
          locationType: "STORE",
          regionId,
          storeId,
          quantityChange: line.qty,
          balanceAfter: storeAfter.rows[0]?.qty ?? null,
          referenceType: refType,
          referenceNumber: refNumber,
          note:
            notes ||
            (againstGrn
              ? `Received against GRN ${grnNumber} at ${store.rows[0]!.name}.`
              : `Received from HO at store ${store.rows[0]!.name}.`),
          createdBy: actor.id,
        });
        moved += line.qty;
      }

      await client.query("COMMIT");
      let remainingQty: number | undefined;
      if (grnId) {
        const remain = await pool.query<{ pending: number }>(
          `SELECT COALESCE(SUM(GREATEST(qty_received - COALESCE(qty_transferred, 0) - COALESCE(qty_returned, 0), 0)), 0)::float8 AS pending
           FROM grn_items WHERE grn_id = $1::uuid`,
          [grnId],
        );
        remainingQty = remain.rows[0]?.pending ?? 0;
      }
      res.json({
        ok: true,
        transferNumber,
        movedQty: moved,
        storeName: store.rows[0]!.name,
        grnNumber: grnNumber ?? undefined,
        remainingQty,
      });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(e);
      res.status(400).json({ error: "Could not transfer stock." });
    } finally {
      client.release();
    }
  });

  app.get("/api/inventory/transfers", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    if (!canManageHoPurchase(actor)) {
      res.status(403).json({ error: "Only HO Purchase / HO Manager can view transfer history." });
      return;
    }
    const regionId =
      actor.role === "super_admin" || actor.role === "admin" ? String(req.query.regionId ?? "").trim() || null : actor.regionId || null;
    try {
      const headers = await pool.query<{
        id: string;
        transfer_number: string;
        reference_type: string | null;
        region_id: string | null;
        region_name: string | null;
        store_id: string | null;
        store_name: string | null;
        line_count: number;
        qty: number;
        note: string | null;
        created_by: string | null;
        created_at: string;
      }>(
        `SELECT
           MIN(h.id::text) AS id,
           h.reference_number AS transfer_number,
           h.reference_type,
           h.region_id,
           r.name AS region_name,
           h.store_id,
           s.name AS store_name,
           COUNT(*)::int AS line_count,
           COALESCE(SUM(h.quantity_change), 0)::float8 AS qty,
           MAX(h.note) AS note,
           MAX(h.created_by) AS created_by,
           MIN(h.created_at) AS created_at
         FROM spare_stock_history h
         LEFT JOIN regions r ON r.id = h.region_id
         LEFT JOIN stores s ON s.id = h.store_id
         WHERE h.event_type = 'TRANSFER_IN'
           AND NULLIF(TRIM(h.reference_number), '') IS NOT NULL
           AND ($1::text IS NULL OR h.region_id = $1)
         GROUP BY h.reference_number, h.reference_type, h.region_id, h.store_id
         ORDER BY MIN(h.created_at) DESC
         LIMIT 500`,
        [regionId],
      );
      const refs = headers.rows.map((r) => r.transfer_number).filter(Boolean);
      const itemsByRef = new Map<
        string,
        Array<{ spareId: string; sku: string; name: string; qty: number }>
      >();
      if (refs.length > 0) {
        const items = await pool.query<{
          reference_number: string;
          spare_id: string;
          sku: string;
          name: string;
          qty: number;
        }>(
          `SELECT
             h.reference_number,
             h.spare_id::text AS spare_id,
             sp.sku,
             sp.name,
             h.quantity_change::float8 AS qty
           FROM spare_stock_history h
           JOIN spares sp ON sp.id = h.spare_id
           WHERE h.event_type = 'TRANSFER_IN'
             AND h.reference_number = ANY($1::text[])
           ORDER BY h.created_at ASC`,
          [refs],
        );
        for (const it of items.rows) {
          const list = itemsByRef.get(it.reference_number) ?? [];
          list.push({ spareId: it.spare_id, sku: it.sku, name: it.name, qty: it.qty });
          itemsByRef.set(it.reference_number, list);
        }
      }
      res.json({
        transfers: headers.rows.map((r) => {
          const parts = String(r.transfer_number).split(" / ").map((p) => p.trim()).filter(Boolean);
          const againstGrn = r.reference_type === "GRN" && parts.length > 1;
          return {
            id: r.id,
            transferNumber: againstGrn ? parts[parts.length - 1] : r.transfer_number,
            grnNumber: againstGrn ? parts[0] : null,
            regionId: r.region_id,
            regionName: r.region_name,
            storeId: r.store_id,
            storeName: r.store_name,
            lineCount: r.line_count,
            qty: r.qty,
            note: r.note,
            createdBy: r.created_by,
            createdAt: r.created_at,
            items: itemsByRef.get(r.transfer_number) ?? [],
          };
        }),
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not load transfer history." });
    }
  });
}
