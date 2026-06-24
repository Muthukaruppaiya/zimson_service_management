import { initEdocSettings, getResolvedEdocConfig } from "../server/edocSettingsStore.js";
import { getEdocAccessToken } from "../server/mastersIndiaEdoc/auth.js";
import { tryGenerateEinvoiceForQuickBill } from "../server/mastersIndiaEdoc/hooks.js";
import { SANDBOX_EDOC_TEST_GSTIN } from "../server/mastersIndiaEdoc/config.js";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: "postgresql://postgres:postgres@localhost:5433/zimson_service_management",
});

await initEdocSettings(pool);
const cfg = getResolvedEdocConfig()!;
const token = await getEdocAccessToken(cfg);
const base = cfg.apiBase.replace(/\/+$/, "");

// sync-gstin before generate
const syncUrl = `${base}/api/v1/sync-gstin/?user_gstin=${SANDBOX_EDOC_TEST_GSTIN}&gstin=${SANDBOX_EDOC_TEST_GSTIN}`;
const syncRes = await fetch(syncUrl, { headers: { Authorization: `JWT ${token}` } });
console.log("sync before:", syncRes.status, (await syncRes.text()).slice(0, 200));

const billId = "a115fb77-1925-4eee-a202-0020e7e92db0";
const r = await tryGenerateEinvoiceForQuickBill(pool, billId);
console.log("after sync:", JSON.stringify(r, null, 2));

await pool.end();
