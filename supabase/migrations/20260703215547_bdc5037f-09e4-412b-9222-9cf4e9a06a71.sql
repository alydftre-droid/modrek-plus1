GRANT SELECT ON public.subject_default_prices TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subject_default_prices TO authenticated;
GRANT ALL ON public.subject_default_prices TO service_role;
NOTIFY pgrst, 'reload schema';