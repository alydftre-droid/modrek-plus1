DROP INDEX IF EXISTS public.subject_default_prices_unique;
CREATE UNIQUE INDEX subject_default_prices_unique
  ON public.subject_default_prices (education_type, stage, grade, section, category, subject_name)
  NULLS NOT DISTINCT;
NOTIFY pgrst, 'reload schema';