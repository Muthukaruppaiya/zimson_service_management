-- =============================================================================
-- Run inside psql AFTER: TRUNCATE app_users, stores, regions CASCADE;
-- Order: regions → stores → app_users (foreign keys).
--
-- Part A: minimal bootstrap (edit IDs/names if you like).
-- Part B: load YOUR real data from CSV (exported from local psql — see bottom).
-- =============================================================================

BEGIN;

-- ── A) Minimal region + store (optional but useful for testing HO/store users)
INSERT INTO regions (id, name, region_code, address, gst, pan, email, phone)
VALUES (
  'region-demo-1',
  'Demo Region',
  'DEMO',
  '',
  '',
  '',
  '',
  ''
);

INSERT INTO stores (
  id, region_id, name,
  invoice_display_name, invoice_tagline, invoice_address, invoice_phone,
  invoice_email, invoice_gstin, invoice_legal_entity_name, invoice_terms, invoice_number_store_code
)
VALUES (
  'store-demo-1',
  'region-demo-1',
  'Demo Store',
  '', '', '', '', '', '', '', '', ''
);

-- ── B) Super Admin (password plain: super123  →  SHA256 hex below matches server hashPassword())
-- Login employee code: SEEDSUPER1  (from id seed-super-1, letters+digits only, uppercased)
INSERT INTO app_users (
  id,
  employee_code,
  email,
  password_hash,
  plain_password,
  display_name,
  role,
  region_id,
  store_id,
  technician_profile_id,
  can_login,
  module_access_override,
  is_seed
)
VALUES (
  'seed-super-1',
  'SEEDSUPER1',
  'superadmin@zimson.demo',
  '4e4c56e4a15f89f05c2f4c72613da2a18c9665d4f0d6acce16415eb06f9be776',
  'super123',
  'Super Admin',
  'super_admin',
  NULL,
  NULL,
  NULL,
  true,
  NULL::jsonb,
  true
);

COMMIT;

-- =============================================================================
-- To copy YOUR real tables from local (run in psql on LOCAL machine first):
--
--   \copy regions TO 'regions.csv' CSV HEADER
--   \copy stores TO 'stores.csv' CSV HEADER
--   \copy app_users TO 'app_users.csv' CSV HEADER
--
-- Copy the three CSV files to the server, then on SERVER (same folder as CSV):
--
--   BEGIN;
--   TRUNCATE TABLE app_users, stores, regions RESTART IDENTITY CASCADE;
--   COMMIT;
--
--   \copy regions FROM 'regions.csv' CSV HEADER
--   \copy stores FROM 'stores.csv' CSV HEADER
--   \copy app_users FROM 'app_users.csv' CSV HEADER
--
-- If COPY fails on column mismatch, run app migrations on server first, then
-- re-export CSV from local after migrations match.
-- =============================================================================
