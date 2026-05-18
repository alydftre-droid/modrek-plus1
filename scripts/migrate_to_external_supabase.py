#!/usr/bin/env python3
import csv
import io
import json
import os
import re
import subprocess
import sys
import urllib.request
from collections import defaultdict


ROOT = "/mnt/documents/modrek_transfer"
SCHEMA_SQL = os.path.join(ROOT, "public_schema.sql")
DATA_SQL = os.path.join(ROOT, "public_data.sql")

SOURCE_URL = os.environ.get("SUPABASE_URL")
SOURCE_SERVICE_ROLE = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
EXTERNAL_DB_URL = os.environ.get("EXTERNAL_SUPABASE_DB_URL")
EXTERNAL_SERVICE_ROLE = os.environ.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")


def run(cmd, input_text=None, check=True):
    result = subprocess.run(
        cmd,
        input=input_text,
        text=True,
        capture_output=True,
        check=False,
    )
    if check and result.returncode != 0:
      raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "command failed")
    return result


def psql(db_url, sql, check=True):
    return run(["psql", db_url, "-v", "ON_ERROR_STOP=1", "-At", "-F", "\t", "-c", sql], check=check)


def read_source_profiles():
    sql = """
    copy (
      select p.id, coalesce(p.email, ''), coalesce(p.full_name, ''), coalesce(p.phone, ''),
             coalesce(p.stage, ''), coalesce(p.grade, ''), coalesce(p.section, ''),
             coalesce((select ur.role::text from public.user_roles ur where ur.user_id = p.id order by ur.role::text limit 1), 'student')
      from public.profiles p
      order by p.created_at nulls first, p.id
    ) to stdout with csv
    """
    result = psql(os.environ.get("DATABASE_URL") or "postgresql://", sql, check=False)
    if result.returncode != 0:
        result = run(["psql", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql], check=True)
    rows = []
    reader = csv.reader(io.StringIO(result.stdout))
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


def admin_request(base_url, service_key, method, path, body=None):
    req = urllib.request.Request(
        f"{base_url}/auth/v1{path}",
        method=method,
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
        },
        data=(json.dumps(body).encode("utf-8") if body is not None else None),
    )
    with urllib.request.urlopen(req) as response:
        data = response.read().decode("utf-8")
        return json.loads(data) if data else None


def list_external_users(base_url, service_key):
    data = admin_request(base_url, service_key, "GET", "/admin/users")
    users = data.get("users", []) if isinstance(data, dict) else []
    by_email = {}
    by_id = {}
    for user in users:
        if user.get("email"):
            by_email[user["email"].lower()] = user
        if user.get("id"):
            by_id[user["id"]] = user
    return by_email, by_id


def create_external_user(base_url, service_key, profile):
    if not profile.get("email"):
        return None, "missing_email"
    payload = {
        "email": profile["email"],
        "email_confirm": True,
        "user_metadata": {
            "full_name": profile.get("full_name"),
            "phone": profile.get("phone"),
            "stage": profile.get("stage"),
            "grade": profile.get("grade"),
            "section": profile.get("section"),
            "role": profile.get("role") or "student",
            "migrated_from_lovable": True,
            "legacy_user_id": profile["id"],
        },
        "app_metadata": {
            "provider": "email",
            "providers": ["email"],
        },
        "password": f"Migrated!{profile['id'][:8]}Aa1",
    }
    try:
        created = admin_request(base_url, service_key, "POST", "/admin/users", payload)
        user = created.get("user") if isinstance(created, dict) else created
        return user, None
    except Exception as exc:
        return None, str(exc)


def split_inserts_by_table(sql_path):
    statements = defaultdict(list)
    pattern = re.compile(r'^INSERT INTO public\.([a-zA-Z0-9_]+) ')
    with open(sql_path, 'r', encoding='utf-8', errors='ignore') as f:
        for line in f:
            match = pattern.match(line)
            if match:
                statements[match.group(1)].append(line)
    return statements


def external_existing_ids(db_url, table, id_column="id"):
    result = psql(db_url, f'select {id_column} from public.{table}', check=False)
    if result.returncode != 0:
        return set()
    return {line.strip() for line in result.stdout.splitlines() if line.strip()}


def main():
    if not all([SOURCE_URL, SOURCE_SERVICE_ROLE, EXTERNAL_DB_URL, EXTERNAL_SERVICE_ROLE]):
        print("Missing required environment variables", file=sys.stderr)
        sys.exit(1)

    profiles = read_source_profiles()
    external_by_email, external_by_id = list_external_users(SOURCE_URL.replace("qohhrliaecdtaeyfhcvb", "qteuqfntsocsdbjmdvmr") if False else os.environ.get("EXTERNAL_SUPABASE_URL", SOURCE_URL), EXTERNAL_SERVICE_ROLE)

    created = []
    skipped = []
    failed = []

    for profile in profiles:
        email = (profile.get("email") or "").lower()
        if not email:
            skipped.append({"id": profile["id"], "reason": "missing_email"})
            continue
        if profile["id"] in external_by_id:
            skipped.append({"id": profile["id"], "reason": "already_exists_by_id", "email": email})
            continue
        if email in external_by_email:
            skipped.append({"id": profile["id"], "reason": "already_exists_by_email", "email": email, "external_id": external_by_email[email].get("id")})
            continue

        user, error = create_external_user(os.environ["EXTERNAL_SUPABASE_URL"], EXTERNAL_SERVICE_ROLE, profile)
        if user:
            created.append({"source_id": profile["id"], "external_id": user.get("id"), "email": email})
            external_by_email[email] = user
            external_by_id[user.get("id")] = user
        else:
            failed.append({"id": profile["id"], "email": email, "error": error})

    schema_sql = open(SCHEMA_SQL, 'r', encoding='utf-8', errors='ignore').read()
    schema_sql = re.sub(r'\nALTER TABLE ONLY public\.[\s\S]*?REFERENCES auth\.users\(id\)[^;]*;\n', '\n', schema_sql)
    tmp_schema = "/tmp/public_schema_external.sql"
    with open(tmp_schema, 'w', encoding='utf-8') as f:
        f.write(schema_sql)

    run(["psql", EXTERNAL_DB_URL, "-v", "ON_ERROR_STOP=1", "-f", tmp_schema], check=True)

    statements = split_inserts_by_table(DATA_SQL)
    ordered_tables = [
        "subjects", "ai_admin_instructions", "ai_function_settings", "content_groups", "sub_subjects",
        "ai_lessons", "ai_lesson_pages", "app_versions", "content", "device_push_tokens", "exams",
        "exam_attempts", "live_sessions", "notifications", "notification_delivery_logs", "platform_settings",
        "profiles", "recharge_codes", "student_group_purchases", "student_teacher_choices", "subscription_messages",
        "support_messages", "system_terms", "teacher_assignments", "teacher_commission_history", "teacher_earning_records",
        "teacher_payment_methods", "teacher_profiles", "teacher_requests", "teacher_wallet_transactions", "teacher_wallets",
        "teacher_withdrawal_requests", "user_roles", "wallet_adjustments", "wallets"
    ]

    existing_profiles = {u.get("id") for u in external_by_id.values() if u.get("id")}
    copied_counts = {}
    failed_tables = {}

    for table in ordered_tables:
        lines = statements.get(table, [])
        if not lines:
            continue
        if table in {"profiles", "user_roles", "wallets", "device_push_tokens", "notifications", "notification_delivery_logs", "student_group_purchases", "subscription_messages", "support_messages", "teacher_requests", "teacher_profiles", "teacher_wallet_transactions", "teacher_withdrawal_requests"}:
            filtered = []
            for line in lines:
                ids = set(re.findall(r"'([0-9a-fA-F-]{36})'", line))
                if table == "profiles":
                    if ids and next(iter(ids)) not in existing_profiles:
                        continue
                filtered.append(line)
            lines = filtered
        if not lines:
            copied_counts[table] = 0
            continue
        payload = "BEGIN;\n" + "".join(lines) + "COMMIT;\n"
        result = run(["psql", EXTERNAL_DB_URL, "-v", "ON_ERROR_STOP=1"], input_text=payload, check=False)
        if result.returncode != 0:
            failed_tables[table] = result.stderr.strip() or result.stdout.strip()
        else:
            copied_counts[table] = len(lines)

    report = {
        "created_auth_users": created,
        "skipped_auth_users": skipped,
        "failed_auth_users": failed,
        "copied_tables": copied_counts,
        "failed_tables": failed_tables,
    }
    report_path = "/mnt/documents/modrek_transfer/external_migration_report.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print(report_path)
    print(json.dumps({
        "created_auth_users": len(created),
        "skipped_auth_users": len(skipped),
        "failed_auth_users": len(failed),
        "failed_tables": len(failed_tables),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()