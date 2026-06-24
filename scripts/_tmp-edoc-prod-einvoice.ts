import pg from "pg";
import { initEdocSettings, getResolvedEdocConfig } from "../server/edocSettingsStore.js";
import { clearEdocTokenCache } from "../server/mastersIndiaEdoc/auth.js";
import { generateEinvoice } from "../server/mastersIndiaEdoc/client.js";
import { tryGenerateEinvoiceForQuickBill } from "../server/mastersIndiaEdoc/hooks.js";
import { resolveEdocSellerGstin } from "../server/mastersIndiaEdoc/config.js";

const pool = new pg.Pool({
  connectionString: "postgresql://postgres:postgres@localhost:5433/zimson_service_management",
});

await initEdocSettings(pool);
const cfg = getResolvedEdocConfig()!;

const prodCfg = {
  ...cfg,
  apiBase: "https://router.mastersindia.co",
  ewayApiBase: "https://router.mastersindia.co",
  tokenUrl: "https://router.mastersindia.co/api/v1/token-auth/",
};

clearEdocTokenCache();
console.log("sandbox seller:", resolveEdocSellerGstin("33AAACZ0566D1ZN", "33AAACZ0566D1ZN", cfg));
console.log("production seller:", resolveEdocSellerGstin("33AAACZ0566D1ZN", "33AAACZ0566D1ZN", prodCfg));

const bill = await pool.query(`SELECT id, bill_number FROM quick_bills WHERE bill_number = 'QB26CHN02004'`);
const billId = bill.rows[0]?.id;
if (!billId) {
  console.log("bill not found");
  await pool.end();
  process.exit(1);
}

// Patch global config temporarily by saving to DB... instead call hooks internals with prod override
// Use direct hook approach: temporarily update resolved config via saveEdocSettings
import { saveEdocSettings } from "../server/edocSettingsStore.js";

const saved = await saveEdocSettings(
  {
    apiBase: "https://router.mastersindia.co",
    ewayApiBase: "https://router.mastersindia.co",
    tokenUrl: "https://router.mastersindia.co/api/v1/token-auth/",
  },
  "einvoice-prod-test",
);
console.log("\nSwitched to production API:", saved.apiBase, "einvoice GSTIN:", saved.effectiveEinvoiceGstin);

clearEdocTokenCache();
const r = await tryGenerateEinvoiceForQuickBill(pool, billId);
console.log("\nProduction einvoice result:", JSON.stringify(r, null, 2));

await pool.end();
