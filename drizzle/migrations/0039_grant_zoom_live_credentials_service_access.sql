GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.zoom_live_credentials TO service_role;
REVOKE ALL ON TABLE public.zoom_live_credentials FROM anon, authenticated;