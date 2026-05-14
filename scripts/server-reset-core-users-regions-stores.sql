-- =============================================================================
-- DESTRUCTIVE: Clears app_users, stores, regions and ALL rows in other tables
-- that reference them (PostgreSQL TRUNCATE ... CASCADE).
--
-- Run on SERVER only after a backup. Then load data from local using pg_dump
-- (see scripts/sync-core-tables-from-local.sh or README block below).
-- =============================================================================

BEGIN;

-- One statement: PostgreSQL resolves FK order. CASCADE also truncates any table
-- that references these three (use only on dev/staging or after full backup).
TRUNCATE TABLE app_users, stores, regions RESTART IDENTITY CASCADE;

COMMIT;

-- After this, re-run your app migrations if needed, then import:
--   psql "$SERVER_DATABASE_URL" -f core_data.sql
-- where core_data.sql was produced by pg_dump on local (see shell script).
