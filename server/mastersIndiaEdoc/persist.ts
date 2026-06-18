import type { Pool, PoolClient } from "pg";
import type { EdocResult } from "./types";

type Db = Pool | PoolClient;

export async function saveQuickBillEdoc(db: Db, billId: string, result: EdocResult): Promise<void> {
  await db.query(
    `UPDATE quick_bills
     SET edoc_irn = $2,
         edoc_ack_no = $3,
         edoc_ack_date = $4,
         edoc_status = $5,
         edoc_error = $6,
         edoc_qr = $8,
         edoc_generated_at = CASE WHEN $7::boolean THEN now() ELSE edoc_generated_at END
     WHERE id = $1::uuid`,
    [
      billId,
      result.irn ?? null,
      result.ackNo ?? null,
      result.ackDate ?? null,
      result.ok ? "SUCCESS" : result.skipped ? "SKIPPED" : "FAILED",
      result.error ?? result.skipReason ?? null,
      result.ok,
      result.qrUrl ?? null,
    ],
  );
}

export async function saveSrfEdoc(db: Db, srfId: string, result: EdocResult): Promise<void> {
  await db.query(
    `UPDATE srf_jobs
     SET edoc_irn = $2,
         edoc_ack_no = $3,
         edoc_ack_date = $4,
         edoc_status = $5,
         edoc_error = $6,
         edoc_qr = $8,
         edoc_generated_at = CASE WHEN $7::boolean THEN now() ELSE edoc_generated_at END
     WHERE id = $1::uuid`,
    [
      srfId,
      result.irn ?? null,
      result.ackNo ?? null,
      result.ackDate ?? null,
      result.ok ? "SUCCESS" : result.skipped ? "SKIPPED" : "FAILED",
      result.error ?? result.skipReason ?? null,
      result.ok,
      result.qrUrl ?? null,
    ],
  );
}

export async function saveDeliveryChallanEdoc(db: Db, dcId: string, result: EdocResult): Promise<void> {
  await db.query(
    `UPDATE delivery_challans
     SET edoc_eway_bill_no = $2,
         edoc_eway_valid_upto = $3,
         edoc_status = $4,
         edoc_error = $5,
         edoc_generated_at = CASE WHEN $6::boolean THEN now() ELSE edoc_generated_at END
     WHERE id = $1::uuid`,
    [
      dcId,
      result.ewayBillNo ?? null,
      result.ewayValidUpto ?? null,
      result.ok ? "SUCCESS" : result.skipped ? "SKIPPED" : "FAILED",
      result.error ?? result.skipReason ?? null,
      result.ok,
    ],
  );
}
