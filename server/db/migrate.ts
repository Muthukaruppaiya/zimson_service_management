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

CREATE TABLE IF NOT EXISTS brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brands_active_sort ON brands (is_active, sort_order, name);

CREATE TABLE IF NOT EXISTS spares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku VARCHAR(64) UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category VARCHAR(128) NOT NULL DEFAULT 'Other',
  hsn VARCHAR(32),
  mrp_inr NUMERIC(14, 2),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE spares ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE spares ADD COLUMN IF NOT EXISTS mrp_inr NUMERIC(14, 2);

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

CREATE TABLE IF NOT EXISTS quick_bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_number VARCHAR(48) UNIQUE NOT NULL,
  region_id TEXT NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  store_id TEXT REFERENCES stores(id) ON DELETE SET NULL,
  customer_type VARCHAR(8) NOT NULL CHECK (customer_type IN ('B2C', 'B2B')),
  customer_name VARCHAR(240),
  phone VARCHAR(80),
  email VARCHAR(200),
  company VARCHAR(240),
  gst VARCHAR(20),
  pan VARCHAR(12),
  watch_brand VARCHAR(120) NOT NULL,
  watch_model TEXT NOT NULL,
  watch_ref VARCHAR(200),
  technician_id VARCHAR(80),
  technician_name VARCHAR(160),
  payment_mode VARCHAR(16) NOT NULL CHECK (payment_mode IN ('Cash', 'Card', 'UPI')),
  notes TEXT NOT NULL DEFAULT '',
  total_inr NUMERIC(14, 2) NOT NULL CHECK (total_inr >= 0),
  created_by VARCHAR(80) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quick_bills_region ON quick_bills (region_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quick_bills_store ON quick_bills (store_id);
CREATE INDEX IF NOT EXISTS idx_quick_bills_number ON quick_bills (bill_number);

CREATE TABLE IF NOT EXISTS quick_bill_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quick_bill_id UUID NOT NULL REFERENCES quick_bills(id) ON DELETE CASCADE,
  line_no INTEGER NOT NULL,
  description TEXT NOT NULL,
  amount_inr NUMERIC(14, 2) NOT NULL CHECK (amount_inr >= 0),
  spare_id UUID REFERENCES spares(id) ON DELETE SET NULL,
  qty NUMERIC(18, 3) NOT NULL DEFAULT 1 CHECK (qty > 0),
  UNIQUE (quick_bill_id, line_no)
);

CREATE INDEX IF NOT EXISTS idx_quick_bill_lines_bill ON quick_bill_lines (quick_bill_id);

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
  received_qty NUMERIC(18, 3) NOT NULL DEFAULT 0 CHECK (received_qty >= 0),
  reason TEXT NOT NULL DEFAULT ''
);

ALTER TABLE purchase_request_items
  ADD COLUMN IF NOT EXISTS issued_qty NUMERIC(18, 3) NOT NULL DEFAULT 0;
ALTER TABLE purchase_request_items
  ADD COLUMN IF NOT EXISTS received_qty NUMERIC(18, 3) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_pr_items_pr ON purchase_request_items (pr_id);

CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(240) NOT NULL,
  contact_name VARCHAR(160),
  email VARCHAR(200),
  phone VARCHAR(64),
  address TEXT,
  gst VARCHAR(20),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers (name);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number VARCHAR(48) UNIQUE NOT NULL,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  pr_id UUID REFERENCES purchase_requests(id) ON DELETE SET NULL,
  region_id TEXT NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL CHECK (status IN ('DRAFT', 'OPEN', 'PARTIAL', 'CLOSED', 'CANCELLED')),
  notes TEXT NOT NULL DEFAULT '',
  created_by VARCHAR(80) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_region ON purchase_orders (region_id);
CREATE INDEX IF NOT EXISTS idx_po_pr ON purchase_orders (pr_id);
CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_orders (supplier_id);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  pr_item_id UUID REFERENCES purchase_request_items(id) ON DELETE SET NULL,
  spare_id UUID NOT NULL REFERENCES spares(id) ON DELETE RESTRICT,
  qty_ordered NUMERIC(18, 3) NOT NULL CHECK (qty_ordered > 0),
  unit_price NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  received_qty NUMERIC(18, 3) NOT NULL DEFAULT 0 CHECK (received_qty >= 0)
);

ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS received_qty NUMERIC(18, 3) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_poi_po ON purchase_order_items (po_id);
CREATE INDEX IF NOT EXISTS idx_poi_pr_item ON purchase_order_items (pr_item_id);

CREATE TABLE IF NOT EXISTS grns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_number VARCHAR(48) UNIQUE NOT NULL,
  po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  region_id TEXT NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  invoice_number VARCHAR(120),
  invoice_date DATE,
  mode VARCHAR(20) NOT NULL CHECK (mode IN ('WITH_BILL', 'WITHOUT_BILL')),
  notes TEXT NOT NULL DEFAULT '',
  created_by VARCHAR(80) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grn_po ON grns (po_id);
CREATE INDEX IF NOT EXISTS idx_grn_region ON grns (region_id);

CREATE TABLE IF NOT EXISTS grn_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_id UUID NOT NULL REFERENCES grns(id) ON DELETE CASCADE,
  po_item_id UUID NOT NULL REFERENCES purchase_order_items(id) ON DELETE RESTRICT,
  spare_id UUID NOT NULL REFERENCES spares(id) ON DELETE RESTRICT,
  qty_received NUMERIC(18, 3) NOT NULL CHECK (qty_received > 0)
);

CREATE INDEX IF NOT EXISTS idx_grn_items_grn ON grn_items (grn_id);

CREATE TABLE IF NOT EXISTS number_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prefix VARCHAR(12) NOT NULL,
  scope_code VARCHAR(32) NOT NULL,
  year_2 VARCHAR(2) NOT NULL,
  last_value INTEGER NOT NULL DEFAULT 1000,
  UNIQUE (prefix, scope_code, year_2)
);

CREATE TABLE IF NOT EXISTS supplier_spares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  spare_id UUID NOT NULL REFERENCES spares(id) ON DELETE CASCADE,
  lead_time_days INTEGER,
  min_order_qty NUMERIC(18, 3),
  priority_rank INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (supplier_id, spare_id)
);

CREATE INDEX IF NOT EXISTS idx_supplier_spares_supplier ON supplier_spares (supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_spares_spare ON supplier_spares (spare_id);
CREATE INDEX IF NOT EXISTS idx_supplier_spares_active ON supplier_spares (is_active);

CREATE TABLE IF NOT EXISTS stock_allocation_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_number VARCHAR(48) UNIQUE NOT NULL,
  region_id TEXT NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL CHECK (status IN ('DRAFT', 'CONFIRMED')),
  notes TEXT NOT NULL DEFAULT '',
  created_by VARCHAR(80) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_alloc_batch_region ON stock_allocation_batches (region_id);
CREATE INDEX IF NOT EXISTS idx_alloc_batch_status ON stock_allocation_batches (status);

CREATE TABLE IF NOT EXISTS stock_allocation_batch_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES stock_allocation_batches(id) ON DELETE CASCADE,
  pr_id UUID NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
  pr_item_id UUID NOT NULL REFERENCES purchase_request_items(id) ON DELETE CASCADE,
  spare_id UUID NOT NULL REFERENCES spares(id) ON DELETE RESTRICT,
  suggested_qty NUMERIC(18, 3) NOT NULL CHECK (suggested_qty >= 0),
  final_qty NUMERIC(18, 3) NOT NULL CHECK (final_qty >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alloc_items_batch ON stock_allocation_batch_items (batch_id);
CREATE INDEX IF NOT EXISTS idx_alloc_items_pr_item ON stock_allocation_batch_items (pr_item_id);

CREATE TABLE IF NOT EXISTS spare_stock_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spare_id UUID NOT NULL REFERENCES spares(id) ON DELETE CASCADE,
  event_type VARCHAR(48) NOT NULL,
  location_key VARCHAR(200),
  location_type VARCHAR(16),
  region_id TEXT REFERENCES regions(id) ON DELETE CASCADE,
  store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
  quantity_change NUMERIC(18, 3),
  balance_after NUMERIC(18, 3),
  reference_type VARCHAR(24),
  reference_number VARCHAR(64),
  note TEXT,
  created_by VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_spare_stock_history_spare ON spare_stock_history (spare_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_spare_stock_history_location ON spare_stock_history (location_key, created_at DESC);

CREATE TABLE IF NOT EXISTS service_tax_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  gst_rate_percent NUMERIC(8, 3) NOT NULL DEFAULT 18.000
    CHECK (gst_rate_percent >= 0 AND gst_rate_percent <= 100),
  cgst_rate_percent NUMERIC(8, 3) NOT NULL DEFAULT 9.000
    CHECK (cgst_rate_percent >= 0 AND cgst_rate_percent <= 100),
  sgst_rate_percent NUMERIC(8, 3) NOT NULL DEFAULT 9.000
    CHECK (sgst_rate_percent >= 0 AND sgst_rate_percent <= 100),
  igst_rate_percent NUMERIC(8, 3) NOT NULL DEFAULT 18.000
    CHECK (igst_rate_percent >= 0 AND igst_rate_percent <= 100),
  default_sac_hsn VARCHAR(32) NOT NULL DEFAULT '9987',
  prices_tax_inclusive BOOLEAN NOT NULL DEFAULT false,
  notes TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(80)
);

CREATE TABLE IF NOT EXISTS workflow_status_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity VARCHAR(48) NOT NULL,
  code VARCHAR(64) NOT NULL,
  label VARCHAR(120) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity, code)
);

CREATE INDEX IF NOT EXISTS idx_workflow_status_entity ON workflow_status_definitions (entity, sort_order, label);

CREATE TABLE IF NOT EXISTS purchase_request_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_id UUID NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
  status_code VARCHAR(64) NOT NULL,
  status_label VARCHAR(120) NOT NULL,
  changed_by VARCHAR(80),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_pr_status_hist_pr ON purchase_request_status_history (pr_id, changed_at DESC);

ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS internal_status_code VARCHAR(64) NOT NULL DEFAULT 'PR_CREATED';
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS internal_status_label VARCHAR(120) NOT NULL DEFAULT 'PR creation';

ALTER TABLE quick_bills ADD COLUMN IF NOT EXISTS modified_by VARCHAR(80);
ALTER TABLE spare_stock ADD COLUMN IF NOT EXISTS modified_by VARCHAR(80);

ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS modified_by VARCHAR(80);
ALTER TABLE purchase_request_items ADD COLUMN IF NOT EXISTS created_by VARCHAR(80);
ALTER TABLE purchase_request_items ADD COLUMN IF NOT EXISTS modified_by VARCHAR(80);

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS created_by VARCHAR(80);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS modified_by VARCHAR(80);

ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS modified_by VARCHAR(80);
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS created_by VARCHAR(80);
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS modified_by VARCHAR(80);

ALTER TABLE grns ADD COLUMN IF NOT EXISTS modified_by VARCHAR(80);
ALTER TABLE grn_items ADD COLUMN IF NOT EXISTS created_by VARCHAR(80);
ALTER TABLE grn_items ADD COLUMN IF NOT EXISTS modified_by VARCHAR(80);

ALTER TABLE supplier_spares ADD COLUMN IF NOT EXISTS created_by VARCHAR(80);
ALTER TABLE supplier_spares ADD COLUMN IF NOT EXISTS modified_by VARCHAR(80);

ALTER TABLE stock_allocation_batches ADD COLUMN IF NOT EXISTS modified_by VARCHAR(80);
ALTER TABLE stock_allocation_batch_items ADD COLUMN IF NOT EXISTS created_by VARCHAR(80);
ALTER TABLE stock_allocation_batch_items ADD COLUMN IF NOT EXISTS modified_by VARCHAR(80);
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

  const { rows: bc } = await pool.query<{ c: number }>("SELECT COUNT(*)::int AS c FROM brands");
  if ((bc[0]?.c ?? 0) === 0) {
    const defaults = ["Citizen", "Omega", "Rolex", "Seiko", "Tudor"];
    let order = 0;
    for (const name of defaults) {
      const code = name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) || `BR${order}`;
      await pool.query(
        `INSERT INTO brands (code, name, sort_order) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING`,
        [code, name, order],
      );
      order += 1;
    }
  }

  await pool.query(
    `INSERT INTO service_tax_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`,
  );

  const prFlowDefaults: Array<[string, string, number]> = [
    ["PR_CREATED", "PR creation", 10],
    ["PR_APPROVED_STORE", "PR approved by store manager", 20],
    ["PR_SENT_TO_HO", "PR sent to HO", 30],
    ["PR_APPROVED_HO", "PR approved by HO", 40],
    ["PO_CREATED", "PO created", 50],
    ["GRN_POSTED", "GRN posted", 60],
    ["TRANSFER_TO_STORE", "Transfer to store", 70],
    ["STORE_INWARD_COMPLETED", "Store inward completed", 80],
  ];
  for (const [code, label, order] of prFlowDefaults) {
    await pool.query(
      `INSERT INTO workflow_status_definitions (entity, code, label, sort_order)
       VALUES ('pr_flow', $1, $2, $3)
       ON CONFLICT (entity, code) DO UPDATE SET
         label = EXCLUDED.label,
         sort_order = EXCLUDED.sort_order`,
      [code, label, order],
    );
  }
}
