# External Supabase Sync — Runtime (no GitHub Actions)

The GitHub Actions workflow `sync-external-schema.yml` has been removed.
All synchronization is now handled at runtime by the edge function
`supabase/functions/external-sync`.

## How it works

`external-sync` runs inside Lovable Cloud and:

1. Reads tables from this project using `SUPABASE_SERVICE_ROLE_KEY` (already set).
2. Upserts them into the external project using `EXTERNAL_SUPABASE_SERVICE_ROLE_KEY`.
3. Mirrors `auth.users` via the Supabase Admin API on both sides.
4. Checks which edge functions are present on the external project.

It never depends on `SOURCE_SUPABASE_SERVICE_ROLE_KEY`. If any external
secret is missing, the function returns `status: "skipped"` with a 200
response so the app continues to work.

## Invoke

- Full sync: `POST /functions/v1/external-sync`
- Only auth users: `?only=auth`
- Only tables: `?only=tables`
- Only function presence check: `?only=functions`

## Required secrets

Already configured in this project:
- `EXTERNAL_SUPABASE_URL`
- `EXTERNAL_SUPABASE_SERVICE_ROLE_KEY`
- `EXTERNAL_SUPABASE_PROJECT_REF` (optional — inferred from URL)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (auto-injected)

Optional:
- `SUPABASE_ACCESS_TOKEN` — only needed if you want the function-presence check.

## Notes

- Schema migrations are still managed via Lovable's normal migration tool,
  which writes to this project's database. To replicate the schema to the
  external project, run the existing `scripts/apply_external_schema.sh`
  once (it uses `EXTERNAL_SUPABASE_DB_URL`). After that, `external-sync`
  keeps data + auth in step automatically.
- The function is idempotent — call it as often as you want.
