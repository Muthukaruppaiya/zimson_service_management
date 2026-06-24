import pg from "pg";
import { initEdocSettings, getResolvedEdocConfig } from "../server/edocSettingsStore.js";
import { getEdocAccessToken, clearEdocTokenCache } from "../server/mastersIndiaEdoc/auth.js";

const pool = new pg.Pool({
  connectionString: "postgresql://postgres:postgres@localhost:5433/zimson_service_management",
});
await initEdocSettings(pool);
const cfg = getResolvedEdocConfig()!;
const gstin = "33AAACZ0566D1ZN";
const base = "https://router.mastersindia.co";

clearEdocTokenCache();
const testCfg = { ...cfg, apiBase: base, tokenUrl: `${base}/api/v1/token-auth/` };
const token = await getEdocAccessToken(testCfg);

for (const method of ["GET", "POST"] as const) {
  const url = `${base}/api/v1/sync-gstin/?user_gstin=${gstin}&gstin=${gstin}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `JWT ${token}`,
      Accept: "application/json",
      ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
    },
    body: method === "POST" ? JSON.stringify({ user_gstin: gstin, gstin }) : undefined,
  });
  console.log(method, res.status, (await res.text()).slice(0, 600));
}

await pool.end();
