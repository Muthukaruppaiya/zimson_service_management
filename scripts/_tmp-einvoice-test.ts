import pg from "pg";
import { initEdocSettings, getResolvedEdocConfig } from "../server/edocSettingsStore.js";
import { tryGenerateEinvoiceForQuickBill } from "../server/mastersIndiaEdoc/hooks.js";
import { resolveEdocSellerGstin } from "../server/mastersIndiaEdoc/config.js";

const pool = new pg.Pool({
  connectionString: "postgresql://postgres:postgres@localhost:5433/zimson_service_management",
});

await initEdocSettings(pool);
const cfg = getResolvedEdocConfig()!;
console.log("sellerOverride", cfg.sellerGstinOverride, "apiBase", cfg.apiBase);
console.log("resolved seller (empty store)", resolveEdocSellerGstin("", "", cfg));

const bills = await pool.query<{
  id: string;
  bill_number: string;
  edoc_irn: string | null;
  edoc_status: string | null;
  edoc_error: string | null;
}>(
  `SELECT id, bill_number, edoc_irn, edoc_status, edoc_error
   FROM quick_bills WHERE customer_type = 'B2B' ORDER BY created_at DESC LIMIT 5`,
);
console.log("recent B2B bills:", bills.rows);

const target = bills.rows.find((b) => !b.edoc_irn) ?? bills.rows[0];
if (target) {
  console.log("testing bill", target.bill_number);
  const r = await tryGenerateEinvoiceForQuickBill(pool, target.id);
  console.log("einvoice result:", JSON.stringify(r, null, 2));
}

await pool.end();
