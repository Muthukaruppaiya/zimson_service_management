import type { Express, NextFunction, Request, Response } from "express";
import type { Pool } from "pg";
import type { DemoUser } from "../src/types/user";
import { appendStockHistory } from "./db/stockHistory";

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
      ? (req.body.items as Array<{ spareId: string; qtyOrdered: number; unitPrice?: number }>)
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
          `INSERT INTO purchase_order_items (po_id, pr_item_id, spare_id, qty_ordered, unit_price, created_by, modified_by)
           VALUES ($1::uuid, NULL, $2::uuid, $3, $4, $5, $5)`,
          [poId, it.spareId, Number(it.qtyOrdered), Number(it.unitPrice ?? 0) || 0, actor.id],
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
                      'qtyPending', GREATEST(gi.qty_received - COALESCE(gi.qty_transferred, 0), 0)::float8,
                      'hoAvailable', COALESCE(ss.quantity, 0)::float8
                    )
                    ORDER BY sp.name
                  ) FILTER (WHERE gi.id IS NOT NULL),
                  '[]'::json
                ) AS items
         FROM grns g
         JOIN suppliers s ON s.id = g.supplier_id
         JOIN purchase_orders po ON po.id = g.po_id
         JOIN grn_items gi ON gi.grn_id = g.id
         JOIN spares sp ON sp.id = gi.spare_id
         LEFT JOIN spare_stock ss ON ss.spare_id = gi.spare_id AND ss.location_key = $2
         WHERE g.region_id = $1
           AND EXISTS (
             SELECT 1 FROM grn_items x
             WHERE x.grn_id = g.id
               AND (x.qty_received - COALESCE(x.qty_transferred, 0)) > 0
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
        }>(
          `SELECT id, spare_id, qty_received::float8 AS qty_received, COALESCE(qty_transferred, 0)::float8 AS qty_transferred
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
        const pending = Math.max(0, gi.rows[0]!.qty_received - gi.rows[0]!.qty_transferred);
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
        `SELECT COALESCE(SUM(GREATEST(qty_received - COALESCE(qty_transferred, 0), 0)), 0)::float8 AS pending
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
          }>(
            `SELECT spare_id, qty_received::float8 AS qty_received, COALESCE(qty_transferred, 0)::float8 AS qty_transferred
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
          const pending = Math.max(0, gi.rows[0]!.qty_received - gi.rows[0]!.qty_transferred);
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
          `SELECT COALESCE(SUM(GREATEST(qty_received - COALESCE(qty_transferred, 0), 0)), 0)::float8 AS pending
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
}
