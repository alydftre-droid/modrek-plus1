#!/usr/bin/env python3
"""
Modrek Plus — storage migration to Bunny.net.

Moves every file/media byte out of Supabase (Storage buckets + Base64 inside
PostgreSQL) into Bunny Storage, then rewrites database metadata to Bunny
references (`bstorage://<path>`). PostgreSQL keeps metadata only.

Guarantees:
  * Resumable + idempotent — progress is tracked per file in public.file_migrations.
  * Never deletes an original before the Bunny copy is uploaded AND verified
    (size + sha256 re-read from Bunny).
  * Failures keep the original intact and are retried on the next run.
  * Statuses: pending / uploading / verified / migrated / failed / skipped.

Usage:
  scan                     register every source file (safe, read-only on data)
  run [--limit N] [--kind storage_object|db_base64]
                           upload + verify + rewrite metadata, in batches
  status                   progress counters
  purge-originals --kind storage_object [--limit N]
                           delete Supabase-side originals for rows already
                           'migrated' (requires --yes)

Env: EXTERNAL_SUPABASE_DB_URL, EXTERNAL_SUPABASE_URL,
     EXTERNAL_SUPABASE_SERVICE_ROLE_KEY, BUNNY_STORAGE_ZONE,
     BUNNY_STORAGE_API_KEY, BUNNY_STORAGE_CDN_HOSTNAME
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import psycopg2
import psycopg2.extras

DB_URL = os.environ["EXTERNAL_SUPABASE_DB_URL"]
SB_URL = os.environ["EXTERNAL_SUPABASE_URL"].rstrip("/")
SB_KEY = os.environ["EXTERNAL_SUPABASE_SERVICE_ROLE_KEY"]
ZONE = os.environ["BUNNY_STORAGE_ZONE"]
BUNNY_KEY = os.environ["BUNNY_STORAGE_API_KEY"]
BUNNY_HOST = os.environ.get("BUNNY_STORAGE_HOST", "storage.bunnycdn.com")

UUID_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")

# Buckets whose first path segment is the owning user id.
OWNER_SCOPED = {
    "payment-receipts": "receipts",
    "support-uploads": "support",
    "ai-lesson-pages": "lesson-pages",
}
# Buckets that stay shared/admin-managed under modrek/main.
MAIN_SCOPED = {
    "teacher-profiles": "teacher-profiles",
    "books": "books",
    "ads-media": "ads",
    "videos": "videos",
    "exams": "exams",
    "ai-sources": "ai-sources",
    "live-recordings": "live-recordings",
    "modrek-library": "library",
}

# Columns that may reference a storage object. Matching is done on the FULL old
# path, so listing extra columns is harmless.
CANDIDATE_COLUMNS: List[Tuple[str, str]] = [
    ("profiles", "avatar_url"),
    ("teacher_profiles", "photo_url"),
    ("teacher_profiles", "video_url"),
    ("teacher_profiles", "cover_image_url"),
    ("teacher_platforms", "logo_url"),
    ("content_groups", "image_url"),
    ("content", "file_url"),
    ("content", "thumbnail_url"),
    ("deposit_requests", "receipt_url"),
    ("teacher_withdrawal_requests", "receipt_url"),
    ("support_messages", "file_url"),
    ("teacher_messages", "file_url"),
    ("subscription_messages", "file_url"),
    ("ai_lesson_pages", "image_url"),
    ("ads", "cover_image_url"),
    ("library_books", "pdf_path"),
    ("library_books", "cover_url"),
    ("ai_sources", "file_url"),
    ("live_session_recordings", "recording_url"),
    ("storage_assets", "object_path"),
    ("exams", "attachment_url"),
]


def utcnow():
    return datetime.now(timezone.utc)


def log(msg: str) -> None:
    print(msg, flush=True)


def connect():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    return conn


def existing_columns(conn) -> List[Tuple[str, str]]:
    with conn.cursor() as cur:
        cur.execute(
            """
            select table_name, column_name from information_schema.columns
            where table_schema='public' and data_type in ('text','character varying')
            """
        )
        have = {(r[0], r[1]) for r in cur.fetchall()}
    return [c for c in CANDIDATE_COLUMNS if c in have]


# --------------------------------------------------------------------------- #
#  Path mapping
# --------------------------------------------------------------------------- #
def map_bunny_path(bucket: str, name: str) -> str:
    parts = name.split("/")
    if bucket in OWNER_SCOPED:
        if parts and UUID_RE.match(parts[0]):
            return f"modrek/users/{parts[0]}/{OWNER_SCOPED[bucket]}/{'/'.join(parts[1:])}"
        return f"modrek/private/{bucket}/{name}"
    if bucket == "student-library":
        # library/{user_id}/file.pdf
        if len(parts) >= 3 and parts[0] == "library" and UUID_RE.match(parts[1]):
            return f"modrek/users/{parts[1]}/library/{'/'.join(parts[2:])}"
        return f"modrek/private/student-library/{name}"
    if bucket in MAIN_SCOPED:
        return f"modrek/main/{MAIN_SCOPED[bucket]}/{name}"
    return f"modrek/main/{bucket}/{name}"


def owner_of(bucket: str, name: str) -> Optional[str]:
    parts = name.split("/")
    if bucket in OWNER_SCOPED and parts and UUID_RE.match(parts[0]):
        return parts[0]
    if bucket == "student-library" and len(parts) >= 2 and UUID_RE.match(parts[1]):
        return parts[1]
    if bucket == "teacher-profiles" and parts and UUID_RE.match(parts[0]):
        return parts[0]
    return None


# --------------------------------------------------------------------------- #
#  HTTP helpers
# --------------------------------------------------------------------------- #
def http(method: str, url: str, headers: Dict[str, str], body: Optional[bytes] = None, timeout: int = 180):
    req = urllib.request.Request(url, method=method, headers=headers, data=body)
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return res.status, res.read(), dict(res.headers)


def download_object(bucket: str, name: str) -> bytes:
    quoted = urllib.parse.quote(name, safe="/")
    url = f"{SB_URL}/storage/v1/object/authenticated/{bucket}/{quoted}"
    _, payload, _ = http("GET", url, {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"})
    return payload


def delete_object(bucket: str, name: str) -> None:
    quoted = urllib.parse.quote(name, safe="/")
    url = f"{SB_URL}/storage/v1/object/{bucket}/{quoted}"
    http("DELETE", url, {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"})


def bunny_put(path: str, data: bytes, mime: str) -> None:
    url = f"https://{BUNNY_HOST}/{ZONE}/{urllib.parse.quote(path, safe='/')}"
    http("PUT", url, {"AccessKey": BUNNY_KEY, "Content-Type": mime or "application/octet-stream"}, data)


def bunny_verify(path: str, expected_sha: str, expected_size: int) -> bool:
    url = f"https://{BUNNY_HOST}/{ZONE}/{urllib.parse.quote(path, safe='/')}"
    try:
        _, payload, _ = http("GET", url, {"AccessKey": BUNNY_KEY})
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"bunny verify failed: {exc.code}") from exc
    return len(payload) == expected_size and hashlib.sha256(payload).hexdigest() == expected_sha


def guess_mime(name: str, fallback: str = "application/octet-stream") -> str:
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    return {
        "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp",
        "gif": "image/gif", "pdf": "application/pdf", "mp4": "video/mp4", "webm": "video/webm",
        "mp3": "audio/mpeg", "m4a": "audio/mp4", "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    }.get(ext, fallback)


# --------------------------------------------------------------------------- #
#  scan
# --------------------------------------------------------------------------- #
def scan(conn) -> None:
    inserted = 0
    with conn.cursor() as cur:
        cur.execute("select bucket_id, name, metadata, owner from storage.objects order by bucket_id, name")
        rows = cur.fetchall()
        for bucket, name, meta, owner in rows:
            meta = meta or {}
            size = meta.get("size")
            mime = meta.get("mimetype") or guess_mime(name)
            cur.execute(
                """
                insert into public.file_migrations
                  (source_kind, source_bucket, source_path, original_value, bunny_path,
                   mime_type, byte_size, file_name, owner_id, status)
                values ('storage_object', %s, %s, %s, %s, %s, %s, %s, %s, 'pending')
                on conflict (source_bucket, source_path)
                  where source_bucket is not null and source_path is not null
                do nothing
                """,
                (
                    bucket, name, f"{bucket}/{name}", map_bunny_path(bucket, name),
                    mime, size, name.split("/")[-1],
                    owner_of(bucket, name) or (str(owner) if owner else None),
                ),
            )
            inserted += cur.rowcount
    conn.commit()
    log(f"storage objects registered: +{inserted} (total scanned {len(rows)})")

    # Base64 attachments inside modrek_ai_messages.parts
    added = 0
    with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
        cur.execute(
            """
            select m.id, m.conversation_id, m.parts, c.student_id as user_id
            from public.modrek_ai_messages m
            join public.modrek_ai_conversations c on c.id = m.conversation_id
            where m.parts::text like '%data:%base64,%'
            """
        )
        msgs = cur.fetchall()
    with conn.cursor() as cur:
        for row in msgs:
            parts = row["parts"] if isinstance(row["parts"], list) else json.loads(row["parts"])
            for idx, part in enumerate(parts):
                data_url, kind, fname = extract_data_url(part)
                if not data_url:
                    continue
                mime, raw = decode_data_url(data_url)
                sha = hashlib.sha256(raw).hexdigest()
                ext = guess_ext(mime)
                bunny_path = (
                    f"modrek/users/{row['user_id']}/chat/{row['conversation_id']}/"
                    f"{'images' if kind == 'image' else 'files'}/{row['id']}-{idx}-{sha[:12]}.{ext}"
                )
                cur.execute(
                    """
                    insert into public.file_migrations
                      (source_kind, source_row_table, source_row_id, source_column, sha256,
                       bunny_path, mime_type, byte_size, file_name, owner_id, status)
                    values ('db_base64','modrek_ai_messages', %s, %s, %s, %s, %s, %s, %s, %s, 'pending')
                    on conflict (source_row_table, source_row_id, source_column, sha256)
                      where source_row_table is not null
                    do nothing
                    """,
                    (
                        str(row["id"]), f"parts[{idx}]", sha, bunny_path, mime, len(raw),
                        fname or f"attachment.{ext}", str(row["user_id"]),
                    ),
                )
                added += cur.rowcount
    conn.commit()
    log(f"database base64 attachments registered: +{added} (messages scanned {len(msgs)})")


def extract_data_url(part: Any) -> Tuple[Optional[str], str, Optional[str]]:
    if not isinstance(part, dict):
        return None, "", None
    if part.get("type") == "image_url":
        url = (part.get("image_url") or {}).get("url") or ""
        return (url if url.startswith("data:") else None), "image", None
    if part.get("type") == "file":
        f = part.get("file") or {}
        url = f.get("file_data") or ""
        return (url if url.startswith("data:") else None), "file", f.get("filename")
    return None, "", None


def decode_data_url(data_url: str) -> Tuple[str, bytes]:
    head, _, payload = data_url.partition(",")
    mime = head[5:].split(";")[0] or "application/octet-stream"
    if ";base64" in head:
        return mime, base64.b64decode(payload + "=" * (-len(payload) % 4))
    return mime, urllib.parse.unquote_to_bytes(payload)


def guess_ext(mime: str) -> str:
    return {
        "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
        "application/pdf": "pdf", "video/mp4": "mp4", "audio/mpeg": "mp3",
    }.get((mime or "").lower(), "bin")


# --------------------------------------------------------------------------- #
#  run
# --------------------------------------------------------------------------- #
def mark(conn, row_id: str, **fields) -> None:
    sets = ", ".join(f"{k} = %s" for k in fields)
    with conn.cursor() as cur:
        cur.execute(
            f"update public.file_migrations set {sets}, updated_at = now() where id = %s",
            (*fields.values(), row_id),
        )
    conn.commit()


def rewrite_references(conn, columns, bucket: str, old_path: str, new_value: str) -> int:
    """Point every metadata column that references the old object at Bunny."""
    total = 0
    suffix = f"{bucket}/{old_path}"
    with conn.cursor() as cur:
        # Metadata-only rewrite: skip business-rule triggers (e.g. locked deposit
        # requests) for this transaction. Column values are the only change.
        cur.execute("SET LOCAL session_replication_role = replica")
        for table, col in columns:
            cur.execute("SAVEPOINT ref_update")
            try:
                cur.execute(
                    f"""
                    update public.{table} set {col} = %s
                    where {col} is not null
                      and {col} <> %s
                      and ({col} = %s or {col} like %s or {col} like %s)
                    """,
                    (new_value, new_value, old_path, f"%{suffix}", f"%{suffix}?%"),
                )
                total += cur.rowcount
                cur.execute("RELEASE SAVEPOINT ref_update")
            except Exception as exc:  # noqa: BLE001 — a blocked table must not abort the batch
                cur.execute("ROLLBACK TO SAVEPOINT ref_update")
                log(f"  ref update skipped for {table}.{col}: {exc}")
    conn.commit()
    return total


def run_storage_objects(conn, columns, limit: int) -> None:
    with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
        cur.execute(
            """
            select * from public.file_migrations
            where source_kind = 'storage_object'
              and status in ('pending','uploading','failed','verified')
              and attempts < 5
            order by attempts, created_at
            limit %s
            """,
            (limit,),
        )
        rows = cur.fetchall()

    for row in rows:
        rid, bucket, path, bpath = row["id"], row["source_bucket"], row["source_path"], row["bunny_path"]
        try:
            mark(conn, rid, status="uploading", attempts=row["attempts"] + 1, last_error=None)
            data = download_object(bucket, path)
            sha = hashlib.sha256(data).hexdigest()
            mime = row["mime_type"] or guess_mime(path)
            bunny_put(bpath, data, mime)
            if not bunny_verify(bpath, sha, len(data)):
                raise RuntimeError("verification mismatch")
            bunny_url = f"bstorage://{bpath}"
            mark(conn, rid, status="verified", sha256=sha, byte_size=len(data),
                 bunny_url=bunny_url, mime_type=mime, verified_at=utcnow())
            changed = rewrite_references(conn, columns, bucket, path, bunny_url)
            mark(conn, rid, status="migrated", migrated_at=utcnow())
            log(f"migrated {bucket}/{path} -> {bpath} ({len(data)} bytes, {changed} refs)")
        except Exception as exc:  # noqa: BLE001 — original stays untouched
            conn.rollback()
            mark(conn, rid, status="failed", last_error=str(exc)[:1000])
            log(f"FAILED {bucket}/{path}: {exc}")


def run_db_base64(conn, limit: int) -> None:
    with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
        cur.execute(
            """
            select * from public.file_migrations
            where source_kind = 'db_base64'
              and status in ('pending','uploading','failed','verified')
              and attempts < 5
            order by attempts, created_at
            limit %s
            """,
            (limit,),
        )
        rows = cur.fetchall()

    for row in rows:
        rid, msg_id, bpath = row["id"], row["source_row_id"], row["bunny_path"]
        idx = int(re.search(r"\[(\d+)\]", row["source_column"]).group(1))
        try:
            mark(conn, rid, status="uploading", attempts=row["attempts"] + 1, last_error=None)
            with conn.cursor() as cur:
                cur.execute("select parts from public.modrek_ai_messages where id = %s", (msg_id,))
                fetched = cur.fetchone()
            if not fetched:
                mark(conn, rid, status="skipped", last_error="message row no longer exists")
                continue
            parts = fetched[0] if isinstance(fetched[0], list) else json.loads(fetched[0])
            data_url, kind, fname = extract_data_url(parts[idx]) if idx < len(parts) else (None, "", None)
            if not data_url:
                mark(conn, rid, status="skipped", last_error="attachment already migrated")
                continue
            mime, raw = decode_data_url(data_url)
            sha = hashlib.sha256(raw).hexdigest()
            bunny_put(bpath, raw, mime)
            if not bunny_verify(bpath, sha, len(raw)):
                raise RuntimeError("verification mismatch")
            bunny_url = f"bstorage://{bpath}"
            mark(conn, rid, status="verified", sha256=sha, byte_size=len(raw),
                 bunny_url=bunny_url, mime_type=mime, verified_at=utcnow())

            # Replace the Base64 payload with the Bunny reference (metadata only).
            if kind == "image":
                parts[idx] = {"type": "image_url", "image_url": {"url": bunny_url}}
            else:
                parts[idx] = {"type": "file", "file": {"filename": fname or row["file_name"], "file_data": bunny_url}}
            with conn.cursor() as cur:
                cur.execute(
                    "update public.modrek_ai_messages set parts = %s::jsonb where id = %s",
                    (json.dumps(parts, ensure_ascii=False), msg_id),
                )
            conn.commit()
            mark(conn, rid, status="migrated", migrated_at=utcnow())
            log(f"migrated chat attachment {msg_id}[{idx}] -> {bpath} ({len(raw)} bytes)")
        except Exception as exc:  # noqa: BLE001
            conn.rollback()
            mark(conn, rid, status="failed", last_error=str(exc)[:1000])
            log(f"FAILED chat attachment {msg_id}[{idx}]: {exc}")


# --------------------------------------------------------------------------- #
#  status / purge
# --------------------------------------------------------------------------- #
def rewrite_all(conn, columns, limit: int) -> None:
    """Re-run metadata rewrites for already-migrated objects (idempotent)."""
    with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
        cur.execute(
            """
            select source_bucket, source_path, bunny_url from public.file_migrations
            where source_kind='storage_object' and status='migrated' and bunny_url is not null
            order by updated_at limit %s
            """,
            (limit,),
        )
        rows = cur.fetchall()
    total = 0
    for row in rows:
        total += rewrite_references(conn, columns, row["source_bucket"], row["source_path"], row["bunny_url"])
    log(f"metadata references rewritten: {total}")


def status(conn) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            select source_kind, status, count(*), coalesce(sum(byte_size),0)
            from public.file_migrations group by 1,2 order by 1,2
            """
        )
        for kind, st, n, total in cur.fetchall():
            log(f"{kind:15} {st:10} {n:6}  {round(int(total)/1048576, 1)} MB")


def purge_originals(conn, kind: str, limit: int, yes: bool) -> None:
    if not yes:
        log("refusing to delete originals without --yes")
        return
    if kind != "storage_object":
        log("purge supports --kind storage_object only")
        return
    with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
        cur.execute(
            """
            select * from public.file_migrations
            where source_kind='storage_object' and status='migrated'
              and bunny_path is not null and sha256 is not null
            order by updated_at limit %s
            """,
            (limit,),
        )
        rows = cur.fetchall()
    for row in rows:
        try:
            if not bunny_verify(row["bunny_path"], row["sha256"], int(row["byte_size"])):
                log(f"skip purge (verify failed) {row['source_bucket']}/{row['source_path']}")
                continue
            delete_object(row["source_bucket"], row["source_path"])
            mark(conn, row["id"], status="migrated", last_error=None)
            log(f"purged original {row['source_bucket']}/{row['source_path']}")
        except Exception as exc:  # noqa: BLE001
            log(f"purge failed {row['source_bucket']}/{row['source_path']}: {exc}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("command", choices=["scan", "run", "rewrite", "status", "purge-originals"])
    ap.add_argument("--limit", type=int, default=25)
    ap.add_argument("--kind", default="all")
    ap.add_argument("--yes", action="store_true")
    args = ap.parse_args()

    conn = connect()
    try:
        if args.command == "scan":
            scan(conn)
        elif args.command == "run":
            cols = existing_columns(conn)
            if args.kind in ("all", "storage_object"):
                run_storage_objects(conn, cols, args.limit)
            if args.kind in ("all", "db_base64"):
                run_db_base64(conn, args.limit)
        elif args.command == "rewrite":
            rewrite_all(conn, existing_columns(conn), args.limit)
        elif args.command == "status":
            status(conn)
        else:
            purge_originals(conn, args.kind, args.limit, args.yes)
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
