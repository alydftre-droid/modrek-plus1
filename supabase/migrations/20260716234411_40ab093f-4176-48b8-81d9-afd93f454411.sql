
-- Set immutable search_path on remaining user-defined functions to close linter warnings
ALTER FUNCTION public.bundled_packages_set_updated() SET search_path = public;
ALTER FUNCTION public.get_default_sub_subject_names(text, text, text, text, text) SET search_path = public;
