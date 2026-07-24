GRANT SELECT ON public.content TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content TO authenticated;
GRANT ALL ON public.content TO service_role;

NOTIFY pgrst, 'reload schema';