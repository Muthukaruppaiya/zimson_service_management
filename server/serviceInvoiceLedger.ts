import type { Pool, PoolClient } from "pg";

export type ServiceInvoiceSourceType = "quick_bill" | "srf_store" | "inter_ho_repair" | "ho_billing";

export type DefaultLedgers = {
  sales: string;
  receivable: string;
  cash: string;
  bank: string;
  taxOutput: string;
};

const DEFAULT_LEDGERS: DefaultLedgers = {
  sales: "Service Sales",
  receivable: "Accounts Receivable",
  cash: "Cash In Hand",
  bank: "Bank Account",
  taxOutput: "Output GST",
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function paymentStatus(total: number, paid: number): "unpaid" | "partial" | "paid" {
  const balance = round2(total - paid);
  if (balance <= 0.01) return "paid";
  if (paid > 0.01) return "partial";
  return "unpaid";
}

function nextVoucherRef(prefix: string): string {
  const seq = String(Math.floor(Math.random() * 9000) + 1000);
  return `${prefix}-${new Date().getFullYear()}-${Date.now().toString(36).slice(-6)}${seq}`;
}

function cashOrBankLedger(mode: string, ledgers: DefaultLedgers): { code: string; name: string } {
  const m = mode.trim().toLowerCase();
  if (m.includes("cash")) return { code: "cash", name: ledgers.cash };
  return { code: "bank", name: ledgers.bank };
}

export async function postLedgerPair(
  client: PoolClient,
  params: {
    voucherRef: string;
    voucherType: string;
    debit: { code: string; name: string; amount: number };
    credit: { code: string; name: string; amount: number };
    referenceType?: string | null;
    referenceId?: string | null;
    narration?: string | null;
    regionId?: string | null;
    createdBy?: string | null;
  },
): Promise<void> {
  const amt = round2(params.debit.amount);
  if (amt <= 0) return;
  await client.query(
    `INSERT INTO ledger_entries (
       voucher_ref, voucher_type, account_code, account_name,
       debit_inr, credit_inr, reference_type, reference_id, narration, region_id, created_by
     ) VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8, $9, $10),
              ($1, $2, $11, $12, 0, $5, $6, $7, $8, $9, $10)`,
    [
      params.voucherRef,
      params.voucherType,
      params.debit.code,
      params.debit.name,
      amt,
      params.referenceType ?? null,
      params.referenceId ?? null,
      params.narration ?? null,
      params.regionId ?? null,
      params.createdBy ?? null,
      params.credit.code,
      params.credit.name,
    ],
  );
}

export async function createServiceInvoice(
  client: PoolClient,
  params: {
    invoiceNumber: string;
    sourceType: ServiceInvoiceSourceType;
    sourceId: string;
    regionId?: string | null;
    storeId?: string | null;
    customerId?: string | null;
    customerName: string;
    customerPhone?: string | null;
    customerGstin?: string | null;
    srfReference?: string | null;
    totalInr: number;
    taxJson?: Record<string, unknown>;
    snapshotJson?: Record<string, unknown>;
    createdBy?: string | null;
    initialPaidInr?: number;
    initialPaymentMode?: string | null;
    postSalesLedger?: boolean;
  },
): Promise<string> {
  const total = round2(Math.max(0, params.totalInr));
  const paid = round2(Math.max(0, Math.min(params.initialPaidInr ?? 0, total)));

  const existing = await client.query<{ id: string }>(
    `SELECT id FROM service_invoices
     WHERE source_type = $1 AND source_id = $2
     LIMIT 1`,
    [params.sourceType, params.sourceId],
  );
  if (existing.rows[0]?.id) return existing.rows[0].id;

  const dupNum = await client.query<{ id: string }>(
    `SELECT id FROM service_invoices WHERE invoice_number = $1 LIMIT 1`,
    [params.invoiceNumber],
  );
  if (dupNum.rows[0]?.id) return dupNum.rows[0].id;

  const ins = await client.query<{ id: string }>(
    `INSERT INTO service_invoices (
       invoice_number, source_type, source_id, region_id, store_id,
       customer_id, customer_name, customer_phone, customer_gstin, srf_reference,
       total_inr, tax_json, paid_inr, balance_due_inr, payment_status, snapshot_json, created_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, 0, $11, 'unpaid', $13::jsonb, $14)
     RETURNING id`,
    [
      params.invoiceNumber,
      params.sourceType,
      params.sourceId,
      params.regionId ?? null,
      params.storeId ?? null,
      params.customerId ?? null,
      params.customerName,
      params.customerPhone ?? null,
      params.customerGstin ?? null,
      params.srfReference ?? null,
      total,
      JSON.stringify(params.taxJson ?? {}),
      JSON.stringify(params.snapshotJson ?? {}),
      params.createdBy ?? null,
    ],
  );
  const invoiceId = ins.rows[0]!.id;

  if (params.postSalesLedger !== false && total > 0) {
    const voucherRef = nextVoucherRef("INV");
    const ledgers = DEFAULT_LEDGERS;
    await postLedgerPair(client, {
      voucherRef,
      voucherType: "invoice",
      debit: { code: "receivable", name: ledgers.receivable, amount: total },
      credit: { code: "sales", name: ledgers.sales, amount: total },
      referenceType: "service_invoice",
      referenceId: invoiceId,
      narration: `Invoice ${params.invoiceNumber} — ${params.customerName}`,
      regionId: params.regionId ?? null,
      createdBy: params.createdBy ?? null,
    });
  }

  if (paid > 0) {
    await recordInvoicePayment(client, {
      invoiceId,
      amountInr: paid,
      paymentMode: params.initialPaymentMode?.trim() || "Collection at billing",
      narration: "Initial collection at invoice creation",
      createdBy: params.createdBy ?? null,
    });
  }

  return invoiceId;
}

export async function recordInvoicePayment(
  client: PoolClient,
  params: {
    invoiceId: string;
    amountInr: number;
    paymentMode: string;
    paymentDetails?: Record<string, unknown>;
    narration?: string | null;
    createdBy?: string | null;
    skipInvoiceUpdate?: boolean;
  },
): Promise<{ paymentId: string; voucherRef: string }> {
  const lock = await client.query<{
    invoice_number: string;
    total_inr: string;
    paid_inr: string;
    balance_due_inr: string;
    region_id: string | null;
    customer_name: string;
  }>(
    `SELECT invoice_number, total_inr::text, paid_inr::text, balance_due_inr::text, region_id, customer_name
     FROM service_invoices WHERE id = $1::uuid FOR UPDATE`,
    [params.invoiceId],
  );
  const row = lock.rows[0];
  if (!row) throw new Error("Invoice not found.");

  const amount = round2(params.amountInr);
  if (amount <= 0) throw new Error("Payment amount must be greater than zero.");

  const balance = round2(Number(row.balance_due_inr));
  if (amount > balance + 0.01) {
    throw new Error(`Payment exceeds balance due (INR ${balance.toFixed(2)}).`);
  }

  const voucherRef = nextVoucherRef("RCPT");
  const payIns = await client.query<{ id: string }>(
    `INSERT INTO invoice_payments (
       invoice_id, voucher_ref, amount_inr, payment_mode, payment_details, narration, created_by
     ) VALUES ($1::uuid, $2, $3, $4, $5::jsonb, $6, $7)
     RETURNING id`,
    [
      params.invoiceId,
      voucherRef,
      amount,
      params.paymentMode,
      JSON.stringify(params.paymentDetails ?? {}),
      params.narration ?? null,
      params.createdBy ?? null,
    ],
  );

  const ledgers = DEFAULT_LEDGERS;
  const dest = cashOrBankLedger(params.paymentMode, ledgers);
  await postLedgerPair(client, {
    voucherRef,
    voucherType: "receipt",
    debit: { code: dest.code, name: dest.name, amount },
    credit: { code: "receivable", name: ledgers.receivable, amount },
    referenceType: "invoice_payment",
    referenceId: payIns.rows[0]!.id,
    narration: params.narration ?? `Receipt against ${row.invoice_number}`,
    regionId: row.region_id,
    createdBy: params.createdBy ?? null,
  });

  if (!params.skipInvoiceUpdate) {
    const total = round2(Number(row.total_inr));
    const newPaid = round2(Number(row.paid_inr) + amount);
    const newBalance = round2(Math.max(0, total - newPaid));
    const status = paymentStatus(total, newPaid);
    await client.query(
      `UPDATE service_invoices
       SET paid_inr = $2, balance_due_inr = $3, payment_status = $4, updated_at = now()
       WHERE id = $1::uuid`,
      [params.invoiceId, newPaid, newBalance, status],
    );
  }

  return { paymentId: payIns.rows[0]!.id, voucherRef };
}

export async function syncInvoicesFromLegacySources(pool: Pool): Promise<number> {
  const client = await pool.connect();
  let count = 0;
  try {
    await client.query("BEGIN");

    const srfStore = await client.query<{
      id: string;
      invoice_number: string;
      reference: string;
      region_id: string;
      store_id: string;
      customer_name: string;
      phone: string;
      store_billing_snapshot: unknown;
      created_by: string | null;
    }>(
      `SELECT id::text, invoice_number, reference, region_id, store_id, customer_name, phone,
              store_billing_snapshot, modified_by AS created_by
       FROM srf_jobs
       WHERE status = 'closed'
         AND NULLIF(TRIM(invoice_number), '') IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM service_invoices si WHERE si.source_type = 'srf_store' AND si.source_id = srf_jobs.id::text
         )
       ORDER BY closed_at DESC NULLS LAST
       LIMIT 500`,
    );
    for (const row of srfStore.rows) {
      const snap =
        row.store_billing_snapshot && typeof row.store_billing_snapshot === "object"
          ? (row.store_billing_snapshot as Record<string, unknown>)
          : {};
      const total = Number(snap.netPayable ?? snap.grandTotal ?? snap.collectionAmountInr ?? 0);
      await createServiceInvoice(client, {
        invoiceNumber: row.invoice_number.trim(),
        sourceType: "srf_store",
        sourceId: row.id,
        regionId: row.region_id,
        storeId: row.store_id,
        customerId: null,
        customerName: row.customer_name,
        customerPhone: row.phone,
        srfReference: row.reference,
        totalInr: total > 0 ? total : Number(snap.estimateTotalInr ?? 0),
        snapshotJson: snap,
        createdBy: row.created_by,
        initialPaidInr: total > 0 ? total : 0,
        initialPaymentMode: typeof snap.collectionPaymentMode === "string" ? snap.collectionPaymentMode : "Store billing",
        postSalesLedger: true,
      });
      count += 1;
    }

    const interHo = await client.query<{
      id: string;
      ho_spares_bill_ref: string;
      reference: string;
      transfer_source_reference: string | null;
      region_id: string;
      transfer_source_region_id: string | null;
      customer_name: string;
      used_spares: unknown;
      modified_by: string | null;
    }>(
      `SELECT id::text, ho_spares_bill_ref, reference, transfer_source_reference, region_id, transfer_source_region_id,
              customer_name, used_spares, modified_by AS created_by
       FROM srf_jobs
       WHERE NULLIF(TRIM(ho_spares_bill_ref), '') IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM service_invoices si WHERE si.source_type = 'inter_ho_repair' AND si.source_id = srf_jobs.id::text
         )
       ORDER BY updated_at DESC
       LIMIT 500`,
    );
    for (const row of interHo.rows) {
      const total = sumUsedSparesTotal(row.used_spares);
      const rootRef = (row.transfer_source_reference ?? "").trim() || row.reference;
      await createServiceInvoice(client, {
        invoiceNumber: row.ho_spares_bill_ref.trim(),
        sourceType: "inter_ho_repair",
        sourceId: row.id,
        regionId: row.region_id,
        customerName: row.customer_name || "Sender HO",
        srfReference: row.reference,
        totalInr: total,
        snapshotJson: {
          usedSpares: row.used_spares,
          transferSourceRegionId: row.transfer_source_region_id,
          transferSourceReference: row.transfer_source_reference,
          rootSrfReference: rootRef,
        },
        createdBy: row.created_by,
        postSalesLedger: true,
      });
      count += 1;
    }

    await client.query("COMMIT");
    return count;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export function sumUsedSparesTotal(usedSpares: unknown): number {
  if (!Array.isArray(usedSpares)) return 0;
  return round2(
    usedSpares.reduce((sum, line) => {
      if (!line || typeof line !== "object") return sum;
      const l = line as Record<string, unknown>;
      const qty = Number(l.qty ?? 0);
      const rate = Number(l.unitPriceInr ?? l.unit_price_inr ?? 0);
      return sum + qty * rate;
    }, 0),
  );
}
