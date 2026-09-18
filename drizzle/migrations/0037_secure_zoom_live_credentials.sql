CREATE TABLE public.zoom_live_credentials (
  live_session_id uuid PRIMARY KEY REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  meeting_password text,
  zoom_host_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.zoom_live_credentials TO service_role;

ALTER TABLE public.zoom_live_credentials ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.zoom_live_credentials IS 'Server-only Zoom credentials. Intentionally has no anon/authenticated grants or RLS policies.';