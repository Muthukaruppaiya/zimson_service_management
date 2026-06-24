import pg from "pg";
import { initEdocSettings, getResolvedEdocConfig } from "../server/edocSettingsStore.js";
import { getEdocAccessToken, clearEdocTokenCache } from "../server/mastersIndiaEdoc/auth.js";

const pool = new pg.Pool({
  connectionString: "postgresql://postgres:postgres@localhost:5433/zimson_service_management",
});
await initEdocSettings(pool);
const cfg = getResolvedEdocConfig()!;
const gstins = [
  "33AAACZ0566D1ZN",
  "29AAACZ0566D1ZC",
  "32AAACZ0566D2ZO",
  "34AAACZ0566D1ZL",
  "09AAAPG7885R002",
];
const base = "https://router.mastersindia.co";
clearEdocTokenCache();
const token = await getEdocAccessToken({ ...cfg, apiBase: base, tokenUrl: `${base}/api/v1/token-auth/` });

for (const gstin of gstins) {
  const url = `${base}/api/v1/get-gstin-details/?gstin=${gstin}`;
  const res = await fetch(url, { headers: { Authorization: `JWT ${token}` } });
  const text = await res.text();
  console.log(gstin, res.status, text.slice(0, 180));
}

await pool.end();
