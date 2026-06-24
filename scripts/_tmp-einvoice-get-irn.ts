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

const bill = await pool.query(
  `SELECT invoice_number, created_at FROM quick_bills WHERE bill_number = 'QB26CHN02003'`,
);
const inv = bill.rows[0]!;
const docDate = formatDocumentDate(new Date(inv.created_at));

for (const gstin of [SANDBOX_EDOC_TEST_GSTIN, "33AAACZ0566D1ZN"]) {
  const q = new URLSearchParams({
    user_gstin: gstin,
    document_type: "INV",
    document_number: inv.invoice_number,
    document_date: docDate,
  });
  const url = `${base}/api/v1/get-einvoice-bydoc/?${q}`;
  const res = await fetch(url, { headers: { Authorization: `JWT ${token}` } });
  const text = await res.text();
  console.log("\ngstin", gstin, "HTTP", res.status);
  console.log(text.slice(0, 800));
}

await pool.end();
