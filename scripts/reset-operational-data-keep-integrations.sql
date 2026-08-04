-- =============================================================================
-- DESTRUCTIVE: Fresh operational data (SRFs, bills, stock, customers, spares,
-- users, purchases, invoices, sequences) while KEEPING:
--
--   • edoc_settings        (e-invoice + e-way / Masters India UI config)
--   • messaging_settings   (SMS, email SMTP, WhatsApp UI config)
--   • regions + stores + warehouses  (HO/store master, GST, addresses)
--   • service_tax_settings (GST %, invoice template)
--   • hsn_gst_rates, workflow_status_definitions
--   • watch catalog tables, countries
--
-- BACK UP FIRST:
--   pg_dump "$DATABASE_URL" -Fc -f backup_before_reset.dump
--
-- Run:
--   psql "$DATABASE_URL" -f scripts/reset-operational-data-keep-integrations.sql
--
-- After reset:
--   1) Re-create users (or uncomment super-admin bootstrap at bottom)
--   2) Re-import spares / brands / customers as needed
--   3) Optionally delete local upload files: uploads/srf, uploads/Invoices, uploads/quick-bill
-- =============================================================================

BEGIN;

-- ── Optional: confirm integration config is still present ─────────────────────
SELECT 'edoc_settings' AS tbl, updated_at FROM edoc_settings WHERE id = 1;
SELECT 'messaging_settings' AS tbl, updated_at FROM messaging_settings WHERE id = 1;

-- ── Clear all transactional + master operational data ───────────────────────
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

COMMIT;

-- ── Verify preserved tables ───────────────────────────────────────────────────
SELECT 'regions kept' AS note, count(*)::int AS n FROM regions;
SELECT 'stores kept' AS note, count(*)::int AS n FROM stores;
SELECT 'edoc_settings kept' AS note, count(*)::int AS n FROM edoc_settings;
SELECT 'messaging_settings kept' AS note, count(*)::int AS n FROM messaging_settings;

-- =============================================================================
-- OPTIONAL: minimal super-admin so you can log in again (password: super123)
-- Uncomment and run separately if you truncated all users.
-- =============================================================================
/*
BEGIN;

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
