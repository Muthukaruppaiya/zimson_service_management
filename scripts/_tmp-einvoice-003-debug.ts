import pg from "pg";
import { initEdocSettings, getResolvedEdocConfig } from "../server/edocSettingsStore.js";
import { getEdocAccessToken } from "../server/mastersIndiaEdoc/auth.js";
import { tryGenerateEinvoiceForQuickBill } from "../server/mastersIndiaEdoc/hooks.js";
import { buildEinvoicePayload } from "../server/mastersIndiaEdoc/buildPayload.js";
import { alignSandboxEdocSellerParty, resolveEdocSellerGstin } from "../server/mastersIndiaEdoc/config.js";

const pool = new pg.Pool({
  connectionString: "postgresql://postgres:postgres@localhost:5433/zimson_service_management",
});

await initEdocSettings(pool);
const cfg = getResolvedEdocConfig()!;
const billId = "a115fb77-1925-4eee-a202-0020e7e92db0";

// Full hook retry
const hook = await tryGenerateEinvoiceForQuickBill(pool, billId);
console.log("hook:", hook);

// Try sync-gstin for 09
const token = await getEdocAccessToken(cfg);
const base = cfg.apiBase.replace(/\/+$/, "");
for (const gstin of ["09AAAPG7885R002", "33AAACZ0566D1ZN"]) {
  const url = `${base}/api/v1/sync-gstin/?user_gstin=${gstin}&gstin=${gstin}`;
  const res = await fetch(url, { headers: { Authorization: `JWT ${token}` } });
  console.log("sync-gstin", gstin, res.status, (await res.text()).slice(0, 300));
}

await pool.end();
