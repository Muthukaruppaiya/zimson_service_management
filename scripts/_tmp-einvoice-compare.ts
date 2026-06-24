import pg from "pg";
import { initEdocSettings, getResolvedEdocConfig } from "../server/edocSettingsStore.js";
import { generateEinvoice } from "../server/mastersIndiaEdoc/client.js";
import { buildEinvoicePayload } from "../server/mastersIndiaEdoc/buildPayload.js";
import { alignSandboxEdocSellerParty, resolveEdocSellerGstin } from "../server/mastersIndiaEdoc/config.js";

const pool = new pg.Pool({
  connectionString: "postgresql://postgres:postgres@localhost:5433/zimson_service_management",
});

await initEdocSettings(pool);
const cfg = getResolvedEdocConfig()!;

const r = await pool.query(
  `SELECT id, bill_number, invoice_number, gst, company, store_id, region_id, created_at, edoc_irn
   FROM quick_bills WHERE bill_number IN ('QB26CHN02002','QB26CHN02003')`,
);
console.log("bills:", r.rows);

// Test with 09 (current einvoice path) vs 33 (user override)
for (const billNumber of ["QB26CHN02002", "QB26CHN02003"]) {
  const bill = r.rows.find((x) => x.bill_number === billNumber);
  if (!bill) continue;
  console.log("\n===", billNumber, "===");
  const storeGst = await pool.query(`SELECT invoice_gstin, gst FROM stores WHERE id = $1`, [bill.store_id]);
  console.log("store gst", storeGst.rows[0]);
  const sellerGstin09 = resolveEdocSellerGstin(storeGst.rows[0]?.invoice_gstin, null, cfg);
  console.log("resolveEdocSellerGstin ->", sellerGstin09);
}

await pool.end();
