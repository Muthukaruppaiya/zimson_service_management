/**
 * Reset script — wipes ALL data from every table (schema is kept).
 * Seed demo users are re-inserted automatically on next server start.
 *
 * Usage (stop the server first, then run):
 *   npx tsx server/db/reset.ts
 *
 * DB connection uses the same env vars as the main server:
 *   DATABASE_URL=postgresql://user:pass@host:port/dbname
 */

import "dotenv/config";
import pg from "pg";

function createPool(): pg.Pool {
  const url = process.env.DATABASE_URL?.trim();
  if (url) return new pg.Pool({ connectionString: url, max: 3 });
  return new pg.Pool({
    host: process.env.PGHOST ?? "localhost",
    port: Number(process.env.PGPORT ?? 5433),
    database: process.env.PGDATABASE ?? "zimson_service_management",
    user: process.env.PGUSER ?? "postgres",
    password: process.env.PGPASSWORD ?? "",
  });
}

// Tables to clear — ordered so children are wiped before parents.
// Using RESTART IDENTITY resets all serial / sequence counters too.
const TRUNCATE_SQL = `
TRUNCATE TABLE
  auth_sessions,
  spare_stock_history,
  stock_allocation_batch_items,
  stock_allocation_batches,
  grn_items,
  grns,
  purchase_order_items,
  purchase_orders,
  purchase_request_status_history,
  purchase_request_items,
  purchase_requests,
  srf_photo_sessions,
  srf_job_photos,
  srf_inter_ho_spare_order_lines,
  srf_inter_ho_spare_orders,
  srf_reestimate_attempts,
  srf_action_log,
  srf_status_history,
  delivery_challan_lines,
  delivery_challans,
  srf_jobs,
  quick_bill_lines,
  quick_bills,
  customer_tracking_tokens,
  customers,
  number_sequences,
  store_invoice_sequences,
  supplier_spares,
  suppliers,
  spare_stock,
  spare_prices,
  spares,
  brands,
  watch_models_catalog,
  watch_families_catalog,
  service_tax_settings,
  workflow_status_definitions,
  technician_profiles,
  user_store_access,
  app_users,
  warehouses,
  stores,
  regions
RESTART IDENTITY CASCADE;
`;

async function run() {
  const pool = createPool();
  const client = await pool.connect();
  try {
    console.log("⚠️  Resetting database — all data will be deleted...\n");
    await client.query("BEGIN");
    await client.query(TRUNCATE_SQL);
    await client.query("COMMIT");
    console.log("✅  All tables cleared successfully.");
    console.log("\nNext steps:");
    console.log("  1. Start the server:   npm run dev");
    console.log("  2. Log in as:          superadmin@zimson.demo  /  super123");
    console.log("  3. Settings → Regions & Stores  →  create your regions and stores");
    console.log("  4. Settings → Users             →  create your staff accounts");
    console.log("  5. Settings → Service Tax       →  set GST rates and invoice terms\n");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌  Reset failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

void run();
