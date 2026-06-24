import pg from "pg";
import { initEdocSettings, getResolvedEdocConfig } from "../server/edocSettingsStore.js";
import { tryGenerateEinvoiceForQuickBill } from "../server/mastersIndiaEdoc/hooks.js";

const pool = new pg.Pool({
  connectionString: "postgresql://postgres:postgres@localhost:5433/zimson_service_management",
});

await initEdocSettings(pool);
const cfg = getResolvedEdocConfig()!;

const bill = await pool.query(
  `SELECT qb.id, qb.bill_number, qb.invoice_number, qb.total_inr::text, s.invoice_gstin, r.gst AS region_gst
   FROM quick_bills qb
   LEFT JOIN stores s ON s.id = qb.store_id
   LEFT JOIN regions r ON r.id = qb.region_id
   WHERE qb.bill_number IN ('QB26CHN02002','QB26CHN02003')`,
);
console.log("bills:", bill.rows);

const lines = await pool.query(
  `SELECT qb.bill_number, l.description, l.amount_inr::text
   FROM quick_bill_lines l
   JOIN quick_bills qb ON qb.id = l.quick_bill_id
   WHERE qb.bill_number IN ('QB26CHN02002','QB26CHN02003')
   ORDER BY qb.bill_number, l.line_no`,
);
console.log("lines:", lines.rows);

await pool.end();
