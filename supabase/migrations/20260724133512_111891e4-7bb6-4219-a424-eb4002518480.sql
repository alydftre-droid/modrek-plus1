ALTER TABLE public.content
  ADD COLUMN IF NOT EXISTS target_section text;

COMMENT ON COLUMN public.content.target_section IS
  'Optional target division for teacher content: scientific, literary, or null for both.';

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';