import pg from "pg";
import { initEdocSettings, getResolvedEdocConfig } from "../server/edocSettingsStore.js";

const pool = new pg.Pool({
  connectionString: "postgresql://postgres:postgres@localhost:5433/zimson_service_management",
});
await initEdocSettings(pool);
const cfg = getResolvedEdocConfig();
const r = await pool.query("SELECT config, updated_at FROM edoc_settings ORDER BY updated_at DESC LIMIT 1");
console.log("resolved:", JSON.stringify(cfg, null, 2));
console.log("db:", JSON.stringify(r.rows[0], null, 2));
await pool.end();
