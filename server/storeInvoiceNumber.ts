import type { PoolClient } from "pg";

/** India FY: April–March. fyKey = startYY+endYY e.g. 2627 for Apr 2026–Mar 2027. */
export function indianFinancialYearParts(d = new Date()): {
  fyKey: string;
  /** Two-digit *from* year of the FY (e.g. 26 for 2026–27). Used in `{FY2}` — matches e.g. CHN01+26 → CHN0126-… */
  fy2: string;
  /** Two-digit *to* year of the FY (e.g. 27 for 2026–27). Use `{FY2E}` in templates. */
  fy2End: string;
  /** Both years without separator, e.g. 2627 */
  fy4: string;
  /** Range label e.g. 26-27 for FY 2026–2027 */
  fyLabel: string;
} {
  const y = d.getFullYear();
  const m = d.getMonth();
  let startY: number;
  let endY: number;
  if (m >= 3) {
    startY = y;
    endY = y + 1;
  } else {
    startY = y - 1;
    endY = y;
  }
  const s2 = String(startY).slice(-2);
  const e2 = String(endY).slice(-2);
  return {
    fyKey: `${s2}${e2}`,
    fy2: s2,
    fy2End: e2,
    fy4: `${s2}${e2}`,
    fyLabel: `${s2}-${e2}`,
  };
}

export function defaultInvoiceCodeFromStoreName(name: string): string {
  const u = String(name ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return (u.slice(0, 16) || "STOR").slice(0, 16);
}

// Default format: CHN0126-27001
// {CODE} = store code (e.g. CHN01), {FY2} = FY start year (26), {FY2E} = FY end year (27), {SEQ} = 3-digit sequence
const DEFAULT_INVOICE_TEMPLATE = "{CODE}{FY2}-{FY2E}{SEQ}";

function sanitizeTemplate(raw: string): string {
  const t = String(raw ?? "").trim();
  if (!t) return DEFAULT_INVOICE_TEMPLATE;
  const safe = t.replace(/[^A-Za-z0-9\-._{}\s]/g, "").slice(0, 96);
  return safe.includes("{CODE}") && safe.includes("{SEQ}") ? safe : DEFAULT_INVOICE_TEMPLATE;
}

/**
 * Next invoice number for a store in the current Indian FY.
 * Shared sequence for Quick Bill + SRF printed invoices from that store.
 */
export async function allocateStoreInvoiceNumber(client: PoolClient, storeId: string, billDate = new Date()): Promise<string> {
  const fy = indianFinancialYearParts(billDate);
  const { rows: st } = await client.query<{ name: string; invoice_number_store_code: string | null }>(
    `SELECT name, invoice_number_store_code FROM stores WHERE id = $1::text`,
    [storeId],
  );
  if (!st[0]) throw new Error("Store not found for invoice number.");
  const codeRaw = String(st[0].invoice_number_store_code ?? "").trim();
  const code = (
    codeRaw ||
    defaultInvoiceCodeFromStoreName(st[0].name)
  )
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 16) || "STOR";

  const { rows: tax } = await client.query<{ template: string | null; w: string | null }>(
    `SELECT invoice_number_template AS template, invoice_number_seq_width::text AS w
     FROM service_tax_settings WHERE id = 1`,
  );
  const template = sanitizeTemplate(tax[0]?.template ?? "{CODE}{FY2}-{SEQ}");
  const seqW = Math.min(8, Math.max(3, Math.round(Number.parseFloat(String(tax[0]?.w ?? "3"))) || 3));

  const seqRow = await client.query<{ last_value: number }>(
    `INSERT INTO store_invoice_sequences (store_id, fy_key, last_value)
     VALUES ($1::text, $2::text, 1)
     ON CONFLICT (store_id, fy_key)
     DO UPDATE SET last_value = store_invoice_sequences.last_value + 1, updated_at = now()
     RETURNING last_value`,
    [storeId, fy.fyKey],
  );
  const seq = seqRow.rows[0]!.last_value;
  const seqStr = String(seq).length >= seqW ? String(seq) : String(seq).padStart(seqW, "0");

  return template
    .replace(/\{CODE\}/gi, code)
    .replace(/\{FY2E\}/gi, fy.fy2End)
    .replace(/\{FY2\}/gi, fy.fy2)
    .replace(/\{FY4\}/gi, fy.fy4)
    .replace(/\{FYKEY\}/gi, fy.fyKey)
    .replace(/\{FYLABEL\}/gi, fy.fyLabel)
    .replace(/\{SEQ\}/gi, seqStr);
}
