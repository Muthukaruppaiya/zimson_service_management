import pg from "pg";
import { initEdocSettings, getResolvedEdocConfig } from "../server/edocSettingsStore.js";
import { getEdocAccessToken } from "../server/mastersIndiaEdoc/auth.js";
import { SANDBOX_EDOC_TEST_GSTIN } from "../server/mastersIndiaEdoc/config.js";
import { formatDocumentDate } from "../server/mastersIndiaEdoc/gstState.js";

const pool = new pg.Pool({
  connectionString: "postgresql://postgres:postgres@localhost:5433/zimson_service_management",
});
await initEdocSettings(pool);
const cfg = getResolvedEdocConfig()!;
const token = await getEdocAccessToken(cfg);
const base = cfg.apiBase.replace(/\/+$/, "");

const docs = ["CHN0226-27001", "CHN0226-27002", "CHN0226-27004", "CHN0226-27005"];
for (const doc of docs) {
  const q = new URLSearchParams({
    user_gstin: SANDBOX_EDOC_TEST_GSTIN,
    document_type: "INV",
    document_number: doc,
    document_date: "23/06/2026",
  });
  const res = await fetch(`${base}/api/v1/get-einvoice-bydoc/?${q}`, {
    headers: { Authorization: `JWT ${token}` },
  });
  const text = await res.text();
  console.log("\n", doc, "HTTP", res.status);
  console.log(text.slice(0, 500));
}

await pool.end();
