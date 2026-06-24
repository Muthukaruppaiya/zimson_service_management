import { initEdocSettings, getResolvedEdocConfig } from "../server/edocSettingsStore.js";
import { clearEdocTokenCache } from "../server/mastersIndiaEdoc/auth.js";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: "postgresql://postgres:postgres@localhost:5433/zimson_service_management",
});
await initEdocSettings(pool);
const cfg = getResolvedEdocConfig()!;

const bases = [
  "https://sandb-api.mastersindia.co",
  "https://router.mastersindia.co",
  "https://prepro-router.mastersindia.co",
  "https://api.mastersindia.co",
  "https://edoc.mastersindia.co",
];

for (const base of bases) {
  clearEdocTokenCache();
  const testCfg = { ...cfg, apiBase: base, tokenUrl: `${base}/api/v1/token-auth/` };
  try {
    const res = await fetch(testCfg.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: cfg.username, password: cfg.password }),
    });
    const text = await res.text();
    const ok = res.ok && text.includes("access");
    console.log(base, ok ? "TOKEN OK" : `FAIL ${res.status}`, text.slice(0, 80));
  } catch (e) {
    console.log(base, "ERR", e instanceof Error ? e.message : e);
  }
}

await pool.end();
