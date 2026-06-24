import pg from "pg";
import { initEdocSettings, getResolvedEdocConfig } from "../server/edocSettingsStore.js";
import { getEdocAccessToken, clearEdocTokenCache } from "../server/mastersIndiaEdoc/auth.js";

const pool = new pg.Pool({
  connectionString: "postgresql://postgres:postgres@localhost:5433/zimson_service_management",
});
await initEdocSettings(pool);
const cfg = getResolvedEdocConfig()!;

const prodBases = ["https://router.mastersindia.co", "https://edoc.mastersindia.co"];
const paths = [
  "/api/v1/get-user-gstin/",
  "/api/v1/get-user-gstins/",
  "/api/v1/user-gstin/",
  "/api/v1/gstin-list/",
  "/api/v1/business/",
  "/api/v1/manage-business/",
  "/api/v1/get-gstin-details/?gstin=33AAACZ0566D1ZN",
];

for (const base of prodBases) {
  clearEdocTokenCache();
  const testCfg = { ...cfg, apiBase: base, tokenUrl: `${base}/api/v1/token-auth/` };
  const token = await getEdocAccessToken(testCfg);
  console.log("\n===", base, "===");
  for (const path of paths) {
    const url = `${base}${path}`;
    try {
      const res = await fetch(url, { headers: { Authorization: `JWT ${token}`, Accept: "application/json" } });
      const text = await res.text();
      if (!text.includes("Not Found") && !text.includes("Invalid Product")) {
        console.log(path, res.status, text.slice(0, 200));
      }
    } catch (e) {
      console.log(path, "err");
    }
  }
}

await pool.end();
