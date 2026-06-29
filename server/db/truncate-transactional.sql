-- Zimson — wipe transactional / operational data only.
-- KEEPS: regions, stores, users, technicians, brands, spares, prices, suppliers,
--        tax/HSN settings, messaging/edoc settings, catalogs, warehouses, number_sequences.
--
-- Also clear server/data/state.json manually if you want notifications wiped (not in Postgres).
--
-- Run in psql against your app database, e.g.:
--   psql "postgresql://user:pass@localhost:5433/zimson" -f server/db/truncate-transactional.sql

BEGIN;

TRUNCATE TABLE
  quick_bill_capture_photos,
  quick_bill_capture_sessions,
  quick_bill_lines,
  quick_bills,
  srf_billing_handover_sessions,
  srf_inter_ho_spare_order_lines,
  srf_inter_ho_spare_orders,
  srf_reestimate_attempts,
  srf_action_log,
  srf_status_history,
  delivery_challan_lines,
  delivery_challans,
  srf_photo_sessions,
  srf_job_photos,
  srf_jobs,
  customer_tracking_tokens,
  customers,
  invoice_payments,
  ledger_entries,
  service_invoices,
  grn_items,
  grns,
  purchase_order_items,
  purchase_orders,
  purchase_request_status_history,
  purchase_request_items,
  purchase_requests,
  stock_allocation_batch_items,
  stock_allocation_batches,
  spare_stock_history,
  spare_stock,
  password_reset_tokens,
  auth_sessions,
  store_invoice_sequences
RESTART IDENTITY CASCADE;

COMMIT;

-- Optional: reset document counters (keeps row structure)
-- UPDATE number_sequences SET last_value = 0;
