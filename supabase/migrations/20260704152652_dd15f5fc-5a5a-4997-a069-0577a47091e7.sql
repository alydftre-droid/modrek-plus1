GRANT SELECT ON public.subject_default_prices TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subject_default_prices TO authenticated;
GRANT ALL ON public.subject_default_prices TO service_role;

REVOKE ALL ON FUNCTION public.set_subject_default_price(text, text, text, text, text, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_default_price_to_existing_groups(text, text, text, text, text, text, numeric) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_subject_default_prices(text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_subject_default_price(text, text, text, text, text, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_default_price_to_existing_groups(text, text, text, text, text, text, numeric) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';