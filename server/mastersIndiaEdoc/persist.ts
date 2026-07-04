import type { Pool, PoolClient } from "pg";
import type { EdocResult } from "./types";

type Db = Pool | PoolClient;

function edocPersistStatus(result: EdocResult): string {
  if (result.ok) return "SUCCESS";
  if (result.skipped) return "SKIPPED";
  if (result.pending) return "PENDING";
  return "FAILED";
}

export async function saveQuickBillEdoc(db: Db, billId: string, result: EdocResult): Promise<void> {
  await db.query(
    `UPDATE quick_bills
     SET edoc_irn = $2,
         edoc_ack_no = $3,
         edoc_ack_date = $4,
         edoc_status = $5,
         edoc_error = $6,
         edoc_qr = $8,
         edoc_pdf_url = COALESCE($9, edoc_pdf_url),
         edoc_generated_at = CASE WHEN $7::boolean THEN now() ELSE edoc_generated_at END
     WHERE id = $1::uuid`,
    [
      billId,
      result.irn ?? null,
      result.ackNo ?? null,
      result.ackDate ?? null,
      edocPersistStatus(result),
      result.error ?? result.skipReason ?? null,
      result.ok,
      result.qrUrl ?? null,
      result.pdfUrl ?? null,
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
      result.ok ? "SUCCESS" : result.skipped ? "SKIPPED" : result.pending ? "PENDING" : "FAILED",
      result.error ?? result.skipReason ?? null,
      result.ok,
      result.qrUrl ?? null,
    ],
  );
}

export async function saveServiceInvoiceEdoc(db: Db, invoiceId: string, result: EdocResult): Promise<void> {
  await db.query(
    `UPDATE service_invoices
     SET edoc_irn = $2,
         edoc_ack_no = $3,
         edoc_ack_date = $4,
         edoc_status = $5,
         edoc_error = $6,
         edoc_qr = $8,
         edoc_generated_at = CASE WHEN $7::boolean THEN now() ELSE edoc_generated_at END
     WHERE id = $1::uuid`,
    [
      invoiceId,
      result.irn ?? null,
      result.ackNo ?? null,
      result.ackDate ?? null,
      result.ok ? "SUCCESS" : result.skipped ? "SKIPPED" : result.pending ? "PENDING" : "FAILED",
      result.error ?? result.skipReason ?? null,
      result.ok,
      result.qrUrl ?? null,
    ],
  );
}

export async function saveSrfEwayEdoc(db: Db, srfId: string, result: EdocResult): Promise<void> {
  await db.query(
    `UPDATE srf_jobs
     SET edoc_eway_bill_no = $2,
         edoc_eway_valid_upto = $3,
         edoc_error = COALESCE($4, edoc_error),
         edoc_eway_pdf_url = COALESCE($6, edoc_eway_pdf_url),
         edoc_generated_at = CASE WHEN $5::boolean THEN now() ELSE edoc_generated_at END
     WHERE id = $1::uuid`,
    [
      srfId,
      result.ewayBillNo ?? null,
      result.ewayValidUpto ?? null,
      result.error ?? result.skipReason ?? null,
      result.ok,
      result.pdfUrl ?? null,
    ],
  );
}

export async function saveInterHoSpareOrderEwayEdoc(db: Db, orderId: string, result: EdocResult): Promise<void> {
  await db.query(
    `UPDATE srf_inter_ho_spare_orders
     SET edoc_eway_bill_no = $2,
         edoc_eway_valid_upto = $3,
         edoc_error = $4,
         edoc_eway_pdf_url = COALESCE($6, edoc_eway_pdf_url),
         edoc_generated_at = CASE WHEN $5::boolean THEN now() ELSE edoc_generated_at END
     WHERE id = $1::uuid`,
    [
      orderId,
      result.ewayBillNo ?? null,
      result.ewayValidUpto ?? null,
      result.error ?? result.skipReason ?? null,
      result.ok,
      result.pdfUrl ?? null,
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
         edoc_eway_pdf_url = COALESCE($7, edoc_eway_pdf_url),
         edoc_generated_at = CASE WHEN $6::boolean THEN now() ELSE edoc_generated_at END
     WHERE id = $1::uuid`,
    [
      dcId,
      result.ewayBillNo ?? null,
      result.ewayValidUpto ?? null,
      result.ok ? "SUCCESS" : result.skipped ? "SKIPPED" : result.pending ? "PENDING" : "FAILED",
      result.error ?? result.skipReason ?? null,
      result.ok,
      result.pdfUrl ?? null,
    ],
  );
}
