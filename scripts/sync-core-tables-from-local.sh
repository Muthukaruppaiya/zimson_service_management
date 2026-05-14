#!/usr/bin/env bash
# Export regions, stores, app_users from LOCAL Postgres and import into SERVER.
# Usage:
#   export LOCAL_URL="postgresql://user:pass@localhost:5432/zimson_local"
#   export SERVER_URL="postgresql://user:pass@20.244.46.64:5432/zimson_prod"
#   bash scripts/sync-core-tables-from-local.sh
#
# On Windows (Git Bash / WSL), same exports then:
#   bash scripts/sync-core-tables-from-local.sh

set -euo pipefail
: "${LOCAL_URL:?Set LOCAL_URL}"
: "${SERVER_URL:?Set SERVER_URL}"

OUT="$(dirname "$0")/../core_data_regions_stores_users.sql"

echo "==> Dumping from LOCAL (data only, INSERT format)..."
pg_dump "$LOCAL_URL" \
  --data-only \
  --no-owner \
  --no-privileges \
  --table=regions \
  --table=stores \
  --table=app_users \
  -f "$OUT"

echo "==> Resetting SERVER core tables (run SQL manually if you prefer)..."
psql "$SERVER_URL" -v ON_ERROR_STOP=1 -f "$(dirname "$0")/server-reset-core-users-regions-stores.sql"

echo "==> Importing into SERVER..."
psql "$SERVER_URL" -v ON_ERROR_STOP=1 -f "$OUT"

echo "==> Done. File kept at: $OUT"
