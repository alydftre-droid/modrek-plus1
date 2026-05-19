#!/usr/bin/env python3
import csv
import io
import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Dict, List, Optional

ROOT = "/mnt/documents/modrek_transfer"
REPORT_PATH = os.path.join(ROOT, "external_user_rebind_report.json")


def env(name: str, required: bool = True) -> Optional[str]:
    value = os.environ.get(name)
    if required and not value:
        raise RuntimeError(f"Missing environment variable: {name}")
    return value


EXTERNAL_DB_URL = env("EXTERNAL_SUPABASE_DB_URL")
EXTERNAL_SERVICE_ROLE = env("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")
EXTERNAL_URL = os.environ.get("EXTERNAL_SUPABASE_URL")
if not EXTERNAL_URL:
    parsed = urllib.parse.urlparse(EXTERNAL_DB_URL)
    host = parsed.hostname or ""
    ref = host.split(".")[-3] if host.count(".") >= 3 else None
    if not ref:
        raise RuntimeError("Could not infer EXTERNAL_SUPABASE_URL from EXTERNAL_SUPABASE_DB_URL")
    EXTERNAL_URL = f"https://{ref}.supabase.co"

CREATE_MISSING = "--create-missing" in sys.argv
DRY_RUN = "--dry-run" in sys.argv

AUTH_LINKED_COLUMNS = {
    "device_push_tokens": ["user_id"],
    "teacher_requests": ["user_id", "reviewed_by"],
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


def external_psql(sql: str, check: bool = True):
    return run(["psql", EXTERNAL_DB_URL, "-v", "ON_ERROR_STOP=1", "-At", "-F", "\t", "-c", sql], check=check)


def api_request(method: str, path: str, body=None):
    request = urllib.request.Request(
        f"{EXTERNAL_URL}{path}",
        method=method,
        headers={
            "apikey": EXTERNAL_SERVICE_ROLE,
            "Authorization": f"Bearer {EXTERNAL_SERVICE_ROLE}",
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


def list_auth_users():
    users = []
    page = 1
    while True:
        data = api_request("GET", f"/auth/v1/admin/users?page={page}&per_page=1000") or {}
        batch = data.get("users", [])
        users.extend(batch)
        if len(batch) < 1000:
            break
        page += 1
    return users


def read_legacy_profiles():
    sql = "COPY (select id, coalesce(email,''), coalesce(full_name,''), coalesce(phone,''), coalesce(stage,''), coalesce(grade,''), coalesce(section,''), coalesce(role::text,'student') from public.profiles order by created_at nulls first, id) TO STDOUT WITH CSV"
    reader = csv.reader(io.StringIO(external_psql(sql).stdout))
    rows = []
    for row in reader:
        rows.append({
            "id": row[0],
            "email": row[1].strip().lower() or None,
            "full_name": row[2] or None,
            "phone": row[3] or None,
            "stage": row[4] or None,
            "grade": row[5] or None,
            "section": row[6] or None,
            "role": row[7] or "student",
        })
    return rows


def create_auth_user(profile):
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
            "migrated_from_legacy_public": True,
        },
        "app_metadata": {"provider": "email", "providers": ["email"]},
    }
    data = api_request("POST", "/auth/v1/admin/users", payload)
    return data.get("user") if isinstance(data, dict) else data


def table_columns(table: str, exclude: List[str]):
    exclude_sql = ",".join(f"'{x}'" for x in exclude)
    sql = f"SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='{table}' AND column_name NOT IN ({exclude_sql}) ORDER BY ordinal_position"
    return [line.strip() for line in external_psql(sql).stdout.splitlines() if line.strip()]


def q(value: str) -> str:
    return value.replace("'", "''")


def merge_profiles(old_id: str, new_id: str):
    cols = table_columns("profiles", ["id"])
    assignments = ", ".join([f"{c} = COALESCE(target.{c}, source.{c})" for c in cols])
    sql = f"""
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM public.profiles WHERE id = '{q(new_id)}') THEN
        UPDATE public.profiles AS target
        SET {assignments}
        FROM public.profiles AS source
        WHERE target.id = '{q(new_id)}' AND source.id = '{q(old_id)}';
        DELETE FROM public.profiles WHERE id = '{q(old_id)}';
      ELSE
        UPDATE public.profiles SET id = '{q(new_id)}' WHERE id = '{q(old_id)}';
      END IF;
    END $$;
    """
    external_psql(sql)


def merge_user_roles(old_id: str, new_id: str):
    sql = f"""
    INSERT INTO public.user_roles (user_id, role)
    SELECT '{q(new_id)}', role FROM public.user_roles WHERE user_id = '{q(old_id)}'
    ON CONFLICT (user_id, role) DO NOTHING;
    DELETE FROM public.user_roles WHERE user_id = '{q(old_id)}';
    """
    external_psql(sql)


def merge_wallet_table(table: str, key_col: str, old_id: str, new_id: str, numeric_cols: List[str], carry_cols: List[str]):
    set_numeric = ", ".join([f"{c} = COALESCE(target.{c}, 0) + COALESCE(source.{c}, 0)" for c in numeric_cols])
    set_carry = ", ".join([f"{c} = COALESCE(target.{c}, source.{c})" for c in carry_cols])
    merged_set = ", ".join([x for x in [set_numeric, set_carry] if x])
    sql = f"""
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM public.{table} WHERE {key_col} = '{q(new_id)}') THEN
        UPDATE public.{table} AS target
        SET {merged_set}
        FROM public.{table} AS source
        WHERE target.{key_col} = '{q(new_id)}' AND source.{key_col} = '{q(old_id)}';
        DELETE FROM public.{table} WHERE {key_col} = '{q(old_id)}';
      ELSE
        UPDATE public.{table} SET {key_col} = '{q(new_id)}' WHERE {key_col} = '{q(old_id)}';
      END IF;
    END $$;
    """
    external_psql(sql)


def merge_teacher_profiles(old_id: str, new_id: str):
    cols = table_columns("teacher_profiles", ["teacher_id"])
    assignments = ", ".join([f"{c} = COALESCE(target.{c}, source.{c})" for c in cols])
    sql = f"""
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM public.teacher_profiles WHERE teacher_id = '{q(new_id)}') THEN
        UPDATE public.teacher_profiles AS target
        SET {assignments}
        FROM public.teacher_profiles AS source
        WHERE target.teacher_id = '{q(new_id)}' AND source.teacher_id = '{q(old_id)}';
        DELETE FROM public.teacher_profiles WHERE teacher_id = '{q(old_id)}';
      ELSE
        UPDATE public.teacher_profiles SET teacher_id = '{q(new_id)}' WHERE teacher_id = '{q(old_id)}';
      END IF;
    END $$;
    """
    external_psql(sql)


def update_simple_refs(old_id: str, new_id: str):
    for table, columns in AUTH_LINKED_COLUMNS.items():
        for column in columns:
            external_psql(f"UPDATE public.{table} SET {column} = '{q(new_id)}' WHERE {column} = '{q(old_id)}';", check=False)


def build_mapping(legacy_profiles, auth_users):
    auth_by_email = {}
    for user in auth_users:
        email = (user.get("email") or "").strip().lower()
        if email:
            auth_by_email[email] = user

    mapping = []
    created = []
    missing = []
    for profile in legacy_profiles:
        email = profile.get("email")
        if not email:
            continue
        user = auth_by_email.get(email)
        if not user and CREATE_MISSING:
            user = create_auth_user(profile)
            auth_by_email[email] = user
            created.append({"legacy_id": profile["id"], "auth_id": user["id"], "email": email})
        if user:
            mapping.append({"legacy_id": profile["id"], "auth_id": user["id"], "email": email})
        else:
            missing.append({"legacy_id": profile["id"], "email": email})
    return mapping, created, missing


def main():
    os.makedirs(ROOT, exist_ok=True)
    legacy_profiles = read_legacy_profiles()
    auth_users = list_auth_users()
    mapping, created, missing = build_mapping(legacy_profiles, auth_users)

    applied = []
    if not DRY_RUN:
        external_psql("BEGIN; SET LOCAL session_replication_role = replica; COMMIT;", check=False)
        for row in mapping:
            old_id = row["legacy_id"]
            new_id = row["auth_id"]
            if old_id == new_id:
                continue
            update_simple_refs(old_id, new_id)
            merge_user_roles(old_id, new_id)
            merge_wallet_table("wallets", "user_id", old_id, new_id, ["balance"], ["updated_at", "created_at"])
            merge_wallet_table("teacher_wallets", "teacher_id", old_id, new_id, ["balance", "frozen_balance", "total_earned"], ["current_period", "updated_at", "created_at"])
            merge_teacher_profiles(old_id, new_id)
            merge_profiles(old_id, new_id)
            applied.append(row)

    summary = {
        "external_url": EXTERNAL_URL,
        "create_missing": CREATE_MISSING,
        "dry_run": DRY_RUN,
        "legacy_profiles": len(legacy_profiles),
        "auth_users": len(auth_users) + len(created),
        "mapping_count": len(mapping),
        "created_auth_users": created,
        "missing_matches": missing,
        "applied_mappings": applied,
    }
    with open(REPORT_PATH, "w", encoding="utf-8") as handle:
        json.dump(summary, handle, ensure_ascii=False, indent=2)

    print(REPORT_PATH)
    print(json.dumps({
        "legacy_profiles": len(legacy_profiles),
        "mapping_count": len(mapping),
        "created_auth_users": len(created),
        "missing_matches": len(missing),
        "applied_mappings": len(applied),
    }, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        raise
