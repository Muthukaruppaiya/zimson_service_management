import type { Express, NextFunction, Request, Response } from "express";
import type { Pool } from "pg";
import { createId } from "../src/lib/id";
import type { DemoUser } from "../src/types/user";

type Authed = Request & { userId: string };

function requireHo(actor: DemoUser | undefined | null): boolean {
  return actor?.role === "super_admin" || actor?.role === "regional_admin";
}

export function registerInventoryPoSupplierRoutes(
  app: Express,
  pool: Pool,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
  getActor: (userId: string) => DemoUser | undefined,
): void {
  /** Suppliers — read for anyone with inventory; write for HO admins */
  app.get("/api/inventory/suppliers", requireAuth, async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT id,
                name,
                contact_name AS "contactName",
                email,
                phone,
                address,
                gst,
                is_active AS "isActive",
                created_at AS "createdAt",
                updated_at AS "updatedAt"
         FROM suppliers
         ORDER BY name`,
      );
      res.json({ suppliers: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to load suppliers." });
    }
  });

  app.post("/api/inventory/suppliers", requireAuth, async (req, res) => {
    const actor = getActor((req as Authed).userId);
    if (!requireHo(actor)) {
      res.status(403).json({ error: "Only HO admins can create suppliers." });
      return;
    }
    const name = String(req.body?.name ?? "").trim();
    if (!name) {
      res.status(400).json({ error: "Supplier name is required." });
      return;
    }
    const contactName = String(req.body?.contactName ?? "").trim() || null;
    const email = String(req.body?.email ?? "").trim() || null;
    const phone = String(req.body?.phone ?? "").trim() || null;
    const address = String(req.body?.address ?? "").trim() || null;
    const gst = String(req.body?.gst ?? "").trim().toUpperCase() || null;
    try {
      const { rows } = await pool.query(
        `INSERT INTO suppliers (name, contact_name, email, phone, address, gst)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id,
                   name,
                   contact_name AS "contactName",
                   email,
                   phone,
                   address,
                   gst,
                   is_active AS "isActive",
                   created_at AS "createdAt",
                   updated_at AS "updatedAt"`,
        [name, contactName, email, phone, address, gst],
      );
      res.json({ supplier: rows[0] });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Could not create supplier." });
    }
  });

  app.patch("/api/inventory/suppliers/:supplierId", requireAuth, async (req, res) => {
    const actor = getActor((req as Authed).userId);
    if (!requireHo(actor)) {
      res.status(403).json({ error: "Only HO admins can update suppliers." });
      return;
    }
    const id = req.params.supplierId;
    let name: string | null = null;
    if (req.body?.name !== undefined) {
      const n = String(req.body.name ?? "").trim();
      if (!n) {
        res.status(400).json({ error: "Name cannot be empty." });
        return;
      }
      name = n;
    }
    const contactName = req.body?.contactName !== undefined ? String(req.body.contactName ?? "").trim() || null : undefined;
    const email = req.body?.email !== undefined ? String(req.body.email ?? "").trim() || null : undefined;
    const phone = req.body?.phone !== undefined ? String(req.body.phone ?? "").trim() || null : undefined;
    const address = req.body?.address !== undefined ? String(req.body.address ?? "").trim() || null : undefined;
    const gst = req.body?.gst !== undefined ? String(req.body.gst ?? "").trim().toUpperCase() || null : undefined;
    const isActive = req.body?.isActive !== undefined ? Boolean(req.body.isActive) : undefined;
    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (name !== null) {
      sets.push(`name = $${i++}`);
      params.push(name);
    }
    if (contactName !== undefined) {
      sets.push(`contact_name = $${i++}`);
      params.push(contactName);
    }
    if (email !== undefined) {
      sets.push(`email = $${i++}`);
      params.push(email);
    }
    if (phone !== undefined) {
      sets.push(`phone = $${i++}`);
      params.push(phone);
    }
    if (address !== undefined) {
      sets.push(`address = $${i++}`);
      params.push(address);
    }
    if (gst !== undefined) {
      sets.push(`gst = $${i++}`);
      params.push(gst);
    }
    if (isActive !== undefined) {
      sets.push(`is_active = $${i++}`);
      params.push(isActive);
    }
    if (sets.length === 0) {
      res.status(400).json({ error: "No fields to update." });
      return;
    }
    sets.push("updated_at = now()");
    params.push(id);
    try {
      const upd = await pool.query(
        `UPDATE suppliers SET ${sets.join(", ")} WHERE id = $${i}::uuid RETURNING id,
                name,
                contact_name AS "contactName",
                email,
                phone,
                address,
                gst,
                is_active AS "isActive",
                created_at AS "createdAt",
                updated_at AS "updatedAt"`,
        params,
      );
      if (upd.rowCount === 0) {
        res.status(404).json({ error: "Supplier not found." });
        return;
      }
      res.json({ supplier: upd.rows[0] });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Could not update supplier." });
    }
  });

  app.delete("/api/inventory/suppliers/:supplierId", requireAuth, async (req, res) => {
    const actor = getActor((req as Authed).userId);
    if (!requireHo(actor)) {
      res.status(403).json({ error: "Only HO admins can delete suppliers." });
      return;
    }
    try {
      const del = await pool.query("DELETE FROM suppliers WHERE id = $1::uuid", [req.params.supplierId]);
      if (del.rowCount === 0) {
        res.status(404).json({ error: "Supplier not found." });
        return;
      }
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Cannot delete supplier (may be referenced by POs)." });
    }
  });

  /** Purchase orders */
  app.get("/api/inventory/pos", requireAuth, async (req, res) => {
    const actor = getActor((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    if (
      actor.role !== "super_admin" &&
      actor.role !== "regional_admin" &&
      actor.role !== "store_user"
    ) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
    try {
      const params: unknown[] = [];
      let where = "";
      if (actor.role === "regional_admin" && actor.regionId) {
        params.push(actor.regionId);
        where = "WHERE po.region_id = $1::text";
      } else if (actor.role === "store_user" && actor.storeId) {
        params.push(actor.storeId);
        where = `WHERE EXISTS (
          SELECT 1 FROM purchase_requests pr
          WHERE pr.id = po.pr_id AND pr.store_id = $1::text
        )`;
      }
      const { rows } = await pool.query(
        `SELECT po.id,
                po.po_number AS "poNumber",
                po.pr_id AS "prId",
                pr.pr_number AS "prNumber",
                po.supplier_id AS "supplierId",
                s.name AS "supplierName",
                po.region_id AS "regionId",
                po.status,
                po.notes,
                po.created_at AS "createdAt",
                po.updated_at AS "updatedAt",
                COALESCE(
                  json_agg(
                    json_build_object(
                      'id', poi.id,
                      'prItemId', poi.pr_item_id,
                      'spareId', poi.spare_id,
                      'qtyOrdered', poi.qty_ordered::float8,
                      'unitPrice', poi.unit_price::float8,
                      'receivedQty', poi.received_qty::float8
                    )
                  ) FILTER (WHERE poi.id IS NOT NULL),
                  '[]'::json
                ) AS items
         FROM purchase_orders po
         JOIN suppliers s ON s.id = po.supplier_id
         LEFT JOIN purchase_requests pr ON pr.id = po.pr_id
         LEFT JOIN purchase_order_items poi ON poi.po_id = po.id
         ${where}
         GROUP BY po.id, s.name, pr.pr_number
         ORDER BY po.created_at DESC`,
        params,
      );
      res.json({ pos: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to load purchase orders." });
    }
  });

  app.post("/api/inventory/pos", requireAuth, async (req, res) => {
    const actor = getActor((req as Authed).userId);
    if (!requireHo(actor)) {
      res.status(403).json({ error: "Only HO admins can create POs." });
      return;
    }
    const prId = String(req.body?.prId ?? "").trim();
    const supplierId = String(req.body?.supplierId ?? "").trim();
    const notes = String(req.body?.notes ?? "").trim();
    const items = req.body?.items as
      | Array<{ prItemId: string; spareId: string; qtyOrdered: number; unitPrice: number }>
      | undefined;
    if (!prId || !supplierId) {
      res.status(400).json({ error: "prId and supplierId are required." });
      return;
    }
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: "At least one PO line is required." });
      return;
    }
    for (const it of items) {
      if (!it.prItemId || !it.spareId || Number.isNaN(Number(it.qtyOrdered)) || Number(it.qtyOrdered) <= 0) {
        res.status(400).json({ error: "Each line needs prItemId, spareId, and qtyOrdered > 0." });
        return;
      }
      if (Number.isNaN(Number(it.unitPrice)) || Number(it.unitPrice) < 0) {
        res.status(400).json({ error: "Each line needs a non-negative unitPrice." });
        return;
      }
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const prRes = await client.query<{
        id: string;
        region_id: string;
        status: string;
      }>("SELECT id, region_id, status FROM purchase_requests WHERE id = $1::uuid FOR UPDATE", [prId]);
      const pr = prRes.rows[0];
      if (!pr) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "PR not found." });
        return;
      }
      if (actor.role === "regional_admin" && actor.regionId !== pr.region_id) {
        await client.query("ROLLBACK");
        res.status(403).json({ error: "PR is outside your region." });
        return;
      }
      const okStatus = new Set(["SUBMITTED", "APPROVED", "PARTIAL"]);
      if (!okStatus.has(pr.status)) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: `Cannot create PO from PR in status ${pr.status}.` });
        return;
      }

      const sup = await client.query("SELECT id FROM suppliers WHERE id = $1::uuid AND is_active = true", [
        supplierId,
      ]);
      if (sup.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Invalid or inactive supplier." });
        return;
      }

      const poNumber = `PO-${createId("po").slice(-10).toUpperCase()}`;
      const insPo = await client.query<{ id: string }>(
        `INSERT INTO purchase_orders (po_number, supplier_id, pr_id, region_id, status, notes, created_by)
         VALUES ($1, $2::uuid, $3::uuid, $4, 'OPEN', $5, $6)
         RETURNING id`,
        [poNumber, supplierId, prId, pr.region_id, notes, actor.id],
      );
      const poId = insPo.rows[0]!.id;

      for (const it of items) {
        const row = await client.query(
          `SELECT id, pr_id, spare_id FROM purchase_request_items WHERE id = $1::uuid AND pr_id = $2::uuid`,
          [it.prItemId, prId],
        );
        if (row.rowCount === 0) {
          await client.query("ROLLBACK");
          res.status(400).json({ error: "PR line does not belong to this PR." });
          return;
        }
        if (String(row.rows[0]!.spare_id) !== it.spareId) {
          await client.query("ROLLBACK");
          res.status(400).json({ error: "Spare mismatch on PR line." });
          return;
        }
        await client.query(
          `INSERT INTO purchase_order_items (po_id, pr_item_id, spare_id, qty_ordered, unit_price)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5)`,
          [poId, it.prItemId, it.spareId, Number(it.qtyOrdered), Number(it.unitPrice)],
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

  /** GRN (PO inward) */
  app.get("/api/inventory/grns", requireAuth, async (req, res) => {
    const actor = getActor((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    if (actor.role !== "super_admin" && actor.role !== "regional_admin") {
      res.status(403).json({ error: "Only HO admins can view GRN register." });
      return;
    }
    try {
      const params: unknown[] = [];
      let where = "";
      if (actor.role === "regional_admin" && actor.regionId) {
        params.push(actor.regionId);
        where = "WHERE g.region_id = $1::text";
      }
      const { rows } = await pool.query(
        `SELECT g.id,
                g.grn_number AS "grnNumber",
                g.po_id AS "poId",
                po.po_number AS "poNumber",
                g.supplier_id AS "supplierId",
                s.name AS "supplierName",
                g.region_id AS "regionId",
                g.invoice_number AS "invoiceNumber",
                g.invoice_date AS "invoiceDate",
                g.mode,
                g.notes,
                g.created_by AS "createdBy",
                g.created_at AS "createdAt",
                COALESCE(
                  json_agg(
                    json_build_object(
                      'id', gi.id,
                      'poItemId', gi.po_item_id,
                      'spareId', gi.spare_id,
                      'qtyReceived', gi.qty_received::float8
                    )
                  ) FILTER (WHERE gi.id IS NOT NULL),
                  '[]'::json
                ) AS items
         FROM grns g
         JOIN suppliers s ON s.id = g.supplier_id
         JOIN purchase_orders po ON po.id = g.po_id
         LEFT JOIN grn_items gi ON gi.grn_id = g.id
         ${where}
         GROUP BY g.id, s.name, po.po_number
         ORDER BY g.created_at DESC`,
        params,
      );
      res.json({ grns: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to load GRNs." });
    }
  });

  app.post("/api/inventory/grns", requireAuth, async (req, res) => {
    const actor = getActor((req as Authed).userId);
    if (!requireHo(actor)) {
      res.status(403).json({ error: "Only HO admins can create GRN." });
      return;
    }
    const poId = String(req.body?.poId ?? "").trim();
    const mode = String(req.body?.mode ?? "").toUpperCase();
    const invoiceNumber = String(req.body?.invoiceNumber ?? "").trim() || null;
    const invoiceDate = String(req.body?.invoiceDate ?? "").trim() || null;
    const notes = String(req.body?.notes ?? "").trim();
    const items = req.body?.items as
      | Array<{ poItemId: string; spareId: string; qtyReceived: number }>
      | undefined;

    if (!poId || (mode !== "WITH_BILL" && mode !== "WITHOUT_BILL")) {
      res.status(400).json({ error: "poId and mode are required." });
      return;
    }
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: "At least one inward line is required." });
      return;
    }
    if (mode === "WITH_BILL" && !invoiceNumber) {
      res.status(400).json({ error: "Invoice number is required for WITH_BILL mode." });
      return;
    }
    for (const it of items) {
      if (!it.poItemId || !it.spareId || Number.isNaN(Number(it.qtyReceived)) || Number(it.qtyReceived) <= 0) {
        res.status(400).json({ error: "Each line needs poItemId, spareId and qtyReceived > 0." });
        return;
      }
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const poRes = await client.query<{
        id: string;
        supplier_id: string;
        region_id: string;
        status: string;
      }>(
        `SELECT id, supplier_id, region_id, status
         FROM purchase_orders
         WHERE id = $1::uuid
         FOR UPDATE`,
        [poId],
      );
      const po = poRes.rows[0];
      if (!po) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "PO not found." });
        return;
      }
      if (actor?.role === "regional_admin" && actor.regionId !== po.region_id) {
        await client.query("ROLLBACK");
        res.status(403).json({ error: "PO is outside your region." });
        return;
      }
      if (po.status === "CANCELLED" || po.status === "CLOSED") {
        await client.query("ROLLBACK");
        res.status(400).json({ error: `Cannot inward PO in status ${po.status}.` });
        return;
      }

      const grnNumber = `GRN-${createId("grn").slice(-10).toUpperCase()}`;
      const ins = await client.query<{ id: string }>(
        `INSERT INTO grns (grn_number, po_id, supplier_id, region_id, invoice_number, invoice_date, mode, notes, created_by)
         VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [grnNumber, poId, po.supplier_id, po.region_id, invoiceNumber, invoiceDate, mode, notes, actor?.id ?? "system"],
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
           FROM purchase_order_items
           WHERE id = $1::uuid AND po_id = $2::uuid
           FOR UPDATE`,
          [it.poItemId, poId],
        );
        const poi = row.rows[0];
        if (!poi) {
          await client.query("ROLLBACK");
          res.status(400).json({ error: "PO item does not belong to selected PO." });
          return;
        }
        if (String(poi.spare_id) !== it.spareId) {
          await client.query("ROLLBACK");
          res.status(400).json({ error: "Spare mismatch on PO line." });
          return;
        }
        const qty = Number(it.qtyReceived);
        const remaining = Math.max(0, poi.qty_ordered - poi.received_qty);
        if (qty > remaining) {
          await client.query("ROLLBACK");
          res.status(400).json({ error: `Received qty exceeds pending qty for a line (pending ${remaining}).` });
          return;
        }
        await client.query(
          `INSERT INTO grn_items (grn_id, po_item_id, spare_id, qty_received)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4)`,
          [grnId, it.poItemId, it.spareId, qty],
        );
        await client.query(
          `UPDATE purchase_order_items
           SET received_qty = received_qty + $1
           WHERE id = $2::uuid`,
          [qty, it.poItemId],
        );
        await client.query(
          `INSERT INTO spare_stock (spare_id, location_key, location_type, region_id, store_id, quantity)
           VALUES ($1::uuid, $2, 'HO', $3, NULL, $4)
           ON CONFLICT (spare_id, location_key)
           DO UPDATE SET quantity = spare_stock.quantity + EXCLUDED.quantity, updated_at = now()`,
          [it.spareId, `HO:${po.region_id}`, po.region_id, qty],
        );
        moved += qty;
      }

      const sum = await client.query<{ ordered: number; received: number }>(
        `SELECT COALESCE(SUM(qty_ordered), 0)::float8 AS ordered,
                COALESCE(SUM(received_qty), 0)::float8 AS received
         FROM purchase_order_items
         WHERE po_id = $1::uuid`,
        [poId],
      );
      const ordered = sum.rows[0]?.ordered ?? 0;
      const received = sum.rows[0]?.received ?? 0;
      const poStatus = received >= ordered ? "CLOSED" : "PARTIAL";
      await client.query(
        `UPDATE purchase_orders
         SET status = $1, updated_at = now()
         WHERE id = $2::uuid`,
        [poStatus, poId],
      );

      await client.query("COMMIT");
      res.json({ ok: true, id: grnId, grnNumber, movedQty: moved, poStatus });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(e);
      res.status(400).json({ error: "Could not create GRN." });
    } finally {
      client.release();
    }
  });
}
