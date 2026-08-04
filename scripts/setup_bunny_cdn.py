#!/usr/bin/env python3
"""
Discover or create a Bunny.net Pull Zone linked to the configured Storage Zone,
enable Token Authentication, reset the security key, and print the values that
must be stored as project secrets.

Required env vars:
  BUNNY_API_KEY           Account API key from dash.bunny.net → Account → API
  BUNNY_STORAGE_ZONE      Name of the existing storage zone (e.g. "modrek")
"""
import json
import os
import secrets
import sys
import urllib.error
import urllib.request


def env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        print(f"Missing environment variable: {name}", file=sys.stderr)
        sys.exit(1)
    return value


BUNNY_API_KEY = env("BUNNY_API_KEY")
BUNNY_STORAGE_ZONE = env("BUNNY_STORAGE_ZONE")
BUNNY_BASE = "https://api.bunny.net"


def bunny_request(path: str, method: str = "GET", body: dict | None = None):
    url = f"{BUNNY_BASE}{path}"
    data = json.dumps(body).encode("utf-8") if body else None
    req = urllib.request.Request(
        url,
        method=method,
        data=data,
        headers={
            "AccessKey": BUNNY_API_KEY,
            "Accept": "application/json",
            "Content-Type": "application/json" if body else "",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            payload = resp.read()
            if not payload:
                return None
            return json.loads(payload.decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"Bunny API {method} {path} failed [{exc.code}]: {detail}") from exc


def find_storage_zone():
    """Return the storage zone record matching BUNNY_STORAGE_ZONE."""
    zones = bunny_request("/storagezone")
    if not isinstance(zones, list):
        raise RuntimeError(f"Unexpected storage zone response: {zones}")
    for zone in zones:
        if zone.get("Name") == BUNNY_STORAGE_ZONE:
            return zone
    raise RuntimeError(
        f"Storage zone '{BUNNY_STORAGE_ZONE}' not found. "
        "Check BUNNY_STORAGE_ZONE or create the zone first."
    )


def find_pull_zone(storage_zone_id: int):
    """Return the first pull zone linked to storage_zone_id, or None."""
    page = 1
    while True:
        data = bunny_request(f"/pullzone?page={page}&perPage=1000")
        items = data.get("Items", [])
        for pz in items:
            if pz.get("StorageZoneId") == storage_zone_id:
                return pz
        if not data.get("HasMoreItems"):
            break
        page += 1
    return None


def create_pull_zone(storage_zone_id: int, name: str, origin_url: str):
    """Create a pull zone linked to the storage zone."""
    body = {
        "Name": name,
        "StorageZoneId": storage_zone_id,
        "OriginUrl": origin_url,
        "Type": 0,  # Standard pull zone
    }
    return bunny_request("/pullzone", method="POST", body=body)


def update_pull_zone(pull_zone_id: int, body: dict):
    return bunny_request(f"/pullzone/{pull_zone_id}", method="POST", body=body)


def reset_security_key(pull_zone_id: int, custom_key: str):
    """Reset the token authentication key to a known random value."""
    return bunny_request(
        f"/pullzone/{pull_zone_id}/resetSecurityKey",
        method="POST",
        body={"SecurityKey": custom_key},
    )


def main():
    print(f"==> Looking up storage zone: {BUNNY_STORAGE_ZONE}")
    storage_zone = find_storage_zone()
    storage_zone_id = storage_zone["Id"]
    storage_origin = storage_zone.get("StorageHostname") or storage_zone.get("ReadOnlyHostnames", [None])[0]
    print(f"    Found storage zone id={storage_zone_id}, origin={storage_origin}")

    print("==> Looking for linked pull zone")
    pull_zone = find_pull_zone(storage_zone_id)

    if not pull_zone:
        print("    No linked pull zone found. Creating one...")
        safe_name = BUNNY_STORAGE_ZONE.lower().replace(" ", "-") + "-cdn"
        origin_url = f"https://{storage_origin}"
        pull_zone = create_pull_zone(storage_zone_id, safe_name, origin_url)
        print(f"    Created pull zone id={pull_zone['Id']}, name={pull_zone['Name']}")
    else:
        print(f"    Found pull zone id={pull_zone['Id']}, name={pull_zone['Name']}")

    pull_zone_id = pull_zone["Id"]
    hostname = ""
    hostnames = pull_zone.get("Hostnames", [])
    if hostnames:
        hostname = hostnames[0].get("Value", "")
    if not hostname:
        hostname = f"{pull_zone['Name']}.b-cdn.net"

    print("==> Enabling Token Authentication")
    update_pull_zone(pull_zone_id, {
        "ZoneSecurityEnabled": True,
        "ZoneSecurityIncludeHashRemoteIP": False,
    })

    print("==> Resetting Token Authentication key")
    new_key = secrets.token_urlsafe(32)
    reset_security_key(pull_zone_id, new_key)

    print("==> Verifying pull zone settings")
    updated = bunny_request(f"/pullzone/{pull_zone_id}")
    security_enabled = bool(updated.get("ZoneSecurityEnabled"))
    security_key = updated.get("ZoneSecurityKey") or new_key

    print("\n" + "=" * 60)
    print("SETUP COMPLETE")
    print("=" * 60)
    print(f"Pull Zone ID:        {pull_zone_id}")
    print(f"Pull Zone Name:        {updated.get('Name')}")
    print(f"CDN Hostname:          {hostname}")
    print(f"Token Auth Enabled:    {security_enabled}")
    print(f"Token Key (store as BUNNY_CDN_TOKEN_KEY):")
    print(f"  {security_key}")
    print("\nStore these secrets:")
    print(f"  BUNNY_STORAGE_CDN_HOSTNAME={hostname}")
    print(f"  BUNNY_CDN_TOKEN_KEY={security_key}")


if __name__ == "__main__":
    main()
