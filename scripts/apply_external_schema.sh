#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <external_database_url> <schema_sql_path> [data_sql_path]"
  exit 1
fi

EXTERNAL_DB_URL="$1"
SCHEMA_SQL="$2"
DATA_SQL="${3:-}"

psql "$EXTERNAL_DB_URL" -v ON_ERROR_STOP=1 -f "$SCHEMA_SQL"

if [ -n "$DATA_SQL" ]; then
  psql "$EXTERNAL_DB_URL" -v ON_ERROR_STOP=1 -f "$DATA_SQL"
fi
