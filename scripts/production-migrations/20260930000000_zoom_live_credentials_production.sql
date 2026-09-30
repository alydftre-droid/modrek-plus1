-- Server-only Zoom credentials for live sessions. This table previously only
-- existed on the preview backend; production never received it, so every
-- teacher start failed with credential_store_failed. Fully idempotent.
CREATE TABLE IF NOT EXISTS public.zoom_live_credentials (
  live_session_id uuid NOT NULL,
  meeting_password text,
  zoom_host_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.zoom_live_credentials'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE public.zoom_live_credentials
      ADD CONSTRAINT zoom_live_credentials_pkey PRIMARY KEY (live_session_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.zoom_live_credentials'::regclass
      AND conname = 'zoom_live_credentials_live_session_id_fkey'
  ) THEN
    ALTER TABLE public.zoom_live_credentials
      ADD CONSTRAINT zoom_live_credentials_live_session_id_fkey
      FOREIGN KEY (live_session_id) REFERENCES public.live_sessions(id) ON DELETE CASCADE;
  END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.zoom_live_credentials TO service_role;
REVOKE ALL ON public.zoom_live_credentials FROM anon, authenticated;
ALTER TABLE public.zoom_live_credentials ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.zoom_live_credentials IS 'Server-only Zoom credentials. No anon/authenticated grants or policies by design.';
NOTIFY pgrst, 'reload schema';
