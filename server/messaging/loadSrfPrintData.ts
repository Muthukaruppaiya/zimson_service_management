import type { Pool } from "pg";
import { repairRouteLabel } from "../../src/lib/srfRepairRoute";

export type SrfPrintData = {
  reference: string;
  customerName: string;
  phone: string;
  company?: string;
  watchBrand: string;
  watchFamily: string;
  watchModel: string;
  serial: string;
  complaint: string;
  estimateTotalInr: number;
  estimatedFinishDate?: string | null;
  advanceInr: number;
  advancePaymentMode?: string | null;
  natureOfRepair?: string;
  repairRoute?: string;
  caseType?: string;
  strapChainType?: string;
  chainCount?: string;
  customerRemarks?: string;
  bookingDate?: string;
  storeDisplayName: string;
  storeTagline: string;
  storeAddress: string;
  storePhone: string;
  storeEmail: string;
  storeGstin: string;
};

export async function loadSrfPrintData(pool: Pool, srfId: string): Promise<SrfPrintData | null> {
  const { rows } = await pool.query<{
    reference: string;
    customer_name: string;
    phone: string;
    company: string | null;
    watch_brand: string;
    watch_family: string;
    watch_model: string;
    serial: string;
    complaint: string;
    estimate_total_inr: string;
    estimated_finish_date: string | null;
    advance_inr: string;
    advance_payment_mode: string | null;
    nature_of_repair: string;
    repair_route: string;
    case_type: string;
    strap_chain_type: string;
    chain_count: string;
    customer_remarks: string;
    created_at: string;
    invoice_display_name: string;
    invoice_tagline: string;
    invoice_address: string;
    invoice_phone: string;
    invoice_email: string;
    invoice_gstin: string;
    store_name: string;
  }>(
    `SELECT j.reference, j.customer_name, j.phone, j.company,
            j.watch_brand, j.watch_family, j.watch_model, j.serial, j.complaint,
            j.estimate_total_inr::text, j.estimated_finish_date::text,
            j.advance_inr::text, j.advance_payment_mode,
            j.nature_of_repair, j.repair_route, j.case_type, j.strap_chain_type,
            j.chain_count, j.customer_remarks, j.created_at::text,
            COALESCE(NULLIF(s.invoice_display_name, ''), s.name) AS invoice_display_name,
            s.invoice_tagline, s.invoice_address, s.invoice_phone,
            s.invoice_email, s.invoice_gstin, s.name AS store_name
     FROM srf_jobs j
     JOIN stores s ON s.id = j.store_id
     WHERE j.id = $1::uuid`,
    [srfId],
  );
  const row = rows[0];
  if (!row) return null;

  const nature =
    row.nature_of_repair?.trim() ||
    (row.repair_route ? repairRouteLabel(row.repair_route as "send_to_ho" | "store_self") : "Chargeable - Service");

  return {
    reference: row.reference,
    customerName: row.customer_name,
    phone: row.phone,
    company: row.company?.trim() || undefined,
    watchBrand: row.watch_brand,
    watchFamily: row.watch_family,
    watchModel: row.watch_model,
    serial: row.serial,
    complaint: row.complaint,
    estimateTotalInr: Number(row.estimate_total_inr) || 0,
    estimatedFinishDate: row.estimated_finish_date,
    advanceInr: Number(row.advance_inr) || 0,
    advancePaymentMode: row.advance_payment_mode,
    natureOfRepair: nature,
    repairRoute: row.repair_route,
    caseType: row.case_type,
    strapChainType: row.strap_chain_type,
    chainCount: row.chain_count,
    customerRemarks: row.customer_remarks,
    bookingDate: row.created_at,
    storeDisplayName: row.invoice_display_name?.trim() || row.store_name,
    storeTagline: row.invoice_tagline?.trim() || "SINCE 1948",
    storeAddress: row.invoice_address?.trim() || "",
    storePhone: row.invoice_phone?.trim() || "",
    storeEmail: row.invoice_email?.trim() || "",
    storeGstin: row.invoice_gstin?.trim() || "",
  };
}

export function srfDocumentDisplayFilename(reference: string): string {
  const safeRef = reference.replace(/[^\w.-]+/g, "_");
  return `Zimson -- Service Management SRF ${safeRef}.pdf`;
}
