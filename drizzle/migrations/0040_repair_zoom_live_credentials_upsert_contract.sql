DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.zoom_live_credentials'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE public.zoom_live_credentials
      ADD CONSTRAINT zoom_live_credentials_pkey PRIMARY KEY (live_session_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.zoom_live_credentials'::regclass
      AND contype = 'f'
      AND conname = 'zoom_live_credentials_live_session_id_fkey'
  ) THEN
    ALTER TABLE public.zoom_live_credentials
      ADD CONSTRAINT zoom_live_credentials_live_session_id_fkey
      FOREIGN KEY (live_session_id)
      REFERENCES public.live_sessions(id)
      ON DELETE CASCADE;
  END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.zoom_live_credentials TO service_role;
REVOKE ALL ON public.zoom_live_credentials FROM anon, authenticated;
ALTER TABLE public.zoom_live_credentials ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';