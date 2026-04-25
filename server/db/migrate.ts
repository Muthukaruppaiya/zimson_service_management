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
ALTER TABLE service_tax_settings ADD COLUMN IF NOT EXISTS app_logo_url TEXT NOT NULL DEFAULT '';
ALTER TABLE service_tax_settings ADD COLUMN IF NOT EXISTS app_favicon_url TEXT NOT NULL DEFAULT '';

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
