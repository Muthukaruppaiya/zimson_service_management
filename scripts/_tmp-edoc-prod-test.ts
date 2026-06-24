import pg from "pg";
import { initEdocSettings, getResolvedEdocConfig } from "../server/edocSettingsStore.js";
import { getEdocAccessToken, clearEdocTokenCache } from "../server/mastersIndiaEdoc/auth.js";
import { tryGenerateEinvoiceForQuickBill } from "../server/mastersIndiaEdoc/hooks.js";

const pool = new pg.Pool({
  connectionString: "postgresql://postgres:postgres@localhost:5433/zimson_service_management",
});

await initEdocSettings(pool);
const cfg = getResolvedEdocConfig()!;
console.log("current apiBase:", cfg.apiBase, "sellerOverride:", cfg.sellerGstinOverride);

const bases = [
  "https://sandb-api.mastersindia.co",
  "https://router.mastersindia.co",
];

for (const base of bases) {
  clearEdocTokenCache();
  const testCfg = {
    ...cfg,
    apiBase: base,
    ewayApiBase: base,
    tokenUrl: `${base}/api/v1/token-auth/`,
  };
  try {
    const token = await getEdocAccessToken(testCfg);
    console.log("\n✓ token OK for", base, token.slice(0, 20) + "...");
  } catch (e) {
    console.log("\n✗ token FAIL for", base, e instanceof Error ? e.message : e);
  }
}

const bill = await pool.query(
  `SELECT id, bill_number, edoc_irn, edoc_error FROM quick_bills WHERE bill_number = 'QB26CHN02004'`,
);
console.log("\nbill:", bill.rows[0]);

if (bill.rows[0] && !bill.rows[0].edoc_irn) {
  console.log("\nRetry einvoice sandbox...");
  const r = await tryGenerateEinvoiceForQuickBill(pool, bill.rows[0].id);
  console.log("result:", JSON.stringify(r, null, 2));
}

await pool.end();
