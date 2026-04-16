import type { Pool } from "pg";
import { SEED_REGIONS } from "../../src/data/seed";

const SCHEMA = `
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS regions (
  id TEXT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stores_region ON stores (region_id);

DROP TABLE IF EXISTS spare_brand_mrp CASCADE;
DROP TABLE IF EXISTS brands CASCADE;

CREATE TABLE IF NOT EXISTS spares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku VARCHAR(64) UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category VARCHAR(128) NOT NULL DEFAULT 'Other',
  hsn VARCHAR(32),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE spares ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS spare_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spare_id UUID NOT NULL REFERENCES spares(id) ON DELETE CASCADE,
  region_id TEXT REFERENCES regions(id) ON DELETE CASCADE,
  brand VARCHAR(120) NOT NULL,
  price NUMERIC(14, 2) NOT NULL CHECK (price >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (spare_id, brand, region_id)
);

ALTER TABLE spare_prices ADD COLUMN IF NOT EXISTS region_id TEXT REFERENCES regions(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_spare_prices_spare ON spare_prices (spare_id);
CREATE INDEX IF NOT EXISTS idx_spare_prices_region ON spare_prices (region_id);
ALTER TABLE spare_prices DROP CONSTRAINT IF EXISTS spare_prices_spare_id_brand_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_spare_prices_spare_brand_region
  ON spare_prices (spare_id, brand, region_id);

CREATE TABLE IF NOT EXISTS spare_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spare_id UUID NOT NULL REFERENCES spares(id) ON DELETE CASCADE,
  location_key VARCHAR(200) NOT NULL,
  location_type VARCHAR(16) NOT NULL CHECK (location_type IN ('HO', 'STORE')),
  region_id TEXT NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
  quantity NUMERIC(18, 3) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (spare_id, location_key)
);

CREATE INDEX IF NOT EXISTS idx_spare_stock_spare ON spare_stock (spare_id);
CREATE INDEX IF NOT EXISTS idx_spare_stock_region ON spare_stock (region_id);

CREATE TABLE IF NOT EXISTS purchase_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_number VARCHAR(40) UNIQUE NOT NULL,
  region_id TEXT NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PARTIAL', 'FULFILLED')),
  needed_by DATE,
  notes TEXT NOT NULL DEFAULT '',
  created_by VARCHAR(80) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pr_store ON purchase_requests (store_id);
CREATE INDEX IF NOT EXISTS idx_pr_region ON purchase_requests (region_id);
CREATE INDEX IF NOT EXISTS idx_pr_status ON purchase_requests (status);

CREATE TABLE IF NOT EXISTS purchase_request_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_id UUID NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
  spare_id UUID NOT NULL REFERENCES spares(id) ON DELETE RESTRICT,
  qty NUMERIC(18, 3) NOT NULL CHECK (qty > 0),
  issued_qty NUMERIC(18, 3) NOT NULL DEFAULT 0 CHECK (issued_qty >= 0),
  reason TEXT NOT NULL DEFAULT ''
);

ALTER TABLE purchase_request_items
  ADD COLUMN IF NOT EXISTS issued_qty NUMERIC(18, 3) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_pr_items_pr ON purchase_request_items (pr_id);
`;

export async function runMigrations(pool: Pool): Promise<void> {
  await pool.query(SCHEMA);

  const { rows: rc } = await pool.query<{ c: number }>("SELECT COUNT(*)::int AS c FROM regions");
  if ((rc[0]?.c ?? 0) === 0) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const region of SEED_REGIONS) {
        await client.query("INSERT INTO regions (id, name) VALUES ($1, $2)", [region.id, region.name]);
        for (const store of region.stores) {
          await client.query(
            "INSERT INTO stores (id, region_id, name) VALUES ($1, $2, $3)",
            [store.id, region.id, store.name],
          );
        }
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }
}
