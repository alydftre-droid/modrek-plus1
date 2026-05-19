#!/usr/bin/env python3
import csv
import io
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Dict, List, Optional, Tuple

ROOT = "/mnt/documents/modrek_transfer"
SCHEMA_SQL = os.path.join(ROOT, "public_schema.sql")
DATA_SQL = os.path.join(ROOT, "public_data.sql")
REPORT_PATH = os.path.join(ROOT, "external_migration_report.json")


def env(name: str, required: bool = True) -> Optional[str]:
    value = os.environ.get(name)
    if required and not value:
        raise RuntimeError(f"Missing environment variable: {name}")
    return value


SOURCE_URL = env("SUPABASE_URL") or "https://qohhrliaecdtaeyfhcvb.supabase.co"
SOURCE_SERVICE_ROLE = env("SUPABASE_SERVICE_ROLE_KEY", required=False)
EXTERNAL_DB_URL = env("EXTERNAL_SUPABASE_DB_URL")
EXTERNAL_SERVICE_ROLE = env("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY", required=False)


def infer_project_url_from_db_url(db_url: str) -> str:
    parsed = urllib.parse.urlparse(db_url)
    host = parsed.hostname or ""
    match = re.search(r"(?:db|aws-[^.]+)\.([a-z0-9]+)\.supabase\.co$", host)
    if not match:
        match = re.search(r"postgres\.([a-z0-9]+)", parsed.username or "")
    if not match:
        raise RuntimeError("Could not infer external project ref from DB url")
    return f"https://{match.group(1)}.supabase.co"


EXTERNAL_URL = os.environ.get("EXTERNAL_SUPABASE_URL") or infer_project_url_from_db_url(EXTERNAL_DB_URL)


AUTH_LINKED_COLUMNS = {
    "profiles": ["id"],
    "user_roles": ["user_id"],
    "wallets": ["user_id"],
    "device_push_tokens": ["user_id"],
    "teacher_requests": ["user_id", "reviewed_by"],
    "teacher_profiles": ["teacher_id"],
    "teacher_wallet_transactions": ["teacher_id", "admin_id"],
    "teacher_withdrawal_requests": ["teacher_id"],
    "notifications": ["user_id", "created_by"],
    "notification_delivery_logs": ["user_id"],
    "student_group_purchases": ["student_id"],
    "subscription_messages": ["created_by"],
    "support_messages": ["user_id"],
    "teacher_commission_history": ["teacher_id", "changed_by"],
    "teacher_earning_records": ["teacher_id", "student_id"],
    "teacher_payment_methods": ["teacher_id"],
    "teacher_assignments": ["teacher_id"],
    "student_teacher_choices": ["student_id", "teacher_id"],
    "live_sessions": ["teacher_id"],
    "content_groups": ["created_by", "teacher_id"],
    "content": ["uploaded_by"],
    "subscription_requests": ["student_id", "teacher_id"],
    "subscriptions": ["student_id", "teacher_id", "created_by"],
    "usage_logs": ["user_id"],
    "ai_daily_usage": ["student_id"],
    "ai_sources": ["uploaded_by"],
    "exams": ["created_by"],
    "exam_attempts": ["student_id"],
    "teacher_messages": ["teacher_id", "student_id"],
    "teacher_schedules": ["teacher_id"],
    "teacher_wallets": ["teacher_id"],
    "teacher_monthly_archives": ["teacher_id"],
    "deposit_requests": ["user_id", "reviewed_by"],
    "wallet_adjustments": ["user_id", "admin_id"],
    "video_progress": ["student_id"],
    "live_session_actions": ["user_id"],
    "live_session_messages": ["user_id"],
    "live_session_recordings": ["teacher_id"],
    "support_internal_notes": ["admin_id"],
    "teacher_activity_logs": ["teacher_id", "student_id"],
    "price_change_requests": ["teacher_id", "reviewed_by"],
}


def run(cmd: List[str], input_text: Optional[str] = None, check: bool = True):
    result = subprocess.run(cmd, input=input_text, text=True, capture_output=True, check=False)
    if check and result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "command failed")
    return result



def source_psql(sql: str, check: bool = True):
    return run(["psql", "-v", "ON_ERROR_STOP=1", "-At", "-F", "\t", "-c", sql], check=check)



def external_psql(sql: str, check: bool = True):
    return run(["psql", EXTERNAL_DB_URL, "-v", "ON_ERROR_STOP=1", "-At", "-F", "\t", "-c", sql], check=check)



def admin_request(base_url: str, service_key: str, method: str, path: str, body=None):
    request = urllib.request.Request(
        f"{base_url}{path}",
        method=method,
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
        },
        data=(json.dumps(body).encode("utf-8") if body is not None else None),
    )
    try:
        with urllib.request.urlopen(request) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(detail or str(exc)) from exc



def list_auth_users(base_url: str, service_key: str):
    users = []
    page = 1
    per_page = 1000
    while True:
        data = admin_request(base_url, service_key, "GET", f"/auth/v1/admin/users?page={page}&per_page={per_page}") or {}
        batch = data.get("users", [])
        users.extend(batch)
        if len(batch) < per_page:
            break
        page += 1
    return users



def purge_external_auth_users():
    if not EXTERNAL_SERVICE_ROLE:
        return {"deleted": [], "skipped": True, "reason": "missing_external_service_role"}

    deleted = []
    failed = []
    for user in list_auth_users(EXTERNAL_URL, EXTERNAL_SERVICE_ROLE):
        user_id = user.get("id")
        email = user.get("email")
        if not user_id:
            continue
        try:
            admin_request(EXTERNAL_URL, EXTERNAL_SERVICE_ROLE, "DELETE", f"/auth/v1/admin/users/{user_id}")
            deleted.append({"id": user_id, "email": email})
        except Exception as exc:
            failed.append({"id": user_id, "email": email, "error": str(exc)})

    remaining = list_auth_users(EXTERNAL_URL, EXTERNAL_SERVICE_ROLE)
    return {
        "deleted": deleted,
        "failed": failed,
        "remaining_count": len(remaining),
        "skipped": False,
    }



def count_public_rows(psql_runner) -> Dict[str, int]:
    sql = """
    COPY (
      select table_name,
             (xpath('/row/cnt/text()', query_to_xml(format('select count(*) as cnt from %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint as row_count
      from information_schema.tables
      where table_schema='public'
      order by table_name
    ) TO STDOUT WITH CSV
    """
    result = psql_runner(sql)
    reader = csv.reader(io.StringIO(result.stdout))
    counts: Dict[str, int] = {}
    for row in reader:
        if len(row) >= 2:
            counts[row[0]] = int(row[1])
    return counts



def read_source_profiles() -> List[dict]:
    sql = """
    COPY (
      select p.id,
             coalesce(p.email, ''),
             coalesce(p.full_name, ''),
             coalesce(p.phone, ''),
             coalesce(p.stage, ''),
             coalesce(p.grade, ''),
             coalesce(p.section, ''),
             coalesce((select ur.role::text from public.user_roles ur where ur.user_id = p.id order by ur.role::text limit 1), 'student')
      from public.profiles p
      order by p.created_at nulls first, p.id
    ) TO STDOUT WITH CSV
    """
    rows = []
    reader = csv.reader(io.StringIO(source_psql(sql).stdout))
    for row in reader:
        rows.append({
            "id": row[0],
            "email": row[1] or None,
            "full_name": row[2] or None,
            "phone": row[3] or None,
            "stage": row[4] or None,
            "grade": row[5] or None,
            "section": row[6] or None,
            "role": row[7] or "student",
        })
    return rows



def sanitize_schema(schema_sql: str) -> str:
    lines = []
    for line in schema_sql.splitlines():
        if line.startswith("SET row_security = off;"):
            continue
        lines.append(line)
    schema_sql = "\n".join(lines) + "\n"

    schema_sql = re.sub(
        r"\nALTER TABLE ONLY public\.[^\n]+\n\s+ADD CONSTRAINT [^\n]+ FOREIGN KEY \([^\)]*\) REFERENCES auth\.users\(id\)[^;]*;",
        "",
        schema_sql,
        flags=re.MULTILINE,
    )
    schema_sql = re.sub(r"^CREATE SCHEMA public;", "CREATE SCHEMA IF NOT EXISTS public;", schema_sql, flags=re.MULTILINE)
    schema_sql = re.sub(r"^CREATE TABLE ", "CREATE TABLE IF NOT EXISTS ", schema_sql, flags=re.MULTILINE)
    schema_sql = re.sub(r"^CREATE SEQUENCE ", "CREATE SEQUENCE IF NOT EXISTS ", schema_sql, flags=re.MULTILINE)
    schema_sql = re.sub(r"^CREATE INDEX ", "CREATE INDEX IF NOT EXISTS ", schema_sql, flags=re.MULTILINE)
    schema_sql = re.sub(r"^CREATE UNIQUE INDEX ", "CREATE UNIQUE INDEX IF NOT EXISTS ", schema_sql, flags=re.MULTILINE)
    schema_sql = re.sub(r"^CREATE FUNCTION ", "CREATE OR REPLACE FUNCTION ", schema_sql, flags=re.MULTILINE)
    schema_sql = re.sub(r"^CREATE VIEW ", "CREATE OR REPLACE VIEW ", schema_sql, flags=re.MULTILINE)

    schema_sql += """

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conrelid::regclass AS table_name, conname
    FROM pg_constraint
    WHERE contype = 'f'
      AND connamespace = 'public'::regnamespace
      AND confrelid = 'auth.users'::regclass
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', r.table_name, r.conname);
  END LOOP;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname = 'handle_new_user'
  )
  AND EXISTS (
    SELECT 1 FROM pg_namespace WHERE nspname = 'auth'
  )
  AND EXISTS (
    SELECT 1 FROM pg_class WHERE relnamespace = 'auth'::regnamespace AND relname = 'users'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'on_auth_user_created'
      AND tgrelid = 'auth.users'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END
$$;
"""
    return schema_sql



def apply_schema() -> str:
    schema_sql = sanitize_schema(open(SCHEMA_SQL, "r", encoding="utf-8", errors="ignore").read())
    tmp_schema = "/tmp/external_schema_sanitized.sql"
    with open(tmp_schema, "w", encoding="utf-8") as handle:
        handle.write(schema_sql)
    result = run(["psql", EXTERNAL_DB_URL, "-v", "ON_ERROR_STOP=1", "-f", tmp_schema], check=False)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "schema apply failed")
    return tmp_schema



def truncate_external_public_tables() -> List[str]:
    result = external_psql("select tablename from pg_tables where schemaname='public' order by tablename")
    tables = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    if not tables:
        return []
    qualified = ", ".join(f'public."{name}"' for name in tables)
    external_psql(f"TRUNCATE TABLE {qualified} RESTART IDENTITY CASCADE;")
    return tables



def apply_data() -> str:
    if not os.path.exists(DATA_SQL):
        raise RuntimeError(f"Missing data export: {DATA_SQL}")

    wrapper = "/tmp/external_data_wrapper.sql"
    with open(wrapper, "w", encoding="utf-8") as handle:
        handle.write("SET statement_timeout = 0;\n")
        handle.write("BEGIN;\n")
        handle.write("SET LOCAL session_replication_role = replica;\n")
        handle.write(f"\\i {DATA_SQL}\n")
        handle.write("COMMIT;\n")

    result = run(["psql", EXTERNAL_DB_URL, "-v", "ON_ERROR_STOP=1", "-f", wrapper], check=False)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "data apply failed")
    return wrapper



def auth_trigger_status() -> Dict[str, object]:
    result = external_psql(
        """
        SELECT EXISTS (
          SELECT 1
          FROM pg_trigger
          WHERE tgname = 'on_auth_user_created'
            AND tgrelid = 'auth.users'::regclass
            AND NOT tgisinternal
        )
        """
    )
    installed = result.stdout.strip() == "t"
    return {"installed": installed}



def public_auth_fk_status() -> List[dict]:
    sql = """
    SELECT conrelid::regclass::text, conname
    FROM pg_constraint
    WHERE contype = 'f'
      AND connamespace = 'public'::regnamespace
      AND confrelid = 'auth.users'::regclass
    ORDER BY 1, 2
    """
    result = external_psql(sql)
    rows = []
    for line in result.stdout.splitlines():
        if not line.strip():
            continue
        table_name, constraint_name = line.split("\t", 1)
        rows.append({"table": table_name, "constraint": constraint_name})
    return rows



def source_auth_link_summary() -> Dict[str, int]:
    summary = {}
    for table_name, columns in AUTH_LINKED_COLUMNS.items():
        clauses = [f"{column} is not null" for column in columns]
        sql = f"select count(*) from public.{table_name} where {' or '.join(clauses)}"
        result = source_psql(sql, check=False)
        if result.returncode == 0 and result.stdout.strip().isdigit():
            summary[table_name] = int(result.stdout.strip())
    return summary



def main():
    os.makedirs(ROOT, exist_ok=True)

    source_counts = count_public_rows(source_psql)
    source_profiles = read_source_profiles()
    auth_cleanup = purge_external_auth_users()
    truncated_tables = truncate_external_public_tables()
    sanitized_schema_path = apply_schema()
    data_wrapper_path = apply_data()
    external_counts = count_public_rows(external_psql)
    auth_fk_left = public_auth_fk_status()
    trigger_info = auth_trigger_status()

    summary = {
        "external_project_url": EXTERNAL_URL,
        "mode": "skip_auth_migrate_keep_legacy_public_data",
        "source_profiles": len(source_profiles),
        "source_public_counts": source_counts,
        "legacy_user_linked_row_counts": source_auth_link_summary(),
        "auth_cleanup": auth_cleanup,
        "truncated_public_tables": truncated_tables,
        "schema_file": SCHEMA_SQL,
        "data_file": DATA_SQL,
        "sanitized_schema_path": sanitized_schema_path,
        "data_wrapper_path": data_wrapper_path,
        "external_public_counts": external_counts,
        "remaining_public_auth_foreign_keys": auth_fk_left,
        "auth_bootstrap_trigger": trigger_info,
        "next_step": {
            "storage_transfer_script": "scripts/transfer_external_storage.py",
            "user_rebind_script": "scripts/rebind_external_auth_users.py"
        }
    }

    with open(REPORT_PATH, "w", encoding="utf-8") as handle:
        json.dump(summary, handle, ensure_ascii=False, indent=2)

    print(REPORT_PATH)
    print(json.dumps({
        "source_tables": len(source_counts),
        "external_tables": len(external_counts),
        "legacy_profiles": len(source_profiles),
        "deleted_external_auth_users": len(auth_cleanup.get("deleted", [])) if isinstance(auth_cleanup, dict) else 0,
        "remaining_public_auth_foreign_keys": len(auth_fk_left),
        "auth_trigger_installed": trigger_info.get("installed", False),
    }, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        raise
