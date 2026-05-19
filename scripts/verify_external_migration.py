#!/usr/bin/env python3
"""
Post-migration integrity check for the external Supabase project.

Compares row counts and sample UUIDs between source (Lovable Cloud) and
external destination, validates RLS policies, foreign key health, presence
of auth bootstrap triggers, and storage bucket parity.

Outputs a JSON report and exits with non-zero status if any critical check
fails so it can be wired into CI before any cut-over.

Usage:
    python scripts/verify_external_migration.py [--sample 5]
"""
import csv
import io
import json
import os
import subprocess
import sys
from typing import Dict, List, Optional

ROOT = "/mnt/documents/modrek_transfer"
REPORT_PATH = os.path.join(ROOT, "external_verification_report.json")


def env(name: str, required: bool = True) -> Optional[str]:
    value = os.environ.get(name)
    if required and not value:
        raise RuntimeError(f"Missing environment variable: {name}")
    return value


EXTERNAL_DB_URL = env("EXTERNAL_SUPABASE_DB_URL")
SAMPLE_SIZE = 5
for i, arg in enumerate(sys.argv):
    if arg == "--sample" and i + 1 < len(sys.argv):
        SAMPLE_SIZE = int(sys.argv[i + 1])


def run(cmd: List[str], check: bool = False):
    return subprocess.run(cmd, text=True, capture_output=True, check=False)


def source_psql(sql: str):
    return run(["psql", "-v", "ON_ERROR_STOP=1", "-At", "-F", "\t", "-c", sql])


def external_psql(sql: str):
    return run(["psql", EXTERNAL_DB_URL, "-v", "ON_ERROR_STOP=1", "-At", "-F", "\t", "-c", sql])


def parse_csv(stdout: str):
    return list(csv.reader(io.StringIO(stdout)))


def public_row_counts(psql):
    sql = """
    COPY (
      select table_name,
             (xpath('/row/cnt/text()', query_to_xml(format('select count(*) as cnt from %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint
      from information_schema.tables
      where table_schema='public' and table_type='BASE TABLE'
      order by table_name
    ) TO STDOUT WITH CSV
    """
    rows = parse_csv(psql(sql).stdout)
    return {r[0]: int(r[1]) for r in rows if len(r) >= 2}


def list_public_tables(psql):
    sql = "select tablename from pg_tables where schemaname='public' order by tablename"
    return [l.strip() for l in psql(sql).stdout.splitlines() if l.strip()]


def has_id_column(psql, table: str) -> bool:
    sql = f"""
    select 1 from information_schema.columns
    where table_schema='public' and table_name='{table}' and column_name='id'
    """
    return bool(psql(sql).stdout.strip())


def sample_ids(psql, table: str, n: int) -> List[str]:
    if not has_id_column(psql, table):
        return []
    res = psql(f'select id::text from public."{table}" order by id limit {n}')
    if res.returncode != 0:
        return []
    return [l.strip() for l in res.stdout.splitlines() if l.strip()]


def ids_exist_external(table: str, ids: List[str]) -> List[str]:
    if not ids:
        return []
    quoted = ",".join("'" + i.replace("'", "''") + "'" for i in ids)
    sql = f'select id::text from public."{table}" where id::text in ({quoted})'
    res = external_psql(sql)
    found = {l.strip() for l in res.stdout.splitlines() if l.strip()}
    return [i for i in ids if i not in found]


def rls_status():
    sql = """
    select c.relname, c.relrowsecurity,
      (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=c.relname)
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r'
    order by c.relname
    """
    rows = []
    for line in external_psql(sql).stdout.splitlines():
        parts = line.split("\t")
        if len(parts) >= 3:
            rows.append({
                "table": parts[0],
                "rls_enabled": parts[1] == "t",
                "policy_count": int(parts[2] or 0),
            })
    return rows


def broken_fk_check():
    """Find FK constraints whose referenced rows are missing."""
    sql = """
    select conrelid::regclass::text as child,
           a.attname as child_col,
           confrelid::regclass::text as parent,
           af.attname as parent_col,
           conname
    from pg_constraint c
    join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
    join pg_attribute af on af.attrelid=c.confrelid and af.attnum=any(c.confkey)
    where c.contype='f' and c.connamespace='public'::regnamespace
    order by 1,5
    """
    broken = []
    for line in external_psql(sql).stdout.splitlines():
        parts = line.split("\t")
        if len(parts) < 5:
            continue
        child, child_col, parent, parent_col, conname = parts
        if parent.startswith("auth."):
            continue
        q = f"""
        select count(*) from {child} c
        where c.{child_col} is not null
          and not exists (select 1 from {parent} p where p.{parent_col} = c.{child_col})
        """
        res = external_psql(q)
        try:
            n = int(res.stdout.strip() or 0)
        except ValueError:
            n = -1
        if n > 0 or n < 0:
            broken.append({
                "constraint": conname,
                "child": child, "child_col": child_col,
                "parent": parent, "parent_col": parent_col,
                "orphans": n,
            })
    return broken


def auth_bootstrap_triggers():
    sql = """
    select tgname from pg_trigger
    where tgrelid='auth.users'::regclass and not tgisinternal
    order by tgname
    """
    res = external_psql(sql)
    names = [l.strip() for l in res.stdout.splitlines() if l.strip()]
    return {
        "triggers": names,
        "profile_role_ok": "on_auth_user_created" in names,
        "wallet_ok": "on_auth_user_created_wallet" in names,
    }


def public_auth_fk_remaining():
    sql = """
    select conrelid::regclass::text, conname
    from pg_constraint
    where contype='f' and connamespace='public'::regnamespace
      and confrelid='auth.users'::regclass
    """
    rows = []
    for line in external_psql(sql).stdout.splitlines():
        parts = line.split("\t")
        if len(parts) == 2:
            rows.append({"table": parts[0], "constraint": parts[1]})
    return rows


def storage_buckets():
    src = parse_csv(source_psql(
        "COPY (select id from storage.buckets order by id) TO STDOUT WITH CSV"
    ).stdout)
    ext = parse_csv(external_psql(
        "COPY (select id from storage.buckets order by id) TO STDOUT WITH CSV"
    ).stdout)
    src_ids = {r[0] for r in src if r}
    ext_ids = {r[0] for r in ext if r}
    return {
        "source": sorted(src_ids),
        "external": sorted(ext_ids),
        "missing_in_external": sorted(src_ids - ext_ids),
    }


def main():
    os.makedirs(ROOT, exist_ok=True)
    errors: List[str] = []
    warnings: List[str] = []

    src_counts = public_row_counts(source_psql)
    ext_counts = public_row_counts(external_psql)

    count_diffs = []
    for table, src_n in src_counts.items():
        ext_n = ext_counts.get(table)
        if ext_n is None:
            errors.append(f"missing_table_in_external:{table}")
            count_diffs.append({"table": table, "source": src_n, "external": None})
            continue
        if ext_n != src_n:
            count_diffs.append({"table": table, "source": src_n, "external": ext_n, "diff": ext_n - src_n})
            if ext_n < src_n:
                errors.append(f"row_count_short:{table}:{src_n - ext_n}")

    # Sample UUID parity for tables with id column
    tables = list_public_tables(source_psql)
    id_mismatches = []
    for t in tables:
        if src_counts.get(t, 0) == 0:
            continue
        ids = sample_ids(source_psql, t, SAMPLE_SIZE)
        missing = ids_exist_external(t, ids)
        if missing:
            id_mismatches.append({"table": t, "missing_ids": missing})
            errors.append(f"missing_ids:{t}:{len(missing)}")

    rls = rls_status()
    rls_disabled = [r for r in rls if not r["rls_enabled"]]
    rls_no_policies = [r for r in rls if r["rls_enabled"] and r["policy_count"] == 0]
    for r in rls_disabled:
        warnings.append(f"rls_disabled:{r['table']}")
    for r in rls_no_policies:
        warnings.append(f"rls_no_policies:{r['table']}")

    fk_broken = broken_fk_check()
    for f in fk_broken:
        errors.append(f"fk_broken:{f['constraint']}:{f['orphans']}")

    auth_fk = public_auth_fk_remaining()
    for f in auth_fk:
        warnings.append(f"public_auth_fk_remaining:{f['constraint']}")

    triggers = auth_bootstrap_triggers()
    if not triggers["profile_role_ok"]:
        errors.append("missing_trigger:on_auth_user_created")
    if not triggers["wallet_ok"]:
        errors.append("missing_trigger:on_auth_user_created_wallet")

    buckets = storage_buckets()
    for b in buckets["missing_in_external"]:
        warnings.append(f"missing_bucket:{b}")

    report = {
        "summary": {
            "tables_source": len(src_counts),
            "tables_external": len(ext_counts),
            "row_count_diffs": len(count_diffs),
            "id_mismatches": len(id_mismatches),
            "rls_disabled": len(rls_disabled),
            "rls_no_policies": len(rls_no_policies),
            "fk_broken": len(fk_broken),
            "public_auth_fks_remaining": len(auth_fk),
            "auth_bootstrap_ok": triggers["profile_role_ok"] and triggers["wallet_ok"],
            "buckets_missing": len(buckets["missing_in_external"]),
            "errors": len(errors),
            "warnings": len(warnings),
        },
        "row_count_diffs": count_diffs,
        "id_mismatches": id_mismatches,
        "rls": {
            "disabled": rls_disabled,
            "enabled_without_policies": rls_no_policies,
        },
        "broken_foreign_keys": fk_broken,
        "remaining_public_auth_foreign_keys": auth_fk,
        "auth_bootstrap_triggers": triggers,
        "storage_buckets": buckets,
        "errors": errors,
        "warnings": warnings,
    }

    with open(REPORT_PATH, "w", encoding="utf-8") as h:
        json.dump(report, h, ensure_ascii=False, indent=2)

    print(REPORT_PATH)
    print(json.dumps(report["summary"], ensure_ascii=False))

    if errors:
        sys.exit(2)


if __name__ == "__main__":
    main()
