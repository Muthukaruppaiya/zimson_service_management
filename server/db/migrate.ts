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

CREATE TABLE IF NOT EXISTS app_users (
  id TEXT PRIMARY KEY,
  email VARCHAR(240) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name VARCHAR(240) NOT NULL,
  role VARCHAR(64) NOT NULL,
  region_id TEXT,
  store_id TEXT,
  technician_profile_id VARCHAR(80),
  can_login BOOLEAN NOT NULL DEFAULT true,
  module_access_override JSONB,
  is_seed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_users_role ON app_users (role);
CREATE INDEX IF NOT EXISTS idx_app_users_region ON app_users (region_id);
CREATE INDEX IF NOT EXISTS idx_app_users_store ON app_users (store_id);
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS employee_code VARCHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS uq_app_users_employee_code ON app_users(employee_code) WHERE employee_code IS NOT NULL;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS plain_password TEXT;
UPDATE app_users
SET plain_password = '123456'
WHERE plain_password IS NULL AND role <> 'super_admin';

CREATE TABLE IF NOT EXISTS user_store_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_user_store_access_user ON user_store_access (user_id);
CREATE INDEX IF NOT EXISTS idx_user_store_access_store ON user_store_access (store_id);

CREATE TABLE IF NOT EXISTS technician_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code VARCHAR(64) NOT NULL UNIQUE,
  full_name VARCHAR(240) NOT NULL,
  email VARCHAR(240),
  phone VARCHAR(80),
  grade VARCHAR(80) NOT NULL,
  region_id TEXT REFERENCES regions(id) ON DELETE SET NULL,
  specialization VARCHAR(240) NOT NULL DEFAULT '',
  experience_years NUMERIC(5,2) NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_technician_profiles_active ON technician_profiles (is_active, full_name);
CREATE INDEX IF NOT EXISTS idx_technician_profiles_region ON technician_profiles (region_id, is_active, full_name);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions (expires_at);

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
  cost_price_inr NUMERIC(14, 2),
  selling_price_inr NUMERIC(14, 2),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE spares ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE spares ADD COLUMN IF NOT EXISTS mrp_inr NUMERIC(14, 2);
ALTER TABLE spares ADD COLUMN IF NOT EXISTS cost_price_inr NUMERIC(14, 2);
ALTER TABLE spares ADD COLUMN IF NOT EXISTS selling_price_inr NUMERIC(14, 2);
ALTER TABLE spares ADD COLUMN IF NOT EXISTS gst_percent NUMERIC(5, 2)
  CHECK (gst_percent IS NULL OR (gst_percent >= 0 AND gst_percent <= 100));

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
  payment_mode VARCHAR(24) NOT NULL CHECK (payment_mode IN ('Cash', 'Card', 'UPI', 'Bank Transfer')),
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

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  display_name VARCHAR(240) NOT NULL,
  phone VARCHAR(80) NOT NULL,
  phone_last10 VARCHAR(10) NOT NULL,
  alternate_phone VARCHAR(80),
  email VARCHAR(200) NOT NULL DEFAULT '',
  address TEXT,
  city VARCHAR(120),
  customer_kind VARCHAR(8) NOT NULL CHECK (customer_kind IN ('B2C', 'B2B')),
  company VARCHAR(240),
  gst VARCHAR(20),
  pan VARCHAR(12),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by VARCHAR(80),
  modified_by VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_phone_last10 ON customers (phone_last10);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers (display_name);
CREATE INDEX IF NOT EXISTS idx_customers_created ON customers (created_at DESC);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS city VARCHAR(120);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS alternate_phone VARCHAR(80);

CREATE TABLE IF NOT EXISTS customer_tracking_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_plain VARCHAR(64) NOT NULL UNIQUE,
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  phone_last10 VARCHAR(10) NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  disabled_at TIMESTAMPTZ,
  last_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ctt_phone ON customer_tracking_tokens (phone_last10);

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
  supplier_code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(240) NOT NULL,
  contact_name VARCHAR(160),
  email VARCHAR(200),
  phone VARCHAR(64),
  address TEXT,
  locations_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  gst VARCHAR(20),
  tax_person_type VARCHAR(80),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers (name);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS supplier_code VARCHAR(64);
UPDATE suppliers
SET supplier_code = 'SUP' || LPAD(SUBSTRING(REPLACE(id::text, '-', '') FROM 1 FOR 6), 6, '0')
WHERE supplier_code IS NULL OR BTRIM(supplier_code) = '';
CREATE UNIQUE INDEX IF NOT EXISTS uq_suppliers_code ON suppliers(supplier_code);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS locations_json JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS tax_person_type VARCHAR(80);

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
  supplier_tax_person_types JSONB NOT NULL DEFAULT '["INTRASTATE_TAXABLE_PERSON","INTERSTATE_TAXABLE_PERSON"]'::jsonb,
  srf_prefix VARCHAR(16) NOT NULL DEFAULT 'SRF',
  srf_suffix VARCHAR(16) NOT NULL DEFAULT '',
  pr_prefix VARCHAR(16) NOT NULL DEFAULT 'PR',
  pr_suffix VARCHAR(16) NOT NULL DEFAULT '',
  po_prefix VARCHAR(16) NOT NULL DEFAULT 'PO',
  po_suffix VARCHAR(16) NOT NULL DEFAULT '',
  grn_prefix VARCHAR(16) NOT NULL DEFAULT 'GRN',
  grn_suffix VARCHAR(16) NOT NULL DEFAULT '',
  dc_prefix VARCHAR(16) NOT NULL DEFAULT 'DC',
  dc_suffix VARCHAR(16) NOT NULL DEFAULT '',
  odc_prefix VARCHAR(16) NOT NULL DEFAULT 'ODC',
  odc_suffix VARCHAR(16) NOT NULL DEFAULT '',
  td_prefix VARCHAR(16) NOT NULL DEFAULT 'TD',
  td_suffix VARCHAR(16) NOT NULL DEFAULT '',
  app_logo_url TEXT NOT NULL DEFAULT '',
  app_favicon_url TEXT NOT NULL DEFAULT '',
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
ALTER TABLE service_tax_settings ADD COLUMN IF NOT EXISTS srf_prefix VARCHAR(16) NOT NULL DEFAULT 'SRF';
ALTER TABLE service_tax_settings ADD COLUMN IF NOT EXISTS srf_suffix VARCHAR(16) NOT NULL DEFAULT '';
ALTER TABLE service_tax_settings ADD COLUMN IF NOT EXISTS pr_prefix VARCHAR(16) NOT NULL DEFAULT 'PR';
ALTER TABLE service_tax_settings ADD COLUMN IF NOT EXISTS pr_suffix VARCHAR(16) NOT NULL DEFAULT '';
ALTER TABLE service_tax_settings ADD COLUMN IF NOT EXISTS po_prefix VARCHAR(16) NOT NULL DEFAULT 'PO';
ALTER TABLE service_tax_settings ADD COLUMN IF NOT EXISTS po_suffix VARCHAR(16) NOT NULL DEFAULT '';
ALTER TABLE service_tax_settings ADD COLUMN IF NOT EXISTS grn_prefix VARCHAR(16) NOT NULL DEFAULT 'GRN';
ALTER TABLE service_tax_settings ADD COLUMN IF NOT EXISTS grn_suffix VARCHAR(16) NOT NULL DEFAULT '';
ALTER TABLE service_tax_settings ADD COLUMN IF NOT EXISTS dc_prefix VARCHAR(16) NOT NULL DEFAULT 'DC';
ALTER TABLE service_tax_settings ADD COLUMN IF NOT EXISTS dc_suffix VARCHAR(16) NOT NULL DEFAULT '';
ALTER TABLE service_tax_settings ADD COLUMN IF NOT EXISTS odc_prefix VARCHAR(16) NOT NULL DEFAULT 'ODC';
ALTER TABLE service_tax_settings ADD COLUMN IF NOT EXISTS odc_suffix VARCHAR(16) NOT NULL DEFAULT '';
ALTER TABLE service_tax_settings ADD COLUMN IF NOT EXISTS td_prefix VARCHAR(16) NOT NULL DEFAULT 'TD';
ALTER TABLE service_tax_settings ADD COLUMN IF NOT EXISTS td_suffix VARCHAR(16) NOT NULL DEFAULT '';
ALTER TABLE service_tax_settings ADD COLUMN IF NOT EXISTS app_logo_url TEXT NOT NULL DEFAULT '';
ALTER TABLE service_tax_settings ADD COLUMN IF NOT EXISTS app_favicon_url TEXT NOT NULL DEFAULT '';
ALTER TABLE service_tax_settings ADD COLUMN IF NOT EXISTS supplier_tax_person_types JSONB NOT NULL DEFAULT '["INTRASTATE_TAXABLE_PERSON","INTERSTATE_TAXABLE_PERSON"]'::jsonb;

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
-- Allow GOODS_AT_HO status on purchase_requests (goods received at HO, awaiting store transfer)
ALTER TABLE purchase_requests DROP CONSTRAINT IF EXISTS purchase_requests_status_check;
ALTER TABLE purchase_requests ADD CONSTRAINT purchase_requests_status_check
  CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PARTIAL', 'FULFILLED', 'GOODS_AT_HO'));
ALTER TABLE grns ADD COLUMN IF NOT EXISTS invoice_file_path TEXT;
ALTER TABLE grns ADD COLUMN IF NOT EXISTS invoice_total_amount NUMERIC(14,4);
ALTER TABLE grn_items ADD COLUMN IF NOT EXISTS created_by VARCHAR(80);
ALTER TABLE grn_items ADD COLUMN IF NOT EXISTS modified_by VARCHAR(80);
ALTER TABLE grn_items ADD COLUMN IF NOT EXISTS cost_price NUMERIC(14,4) DEFAULT 0;
ALTER TABLE grn_items ADD COLUMN IF NOT EXISTS gst_rate NUMERIC(6,2) DEFAULT 18;
ALTER TABLE grn_items ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(14,4) DEFAULT 0;

ALTER TABLE supplier_spares ADD COLUMN IF NOT EXISTS created_by VARCHAR(80);
ALTER TABLE supplier_spares ADD COLUMN IF NOT EXISTS modified_by VARCHAR(80);

ALTER TABLE stock_allocation_batches ADD COLUMN IF NOT EXISTS modified_by VARCHAR(80);
ALTER TABLE stock_allocation_batch_items ADD COLUMN IF NOT EXISTS created_by VARCHAR(80);
ALTER TABLE stock_allocation_batch_items ADD COLUMN IF NOT EXISTS modified_by VARCHAR(80);

CREATE TABLE IF NOT EXISTS srf_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference VARCHAR(64) NOT NULL UNIQUE,
  region_id TEXT NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer_name VARCHAR(240) NOT NULL,
  phone VARCHAR(80) NOT NULL,
  customer_kind VARCHAR(8) NOT NULL CHECK (customer_kind IN ('B2C', 'B2B')),
  company VARCHAR(240),
  watch_brand VARCHAR(120) NOT NULL,
  watch_model VARCHAR(200) NOT NULL,
  serial VARCHAR(200) NOT NULL,
  complaint TEXT NOT NULL DEFAULT '',
  estimate_total_inr NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (estimate_total_inr >= 0),
  estimated_finish_date DATE,
  advance_inr NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (advance_inr >= 0),
  advance_payment_mode VARCHAR(32),
  advance_payment_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  selected_part_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(40) NOT NULL DEFAULT 'draft',
  dc_number VARCHAR(64),
  dispatched_to_sc_at TIMESTAMPTZ,
  inward_at TIMESTAMPTZ,
  assigned_technician_id VARCHAR(80),
  assigned_at TIMESTAMPTZ,
  estimate_ok_at TIMESTAMPTZ,
  reestimate_requested_note TEXT,
  reestimate_requested_inr NUMERIC(14, 2),
  reestimate_requested_at TIMESTAMPTZ,
  reestimate_approved_note TEXT,
  reestimate_approved_at TIMESTAMPTZ,
  used_spares JSONB NOT NULL DEFAULT '[]'::jsonb,
  spares_slip_submitted_at TIMESTAMPTZ,
  spares_slip_submitted_by VARCHAR(80),
  ho_spares_bill_ref VARCHAR(120),
  store_bill_ref VARCHAR(120),
  completed_at_sc TIMESTAMPTZ,
  ready_for_outward_at TIMESTAMPTZ,
  destination_store_id TEXT REFERENCES stores(id) ON DELETE SET NULL,
  outward_dc_number VARCHAR(64),
  dispatched_to_store_at TIMESTAMPTZ,
  received_back_at_store_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  photo_session_active BOOLEAN NOT NULL DEFAULT false,
  capture_link_disabled_at TIMESTAMPTZ,
  requires_local_conversion BOOLEAN NOT NULL DEFAULT false,
  created_by VARCHAR(80),
  modified_by VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_srf_jobs_region_status ON srf_jobs (region_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_srf_jobs_store_status ON srf_jobs (store_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_srf_jobs_dc ON srf_jobs (dc_number);
CREATE INDEX IF NOT EXISTS idx_srf_jobs_outward_dc ON srf_jobs (outward_dc_number);
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS reestimate_requested_note TEXT;
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS advance_inr NUMERIC(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS advance_payment_mode VARCHAR(32);
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS advance_payment_details JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS reestimate_requested_at TIMESTAMPTZ;
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS reestimate_approved_note TEXT;
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS reestimate_approved_at TIMESTAMPTZ;
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS used_spares JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS spares_slip_submitted_at TIMESTAMPTZ;
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS spares_slip_submitted_by VARCHAR(80);
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS ho_spares_bill_ref VARCHAR(120);
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS store_bill_ref VARCHAR(120);
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS customer_reestimate_response VARCHAR(10)
  CHECK (customer_reestimate_response IN ('accepted', 'rejected'));
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS customer_reestimate_responded_at TIMESTAMPTZ;
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS reestimate_requested_inr NUMERIC(14, 2);
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS requires_local_conversion BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS transfer_target_region_id TEXT;
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS transfer_target_store_id TEXT;
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS transfer_source_region_id TEXT;
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS transfer_source_store_id TEXT;
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS transfer_source_reference VARCHAR(64);
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS inter_ho_reestimate_phase VARCHAR(32);
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS inter_ho_reestimate_receiver_srf_id UUID;
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS brand_sent_at TIMESTAMPTZ;
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS brand_dispatch_ref VARCHAR(120);
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS brand_dispatch_note TEXT;
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS brand_dispatch_doc_path TEXT;
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS brand_odc_number VARCHAR(64);
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS brand_inward_ref VARCHAR(64);
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS brand_estimate_inr NUMERIC(14, 2);
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS brand_estimate_currency VARCHAR(12) NOT NULL DEFAULT 'INR';
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS brand_estimate_received_at TIMESTAMPTZ;
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS brand_estimate_email_meta JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS brand_ho_approval_sent_at TIMESTAMPTZ;
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS brand_ho_approval_email_meta JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS brand_return_received_at TIMESTAMPTZ;
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS brand_invoice_ref VARCHAR(120);
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS brand_invoice_amount_inr NUMERIC(14, 2);
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS brand_invoice_meta JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS brand_coupon_code VARCHAR(120);
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS brand_coupon_value_inr NUMERIC(14, 2);
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS brand_coupon_received_at TIMESTAMPTZ;
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS brand_coupon_valid_until DATE;
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS customer_coupon_notified_at TIMESTAMPTZ;
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS customer_coupon_notify_channels JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS technician_brand_recommended_at TIMESTAMPTZ;
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS technician_brand_recommend_note TEXT;
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS brand_acknowledged_at TIMESTAMPTZ;
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS brand_credit_note_approved_at TIMESTAMPTZ;
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS brand_credit_note_approved_by VARCHAR(80);
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS brand_mail_ref VARCHAR(120);
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS brand_markup_inr NUMERIC(14, 2);
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS brand_customer_quote_inr NUMERIC(14, 2);
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS estimated_finish_date DATE;
ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS repair_route VARCHAR(20) NOT NULL DEFAULT 'send_to_ho';
UPDATE srf_jobs SET repair_route = 'send_to_ho' WHERE repair_route IS NULL OR TRIM(repair_route) = '';

CREATE TABLE IF NOT EXISTS srf_job_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  srf_id UUID NOT NULL REFERENCES srf_jobs(id) ON DELETE CASCADE,
  photo_kind VARCHAR(24) NOT NULL DEFAULT 'other',
  file_path TEXT NOT NULL,
  mime VARCHAR(120) NOT NULL,
  bytes INTEGER NOT NULL CHECK (bytes > 0),
  created_by VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_srf_job_photos_srf ON srf_job_photos (srf_id, created_at DESC);
ALTER TABLE srf_job_photos ADD COLUMN IF NOT EXISTS photo_kind VARCHAR(24) NOT NULL DEFAULT 'other';

CREATE TABLE IF NOT EXISTS srf_photo_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  srf_id UUID NOT NULL REFERENCES srf_jobs(id) ON DELETE CASCADE,
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_by VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_srf_photo_sessions_srf ON srf_photo_sessions (srf_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_srf_photo_sessions_expiry ON srf_photo_sessions (expires_at);

CREATE TABLE IF NOT EXISTS delivery_challans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dc_number VARCHAR(64) NOT NULL UNIQUE,
  region_id TEXT NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  from_store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  to_location VARCHAR(24) NOT NULL CHECK (to_location IN ('SERVICE_CENTRE', 'STORE')),
  status VARCHAR(20) NOT NULL CHECK (status IN ('CREATED', 'INWARDED', 'DISPATCHED', 'RECEIVED')) DEFAULT 'CREATED',
  created_by VARCHAR(80),
  modified_by VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_challans_region ON delivery_challans (region_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_challans_store ON delivery_challans (from_store_id, created_at DESC);

CREATE TABLE IF NOT EXISTS delivery_challan_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dc_id UUID NOT NULL REFERENCES delivery_challans(id) ON DELETE CASCADE,
  srf_id UUID NOT NULL REFERENCES srf_jobs(id) ON DELETE CASCADE,
  qty NUMERIC(18, 3) NOT NULL DEFAULT 1 CHECK (qty > 0),
  created_by VARCHAR(80),
  modified_by VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dc_id, srf_id)
);

CREATE INDEX IF NOT EXISTS idx_delivery_challan_lines_dc ON delivery_challan_lines (dc_id);
CREATE INDEX IF NOT EXISTS idx_delivery_challan_lines_srf ON delivery_challan_lines (srf_id);

CREATE TABLE IF NOT EXISTS srf_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  srf_id UUID NOT NULL REFERENCES srf_jobs(id) ON DELETE CASCADE,
  status VARCHAR(40) NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  changed_by VARCHAR(80),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_srf_status_history_srf ON srf_status_history (srf_id, changed_at DESC);

CREATE TABLE IF NOT EXISTS srf_action_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  srf_id UUID NOT NULL REFERENCES srf_jobs(id) ON DELETE CASCADE,
  action VARCHAR(64) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  details JSONB,
  amount_inr NUMERIC(12,2),
  reference_doc VARCHAR(120),
  actor_id VARCHAR(80),
  actor_role VARCHAR(64),
  actor_name VARCHAR(240),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_srf_action_log_srf ON srf_action_log (srf_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_srf_action_log_action ON srf_action_log (action);

CREATE TABLE IF NOT EXISTS srf_reestimate_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  srf_id UUID NOT NULL REFERENCES srf_jobs(id) ON DELETE CASCADE,
  attempt_no INT NOT NULL,
  amount_inr NUMERIC(12,2) NOT NULL,
  remark TEXT NOT NULL DEFAULT '',
  raised_by_id VARCHAR(80),
  raised_by_role VARCHAR(64),
  raised_by_name VARCHAR(240),
  raised_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  customer_response VARCHAR(16),
  customer_response_at TIMESTAMPTZ,
  customer_response_note TEXT,
  supervisor_followup VARCHAR(32),
  supervisor_followup_note TEXT,
  supervisor_followup_at TIMESTAMPTZ,
  supervisor_followup_by_id VARCHAR(80),
  supervisor_followup_by_name VARCHAR(240),
  closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_srf_reestimate_attempts_srf ON srf_reestimate_attempts (srf_id, attempt_no DESC);

CREATE TABLE IF NOT EXISTS srf_inter_ho_spare_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number VARCHAR(40) NOT NULL UNIQUE,
  srf_id UUID NOT NULL REFERENCES srf_jobs(id) ON DELETE CASCADE,
  srf_reference VARCHAR(40) NOT NULL,
  from_region_id TEXT NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  to_region_id TEXT NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL CHECK (status IN ('REQUESTED', 'FULFILLED', 'CANCELLED')),
  note TEXT NOT NULL DEFAULT '',
  requested_by VARCHAR(80) NOT NULL,
  requested_by_name VARCHAR(240),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  invoice_ref VARCHAR(120),
  fulfilled_note TEXT NOT NULL DEFAULT '',
  fulfilled_by VARCHAR(80),
  fulfilled_by_name VARCHAR(240),
  fulfilled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_srf_inter_ho_spare_orders_srf ON srf_inter_ho_spare_orders (srf_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_srf_inter_ho_spare_orders_from ON srf_inter_ho_spare_orders (from_region_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_srf_inter_ho_spare_orders_to ON srf_inter_ho_spare_orders (to_region_id, requested_at DESC);

CREATE TABLE IF NOT EXISTS srf_inter_ho_spare_order_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES srf_inter_ho_spare_orders(id) ON DELETE CASCADE,
  spare_id UUID NOT NULL REFERENCES spares(id) ON DELETE RESTRICT,
  spare_name VARCHAR(240) NOT NULL,
  qty NUMERIC(18,3) NOT NULL CHECK (qty > 0),
  unit_price_inr NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_price_inr >= 0),
  line_total_inr NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (line_total_inr >= 0)
);

CREATE INDEX IF NOT EXISTS idx_srf_inter_ho_spare_order_lines_order ON srf_inter_ho_spare_order_lines (order_id);
`;

export async function runMigrations(pool: Pool): Promise<void> {
  await pool.query(SCHEMA);
  await pool.query(
    `UPDATE spares
     SET selling_price_inr = mrp_inr
     WHERE selling_price_inr IS NULL AND mrp_inr IS NOT NULL`,
  );
  await pool.query(
    `UPDATE app_users
     SET employee_code = UPPER(SUBSTRING(REGEXP_REPLACE(id, '[^A-Za-z0-9]', '', 'g') FROM 1 FOR 24))
     WHERE employee_code IS NULL OR BTRIM(employee_code) = ''`,
  );
  await pool.query(
    `INSERT INTO user_store_access (user_id, store_id)
     SELECT id, store_id
     FROM app_users
     WHERE store_id IS NOT NULL
     ON CONFLICT (user_id, store_id) DO NOTHING`,
  );
  await pool.query(`
    ALTER TABLE srf_inter_ho_spare_orders
      ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS dispatched_by VARCHAR(80),
      ADD COLUMN IF NOT EXISTS dispatched_by_name VARCHAR(240),
      ADD COLUMN IF NOT EXISTS dispatch_note TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS inward_received_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS inward_received_by VARCHAR(80),
      ADD COLUMN IF NOT EXISTS inward_received_by_name VARCHAR(240),
      ADD COLUMN IF NOT EXISTS inward_note TEXT NOT NULL DEFAULT '';
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS countries (
      id TEXT PRIMARY KEY,
      name VARCHAR(160) NOT NULL,
      sort_order INT NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_countries_sort ON countries (sort_order);
  `);
  await pool.query(`
    INSERT INTO countries (id, name, sort_order) VALUES
      ('IN', 'India', 10),
      ('AE', 'United Arab Emirates', 20),
      ('SG', 'Singapore', 30),
      ('US', 'United States', 40),
      ('GB', 'United Kingdom', 50),
      ('AU', 'Australia', 60),
      ('MY', 'Malaysia', 70),
      ('LK', 'Sri Lanka', 80)
    ON CONFLICT (id) DO NOTHING;
  `);
  await pool.query(`
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_code VARCHAR(32);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_customer_code
      ON customers (customer_code) WHERE customer_code IS NOT NULL;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS salutation VARCHAR(16);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS first_name VARCHAR(120);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_name VARCHAR(120);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS dob DATE;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS anniversary_date DATE;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS telephone VARCHAR(40);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS otp_phone VARCHAR(80);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_data_source VARCHAR(24) NOT NULL DEFAULT 'registered';
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS billing_address JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS shipping_address JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS tax_preference VARCHAR(32);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS b2b_trade_display_name VARCHAR(240);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS remark_attention TEXT;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS reference_name VARCHAR(200);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS representative_name VARCHAR(200);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS additional_addresses JSONB NOT NULL DEFAULT '[]'::jsonb;
  `);

  await pool.query(`
    ALTER TABLE quick_bills ADD COLUMN IF NOT EXISTS watch_remark TEXT NOT NULL DEFAULT '';
    ALTER TABLE quick_bills ADD COLUMN IF NOT EXISTS warranty_status VARCHAR(32) NOT NULL DEFAULT 'unspecified';
    ALTER TABLE quick_bills ADD COLUMN IF NOT EXISTS watch_document_path TEXT;
    ALTER TABLE quick_bills ADD COLUMN IF NOT EXISTS watch_image_path TEXT;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS watch_models_catalog (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      brand VARCHAR(200) NOT NULL,
      model VARCHAR(300) NOT NULL,
      brand_norm VARCHAR(200) NOT NULL,
      model_norm VARCHAR(300) NOT NULL,
      ref_hint VARCHAR(200),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_by VARCHAR(80)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_watch_models_catalog_norm
      ON watch_models_catalog (brand_norm, model_norm);
    CREATE INDEX IF NOT EXISTS idx_watch_models_catalog_brand_norm
      ON watch_models_catalog (brand_norm);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS watch_families_catalog (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      brand VARCHAR(200) NOT NULL,
      family VARCHAR(200) NOT NULL,
      brand_norm VARCHAR(200) NOT NULL,
      family_norm VARCHAR(200) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_by VARCHAR(80)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_watch_families_catalog_norm
      ON watch_families_catalog (brand_norm, family_norm);
    CREATE INDEX IF NOT EXISTS idx_watch_families_catalog_brand_norm
      ON watch_families_catalog (brand_norm);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS watch_case_types_catalog (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(200) NOT NULL,
      name_norm VARCHAR(200) NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_by VARCHAR(80)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_watch_case_types_catalog_norm
      ON watch_case_types_catalog (name_norm);
    CREATE INDEX IF NOT EXISTS idx_watch_case_types_catalog_active
      ON watch_case_types_catalog (is_active, sort_order);

    CREATE TABLE IF NOT EXISTS watch_strap_chain_types_catalog (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(200) NOT NULL,
      name_norm VARCHAR(200) NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_by VARCHAR(80)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_watch_strap_chain_types_catalog_norm
      ON watch_strap_chain_types_catalog (name_norm);
    CREATE INDEX IF NOT EXISTS idx_watch_strap_chain_types_catalog_active
      ON watch_strap_chain_types_catalog (is_active, sort_order);
  `);

  await pool.query(`
    ALTER TABLE quick_bills ADD COLUMN IF NOT EXISTS watch_family VARCHAR(200) NOT NULL DEFAULT '';
    ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS watch_family VARCHAR(200) NOT NULL DEFAULT '';
  `);

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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messaging_settings (
      id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_by VARCHAR(200)
    );
  `);
  await pool.query(
    `INSERT INTO messaging_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`,
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS edoc_settings (
      id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_by VARCHAR(200)
    );
  `);
  await pool.query(`INSERT INTO edoc_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);

  await pool.query(`
    ALTER TABLE quick_bills DROP CONSTRAINT IF EXISTS quick_bills_payment_mode_check;
    ALTER TABLE quick_bills ALTER COLUMN payment_mode TYPE VARCHAR(200);
    ALTER TABLE srf_jobs ALTER COLUMN advance_payment_mode TYPE VARCHAR(200);
  `);

  await pool.query(
    `ALTER TABLE quick_bills ADD COLUMN IF NOT EXISTS payment_details JSONB NOT NULL DEFAULT '{}'::jsonb`,
  );

  await pool.query(`
    ALTER TABLE stores ADD COLUMN IF NOT EXISTS invoice_display_name VARCHAR(280) NOT NULL DEFAULT '';
    ALTER TABLE stores ADD COLUMN IF NOT EXISTS invoice_tagline VARCHAR(160) NOT NULL DEFAULT '';
    ALTER TABLE stores ADD COLUMN IF NOT EXISTS invoice_address TEXT NOT NULL DEFAULT '';
    ALTER TABLE stores ADD COLUMN IF NOT EXISTS invoice_phone VARCHAR(120) NOT NULL DEFAULT '';
    ALTER TABLE stores ADD COLUMN IF NOT EXISTS invoice_email VARCHAR(200) NOT NULL DEFAULT '';
    ALTER TABLE stores ADD COLUMN IF NOT EXISTS invoice_gstin VARCHAR(24) NOT NULL DEFAULT '';
    ALTER TABLE stores ADD COLUMN IF NOT EXISTS invoice_legal_entity_name VARCHAR(280) NOT NULL DEFAULT '';
    ALTER TABLE stores ADD COLUMN IF NOT EXISTS invoice_terms TEXT NOT NULL DEFAULT '';
  `);

  await pool.query(`
    ALTER TABLE stores ADD COLUMN IF NOT EXISTS invoice_number_store_code VARCHAR(32) NOT NULL DEFAULT '';
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS store_invoice_sequences (
      store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      fy_key VARCHAR(8) NOT NULL,
      last_value INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (store_id, fy_key)
    );
    CREATE INDEX IF NOT EXISTS idx_store_invoice_seq_fy ON store_invoice_sequences (fy_key);
  `);

  await pool.query(`
    ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(48);
  `);

  // Separate formatted invoice number for quick bills (store sequence) vs QB reference (bill_number)
  await pool.query(`
    ALTER TABLE quick_bills ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(48);
  `);

  // Customer address and city on quick bills for invoice display
  await pool.query(`
    ALTER TABLE quick_bills ADD COLUMN IF NOT EXISTS address TEXT;
    ALTER TABLE quick_bills ADD COLUMN IF NOT EXISTS city VARCHAR(120);
  `);

  await pool.query(`
    ALTER TABLE quick_bills ADD COLUMN IF NOT EXISTS customer_code VARCHAR(32);
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'quick_bills' AND column_name = 'customer_id'
      ) THEN
        ALTER TABLE quick_bills ADD COLUMN customer_id TEXT REFERENCES customers(id);
      ELSIF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'quick_bills' AND column_name = 'customer_id'
          AND udt_name = 'uuid'
      ) THEN
        ALTER TABLE quick_bills DROP CONSTRAINT IF EXISTS quick_bills_customer_id_fkey;
        ALTER TABLE quick_bills DROP COLUMN customer_id;
        ALTER TABLE quick_bills ADD COLUMN customer_id TEXT REFERENCES customers(id);
      END IF;
    END $$;
  `);

  // Columns must exist before UPDATE (fresh DBs had no invoice_number_template yet).
  await pool.query(`
    ALTER TABLE service_tax_settings ADD COLUMN IF NOT EXISTS invoice_number_template VARCHAR(96) NOT NULL DEFAULT '{CODE}{FY2}-{FY2E}{SEQ}';
    ALTER TABLE service_tax_settings ADD COLUMN IF NOT EXISTS invoice_number_seq_width SMALLINT NOT NULL DEFAULT 3;
  `);

  // Update invoice number template to the new format: CHN0126-27001 ({CODE}{FY2}-{FY2E}{SEQ})
  await pool.query(`
    UPDATE service_tax_settings
    SET invoice_number_template = '{CODE}{FY2}-{FY2E}{SEQ}',
        invoice_number_seq_width = 3
    WHERE invoice_number_template IN ('{CODE}{FY2}-{SEQ}', '')
       OR invoice_number_seq_width = 5;
  `);

  await pool.query(`
    ALTER TABLE service_tax_settings ADD COLUMN IF NOT EXISTS invoice_store_display_name VARCHAR(280) NOT NULL DEFAULT '';
    ALTER TABLE service_tax_settings ADD COLUMN IF NOT EXISTS invoice_store_tagline VARCHAR(160) NOT NULL DEFAULT '';
    ALTER TABLE service_tax_settings ADD COLUMN IF NOT EXISTS invoice_store_address TEXT NOT NULL DEFAULT '';
    ALTER TABLE service_tax_settings ADD COLUMN IF NOT EXISTS invoice_store_phone VARCHAR(120) NOT NULL DEFAULT '';
    ALTER TABLE service_tax_settings ADD COLUMN IF NOT EXISTS invoice_store_email VARCHAR(200) NOT NULL DEFAULT '';
    ALTER TABLE service_tax_settings ADD COLUMN IF NOT EXISTS invoice_store_gstin VARCHAR(24) NOT NULL DEFAULT '';
    ALTER TABLE service_tax_settings ADD COLUMN IF NOT EXISTS invoice_legal_entity_name VARCHAR(280) NOT NULL DEFAULT '';
    ALTER TABLE service_tax_settings ADD COLUMN IF NOT EXISTS invoice_terms TEXT NOT NULL DEFAULT '';
  `);

  // Region master fields: code, address, GST, PAN, email, phone
  await pool.query(`
    ALTER TABLE regions ADD COLUMN IF NOT EXISTS region_code VARCHAR(20) NOT NULL DEFAULT '';
    ALTER TABLE regions ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '';
    ALTER TABLE regions ADD COLUMN IF NOT EXISTS gst VARCHAR(20) NOT NULL DEFAULT '';
    ALTER TABLE regions ADD COLUMN IF NOT EXISTS pan VARCHAR(20) NOT NULL DEFAULT '';
    ALTER TABLE regions ADD COLUMN IF NOT EXISTS email VARCHAR(200) NOT NULL DEFAULT '';
    ALTER TABLE regions ADD COLUMN IF NOT EXISTS phone VARCHAR(80) NOT NULL DEFAULT '';
  `);

  // Structured address JSON for regions
  await pool.query(`
    ALTER TABLE regions ADD COLUMN IF NOT EXISTS address_json JSONB;
  `);

  // Warehouses — storage locations under a region
  await pool.query(`
    CREATE TABLE IF NOT EXISTS warehouses (
      id TEXT PRIMARY KEY,
      region_id TEXT NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
      name VARCHAR(160) NOT NULL,
      address TEXT NOT NULL DEFAULT '',
      phone VARCHAR(80) NOT NULL DEFAULT '',
      email VARCHAR(200) NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_warehouses_region ON warehouses (region_id);
  `);

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

  // ── Backfill PR statuses from GRN receipt data ────────────────────────────
  // PRs that have GRN items received should be GOODS_AT_HO (not FULFILLED).
  // FULFILLED is reserved for when HO physically transfers stock to the store.
  // Also correct any PRs wrongly set to FULFILLED by a prior migration run.
  await pool.query(`
    ALTER TABLE quick_bills ADD COLUMN IF NOT EXISTS case_type TEXT NOT NULL DEFAULT '';
    ALTER TABLE quick_bills ADD COLUMN IF NOT EXISTS strap_chain_type TEXT NOT NULL DEFAULT '';
    ALTER TABLE quick_bills ADD COLUMN IF NOT EXISTS nature_of_repair VARCHAR(240) NOT NULL DEFAULT '';
    ALTER TABLE quick_bills ADD COLUMN IF NOT EXISTS chain_count VARCHAR(32) NOT NULL DEFAULT '';
    ALTER TABLE quick_bills ADD COLUMN IF NOT EXISTS customer_remarks TEXT NOT NULL DEFAULT '';
    ALTER TABLE quick_bills ADD COLUMN IF NOT EXISTS customer_billing_state VARCHAR(64);
    ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS case_type TEXT NOT NULL DEFAULT '';
    ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS strap_chain_type TEXT NOT NULL DEFAULT '';
    ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS nature_of_repair VARCHAR(240) NOT NULL DEFAULT '';
    ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS chain_count VARCHAR(32) NOT NULL DEFAULT '';
    ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS customer_remarks TEXT NOT NULL DEFAULT '';
    ALTER TABLE quick_bills ALTER COLUMN case_type TYPE TEXT;
    ALTER TABLE quick_bills ALTER COLUMN strap_chain_type TYPE TEXT;
    ALTER TABLE srf_jobs ALTER COLUMN case_type TYPE TEXT;
    ALTER TABLE srf_jobs ALTER COLUMN strap_chain_type TYPE TEXT;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS quick_bill_capture_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      token_hash VARCHAR(128) NOT NULL UNIQUE,
      region_id TEXT NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
      store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      created_by VARCHAR(80),
      customer_label TEXT NOT NULL DEFAULT '',
      watch_label TEXT NOT NULL DEFAULT '',
      watch_document_path TEXT,
      watch_image_path TEXT,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      used_at TIMESTAMPTZ,
      quick_bill_id UUID REFERENCES quick_bills(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_qb_capture_sessions_store ON quick_bill_capture_sessions (store_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_qb_capture_sessions_expiry ON quick_bill_capture_sessions (expires_at);

    CREATE TABLE IF NOT EXISTS quick_bill_capture_photos (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id UUID NOT NULL REFERENCES quick_bill_capture_sessions(id) ON DELETE CASCADE,
      photo_kind VARCHAR(24) NOT NULL DEFAULT 'other',
      file_path TEXT NOT NULL,
      mime VARCHAR(120) NOT NULL,
      bytes INTEGER NOT NULL CHECK (bytes > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_qb_capture_photos_session_kind
      ON quick_bill_capture_photos (session_id, photo_kind);
    CREATE INDEX IF NOT EXISTS idx_qb_capture_photos_session
      ON quick_bill_capture_photos (session_id, created_at DESC);
  `);

  await pool.query(`
    ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS login_alert_at TIMESTAMPTZ;
    ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS login_alert_message TEXT;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      token_hash VARCHAR(128) NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens (user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expiry ON password_reset_tokens (expires_at);
  `);

  await pool.query(`
    UPDATE purchase_requests pr
    SET status = 'GOODS_AT_HO', updated_at = now()
    FROM (
      SELECT DISTINCT pri.pr_id
      FROM purchase_request_items pri
      JOIN purchase_order_items poi ON poi.pr_item_id = pri.id
      JOIN grn_items gi ON gi.po_item_id = poi.id
      WHERE gi.qty_received > 0
    ) has_grn
    WHERE pr.id = has_grn.pr_id
      AND pr.status IN ('APPROVED', 'PARTIAL', 'FULFILLED')
  `);

  await pool.query(`
    ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS store_billing_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;
  `);

  await pool.query(`
    ALTER TABLE quick_bills ADD COLUMN IF NOT EXISTS edoc_irn VARCHAR(128);
    ALTER TABLE quick_bills ADD COLUMN IF NOT EXISTS edoc_ack_no VARCHAR(64);
    ALTER TABLE quick_bills ADD COLUMN IF NOT EXISTS edoc_ack_date VARCHAR(48);
    ALTER TABLE quick_bills ADD COLUMN IF NOT EXISTS edoc_status VARCHAR(24);
    ALTER TABLE quick_bills ADD COLUMN IF NOT EXISTS edoc_error TEXT;
    ALTER TABLE quick_bills ADD COLUMN IF NOT EXISTS edoc_generated_at TIMESTAMPTZ;
    ALTER TABLE quick_bills ADD COLUMN IF NOT EXISTS edoc_qr TEXT;
    ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS edoc_irn VARCHAR(128);
    ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS edoc_ack_no VARCHAR(64);
    ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS edoc_ack_date VARCHAR(48);
    ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS edoc_status VARCHAR(24);
    ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS edoc_error TEXT;
    ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS edoc_generated_at TIMESTAMPTZ;
    ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS edoc_qr TEXT;
    ALTER TABLE delivery_challans ADD COLUMN IF NOT EXISTS edoc_eway_bill_no VARCHAR(32);
    ALTER TABLE delivery_challans ADD COLUMN IF NOT EXISTS edoc_eway_valid_upto VARCHAR(48);
    ALTER TABLE delivery_challans ADD COLUMN IF NOT EXISTS edoc_status VARCHAR(24);
    ALTER TABLE delivery_challans ADD COLUMN IF NOT EXISTS edoc_error TEXT;
    ALTER TABLE delivery_challans ADD COLUMN IF NOT EXISTS edoc_generated_at TIMESTAMPTZ;
    ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS edoc_eway_bill_no VARCHAR(32);
    ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS edoc_eway_valid_upto VARCHAR(48);
    ALTER TABLE srf_inter_ho_spare_orders ADD COLUMN IF NOT EXISTS edoc_eway_bill_no VARCHAR(32);
    ALTER TABLE srf_inter_ho_spare_orders ADD COLUMN IF NOT EXISTS edoc_eway_valid_upto VARCHAR(48);
    ALTER TABLE srf_inter_ho_spare_orders ADD COLUMN IF NOT EXISTS edoc_error TEXT;
    ALTER TABLE srf_inter_ho_spare_orders ADD COLUMN IF NOT EXISTS edoc_generated_at TIMESTAMPTZ;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hsn_gst_rates (
      hsn_prefix VARCHAR(8) PRIMARY KEY,
      gst_percent NUMERIC(5, 2) NOT NULL CHECK (gst_percent >= 0 AND gst_percent <= 100),
      description TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const { seedWatchCatalogTables } = await import("../watchCatalogRoutes");
  await seedWatchCatalogTables(pool);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS service_invoices (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_number VARCHAR(64) NOT NULL,
      invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
      source_type VARCHAR(32) NOT NULL,
      source_id TEXT,
      region_id TEXT,
      store_id TEXT,
      customer_id TEXT,
      customer_name TEXT NOT NULL DEFAULT '',
      customer_phone TEXT,
      customer_gstin TEXT,
      srf_reference TEXT,
      total_inr NUMERIC(14, 2) NOT NULL DEFAULT 0,
      tax_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      paid_inr NUMERIC(14, 2) NOT NULL DEFAULT 0,
      balance_due_inr NUMERIC(14, 2) NOT NULL DEFAULT 0,
      payment_status VARCHAR(16) NOT NULL DEFAULT 'unpaid',
      snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_service_invoices_number ON service_invoices (invoice_number);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_service_invoices_source ON service_invoices (source_type, source_id)
      WHERE source_id IS NOT NULL AND source_id <> '';
    CREATE INDEX IF NOT EXISTS idx_service_invoices_region ON service_invoices (region_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_service_invoices_status ON service_invoices (payment_status, created_at DESC);

    CREATE TABLE IF NOT EXISTS invoice_payments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_id UUID NOT NULL REFERENCES service_invoices(id) ON DELETE CASCADE,
      voucher_ref VARCHAR(64) NOT NULL,
      amount_inr NUMERIC(14, 2) NOT NULL CHECK (amount_inr > 0),
      payment_mode VARCHAR(48) NOT NULL,
      payment_details JSONB NOT NULL DEFAULT '{}'::jsonb,
      narration TEXT,
      posted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice ON invoice_payments (invoice_id, posted_at DESC);

    CREATE TABLE IF NOT EXISTS ledger_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      voucher_ref VARCHAR(64) NOT NULL,
      voucher_type VARCHAR(16) NOT NULL,
      account_code VARCHAR(64) NOT NULL,
      account_name VARCHAR(128) NOT NULL,
      debit_inr NUMERIC(14, 2) NOT NULL DEFAULT 0,
      credit_inr NUMERIC(14, 2) NOT NULL DEFAULT 0,
      reference_type VARCHAR(32),
      reference_id TEXT,
      narration TEXT,
      region_id TEXT,
      posted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_ledger_entries_voucher ON ledger_entries (voucher_ref, posted_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ledger_entries_account ON ledger_entries (account_code, posted_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ledger_entries_ref ON ledger_entries (reference_type, reference_id);

    ALTER TABLE service_invoices ADD COLUMN IF NOT EXISTS edoc_irn VARCHAR(128);
    ALTER TABLE service_invoices ADD COLUMN IF NOT EXISTS edoc_ack_no VARCHAR(64);
    ALTER TABLE service_invoices ADD COLUMN IF NOT EXISTS edoc_ack_date VARCHAR(48);
    ALTER TABLE service_invoices ADD COLUMN IF NOT EXISTS edoc_status VARCHAR(24);
    ALTER TABLE service_invoices ADD COLUMN IF NOT EXISTS edoc_error TEXT;
    ALTER TABLE service_invoices ADD COLUMN IF NOT EXISTS edoc_generated_at TIMESTAMPTZ;
    ALTER TABLE service_invoices ADD COLUMN IF NOT EXISTS edoc_qr TEXT;

    ALTER TABLE srf_jobs ADD COLUMN IF NOT EXISTS handover_photo_path TEXT;

    CREATE TABLE IF NOT EXISTS srf_billing_handover_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      srf_id UUID NOT NULL REFERENCES srf_jobs(id) ON DELETE CASCADE,
      token_hash VARCHAR(128) NOT NULL UNIQUE,
      photo_path TEXT,
      photo_mime VARCHAR(128),
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      finalized_at TIMESTAMPTZ,
      created_by VARCHAR(80),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_srf_billing_handover_srf
      ON srf_billing_handover_sessions (srf_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_srf_billing_handover_expiry
      ON srf_billing_handover_sessions (expires_at);
  `);
}
