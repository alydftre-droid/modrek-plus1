#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="${1:-/mnt/documents/modrek_plus_transfer_$(date +%F_%H-%M-%S)}"
mkdir -p "$OUT_DIR"

pg_dump --schema=public --schema-only --no-owner --no-privileges > "$OUT_DIR/public_schema.sql"
pg_dump --schema=public --data-only --inserts --column-inserts --no-owner --no-privileges > "$OUT_DIR/public_data.sql"

psql -c "COPY (
  select table_name,
         (xpath('/row/cnt/text()', query_to_xml(format('select count(*) as cnt from %I.%I', table_schema, table_name), false, true, '')))[1]::text::int as row_count
  from information_schema.tables
  where table_schema='public'
  order by table_name
) TO STDOUT WITH CSV HEADER" > "$OUT_DIR/public_table_counts.csv"

psql -c "COPY (select id, name, public from storage.buckets order by name) TO STDOUT WITH CSV HEADER" > "$OUT_DIR/storage_buckets.csv"
psql -c "COPY (select bucket_id, name, owner, created_at, updated_at from storage.objects order by bucket_id, name) TO STDOUT WITH CSV HEADER" > "$OUT_DIR/storage_objects.csv"

cat > "$OUT_DIR/README_TRANSFER_AR.txt" <<'TXT'
حزمة نقل Modrek Plus

الملفات:
- public_schema.sql
- public_data.sql
- public_table_counts.csv
- storage_buckets.csv
- storage_objects.csv

ملاحظات مهمة:
- هذا التصدير خاص بمخطط وبيانات public فقط.
- لا ينقل auth.users أو sessions أو مزودي تسجيل الدخول.
- التخزين يُصدر كفهرس مسارات وليس نسخاً فعلية للملفات.
TXT

(cd "$OUT_DIR/.." && zip -r "$(basename "$OUT_DIR").zip" "$(basename "$OUT_DIR")" >/dev/null)

echo "$OUT_DIR"
echo "$OUT_DIR.zip"
