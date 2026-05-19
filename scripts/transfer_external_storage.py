#!/usr/bin/env python3
import csv
import io
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
import subprocess
from typing import Dict, List, Optional

ROOT = "/mnt/documents/modrek_transfer"
REPORT_PATH = os.path.join(ROOT, "external_storage_transfer_report.json")


def env(name: str, required: bool = True) -> Optional[str]:
    value = os.environ.get(name)
    if required and not value:
        raise RuntimeError(f"Missing environment variable: {name}")
    return value


SOURCE_URL = env("SUPABASE_URL") or "https://qohhrliaecdtaeyfhcvb.supabase.co"
SOURCE_SERVICE_ROLE = env("SUPABASE_SERVICE_ROLE_KEY")
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


def run(cmd: List[str], check: bool = True):
    result = subprocess.run(cmd, text=True, capture_output=True, check=False)
    if check and result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "command failed")
    return result


def source_psql(sql: str):
    return run(["psql", "-v", "ON_ERROR_STOP=1", "-At", "-F", "\t", "-c", sql])


def storage_request(base_url: str, service_key: str, method: str, path: str, body: bytes = None, headers: Dict[str, str] = None):
    req_headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
    }
    if headers:
        req_headers.update(headers)
    request = urllib.request.Request(
        f"{base_url}{path}",
        method=method,
        headers=req_headers,
        data=body,
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            payload = response.read()
            content_type = response.headers.get("Content-Type", "")
            if "application/json" in content_type and payload:
                return json.loads(payload.decode("utf-8"))
            return payload
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(detail or str(exc)) from exc


def read_source_buckets():
    sql = "COPY (select id, name, public from storage.buckets order by name) TO STDOUT WITH CSV"
    reader = csv.reader(io.StringIO(source_psql(sql).stdout))
    buckets = []
    for row in reader:
        buckets.append({"id": row[0], "name": row[1], "public": row[2].lower() == "t"})
    return buckets


def read_source_objects():
    sql = "COPY (select bucket_id, name from storage.objects order by bucket_id, name) TO STDOUT WITH CSV"
    reader = csv.reader(io.StringIO(source_psql(sql).stdout))
    objects = []
    for row in reader:
        objects.append({"bucket_id": row[0], "name": row[1]})
    return objects


def list_external_buckets():
    data = storage_request(EXTERNAL_URL, EXTERNAL_SERVICE_ROLE, "GET", "/storage/v1/bucket")
    result = {}
    for bucket in data or []:
        bucket_id = bucket.get("id") or bucket.get("name")
        if bucket_id:
            result[bucket_id] = bucket
    return result


def ensure_bucket(bucket, existing):
    if bucket["id"] in existing:
        return "existing"
    payload = json.dumps({
        "id": bucket["id"],
        "name": bucket["name"],
        "public": bucket["public"],
    }).encode("utf-8")
    storage_request(
        EXTERNAL_URL,
        EXTERNAL_SERVICE_ROLE,
        "POST",
        "/storage/v1/bucket",
        body=payload,
        headers={"Content-Type": "application/json"},
    )
    return "created"


def download_source_object(bucket_id: str, object_name: str) -> bytes:
    quoted = urllib.parse.quote(object_name, safe="/")
    return storage_request(
        SOURCE_URL,
        SOURCE_SERVICE_ROLE,
        "GET",
        f"/storage/v1/object/authenticated/{bucket_id}/{quoted}",
    )


def upload_external_object(bucket_id: str, object_name: str, data: bytes):
    quoted = urllib.parse.quote(object_name, safe="/")
    storage_request(
        EXTERNAL_URL,
        EXTERNAL_SERVICE_ROLE,
        "POST",
        f"/storage/v1/object/{bucket_id}/{quoted}",
        body=data,
        headers={
            "Content-Type": "application/octet-stream",
            "x-upsert": "true",
        },
    )


def main():
    os.makedirs(ROOT, exist_ok=True)
    buckets = read_source_buckets()
    objects = read_source_objects()
    external_buckets = list_external_buckets()

    bucket_results = []
    for bucket in buckets:
        status = ensure_bucket(bucket, external_buckets)
        bucket_results.append({**bucket, "status": status})

    copied = []
    failed = []
    for obj in objects:
        try:
            data = download_source_object(obj["bucket_id"], obj["name"])
            upload_external_object(obj["bucket_id"], obj["name"], data)
            copied.append(obj)
        except Exception as exc:
            failed.append({**obj, "error": str(exc)})

    summary = {
        "source_url": SOURCE_URL,
        "external_url": EXTERNAL_URL,
        "bucket_results": bucket_results,
        "copied_count": len(copied),
        "failed_count": len(failed),
        "failed_objects": failed,
    }
    with open(REPORT_PATH, "w", encoding="utf-8") as handle:
        json.dump(summary, handle, ensure_ascii=False, indent=2)

    print(REPORT_PATH)
    print(json.dumps({"buckets": len(bucket_results), "copied": len(copied), "failed": len(failed)}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        raise
