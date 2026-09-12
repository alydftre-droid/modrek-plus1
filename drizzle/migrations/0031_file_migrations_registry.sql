CREATE TABLE IF NOT EXISTS public.file_migrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_kind text NOT NULL,
  source_bucket text,
  source_path text,
  source_row_table text,
  source_row_id text,
  source_column text,
  original_value text,
  bunny_path text,
  bunny_url text,
  sha256 text,
  byte_size bigint,
  mime_type text,
  file_name text,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  owner_id uuid,
  platform_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  migrated_at timestamptz,
  CONSTRAINT file_migrations_status_check
    CHECK (status IN ('pending', 'uploading', 'verified', 'failed', 'migrated', 'skipped'))
);

CREATE UNIQUE INDEX IF NOT EXISTS file_migrations_storage_object_uidx
  ON public.file_migrations (source_bucket, source_path)
  WHERE source_bucket IS NOT NULL AND source_path IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS file_migrations_row_column_uidx
  ON public.file_migrations (source_row_table, source_row_id, source_column, sha256)
  WHERE source_row_table IS NOT NULL;

CREATE INDEX IF NOT EXISTS file_migrations_status_idx ON public.file_migrations (status, source_kind);

GRANT SELECT ON public.file_migrations TO authenticated;
GRANT ALL ON public.file_migrations TO service_role;

ALTER TABLE public.file_migrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read file migrations" ON public.file_migrations;
CREATE POLICY "admins read file migrations"
ON public.file_migrations
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));