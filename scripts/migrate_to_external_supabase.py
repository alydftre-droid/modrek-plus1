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
from collections import defaultdict


ROOT = "/mnt/documents/modrek_transfer"
SCHEMA_SQL = os.path.join(ROOT, "public_schema.sql")
DATA_SQL = os.path.join(ROOT, "public_data.sql")
REPORT_PATH = os.path.join(ROOT, "external_migration_report.json")


def env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing environment variable: {name}")
    return value


SOURCE_URL = os.environ.get("SUPABASE_URL") or "https://qohhrliaecdtaeyfhcvb.supabase.co"
EXTERNAL_DB_URL = env("EXTERNAL_SUPABASE_DB_URL")
EXTERNAL_SERVICE_ROLE = env("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")


def infer_project_url_from_db_url(db_url: str) -> str:
    parsed = urllib.parse.urlparse(db_url)
    host = parsed.hostname or ""
    match = re.search(r"(?:db|aws-[^.]+)\.([a-z0-9]+)\.supabase\.co$", host)
    if not match:
        match = re.search(r"postgres\.([a-z0-9]+)", parsed.username or "")
    if not match:
        raise RuntimeError("Could not infer external project ref from DB url")
    ref = match.group(1)
    return f"https://{ref}.supabase.co"


EXTERNAL_URL = os.environ.get("EXTERNAL_SUPABASE_URL") or "https://qteuqfntsocsdbjmdvmr.supabase.co"


def run(cmd, input_text=None, check=True):
    result = subprocess.run(cmd, input=input_text, text=True, capture_output=True, check=False)
    if check and result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "command failed")
    return result


def source_psql(sql: str):
    result = run(["psql", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql], check=True)
    return result.stdout


def external_psql(sql: str, check=True):
    return run(["psql", EXTERNAL_DB_URL, "-v", "ON_ERROR_STOP=1", "-At", "-F", "\t", "-c", sql], check=check)


def admin_request(base_url: str, service_key: str, method: str, path: str, body=None):
    request = urllib.request.Request(
        f"{base_url}/auth/v1{path}",
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
    data = admin_request(base_url, service_key, "GET", "/admin/users") or {}
    users = data.get("users", [])
    by_email = {}
    by_id = {}
    for user in users:
        email = (user.get("email") or "").lower()
        if email:
            by_email[email] = user
        if user.get("id"):
            by_id[user["id"]] = user
    return users, by_email, by_id


def read_source_profiles():
    sql = """
    copy (
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
    ) to stdout with csv
    """
    rows = []
    reader = csv.reader(io.StringIO(source_psql(sql)))
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


def create_external_user(profile):
    payload = {
        "email": profile["email"],
        "email_confirm": True,
        "password": f"Migrated!{profile['id'][:8]}Aa1",
        "user_metadata": {
            "full_name": profile.get("full_name"),
            "phone": profile.get("phone"),
            "stage": profile.get("stage"),
            "grade": profile.get("grade"),
            "section": profile.get("section"),
            "role": profile.get("role") or "student",
            "legacy_user_id": profile["id"],
            "migrated_from_lovable": True,
        },
        "app_metadata": {
            "provider": "email",
            "providers": ["email"],
        },
    }
    data = admin_request(EXTERNAL_URL, EXTERNAL_SERVICE_ROLE, "POST", "/admin/users", payload)
    return data.get("user") if isinstance(data, dict) else data


def build_user_mapping(source_profiles, external_users_by_email, external_users_by_id):
    mapping = {}
    created, skipped, failed = [], [], []

    for profile in source_profiles:
        source_id = profile["id"]
        email = (profile.get("email") or "").lower()
        if source_id in external_users_by_id:
            mapping[source_id] = source_id
            skipped.append({"source_id": source_id, "reason": "matched_by_id"})
            continue
        if not email:
            failed.append({"source_id": source_id, "reason": "missing_email"})
            continue
        existing = external_users_by_email.get(email)
        if existing:
            mapping[source_id] = existing["id"]
            skipped.append({"source_id": source_id, "external_id": existing["id"], "reason": "matched_by_email"})
            continue
        try:
            user = create_external_user(profile)
            mapping[source_id] = user["id"]
            external_users_by_email[email] = user
            external_users_by_id[user["id"]] = user
            created.append({"source_id": source_id, "external_id": user["id"], "email": email})
        except Exception as exc:
            failed.append({"source_id": source_id, "email": email, "reason": str(exc)})
    return mapping, created, skipped, failed


def sanitize_schema(schema_sql: str) -> str:
    lines = schema_sql.splitlines()
    kept = []
    for line in lines:
        if line.startswith("SET row_security = off;"):
            continue
        kept.append(line)
    schema_sql = "\n".join(kept) + "\n"
    schema_sql = re.sub(r"\nALTER TABLE ONLY public\.[^\n]+REFERENCES auth\.users\(id\)[^;]*;", "", schema_sql)
    schema_sql = re.sub(r"^CREATE SCHEMA public;", "CREATE SCHEMA IF NOT EXISTS public;", schema_sql, flags=re.MULTILINE)
    schema_sql = re.sub(r"^CREATE TABLE ", "CREATE TABLE IF NOT EXISTS ", schema_sql, flags=re.MULTILINE)
    schema_sql = re.sub(r"^CREATE SEQUENCE ", "CREATE SEQUENCE IF NOT EXISTS ", schema_sql, flags=re.MULTILINE)
    schema_sql = re.sub(r"^CREATE INDEX ", "CREATE INDEX IF NOT EXISTS ", schema_sql, flags=re.MULTILINE)
    schema_sql = re.sub(r"^CREATE UNIQUE INDEX ", "CREATE UNIQUE INDEX IF NOT EXISTS ", schema_sql, flags=re.MULTILINE)
    schema_sql = re.sub(r"^CREATE FUNCTION ", "CREATE OR REPLACE FUNCTION ", schema_sql, flags=re.MULTILINE)
    schema_sql = re.sub(r"^CREATE VIEW ", "CREATE OR REPLACE VIEW ", schema_sql, flags=re.MULTILINE)
    return schema_sql


def split_insert_lines():
    by_table = defaultdict(list)
    pattern = re.compile(r"^INSERT INTO public\.([a-zA-Z0-9_]+) ")
    with open(DATA_SQL, "r", encoding="utf-8", errors="ignore") as handle:
        for line in handle:
            match = pattern.match(line)
            if match:
                by_table[match.group(1)].append(line)
    return by_table


USER_COLUMN_INDEXES = {
    "profiles": [0],
    "user_roles": [1],
    "wallets": [1],
    "device_push_tokens": [1],
    "teacher_requests": [1, 7],
    "teacher_profiles": [1],
    "teacher_wallet_transactions": [1, 6],
    "teacher_withdrawal_requests": [1],
    "notifications": [1, 9],
    "notification_delivery_logs": [1],
    "student_group_purchases": [1],
    "subscription_messages": [2],
    "support_messages": [1],
    "teacher_commission_history": [1, 8],
    "teacher_earning_records": [1, 4],
    "teacher_payment_methods": [1],
    "teacher_assignments": [1],
    "student_teacher_choices": [1, 2],
    "live_sessions": [1],
    "content_groups": [10, 11],
    "content": [8],
    "subscription_requests": [1, 3],
    "subscriptions": [1, 6],
    "usage_logs": [1],
    "ai_daily_usage": [1],
    "ai_sources": [8],
}


INSERT_PREFIX_RE = re.compile(r"^INSERT INTO public\.([a-zA-Z0-9_]+) VALUES \((.*)\);$")
UUID_LITERAL_RE = re.compile(r"^'([0-9a-fA-F-]{36})'$")


def parse_values_blob(blob: str):
    values = []
    current = []
    in_string = False
    i = 0
    while i < len(blob):
        ch = blob[i]
        if ch == "'":
            current.append(ch)
            if in_string and i + 1 < len(blob) and blob[i + 1] == "'":
                current.append(blob[i + 1])
                i += 2
                continue
            in_string = not in_string
            i += 1
            continue
        if ch == "," and not in_string:
            values.append("".join(current).strip())
            current = []
            i += 1
            continue
        current.append(ch)
        i += 1
    values.append("".join(current).strip())
    return values


def rebuild_insert_line(table: str, values):
    return f"INSERT INTO public.{table} VALUES ({', '.join(values)});\n"


def remap_insert_line(table: str, line: str, user_mapping: dict):
    match = INSERT_PREFIX_RE.match(line.strip())
    if not match:
        return None
    values = parse_values_blob(match.group(2))
    indexes = USER_COLUMN_INDEXES.get(table, [])
    for idx in indexes:
        if idx >= len(values):
            continue
        literal = values[idx]
        uuid_match = UUID_LITERAL_RE.match(literal)
        if not uuid_match:
            continue
        source_id = uuid_match.group(1)
        mapped = user_mapping.get(source_id)
        if not mapped:
            return None
        values[idx] = f"'{mapped}'"
    if table == "profiles":
        values[0] = f"'{user_mapping.get(UUID_LITERAL_RE.match(values[0]).group(1), UUID_LITERAL_RE.match(values[0]).group(1))}'" if UUID_LITERAL_RE.match(values[0]) else values[0]
    return rebuild_insert_line(table, values)


def apply_schema():
    schema_sql = sanitize_schema(open(SCHEMA_SQL, "r", encoding="utf-8", errors="ignore").read())
    tmp_schema = "/tmp/external_schema_sanitized.sql"
    with open(tmp_schema, "w", encoding="utf-8") as handle:
        handle.write(schema_sql)
    return run(["psql", EXTERNAL_DB_URL, "-f", tmp_schema], check=False).stderr


def apply_data(user_mapping):
    inserts = split_insert_lines()
    ordered_tables = [
        "subjects", "ai_admin_instructions", "ai_function_settings", "system_terms", "platform_settings",
        "app_versions", "recharge_codes", "sub_subjects", "content_groups", "content", "ai_lessons",
        "ai_lesson_pages", "exams", "live_sessions", "profiles", "user_roles", "wallets",
        "teacher_profiles", "teacher_requests", "teacher_assignments", "teacher_payment_methods",
        "teacher_wallets", "teacher_wallet_transactions", "teacher_commission_history", "teacher_earning_records",
        "teacher_withdrawal_requests", "student_teacher_choices", "student_group_purchases", "subscription_messages",
        "support_messages", "notifications", "notification_delivery_logs", "device_push_tokens", "exam_attempts"
    ]
    copied_counts = {}
    failed_tables = {}

    for table in ordered_tables:
        lines = inserts.get(table, [])
        if not lines:
            continue
        if table in USER_COLUMN_INDEXES:
            mapped_lines = []
            for line in lines:
                remapped = remap_insert_line(table, line, user_mapping)
                if remapped:
                    mapped_lines.append(remapped)
            lines = mapped_lines
        if not lines:
            copied_counts[table] = 0
            continue
        payload = "BEGIN;\n" + "".join(lines) + "COMMIT;\n"
        result = run(["psql", EXTERNAL_DB_URL, "-v", "ON_ERROR_STOP=1"], input_text=payload, check=False)
        if result.returncode != 0:
            failed_tables[table] = result.stderr.strip() or result.stdout.strip()
        else:
            copied_counts[table] = len(lines)

    return copied_counts, failed_tables


def main():
    source_profiles = read_source_profiles()
    _, external_users_by_email, external_users_by_id = list_auth_users(EXTERNAL_URL, EXTERNAL_SERVICE_ROLE)
    user_mapping, created, skipped, failed = build_user_mapping(source_profiles, external_users_by_email, external_users_by_id)

    apply_schema()
    copied_counts, failed_tables = apply_data(user_mapping)

    summary = {
        "external_project_url": EXTERNAL_URL,
        "source_profiles": len(source_profiles),
        "user_mapping_count": len(user_mapping),
        "created_auth_users": created,
        "skipped_auth_users": skipped,
        "failed_auth_users": failed,
        "copied_tables": copied_counts,
        "failed_tables": failed_tables,
    }
    with open(REPORT_PATH, "w", encoding="utf-8") as handle:
        json.dump(summary, handle, ensure_ascii=False, indent=2)

    print(REPORT_PATH)
    print(json.dumps({
        "user_mapping_count": len(user_mapping),
        "created_auth_users": len(created),
        "failed_auth_users": len(failed),
        "copied_tables": len(copied_counts),
        "failed_tables": len(failed_tables),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()