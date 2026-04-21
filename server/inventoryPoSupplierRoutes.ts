import type { Express, NextFunction, Request, Response } from "express";
import type { Pool } from "pg";
import type { DemoUser } from "../src/types/user";
import { appendStockHistory } from "./db/stockHistory";

type Authed = Request & { userId: string };

function requireHo(actor: DemoUser | undefined | null): boolean {
  return actor?.role === "super_admin" || actor?.role === "regional_admin" || actor?.role === "ho_admin";
}

function canManagePo(actor: DemoUser | undefined | null): boolean {
  return (
    actor?.role === "super_admin" ||
    actor?.role === "regional_admin" ||
    actor?.role === "ho_admin" ||
    actor?.role === "ho_manager" ||
    actor?.role === "ho_user"
  );
}

function canViewPo(actor: DemoUser | undefined | null): boolean {
  return (
    canManagePo(actor) ||
    actor?.role === "store_user" ||
    actor?.role === "store_purchase_user" ||
    actor?.role === "store_manager" ||
    actor?.role === "store_accounts"
  );
}

function makeAlphaNumCode(input: string, fallback: string): string {
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (cleaned.slice(0, 3) || fallback).padEnd(3, "X");
}

async function nextDocNumber(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<{ last_value: number }> }> },
  prefix: "PO" | "GRN",
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
  return `${prefix}${yy}${scopeCode}${num}`;
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
        `INSERT INTO suppliers (name, contact_name, email, phone, address, gst, created_by, modified_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
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
        [name, contactName, email, phone, address, gst, actor?.id ?? null],
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
    sets.push(`modified_by = $${i++}`);
    params.push(actor?.id ?? null);
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

  app.get("/api/inventory/suppliers/:supplierId/spares", requireAuth, async (req, res) => {
    const actor = getActor((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    if (
      actor.role !== "super_admin" &&
      actor.role !== "ho_admin" &&
      actor.role !== "regional_admin" &&
      actor.role !== "store_user"
    ) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
    try {
      const { rows } = await pool.query(
        `SELECT ss.id,
                ss.supplier_id AS "supplierId",
                ss.spare_id AS "spareId",
                s.sku AS "spareSku",
                s.name AS "spareName",
                ss.lead_time_days AS "leadTimeDays",
                ss.min_order_qty::float8 AS "minOrderQty",
                ss.priority_rank AS "priorityRank",
                ss.is_active AS "isActive",
                ss.created_at AS "createdAt",
                ss.updated_at AS "updatedAt"
         FROM supplier_spares ss
         JOIN spares s ON s.id = ss.spare_id
         WHERE ss.supplier_id = $1::uuid
         ORDER BY ss.priority_rank ASC, s.sku ASC`,
        [req.params.supplierId],
      );
      res.json({ rows });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Could not load supplier spare mapping." });
    }
  });

  app.put("/api/inventory/suppliers/:supplierId/spares", requireAuth, async (req, res) => {
    const actor = getActor((req as Authed).userId);
    if (!requireHo(actor)) {
      res.status(403).json({ error: "Only HO admins can update supplier mappings." });
      return;
    }
    const supplierId = req.params.supplierId;
    const rows = Array.isArray(req.body?.rows)
      ? (req.body.rows as Array<{
          spareId: string;
          leadTimeDays?: number | null;
          minOrderQty?: number | null;
          priorityRank?: number | null;
          isActive?: boolean;
        }>)
      : null;
    if (!rows) {
      res.status(400).json({ error: "rows array is required." });
      return;
    }
    if (rows.some((r) => !r.spareId)) {
      res.status(400).json({ error: "Each row requires spareId." });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const supplier = await client.query("SELECT id FROM suppliers WHERE id = $1::uuid", [supplierId]);
      if (supplier.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Supplier not found." });
        return;
      }
      await client.query("DELETE FROM supplier_spares WHERE supplier_id = $1::uuid", [supplierId]);
      for (const row of rows) {
        const leadTimeDays = row.leadTimeDays == null ? null : Math.max(0, Math.trunc(Number(row.leadTimeDays)));
        const minOrderQty = row.minOrderQty == null ? null : Math.max(0, Number(row.minOrderQty));
        const priorityRank = row.priorityRank == null ? 100 : Math.max(1, Math.trunc(Number(row.priorityRank)));
        const isActive = row.isActive ?? true;
        await client.query(
          `INSERT INTO supplier_spares
            (supplier_id, spare_id, lead_time_days, min_order_qty, priority_rank, is_active)
           VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)`,
          [supplierId, row.spareId, leadTimeDays, minOrderQty, priorityRank, isActive],
        );
      }
      await client.query("COMMIT");
      res.json({ ok: true, count: rows.length });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(e);
      res.status(400).json({ error: "Could not save supplier mappings." });
    } finally {
      client.release();
    }
  });

  /** Purchase orders */
  app.get("/api/inventory/po-consolidation", requireAuth, async (req, res) => {
    const actor = getActor((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    if (!canManagePo(actor)) {
      res.status(403).json({ error: "Only HO admins can access PO consolidation." });
      return;
    }
    const regionIdQ = String(req.query.regionId ?? "").trim();
    const statuses = String(req.query.statuses ?? "APPROVED,PARTIAL,SUBMITTED")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    if (statuses.length === 0) {
      res.status(400).json({ error: "At least one status is required." });
      return;
    }
    try {
      const params: unknown[] = [statuses];
      let where = `pr.status = ANY($1::text[])`;
      if (actor.role === "regional_admin" && actor.regionId) {
        params.push(actor.regionId);
        where += ` AND pr.region_id = $${params.length}::text`;
      } else if (regionIdQ) {
        params.push(regionIdQ);
        where += ` AND pr.region_id = $${params.length}::text`;
      }
      const { rows } = await pool.query(
        `SELECT pri.id AS "prItemId",
                pri.pr_id AS "prId",
                pr.pr_number AS "prNumber",
                pr.store_id AS "storeId",
                st.name AS "storeName",
                pr.region_id AS "regionId",
                rg.name AS "regionName",
                pr.status AS "prStatus",
                pr.needed_by AS "neededBy",
                pr.created_at AS "prCreatedAt",
                pri.spare_id AS "spareId",
                s.sku AS "spareSku",
                s.name AS "spareName",
                pri.qty::float8 AS qty,
                pri.issued_qty::float8 AS "issuedQty",
                GREATEST(pri.qty - pri.issued_qty, 0)::float8 AS "pendingQty",
                map.candidate_count AS "supplierCandidateCount",
                CASE WHEN map.candidate_count = 1 THEN map.default_supplier_id ELSE NULL END AS "mappedSupplierId",
                CASE WHEN map.candidate_count = 1 THEN map.default_supplier_name ELSE NULL END AS "mappedSupplierName",
                COALESCE(map.candidates, '[]'::json) AS "supplierCandidates"
         FROM purchase_request_items pri
         JOIN purchase_requests pr ON pr.id = pri.pr_id
         JOIN stores st ON st.id = pr.store_id
         JOIN regions rg ON rg.id = pr.region_id
         JOIN spares s ON s.id = pri.spare_id
         LEFT JOIN LATERAL (
           SELECT
             COUNT(*)::int AS candidate_count,
             (ARRAY_AGG(ss.supplier_id ORDER BY ss.priority_rank ASC, ss.created_at ASC))[1] AS default_supplier_id,
             (ARRAY_AGG(sup.name ORDER BY ss.priority_rank ASC, ss.created_at ASC))[1] AS default_supplier_name,
             json_agg(
               json_build_object(
                 'supplierId', ss.supplier_id,
                 'supplierName', sup.name
               )
               ORDER BY ss.priority_rank ASC, ss.created_at ASC
             ) AS candidates
           FROM supplier_spares ss
           JOIN suppliers sup ON sup.id = ss.supplier_id
           WHERE ss.spare_id = pri.spare_id
             AND ss.is_active = true
             AND sup.is_active = true
         ) map ON true
         WHERE ${where}
         ORDER BY pr.created_at ASC, pr.pr_number ASC, s.sku ASC`,
        params,
      );
      res.json({
        rows: rows.filter((r) => Number(r.pendingQty) > 0),
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not build consolidation view." });
    }
  });

  app.post("/api/inventory/pos/draft-from-demand", requireAuth, async (req, res) => {
    const actor = getActor((req as Authed).userId);
    if (!canManagePo(actor)) {
      res.status(403).json({ error: "Only HO admins can draft POs from demand." });
      return;
    }
    const selections = Array.isArray(req.body?.selections)
      ? (req.body.selections as Array<{ prItemId: string; qtyOrdered: number; unitPrice?: number; supplierId?: string }>)
      : [];
    if (selections.length === 0) {
      res.status(400).json({ error: "At least one selected line is required." });
      return;
    }
    const itemIds = selections.map((s) => s.prItemId).filter(Boolean);
    if (itemIds.length !== selections.length) {
      res.status(400).json({ error: "Each selection requires prItemId." });
      return;
    }
    try {
      const { rows } = await pool.query<{
        prItemId: string;
        prId: string;
        prNumber: string;
        regionId: string;
        regionName: string;
        storeId: string;
        storeName: string;
        spareId: string;
        pendingQty: number;
        candidateCount: number;
        supplierCandidates: Array<{ supplierId: string; supplierName: string }>;
      }>(
        `SELECT pri.id AS "prItemId",
                pri.pr_id AS "prId",
                pr.pr_number AS "prNumber",
                pr.region_id AS "regionId",
                pr.store_id AS "storeId",
                st.name AS "storeName",
                rg.name AS "regionName",
                pri.spare_id AS "spareId",
                GREATEST(pri.qty - pri.issued_qty, 0)::float8 AS "pendingQty",
                map.candidate_count AS "candidateCount",
                COALESCE(map.candidates, '[]'::json) AS "supplierCandidates"
         FROM purchase_request_items pri
         JOIN purchase_requests pr ON pr.id = pri.pr_id
         JOIN stores st ON st.id = pr.store_id
         JOIN regions rg ON rg.id = pr.region_id
         LEFT JOIN LATERAL (
           SELECT
             COUNT(*)::int AS candidate_count,
             json_agg(
               json_build_object(
                 'supplierId', ss.supplier_id,
                 'supplierName', sup.name
               )
               ORDER BY ss.priority_rank ASC, ss.created_at ASC
             ) AS candidates
           FROM supplier_spares ss
           JOIN suppliers sup ON sup.id = ss.supplier_id
           WHERE ss.spare_id = pri.spare_id
             AND ss.is_active = true
             AND sup.is_active = true
         ) map ON true
         WHERE pri.id = ANY($1::uuid[])`,
        [itemIds],
      );
      const requestedById = new Map(selections.map((s) => [s.prItemId, s]));
      const unmapped: Array<{
        prItemId: string;
        spareId: string;
        prNumber: string;
        reason: string;
        supplierCandidates?: Array<{ supplierId: string; supplierName: string }>;
      }> = [];
      const draftsBySupplier = new Map<
        string,
        {
          supplierId: string;
          supplierName: string;
          regionId: string;
          regionName: string;
          lines: Array<{
            prItemId: string;
            prId: string;
            prNumber: string;
            storeId: string;
            storeName: string;
            spareId: string;
            qtyOrdered: number;
            unitPrice: number;
          }>;
        }
      >();
      for (const row of rows) {
        const reqLine = requestedById.get(row.prItemId);
        if (!reqLine) continue;
        const requestedSupplierId = reqLine.supplierId ? String(reqLine.supplierId).trim() : "";
        const candidates = Array.isArray(row.supplierCandidates) ? row.supplierCandidates : [];
        if (row.candidateCount <= 0 || candidates.length === 0) {
          unmapped.push({
            prItemId: row.prItemId,
            spareId: row.spareId,
            prNumber: row.prNumber,
            reason: "No mapped supplier found.",
          });
          continue;
        }
        let finalSupplierId = requestedSupplierId;
        if (!finalSupplierId) {
          if (row.candidateCount === 1) {
            finalSupplierId = candidates[0]!.supplierId;
          } else {
            unmapped.push({
              prItemId: row.prItemId,
              spareId: row.spareId,
              prNumber: row.prNumber,
              reason: "Multiple suppliers mapped. Choose one.",
              supplierCandidates: candidates,
            });
            continue;
          }
        }
        const chosen = candidates.find((c) => c.supplierId === finalSupplierId);
        if (!chosen) {
          unmapped.push({
            prItemId: row.prItemId,
            spareId: row.spareId,
            prNumber: row.prNumber,
            reason: "Selected supplier is not mapped for this spare.",
            supplierCandidates: candidates,
          });
          continue;
        }
        const qtyOrdered = Number(reqLine.qtyOrdered);
        if (Number.isNaN(qtyOrdered) || qtyOrdered <= 0 || qtyOrdered > row.pendingQty) continue;
        const unitPrice = reqLine.unitPrice == null ? 0 : Number(reqLine.unitPrice);
        const key = `${finalSupplierId}|${row.regionId}`;
        const bucket =
          draftsBySupplier.get(key) ??
          {
            supplierId: finalSupplierId,
            supplierName: chosen.supplierName,
            regionId: row.regionId,
            regionName: row.regionName,
            lines: [],
          };
        bucket.lines.push({
          prItemId: row.prItemId,
          prId: row.prId,
          prNumber: row.prNumber,
          storeId: row.storeId,
          storeName: row.storeName,
          spareId: row.spareId,
          qtyOrdered,
          unitPrice: Number.isNaN(unitPrice) || unitPrice < 0 ? 0 : unitPrice,
        });
        draftsBySupplier.set(key, bucket);
      }
      res.json({
        drafts: Array.from(draftsBySupplier.values()),
        unmapped,
      });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "Could not generate PO drafts." });
    }
  });

  app.post("/api/inventory/pos/bulk-create", requireAuth, async (req, res) => {
    const actor = getActor((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    if (!canManagePo(actor)) {
      res.status(403).json({ error: "Only HO admins can bulk-create POs." });
      return;
    }
    const drafts = Array.isArray(req.body?.drafts)
      ? (req.body.drafts as Array<{
          supplierId: string;
          regionId: string;
          notes?: string;
          lines: Array<{ prItemId: string; spareId: string; qtyOrdered: number; unitPrice: number }>;
        }>)
      : [];
    if (drafts.length === 0) {
      res.status(400).json({ error: "At least one draft is required." });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const created: Array<{ id: string; poNumber: string; supplierId: string; regionId: string; lines: number }> = [];
      for (const draft of drafts) {
        if (!draft.supplierId || !draft.regionId || !Array.isArray(draft.lines) || draft.lines.length === 0) {
          await client.query("ROLLBACK");
          res.status(400).json({ error: "Each draft requires supplierId, regionId, and lines." });
          return;
        }
        if (actor.role === "regional_admin" && actor.regionId !== draft.regionId) {
          await client.query("ROLLBACK");
          res.status(403).json({ error: "Draft outside your region." });
          return;
        }
        const sup = await client.query("SELECT id FROM suppliers WHERE id = $1::uuid AND is_active = true", [draft.supplierId]);
        if (sup.rowCount === 0) {
          await client.query("ROLLBACK");
          res.status(400).json({ error: "Invalid supplier in one draft." });
          return;
        }
        const regionNameRes = await client.query<{ name: string }>("SELECT name FROM regions WHERE id = $1::text", [draft.regionId]);
        const regionCode = makeAlphaNumCode(regionNameRes.rows[0]?.name ?? draft.regionId, "REG");
        const poNumber = await nextDocNumber(client, "PO", regionCode);
        const poIns = await client.query<{ id: string }>(
        `INSERT INTO purchase_orders (po_number, supplier_id, pr_id, region_id, status, notes, created_by, modified_by)
         VALUES ($1, $2::uuid, NULL, $3, 'OPEN', $4, $5, $5)
           RETURNING id`,
          [poNumber, draft.supplierId, draft.regionId, String(draft.notes ?? "").trim(), actor.id],
        );
        const poId = poIns.rows[0]!.id;
        for (const line of draft.lines) {
          const qty = Number(line.qtyOrdered);
          const unitPrice = Number(line.unitPrice);
          if (!line.prItemId || !line.spareId || Number.isNaN(qty) || qty <= 0 || Number.isNaN(unitPrice) || unitPrice < 0) {
            await client.query("ROLLBACK");
            res.status(400).json({ error: "Invalid line values in one draft." });
            return;
          }
          const prItem = await client.query<{ spare_id: string; qty: number; issued_qty: number; pr_id: string }>(
            `SELECT spare_id, qty::float8, issued_qty::float8, pr_id
             FROM purchase_request_items
             WHERE id = $1::uuid
             FOR UPDATE`,
            [line.prItemId],
          );
          const row = prItem.rows[0];
          if (!row || String(row.spare_id) !== line.spareId) {
            await client.query("ROLLBACK");
            res.status(400).json({ error: "PR line mismatch in one draft line." });
            return;
          }
          const pending = Math.max(0, row.qty - row.issued_qty);
          if (qty > pending) {
            await client.query("ROLLBACK");
            res.status(400).json({ error: "PO qty exceeds pending PR qty for one line." });
            return;
          }
          await client.query(
            `INSERT INTO purchase_order_items (po_id, pr_item_id, spare_id, qty_ordered, unit_price, created_by, modified_by)
             VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $6)`,
            [poId, line.prItemId, line.spareId, qty, unitPrice, actor.id],
          );
        }
        created.push({ id: poId, poNumber, supplierId: draft.supplierId, regionId: draft.regionId, lines: draft.lines.length });
      }
      await client.query("COMMIT");
      res.json({ ok: true, created });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(e);
      res.status(400).json({ error: "Could not bulk-create POs." });
    } finally {
      client.release();
    }
  });

  app.get("/api/inventory/pos", requireAuth, async (req, res) => {
    const actor = getActor((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    if (!canViewPo(actor)) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
    try {
      const params: unknown[] = [];
      let where = "";
      if ((actor.role === "regional_admin" || actor.role === "ho_manager" || actor.role === "ho_user") && actor.regionId) {
        params.push(actor.regionId);
        where = "WHERE po.region_id = $1::text";
      } else if (
        (actor.role === "store_user" ||
          actor.role === "store_purchase_user" ||
          actor.role === "store_manager" ||
          actor.role === "store_accounts") &&
        actor.storeId
      ) {
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
                pr.store_id AS "storeId",
                st.name AS "storeName",
                po.supplier_id AS "supplierId",
                s.name AS "supplierName",
                po.region_id AS "regionId",
                rg.name AS "regionName",
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
         JOIN regions rg ON rg.id = po.region_id
         LEFT JOIN purchase_requests pr ON pr.id = po.pr_id
         LEFT JOIN stores st ON st.id = pr.store_id
         LEFT JOIN purchase_order_items poi ON poi.po_id = po.id
         ${where}
         GROUP BY po.id, s.name, pr.pr_number, pr.store_id, st.name, rg.name
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
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    if (!canManagePo(actor)) {
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
      if ((actor.role === "regional_admin" || actor.role === "ho_manager" || actor.role === "ho_user") && actor.regionId !== pr.region_id) {
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

      const regionNameRes = await client.query<{ name: string }>("SELECT name FROM regions WHERE id = $1::text", [pr.region_id]);
      const regionCode = makeAlphaNumCode(regionNameRes.rows[0]?.name ?? pr.region_id, "REG");
      const poNumber = await nextDocNumber(client, "PO", regionCode);
      const insPo = await client.query<{ id: string }>(
        `INSERT INTO purchase_orders (po_number, supplier_id, pr_id, region_id, status, notes, created_by, modified_by)
         VALUES ($1, $2::uuid, $3::uuid, $4, 'OPEN', $5, $6, $6)
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
          `INSERT INTO purchase_order_items (po_id, pr_item_id, spare_id, qty_ordered, unit_price, created_by, modified_by)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $6)`,
          [poId, it.prItemId, it.spareId, Number(it.qtyOrdered), Number(it.unitPrice), actor.id],
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
    if (actor.role !== "super_admin" && actor.role !== "regional_admin" && actor.role !== "ho_admin") {
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

      const regionNameRes = await client.query<{ name: string }>("SELECT name FROM regions WHERE id = $1::text", [po.region_id]);
      const regionCode = makeAlphaNumCode(regionNameRes.rows[0]?.name ?? po.region_id, "REG");
      const grnNumber = await nextDocNumber(client, "GRN", regionCode);
      const ins = await client.query<{ id: string }>(
        `INSERT INTO grns (grn_number, po_id, supplier_id, region_id, invoice_number, invoice_date, mode, notes, created_by, modified_by)
         VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $9)
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
          `INSERT INTO grn_items (grn_id, po_item_id, spare_id, qty_received, created_by, modified_by)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $5)`,
          [grnId, it.poItemId, it.spareId, qty, actor?.id ?? "system"],
        );
        await client.query(
          `UPDATE purchase_order_items
           SET received_qty = received_qty + $1, modified_by = $3
           WHERE id = $2::uuid`,
          [qty, it.poItemId, actor?.id ?? "system"],
        );
        await client.query(
          `INSERT INTO spare_stock (spare_id, location_key, location_type, region_id, store_id, quantity)
           VALUES ($1::uuid, $2, 'HO', $3, NULL, $4)
           ON CONFLICT (spare_id, location_key)
           DO UPDATE SET quantity = spare_stock.quantity + EXCLUDED.quantity, updated_at = now()`,
          [it.spareId, `HO:${po.region_id}`, po.region_id, qty],
        );
        const hoAfter = await client.query<{ qty: number }>(
          `SELECT quantity::float8 AS qty
           FROM spare_stock
           WHERE spare_id = $1::uuid AND location_key = $2`,
          [it.spareId, `HO:${po.region_id}`],
        );
        await appendStockHistory(client, {
          spareId: it.spareId,
          eventType: "PURCHASE_IN",
          locationKey: `HO:${po.region_id}`,
          locationType: "HO",
          regionId: po.region_id,
          quantityChange: qty,
          balanceAfter: hoAfter.rows[0]?.qty ?? null,
          referenceType: "GRN",
          referenceNumber: grnNumber,
          note: `Purchase inward posted against PO ${poId}.`,
          createdBy: actor?.id ?? "system",
        });
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
         SET status = $1, updated_at = now(), modified_by = $3
         WHERE id = $2::uuid`,
        [poStatus, poId, actor?.id ?? "system"],
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
