import type { Pool } from "pg";
import { isTransientEinvoiceError } from "./mastersIndiaEdoc/client";
import { edocEnabled, tryGenerateEinvoiceForQuickBill, tryGenerateEinvoiceForSrfClose } from "./mastersIndiaEdoc/hooks";

const RETRY_INTERVAL_MS = 90_000;
const MAX_PER_CYCLE = 8;

async function retryPendingQuickBills(pool: Pool): Promise<void> {
  const { rows } = await pool.query<{ id: string; bill_number: string }>(
    `SELECT id, bill_number
     FROM quick_bills
     WHERE customer_type = 'B2B'
       AND edoc_irn IS NULL
       AND created_at > now() - interval '14 days'
       AND (
         edoc_status = 'PENDING'
         OR (
           edoc_status = 'FAILED'
           AND (
             edoc_error ILIKE '%expecting value%'
             OR edoc_error ILIKE '%504%'
             OR edoc_error ILIKE '%timeout%'
             OR edoc_error ILIKE '%empty response%'
             OR edoc_error ILIKE '%not responding%'
           )
         )
       )
     ORDER BY created_at DESC
     LIMIT $1`,
    [MAX_PER_CYCLE],
  );

  for (const row of rows) {
    try {
      const result = await tryGenerateEinvoiceForQuickBill(pool, row.id);
      if (result.ok && result.irn) {
        console.log(`[edoc-retry] IRN generated for ${row.bill_number}`);
      }
    } catch (e) {
      console.warn(`[edoc-retry] quick bill ${row.bill_number} failed:`, e instanceof Error ? e.message : e);
    }
  }
}

async function retryPendingSrfJobs(pool: Pool): Promise<void> {
  const { rows } = await pool.query<{ id: string; reference: string }>(
    `SELECT id, reference
     FROM srf_jobs
     WHERE edoc_irn IS NULL
       AND status = 'closed'
       AND created_at > now() - interval '14 days'
       AND (
         edoc_status = 'PENDING'
         OR (
           edoc_status = 'FAILED'
           AND edoc_error IS NOT NULL
           AND (
             edoc_error ILIKE '%expecting value%'
             OR edoc_error ILIKE '%504%'
             OR edoc_error ILIKE '%timeout%'
             OR edoc_error ILIKE '%empty response%'
             OR edoc_error ILIKE '%not responding%'
           )
         )
       )
     ORDER BY updated_at DESC
     LIMIT $1`,
    [MAX_PER_CYCLE],
  );

  for (const row of rows) {
    try {
      const result = await tryGenerateEinvoiceForSrfClose(pool, row.id);
      if (result.ok && result.irn) {
        console.log(`[edoc-retry] IRN generated for SRF ${row.reference}`);
      }
    } catch (e) {
      console.warn(`[edoc-retry] SRF ${row.reference} failed:`, e instanceof Error ? e.message : e);
    }
  }
}

async function runEdocRetryCycle(pool: Pool): Promise<void> {
  if (!edocEnabled()) return;
  try {
    await retryPendingQuickBills(pool);
    await retryPendingSrfJobs(pool);
  } catch (e) {
    console.warn("[edoc-retry] cycle failed:", e instanceof Error ? e.message : e);
  }
}

export function startEdocRetryWorker(pool: Pool): void {
  setInterval(() => {
    void runEdocRetryCycle(pool);
  }, RETRY_INTERVAL_MS);
  void runEdocRetryCycle(pool);
  console.log("[edoc-retry] Background e-invoice retry worker started (every 90s).");
}

export { isTransientEinvoiceError };
