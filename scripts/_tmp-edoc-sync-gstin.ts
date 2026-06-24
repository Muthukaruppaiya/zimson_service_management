import pg from "pg";
import { initEdocSettings, getResolvedEdocConfig } from "../server/edocSettingsStore.js";
import { getEdocAccessToken, clearEdocTokenCache } from "../server/mastersIndiaEdoc/auth.js";
import { tryGenerateEinvoiceForQuickBill } from "../server/mastersIndiaEdoc/hooks.js";

const pool = new pg.Pool({
  connectionString: "postgresql://postgres:postgres@localhost:5433/zimson_service_management",
});

await initEdocSettings(pool);
const bills = await pool.query(
  `SELECT bill_number, invoice_number, edoc_irn, edoc_status, edoc_error
   FROM quick_bills WHERE bill_number LIKE 'QB26CHN0200%' ORDER BY bill_number`,
);
console.table(bills.rows);

const cfg = getResolvedEdocConfig()!;
const bases = ["https://sandb-api.mastersindia.co", "https://router.mastersindia.co"];
const gstins = ["09AAAPG7885R002", "33AAACZ0566D1ZN"];

for (const base of bases) {
  clearEdocTokenCache();
  const testCfg = { ...cfg, apiBase: base, tokenUrl: `${base}/api/v1/token-auth/` };
  const token = await getEdocAccessToken(testCfg);
  for (const gstin of gstins) {
    const url = `${base}/api/v1/sync-gstin/?user_gstin=${gstin}&gstin=${gstin}`;
    const res = await fetch(url, { headers: { Authorization: `JWT ${token}` } });
    console.log("\nsync-gstin", base.replace("https://", ""), gstin, res.status);
    console.log((await res.text()).slice(0, 500));
  }
}

const bill = bills.rows.find((b) => b.bill_number === "QB26CHN02004");
if (bill) {
  const full = await pool.query(`SELECT id FROM quick_bills WHERE bill_number = 'QB26CHN02004'`);
  const r = await tryGenerateEinvoiceForQuickBill(pool, full.rows[0].id);
  console.log("\nretry 004:", r);
}

await pool.end();
