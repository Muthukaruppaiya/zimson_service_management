import type { Express, NextFunction, Request, Response } from "express";
import type { Pool, PoolClient } from "pg";
import type { DemoUser } from "../src/types/user";

type Authed = Request & { userId: string };

function makeAlphaNumCode(input: string, fallback: string): string {
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (cleaned.slice(0, 3) || fallback).padEnd(3, "X");
}

async function nextQuickBillNumber(
  client: PoolClient,
  regionId: string,
): Promise<string> {
  const yy = String(new Date().getFullYear()).slice(-2);
  const scopeCode = makeAlphaNumCode(regionId, "RGN");
  const seq = await client.query<{ last_value: number }>(
    `INSERT INTO number_sequences (prefix, scope_code, year_2, last_value)
     VALUES ($1, $2, $3, 1001)
     ON CONFLICT (prefix, scope_code, year_2)
     DO UPDATE SET last_value = number_sequences.last_value + 1
     RETURNING last_value`,
    ["QB", scopeCode, yy],
  );
  const num = String(seq.rows[0]!.last_value).padStart(4, "0");
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

    if (actor.role === "super_admin" || actor.role === "ho_admin") {
      if (regionIdQ) {
        params.push(regionIdQ);
        conditions.push(`qb.region_id = $${params.length}::text`);
      }
    } else if (
      actor.role === "regional_admin" ||
      actor.role === "ho_manager" ||
      actor.role === "ho_user" ||
      actor.role === "ho_accounts" ||
      actor.role === "service_centre_clerk" ||
      actor.role === "service_centre_supervisor" ||
      actor.role === "service_centre_inward" ||
      actor.role === "service_centre_outward" ||
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
      actor.role === "store_purchase_user" ||
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
                qb.created_at AS "createdAt",
                qb.region_id AS "regionId",
                r.name AS "regionName",
                qb.store_id AS "storeId",
                s.name AS "storeName",
                qb.customer_type AS "customerType",
                qb.customer_name AS "customerName",
                qb.company,
                qb.watch_brand AS "watchBrand",
                qb.payment_mode AS "paymentMode",
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
          createdAt,
          regionId: r.regionId,
          regionName: r.regionName ?? null,
          storeId: r.storeId ?? null,
          storeName: r.storeName ?? null,
          customerType: r.customerType,
          customerName: r.customerName ?? null,
          company: r.company ?? null,
          watchBrand: r.watchBrand,
          paymentMode: r.paymentMode,
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

  app.post("/api/service/quick-bills", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }

    let regionId = actor.regionId ?? "";
    let storeId: string | null = actor.storeId ?? null;
    if (actor.role === "super_admin" || actor.role === "ho_admin") {
      regionId = String(req.body?.regionId ?? "").trim() || regionId;
      const sid = req.body?.storeId;
      storeId = sid == null || sid === "" ? null : String(sid);
    }

    if (!regionId) {
      res.status(400).json({ error: "regionId is required (select a region for super admin accounts)." });
      return;
    }

    if (actor.role === "regional_admin" && actor.regionId !== regionId) {
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
        actor.role === "service_centre_inward" ||
        actor.role === "service_centre_outward" ||
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

    if (customerType === "B2B") {
      if (!company) {
        res.status(400).json({ error: "B2B: company name is required." });
        return;
      }
      if (!gst || !isValidGst(gst)) {
        res.status(400).json({ error: "B2B: valid 15-character GSTIN is required." });
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

    const watchBrand = String(req.body?.watchBrand ?? "").trim();
    const watchModel = String(req.body?.watchModel ?? "").trim();
    const watchRefRaw = req.body?.watchRef;
    const watchRef =
      watchRefRaw == null || String(watchRefRaw).trim() === "" ? null : String(watchRefRaw).trim();
    if (!watchBrand || !watchModel) {
      res.status(400).json({ error: "watchBrand and watchModel are required." });
      return;
    }

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

    const paymentMode = String(req.body?.paymentMode ?? "Cash");
    if (paymentMode !== "Cash" && paymentMode !== "Card" && paymentMode !== "UPI") {
      res.status(400).json({ error: "paymentMode must be Cash, Card, or UPI." });
      return;
    }

    const notes = String(req.body?.notes ?? "").trim();
    const rawLines = req.body?.lines;
    if (!Array.isArray(rawLines) || rawLines.length === 0) {
      res.status(400).json({ error: "lines array with at least one row is required." });
      return;
    }
    if (rawLines.length > 60) {
      res.status(400).json({ error: "Too many line items." });
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
      sum += amountInr;
    }

    const serviceChargeInr = Number(req.body?.serviceChargeInr ?? 0);
    if (Number.isFinite(serviceChargeInr) && serviceChargeInr > 0) {
      lineNo += 1;
      const rounded = Math.round(serviceChargeInr * 100) / 100;
      lines.push({
        lineNo,
        description: "Service / repair charge",
        amountInr: rounded,
        spareId: null,
        qty: 1,
      });
      sum += rounded;
    }

    const totalInr = Math.round(sum * 100) / 100;
    if (totalInr <= 0) {
      res.status(400).json({ error: "Total amount must be greater than zero." });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const billNumber = await nextQuickBillNumber(client, regionId);

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
           bill_number, region_id, store_id, customer_type, customer_name, phone, email,
           company, gst, pan, watch_brand, watch_model, watch_ref, technician_id, technician_name,
           payment_mode, notes, total_inr, created_by
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
         RETURNING id, created_at`,
        [
          billNumber,
          regionId,
          storeId,
          customerType,
          customerName,
          phone,
          email,
          company,
          gst,
          pan,
          watchBrand,
          watchModel,
          watchRef,
          technicianId,
          technicianName,
          paymentMode,
          notes,
          totalInr,
          actor.id,
        ],
      );
      const billId = ins.rows[0].id as string;
      const createdAt =
        ins.rows[0].created_at instanceof Date
          ? (ins.rows[0].created_at as Date).toISOString()
          : new Date(ins.rows[0].created_at as string).toISOString();

      for (const ln of lines) {
        await client.query(
          `INSERT INTO quick_bill_lines (quick_bill_id, line_no, description, amount_inr, spare_id, qty)
           VALUES ($1::uuid, $2, $3, $4, $5::uuid, $6)`,
          [billId, ln.lineNo, ln.description, ln.amountInr, ln.spareId, ln.qty],
        );
      }

      const detail = await client.query(
        `SELECT qb.id,
                qb.bill_number AS "billNumber",
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
                qb.watch_brand AS "watchBrand",
                qb.watch_model AS "watchModel",
                qb.watch_ref AS "watchRef",
                qb.technician_id AS "technicianId",
                qb.technician_name AS "technicianName",
                qb.payment_mode AS "paymentMode",
                qb.notes,
                qb.total_inr::float8 AS "totalInr"
         FROM quick_bills qb
         LEFT JOIN regions r ON r.id = qb.region_id
         LEFT JOIN stores s ON s.id = qb.store_id
         WHERE qb.id = $1::uuid`,
        [billId],
      );

      const { rows: lineRows } = await client.query(
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

      await client.query("COMMIT");

      const head = detail.rows[0] as Record<string, unknown>;
      res.json({
        invoice: {
          id: head.id,
          billNumber: head.billNumber,
          createdAt,
          regionId: head.regionId,
          regionName: head.regionName ?? null,
          storeId: head.storeId ?? null,
          storeName: head.storeName ?? null,
          customerType: head.customerType,
          customerName: head.customerName ?? null,
          phone: head.phone ?? null,
          email: head.email ?? null,
          company: head.company ?? null,
          gst: head.gst ?? null,
          pan: head.pan ?? null,
          watchBrand: head.watchBrand,
          watchModel: head.watchModel,
          watchRef: head.watchRef ?? null,
          technicianId: head.technicianId ?? null,
          technicianName: head.technicianName ?? null,
          paymentMode: head.paymentMode,
          notes: head.notes ?? "",
          totalInr: Number(head.totalInr),
          lines: lineRows.map((r) => ({
            lineNo: r.lineNo as number,
            description: r.description as string,
            amountInr: Number(r.amountInr),
            spareId: (r.spareId as string | null) ?? null,
            qty: Number(r.qty),
          })),
        },
      });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(e);
      res.status(400).json({ error: "Could not save quick bill." });
    } finally {
      client.release();
    }
  });
}
