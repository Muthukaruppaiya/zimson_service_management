-- =============================================================================
-- DESTRUCTIVE: Remove ALL regions, stores, and warehouses (fresh HO/store setup).
--
-- KEEPS:
--   • edoc_settings, messaging_settings
--   • service_tax_settings, hsn_gst_rates, workflow_status_definitions
--   • watch catalog tables, countries
--
-- Also clears everything that depends on regions/stores (SRFs, stock, users, etc.)
--
-- BACK UP FIRST:
--   pg_dump "$DATABASE_URL" -Fc -f backup_before_region_reset.dump
--
-- Run:
--   psql "$DATABASE_URL" -f scripts/reset-regions-stores.sql
-- =============================================================================

BEGIN;

-- ── 1) Operational + user data (same as full reset) ─────────────────────────
TRUNCATE TABLE
  ledger_entries,
  invoice_payments,
  service_invoices,
  srf_billing_handover_sessions,
  quick_bill_capture_photos,
  quick_bill_capture_sessions,
  quick_bill_lines,
  quick_bills,
  password_reset_tokens,
  srf_inter_ho_spare_order_lines,
  srf_inter_ho_spare_orders,
  delivery_challan_lines,
  delivery_challans,
  srf_reestimate_attempts,
  srf_action_log,
  srf_status_history,
  srf_photo_sessions,
  srf_job_photos,
  srf_jobs,
  purchase_request_status_history,
  stock_allocation_batch_items,
  stock_allocation_batches,
  grn_items,
  grns,
  purchase_order_items,
  purchase_orders,
  purchase_request_items,
  purchase_requests,
  supplier_spares,
  spare_stock_history,
  spare_stock,
  spare_prices,
  spares,
  brands,
  suppliers,
  customer_tracking_tokens,
  customers,
  auth_sessions,
  user_store_access,
  technician_profiles,
  app_users,
  number_sequences,
  store_invoice_sequences
RESTART IDENTITY CASCADE;

-- ── 2) Region / store master (warehouses go with regions) ───────────────────
TRUNCATE TABLE
  warehouses,
  stores,
  regions
RESTART IDENTITY CASCADE;

COMMIT;

-- ── Verify ───────────────────────────────────────────────────────────────────
SELECT 'regions' AS tbl, count(*)::int AS n FROM regions;
SELECT 'stores' AS tbl, count(*)::int AS n FROM stores;
SELECT 'warehouses' AS tbl, count(*)::int AS n FROM warehouses;
SELECT 'edoc_settings kept' AS note, count(*)::int AS n FROM edoc_settings;
SELECT 'messaging_settings kept' AS note, count(*)::int AS n FROM messaging_settings;

-- =============================================================================
-- OPTIONAL: re-create one region + store + super-admin (edit values as needed)
-- =============================================================================
/*
BEGIN;

INSERT INTO regions (id, name, region_code, address, gst, pan, email, phone)
VALUES (
  'region-chennai',
  'Chennai HO',
  'CHN',
  '12/a, T.Nagar, Chennai, Tamil Nadu - 600017',
  '33AAAAA0000A1Z5',
  'AAAAA0000A',
  'chennai@zimson.com',
  '045462258965'
);

INSERT INTO stores (
  id, region_id, name,
  invoice_display_name, invoice_address, invoice_phone,
  invoice_email, invoice_gstin, invoice_legal_entity_name, invoice_number_store_code
)
VALUES (
  'store-chn01',
  'region-chennai',
  'CHN01',
  'Zimson Chennai',
  '12/a, T.Nagar, Chennai - 600017',
  '045462258965',
  'chennai@zimson.com',
  '33AAAAA0000A1Z5',
  'Zimson Watch Care',
  'CHN'
);

INSERT INTO app_users (
  id, employee_code, email, password_hash, plain_password,
  display_name, role, can_login, is_seed
)
VALUES (
  'seed-super-1',
  'SEEDSUPER1',
  'superadmin@zimson.demo',
  '4e4c56e4a15f89f05c2f4c72613da2a18c9665d4f0d6acce16415eb06f9be776',
  'super123',
  'Super Admin',
  'super_admin',
  true,
  true
)
ON CONFLICT (id) DO NOTHING;

COMMIT;
*/
