import type { Express, Request, Response } from "express";
import type { Pool } from "pg";
import type { DemoUser } from "../src/types/user";
import {
  createServiceInvoice,
  recordInvoicePayment,
  syncInvoicesFromLegacySources,
} from "./serviceInvoiceLedger";
import {
  edocEnabled,
  tryGenerateEinvoiceForInterHoInvoice,
  tryGenerateEinvoiceForSrfClose,
} from "./mastersIndiaEdoc";

type Authed = Request & { userId: string };

function canAccessAccounts(actor: DemoUser): boolean {
  return (
    actor.role === "super_admin" ||
    actor.role === "admin" ||
    actor.role === "ho_accounts" ||
    actor.role === "ho_manager" ||
    actor.role === "store_accounts" ||
    actor.role === "service_centre_supervisor"
  );
}

function invoiceScopeSql(
  actor: DemoUser,
  alias = "si",
  paramIndex = 1,
): { sql: string; params: string[] } {
  if (actor.role === "super_admin" || actor.role === "admin") {
    return { sql: "TRUE", params: [] };
  }
  if (!actor.regionId) return { sql: "FALSE", params: [] };
  return { sql: `${alias}.region_id = $${paramIndex}`, params: [actor.regionId] };
}

const INVOICE_SRF_JOIN = `
  LEFT JOIN srf_jobs sj ON sj.id::text = si.source_id
    AND si.source_type IN ('srf_store', 'inter_ho_repair')
`;

const INVOICE_SRF_SELECT = `
  si.*,
  sj.reference AS job_srf_reference,
  sj.edoc_irn AS sj_edoc_irn,
  sj.edoc_ack_no AS sj_edoc_ack_no,
  sj.edoc_ack_date AS sj_edoc_ack_date,
  sj.edoc_status AS sj_edoc_status,
  sj.edoc_error AS sj_edoc_error,
  sj.edoc_qr AS sj_edoc_qr,
  sj.edoc_generated_at AS sj_edoc_generated_at,
  COALESCE(
    NULLIF(TRIM(sj.transfer_source_reference), ''),
    NULLIF(TRIM(sj.reference), ''),
    NULLIF(TRIM(si.srf_reference), '')
  ) AS root_srf_reference
`;

function resolveInvoiceEdoc(row: Record<string, unknown>, field: string): string | null {
  const sourceType = String(row.source_type ?? "");
  const fromSi = row[`edoc_${field}`] != null ? String(row[`edoc_${field}`]).trim() : "";
  const fromSj = row[`sj_edoc_${field}`] != null ? String(row[`sj_edoc_${field}`]).trim() : "";
  const value = sourceType === "srf_store" ? fromSj || fromSi : fromSi || fromSj;
  return value || null;
}

function mapInvoiceRow(row: Record<string, unknown>) {
  const jobSrf = row.job_srf_reference != null ? String(row.job_srf_reference).trim() : "";
  const rootSrf = row.root_srf_reference != null ? String(row.root_srf_reference).trim() : "";
  const storedSrf = row.srf_reference != null ? String(row.srf_reference).trim() : "";
  const edocStatus = resolveInvoiceEdoc(row, "status");
  return {
    id: String(row.id),
    invoiceNumber: String(row.invoice_number),
    invoiceDate: row.invoice_date,
    sourceType: String(row.source_type),
    sourceId: row.source_id != null ? String(row.source_id) : null,
    regionId: row.region_id != null ? String(row.region_id) : null,
    storeId: row.store_id != null ? String(row.store_id) : null,
    customerId: row.customer_id != null ? String(row.customer_id) : null,
    customerName: String(row.customer_name ?? ""),
    customerPhone: row.customer_phone != null ? String(row.customer_phone) : null,
    customerGstin: row.customer_gstin != null ? String(row.customer_gstin) : null,
    srfReference: jobSrf || storedSrf || null,
    rootSrfReference: rootSrf || storedSrf || null,
    totalInr: Number(row.total_inr),
    paidInr: Number(row.paid_inr),
    balanceDueInr: Number(row.balance_due_inr),
    paymentStatus: String(row.payment_status),
    taxJson: row.tax_json,
    snapshotJson: row.snapshot_json,
    edocIrn: resolveInvoiceEdoc(row, "irn"),
    edocAckNo: resolveInvoiceEdoc(row, "ack_no"),
    edocAckDate: resolveInvoiceEdoc(row, "ack_date"),
    edocStatus,
    edocError: resolveInvoiceEdoc(row, "error"),
    edocQr: resolveInvoiceEdoc(row, "qr"),
    edocGeneratedAt:
      String(row.source_type ?? "") === "srf_store"
        ? row.sj_edoc_generated_at ?? null
        : row.edoc_generated_at ?? row.sj_edoc_generated_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function registerServiceInvoiceRoutes(
  app: Express,
  pool: Pool,
  requireAuth: (req: Request, res: Response, next: () => void) => void,
  getUserById: (id: string) => DemoUser | null,
): void {
  app.get("/api/accounts/invoices", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || !canAccessAccounts(actor)) {
      res.status(403).json({ error: "Not allowed to view invoice history." });
      return;
    }
    try {
      if (req.query.sync === "1") {
        await syncInvoicesFromLegacySources(pool);
      }
      const scope = invoiceScopeSql(actor);
      const status = String(req.query.status ?? "").trim();
      const sourceType = String(req.query.sourceType ?? "").trim();
      const q = String(req.query.q ?? "").trim().toLowerCase();
      const limit = Math.min(500, Math.max(1, Number.parseInt(String(req.query.limit ?? "200"), 10) || 200));

      const params: unknown[] = [...scope.params];
      let paramIdx = scope.params.length;
      const clauses: string[] = [scope.sql];

      // SRF invoices only (store close + inter-HO repair) — not quick bills
      clauses.push(`si.source_type IN ('srf_store', 'inter_ho_repair')`);

      if (status && status !== "ALL") {
        paramIdx += 1;
        clauses.push(`si.payment_status = $${paramIdx}`);
        params.push(status);
      }
      if (sourceType && sourceType !== "ALL") {
        paramIdx += 1;
        clauses.push(`si.source_type = $${paramIdx}`);
        params.push(sourceType);
      }
      if (q) {
        paramIdx += 1;
        clauses.push(
          `(LOWER(si.invoice_number) LIKE $${paramIdx} OR LOWER(si.customer_name) LIKE $${paramIdx} OR LOWER(COALESCE(si.srf_reference, '')) LIKE $${paramIdx} OR LOWER(COALESCE(sj.transfer_source_reference, sj.reference, '')) LIKE $${paramIdx})`,
        );
        params.push(`%${q}%`);
      }

      paramIdx += 1;
      params.push(String(limit));

      const result = await pool.query(
        `SELECT ${INVOICE_SRF_SELECT}
         FROM service_invoices si
         ${INVOICE_SRF_JOIN}
         WHERE ${clauses.join(" AND ")}
         ORDER BY si.created_at DESC
         LIMIT $${paramIdx}`,
        params,
      );
      res.json({ rows: result.rows.map((r) => mapInvoiceRow(r as Record<string, unknown>)) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not load invoice history." });
    }
  });

  app.get("/api/accounts/invoices/:invoiceId", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || !canAccessAccounts(actor)) {
      res.status(403).json({ error: "Not allowed." });
      return;
    }
    const invoiceId = String(req.params.invoiceId ?? "").trim();
    const scope = invoiceScopeSql(actor, "si", 2);
    try {
      const inv = await pool.query(
        `SELECT ${INVOICE_SRF_SELECT}
         FROM service_invoices si
         ${INVOICE_SRF_JOIN}
         WHERE si.id = $1::uuid AND ${scope.sql}`,
        [invoiceId, ...scope.params],
      );
      const row = inv.rows[0];
      if (!row) {
        res.status(404).json({ error: "Invoice not found." });
        return;
      }
      const payments = await pool.query(
        `SELECT id, voucher_ref, amount_inr::float8 AS amount_inr, payment_mode, payment_details,
                narration, posted_at, created_by
         FROM invoice_payments WHERE invoice_id = $1::uuid ORDER BY posted_at DESC`,
        [invoiceId],
      );
      res.json({
        invoice: mapInvoiceRow(row as Record<string, unknown>),
        payments: payments.rows.map((p) => ({
          id: String(p.id),
          voucherRef: String(p.voucher_ref),
          amountInr: Number(p.amount_inr),
          paymentMode: String(p.payment_mode),
          paymentDetails: p.payment_details,
          narration: p.narration != null ? String(p.narration) : null,
          postedAt: p.posted_at,
          createdBy: p.created_by != null ? String(p.created_by) : null,
        })),
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not load invoice." });
    }
  });

  app.post("/api/accounts/invoices/:invoiceId/payments", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || !canAccessAccounts(actor)) {
      res.status(403).json({ error: "Not allowed to record payments." });
      return;
    }
    const invoiceId = String(req.params.invoiceId ?? "").trim();
    const amountInr = Number(req.body?.amountInr);
    const paymentMode = String(req.body?.paymentMode ?? "").trim();
    const narration = String(req.body?.narration ?? "").trim() || null;
    const paymentDetails =
      req.body?.paymentDetails != null && typeof req.body.paymentDetails === "object"
        ? req.body.paymentDetails
        : {};

    if (!Number.isFinite(amountInr) || amountInr <= 0) {
      res.status(400).json({ error: "amountInr must be greater than zero." });
      return;
    }
    if (!paymentMode) {
      res.status(400).json({ error: "paymentMode is required." });
      return;
    }

    const scope = invoiceScopeSql(actor, "si", 2);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const check = await client.query(
        `SELECT si.id FROM service_invoices si WHERE si.id = $1::uuid AND ${scope.sql} FOR UPDATE`,
        [invoiceId, ...scope.params],
      );
      if (check.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Invoice not found." });
        return;
      }
      const invRow = await client.query<{
        source_type: string;
        source_id: string | null;
        edoc_irn: string | null;
        edoc_status: string | null;
        sj_edoc_irn: string | null;
        sj_edoc_status: string | null;
      }>(
        `SELECT si.source_type, si.source_id, si.edoc_irn, si.edoc_status,
                sj.edoc_irn AS sj_edoc_irn, sj.edoc_status AS sj_edoc_status
         FROM service_invoices si
         LEFT JOIN srf_jobs sj ON sj.id::text = si.source_id
           AND si.source_type IN ('srf_store', 'inter_ho_repair')
         WHERE si.id = $1::uuid`,
        [invoiceId],
      );
      const invMeta = invRow.rows[0];
      const resolvedIrn =
        invMeta?.source_type === "srf_store"
          ? String(invMeta.sj_edoc_irn ?? "").trim()
          : String(invMeta?.edoc_irn ?? invMeta?.sj_edoc_irn ?? "").trim();
      const resolvedStatus =
        invMeta?.source_type === "srf_store"
          ? invMeta.sj_edoc_status
          : invMeta?.edoc_status ?? invMeta?.sj_edoc_status;
      if (
        (invMeta?.source_type === "inter_ho_repair" || invMeta?.source_type === "srf_store") &&
        edocEnabled() &&
        !resolvedIrn &&
        resolvedStatus !== "SKIPPED"
      ) {
        await client.query("ROLLBACK");
        res.status(400).json({
          error:
            "GST e-invoice (IRN) is mandatory before recording payment. Generate e-invoice first.",
        });
        return;
      }
      const out = await recordInvoicePayment(client, {
        invoiceId,
        amountInr,
        paymentMode,
        paymentDetails,
        narration,
        createdBy: actor.id,
      });
      await client.query("COMMIT");
      res.json({ ok: true, ...out });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      res.status(400).json({ error: e instanceof Error ? e.message : "Could not record payment." });
    } finally {
      client.release();
    }
  });

  app.get("/api/accounts/ledger", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || !canAccessAccounts(actor)) {
      res.status(403).json({ error: "Not allowed to view ledger." });
      return;
    }
    try {
      const scope = invoiceScopeSql(actor, "le");
      const accountCode = String(req.query.accountCode ?? "").trim();
      const voucherRef = String(req.query.voucherRef ?? "").trim();
      const limit = Math.min(500, Math.max(1, Number.parseInt(String(req.query.limit ?? "200"), 10) || 200));

      const params: unknown[] = [...scope.params];
      let paramIdx = scope.params.length;
      const clauses: string[] = [scope.sql.replace(/si\./g, "le.")];

      if (accountCode) {
        paramIdx += 1;
        clauses.push(`le.account_code = $${paramIdx}`);
        params.push(accountCode);
      }
      if (voucherRef) {
        paramIdx += 1;
        clauses.push(`le.voucher_ref ILIKE $${paramIdx}`);
        params.push(`%${voucherRef}%`);
      }

      paramIdx += 1;
      params.push(String(limit));

      const result = await pool.query(
        `SELECT le.id, le.voucher_ref, le.voucher_type, le.account_code, le.account_name,
                le.debit_inr::float8 AS debit_inr, le.credit_inr::float8 AS credit_inr,
                le.reference_type, le.reference_id, le.narration, le.region_id, le.posted_at
         FROM ledger_entries le
         WHERE ${clauses.join(" AND ")}
         ORDER BY le.posted_at DESC, le.id DESC
         LIMIT $${paramIdx}`,
        params,
      );
      res.json({
        rows: result.rows.map((r) => ({
          id: String(r.id),
          voucherRef: String(r.voucher_ref),
          voucherType: String(r.voucher_type),
          accountCode: String(r.account_code),
          accountName: String(r.account_name),
          debitInr: Number(r.debit_inr),
          creditInr: Number(r.credit_inr),
          referenceType: r.reference_type != null ? String(r.reference_type) : null,
          referenceId: r.reference_id != null ? String(r.reference_id) : null,
          narration: r.narration != null ? String(r.narration) : null,
          regionId: r.region_id != null ? String(r.region_id) : null,
          postedAt: r.posted_at,
        })),
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not load ledger." });
    }
  });

  app.post("/api/accounts/invoices/:invoiceId/generate-einvoice", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || !canAccessAccounts(actor)) {
      res.status(403).json({ error: "Not allowed." });
      return;
    }
    const invoiceId = String(req.params.invoiceId ?? "").trim();
    const scope = invoiceScopeSql(actor, "si", 2);
    try {
      const check = await pool.query(
        `SELECT si.id, si.source_type, si.source_id FROM service_invoices si WHERE si.id = $1::uuid AND ${scope.sql}`,
        [invoiceId, ...scope.params],
      );
      if (check.rowCount === 0) {
        res.status(404).json({ error: "Invoice not found." });
        return;
      }
      const sourceType = String(check.rows[0]?.source_type ?? "");
      const sourceId = check.rows[0]?.source_id != null ? String(check.rows[0].source_id) : "";
      if (sourceType !== "inter_ho_repair" && sourceType !== "srf_store") {
        res.status(400).json({ error: "E-invoice generation applies to SRF store and inter-HO repair invoices only." });
        return;
      }
      const edoc =
        sourceType === "inter_ho_repair"
          ? await tryGenerateEinvoiceForInterHoInvoice(pool, invoiceId)
          : sourceId
            ? await tryGenerateEinvoiceForSrfClose(pool, sourceId)
            : { ok: false, skipped: true, skipReason: "Linked SRF not found" };
      const inv = await pool.query(
        `SELECT ${INVOICE_SRF_SELECT}
         FROM service_invoices si
         ${INVOICE_SRF_JOIN}
         WHERE si.id = $1::uuid`,
        [invoiceId],
      );
      res.json({
        ok: edoc.ok,
        edoc,
        invoice: inv.rows[0] ? mapInvoiceRow(inv.rows[0] as Record<string, unknown>) : null,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not generate e-invoice." });
    }
  });

  app.post("/api/accounts/invoices/sync", requireAuth, async (_req, res) => {
    const actor = getUserById((_req as Authed).userId);
    if (!actor || !canAccessAccounts(actor)) {
      res.status(403).json({ error: "Not allowed." });
      return;
    }
    try {
      const count = await syncInvoicesFromLegacySources(pool);
      res.json({ ok: true, synced: count });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not sync invoices." });
    }
  });
}
