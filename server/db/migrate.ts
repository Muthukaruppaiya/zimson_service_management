import type { Pool } from "pg";

const SCHEMA = `
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(48) UNIQUE NOT NULL,
  name VARCHAR(160) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS spares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku VARCHAR(64) UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category VARCHAR(128) NOT NULL DEFAULT 'Other',
  uom VARCHAR(16) NOT NULL DEFAULT 'PCS',
  hsn VARCHAR(32),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS spare_brand_mrp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spare_id UUID NOT NULL REFERENCES spares(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  mrp_inr NUMERIC(14, 2) NOT NULL CHECK (mrp_inr >= 0),
  currency VARCHAR(8) NOT NULL DEFAULT 'INR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (spare_id, brand_id)
);

CREATE TABLE IF NOT EXISTS spare_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spare_id UUID NOT NULL REFERENCES spares(id) ON DELETE CASCADE,
  location_key VARCHAR(96) NOT NULL,
  quantity NUMERIC(18, 3) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (spare_id, location_key)
);

CREATE INDEX IF NOT EXISTS idx_spare_stock_loc ON spare_stock (location_key);
CREATE INDEX IF NOT EXISTS idx_spare_brand_mrp_spare ON spare_brand_mrp (spare_id);
`;

export async function runMigrations(pool: Pool): Promise<void> {
  await pool.query(SCHEMA);
}
